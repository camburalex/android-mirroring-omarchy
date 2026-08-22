// ScrcpyCommand.js — build the exact argv for a tracked scrcpy process.
//
// This is plain JavaScript so it can be imported by both QML
// (`import "ScrcpyCommand.js" as ScrcpyCommand`) and a Node test harness
// (`require`).

// Reject framing that cannot safely be a single argv element: NUL, control
// characters, and whitespace. Network-style serials like 192.168.1.10:5555
// remain valid because ':', '.', and digits are ordinary printable bytes.
// Shell metacharacters are not rejected; they are safe as long as the value
// stays in one argv entry and is never interpreted by a shell.
var INVALID_SERIAL = /[\x00-\x20\x7F]/;

function isValidSerial(serial) {
    if (typeof serial !== "string") return false;
    if (serial.length === 0) return false;
    return !INVALID_SERIAL.test(serial);
}

function buildCommand(serial) {
    if (!isValidSerial(serial)) {
        throw new Error("Invalid or unsafe scrcpy serial");
    }

    return {
        program: "scrcpy",
        argv: ["scrcpy", "-s", serial]
    };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        isValidSerial: isValidSerial,
        buildCommand: buildCommand
    };
}
