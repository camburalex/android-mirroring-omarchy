const assert = require("assert");
const command = require("../qml/ScrcpyCommand.js");

function assertThrowsSerial(serial) {
    assert.throws(
        () => command.buildCommand(serial),
        /Invalid or unsafe scrcpy serial/,
        `expected rejection for serial: ${JSON.stringify(serial)}`
    );
}

function run() {
    // A. Normal USB serial.
    const normal = command.buildCommand("ABC123");
    assert.strictEqual(normal.program, "scrcpy", "A: program");
    assert.deepStrictEqual(normal.argv, ["scrcpy", "-s", "ABC123"], "A: argv");

    // B. Network-form serial.
    const network = command.buildCommand("192.168.1.10:5555");
    assert.strictEqual(network.argv.length, 3, "B: argv length");
    assert.strictEqual(network.argv[2], "192.168.1.10:5555", "B: serial is one argv element");

    // C. Shell-looking serial stays one argv element; no shell is used.
    const nasty = ";|&<>{}";
    const shell = command.buildCommand(nasty);
    assert.strictEqual(shell.argv.length, 3, "C: argv length");
    assert.strictEqual(shell.argv[2], nasty, "C: serial remains one element");
    assert.strictEqual(shell.program, "scrcpy", "C: program stays scrcpy");
    for (const arg of shell.argv) {
        assert.strictEqual(
            ["sh", "bash", "/bin/sh", "/bin/bash"].includes(arg),
            false,
            "C: no shell executable in argv"
        );
    }

    // D. Empty serial is rejected.
    assertThrowsSerial("");
    assertThrowsSerial("   ");

    // E. Newline/control framing is rejected.
    assertThrowsSerial("abc\n123");
    assertThrowsSerial("abc\r\n123");
    assertThrowsSerial("abc\t123");
    assertThrowsSerial("abc\u0000123");
    assertThrowsSerial(" \b ");

    // isValidSerial covers the same rules.
    assert.strictEqual(command.isValidSerial("ABC123"), true);
    assert.strictEqual(command.isValidSerial("192.168.1.10:5555"), true);
    assert.strictEqual(command.isValidSerial(";|&<>{}"), true);
    assert.strictEqual(command.isValidSerial(""), false);
    assert.strictEqual(command.isValidSerial("abc\n123"), false);
    assert.strictEqual(command.isValidSerial(123), false);

    console.log("All ScrcpyCommand fixtures passed.");
}

run();
