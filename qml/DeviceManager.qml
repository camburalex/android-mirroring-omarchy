import QtQuick
import Quickshell.Io
import qs.Commons
import "AdbParser.js" as AdbParser

QtObject {
    id: root

    property var devices: []
    property bool busy: false
    property string error: ""

    property string _stdoutText: ""
    property string _stderrText: ""

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
            root.devices = AdbParser.parseDevices(out)
        }
    }
}
