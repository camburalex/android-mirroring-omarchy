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

// Fixed, application-controlled window identity for Hyprland matching.
// Must contain no device/user input and must remain one argv element.
var WINDOW_TITLE = "Android Mirroring";

// Floats the plugin's window by registering the rule in the running Hyprland,
// so users never edit their Hyprland config. The rule lives only in the
// compositor and is dropped on `hyprctl reload`, so it is re-sent every launch.
var WINDOW_RULE_ARGV = [
    "hyprctl",
    "repl",
    'hl.window_rule({ match = { class = "^scrcpy$", initial_title = "^' + WINDOW_TITLE + '$" }, '
        + "float = true, center = true, border_size = 1 })"
];

// Same framing rule as INVALID_SERIAL, but spaces are allowed because a
// recording path may legitimately contain them and will always be one argv
// element, never a shell string.
var INVALID_RECORDING_PATH = /[\x00-\x1F\x7F]/;

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
        screenOff: options.screenOff === true,
        recordingEnabled: options.recordingEnabled === true
    };
}

function _validateRecordingPath(path) {
    if (typeof path !== "string" || path.length === 0) {
        throw new Error("Recording enabled but no recording path provided.");
    }
    if (path.indexOf("\x00") >= 0 || INVALID_RECORDING_PATH.test(path)) {
        throw new Error("Recording path contains unsafe characters.");
    }
    if (path.indexOf("..") >= 0) {
        throw new Error("Recording path must be absolute and cannot contain parent references.");
    }
    if (!path.startsWith("/")) {
        throw new Error("Recording path must be absolute.");
    }
    if (!path.endsWith(".mp4")) {
        throw new Error("Recording path must end with .mp4.");
    }
}

function buildCommand(serial, options, recordingPath) {
    if (!isValidSerial(serial)) {
        throw new Error("Invalid or unsafe scrcpy serial");
    }

    var opts = normalizeOptions(options);
    var preset = PRESETS[opts.preset];
    if (!preset) {
        throw new Error("Invalid preset: " + opts.preset);
    }

    var argv = ["scrcpy", "-s", serial];
    argv.push("--window-title=" + WINDOW_TITLE);
    argv.push("--max-size=" + preset.maxSize);
    argv.push("--video-bit-rate=" + preset.videoBitRate);
    argv.push("--max-fps=" + preset.maxFps);

    if (!opts.audioEnabled) {
        argv.push("--no-audio");
    }
    if (opts.screenOff) {
        argv.push("--turn-screen-off");
    }
    if (opts.recordingEnabled) {
        _validateRecordingPath(recordingPath);
        argv.push("--record=" + recordingPath);
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
        DEFAULT_PRESET: DEFAULT_PRESET,
        WINDOW_TITLE: WINDOW_TITLE,
        WINDOW_RULE_ARGV: WINDOW_RULE_ARGV
    };
}
