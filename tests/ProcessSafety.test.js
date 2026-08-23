const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const QML_DIR = path.join(REPO_ROOT, "qml");

function readQml(name) {
    return fs.readFileSync(path.join(QML_DIR, name), "utf8");
}

function assertNotContains(haystack, needle, message) {
    assert.strictEqual(
        haystack.indexOf(needle) >= 0,
        false,
        `${message}: unexpected "${needle}"`
    );
}

function run() {
    const scrcpyBackend = readQml("ScrcpyBackend.qml");
    const wirelessManager = readQml("WirelessManager.qml");
    const recordingManager = readQml("RecordingManager.qml");
    const deviceManager = readQml("DeviceManager.qml");

    // 1. No global process management or shell-string construction.
    for (const file of [scrcpyBackend, wirelessManager, recordingManager, deviceManager]) {
        assertNotContains(file, "pkill", "no global pkill");
        assertNotContains(file, "killall", "no global killall");
        assertNotContains(file, "startDetached", "no detached processes");
        assertNotContains(file, "execDetached", "no execDetached processes");
        assertNotContains(file, "sudo", "no runtime privilege escalation");
        assertNotContains(file, "su ", "no su invocation");
        assertNotContains(file, "pkexec", "no pkexec");
        assertNotContains(file, "doas", "no doas");
        assertNotContains(file, "sh -c", "no sh -c shell string");
        assertNotContains(file, "bash -c", "no bash -c shell string");
    }

    // 2. ScrcpyBackend has a safety net for FailedToStart (Quickshell does not
    //    emit onExited when the binary cannot be started), and Stop only touches
    //    the tracked scrcpy process.
    assert.ok(scrcpyBackend.indexOf("_exitedHandled") >= 0, "ScrcpyBackend tracks exit handling");
    assert.ok(scrcpyBackend.indexOf("onRunningChanged") >= 0, "ScrcpyBackend has runningChanged fallback");
    assert.ok(scrcpyBackend.indexOf("scrcpyProc.running = false") >= 0, "Stop sets only the tracked process");

    // 3. Wireless pair/connect processes have FailedToStart fallbacks.
    assert.ok(wirelessManager.indexOf("onRunningChanged") >= 0, "WirelessManager has runningChanged fallback");

    // 4. Recording preparation already has FailedToStart fallbacks.
    assert.ok(recordingManager.indexOf("onRunningChanged") >= 0, "RecordingManager has runningChanged fallback");

    // 5. Device discovery already has a FailedToStart fallback.
    assert.ok(deviceManager.indexOf("onRunningChanged") >= 0, "DeviceManager has runningChanged fallback");

    console.log("All ProcessSafety fixtures passed.");
}

run();
