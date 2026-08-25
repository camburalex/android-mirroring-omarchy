// AdbOperation.js — finite deadlines, forced cleanup, and terminal-state
// management for short-lived ADB processes.
//
// Quickshell Process/Timer lifecycle is kept in the QML files; this plain
// JavaScript module owns the run-state machine so it can be unit tested from
// Node. It is imported by QML (`import "AdbOperation.js" as AdbOperation`)
// and by the test harness (`require`).

// Production timeout values (milliseconds). These are the user-facing
// deadlines; tests supply smaller values to avoid real waits.
var DEVICE_DISCOVERY_TIMEOUT_MS = 10000;
var PAIR_TIMEOUT_MS = 30000;
var CONNECT_TIMEOUT_MS = 30000;

// Grace period between a normal termination request (SIGTERM via
// `Process.running = false`) and a forced SIGKILL escalation.
var SIGTERM_GRACE_MS = 1500;

// Module-level monotonic generation token. Every start() receives a distinct
// value, even when production replaces an AdbOperation context with a newly
// created context, so stale deadline/SIGKILL callbacks cannot target later
// invocations.
var _nextGen = 1;

function createContext(timeoutMs, graceMs, kind) {
    if (typeof timeoutMs !== "number" || timeoutMs <= 0 || isNaN(timeoutMs)) {
        timeoutMs = DEVICE_DISCOVERY_TIMEOUT_MS;
    }
    if (typeof graceMs !== "number" || graceMs <= 0 || isNaN(graceMs)) {
        graceMs = SIGTERM_GRACE_MS;
    }
    return {
        timeoutMs: timeoutMs,
        graceMs: graceMs,
        kind: kind || "device",
        gen: 0,
        running: false,
        exited: false,
        finalized: false,
        terminal: null, // null, "exited", "timeout", "overflow"
        timedOut: false,
        overflow: false,
        killSent: false
    };
}

function start(ctx) {
    if (!ctx) return 0;
    ctx.gen = _nextGen++;
    ctx.running = true;
    ctx.exited = false;
    ctx.finalized = false;
    ctx.terminal = null;
    ctx.timedOut = false;
    ctx.overflow = false;
    ctx.killSent = false;
    return ctx.gen;
}

function _isCurrent(ctx, gen) {
    return ctx && ctx.gen === gen && !ctx.finalized;
}

// Mark the current run as having produced excessive output. Only the first
// overflow wins; subsequent calls are ignored so there is a single terminal
// failure per invocation.
function markOverflow(ctx, gen) {
    if (!_isCurrent(ctx, gen)) return false;
    if (ctx.terminal) return false;
    ctx.overflow = true;
    ctx.terminal = "overflow";
    return true;
}

// Mark the current run as having reached its finite deadline. This wins over
// a later normal exit: the result must never be parsed as success.
function markTimeout(ctx, gen) {
    if (!_isCurrent(ctx, gen)) return false;
    if (ctx.terminal) return false;
    ctx.timedOut = true;
    ctx.terminal = "timeout";
    return true;
}

// Record that the process has exited. If a timeout/overflow already set the
// terminal state, that state is preserved. If not, the terminal state becomes
// "exited" and the caller may parse the bounded output as a normal result.
function markExited(ctx, gen) {
    if (!_isCurrent(ctx, gen)) return false;
    if (ctx.exited) return true;
    ctx.exited = true;
    if (!ctx.terminal) ctx.terminal = "exited";
    return true;
}

function canFinalize(ctx, gen) {
    return _isCurrent(ctx, gen) && ctx.exited && !ctx.finalized;
}

function finalize(ctx, gen) {
    if (!canFinalize(ctx, gen)) return false;
    ctx.finalized = true;
    ctx.running = false;
    return true;
}

function markKillSent(ctx, gen) {
    if (!_isCurrent(ctx, gen)) return false;
    ctx.killSent = true;
    return true;
}

function isFinalized(ctx) {
    return !!(ctx && ctx.finalized);
}

function isActive(ctx) {
    return !!(ctx && !ctx.finalized);
}

function isFailureTerminal(ctx) {
    return !!(ctx && (ctx.timedOut || ctx.overflow));
}

function shouldParseResult(ctx) {
    return !!(ctx && ctx.exited && !ctx.finalized && ctx.terminal === "exited" && !ctx.timedOut && !ctx.overflow);
}

// Safe, user-facing error message for the terminal failure. Does not include
// attacker-controlled output.
function terminalErrorMessage(ctx) {
    if (!ctx) return "";
    if (ctx.timedOut) {
        if (ctx.kind === "pair") return "ADB pairing timed out.";
        if (ctx.kind === "connect") return "ADB connection timed out.";
        return "ADB device discovery timed out.";
    }
    if (ctx.overflow) return "ADB returned an unexpectedly large response.";
    return "";
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        DEVICE_DISCOVERY_TIMEOUT_MS: DEVICE_DISCOVERY_TIMEOUT_MS,
        PAIR_TIMEOUT_MS: PAIR_TIMEOUT_MS,
        CONNECT_TIMEOUT_MS: CONNECT_TIMEOUT_MS,
        SIGTERM_GRACE_MS: SIGTERM_GRACE_MS,
        createContext: createContext,
        start: start,
        markOverflow: markOverflow,
        markTimeout: markTimeout,
        markExited: markExited,
        canFinalize: canFinalize,
        finalize: finalize,
        markKillSent: markKillSent,
        isFinalized: isFinalized,
        isActive: isActive,
        isFailureTerminal: isFailureTerminal,
        shouldParseResult: shouldParseResult,
        terminalErrorMessage: terminalErrorMessage
    };
}
