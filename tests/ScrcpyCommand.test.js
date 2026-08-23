const assert = require("assert");
const command = require("../qml/ScrcpyCommand.js");

const TEST_SERIAL = "ABC123";
const TEST_NETWORK_SERIAL = "192.168.1.10:5555";
const TEST_RECORDING_PATH = "/test/Videos/Android Mirroring/android-mirroring-20260823-150412-XXXXXX.mp4";
const TEST_RECORDING_PATH_WITH_SPACES = "/test/Videos/Android Mirroring/spaces in path.mp4";

function expectedArgvFor(serial, options, recordingPath) {
    const opts = command.normalizeOptions(options);
    const p = command.PRESETS[opts.preset];
    const argv = [
        "scrcpy",
        "-s",
        serial,
        "--max-size=" + p.maxSize,
        "--video-bit-rate=" + p.videoBitRate,
        "--max-fps=" + p.maxFps
    ];
    if (!opts.audioEnabled) argv.push("--no-audio");
    if (opts.screenOff) argv.push("--turn-screen-off");
    if (opts.recordingEnabled) {
        argv.push("--record=" + recordingPath);
    }
    return argv;
}

function expectedArgv(options, recordingPath) {
    return expectedArgvFor(TEST_SERIAL, options, recordingPath);
}

function assertThrowsSerial(serial) {
    assert.throws(
        () => command.buildCommand(serial),
        /Invalid or unsafe scrcpy serial/,
        `expected rejection for serial: ${JSON.stringify(serial)}`
    );
}

function assertNoShell(argv) {
    for (const arg of argv) {
        assert.strictEqual(
            ["sh", "bash", "/bin/sh", "/bin/bash"].includes(arg),
            false,
            "no shell executable in argv"
        );
    }
}

function assertNoRecord(argv) {
    for (const arg of argv) {
        assert.strictEqual(arg.indexOf("--record="), -1, "no --record= argument");
    }
}

function assertOneRecord(argv, expectedPath) {
    const recordArgs = argv.filter((a) => a.indexOf("--record=") === 0);
    assert.strictEqual(recordArgs.length, 1, "exactly one --record= argument");
    assert.strictEqual(recordArgs[0], "--record=" + expectedPath, "record path is exact");
}

