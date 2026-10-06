// QrPairing.js — credentials, QR payload, and mDNS service matching for the
// Android 11+ "Pair device with QR code" Wireless Debugging workflow.
//
// The computer shows a QR code carrying a one-time service name and password.
// The phone scans it and advertises an `_adb-tls-pairing._tcp` mDNS service
// under that name; the computer then runs `adb pair` against the advertised
// endpoint with the password. After pairing, the phone's main endpoint is
// taken from its `_adb-tls-connect._tcp` service.
//
// The android-tools `adb` build on the verified Omarchy target has no mDNS
// support, so discovery uses `avahi-browse`. The QR matrix comes from
// `qrencode`, which receives the payload on stdin: the password is a
// transient credential and must never be placed in a process argument.
//
// This is plain JavaScript so it can be imported by both QML
// (`import "QrPairing.js" as QrPairing`) and a Node test harness (`require`).

var PAIRING_SERVICE_TYPE = "_adb-tls-pairing._tcp";
var CONNECT_SERVICE_TYPE = "_adb-tls-connect._tcp";

var SERVICE_NAME_PREFIX = "omarchy-";
var NAME_HEX_LENGTH = 6;
var PASSWORD_HEX_LENGTH = 24;
var RANDOM_BYTES = (NAME_HEX_LENGTH + PASSWORD_HEX_LENGTH) / 2;

// Production deadlines (milliseconds).
var PREPARE_TIMEOUT_MS = 5000;
var SCAN_TIMEOUT_MS = 180000;
var LOCATE_TIMEOUT_MS = 20000;
var KILL_GRACE_MS = 1500;

// Longest avahi-browse record that is still parsed. Real records are a few
// hundred characters; anything longer is dropped unparsed.
var MAX_LINE_CODE_UNITS = 2048;

// Total avahi-browse output accepted for one discovery run. The records come
// from the local network, so a peer can influence their number; a legitimate
// run is a few kilobytes. Exceeding this ends the session.
var MAX_BROWSE_CODE_UNITS = 262144;

// Largest QR matrix (modules per side, quiet zone included) the panel will
// render. The pairing payload produces 41; this bounds the number of items
// the UI creates if qrencode ever returns something else.
var MAX_QR_MODULES = 64;

// Quiet zone, in modules, that qrencode bakes into the matrix. 4 is the spec
// value; the finder-pattern positions below are derived from it.
var QR_MARGIN = 4;
var FINDER_SIZE = 7;

// The panel draws the code in the theme's own two colours when they are far
// enough apart for a phone camera; below this WCAG contrast ratio it falls
// back to near-black on white.
var MIN_QR_CONTRAST = 7;
var FALLBACK_DARK = { r: 17 / 255, g: 17 / 255, b: 17 / 255 };
var FALLBACK_LIGHT = { r: 1, g: 1, b: 1 };

