const assert = require("assert");
const qr = require("../qml/QrPairing.js");
const wc = require("../qml/WirelessCommand.js");

const RANDOM_HEX = "0a1b2c3d4e5f60718293a4b5c6d7e8";
const SERVICE_NAME = "omarchy-0a1b2c";
const PASSWORD = "3d4e5f60718293a4b5c6d7e8";

function assertNoShell(argv) {
    for (const arg of argv) {
        assert.strictEqual(["sh", "bash", "/bin/sh", "/bin/bash"].includes(arg), false,
            `no shell executable in argv: ${arg}`);
    }
}

function assertSecretNotInArgv(argv, secret) {
    for (const arg of argv) {
        assert.strictEqual(arg.indexOf(secret) < 0, true,
            `QR pairing secret must not appear in argv element: ${arg}`);
    }
}

function resolved(name, type, address, port) {
    return ["=", "wlan0", "IPv4", name, type, "local", "phone.local", address, String(port), ""].join(";");
}

// A syntactically valid `qrencode --type ASCII` matrix of `size` modules.
function asciiMatrix(size) {
    const lines = [];
    for (let r = 0; r < size; r++) {
        let line = "";
        for (let c = 0; c < size; c++) line += (r + c) % 2 === 0 ? "##" : "  ";
        lines.push(line);
    }
    return lines.join("\n") + "\n";
}

