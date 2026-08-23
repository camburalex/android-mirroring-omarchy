const assert = require("assert");
const path = require("../qml/RecordingPath.js");

const FAKE_DATE = new Date(2026, 7, 23, 15, 4, 12);
const TEST_DIR = "/home/test/Videos";

function run() {
    // A. Constants.
    assert.strictEqual(path.RECORDING_DIR_NAME, "Android Mirroring");
    assert.strictEqual(path.RECORDING_PREFIX, "android-mirroring-");
    assert.strictEqual(path.RECORDING_SUFFIX, ".mp4");
    assert.strictEqual(path.TEMPLATE_RANDOM, "XXXXXX");

    // B. Timestamp formatting with a fixed date.
    assert.strictEqual(path.formatTimestamp(FAKE_DATE), "20260823-150412", "B: YYYYMMDD-HHMMSS with zero padding");

    // C. Template generation.
    const template = path.generateTemplate(FAKE_DATE);
    assert.ok(template.startsWith(path.RECORDING_PREFIX), "C: template starts with prefix");
    assert.ok(template.indexOf("20260823-150412") >= 0, "C: template contains timestamp");
    assert.ok(template.endsWith("-" + path.TEMPLATE_RANDOM), "C: template ends with random placeholder");
    assert.strictEqual(template.indexOf(path.RECORDING_SUFFIX), -1, "C: template does not contain the suffix");

    // D. Recording directory construction.
    const dirNoSlash = path.buildRecordingDirectory(TEST_DIR);
    assert.strictEqual(dirNoSlash, "/home/test/Videos/Android Mirroring", "D: directory with no trailing slash");
    const dirSlash = path.buildRecordingDirectory("/home/test/Videos/");
    assert.strictEqual(dirSlash, "/home/test/Videos/Android Mirroring", "D: directory with trailing slash");
    const dirDoubleSlash = path.buildRecordingDirectory("/home/test/Videos//");
    assert.strictEqual(dirDoubleSlash, "/home/test/Videos/Android Mirroring", "D: directory with double trailing slash");

    // E. mkdir argv.
    const mkdir = path.buildMkdirCommand("/home/test/Videos/Android Mirroring");
    assert.strictEqual(mkdir.program, "mkdir");
    assert.deepStrictEqual(mkdir.argv, ["mkdir", "-p", "--", "/home/test/Videos/Android Mirroring"]);

    // F. mktemp argv.
    const mktemp = path.buildMktempCommand("/home/test/Videos/Android Mirroring", FAKE_DATE);
    assert.strictEqual(mktemp.program, "mktemp");
    assert.strictEqual(mktemp.argv[0], "mktemp");
    assert.strictEqual(mktemp.argv[1], "--tmpdir=/home/test/Videos/Android Mirroring");
    assert.strictEqual(mktemp.argv[2], "--suffix=.mp4");
    assert.ok(mktemp.argv[3].startsWith(path.RECORDING_PREFIX), "F: mktemp template starts with prefix");
    assert.ok(mktemp.argv[3].endsWith("-" + path.TEMPLATE_RANDOM), "F: mktemp template ends with placeholder");

    // G. rm argv.
    const rm = path.buildRemoveCommand("/home/test/Videos/Android Mirroring/file.mp4");
    assert.strictEqual(rm.program, "rm");
    assert.deepStrictEqual(rm.argv, ["rm", "--", "/home/test/Videos/Android Mirroring/file.mp4"]);

    // H. Safe recording directory validation.
    assert.strictEqual(path.isSafeRecordingDirectory("/home/test/Videos/Android Mirroring"), true, "H: absolute with spaces");
    assert.strictEqual(path.isSafeRecordingDirectory(""), false, "H: empty");
    assert.strictEqual(path.isSafeRecordingDirectory("relative/path"), false, "H: relative");
    assert.strictEqual(path.isSafeRecordingDirectory("/tmp/out\n"), false, "H: newline");
    assert.strictEqual(path.isSafeRecordingDirectory("/tmp/out\x00"), false, "H: NUL");

    // I. Valid recording path validation.
    const recordingDir = "/home/test/Videos/Android Mirroring";
    const goodPath = "/home/test/Videos/Android Mirroring/android-mirroring-20260823-150412-Ab3xP9.mp4";
    assert.strictEqual(path.isValidRecordingPath(goodPath, recordingDir), true, "I: valid path under directory");
    assert.strictEqual(path.isValidRecordingPath(goodPath), true, "I: valid path without expected directory");

    // J. Invalid recording paths.
    assert.strictEqual(path.isValidRecordingPath("", recordingDir), false, "J: empty");
    assert.strictEqual(path.isValidRecordingPath("relative/file.mp4", recordingDir), false, "J: relative");
    assert.strictEqual(path.isValidRecordingPath("/tmp/file.mkv", recordingDir), false, "J: wrong extension");
    assert.strictEqual(path.isValidRecordingPath("/tmp/file.mp4\n", recordingDir), false, "J: trailing newline");
    assert.strictEqual(path.isValidRecordingPath("/tmp\x00/file.mp4", recordingDir), false, "J: NUL");
    assert.strictEqual(path.isValidRecordingPath("/tmp/../home/file.mp4", recordingDir), false, "J: parent reference");
    assert.strictEqual(path.isValidRecordingPath("/other/Android Mirroring/file.mp4", recordingDir), false, "J: outside expected directory");

    // K. mktemp output validation.
    const validOutput = "  \n/home/test/Videos/Android Mirroring/android-mirroring-20260823-150412-Ab3xP9.mp4\n  ";
    const validResult = path.validateMktempOutput(validOutput, recordingDir);
    assert.strictEqual(validResult.ok, true, "K: valid output with whitespace");
    assert.strictEqual(validResult.path, goodPath, "K: trimmed path");

    const emptyResult = path.validateMktempOutput("\n", recordingDir);
    assert.strictEqual(emptyResult.ok, false, "K: empty output rejected");

    const outsideResult = path.validateMktempOutput("/tmp/android-mirroring-20260823-150412-Ab3xP9.mp4", recordingDir);
    assert.strictEqual(outsideResult.ok, false, "K: output outside directory rejected");

    const newlineResult = path.validateMktempOutput("/tmp/file.mp4\nextra", recordingDir);
    assert.strictEqual(newlineResult.ok, false, "K: embedded newline rejected");

    console.log("All RecordingPath fixtures passed.");
}

run();