var SERVICE_NAME_PATTERN = /^omarchy-[0-9a-f]{6}$/;
var PASSWORD_PATTERN = /^[0-9a-f]{24}$/;
var RANDOM_HEX_PATTERN = /^[0-9a-f]+$/;
var IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
var PORT_PATTERN = /^[0-9]{1,5}$/;
var QR_ROW_PATTERN = /^[ #]+$/;

// Build the argv that reads the session randomness from the kernel CSPRNG as
// lowercase hex.
function buildRandomCommand() {
    return {
        program: "od",
        argv: ["od", "-An", "-N" + RANDOM_BYTES, "-tx1", "/dev/urandom"]
    };
}

// Normalize `od` output to one hex string. Returns "" unless it is exactly the
// requested number of random bytes.
function parseRandomHex(text) {
    var hex = String(text || "").replace(/\s+/g, "");
    if (hex.length !== RANDOM_BYTES * 2) return "";
    if (!RANDOM_HEX_PATTERN.test(hex)) return "";
    return hex;
}

function isValidServiceName(name) {
    return typeof name === "string" && SERVICE_NAME_PATTERN.test(name);
}

function isValidPassword(password) {
    return typeof password === "string" && PASSWORD_PATTERN.test(password);
}

// Split the random hex into the one-time service name and password.
function createCredentials(randomHex) {
    var hex = parseRandomHex(randomHex);
    if (hex === "") return { ok: false, serviceName: "", password: "" };
    return {
        ok: true,
        serviceName: SERVICE_NAME_PREFIX + hex.substring(0, NAME_HEX_LENGTH),
        password: hex.substring(NAME_HEX_LENGTH)
    };
}

// The payload Android's "Pair device with QR code" scanner expects. Both
// values are restricted to characters that need no WIFI-URI escaping.
function buildQrPayload(serviceName, password) {
    if (!isValidServiceName(serviceName) || !isValidPassword(password)) {
        throw new Error("Invalid QR pairing credentials");
    }
    return "WIFI:T:ADB;S:" + serviceName + ";P:" + password + ";;";
}

// Build the qrencode argv. The payload is intentionally omitted; the caller
// writes it to the Process stdin and then closes stdin. Margin 4 is the spec
// quiet zone.
function buildQrencodeCommand() {
    return {
        program: "qrencode",
        argv: ["qrencode", "--type", "ASCII", "--level", "M", "--margin", String(QR_MARGIN), "--output", "-"]
    };
}

// Parse `qrencode --type ASCII` output, which uses two characters per module,
// into a square matrix of "0"/"1" row strings. A malformed matrix returns
// empty rather than rendering a code that cannot scan.
function parseQrMatrix(ascii) {
    var empty = { rows: [], size: 0 };
    var lines = String(ascii || "").replace(/\r\n/g, "\n").split("\n");
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (lines.length < 21 || lines.length > MAX_QR_MODULES) return empty;

    var width = lines[0].length;
    if (width !== lines.length * 2) return empty;

    var rows = [];
    var dark = 0;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.length !== width || !QR_ROW_PATTERN.test(line)) return empty;
        var row = "";
        for (var c = 0; c < width; c += 2) {
            var pair = line.substring(c, c + 2);
            if (pair === "##") { row += "1"; dark++; }
            else if (pair === "  ") row += "0";
            else return empty;
        }
        rows.push(row);
    }
    if (dark === 0) return empty;

    return { rows: rows, size: rows.length };
}

// Top-left module of each of the three finder patterns ("eyes") in a matrix
// of `size` modules that includes the quiet zone. The panel draws these as
// rounded shapes instead of module by module.
function finderOrigins(size) {
    if (typeof size !== "number" || size < 21 + 2 * QR_MARGIN) return [];
    var far = size - QR_MARGIN - FINDER_SIZE;
    return [
        { row: QR_MARGIN, col: QR_MARGIN },
        { row: QR_MARGIN, col: far },
        { row: far, col: QR_MARGIN }
    ];
}

// True when the module belongs to a finder pattern and is therefore not drawn
// as an individual dot.
function isFinderModule(row, col, size) {
    var origins = finderOrigins(size);
    for (var i = 0; i < origins.length; i++) {
        if (row >= origins[i].row && row < origins[i].row + FINDER_SIZE
            && col >= origins[i].col && col < origins[i].col + FINDER_SIZE) {
            return true;
        }
    }
    return false;
}

function _channel(value) {
    var v = Number(value);
    if (isNaN(v)) return 0;
    return Math.min(1, Math.max(0, v));
}

