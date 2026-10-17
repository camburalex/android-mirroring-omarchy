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

function extractBlock(source, id) {
    const idIdx = source.indexOf("id: " + id);
    if (idIdx < 0) return "";
    const openIdx = source.lastIndexOf("{", idIdx);
    let depth = 0;
    for (let i = openIdx; i < source.length; i++) {
        const c = source[i];
        if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) return source.substring(openIdx, i + 1);
        }
    }
    return "";
}

function extractFunction(source, name) {
    const start = source.indexOf("function " + name);
    if (start < 0) return "";
    const openIdx = source.indexOf("{", start);
    if (openIdx < 0) return "";
    let depth = 0;
    for (let i = openIdx; i < source.length; i++) {
        const c = source[i];
        if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) return source.substring(openIdx, i + 1);
        }
    }
    return "";
}

function run() {
    const scrcpyBackend = readQml("ScrcpyBackend.qml");
    const wirelessManager = readQml("WirelessManager.qml");
    const recordingManager = readQml("RecordingManager.qml");
    const deviceManager = readQml("DeviceManager.qml");
    const qrPairingManager = readQml("QrPairingManager.qml");

    // 1. No global process management or shell-string construction, and no
    //    `timeout` shell wrapper for the short-lived ADB operations.
    for (const file of [scrcpyBackend, wirelessManager, recordingManager, deviceManager, qrPairingManager]) {
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
    for (const file of [deviceManager, wirelessManager]) {
        assertNotContains(file, 'command: ["timeout"', "no timeout utility as process command");
        assertNotContains(file, '"timeout",', "no timeout utility as argv element");
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

    // 6. No unbounded full-stream StdioCollector capture remains on ADB or
    //    mktemp paths; all production streams now use bounded SplitParser.
    for (const file of [deviceManager, wirelessManager, recordingManager]) {
        assertNotContains(file, "StdioCollector", "no unbounded StdioCollector");
    }

    // 7. ScrcpyBackend's long-running scrcpy streams do not use a newline
    //    SplitParser, so an unterminated record cannot grow inside Quickshell
    //    before the plugin's bounded diagnostic handler runs.
    const scrcpyProc = extractBlock(scrcpyBackend, "scrcpyProc");
    assert.ok(scrcpyProc.indexOf("id: scrcpyProc") >= 0, "scrcpyProc block found");
    assert.ok(scrcpyProc.indexOf('stdout: SplitParser') >= 0, "scrcpy stdout is a SplitParser");
    assert.ok(scrcpyProc.indexOf('stderr: SplitParser') >= 0, "scrcpy stderr is a SplitParser");
    assert.ok(scrcpyProc.indexOf('splitMarker: ""') >= 0, "scrcpy streams use chunk-mode splitMarker");
    assertNotContains(scrcpyProc, 'splitMarker: "\\n"', "scrcpy streams do not use newline splitMarker");
    assertNotContains(scrcpyProc, 'splitMarker: "\\r\\n"', "scrcpy streams do not use CRLF splitMarker");
    assert.ok(scrcpyBackend.indexOf("ScrcpyDiagnostics") >= 0, "ScrcpyBackend uses a bounded diagnostic helper");
    assert.ok(scrcpyBackend.indexOf("_appendDiagnosticChunk") >= 0, "ScrcpyBackend has a chunk diagnostic handler");

    // 8. Short-lived ADB processes have finite deadlines with a generation token.
    assert.ok(deviceManager.indexOf("AdbOperation.DEVICE_DISCOVERY_TIMEOUT_MS") >= 0,
        "DeviceManager uses the shared discovery deadline constant");
    assert.ok(deviceManager.indexOf("property int gen") >= 0,
        "DeviceManager deadline/kill timers carry a generation token");
    assert.ok(deviceManager.indexOf("adbProc.signal(9)") >= 0,
        "DeviceManager can force-kill a stalled discovery child");

    // 9. Wireless pair/connect have finite deadlines, escalation, and generation tokens.
    assert.ok(wirelessManager.indexOf("AdbOperation.PAIR_TIMEOUT_MS") >= 0,
        "WirelessManager uses the shared pair deadline constant");
    assert.ok(wirelessManager.indexOf("AdbOperation.CONNECT_TIMEOUT_MS") >= 0,
        "WirelessManager uses the shared connect deadline constant");
    assert.ok(wirelessManager.indexOf("pairProc.signal(9)") >= 0,
        "WirelessManager can force-kill a stalled pair child");
    assert.ok(wirelessManager.indexOf("connectProc.signal(9)") >= 0,
        "WirelessManager can force-kill a stalled connect child");

    // 10. Pair timeout clears the in-memory pairing code.
    const pairTimeoutBlock = extractFunction(wirelessManager, "_onPairTimeout");
    assert.ok(pairTimeoutBlock.indexOf("_clearPairingCode()") >= 0,
        "pair timeout clears the pairing code");

    // 11. Device and wireless managers import the shared ADB operation state machine.
    assert.ok(deviceManager.indexOf('import "AdbOperation.js" as AdbOperation') >= 0,
        "DeviceManager imports the ADB operation state machine");
    assert.ok(wirelessManager.indexOf('import "AdbOperation.js" as AdbOperation') >= 0,
        "WirelessManager imports the ADB operation state machine");

    // 12. QR pairing: every process has a FailedToStart fallback, streams are
    //     bounded chunk-mode SplitParsers, and commands come from the tested
    //     argv builders rather than inline strings.
    for (const id of ["randomProc", "qrProc", "pairBrowseProc", "connectBrowseProc"]) {
        const block = extractBlock(qrPairingManager, id);
        assert.ok(block.indexOf("id: " + id) >= 0, id + " block found");
        assert.ok(block.indexOf("onRunningChanged") >= 0, id + " has runningChanged fallback");
        assert.ok(block.indexOf("stdout: SplitParser") >= 0, id + " stdout is a SplitParser");
        assert.ok(block.indexOf('splitMarker: ""') >= 0, id + " uses chunk-mode splitMarker");
        assert.ok(block.indexOf("stderr: SplitParser") >= 0, id + " stderr is an explicit SplitParser");
        assert.strictEqual(block.split('splitMarker: ""').length - 1, 2, id + " uses chunk mode on both streams");
        assert.ok(block.indexOf("command: []") >= 0, id + " has no inline command");
        assert.ok(qrPairingManager.indexOf(id + ".signal(9)") >= 0, id + " can be force-killed");
    }
    assertNotContains(qrPairingManager, "StdioCollector", "no unbounded StdioCollector");
    assertNotContains(qrPairingManager, 'splitMarker: "\\n"', "QR pairing streams do not use newline splitMarker");
    assert.ok(qrPairingManager.indexOf("QrPairing.pushChunk") >= 0, "browse output goes through bounded line assembly");
    for (const fn of ["_onPairBrowseData", "_onConnectBrowseData"]) {
        assert.ok(extractFunction(qrPairingManager, fn).indexOf("QrPairing.isOverBudget") >= 0,
            fn + " enforces the whole-run output budget");
    }
    for (const id of ["randomProc", "qrProc"]) {
        const block = extractBlock(qrPairingManager, id);
        assert.ok(block.indexOf("BoundedOutput.append") >= 0, id + " output is a bounded capture");
        assert.ok(block.indexOf("_onPrepareOverflow()") >= 0, id + " overflow ends the run immediately");
    }
    assert.ok(extractFunction(qrPairingManager, "_fail").indexOf("_reset()") >= 0, "every failure stops the session's processes");
    for (const id of ["randomProc", "qrProc", "pairBrowseProc", "connectBrowseProc"]) {
        assert.ok(extractFunction(qrPairingManager, "_reset").indexOf("_stop(" + id + ")") >= 0,
            "session reset stops " + id);
    }
    assert.ok(extractFunction(qrPairingManager, "_stop").indexOf("killTimer.restart()") >= 0,
        "every stop request arms the SIGKILL escalation");
    assert.ok(qrPairingManager.indexOf("QrPairing.PREPARE_TIMEOUT_MS") >= 0, "QR generation has a finite deadline");
    assert.ok(qrPairingManager.indexOf("QrPairing.SCAN_TIMEOUT_MS") >= 0, "QR scan wait has a finite deadline");
    assert.ok(qrPairingManager.indexOf("QrPairing.LOCATE_TIMEOUT_MS") >= 0, "endpoint lookup has a finite deadline");

    // 13. The QR pairing password reaches qrencode and adb through stdin only,
    //     is never logged, and is cleared when the session resets.
    assertNotContains(qrPairingManager, "console.", "QR pairing manager does not log");
    assert.ok(extractBlock(qrPairingManager, "qrProc").indexOf("qrProc.write(") >= 0,
        "QR payload is written to qrencode stdin");
    assert.ok(extractFunction(qrPairingManager, "_reset").indexOf("_clearSecrets()") >= 0,
        "session reset clears the QR credentials");
    assert.ok(extractFunction(qrPairingManager, "_onPairingServiceFound").indexOf("_clearSecrets()") >= 0,
        "credentials are cleared when handed to ADB");
    const pairOnly = extractFunction(wirelessManager, "pair(");
    assert.ok(pairOnly.indexOf("isValidPairingPassword") >= 0, "pair() validates the password before writing it");

    // Integrated dependency setup: the only detached launch in the plugin is
    // Omarchy's installer, started with the fixed argv from DependencySetup.
    // The plugin never escalates privileges or builds a shell string itself.
    const dependencyManager = readQml("DependencyManager.qml");
    for (const needle of ["pkill", "killall", "startDetached", "sudo", "pkexec", "doas", "sh -c", "bash -c"]) {
        assertNotContains(dependencyManager, needle, "dependency manager process safety");
    }
    assert.strictEqual(dependencyManager.split("execDetached").length - 1, 1,
        "dependency manager has exactly one detached launch");
    assert.ok(dependencyManager.indexOf("Quickshell.execDetached(DependencySetup.buildInstallArgv())") >= 0,
        "the detached launch uses the fixed installer argv");
    assert.ok(extractFunction(dependencyManager, "install").indexOf("root.ready || root.installing") >= 0,
        "install is a no-op when already ready or installing");
    for (const name of fs.readdirSync(QML_DIR)) {
        if (name === "DependencyManager.qml" || !/\.(qml|js)$/.test(name)) continue;
        assertNotContains(readQml(name), "execDetached", "no detached launch outside dependency setup: " + name);
    }

    // No clipboard access: the plugin creates no Qt editable text control (they
    // request clipboard data) and never reads Quickshell's clipboard. Text is
    // typed into KeyEntryField, which is plain Text driven by key presses.
    const editableText = /\b(TextField|TextInput|TextEdit|TextArea|SpinBox|ComboBox)\s*\{/;
    for (const name of fs.readdirSync(QML_DIR)) {
        if (!/\.(qml|js)$/.test(name)) continue;
        const source = readQml(name);
        assert.strictEqual(editableText.test(source), false, "no editable text control: " + name);
        assertNotContains(source, "QtQuick.Controls", "no Quick Controls import: " + name);
        assertNotContains(source, "clipboardText", "no clipboard read: " + name);
    }
    const keyEntryField = readQml("KeyEntryField.qml");
    assert.ok(keyEntryField.indexOf("Keys.onPressed") >= 0, "entry field handles keys itself");
    assert.ok(keyEntryField.indexOf("KeyEntry.applyKey") >= 0, "entry field applies the shared key rules");
    assert.ok(keyEntryField.indexOf("textFormat: Text.PlainText") >= 0, "entry field shows plain text");
    const barWidget = readQml("BarWidget.qml");
    assert.strictEqual(barWidget.split("sourceComponent: KeyEntryField {").length - 1, 4,
        "all four wireless fields are KeyEntryField");
    const codeField = extractBlock(barWidget, "pairingCodeLoader");
    assert.ok(codeField.indexOf('kind: "code"') >= 0, "pairing-code field accepts digits only");
    assert.ok(codeField.indexOf("password: true") >= 0, "pairing-code field is masked");
    for (const id of ["step1ConnAddrLoader", "pairingAddrLoader", "pairingCodeLoader", "connectAddrLoader"]) {
        assert.ok(extractBlock(barWidget, id).indexOf("active: panel.visible && parent.visible") >= 0,
            id + " exists only while its form is on screen");
        assert.ok(extractBlock(barWidget, "keyCatcher").indexOf(id + ".item.activeFocus") >= 0,
            "panel keys are blocked while " + id + " has focus");
    }

    console.log("All ProcessSafety fixtures passed.");
}

run();
