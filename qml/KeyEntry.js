// KeyEntry.js — what a key press does to the wireless address and
// pairing-code fields.
//
// The fields are KeyEntryField.qml: plain Text driven by key presses instead of
// a Qt editable text control, so they take no part in clipboard or input-method
// handling. This plain JavaScript module holds the key rules so QML and the
// Node tests share them.

var KIND_ENDPOINT = "endpoint";
var KIND_CODE = "code";

// An address is HOST:PORT or [IPv6%zone]:PORT, as WirelessCommand.js accepts.
// 64 characters covers any IPv4, bracketed IPv6, or local hostname endpoint.
var ENDPOINT_MAX_LENGTH = 64;
var ENDPOINT_CHARACTER = /^[A-Za-z0-9.:\[\]%-]$/;

// The Android pairing code is exactly six digits.
var CODE_MAX_LENGTH = 6;
var CODE_CHARACTER = /^[0-9]$/;

var ACTION_NONE = "none";
var ACTION_SUBMIT = "submit";
var ACTION_ERASE = "erase";
var ACTION_ERASE_FORWARD = "erase-forward";
var ACTION_LEFT = "left";
var ACTION_RIGHT = "right";
var ACTION_HOME = "home";
var ACTION_END = "end";
var ACTION_CHARACTER = "character";

var MASK_CHARACTER = "●";

function maxLength(kind) {
    if (kind === KIND_ENDPOINT) return ENDPOINT_MAX_LENGTH;
    if (kind === KIND_CODE) return CODE_MAX_LENGTH;
    return 0;
}

// An unknown kind accepts nothing.
function isAllowedCharacter(kind, character) {
    if (typeof character !== "string") return false;
    if (kind === KIND_ENDPOINT) return ENDPOINT_CHARACTER.test(character);
    if (kind === KIND_CODE) return CODE_CHARACTER.test(character);
    return false;
}

function _isPrintable(text) {
    if (typeof text !== "string" || text.length === 0) return false;
    var code = text.charCodeAt(0);
    return code >= 0x20 && code !== 0x7F;
}

// Classify one key press. `key` carries plain facts from the QML key event:
// submit (Return/Enter), erase (Backspace), eraseForward (Delete), left,
// right, home, end, command (Ctrl or Meta held), and the event text. Command
// chords and other non-printing keys such as Tab, Escape, Up and Down are left
// to the panel.
function keyAction(key) {
    if (!key || key.command) return ACTION_NONE;
    if (key.submit) return ACTION_SUBMIT;
    if (key.erase) return ACTION_ERASE;
    if (key.eraseForward) return ACTION_ERASE_FORWARD;
    if (key.left) return ACTION_LEFT;
    if (key.right) return ACTION_RIGHT;
    if (key.home) return ACTION_HOME;
    if (key.end) return ACTION_END;
    if (_isPrintable(key.text)) return ACTION_CHARACTER;
    return ACTION_NONE;
}

// Apply one action to the field text with the caret at `cursor` (clamped to
// the text). Returns the new text and caret, whether the field consumes the
// key, and whether the key submits the form. Every printable key is consumed,
// so a rejected character never reaches the panel's key handling.
function applyKey(kind, text, cursor, action, character) {
    var current = String(text || "");
    var at = Math.max(0, Math.min(Math.floor(Number(cursor)) || 0, current.length));
    var out = { text: current, cursor: at, consumed: true, submit: false };
    if (action === ACTION_SUBMIT) {
        out.submit = true;
    } else if (action === ACTION_ERASE) {
        if (at > 0) {
            out.text = current.substring(0, at - 1) + current.substring(at);
            out.cursor = at - 1;
        }
    } else if (action === ACTION_ERASE_FORWARD) {
        out.text = current.substring(0, at) + current.substring(at + 1);
    } else if (action === ACTION_LEFT) {
        out.cursor = Math.max(0, at - 1);
    } else if (action === ACTION_RIGHT) {
        out.cursor = Math.min(current.length, at + 1);
    } else if (action === ACTION_HOME) {
        out.cursor = 0;
    } else if (action === ACTION_END) {
        out.cursor = current.length;
    } else if (action === ACTION_CHARACTER) {
        if (current.length < maxLength(kind) && isAllowedCharacter(kind, character)) {
            out.text = current.substring(0, at) + character + current.substring(at);
            out.cursor = at + 1;
        }
    } else {
        out.consumed = false;
    }
    return out;
}

function mask(text) {
    var length = String(text || "").length;
    var out = "";
    for (var i = 0; i < length; i++) out += MASK_CHARACTER;
    return out;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        KIND_ENDPOINT: KIND_ENDPOINT,
        KIND_CODE: KIND_CODE,
        ENDPOINT_MAX_LENGTH: ENDPOINT_MAX_LENGTH,
        CODE_MAX_LENGTH: CODE_MAX_LENGTH,
        ACTION_NONE: ACTION_NONE,
        ACTION_SUBMIT: ACTION_SUBMIT,
        ACTION_ERASE: ACTION_ERASE,
        ACTION_ERASE_FORWARD: ACTION_ERASE_FORWARD,
        ACTION_LEFT: ACTION_LEFT,
        ACTION_RIGHT: ACTION_RIGHT,
        ACTION_HOME: ACTION_HOME,
        ACTION_END: ACTION_END,
        ACTION_CHARACTER: ACTION_CHARACTER,
        MASK_CHARACTER: MASK_CHARACTER,
        maxLength: maxLength,
        isAllowedCharacter: isAllowedCharacter,
        keyAction: keyAction,
        applyKey: applyKey,
        mask: mask
    };
}
