// ScrcpyDiagnostics.js — bounded rolling capture for scrcpy stderr diagnostics.
//
// Quickshell's SplitParser with splitMarker: "" passes raw chunks rather than
// delimiter-framed records. This helper assembles and retains only the most
// recent useful diagnostic text, capping both the per-record size and the
// rolling history so a compromised device or scrcpy instance cannot grow the
// plugin's retained memory without bound.
//
// The retained aggregate is bounded to 32 lines and 4096 UTF-16 code units
// (with a 2048-unit tail on overflow). A partial line in flight is held in a
// small pending buffer capped at 1024 code units before it is forced to a
// truncated record. A single record is capped at 2048 code units.
//
// Like BoundedOutput.js, this is plain JavaScript so it can be used from QML
// (`import "ScrcpyDiagnostics.js" as ScrcpyDiagnostics`) and from a Node test
// harness (`require`).

var MAX_RETAINED_LINES = 32;
var MAX_RETAINED_CODE_UNITS = 4096;
var MAX_RETAINED_TAIL = 2048;
var MAX_PENDING_CODE_UNITS = 1024;
var MAX_RECORD_CODE_UNITS = 2048;

function create() {
    return {
        buffer: "",
        pending: ""
    };
}

function reset(capture) {
    if (!capture) return create();
    capture.buffer = "";
    capture.pending = "";
    return capture;
}

// Append one raw chunk from the scrcpy stderr stream. Newline characters
// (`\r\n`, `\n`, `\r`) are treated as record separators. Any unterminated run
// is held in `pending` until a line ending arrives, but is forced to a bounded
// record if it exceeds MAX_PENDING_CODE_UNITS.
function append(capture, data) {
    if (!capture) return;

    var chunk = String(data || "");
    if (chunk.length === 0) return;

    var s = capture.pending + chunk;
    capture.pending = "";

    var start = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        if (c === "\n" || c === "\r") {
            var line = s.substring(start, i);
            if (c === "\r" && i + 1 < s.length && s.charAt(i + 1) === "\n") {
                i++; // skip the \n of a \r\n sequence
            }
            _appendLine(capture, line);
            start = i + 1;
        }
    }

    var tail = s.substring(start);
    if (tail.length > MAX_PENDING_CODE_UNITS) {
        _appendLine(capture, tail.substring(0, MAX_RECORD_CODE_UNITS));
        tail = "";
    }
    capture.pending = tail;
}

function _appendLine(capture, line) {
    if (!line || line.length === 0) return;

    var record = line;
    if (record.length > MAX_RECORD_CODE_UNITS) {
        record = record.substring(0, MAX_RECORD_CODE_UNITS);
    }

    var current = capture.buffer;
    if (current.length > 0) current += "\n";
    current += record;

    var lines = current.split("\n");
    if (lines.length > MAX_RETAINED_LINES) {
        current = lines.slice(lines.length - MAX_RETAINED_LINES).join("\n");
    }
    if (current.length > MAX_RETAINED_CODE_UNITS) {
        current = current.substring(current.length - MAX_RETAINED_TAIL);
    }

    capture.buffer = current;
}

function value(capture) {
    return capture ? capture.buffer : "";
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        MAX_RETAINED_LINES: MAX_RETAINED_LINES,
        MAX_RETAINED_CODE_UNITS: MAX_RETAINED_CODE_UNITS,
        MAX_RETAINED_TAIL: MAX_RETAINED_TAIL,
        MAX_PENDING_CODE_UNITS: MAX_PENDING_CODE_UNITS,
        MAX_RECORD_CODE_UNITS: MAX_RECORD_CODE_UNITS,
        create: create,
        reset: reset,
        append: append,
        value: value
    };
}
