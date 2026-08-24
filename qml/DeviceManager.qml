import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "AdbParser.js" as AdbParser
import "BoundedOutput.js" as BoundedOutput

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

    property var _stdoutCapture: null
    property var _stderrCapture: null

    // Run-coordination state. A discovery result is only finalized once the
    // process has exited and both streams have been drained through the bounded
    // SplitParsers.
    property bool _runProcessComplete: false
    property bool _runFinalized: false
    property bool _runExcessive: false
    property int _runExitCode: 0

    signal refreshCompleted(bool success)

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
        // Do not reparse while a discovery run is in flight; the in-flight
        // refresh will use the current context when it finalizes.
        if (root.busy) return
        if (!root._stdoutText) return
        root.devices = AdbParser.parseDevices(root._stdoutText, root._buildWirelessContext())
    }

    function refresh() {
        if (root.busy) return

        root.busy = true
        root.error = ""
        // Preserve the previous device list during the query; the UI uses
        // `busy` to show the loading state. The list is atomically replaced
        // when the current run finalizes.
        root._stdoutText = ""
        root._stderrText = ""
        root._runProcessComplete = false
        root._runFinalized = false
        root._runExcessive = false
        root._stdoutCapture = BoundedOutput.create()
        root._stderrCapture = BoundedOutput.create()

        // A normal tracked Process is used with `running = true`; busy gating
        // above prevents overlapping discovery runs rather than interrupting
        // an active query.
        adbProc.command = ["adb", "devices", "-l"]
        adbProc.running = true
    }

    function stateText(device) {
        return AdbParser.stateText(device.rawState, device.connection)
    }

    function _attemptFinalize() {
        if (root._runFinalized) return
        if (!root._runProcessComplete) return

        root._runFinalized = true
        root.busy = false

        if (root._runExcessive
            || BoundedOutput.isOverflow(root._stdoutCapture)
            || BoundedOutput.isOverflow(root._stderrCapture)) {
            console.warn("adb devices -l produced excessive output")
            root.error = "ADB returned an unexpectedly large response."
            root._stdoutText = ""
            root.devices = []
            root.refreshCompleted(false)
            return
        }

        if (root._runExitCode !== 0) {
            var err = String(BoundedOutput.value(root._stderrCapture) || "").trim()
            if (err) console.warn("adb devices -l failed:", root._runExitCode, err)
            root.error = "ADB discovery failed."
            root.devices = []
            root.refreshCompleted(false)
            return
        }

        var out = String(BoundedOutput.value(root._stdoutCapture) || "")
        root._stdoutText = out
        root.devices = AdbParser.parseDevices(out, root._buildWirelessContext())
        root.refreshCompleted(true)
    }

    Process {
        id: adbProc

        command: ["adb", "devices", "-l"]

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._stdoutCapture, data)) return;
                if (BoundedOutput.isOverflow(root._stdoutCapture)) {
                    root._runExcessive = true;
                    if (adbProc.running) adbProc.running = false;
                }
            }
        }

        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._stderrCapture, data)) return;
                if (BoundedOutput.isOverflow(root._stderrCapture)) {
                    root._runExcessive = true;
                    if (adbProc.running) adbProc.running = false;
                }
            }
        }

        onExited: function(exitCode, exitStatus) {
            root._runExitCode = exitCode
            root._runProcessComplete = true
            root._attemptFinalize()
        }

        onRunningChanged: {
            // If the process stopped without the normal exited/stdout path
            // finalizing the run (e.g. FailedToStart), make sure busy is not
            // left stuck and report a failure.
            if (!running && !root._runFinalized && !root._runProcessComplete) {
                root._runFinalized = true
                root.busy = false
                root.error = "ADB discovery failed."
                root.devices = []
                root.refreshCompleted(false)
            }
        }
    }
}
