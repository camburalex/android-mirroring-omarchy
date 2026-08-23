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

    property alias recordingActive: recordingManager.active
    property alias activeRecordingPath: recordingManager.activePath
    property alias lastRecordingPath: recordingManager.lastPath

    property string _diagBuffer: ""
    property bool _stopIntended: false
    property var _sessionOptions: null

    signal sessionStarted()
    signal sessionEnded(bool expected, int exitCode)

    RecordingManager {
        id: recordingManager
        onPrepared: function(path, directory) { root._onRecordingPrepared(path, directory) }
        onFailed: function(reason) { root._onRecordingFailed(reason) }
    }

    function startMirroring(serial, options) {
        if (root.running || root.starting || root.stopping) {
            console.warn("ScrcpyBackend: ignoring start while a session is active");
            return;
        }

        if (!ScrcpyCommand.isValidSerial(serial)) {
            root.errorMessage = "Invalid device serial.";
            return;
        }

        var sessionOptions;
        try {
            sessionOptions = ScrcpyCommand.normalizeOptions(options);
        } catch (err) {
            root.errorMessage = err.message || "Invalid launch options.";
            return;
        }

        root.errorMessage = "";
        root._diagBuffer = "";
        root._stopIntended = false;
        root.activeSerial = serial;
        root._sessionOptions = sessionOptions;
        root.starting = true;
        root.stopping = false;

        if (sessionOptions.recordingEnabled) {
            recordingManager.prepare();
        } else {
            root._launchScrcpy(sessionOptions, "");
        }
    }

    function _onRecordingPrepared(path, directory) {
        if (!root.starting || root.stopping) {
            recordingManager.cancel();
            return;
        }

        root._launchScrcpy(root._sessionOptions, path);
    }

    function _onRecordingFailed(reason) {
        if (!root.starting || root.stopping) return;
        root._failStart(reason);
    }

    function _launchScrcpy(sessionOptions, recordingPath) {
        var cmd;
        try {
            cmd = ScrcpyCommand.buildCommand(root.activeSerial, sessionOptions, recordingPath);
        } catch (err) {
            root._failStart(err.message || "Could not build scrcpy command.");
            return;
        }

        if (recordingPath) {
            recordingManager.markActive(recordingPath);
        }

        scrcpyProc.command = cmd.argv;
        scrcpyProc.running = true;
    }

    function _failStart(reason) {
        recordingManager.cancel();

        root.starting = false;
        root.running = false;
        root.stopping = false;
        root._stopIntended = false;
        root._sessionOptions = null;
        root.activeSerial = "";
        root.errorMessage = reason;
    }

    function stopMirroring() {
        if (!root.running && !root.starting) return;
        if (root.stopping) return;

        root.stopping = true;
        root._stopIntended = true;

        if (recordingManager.busy) {
            recordingManager.cancel();
            root._resetIdle(true);
        } else if (scrcpyProc.running || root.running) {
            scrcpyProc.running = false;
        } else {
            root._resetIdle(true);
        }
    }

    function _resetIdle(userCancelled) {
        root.starting = false;
        root.running = false;
        root.stopping = false;
        root._stopIntended = false;
        root._sessionOptions = null;
        root.activeSerial = "";
        if (!userCancelled) root.errorMessage = "";
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
        if (recordingManager.active) recordingManager.releaseReserved();
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
        root._sessionOptions = null;

        if (root.activeSerial !== "") root.activeSerial = "";

        if (recordingManager.active) {
            // Preserve the recording when the session reached the running state
            // or was intentionally stopped. Discard it only if scrcpy failed
            // before it could start writing.
            if (wasRunning) {
                recordingManager.clearActive();
            } else {
                recordingManager.discardActive();
            }
        }

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