function run() {
    // A. Normal USB serial with default options (Balanced, audio on, screen off off, recording off).
    const normal = command.buildCommand(TEST_SERIAL);
    assert.strictEqual(normal.program, "scrcpy", "A: program");
    assert.deepStrictEqual(
        normal.argv,
        expectedArgv({}),
        "A: default argv"
    );
    assertNoRecord(normal.argv);

    // B. Network-form serial.
    const network = command.buildCommand(TEST_NETWORK_SERIAL);
    assert.strictEqual(network.argv.length, 6, "B: argv length");
    assert.strictEqual(network.argv[2], TEST_NETWORK_SERIAL, "B: serial is one argv element");
    assertNoShell(network.argv);

    // C. Shell-looking serial stays one argv element; no shell is used.
    const nasty = ";|&<>{}";
    const shell = command.buildCommand(nasty, {
        preset: "performance",
        audioEnabled: false,
        screenOff: true
    });
    assert.strictEqual(shell.argv.length, 8, "C: argv length");
    assert.strictEqual(shell.argv[2], nasty, "C: serial remains one element");
    assert.strictEqual(shell.program, "scrcpy", "C: program stays scrcpy");
    assertNoShell(shell.argv);
    assert.deepStrictEqual(
        shell.argv,
        expectedArgvFor(nasty, { preset: "performance", audioEnabled: false, screenOff: true }),
        "C: performance + audio off + screen off on"
    );

    // D. Empty serial is rejected.
    assertThrowsSerial("");
    assertThrowsSerial("   ");

    // E. Newline/control framing is rejected.
    assertThrowsSerial("abc\n123");
    assertThrowsSerial("abc\r\n123");
    assertThrowsSerial("abc\t123");
    assertThrowsSerial("abc\u0000123");
    assertThrowsSerial(" \b ");

    // F. isValidSerial covers the same rules.
    assert.strictEqual(command.isValidSerial("ABC123"), true);
    assert.strictEqual(command.isValidSerial("192.168.1.10:5555"), true);
    assert.strictEqual(command.isValidSerial(";|&<>{}"), true);
    assert.strictEqual(command.isValidSerial(""), false);
    assert.strictEqual(command.isValidSerial("abc\n123"), false);
    assert.strictEqual(command.isValidSerial(123), false);

    // G. Full 24-state preset / audio / screen-off / recording matrix.
    const table = [
        ["performance", true, false, false],
        ["performance", true, false, true],
        ["performance", true, true, false],
        ["performance", true, true, true],
        ["performance", false, false, false],
        ["performance", false, false, true],
        ["performance", false, true, false],
        ["performance", false, true, true],
        ["balanced", true, false, false],
        ["balanced", true, false, true],
        ["balanced", true, true, false],
        ["balanced", true, true, true],
        ["balanced", false, false, false],
        ["balanced", false, false, true],
        ["balanced", false, true, false],
        ["balanced", false, true, true],
        ["quality", true, false, false],
        ["quality", true, false, true],
        ["quality", true, true, false],
        ["quality", true, true, true],
        ["quality", false, false, false],
        ["quality", false, false, true],
        ["quality", false, true, false],
        ["quality", false, true, true]
    ];

    for (const [preset, audio, screen, recording] of table) {
        const recordingPath = recording ? TEST_RECORDING_PATH : "";
        const result = command.buildCommand(TEST_SERIAL, {
            preset: preset,
            audioEnabled: audio,
            screenOff: screen,
            recordingEnabled: recording
        }, recordingPath);

        assert.deepStrictEqual(
            result.argv,
            expectedArgv({ preset: preset, audioEnabled: audio, screenOff: screen, recordingEnabled: recording }, recordingPath),
            `table: ${preset} / audio ${audio} / screenOff ${screen} / recording ${recording}`
        );

        const audioCount = result.argv.filter((a) => a === "--no-audio").length;
        const screenCount = result.argv.filter((a) => a === "--turn-screen-off").length;
        const recordCount = result.argv.filter((a) => a.indexOf("--record=") === 0).length;

        assert.strictEqual(audioCount, audio ? 0 : 1, `audio flag count: ${preset} ${audio} ${screen} ${recording}`);
        assert.strictEqual(screenCount, screen ? 1 : 0, `screen-off flag count: ${preset} ${audio} ${screen} ${recording}`);
        assert.strictEqual(recordCount, recording ? 1 : 0, `record flag count: ${preset} ${audio} ${screen} ${recording}`);
        assert.strictEqual(
            result.argv.includes("--require-audio"),
            false,
            `must not introduce --require-audio: ${preset} ${audio} ${screen} ${recording}`
        );
    }

    // H. Default options path.
    const defaults = command.buildCommand(TEST_SERIAL, {});
    assert.deepStrictEqual(defaults.argv, expectedArgv({}), "H: empty options default to balanced, no recording");
    assert.strictEqual(command.DEFAULT_PRESET, "balanced", "H: default preset constant");

    // I. Explicit option fixtures.
    const audioOn = command.buildCommand(TEST_SERIAL, { audioEnabled: true });
    const audioOff = command.buildCommand(TEST_SERIAL, { audioEnabled: false });
    assert.strictEqual(audioOn.argv.includes("--no-audio"), false, "I: audio on omits --no-audio");
    assert.strictEqual(audioOff.argv.filter((a) => a === "--no-audio").length, 1, "I: audio off adds one --no-audio");

    const screenOffOn = command.buildCommand(TEST_SERIAL, { screenOff: true });
    const screenOffOff = command.buildCommand(TEST_SERIAL, { screenOff: false });
    assert.strictEqual(screenOffOn.argv.filter((a) => a === "--turn-screen-off").length, 1, "I: screen-off on adds one --turn-screen-off");
    assert.strictEqual(screenOffOff.argv.includes("--turn-screen-off"), false, "I: screen-off off omits --turn-screen-off");

    const recordingOff = command.buildCommand(TEST_SERIAL, { recordingEnabled: false });
    assertNoRecord(recordingOff.argv);

    const recordingOn = command.buildCommand(TEST_SERIAL, { recordingEnabled: true }, TEST_RECORDING_PATH);
    assertOneRecord(recordingOn.argv, TEST_RECORDING_PATH);

    // J. Invalid preset fails safely.
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { preset: "turbo" }),
        /Invalid preset/,
        "J: unknown preset rejected"
    );

    // K. Recording path with spaces stays one argv element.
    const pathWithSpaces = command.buildCommand(TEST_SERIAL, {
        preset: "balanced",
        audioEnabled: true,
        screenOff: false,
        recordingEnabled: true
    }, TEST_RECORDING_PATH_WITH_SPACES);
    assertOneRecord(pathWithSpaces.argv, TEST_RECORDING_PATH_WITH_SPACES);
    assertNoShell(pathWithSpaces.argv);
    const recordArg = pathWithSpaces.argv.find((a) => a.indexOf("--record=") === 0);
    assert.ok(recordArg.indexOf(" ") >= 0, "K: record argv contains a space and is therefore one element");

    // L. Required recording combinations.
    const balancedAudioOn = command.buildCommand(TEST_SERIAL, {
        preset: "balanced",
        audioEnabled: true,
        screenOff: false,
        recordingEnabled: true
    }, TEST_RECORDING_PATH);
    assert.ok(!balancedAudioOn.argv.includes("--no-audio"), "L1: audio on + recording omits --no-audio");
    assert.ok(!balancedAudioOn.argv.includes("--turn-screen-off"), "L1: screen off off + recording omits --turn-screen-off");
    assertOneRecord(balancedAudioOn.argv, TEST_RECORDING_PATH);

    const qualityAudioOffScreenOff = command.buildCommand(TEST_SERIAL, {
        preset: "quality",
        audioEnabled: false,
        screenOff: true,
        recordingEnabled: true
    }, TEST_RECORDING_PATH);
    assert.ok(qualityAudioOffScreenOff.argv.includes("--no-audio"), "L2: audio off + recording includes --no-audio");
    assert.ok(qualityAudioOffScreenOff.argv.includes("--turn-screen-off"), "L2: screen off on + recording includes --turn-screen-off");
    assertOneRecord(qualityAudioOffScreenOff.argv, TEST_RECORDING_PATH);

    // M. Recording path validation.
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { recordingEnabled: true }, ""),
        /Recording enabled but no recording path provided/,
        "M1: empty recording path rejected"
    );
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { recordingEnabled: true }, "/tmp/out.mkv"),
        /Recording path must end with .mp4/,
        "M2: non-mp4 recording path rejected"
    );
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { recordingEnabled: true }, "relative/path.mp4"),
        /Recording path must be absolute/,
        "M3: relative recording path rejected"
    );
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { recordingEnabled: true }, "/tmp/out\n.mp4"),
        /Recording path contains unsafe characters/,
        "M4: newline in recording path rejected"
    );
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { recordingEnabled: true }, "/tmp/../out.mp4"),
        /parent references/,
        "M5: parent reference in recording path rejected"
    );
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { recordingEnabled: true }, "/tmp/out\x00.mp4"),
        /Recording path contains unsafe characters/,
        "M6: NUL in recording path rejected"
    );

    console.log("All ScrcpyCommand fixtures passed.");
}

run();
