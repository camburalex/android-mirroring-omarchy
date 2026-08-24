// BoundedOutput.js — bounded per-stream accumulation for Quickshell Process output.
//
// Quickshell's StdioCollector retains the entire stream in one buffer. For
// plugin-owned ADB processes, that gives a compromised adb server or
// device-controlled response an unbounded allocation path in the persistent
// omarchy-shell. This helper caps the retained text for a single stdout or
// stderr stream to a small constant and reports overflow immediately.
//
// The retained aggregate is capped at 32,768 UTF-16 code units per stream.
// An incoming chunk may itself temporarily exist as a Quickshell QString, but it
// is not retained in the plugin aggregate beyond the configured limit.
//
// This is plain JavaScript so it can be imported by both QML
// (`import "BoundedOutput.js" as BoundedOutput`) and a Node test harness
// (`require`).

// 32,768 UTF-16 code units per retained stream. Legitimate ADB outputs are tiny
// (adb devices -l lines are short; adb pair/connect responses are a handful of
// lines; mktemp prints one path). 32768 leaves generous headroom for many
// attached devices while bounding per-stream retained allocation to a small,
// explicit ceiling.
var MAX_CAPTURE_CODE_UNITS = 32768;

// `capacity` is measured in UTF-16 code units (JavaScript string length).
function create(capacity) {
    if (typeof capacity !== "number" || capacity <= 0 || isNaN(capacity)) {
        capacity = MAX_CAPTURE_CODE_UNITS;
    }
    return {
        buffer: "",
        overflow: false,
        codeUnitsSeen: 0,
        capacity: capacity
    };
}

function reset(capture, capacity) {
    if (!capture) return create(capacity);
    capture.buffer = "";
    capture.overflow = false;
    capture.codeUnitsSeen = 0;
    if (typeof capacity === "number" && capacity > 0 && !isNaN(capacity)) {
        capture.capacity = capacity;
    }
    return capture;
}

// Append one chunk. Returns true while within the cap, false on first overflow.
// The retained aggregate never exceeds the configured capacity (measured in
// UTF-16 code units): only up to the remaining capacity is appended, and
// overflow is set immediately. The chunk itself may be larger than the cap, but
// the caller must not retain it beyond the bounded buffer; that is the
// responsibility of the SplitParser onRead path.
function append(capture, data) {
    if (capture.overflow) return false;

    var s = String(data || "");
    capture.codeUnitsSeen += s.length;

    if (s.length === 0) return true;

    if (capture.buffer.length >= capture.capacity) {
        capture.overflow = true;
        return false;
    }

    var remaining = capture.capacity - capture.buffer.length;
    if (s.length <= remaining) {
        capture.buffer += s;
        return true;
    } else {
        capture.buffer += s.substring(0, remaining);
        capture.overflow = true;
        return false;
    }
}

function isOverflow(capture) {
    return capture && capture.overflow;
}

function value(capture) {
    return capture ? capture.buffer : "";
}

function codeUnitsSeen(capture) {
    return capture ? capture.codeUnitsSeen : 0;
}

function getCapacity(capture) {
    return capture ? capture.capacity : 0;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        MAX_CAPTURE_CODE_UNITS: MAX_CAPTURE_CODE_UNITS,
        create: create,
        reset: reset,
        append: append,
        isOverflow: isOverflow,
        value: value,
        codeUnitsSeen: codeUnitsSeen,
        capacity: getCapacity
    };
}
