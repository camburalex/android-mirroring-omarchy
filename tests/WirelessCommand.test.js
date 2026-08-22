const assert = require("assert");
const wc = require("../qml/WirelessCommand.js");

function assertEndpoint(endpoint, expectedOk, expectedHost, expectedPort, expectedReasonContains) {
    const result = wc.validateEndpoint(endpoint);
    assert.strictEqual(result.ok, expectedOk,
        `validateEndpoint(${JSON.stringify(endpoint)}) ok: expected ${expectedOk}, got ${result.ok}`);
    if (expectedHost !== undefined) assert.strictEqual(result.host, expectedHost, "host");
    if (expectedPort !== undefined) assert.strictEqual(result.port, expectedPort, "port");
    if (expectedReasonContains !== undefined) {
        assert.ok(result.reason && result.reason.indexOf(expectedReasonContains) >= 0,
            `reason should contain "${expectedReasonContains}": ${result.reason}`);
    }
}

function assertNoShell(argv) {
    for (const arg of argv) {
        assert.strictEqual(["sh", "bash", "/bin/sh", "/bin/bash"].includes(arg), false,
            `no shell executable in argv: ${arg}`);
    }
}

function assertCodeNotInArgv(argv, code) {
    for (const arg of argv) {
        assert.strictEqual(arg.indexOf(code) < 0, true,
            `pairing code must not appear in argv element: ${arg}`);
    }
}

function run() {
    // Endpoint validation: valid forms.
    assertEndpoint("192.168.1.20:37123", true, "192.168.1.20", 37123);
    assertEndpoint("phone-name.local:37123", true, "phone-name.local", 37123);
    assertEndpoint("[fe80::1234]:37123", true, "fe80::1234", 37123);

    // Endpoint validation: missing or bad port.
    assertEndpoint("192.168.1.20", false, undefined, undefined, "port");
    assertEndpoint("192.168.1.20:", false, undefined, undefined, "Port");
    assertEndpoint("192.168.1.20:0", false, undefined, undefined, "1–65535");
    assertEndpoint("192.168.1.20:65536", false, undefined, undefined, "1–65535");
    assertEndpoint("192.168.1.20:ab55", false, undefined, undefined, "numeric");

    // Endpoint validation: whitespace / control / newline / NUL injection.
    assertEndpoint("192.168.1.20: 37123", false, undefined, undefined, "invalid characters");
    assertEndpoint("192.168.1.20\t:37123", false, undefined, undefined, "invalid characters");
    assertEndpoint("192.168.1.20\n:37123", false, undefined, undefined, "invalid characters");
    assertEndpoint("192.168.1.20\r\n:37123", false, undefined, undefined, "invalid characters");
    assertEndpoint("192.168.1.20:\x0037123", false, undefined, undefined, "invalid characters");

    // Endpoint validation: IPv6 bracket safety.
    assertEndpoint("[fe80::1234", false, undefined, undefined, "bracket");
    assertEndpoint("fe80::1234:37123", false, undefined, undefined, "brackets");
    assertEndpoint("[]:37123", false, undefined, undefined, "empty");

    // Malformed / empty endpoint.
    assertEndpoint("", false, undefined, undefined, "empty");
    assertEndpoint(" :37123", false, undefined, undefined, "invalid characters");

    // Pairing code validation.
    assert.strictEqual(wc.isValidPairingCode("123456"), true, "valid code");
    assert.strictEqual(wc.isValidPairingCode("000000"), true, "zeros are allowed");
    assert.strictEqual(wc.isValidPairingCode("12345"), false, "too short");
    assert.strictEqual(wc.isValidPairingCode("1234567"), false, "too long");
    assert.strictEqual(wc.isValidPairingCode("12345a"), false, "nondigit");
    assert.strictEqual(wc.isValidPairingCode("12 456"), false, "space");
    assert.strictEqual(wc.isValidPairingCode(""), false, "empty");
    assert.strictEqual(wc.isValidPairingCode(123456), false, "number");

    // Pair command: argv form and security.
    const fakeCode = "123456";
    const pairCmd = wc.buildPairCommand("192.168.1.20:37123");
    assert.strictEqual(pairCmd.program, "adb", "pair program");
    assert.deepStrictEqual(pairCmd.argv, ["adb", "pair", "192.168.1.20:37123"], "pair argv");
    assertNoShell(pairCmd.argv);
    assertCodeNotInArgv(pairCmd.argv, fakeCode);

    // Connect command.
    const connectCmd = wc.buildConnectCommand("192.168.1.20:5555");
    assert.strictEqual(connectCmd.program, "adb", "connect program");
    assert.deepStrictEqual(connectCmd.argv, ["adb", "connect", "192.168.1.20:5555"], "connect argv");
    assertNoShell(connectCmd.argv);

    // Pair result classification.
    const pairSuccess = "Enter pairing code: \nSuccessfully paired to 192.168.1.20:37123";
    const pairFail = "Enter pairing code: \nerror: protocol fault (couldn't read status message): Success";
    const pairNoCode = "No pairing code provided";
    const pairUnknown = "Failed: Successfully paired but server returned unknown response=";
    const pairBadParse = "Failed to parse address for pairing: ...";

    assert.strictEqual(wc.classifyPairResult(0, pairSuccess, "").ok, true, "pair success");
    assert.strictEqual(wc.classifyPairResult(1, pairSuccess, "").ok, false, "pair nonzero exit");
    assert.strictEqual(wc.classifyPairResult(0, "", pairFail).ok, false, "pair protocol fault");
    assert.strictEqual(wc.classifyPairResult(0, "", pairNoCode).ok, false, "pair no code");
    assert.strictEqual(wc.classifyPairResult(0, "", pairUnknown).ok, false, "pair unknown response");
    assert.strictEqual(wc.classifyPairResult(0, "", pairBadParse).ok, false, "pair parse failure");

    // Connect result classification.
    const connectSuccess = "connected to 192.168.1.20:5555";
    const connectAlready = "already connected to 192.168.1.20:5555";
    const connectFail = "failed to connect to '127.0.0.1:44444': Connection refused";
    const connectNoDev = "error: no such device '127.0.0.1:44444'";

    assert.strictEqual(wc.classifyConnectResult(0, connectSuccess, "").ok, true, "connect success");
    assert.strictEqual(wc.classifyConnectResult(0, connectAlready, "").ok, true, "connect already");
    assert.strictEqual(wc.classifyConnectResult(0, connectFail, "").ok, false, "connect failure text");
    assert.strictEqual(wc.classifyConnectResult(1, "", connectNoDev).ok, false, "connect no device");
    assert.strictEqual(wc.classifyConnectResult(0, connectSuccess, connectFail).ok, false,
        "connect failure overrides success");

    console.log("All WirelessCommand fixtures passed.");
}

run();
