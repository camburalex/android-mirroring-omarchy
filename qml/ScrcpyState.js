// ScrcpyState.js — pure lifecycle state classification for ScrcpyBackend.
//
// This is plain JavaScript so it can be imported by QML
// (`import "ScrcpyState.js" as ScrcpyState`) and a Node test harness
// (`require`).

function classifyExit(wasStarting, wasRunning, wasStopping, exitCode, exitStatus) {
    if (wasStopping) {
        // Intentional plugin Stop must not leave an error message.
        return "";
    }

    if (exitCode !== 0 || exitStatus !== 0) {
        // Distinguish a startup failure from an unexpected exit after the
        // process had successfully reached the running state.
        if (wasRunning) {
            return "Mirroring ended unexpectedly.";
        }
        if (wasStarting) {
            return "Could not start mirroring.";
        }
    }

    // Normal zero-exit closure (e.g. the user closed the scrcpy window) is
    // not an error.
    return "";
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        classifyExit: classifyExit
    };
}
