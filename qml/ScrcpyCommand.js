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

var PRESETS = {
    performance: { name: "performance", label: "Performance", maxSize: 1024, videoBitRate: "4M", maxFps: 30 },
    balanced: { name: "balanced", label: "Balanced", maxSize: 1600, videoBitRate: "8M", maxFps: 60 },
    quality: { name: "quality", label: "Quality", maxSize: 2560, videoBitRate: "16M", maxFps: 60 }
};

var DEFAULT_PRESET = "balanced";

function isValidSerial(serial) {
    if (typeof serial !== "string") return false;
    if (serial.length === 0) return false;
    return !INVALID_SERIAL.test(serial);
}

function normalizeOptions(options) {
    options = options || {};
    return {
        preset: options.preset || DEFAULT_PRESET,
        audioEnabled: options.audioEnabled !== false,
        screenOff: options.screenOff === true
    };
}

function buildCommand(serial, options) {
    if (!isValidSerial(serial)) {
        throw new Error("Invalid or unsafe scrcpy serial");
    }

    var opts = normalizeOptions(options);
    var preset = PRESETS[opts.preset];
    if (!preset) {
        throw new Error("Invalid preset: " + opts.preset);
    }

    var argv = ["scrcpy", "-s", serial];
    argv.push("--max-size=" + preset.maxSize);
    argv.push("--video-bit-rate=" + preset.videoBitRate);
    argv.push("--max-fps=" + preset.maxFps);

    if (!opts.audioEnabled) {
        argv.push("--no-audio");
    }
    if (opts.screenOff) {
        argv.push("--turn-screen-off");
    }

    return {
        program: "scrcpy",
        argv: argv
    };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        isValidSerial: isValidSerial,
        buildCommand: buildCommand,
        normalizeOptions: normalizeOptions,
        PRESETS: PRESETS,
        DEFAULT_PRESET: DEFAULT_PRESET
    };
}
