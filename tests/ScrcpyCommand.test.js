const assert = require("assert");
const command = require("../qml/ScrcpyCommand.js");

const TEST_SERIAL = "ABC123";
const TEST_NETWORK_SERIAL = "192.168.1.10:5555";

function expectedArgvFor(serial, preset, audioOn, screenOffOn) {
    const p = command.PRESETS[preset];
    const argv = [
        "scrcpy",
        "-s",
        serial,
        "--max-size=" + p.maxSize,
        "--video-bit-rate=" + p.videoBitRate,
        "--max-fps=" + p.maxFps
    ];
    if (!audioOn) argv.push("--no-audio");
    if (screenOffOn) argv.push("--turn-screen-off");
    return argv;
}

function expectedArgv(preset, audioOn, screenOffOn) {
    return expectedArgvFor(TEST_SERIAL, preset, audioOn, screenOffOn);
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

function run() {
    // A. Normal USB serial with default options (Balanced, audio on, screen off off).
    const normal = command.buildCommand(TEST_SERIAL);
    assert.strictEqual(normal.program, "scrcpy", "A: program");
    assert.deepStrictEqual(
        normal.argv,
        expectedArgv("balanced", true, false),
        "A: default argv"
    );

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
        expectedArgvFor(nasty, "performance", false, true),
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

    // G. 12-state preset / audio / screen-off matrix.
    const table = [
        ["performance", true, false],
        ["performance", true, true],
        ["performance", false, false],
        ["performance", false, true],
        ["balanced", true, false],
        ["balanced", true, true],
        ["balanced", false, false],
        ["balanced", false, true],
        ["quality", true, false],
        ["quality", true, true],
        ["quality", false, false],
        ["quality", false, true]
    ];

    for (const [preset, audio, screen] of table) {
        const result = command.buildCommand(TEST_SERIAL, {
            preset: preset,
            audioEnabled: audio,
            screenOff: screen
        });
        assert.deepStrictEqual(
            result.argv,
            expectedArgv(preset, audio, screen),
            `table: ${preset} / audio ${audio} / screenOff ${screen}`
        );

        const audioCount = result.argv.filter((a) => a === "--no-audio").length;
        const screenCount = result.argv.filter((a) => a === "--turn-screen-off").length;
        assert.strictEqual(audioCount, audio ? 0 : 1, `audio flag count: ${preset} ${audio} ${screen}`);
        assert.strictEqual(screenCount, screen ? 1 : 0, `screen-off flag count: ${preset} ${audio} ${screen}`);
        assert.strictEqual(
            result.argv.includes("--require-audio"),
            false,
            `must not introduce --require-audio: ${preset} ${audio} ${screen}`
        );
    }

    // H. Default options path.
    const defaults = command.buildCommand(TEST_SERIAL, {});
    assert.deepStrictEqual(defaults.argv, expectedArgv("balanced", true, false), "H: empty options default to balanced");
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

    // J. Invalid preset fails safely.
    assert.throws(
        () => command.buildCommand(TEST_SERIAL, { preset: "turbo" }),
        /Invalid preset/,
        "J: unknown preset rejected"
    );

    console.log("All ScrcpyCommand fixtures passed.");
}

run();