function run() {
    // Random source: direct argv, kernel CSPRNG, exactly the bytes needed.
    const randomCmd = qr.buildRandomCommand();
    assert.strictEqual(randomCmd.program, "od", "random program");
    assert.deepStrictEqual(randomCmd.argv, ["od", "-An", "-N15", "-tx1", "/dev/urandom"], "random argv");
    assertNoShell(randomCmd.argv);
    assert.strictEqual(qr.RANDOM_BYTES, 15, "random byte count");

    // Random hex parsing accepts od's spaced output and rejects anything else.
    assert.strictEqual(
        qr.parseRandomHex(" 0a 1b 2c 3d 4e 5f 60 71 82 93 a4 b5 c6 d7 e8\n"), RANDOM_HEX, "od output");
    assert.strictEqual(qr.parseRandomHex(RANDOM_HEX), RANDOM_HEX, "plain hex");
    assert.strictEqual(qr.parseRandomHex(""), "", "empty");
    assert.strictEqual(qr.parseRandomHex(RANDOM_HEX.substring(2)), "", "too short");
    assert.strictEqual(qr.parseRandomHex(RANDOM_HEX + "00"), "", "too long");
    assert.strictEqual(qr.parseRandomHex(RANDOM_HEX.replace("0a", "zz")), "", "non-hex");
    assert.strictEqual(qr.parseRandomHex(RANDOM_HEX.toUpperCase()), "", "uppercase is not od output");

    // Credentials.
    const creds = qr.createCredentials(RANDOM_HEX);
    assert.deepStrictEqual(creds, { ok: true, serviceName: SERVICE_NAME, password: PASSWORD }, "credentials");
    assert.strictEqual(qr.createCredentials("").ok, false, "no credentials without randomness");
    assert.strictEqual(qr.createCredentials("").password, "", "failed credentials carry no password");
    assert.strictEqual(qr.isValidServiceName(SERVICE_NAME), true, "valid service name");
    assert.strictEqual(qr.isValidServiceName("omarchy-0a1b2"), false, "short service name");
    assert.strictEqual(qr.isValidServiceName("studio-0a1b2c"), false, "foreign prefix");
    assert.strictEqual(qr.isValidServiceName("omarchy-0a1b2c;"), false, "service name with delimiter");
    assert.strictEqual(qr.isValidPassword(PASSWORD), true, "valid password");
    assert.strictEqual(qr.isValidPassword(PASSWORD + "\n"), false, "password with newline");
    assert.strictEqual(qr.isValidPassword(PASSWORD.substring(1)), false, "short password");
    assert.strictEqual(qr.isValidPassword(123456), false, "non-string password");

    // The generated password is acceptable to the ADB stdin writer.
    assert.strictEqual(wc.isValidPairingPassword(creds.password), true,
        "generated password passes WirelessCommand validation");

    // QR payload: the exact Android "Pair device with QR code" format.
    assert.strictEqual(qr.buildQrPayload(SERVICE_NAME, PASSWORD),
        "WIFI:T:ADB;S:omarchy-0a1b2c;P:3d4e5f60718293a4b5c6d7e8;;", "QR payload");
    assert.throws(() => qr.buildQrPayload("omarchy-0a1b2c;P:x", PASSWORD), "payload rejects injected field");
    assert.throws(() => qr.buildQrPayload(SERVICE_NAME, "pass;word"), "payload rejects unsafe password");
    assert.throws(() => qr.buildQrPayload("", ""), "payload rejects empty credentials");

    // qrencode command: payload and password are never argv elements.
    const qrCmd = qr.buildQrencodeCommand();
    assert.strictEqual(qrCmd.program, "qrencode", "qrencode program");
    assert.deepStrictEqual(qrCmd.argv,
        ["qrencode", "--type", "ASCII", "--level", "M", "--margin", "4", "--output", "-"], "qrencode argv");
    assertNoShell(qrCmd.argv);
    assertSecretNotInArgv(qrCmd.argv, PASSWORD);
    assertSecretNotInArgv(qrCmd.argv, "WIFI:");

    // QR matrix parsing.
    const matrix = qr.parseQrMatrix(asciiMatrix(41));
    assert.strictEqual(matrix.size, 41, "matrix size");
    assert.strictEqual(matrix.rows.length, 41, "matrix row count");
    assert.strictEqual(matrix.rows[0].length, 41, "matrix row width");
    assert.strictEqual(matrix.rows[0].substring(0, 4), "1010", "matrix modules");
    assert.strictEqual(matrix.rows[1].substring(0, 4), "0101", "matrix modules row 2");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(41).replace(/\n/g, "\r\n")).size, 41, "CRLF matrix");
    assert.strictEqual(qr.parseQrMatrix("").size, 0, "empty output");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(8)).size, 0, "too small to be a QR code");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(qr.MAX_QR_MODULES)).size, qr.MAX_QR_MODULES, "largest rendered matrix");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(qr.MAX_QR_MODULES + 1)).size, 0, "matrix above the item limit");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(41) + asciiMatrix(1)).size, 0, "non-square matrix");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(41).replace("##", "#x")).size, 0, "unexpected character");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(41).replace("##", "# ")).size, 0, "split module pair");
    assert.strictEqual(qr.parseQrMatrix(asciiMatrix(41).replace(/#/g, " ")).size, 0, "blank matrix");
    assert.strictEqual(qr.parseQrMatrix("qrencode: command not found").size, 0, "error text");

    // Finder patterns: three 7x7 corners inside the quiet zone.
    assert.deepStrictEqual(qr.finderOrigins(41),
        [{ row: 4, col: 4 }, { row: 4, col: 30 }, { row: 30, col: 4 }], "finder origins for the pairing code");
    assert.deepStrictEqual(qr.finderOrigins(0), [], "no finders without a matrix");
    assert.deepStrictEqual(qr.finderOrigins(20), [], "no finders in an impossible matrix");
    assert.strictEqual(qr.isFinderModule(4, 4, 41), true, "top-left finder corner");
    assert.strictEqual(qr.isFinderModule(10, 10, 41), true, "top-left finder far corner");
    assert.strictEqual(qr.isFinderModule(11, 10, 41), false, "separator below the finder is a normal module");
    assert.strictEqual(qr.isFinderModule(3, 4, 41), false, "quiet zone");
    assert.strictEqual(qr.isFinderModule(4, 36, 41), true, "top-right finder");
    assert.strictEqual(qr.isFinderModule(36, 4, 41), true, "bottom-left finder");
    assert.strictEqual(qr.isFinderModule(36, 36, 41), false, "no finder bottom-right");
    assert.strictEqual(qr.isFinderModule(20, 20, 41), false, "data area");
    let finderModules = 0;
    for (let r = 0; r < 41; r++) for (let c = 0; c < 41; c++) if (qr.isFinderModule(r, c, 41)) finderModules++;
    assert.strictEqual(finderModules, 3 * 49, "exactly three 7x7 finder areas");
    assert.strictEqual(qrCmd.argv[qrCmd.argv.indexOf("--margin") + 1], String(qr.QR_MARGIN),
        "finder geometry and qrencode share one quiet-zone value");

    // Palette: theme colours, but never an inverted (light-on-dark) code.
    const hex = (h) => ({ r: parseInt(h.substr(1, 2), 16) / 255, g: parseInt(h.substr(3, 2), 16) / 255, b: parseInt(h.substr(5, 2), 16) / 255 });
    const white = hex("#ffffff"), black = hex("#000000");
    assert.ok(Math.abs(qr.contrastRatio(white, black) - 21) < 0.01, "black on white is 21:1");
    assert.ok(Math.abs(qr.contrastRatio(white, white) - 1) < 0.01, "identical colours are 1:1");
    const darkTheme = qr.pickQrPalette(hex("#cacccc"), hex("#101315"));
    assert.strictEqual(darkTheme.themed, true, "dark theme uses theme colours");
    assert.deepStrictEqual(darkTheme.dark, hex("#101315"), "dark theme: background colour becomes the dots");
    assert.deepStrictEqual(darkTheme.light, hex("#cacccc"), "dark theme: foreground colour becomes the backdrop");
    const lightTheme = qr.pickQrPalette(hex("#1c2027"), hex("#f4f1ea"));
    assert.strictEqual(lightTheme.themed, true, "light theme uses theme colours");
    assert.deepStrictEqual(lightTheme.dark, hex("#1c2027"), "light theme: foreground colour becomes the dots");
    assert.deepStrictEqual(lightTheme.light, hex("#f4f1ea"), "light theme: background colour becomes the backdrop");
    for (const p of [darkTheme, lightTheme]) {
        assert.ok(qr.relativeLuminance(p.dark) < qr.relativeLuminance(p.light), "dots are always darker than the backdrop");
    }
    const lowContrast = qr.pickQrPalette(hex("#808080"), hex("#606060"));
    assert.strictEqual(lowContrast.themed, false, "low-contrast theme falls back");
    assert.ok(qr.contrastRatio(lowContrast.dark, lowContrast.light) > 15, "fallback is near-black on white");
    assert.strictEqual(qr.pickQrPalette(null, hex("#101315")).themed, false, "missing colour falls back");
    assert.strictEqual(qr.pickQrPalette(undefined, undefined).themed, false, "no colours fall back");
    const clamped = qr.pickQrPalette({ r: "x", g: 2, b: -1 }, hex("#101315"));
    assert.deepStrictEqual(clamped.light, { r: 0, g: 1, b: 0 }, "malformed channels are clamped into range");
    assert.ok(qr.relativeLuminance(clamped.dark) < qr.relativeLuminance(clamped.light), "clamped palette keeps polarity");

    // Browse command: only the two ADB service types, direct argv.
    const pairBrowse = qr.buildBrowseCommand(qr.PAIRING_SERVICE_TYPE);
    assert.strictEqual(pairBrowse.program, "avahi-browse", "browse program");
    assert.deepStrictEqual(pairBrowse.argv,
        ["avahi-browse", "--resolve", "--parsable", "--no-db-lookup", "_adb-tls-pairing._tcp"], "pair browse argv");
    assert.deepStrictEqual(qr.buildBrowseCommand(qr.CONNECT_SERVICE_TYPE).argv,
        ["avahi-browse", "--resolve", "--parsable", "--no-db-lookup", "_adb-tls-connect._tcp"], "connect browse argv");
    assertNoShell(pairBrowse.argv);
    assert.throws(() => qr.buildBrowseCommand("_http._tcp"), "browse rejects other service types");
    assert.throws(() => qr.buildBrowseCommand("--all"), "browse rejects option injection");

    // Label unescaping, as produced by avahi-browse --parsable.
    assert.strictEqual(qr.unescapeLabel("omarchy-Te\\032st\\0591"), "omarchy-Te st;1", "decimal escapes");
    assert.strictEqual(qr.unescapeLabel("a\\.b\\\\c"), "a.b\\c", "character escapes");
    assert.strictEqual(qr.unescapeLabel("plain-name"), "plain-name", "plain label");

    // Browse record parsing.
    const record = qr.parseBrowseLine(resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "192.168.1.20", 37123));
    assert.strictEqual(record.name, SERVICE_NAME, "record name");
    assert.strictEqual(record.type, "_adb-tls-pairing._tcp", "record type");
    assert.strictEqual(record.address, "192.168.1.20", "record address");
    assert.strictEqual(record.port, 37123, "record port");
    assert.strictEqual(record.protocol, "IPv4", "record protocol");
    assert.strictEqual(qr.parseBrowseLine("+;wlan0;IPv4;" + SERVICE_NAME + ";_adb-tls-pairing._tcp;local"), null,
        "new-service record is not resolved");
    assert.strictEqual(qr.parseBrowseLine("-;wlan0;IPv4;" + SERVICE_NAME + ";_adb-tls-pairing._tcp;local"), null,
        "removed-service record is ignored");
    assert.strictEqual(qr.parseBrowseLine("=;wlan0;IPv4;name;type;local;host"), null, "truncated record");
    assert.strictEqual(qr.parseBrowseLine(resolved("n", qr.PAIRING_SERVICE_TYPE, "192.168.1.20", "0")), null, "port 0");
    assert.strictEqual(qr.parseBrowseLine(resolved("n", qr.PAIRING_SERVICE_TYPE, "192.168.1.20", "65536")), null, "port too large");
    assert.strictEqual(qr.parseBrowseLine(resolved("n", qr.PAIRING_SERVICE_TYPE, "192.168.1.20", "37x")), null, "non-numeric port");
    assert.strictEqual(qr.parseBrowseLine(""), null, "empty line");
    assert.strictEqual(qr.parseBrowseLine(null), null, "non-string line");
    assert.strictEqual(qr.parseBrowseLine("Failed to create client object: Daemon not running"), null, "error text");
    assert.strictEqual(
        qr.parseBrowseLine(resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "192.168.1.20", 37123)
            + "x".repeat(qr.MAX_LINE_CODE_UNITS)), null, "over-long record");
    // A TXT field may contain the separator; the leading fields still parse.
    assert.strictEqual(
        qr.parseBrowseLine(resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "192.168.1.20", 37123) + "\"a;b\" \"c\"").port,
        37123, "TXT with separator");

    // IPv4 usability.
    assert.strictEqual(qr.isUsableIpv4("192.168.1.20"), true, "LAN address");
    assert.strictEqual(qr.isUsableIpv4("10.0.0.7"), true, "private address");
    assert.strictEqual(qr.isUsableIpv4("127.0.0.1"), false, "loopback");
    assert.strictEqual(qr.isUsableIpv4("0.0.0.0"), false, "unspecified");
    assert.strictEqual(qr.isUsableIpv4("256.1.1.1"), false, "octet out of range");
    assert.strictEqual(qr.isUsableIpv4("192.168.1"), false, "short address");
    assert.strictEqual(qr.isUsableIpv4("fe80::1234"), false, "IPv6");
    assert.strictEqual(qr.isUsableIpv4("192.168.1.20 "), false, "trailing space");
    assert.strictEqual(qr.isUsableIpv4("192.168.1.20:5555"), false, "address with port");

    // Pairing service matching.
    const pairingRecord = qr.parseBrowseLine(resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "192.168.1.20", 37123));
    assert.strictEqual(qr.matchPairingService(pairingRecord, SERVICE_NAME), "192.168.1.20:37123", "pairing match");
    assert.strictEqual(wc.validateEndpoint(qr.matchPairingService(pairingRecord, SERVICE_NAME)).ok, true,
        "matched pairing endpoint passes WirelessCommand validation");
    assert.strictEqual(qr.matchPairingService(pairingRecord, "omarchy-ffffff"), "", "another session's service");
    assert.strictEqual(qr.matchPairingService(pairingRecord, ""), "", "no session");
    assert.strictEqual(qr.matchPairingService(null, SERVICE_NAME), "", "no record");
    assert.strictEqual(
        qr.matchPairingService(
            qr.parseBrowseLine(resolved("studio-abcdefgh", qr.PAIRING_SERVICE_TYPE, "192.168.1.20", 37123)),
            SERVICE_NAME),
        "", "foreign pairing service");
    assert.strictEqual(
        qr.matchPairingService(
            qr.parseBrowseLine(resolved(SERVICE_NAME, qr.CONNECT_SERVICE_TYPE, "192.168.1.20", 37123)),
            SERVICE_NAME),
        "", "wrong service type");
    assert.strictEqual(
        qr.matchPairingService(
            qr.parseBrowseLine(resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "fe80::1234", 37123)),
            SERVICE_NAME),
        "", "IPv6 pairing record");
    assert.strictEqual(
        qr.matchPairingService(
            qr.parseBrowseLine(resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "127.0.0.1", 37123)),
            SERVICE_NAME),
        "", "loopback pairing record");
    assert.strictEqual(
        qr.matchPairingService(
            qr.parseBrowseLine(resolved("omarchy-0a1b2c\\032x", qr.PAIRING_SERVICE_TYPE, "192.168.1.20", 37123)),
            SERVICE_NAME),
        "", "name must match exactly");

    // Connect service matching: same phone address only.
    const connectRecord = qr.parseBrowseLine(
        resolved("adb-R58M12345-AbCdEf", qr.CONNECT_SERVICE_TYPE, "192.168.1.20", 40123));
    assert.strictEqual(qr.matchConnectService(connectRecord, "192.168.1.20"), "192.168.1.20:40123", "connect match");
    assert.strictEqual(wc.validateEndpoint(qr.matchConnectService(connectRecord, "192.168.1.20")).ok, true,
        "matched connect endpoint passes WirelessCommand validation");
    assert.strictEqual(qr.matchConnectService(connectRecord, "192.168.1.21"), "", "another phone");
    assert.strictEqual(qr.matchConnectService(connectRecord, ""), "", "no paired host");
    assert.strictEqual(qr.matchConnectService(null, "192.168.1.20"), "", "no record");
    assert.strictEqual(qr.matchConnectService(pairingRecord, "192.168.1.20"), "", "pairing record is not a connect service");

    // Endpoint host.
    assert.strictEqual(qr.endpointHost("192.168.1.20:37123"), "192.168.1.20", "endpoint host");
    assert.strictEqual(qr.endpointHost("192.168.1.20"), "", "endpoint without port");
    assert.strictEqual(qr.endpointHost("[fe80::1]:37123"), "", "IPv6 endpoint");
    assert.strictEqual(qr.endpointHost(""), "", "empty endpoint");

    // Bounded line assembly.
    const buffer = qr.createLineBuffer();
    assert.deepStrictEqual(qr.pushChunk(buffer, "first\nsec"), ["first"], "one complete line");
    assert.deepStrictEqual(qr.pushChunk(buffer, "ond\nthird\n"), ["second", "third"], "line split across chunks");
    assert.deepStrictEqual(qr.pushChunk(buffer, ""), [], "empty chunk");
    assert.deepStrictEqual(qr.pushChunk(buffer, "\n\n"), [], "blank lines are dropped");
    assert.deepStrictEqual(qr.pushChunk(buffer, "crlf\r\n"), ["crlf"], "CRLF line");
    assert.deepStrictEqual(qr.pushChunk(buffer, "pending"), [], "unterminated line is held");
    assert.strictEqual(buffer.partial, "pending", "partial line retained");
    assert.deepStrictEqual(qr.pushChunk(buffer, "\n"), ["pending"], "held line completes");

    // An unterminated flood never grows the retained partial past the cap,
    // is dropped as a whole, and does not corrupt the following line.
    const flood = qr.createLineBuffer();
    for (let i = 0; i < 100; i++) {
        assert.deepStrictEqual(qr.pushChunk(flood, "x".repeat(1000)), [], "flood yields no line");
        assert.ok(flood.partial.length <= qr.MAX_LINE_CODE_UNITS, "partial line stays bounded");
    }
    assert.deepStrictEqual(qr.pushChunk(flood, "tail\nnext\n"), ["next"], "line after a dropped flood");
    assert.deepStrictEqual(
        qr.pushChunk(qr.createLineBuffer(), "y".repeat(qr.MAX_LINE_CODE_UNITS + 1) + "\nok\n"), ["ok"],
        "over-long line inside one chunk");
    assert.deepStrictEqual(
        qr.pushChunk(qr.createLineBuffer(), "z".repeat(qr.MAX_LINE_CODE_UNITS) + "\n").length, 1,
        "line at the cap is kept");

    // Whole-run budget: counts every code unit, including dropped lines, and
    // trips only above the limit. Retained state stays bounded throughout.
    const budget = qr.createLineBuffer();
    assert.strictEqual(qr.isOverBudget(budget), false, "fresh buffer is within budget");
    assert.strictEqual(qr.isOverBudget(null), false, "no buffer is not over budget");
    qr.pushChunk(budget, "a".repeat(qr.MAX_BROWSE_CODE_UNITS));
    assert.strictEqual(budget.seen, qr.MAX_BROWSE_CODE_UNITS, "seen counts dropped data");
    assert.strictEqual(qr.isOverBudget(budget), false, "exactly at budget");
    qr.pushChunk(budget, "\n");
    assert.strictEqual(qr.isOverBudget(budget), true, "one code unit over budget");
    assert.ok(budget.partial.length <= qr.MAX_LINE_CODE_UNITS, "budget buffer retains no flood");
    const chatty = qr.createLineBuffer();
    for (let i = 0; i < 200; i++) qr.pushChunk(chatty, resolved("studio-x" + i, qr.PAIRING_SERVICE_TYPE, "192.168.1.9", 40000) + "\n");
    assert.strictEqual(qr.isOverBudget(chatty), false, "a busy but ordinary network stays within budget");

    // End to end over a realistic avahi-browse stream delivered in odd chunks.
    const stream = [
        "+;wlan0;IPv4;" + SERVICE_NAME + ";_adb-tls-pairing._tcp;local",
        resolved("studio-zzzzzzzz", qr.PAIRING_SERVICE_TYPE, "192.168.1.99", 41000),
        resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "fe80::1234", 37123),
        resolved(SERVICE_NAME, qr.PAIRING_SERVICE_TYPE, "192.168.1.20", 37123)
    ].join("\n") + "\n";
    const streamBuffer = qr.createLineBuffer();
    const found = [];
    for (let i = 0; i < stream.length; i += 7) {
        for (const line of qr.pushChunk(streamBuffer, stream.substring(i, i + 7))) {
            const endpoint = qr.matchPairingService(qr.parseBrowseLine(line), SERVICE_NAME);
            if (endpoint) found.push(endpoint);
        }
    }
    assert.deepStrictEqual(found, ["192.168.1.20:37123"], "only this session's IPv4 pairing endpoint matches");

    console.log("All QrPairing fixtures passed.");
}

run();
