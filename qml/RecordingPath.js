// RecordingPath.js — safe recording directory, filename, and command helpers.
//
// This is plain JavaScript so it can be imported by both QML
// (`import "RecordingPath.js" as RecordingPath`) and a Node test harness
// (`require`).

var RECORDING_DIR_NAME = "Android Mirroring";
var RECORDING_PREFIX = "android-mirroring-";
var RECORDING_SUFFIX = ".mp4";
var TEMPLATE_RANDOM = "XXXXXX";

// Reject NUL, ASCII control characters, and DEL. Spaces (0x20) are intentionally
// allowed because user home directories may contain them and the path must remain
// a single argv element.
var INVALID_PATH_FRAMING = /[\x00-\x1F\x7F]/;

var TRAILING_SLASHES = /\/+$/;
var ABSOLUTE_START = /^\//;

function _padTwo(n) {
    return (n < 10 ? "0" : "") + n;
}

function formatTimestamp(date) {
    if (!date) date = new Date();
    var year = date.getFullYear();
    var month = _padTwo(date.getMonth() + 1);
    var day = _padTwo(date.getDate());
    var hours = _padTwo(date.getHours());
    var minutes = _padTwo(date.getMinutes());
    var seconds = _padTwo(date.getSeconds());
    return year + month + day + "-" + hours + minutes + seconds;
}

function generateTemplate(date) {
    return RECORDING_PREFIX + formatTimestamp(date) + "-" + TEMPLATE_RANDOM;
}

function buildRecordingDirectory(baseDir) {
    if (typeof baseDir !== "string" || baseDir === "") return "";
    var normalized = baseDir.replace(TRAILING_SLASHES, "");
    if (normalized === "") return "";
    return normalized + "/" + RECORDING_DIR_NAME;
}

function buildMkdirCommand(directory) {
    return { program: "mkdir", argv: ["mkdir", "-p", "--", directory] };
}

function buildMktempCommand(directory, date) {
    return {
        program: "mktemp",
        argv: [
            "mktemp",
            "--tmpdir=" + directory,
            "--suffix=" + RECORDING_SUFFIX,
            generateTemplate(date)
        ]
    };
}

function buildRemoveCommand(path) {
    return { program: "rm", argv: ["rm", "--", path] };
}

function isSafeRecordingDirectory(directory) {
    if (typeof directory !== "string" || directory === "") return false;
    if (!ABSOLUTE_START.test(directory)) return false;
    if (INVALID_PATH_FRAMING.test(directory)) return false;
    return true;
}

function isValidRecordingPath(path, expectedDirectory) {
    if (typeof path !== "string" || path === "") return false;
    if (INVALID_PATH_FRAMING.test(path)) return false;
    if (!ABSOLUTE_START.test(path)) return false;
    if (path.indexOf("..") >= 0) return false;
    if (path.lastIndexOf(RECORDING_SUFFIX) !== path.length - RECORDING_SUFFIX.length) {
        return false;
    }

    if (expectedDirectory && typeof expectedDirectory === "string") {
        var normDir = expectedDirectory.replace(TRAILING_SLASHES, "");
        if (normDir === "") return false;
        if (path.indexOf(normDir + "/") !== 0) return false;
    }

    var lastSlash = path.lastIndexOf("/");
    var basename = path.substring(lastSlash + 1);
    if (basename.indexOf("/") >= 0) return false;
    if (basename.indexOf("..") >= 0) return false;
    if (basename.indexOf("\x00") >= 0) return false;

    return true;
}

function validateMktempOutput(text, expectedDirectory) {
    var path = String(text || "").replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
    if (path === "") {
        return { ok: false, error: "Could not create a recording file." };
    }
    if (path.indexOf("\x00") >= 0 || INVALID_PATH_FRAMING.test(path)) {
        return { ok: false, error: "Could not create a recording file." };
    }
    if (!isValidRecordingPath(path, expectedDirectory)) {
        return { ok: false, error: "Could not create a recording file." };
    }
    return { ok: true, path: path };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        RECORDING_DIR_NAME: RECORDING_DIR_NAME,
        RECORDING_PREFIX: RECORDING_PREFIX,
        RECORDING_SUFFIX: RECORDING_SUFFIX,
        TEMPLATE_RANDOM: TEMPLATE_RANDOM,
        formatTimestamp: formatTimestamp,
        generateTemplate: generateTemplate,
        buildRecordingDirectory: buildRecordingDirectory,
        buildMkdirCommand: buildMkdirCommand,
        buildMktempCommand: buildMktempCommand,
        buildRemoveCommand: buildRemoveCommand,
        isSafeRecordingDirectory: isSafeRecordingDirectory,
        isValidRecordingPath: isValidRecordingPath,
        validateMktempOutput: validateMktempOutput
    };
}
