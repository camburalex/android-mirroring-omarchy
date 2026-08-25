const assert = require("assert");
const AdbOperation = require("../qml/AdbOperation.js");

function run() {
    // 1. Production constants are finite and conservative.
    assert.ok(AdbOperation.DEVICE_DISCOVERY_TIMEOUT_MS > 0, "discovery timeout is finite");
    assert.ok(AdbOperation.PAIR_TIMEOUT_MS > 0, "pair timeout is finite");
    assert.ok(AdbOperation.CONNECT_TIMEOUT_MS > 0, "connect timeout is finite");
    assert.ok(AdbOperation.SIGTERM_GRACE_MS > 0, "SIGTERM grace is finite");
    assert.ok(AdbOperation.SIGTERM_GRACE_MS < AdbOperation.DEVICE_DISCOVERY_TIMEOUT_MS,
        "grace is shorter than the shortest deadline");

    // 2. Normal device discovery completes before the deadline and can be parsed.
    const discovery = AdbOperation.createContext(50, 10, "device");
    const discoveryGen = AdbOperation.start(discovery);
    assert.strictEqual(discovery.gen, discoveryGen, "start returns current generation");
    assert.strictEqual(discovery.running, true, "run starts in running state");
    assert.strictEqual(AdbOperation.markExited(discovery, discoveryGen), true, "markExited succeeds");
    assert.strictEqual(AdbOperation.canFinalize(discovery, discoveryGen), true, "can finalize after exit");
    assert.strictEqual(AdbOperation.shouldParseResult(discovery), true, "normal exit is parseable before finalize");
    assert.strictEqual(AdbOperation.finalize(discovery, discoveryGen), true, "finalize succeeds");
    assert.strictEqual(discovery.finalized, true, "run is finalized");
    assert.strictEqual(AdbOperation.shouldParseResult(discovery), false, "result is no longer parseable after finalize");
    assert.strictEqual(AdbOperation.terminalErrorMessage(discovery), "", "no terminal error");

    // 3. Device discovery timeout prevents success parsing.
    const discoveryTimeout = AdbOperation.createContext(50, 10, "device");
    const dGen = AdbOperation.start(discoveryTimeout);
    assert.strictEqual(AdbOperation.markTimeout(discoveryTimeout, dGen), true, "markTimeout succeeds");
    assert.strictEqual(discoveryTimeout.terminal, "timeout", "terminal state is timeout");
    assert.strictEqual(AdbOperation.markExited(discoveryTimeout, dGen), true, "exit still recorded after timeout");
    assert.strictEqual(AdbOperation.finalize(discoveryTimeout, dGen), true, "finalize succeeds");
    assert.strictEqual(AdbOperation.shouldParseResult(discoveryTimeout), false,
        "timed-out run must not be parsed as success");
    assert.strictEqual(AdbOperation.terminalErrorMessage(discoveryTimeout),
        "ADB device discovery timed out.", "device timeout message");

    // 4. Pair timeout.
    const pair = AdbOperation.createContext(50, 10, "pair");
    const pGen = AdbOperation.start(pair);
    assert.strictEqual(AdbOperation.markTimeout(pair, pGen), true, "pair markTimeout succeeds");
    assert.strictEqual(AdbOperation.markExited(pair, pGen), true, "pair exit after timeout");
    assert.strictEqual(AdbOperation.finalize(pair, pGen), true, "pair finalize");
    assert.strictEqual(AdbOperation.shouldParseResult(pair), false, "pair timeout does not parse");
    assert.strictEqual(AdbOperation.terminalErrorMessage(pair), "ADB pairing timed out.", "pair timeout message");

    // 5. Connect timeout.
    const connect = AdbOperation.createContext(50, 10, "connect");
    const cGen = AdbOperation.start(connect);
    assert.strictEqual(AdbOperation.markTimeout(connect, cGen), true, "connect markTimeout succeeds");
    assert.strictEqual(AdbOperation.markExited(connect, cGen), true, "connect exit after timeout");
    assert.strictEqual(AdbOperation.finalize(connect, cGen), true, "connect finalize");
    assert.strictEqual(AdbOperation.shouldParseResult(connect), false, "connect timeout does not parse");
    assert.strictEqual(AdbOperation.terminalErrorMessage(connect), "ADB connection timed out.", "connect timeout message");

    // 6. Timeout wins over a later successful-looking exit and output must not be parsed.
    const race = AdbOperation.createContext(50, 10, "connect");
    const rGen = AdbOperation.start(race);
    assert.strictEqual(AdbOperation.markTimeout(race, rGen), true, "timeout first");
    assert.strictEqual(race.terminal, "timeout", "terminal locked to timeout");
    assert.strictEqual(AdbOperation.markExited(race, rGen), true, "exit follows timeout");
    assert.strictEqual(AdbOperation.finalize(race, rGen), true, "finalize after timeout+exit");
    assert.strictEqual(AdbOperation.terminalErrorMessage(race), "ADB connection timed out.",
        "timeout terminal error, not a success");

    // 7. Ordinary completion stops pending deadline behavior.
    const cancel = AdbOperation.createContext(50, 10, "device");
    const cancelGen = AdbOperation.start(cancel);
    assert.strictEqual(AdbOperation.markExited(cancel, cancelGen), true, "ordinary exit");
    assert.strictEqual(AdbOperation.finalize(cancel, cancelGen), true, "ordinary finalize");
    assert.strictEqual(AdbOperation.markTimeout(cancel, cancelGen), false,
        "stale timeout ignored after finalize");
    assert.strictEqual(AdbOperation.markOverflow(cancel, cancelGen), false,
        "stale overflow ignored after finalize");

    // 8. Stale generation cannot affect a later invocation on the same context.
    const reuse = AdbOperation.createContext(50, 10, "device");
    const oldGen = AdbOperation.start(reuse);
    assert.strictEqual(AdbOperation.markTimeout(reuse, oldGen), true, "timeout on first generation");
    const newGen = AdbOperation.start(reuse);
    assert.notStrictEqual(newGen, oldGen, "generation increments on restart");
    assert.strictEqual(reuse.gen, newGen, "context generation is new");
    assert.strictEqual(AdbOperation.markTimeout(reuse, oldGen), false,
        "stale timeout timer cannot target new generation");
    assert.strictEqual(AdbOperation.markKillSent(reuse, oldGen), false,
        "stale kill timer cannot target new generation");
    assert.strictEqual(AdbOperation.markExited(reuse, newGen), true, "new invocation can exit normally");
    assert.strictEqual(AdbOperation.finalize(reuse, newGen), true, "new invocation finalizes");

    // 9. Replacement contexts get distinct generations; stale timers cannot cross over.
    {
        const oldCtx = AdbOperation.createContext(50, 10, "pair");
        const newCtx = AdbOperation.createContext(50, 10, "connect");
        const oldGen = AdbOperation.start(oldCtx);
        const newGen = AdbOperation.start(newCtx);
        assert.notStrictEqual(newGen, oldGen, "replacement context gets a distinct generation");
        assert.strictEqual(AdbOperation.markTimeout(newCtx, oldGen), false,
            "stale timeout from previous context cannot target replacement context");
        assert.strictEqual(AdbOperation.markKillSent(newCtx, oldGen), false,
            "stale kill from previous context cannot target replacement context");
        assert.strictEqual(AdbOperation.markTimeout(oldCtx, oldGen), true, "timeout only on original context");
        assert.strictEqual(oldCtx.terminal, "timeout", "original context is timed out");
        assert.strictEqual(newCtx.terminal, null, "replacement context is unaffected");
        assert.strictEqual(AdbOperation.markExited(newCtx, newGen), true, "replacement context exits normally");
        assert.strictEqual(AdbOperation.shouldParseResult(newCtx), true, "replacement context result is parseable before finalize");
        assert.strictEqual(AdbOperation.finalize(newCtx, newGen), true, "replacement context finalizes normally");
        assert.strictEqual(AdbOperation.shouldParseResult(newCtx), false, "replacement context no longer parseable after finalize");
    }

    // 10. SIGKILL escalation is recorded for an active, current invocation.
    const kill = AdbOperation.createContext(50, 10, "device");
    const killGen = AdbOperation.start(kill);
    assert.strictEqual(AdbOperation.markTimeout(kill, killGen), true, "timeout to trigger escalation");
    assert.strictEqual(AdbOperation.markKillSent(kill, killGen), true, "kill recorded for current generation");
    assert.strictEqual(kill.killSent, true, "killSent flag set");
    assert.strictEqual(AdbOperation.markExited(kill, killGen), true, "exit after kill");
    assert.strictEqual(AdbOperation.finalize(kill, killGen), true, "finalize after kill");

    // 11. Kill escalation does not affect a later invocation.
    const kill2 = AdbOperation.createContext(50, 10, "connect");
    const kill2Gen1 = AdbOperation.start(kill2);
    assert.strictEqual(AdbOperation.markTimeout(kill2, kill2Gen1), true, "first run timeout");
    assert.strictEqual(AdbOperation.markKillSent(kill2, kill2Gen1), true, "first run kill");
    const kill2Gen2 = AdbOperation.start(kill2);
    assert.strictEqual(AdbOperation.markKillSent(kill2, kill2Gen1), false, "old kill cannot touch new gen");
    assert.strictEqual(AdbOperation.markExited(kill2, kill2Gen2), true, "new run exits");
    assert.strictEqual(AdbOperation.finalize(kill2, kill2Gen2), true, "new run finalizes");
    assert.strictEqual(kill2.killSent, false, "new run has its own killSent state");

    // 12. Overflow and timeout cannot produce a later successful parse.
    const overflow = AdbOperation.createContext(50, 10, "device");
    const oGen = AdbOperation.start(overflow);
    assert.strictEqual(AdbOperation.markOverflow(overflow, oGen), true, "overflow first");
    assert.strictEqual(overflow.terminal, "overflow", "terminal locked to overflow");
    assert.strictEqual(AdbOperation.markTimeout(overflow, oGen), false, "timeout cannot override overflow");
    assert.strictEqual(AdbOperation.markExited(overflow, oGen), true, "exit after overflow");
    assert.strictEqual(AdbOperation.finalize(overflow, oGen), true, "finalize after overflow");
    assert.strictEqual(AdbOperation.shouldParseResult(overflow), false, "overflow result not parsed");
    assert.strictEqual(AdbOperation.terminalErrorMessage(overflow),
        "ADB returned an unexpectedly large response.", "overflow message");

    // 13. Overflow and timeout race: whichever terminal happens first wins.
    const timeoutThenOverflow = AdbOperation.createContext(50, 10, "device");
    const toGen = AdbOperation.start(timeoutThenOverflow);
    assert.strictEqual(AdbOperation.markTimeout(timeoutThenOverflow, toGen), true, "timeout first");
    assert.strictEqual(AdbOperation.markOverflow(timeoutThenOverflow, toGen), false, "overflow cannot override timeout");
    assert.strictEqual(AdbOperation.markExited(timeoutThenOverflow, toGen), true, "exit after terminal");
    assert.strictEqual(AdbOperation.finalize(timeoutThenOverflow, toGen), true, "finalize");
    assert.strictEqual(AdbOperation.terminalErrorMessage(timeoutThenOverflow),
        "ADB device discovery timed out.", "timeout message wins");

    // 14. A fresh invocation can run after a fully-stopped, timed-out child.
    const recover = AdbOperation.createContext(50, 10, "connect");
    const recoverGen1 = AdbOperation.start(recover);
    assert.strictEqual(AdbOperation.markTimeout(recover, recoverGen1), true, "first run times out");
    assert.strictEqual(AdbOperation.markExited(recover, recoverGen1), true, "first run exits");
    assert.strictEqual(AdbOperation.finalize(recover, recoverGen1), true, "first run fully stopped");
    const recoverGen2 = AdbOperation.start(recover);
    assert.strictEqual(recover.gen, recoverGen2, "fresh generation after timeout");
    assert.strictEqual(AdbOperation.markExited(recover, recoverGen2), true, "fresh run exits");
    assert.strictEqual(AdbOperation.shouldParseResult(recover), true, "fresh run is parseable before finalize");
    assert.strictEqual(AdbOperation.finalize(recover, recoverGen2), true, "fresh run finalizes");
    assert.strictEqual(AdbOperation.shouldParseResult(recover), false, "fresh run no longer parseable after finalize");

    // 15. Kind is preserved across state machine transitions.
    const kinded = AdbOperation.createContext(50, 10, "pair");
    const kindedGen = AdbOperation.start(kinded);
    assert.strictEqual(kinded.kind, "pair", "kind preserved");
    assert.strictEqual(AdbOperation.markTimeout(kinded, kindedGen), true, "kinded timeout");
    assert.strictEqual(AdbOperation.terminalErrorMessage(kinded), "ADB pairing timed out.", "kind in error message");

    console.log("All AdbOperation fixtures passed.");
}

run();
