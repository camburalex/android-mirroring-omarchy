import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "ScrcpyCommand.js" as ScrcpyCommand
import "ScrcpyState.js" as ScrcpyState

// Cold-start-safe owner for the tracked scrcpy Process. Scope is used because
// it exposes `children` as the default property, so nonvisual Quickshell
// objects like Process can be owned correctly when the bar widget loads.
Scope {
    id: root

    property string activeSerial: ""
    property bool starting: false
    property bool running: false
    property bool stopping: false
    property string errorMessage: ""
    readonly property string diagnostics: _diagBuffer

    property string _diagBuffer: ""
    property bool _stopIntended: false

    signal sessionStarted()
    signal sessionEnded(bool expected, int exitCode)

    function startMirroring(serial) {
        if (root.running || root.starting || root.stopping) {
            console.warn("ScrcpyBackend: ignoring start while a session is active");
            return;
        }

        if (!ScrcpyCommand.isValidSerial(serial)) {
            root.errorMessage = "Invalid device serial.";
            return;
        }

        var cmd = ScrcpyCommand.buildCommand(serial);

        root.errorMessage = "";
        root._diagBuffer = "";
        root._stopIntended = false;
        root.activeSerial = serial;
        root.starting = true;
        root.stopping = false;

        scrcpyProc.command = cmd.argv;
        scrcpyProc.running = true;
    }

    function stopMirroring() {
        if (!root.running && !root.starting) return;
        if (root.stopping) return;

        root.stopping = true;
        root._stopIntended = true;
        scrcpyProc.running = false;
    }

    function clearError() {
        root.errorMessage = "";
    }

    function _appendDiagnostic(line) {
        var text = String(line).replace(/\r\n?$/, "");
        if (text.length === 0) return;

        var current = root._diagBuffer;
        if (current.length > 0) current += "\n";
        current += text;

        // Bound by a small line count and a small byte count.
        var lines = current.split("\n");
        if (lines.length > 32) {
            current = lines.slice(lines.length - 32).join("\n");
        }
        if (current.length > 4096) {
            current = current.substring(current.length - 2048);
        }

        root._diagBuffer = current;
    }

    function _onStarted() {
        if (!root.starting) return;
        root.starting = false;
        root.running = true;
        root.stopping = false;
        root.errorMessage = "";
        root.sessionStarted();
    }

    function _onExited(exitCode, exitStatus) {
        var wasStarting = root.starting;
        var wasRunning = root.running;
        var wasStopping = root.stopping;

        root.starting = false;
        root.running = false;
        root.stopping = false;
        root._stopIntended = false;

        if (root.activeSerial !== "") root.activeSerial = "";

        root.errorMessage = ScrcpyState.classifyExit(
            wasStarting,
            wasRunning,
            wasStopping,
            exitCode,
            exitStatus
        );

        root.sessionEnded(wasStopping, exitCode);
    }

    Process {
        id: scrcpyProc
        running: false
        command: []

        // Drain stdout so the scrcpy pipe cannot block on startup messages.
        stdout: SplitParser { onRead: function(line) {} }

        stderr: SplitParser {
            splitMarker: "\n"
            onRead: function(line) { root._appendDiagnostic(line) }
        }

        onStarted: root._onStarted()
        onExited: function(exitCode, exitStatus) { root._onExited(exitCode, exitStatus) }
    }
}
