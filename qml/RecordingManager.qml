import QtQuick
import Quickshell
import Quickshell.Io
import QtCore
import "RecordingPath.js" as RecordingPath
import "BoundedOutput.js" as BoundedOutput

// Asynchronous recording-path preparation for ScrcpyBackend.
// Resolves a standard user Videos/Movies location, creates the product
// subdirectory, and reserves a unique timestamped .mp4 file with mktemp.
// Does not block the shell; all coreutils work runs through tracked Quickshell
// Process objects with direct argv.
Scope {
    id: root

    property bool busy: false
    property bool active: false
    property string activePath: ""
    property string lastPath: ""
    property string error: ""

    property string _recordingDirectory: ""
    property string _reservedPath: ""
    property string _mktempOutput: ""
    property var _mktempCapture: null
    property bool _mktempExited: false
    property int _mktempExitCode: 0
    property int _mktempExitStatus: 0
    property bool _mkdirStarted: false
    property bool _mkdirExited: false

    signal prepared(string path, string directory)
    signal failed(string reason)

    function prepare() {
        root.cancel(); // Reset any stale state.
        root.busy = true;
        root.error = "";

        var baseDir = root._resolveBaseDirectory();
        if (!baseDir) {
            root._finishFailed("Could not determine the recording folder.");
            return;
        }

        var recordingDirectory = RecordingPath.buildRecordingDirectory(baseDir);
        if (!RecordingPath.isSafeRecordingDirectory(recordingDirectory)) {
            root._finishFailed("Could not determine the recording folder.");
            return;
        }

        root._recordingDirectory = recordingDirectory;

        var mkdirCmd = RecordingPath.buildMkdirCommand(recordingDirectory);
        mkdirProc.command = mkdirCmd.argv;
        root._mkdirStarted = true;
        root._mkdirExited = false;
        mkdirProc.running = true;
    }

    function markActive(path) {
        root.active = true;
        root.activePath = path;
        root.lastPath = path;
        root._reservedPath = path;
    }

    function releaseReserved() {
        root._reservedPath = "";
    }

    function clearActive() {
        root.active = false;
        root.activePath = "";
        root._reservedPath = "";
    }

    function discardActive() {
        if (root.activePath !== "") {
            root._remove(root.activePath);
        } else if (root._reservedPath !== "") {
            root._remove(root._reservedPath);
        }
        root.clearActive();
    }

    function cancel() {
        if (!root.busy) {
            root._doCleanupAndReset();
            return;
        }

        // If mktemp printed a path but the finalize path has not run yet,
        // remember it so the cleanup rm can remove the placeholder.
        if (root._reservedPath === "" && root._mktempOutput !== "") {
            if (RecordingPath.isValidRecordingPath(root._mktempOutput, root._recordingDirectory)) {
                root._reservedPath = root._mktempOutput;
            }
        }

        root.busy = false;
        mkdirProc.running = false;
        mktempProc.running = false;
        root._doCleanupAndReset();
    }

    function _doCleanupAndReset() {
        if (root._reservedPath !== "") {
            root._remove(root._reservedPath);
        }
        root._reset();
    }

    function _remove(path) {
        if (!path) return;
        var cmd = RecordingPath.buildRemoveCommand(path);
        rmProc.command = cmd.argv;
        rmProc.running = true;
    }

    function _resolveBaseDirectory() {
        var moviesUrl = StandardPaths.writableLocation(StandardPaths.MoviesLocation);
        var moviesPath = root._urlToLocalPath(moviesUrl);
        if (RecordingPath.isSafeRecordingDirectory(moviesPath)) {
            return moviesPath;
        }

        var homeUrl = StandardPaths.writableLocation(StandardPaths.HomeLocation);
        var homePath = root._urlToLocalPath(homeUrl);
        if (RecordingPath.isSafeRecordingDirectory(homePath)) {
            return homePath + "/Videos";
        }

        return "";
    }

    function _urlToLocalPath(url) {
        if (!url) return "";

        var s = "";
        if (typeof url === "string") {
            s = url;
        } else if (url.toString) {
            s = url.toString();
        } else {
            return "";
        }

        if (s.indexOf("file://") === 0) {
            s = s.substring(7);
        }

        try {
            s = decodeURIComponent(s);
        } catch (e) {
            // If decoding fails, keep the raw string; further validation will
            // reject unsafe framing before it is used.
        }

        return s;
    }

    function _reset() {
        root._recordingDirectory = "";
        root._reservedPath = "";
        root._mktempOutput = "";
        root._mktempExited = false;
        root._mktempExitCode = 0;
        root._mktempExitStatus = 0;
        root._mkdirStarted = false;
        root._mkdirExited = false;
    }

    function _finishFailed(reason) {
        root.error = reason;
        root.busy = false;
        root._doCleanupAndReset();
        root.failed(reason);
    }

    function _onMkdirExited(exitCode, exitStatus) {
        if (!root.busy) return;
        root._mkdirExited = true;

        if (exitCode !== 0 || exitStatus !== 0) {
            root._finishFailed("Could not prepare the recording folder.");
            return;
        }

        var now = new Date();
        var mktempCmd = RecordingPath.buildMktempCommand(root._recordingDirectory, now);
        mktempProc.command = mktempCmd.argv;
        root._mktempOutput = "";
        root._mktempCapture = BoundedOutput.create();
        root._mktempExited = false;
        mktempProc.running = true;
    }

    function _onMktempChunk(data) {
        if (!root.busy) return;

        if (BoundedOutput.append(root._mktempCapture, data)) return;

        if (BoundedOutput.isOverflow(root._mktempCapture) && mktempProc.running) {
            mktempProc.running = false;
        }
    }

    function _onMktempExited(exitCode, exitStatus) {
        if (!root.busy) return;

        root._mktempExited = true;
        root._mktempExitCode = exitCode;
        root._mktempExitStatus = exitStatus;

        if (BoundedOutput.isOverflow(root._mktempCapture)) {
            root._finishFailed("Could not create a recording file.");
            return;
        }

        if (root._mktempOutput === "") {
            var text = BoundedOutput.value(root._mktempCapture);
            root._mktempOutput = String(text || "").replace(/\r?\n$/, "");
        }

        root._attemptMktempFinalize();
    }

    function _attemptMktempFinalize() {
        if (!root._mktempExited) return;

        if (root._mktempExitCode !== 0 || root._mktempExitStatus !== 0) {
            root._finishFailed("Could not create a recording file.");
            return;
        }

        var result = RecordingPath.validateMktempOutput(root._mktempOutput, root._recordingDirectory);
        if (!result.ok) {
            root._finishFailed(result.error);
            return;
        }

        root._reservedPath = result.path;
        root.busy = false;
        root.prepared(result.path, root._recordingDirectory);
    }

    function _onMkdirRunningChanged() {
        if (!mkdirProc.running && root.busy && !root._mkdirExited) {
            // The process stopped before the normal exit path, e.g. FailedToStart.
            root._finishFailed("Could not prepare the recording folder.");
        }
    }

    function _onMktempRunningChanged() {
        if (!mktempProc.running && root.busy && !root._mktempExited) {
            // The process stopped before the normal exit path, e.g. FailedToStart.
            root._finishFailed("Could not create a recording file.");
        }
    }

    Process {
        id: mkdirProc
        running: false
        command: []

        onExited: function(exitCode, exitStatus) { root._onMkdirExited(exitCode, exitStatus) }
        onRunningChanged: root._onMkdirRunningChanged()
    }

    Process {
        id: mktempProc
        running: false
        command: []

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) { root._onMktempChunk(data) }
        }

        onExited: function(exitCode, exitStatus) { root._onMktempExited(exitCode, exitStatus) }
        onRunningChanged: root._onMktempRunningChanged()
    }

    Process {
        id: rmProc
        running: false
        command: []
    }
}
