const assert = require("assert");
const ScrcpyDiagnostics = require("../qml/ScrcpyDiagnostics.js");

const LINES = ScrcpyDiagnostics.MAX_RETAINED_LINES;
const CODE_UNITS = ScrcpyDiagnostics.MAX_RETAINED_CODE_UNITS;
const TAIL = ScrcpyDiagnostics.MAX_RETAINED_TAIL;
const PENDING = ScrcpyDiagnostics.MAX_PENDING_CODE_UNITS;
const RECORD = ScrcpyDiagnostics.MAX_RECORD_CODE_UNITS;

function run() {
    // 1. Normal newline-oriented diagnostics are retained and separated.
    const c1 = ScrcpyDiagnostics.create();
    ScrcpyDiagnostics.append(c1, "INFO: connected\n");
    ScrcpyDiagnostics.append(c1, "WARN: something\n");
    const v1 = ScrcpyDiagnostics.value(c1);
    assert.ok(v1.indexOf("INFO: connected") >= 0, "normal: first line retained");
    assert.ok(v1.indexOf("WARN: something") >= 0, "normal: second line retained");
    assert.ok(v1.indexOf("\n") >= 0, "normal: lines are separated");

    // 2. A single oversized unterminated record (no newline) is bounded.
    const c2 = ScrcpyDiagnostics.create();
    const big = "x".repeat(CODE_UNITS + 100);
    ScrcpyDiagnostics.append(c2, big);
    const v2 = ScrcpyDiagnostics.value(c2);
    assert.ok(v2.length <= TAIL, "no-newline oversized record: retained value bounded");
    assert.ok(v2.length > 0, "no-newline oversized record: some text is kept");
    assert.strictEqual(v2.replace(/x/g, "").length, 0, "no-newline oversized record: only payload text kept");

    // 3. A small partial line is held in pending and completed by a later chunk.
    const c3 = ScrcpyDiagnostics.create();
    ScrcpyDiagnostics.append(c3, "part");
    assert.strictEqual(ScrcpyDiagnostics.value(c3), "", "partial: not yet retained");
    ScrcpyDiagnostics.append(c3, "ial\n");
    assert.strictEqual(ScrcpyDiagnostics.value(c3), "partial", "partial: completed line retained");

    // 4. A partial line that exceeds the pending cap is forced to a record
    //    without waiting for a newline.
    const c4 = ScrcpyDiagnostics.create();
    ScrcpyDiagnostics.append(c4, "abc");
    const pad = "y".repeat(PENDING + 1);
    ScrcpyDiagnostics.append(c4, pad);
    const v4 = ScrcpyDiagnostics.value(c4);
    assert.ok(v4.length > PENDING, "pending cap: unterminated run forced to record");
    assert.ok(v4.length <= TAIL, "pending cap: forced record bounded");
    assert.ok(v4.indexOf("abc") >= 0, "pending cap: earlier partial included");

    // 5. A normal scrcpy-style error remains visible after bounded handling.
    const c5 = ScrcpyDiagnostics.create();
    ScrcpyDiagnostics.append(c5, "ERROR: device not found\n");
    const v5 = ScrcpyDiagnostics.value(c5);
    assert.ok(v5.indexOf("ERROR: device not found") >= 0, "normal error message visible");

    // 6. An oversized line with a newline is per-record capped before buffering.
    const c6 = ScrcpyDiagnostics.create();
    const hugeLine = "z".repeat(RECORD + 50) + "\n";
    ScrcpyDiagnostics.append(c6, hugeLine);
    const v6 = ScrcpyDiagnostics.value(c6);
    assert.ok(v6.length <= RECORD, "oversized line: record capped");
    assert.ok(v6.indexOf("z") >= 0, "oversized line: payload text kept");

    // 7. The rolling history is bounded by both line count and code-unit count.
    const c7 = ScrcpyDiagnostics.create();
    for (let i = 0; i < LINES + 10; i++) {
        ScrcpyDiagnostics.append(c7, `line ${i}\n`);
    }
    const v7 = ScrcpyDiagnostics.value(c7);
    const v7Lines = v7.split("\n");
    assert.ok(v7Lines.length <= LINES, "rolling history: line count bounded");
    assert.ok(v7.indexOf("line 9") < 0, "rolling history: oldest lines dropped");
    assert.ok(v7.indexOf(`line ${LINES + 9}`) >= 0, "rolling history: newest lines kept");

    // 8. Retained data stays bounded even when many large lines are streamed.
    const c8 = ScrcpyDiagnostics.create();
    for (let i = 0; i < 10; i++) {
        ScrcpyDiagnostics.append(c8, "a".repeat(500) + "\n");
    }
    const v8 = ScrcpyDiagnostics.value(c8);
    assert.ok(v8.length <= CODE_UNITS, "many large lines: code-unit bound respected");

    // 9. Two independent captures (stdout and stderr) each remain bounded.
    const out = ScrcpyDiagnostics.create();
    const err = ScrcpyDiagnostics.create();
    ScrcpyDiagnostics.append(out, "x".repeat(CODE_UNITS + 50));
    ScrcpyDiagnostics.append(err, "y".repeat(CODE_UNITS + 50));
    const vOut = ScrcpyDiagnostics.value(out);
    const vErr = ScrcpyDiagnostics.value(err);
    assert.ok(vOut.length <= TAIL, "stdout-like capture bounded");
    assert.ok(vErr.length <= TAIL, "stderr-like capture bounded");
    assert.notStrictEqual(vOut.indexOf("x"), -1, "stdout-like capture keeps payload");
    assert.notStrictEqual(vErr.indexOf("y"), -1, "stderr-like capture keeps payload");

    // 10. Reset clears the bounded capture for a new session.
    const c9 = ScrcpyDiagnostics.create();
    ScrcpyDiagnostics.append(c9, "old data\n");
    ScrcpyDiagnostics.reset(c9);
    assert.strictEqual(ScrcpyDiagnostics.value(c9), "", "reset: buffer empty");
    ScrcpyDiagnostics.append(c9, "new data\n");
    assert.strictEqual(ScrcpyDiagnostics.value(c9), "new data", "reset: new data retained");

    console.log("All ScrcpyDiagnostics fixtures passed.");
}

run();
