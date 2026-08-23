import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "AdbParser.js" as AdbParser

// Scope exposes `children` as its default property and is intended for
// nonvisual Quickshell objects. QtObject does not provide a default data
// property, so a direct `Process {}` child would fail on cold QML load.
Scope {
    id: root

    property var devices: []
    property bool busy: false
    property string error: ""

    // If set, a device whose serial exactly matches this endpoint and which
    // carries no USB metadata is reported as a wireless transport. This is set
    // from a successful WirelessManager connect and is not persisted.
    property string wirelessEndpoint: ""

    // Saved/transient wireless identities supplied from outside. The parser
    // treats each string as a known wireless serial/endpoint. A live non-USB
    // device is only reported as wireless when its serial is in this set.
    property var knownWirelessSerials: []

    property string _stdoutText: ""
    property string _stderrText: ""

    onWirelessEndpointChanged: root._reparseIfNeeded()
    onKnownWirelessSerialsChanged: root._reparseIfNeeded()

    function _buildWirelessContext() {
        var set = {}
        if (root.wirelessEndpoint) set[root.wirelessEndpoint] = true
        if (Array.isArray(root.knownWirelessSerials)) {
            for (var i = 0; i < root.knownWirelessSerials.length; i++) {
                var s = String(root.knownWirelessSerials[i] || "")
                if (s) set[s] = true
            }
        }
        var result = []
        for (var k in set) result.push(k)
        return result
    }

    function _reparseIfNeeded() {
        if (!root._stdoutText) return
        root.devices = AdbParser.parseDevices(root._stdoutText, root._buildWirelessContext())
    }

    function refresh() {
        if (root.busy) return

        root.busy = true
        root.error = ""
        root.devices = []
        root._stdoutText = ""
        root._stderrText = ""

        // A normal tracked Process is used with `running = true`; busy gating
        // above prevents overlapping discovery runs rather than interrupting
        // an active query.
        adbProc.command = ["adb", "devices", "-l"]
        adbProc.running = true
    }

    function stateText(device) {
        return AdbParser.stateText(device.rawState, device.connection)
    }

    Process {
        id: adbProc

        command: ["adb", "devices", "-l"]

        stdout: StdioCollector {
            id: adbStdout
            waitForEnd: true
            onStreamFinished: root._stdoutText = String(text || "")
        }

        stderr: StdioCollector {
            id: adbStderr
            waitForEnd: true
            onStreamFinished: root._stderrText = String(text || "")
        }

        onExited: function(exitCode, exitStatus) {
            root.busy = false

            if (exitCode !== 0) {
                var err = String(root._stderrText || adbStderr.text || "").trim()
                console.warn("adb devices -l failed:", exitCode, exitStatus, err)
                root.error = "ADB discovery failed."
                root.devices = []
                return
            }

            var out = String(root._stdoutText || adbStdout.text || "")
            root.devices = AdbParser.parseDevices(out, root._buildWirelessContext())
        }
    }
}
