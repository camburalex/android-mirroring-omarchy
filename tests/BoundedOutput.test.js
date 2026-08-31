const assert = require("assert");
const BoundedOutput = require("../qml/BoundedOutput.js");

const LIMIT = BoundedOutput.MAX_CAPTURE_CODE_UNITS;

function run() {
    // 1. Normal output below the limit.
    const c1 = BoundedOutput.create();
    assert.strictEqual(BoundedOutput.append(c1, "hello\n"), true, "below limit: accepted");
    assert.strictEqual(BoundedOutput.append(c1, "world"), true, "below limit: second chunk accepted");
    assert.strictEqual(BoundedOutput.value(c1), "hello\nworld", "below limit: retained value");
    assert.strictEqual(BoundedOutput.isOverflow(c1), false, "below limit: no overflow");

    // 2. Output exactly at the limit.
    const c2 = BoundedOutput.create(LIMIT);
    const exact = "x".repeat(LIMIT);
    assert.strictEqual(BoundedOutput.append(c2, exact), true, "exact limit: accepted");
    assert.strictEqual(BoundedOutput.value(c2).length, LIMIT, "exact limit: length matches");
    assert.strictEqual(BoundedOutput.isOverflow(c2), false, "exact limit: no overflow");

    // 3. One chunk exceeding the remaining capacity.
    const c3 = BoundedOutput.create(10);
    assert.strictEqual(BoundedOutput.append(c3, "abcde"), true, "chunk overflow: first half accepted");
    assert.strictEqual(BoundedOutput.append(c3, "klmnopqrstuvwxyz"), false, "chunk overflow: overflow reported");
    assert.strictEqual(BoundedOutput.value(c3), "abcdeklmno", "chunk overflow: retained only up to cap");
    assert.strictEqual(BoundedOutput.isOverflow(c3), true, "chunk overflow: overflow set");
    assert.ok(BoundedOutput.codeUnitsSeen(c3) > BoundedOutput.value(c3).length, "chunk overflow: codeUnitsSeen tracks total");

    // 4. Many chunks exceeding the cumulative limit.
    const c4 = BoundedOutput.create(20);
    for (let i = 0; i < 100; i++) {
        const ok = BoundedOutput.append(c4, "1234567890");
        if (!ok) break;
    }
    assert.strictEqual(BoundedOutput.isOverflow(c4), true, "many chunks: overflow");
    assert.strictEqual(BoundedOutput.value(c4).length, 20, "many chunks: capped at limit");
    assert.ok(BoundedOutput.codeUnitsSeen(c4) >= 20, "many chunks: codeUnitsSeen is bounded below by cap");

    // 5 & 6. Independent stdout/stderr overflow.
    const out = BoundedOutput.create(8);
    const err = BoundedOutput.create(8);
    assert.strictEqual(BoundedOutput.append(out, "good out"), true, "stdout: within limit");
    assert.strictEqual(BoundedOutput.append(err, "bad err message"), false, "stderr: overflow");
    assert.strictEqual(BoundedOutput.value(out), "good out", "stdout: preserved");
    assert.strictEqual(BoundedOutput.value(err).length, 8, "stderr: capped");
    assert.strictEqual(BoundedOutput.isOverflow(out), false, "stdout: no overflow");
    assert.strictEqual(BoundedOutput.isOverflow(err), true, "stderr: overflow");

    // 7. Reset between successive runs.
    const c5 = BoundedOutput.create(16);
    assert.strictEqual(BoundedOutput.append(c5, "first run data"), true, "reset: first run accepted");
    BoundedOutput.reset(c5);
    assert.strictEqual(BoundedOutput.value(c5), "", "reset: buffer empty");
    assert.strictEqual(BoundedOutput.isOverflow(c5), false, "reset: overflow cleared");
    assert.strictEqual(BoundedOutput.append(c5, "second run"), true, "reset: second run accepted");
    assert.strictEqual(BoundedOutput.value(c5), "second run", "reset: second value retained");

    // 8. Overflow output is not subsequently parsed as a valid successful response.
    const c6 = BoundedOutput.create(32);
    const malicious = "List of devices attached\nABC123\tdevice product:Foo model:Bar device:Baz transport_id:1";
    const padding = "x".repeat(64);
    const combined = malicious + padding;
    assert.strictEqual(BoundedOutput.append(c6, combined), false, "parse safety: overflow");
    const truncated = BoundedOutput.value(c6);
    assert.ok(truncated.indexOf("ABC123") >= 0, "parse safety: truncated device line present");
    assert.ok(truncated.indexOf(padding) < 0, "parse safety: attacker padding not fully retained");
    assert.strictEqual(BoundedOutput.isOverflow(c6), true, "parse safety: overflow must be checked by caller");
    // The caller (DeviceManager/WirelessManager) must treat isOverflow as failure and not
    // pass the truncated output to a parser as a success. This test verifies the helper
    // exposes the overflow condition and a bounded, incomplete buffer.

    // 9. Default capacity is MAX_CAPTURE_CODE_UNITS.
    const c7 = BoundedOutput.create();
    assert.strictEqual(c7.capacity, LIMIT, "default capacity is the shared constant");

    // 10. Empty data is a no-op.
    const c8 = BoundedOutput.create(16);
    assert.strictEqual(BoundedOutput.append(c8, ""), true, "empty chunk accepted");
    assert.strictEqual(BoundedOutput.value(c8), "", "empty chunk leaves buffer empty");
    assert.strictEqual(BoundedOutput.isOverflow(c8), false, "empty chunk does not overflow");

    // 11. The helper intentionally uses JavaScript string length (UTF-16 code
    //     units) as its capacity unit, not byte length.
    const c9 = BoundedOutput.create(2);
    assert.strictEqual("🎉".length, 2, "emoji is two UTF-16 code units");
    assert.strictEqual(BoundedOutput.append(c9, "🎉"), true, "emoji fits exactly in capacity");
    assert.strictEqual(BoundedOutput.value(c9), "🎉", "emoji retained");
    assert.strictEqual(BoundedOutput.codeUnitsSeen(c9), 2, "codeUnitsSeen counts UTF-16 code units");
    assert.strictEqual(BoundedOutput.append(c9, "x"), false, "one extra code unit overflows");

    console.log("All BoundedOutput fixtures passed.");
}

run();
