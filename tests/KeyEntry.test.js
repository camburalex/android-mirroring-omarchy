const assert = require("assert");
const KeyEntry = require("../qml/KeyEntry.js");

function type(kind, keys) {
    let text = "";
    let cursor = 0;
    for (const ch of keys) {
        const action = KeyEntry.keyAction({ text: ch });
        ({ text, cursor } = KeyEntry.applyKey(kind, text, cursor, action, ch));
    }
    return text;
}

function run() {
    const E = KeyEntry.KIND_ENDPOINT;
    const C = KeyEntry.KIND_CODE;

    // 1. Key classification: Return/Enter submits, Backspace erases, printable
    //    text is a character, and command chords or non-printing keys are
    //    left to the panel.
    assert.strictEqual(KeyEntry.keyAction({ submit: true, text: "\r" }), KeyEntry.ACTION_SUBMIT, "Return submits");
    assert.strictEqual(KeyEntry.keyAction({ erase: true, text: "\b" }), KeyEntry.ACTION_ERASE, "Backspace erases");
    assert.strictEqual(KeyEntry.keyAction({ text: "7" }), KeyEntry.ACTION_CHARACTER, "digit is a character");
    assert.strictEqual(KeyEntry.keyAction({ text: " " }), KeyEntry.ACTION_CHARACTER, "Space is a character");
    assert.strictEqual(KeyEntry.keyAction({ text: "ä" }), KeyEntry.ACTION_CHARACTER, "non-ASCII is a character");
    assert.strictEqual(KeyEntry.keyAction({ command: true, text: "\u0016" }), KeyEntry.ACTION_NONE, "Ctrl+V is ignored");
    assert.strictEqual(KeyEntry.keyAction({ command: true, text: "v" }), KeyEntry.ACTION_NONE, "command chord is ignored");
    assert.strictEqual(KeyEntry.keyAction({ command: true, submit: true }), KeyEntry.ACTION_NONE, "command Return is ignored");
    assert.strictEqual(KeyEntry.keyAction({ text: "\t" }), KeyEntry.ACTION_NONE, "Tab is left to the panel");
    assert.strictEqual(KeyEntry.keyAction({ text: "\u001b" }), KeyEntry.ACTION_NONE, "Escape is left to the panel");
    assert.strictEqual(KeyEntry.keyAction({ text: "\u007f" }), KeyEntry.ACTION_NONE, "DEL is not a character");
    assert.strictEqual(KeyEntry.keyAction({ text: "" }), KeyEntry.ACTION_NONE, "Up and Down carry no text");
    assert.strictEqual(KeyEntry.keyAction(null), KeyEntry.ACTION_NONE, "missing key info");
    assert.strictEqual(KeyEntry.keyAction({ eraseForward: true, text: "\u007f" }), KeyEntry.ACTION_ERASE_FORWARD, "Delete erases forward");
    assert.strictEqual(KeyEntry.keyAction({ left: true }), KeyEntry.ACTION_LEFT, "Left moves left");
    assert.strictEqual(KeyEntry.keyAction({ right: true }), KeyEntry.ACTION_RIGHT, "Right moves right");
    assert.strictEqual(KeyEntry.keyAction({ home: true }), KeyEntry.ACTION_HOME, "Home moves to the start");
    assert.strictEqual(KeyEntry.keyAction({ end: true }), KeyEntry.ACTION_END, "End moves to the end");
    assert.strictEqual(KeyEntry.keyAction({ command: true, left: true }), KeyEntry.ACTION_NONE, "command Left is ignored");

    // 2. Address fields take IPv4, hostname, and bracketed IPv6 characters only.
    assert.strictEqual(type(E, "192.168.1.20:5555"), "192.168.1.20:5555", "IPv4 endpoint");
    assert.strictEqual(type(E, "pixel-7.local:5555"), "pixel-7.local:5555", "hostname endpoint");
    assert.strictEqual(type(E, "[fe80::1%wlan0]:5555"), "[fe80::1%wlan0]:5555", "IPv6 endpoint with zone");
    assert.strictEqual(type(E, "1 2ä;/'\"<>\\$`3"), "123", "spaces, non-ASCII and punctuation are dropped");

    // 3. Address fields stop at the length limit.
    const long = "a".repeat(KeyEntry.ENDPOINT_MAX_LENGTH + 10);
    assert.strictEqual(type(E, long).length, KeyEntry.ENDPOINT_MAX_LENGTH, "endpoint length is capped");

    // 4. The pairing code takes six digits and nothing else.
    assert.strictEqual(type(C, "12a3 4.5:6789"), "123456", "code keeps the first six digits");
    assert.strictEqual(KeyEntry.maxLength(C), 6, "code length is six");

    // 5. Every printable key is consumed, even when rejected, so it never
    //    reaches the panel; Backspace at the end removes the last character.
    let r = KeyEntry.applyKey(C, "123", 3, KeyEntry.ACTION_CHARACTER, "j");
    assert.deepStrictEqual(r, { text: "123", cursor: 3, consumed: true, submit: false }, "rejected letter is consumed");
    r = KeyEntry.applyKey(C, "123456", 6, KeyEntry.ACTION_CHARACTER, "7");
    assert.deepStrictEqual(r, { text: "123456", cursor: 6, consumed: true, submit: false }, "digit past the limit is consumed");
    r = KeyEntry.applyKey(E, "1.2", 3, KeyEntry.ACTION_ERASE, "");
    assert.deepStrictEqual(r, { text: "1.", cursor: 2, consumed: true, submit: false }, "Backspace erases one character");
    r = KeyEntry.applyKey(E, "", 0, KeyEntry.ACTION_ERASE, "");
    assert.deepStrictEqual(r, { text: "", cursor: 0, consumed: true, submit: false }, "Backspace on empty text");
    r = KeyEntry.applyKey(E, "1.2", 3, KeyEntry.ACTION_SUBMIT, "\r");
    assert.deepStrictEqual(r, { text: "1.2", cursor: 3, consumed: true, submit: true }, "Return submits unchanged text");
    r = KeyEntry.applyKey(E, "1.2", 3, KeyEntry.ACTION_NONE, "\t");
    assert.deepStrictEqual(r, { text: "1.2", cursor: 3, consumed: false, submit: false }, "Tab is not consumed");

    // 6. A single key event cannot insert more than one character.
    r = KeyEntry.applyKey(E, "", 0, KeyEntry.ACTION_CHARACTER, "12");
    assert.strictEqual(r.text, "", "multi-character event text is rejected");

    // 7. An unknown kind accepts nothing.
    assert.strictEqual(type("other", "123"), "", "unknown kind accepts nothing");
    assert.strictEqual(KeyEntry.maxLength("other"), 0, "unknown kind has no length");

    // 8. The pairing code is shown masked, one mark per digit.
    assert.strictEqual(KeyEntry.mask("123456"), KeyEntry.MASK_CHARACTER.repeat(6), "mask length");
    assert.strictEqual(KeyEntry.mask("").length, 0, "empty mask");
    assert.strictEqual(KeyEntry.mask("123").indexOf("1") < 0, true, "mask hides digits");

    // 9. Left, Right, Home and End move the caret, and typing, Backspace and
    //    Delete edit at the caret.
    const fixed = "192.168.1.20:5555";
    r = KeyEntry.applyKey(E, "92.168.1.20:5555", 16, KeyEntry.ACTION_HOME, "");
    assert.deepStrictEqual(r, { text: "92.168.1.20:5555", cursor: 0, consumed: true, submit: false }, "Home moves to the start");
    r = KeyEntry.applyKey(E, r.text, r.cursor, KeyEntry.ACTION_CHARACTER, "1");
    assert.deepStrictEqual(r, { text: fixed, cursor: 1, consumed: true, submit: false }, "typing inserts at the caret");
    r = KeyEntry.applyKey(E, r.text, r.cursor, KeyEntry.ACTION_END, "");
    assert.strictEqual(r.cursor, fixed.length, "End moves to the end");
    assert.strictEqual(KeyEntry.applyKey(E, "ab", 1, KeyEntry.ACTION_LEFT, "").cursor, 0, "Left moves one back");
    assert.strictEqual(KeyEntry.applyKey(E, "ab", 0, KeyEntry.ACTION_LEFT, "").cursor, 0, "Left stops at the start");
    assert.strictEqual(KeyEntry.applyKey(E, "ab", 1, KeyEntry.ACTION_RIGHT, "").cursor, 2, "Right moves one on");
    assert.strictEqual(KeyEntry.applyKey(E, "ab", 2, KeyEntry.ACTION_RIGHT, "").cursor, 2, "Right stops at the end");
    r = KeyEntry.applyKey(E, "abc", 1, KeyEntry.ACTION_ERASE, "");
    assert.deepStrictEqual([r.text, r.cursor], ["bc", 0], "Backspace erases before the caret");
    r = KeyEntry.applyKey(E, "abc", 0, KeyEntry.ACTION_ERASE, "");
    assert.deepStrictEqual([r.text, r.cursor], ["abc", 0], "Backspace at the start does nothing");
    r = KeyEntry.applyKey(E, "abc", 1, KeyEntry.ACTION_ERASE_FORWARD, "");
    assert.deepStrictEqual([r.text, r.cursor], ["ac", 1], "Delete erases after the caret");
    r = KeyEntry.applyKey(E, "abc", 3, KeyEntry.ACTION_ERASE_FORWARD, "");
    assert.deepStrictEqual([r.text, r.cursor], ["abc", 3], "Delete at the end does nothing");
    r = KeyEntry.applyKey(C, "123456", 0, KeyEntry.ACTION_CHARACTER, "9");
    assert.deepStrictEqual([r.text, r.cursor], ["123456", 0], "a full code takes no digit at the caret");
    r = KeyEntry.applyKey(E, "abc", 99, KeyEntry.ACTION_CHARACTER, "d");
    assert.deepStrictEqual([r.text, r.cursor], ["abcd", 4], "an out-of-range caret is clamped to the end");
    r = KeyEntry.applyKey(E, "abc", undefined, KeyEntry.ACTION_CHARACTER, "d");
    assert.deepStrictEqual([r.text, r.cursor], ["dabc", 1], "a missing caret is the start");

    console.log("All KeyEntry fixtures passed.");
}

run();
