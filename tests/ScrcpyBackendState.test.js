const assert = require("assert");
const state = require("../qml/ScrcpyState.js");

function run() {
    // A. Intentional Stop clears the error state.
    assert.strictEqual(state.classifyExit(false, true, true, 1, 0), "",
        "A1: Stop during running");
    assert.strictEqual(state.classifyExit(true, false, true, 1, 0), "",
        "A2: Stop during starting");

    // B. Normal zero-exit closure (e.g. user closed the scrcpy window).
    assert.strictEqual(state.classifyExit(false, true, false, 0, 0), "",
        "B1: running, zero exit");
    assert.strictEqual(state.classifyExit(true, false, false, 0, 0), "",
        "B2: starting, zero exit");

    // C. Unexpected failure after the process had successfully started.
    assert.strictEqual(state.classifyExit(false, true, false, 1, 0),
        "Mirroring ended unexpectedly.",
        "C1: running, non-zero exitCode");
    assert.strictEqual(state.classifyExit(false, true, false, 0, 1),
        "Mirroring ended unexpectedly.",
        "C2: running, non-zero exitStatus");

    // D. Failure before successfully reaching the running state.
    assert.strictEqual(state.classifyExit(true, false, false, 1, 0),
        "Could not start mirroring.",
        "D1: starting, non-zero exitCode");
    assert.strictEqual(state.classifyExit(true, false, false, 0, 1),
        "Could not start mirroring.",
        "D2: starting, non-zero exitStatus");

    // E. An unstarted/non-running unexpected exit does not invent a message.
    assert.strictEqual(state.classifyExit(false, false, false, 1, 0), "",
        "E: no starting or running, non-zero exit");

    console.log("All ScrcpyBackend state fixtures passed.");
}

run();