// WCAG relative luminance of a colour with r/g/b components in 0..1.
function relativeLuminance(color) {
    function linear(c) {
        c = _channel(c);
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    if (!color) return 0;
    return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

function contrastRatio(a, b) {
    var la = relativeLuminance(a);
    var lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Choose the two colours for the code from the theme's foreground and
// background. The darker one always becomes the dots and the lighter one the
// backdrop, on light and dark themes alike: scanners are only guaranteed to
// read dark-on-light codes, so the polarity is never inverted. Any
// transparency in the theme colours is ignored.
function pickQrPalette(foreground, background) {
    if (!foreground || !background || contrastRatio(foreground, background) < MIN_QR_CONTRAST) {
        return { dark: FALLBACK_DARK, light: FALLBACK_LIGHT, themed: false };
    }
    var fgIsDark = relativeLuminance(foreground) < relativeLuminance(background);
    var dark = fgIsDark ? foreground : background;
    var light = fgIsDark ? background : foreground;
    return {
        dark: { r: _channel(dark.r), g: _channel(dark.g), b: _channel(dark.b) },
        light: { r: _channel(light.r), g: _channel(light.g), b: _channel(light.b) },
        themed: true
    };
}

// Build the long-running avahi-browse argv for one of the two ADB service
// types. Parsable output is one `;`-separated record per line.
function buildBrowseCommand(serviceType) {
    if (serviceType !== PAIRING_SERVICE_TYPE && serviceType !== CONNECT_SERVICE_TYPE) {
        throw new Error("Unsupported mDNS service type");
    }
    return {
        program: "avahi-browse",
        argv: ["avahi-browse", "--resolve", "--parsable", "--no-db-lookup", serviceType]
    };
}

// Undo avahi's parsable-mode label escaping: `\DDD` is a decimal byte and
// `\X` is the literal character X.
function unescapeLabel(label) {
    return String(label || "").replace(/\\(\d{3}|[\s\S])/g, function(match, body) {
        if (body.length === 3) return String.fromCharCode(parseInt(body, 10) & 0xFF);
        return body;
    });
}

// Parse one avahi-browse parsable record. Only resolved (`=`) records carry
// an address and port; everything else returns null.
//
//   =;IFACE;PROTOCOL;NAME;TYPE;DOMAIN;HOSTNAME;ADDRESS;PORT;TXT
function parseBrowseLine(line) {
    if (typeof line !== "string") return null;
    if (line.length === 0 || line.length > MAX_LINE_CODE_UNITS) return null;
    if (line.charAt(0) !== "=") return null;

    var fields = line.split(";");
    if (fields.length < 9) return null;
    if (!PORT_PATTERN.test(fields[8])) return null;

    var port = parseInt(fields[8], 10);
    if (isNaN(port) || port < 1 || port > 65535) return null;

    return {
        iface: fields[1],
        protocol: fields[2],
        name: unescapeLabel(fields[3]),
        type: fields[4],
        domain: fields[5],
        hostname: fields[6],
        address: fields[7],
        port: port
    };
}

// Wireless endpoints in this plugin are IPv4 `HOST:PORT` strings. Loopback is
// rejected: a phone is never reachable there.
function isUsableIpv4(address) {
    var match = IPV4_PATTERN.exec(String(address || ""));
    if (!match) return false;
    for (var i = 1; i <= 4; i++) {
        if (parseInt(match[i], 10) > 255) return false;
    }
    var first = parseInt(match[1], 10);
    return first !== 0 && first !== 127;
}

function _endpoint(record) {
    return record.address + ":" + record.port;
}

// Return the `HOST:PORT` pairing endpoint when the record is the pairing
// service the phone advertised for this session's QR code, otherwise "".
function matchPairingService(record, serviceName) {
    if (!record || !isValidServiceName(serviceName)) return "";
    if (record.type !== PAIRING_SERVICE_TYPE) return "";
    if (record.name !== serviceName) return "";
    if (!isUsableIpv4(record.address)) return "";
    return _endpoint(record);
}

// Return the `HOST:PORT` connection endpoint when the record is the main
// Wireless Debugging service of the phone that was just paired, otherwise "".
function matchConnectService(record, pairedHost) {
    if (!record || !isUsableIpv4(pairedHost)) return "";
    if (record.type !== CONNECT_SERVICE_TYPE) return "";
    if (record.address !== pairedHost) return "";
    return _endpoint(record);
}

// Host part of an IPv4 `HOST:PORT` endpoint, or "".
function endpointHost(endpoint) {
    var text = String(endpoint || "");
    var colon = text.lastIndexOf(":");
    if (colon <= 0) return "";
    var host = text.substring(0, colon);
    return isUsableIpv4(host) ? host : "";
}

// Bounded line assembly for a long-running chunked stream. The retained
// partial line never exceeds MAX_LINE_CODE_UNITS; an over-long line is dropped
// up to its terminating newline. `seen` counts every code unit received so the
// caller can enforce MAX_BROWSE_CODE_UNITS on the stream as a whole.
function createLineBuffer() {
    return { partial: "", skipping: false, seen: 0 };
}

// True once the stream has delivered more than the whole-run budget.
function isOverBudget(buffer) {
    return !!(buffer && buffer.seen > MAX_BROWSE_CODE_UNITS);
}

// Append one chunk and return the complete lines it finished.
function pushChunk(buffer, data) {
    var lines = [];
    var text = String(data || "");
    var start = 0;

    buffer.seen += text.length;

    while (start < text.length) {
        var newline = text.indexOf("\n", start);
        var end = newline < 0 ? text.length : newline;
        var piece = text.substring(start, end);

        if (!buffer.skipping) {
            if (buffer.partial.length + piece.length > MAX_LINE_CODE_UNITS) {
                buffer.partial = "";
                buffer.skipping = true;
            } else {
                buffer.partial += piece;
            }
        }

        if (newline < 0) break;

        if (!buffer.skipping && buffer.partial.length > 0) {
            lines.push(buffer.partial.replace(/\r$/, ""));
        }
        buffer.partial = "";
        buffer.skipping = false;
        start = newline + 1;
    }

    return lines;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        PAIRING_SERVICE_TYPE: PAIRING_SERVICE_TYPE,
        CONNECT_SERVICE_TYPE: CONNECT_SERVICE_TYPE,
        SERVICE_NAME_PREFIX: SERVICE_NAME_PREFIX,
        RANDOM_BYTES: RANDOM_BYTES,
        PREPARE_TIMEOUT_MS: PREPARE_TIMEOUT_MS,
        SCAN_TIMEOUT_MS: SCAN_TIMEOUT_MS,
        LOCATE_TIMEOUT_MS: LOCATE_TIMEOUT_MS,
        KILL_GRACE_MS: KILL_GRACE_MS,
        MAX_LINE_CODE_UNITS: MAX_LINE_CODE_UNITS,
        MAX_BROWSE_CODE_UNITS: MAX_BROWSE_CODE_UNITS,
        MAX_QR_MODULES: MAX_QR_MODULES,
        QR_MARGIN: QR_MARGIN,
        FINDER_SIZE: FINDER_SIZE,
        MIN_QR_CONTRAST: MIN_QR_CONTRAST,
        finderOrigins: finderOrigins,
        isFinderModule: isFinderModule,
        relativeLuminance: relativeLuminance,
        contrastRatio: contrastRatio,
        pickQrPalette: pickQrPalette,
        buildRandomCommand: buildRandomCommand,
        parseRandomHex: parseRandomHex,
        isValidServiceName: isValidServiceName,
        isValidPassword: isValidPassword,
        createCredentials: createCredentials,
        buildQrPayload: buildQrPayload,
        buildQrencodeCommand: buildQrencodeCommand,
        parseQrMatrix: parseQrMatrix,
        buildBrowseCommand: buildBrowseCommand,
        unescapeLabel: unescapeLabel,
        parseBrowseLine: parseBrowseLine,
        isUsableIpv4: isUsableIpv4,
        matchPairingService: matchPairingService,
        matchConnectService: matchConnectService,
        endpointHost: endpointHost,
        createLineBuffer: createLineBuffer,
        isOverBudget: isOverBudget,
        pushChunk: pushChunk
    };
}
