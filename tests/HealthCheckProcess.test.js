const assert = require("assert");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(REPO_ROOT, "qml", "health-check.sh");

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readProcessGroup(pid) {
    try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const match = stat.match(/^\d+ \((.*?)\) \S+ \d+ (\d+)/);
        return match ? Number(match[2]) : 0;
    } catch {
        return 0;
    }
}

function isProcessAlive(pid) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitForExit(child, maxMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return { code: child.exitCode, signal: child.signalCode };
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`child ${child.pid} did not exit within ${maxMs}ms`));
        }, maxMs);
        child.on("exit", (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal });
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function spawnHelper(tmpDir, serial, extraEnv) {
    const env = { ...process.env, ...extraEnv };
    env.PATH = tmpDir + path.delimiter + process.env.PATH;
    return cp.spawn("/usr/bin/bash", [SCRIPT, serial], {
        stdio: ["ignore", "pipe", "pipe"],
        env,
    });
}

function writeShim(file, content) {
    fs.writeFileSync(file, content);
    fs.chmodSync(file, 0o755);
}

function sourceAssertions() {
    const src = fs.readFileSync(SCRIPT, "utf8");

    // No global or name-based process killing.
    assert.strictEqual(src.indexOf("pkill") >= 0, false, "health-check.sh must not use pkill");
    assert.strictEqual(src.indexOf("killall") >= 0, false, "health-check.sh must not use killall");

    // Explicit child tracking and signal cleanup.
    assert.ok(src.indexOf('active_child=""') >= 0, "tracks active_child PID");
    assert.ok(src.indexOf('active_child=$!') >= 0, "sets active_child from background job");
    assert.ok(src.indexOf("trap cleanup TERM INT HUP") >= 0, "installs TERM/INT/HUP cleanup trap");

    // Each child is started as a background job under job control, giving it
    // its own process group. We also use the real util-linux 'kill' for
    // negative process-group targets because the bash 'kill' builtin does not
    // handle them.
    assert.ok(src.indexOf("enable -n kill") >= 0, "uses the real kill command for process groups");
    assert.ok(src.indexOf("set -m") >= 0, "starts children as background jobs with their own process group");

    // Cleanup targets only the exact child process group.
    assert.ok(src.indexOf('kill -TERM -- -"$active_child"') >= 0,
        "cleanup sends SIGTERM to the child process group");
    assert.ok(src.indexOf('kill -KILL -- -"$active_child"') >= 0,
        "cleanup escalates to SIGKILL on the child process group");

    // TCP probe has a finite primary deadline and a short forced-kill escalation.
    assert.ok(src.indexOf("timeout --kill-after=") >= 0,
        "probe uses timeout with a forced-kill escalation");
    const probeMatch = src.match(/timeout\s+--kill-after=(\S+)\s+(\S+)\s+bash/);
    assert.ok(probeMatch, "probe timeout line is parseable");
    assert.ok(probeMatch[2].startsWith("10"), "primary probe deadline is approximately 10 seconds");

    // Endpoints are passed positionally; they are not interpolated into the
    // executable shell source string.
    assert.ok(src.indexOf("bash -c 'exec 3<>/dev/tcp/\"$1\"/\"$2\"; exec 3<&-' probe \"$ip\" \"$port\"") >= 0,
        "probe passes endpoints as positional parameters");
    assert.strictEqual(src.indexOf('/dev/tcp/"$ip"/"$port"') >= 0, false,
        "probe source does not interpolate endpoint values");

    console.log("HealthCheckProcess source assertions passed.");
}

async function getChildPids(pid) {
    const childrenFile = `/proc/${pid}/task/${pid}/children`;
    try {
        const text = fs.readFileSync(childrenFile, "utf8").trim();
        return text ? text.split(/\s+/).map(Number) : [];
    } catch {
        return [];
    }
}

async function waitForFile(file, maxMs) {
    for (let i = 0; i < maxMs / 50; i++) {
        if (fs.existsSync(file)) return true;
        await sleep(50);
    }
    return false;
}

async function waitForProcessExit(pid, maxMs) {
    for (let i = 0; i < maxMs / 50; i++) {
        if (!isProcessAlive(pid)) return true;
        await sleep(50);
    }
    return false;
}

async function testSleepCleanup() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hc-sleep-"));
    const sleepPidFile = path.join(tmpDir, "sleep.pid");

    writeShim(path.join(tmpDir, "bash"), "#!/bin/bash\nexit 0\n");
    writeShim(
        path.join(tmpDir, "sleep"),
        `#!/bin/bash
if [ -n "\$HC_TEST_PID_FILE" ]; then
    echo "\$\$" > "\$HC_TEST_PID_FILE"
fi
exec /usr/bin/sleep 60
`
    );

    const child = spawnHelper(tmpDir, "1.2.3.4:5555", {
        HC_TEST_PID_FILE: sleepPidFile,
    });

    const found = await waitForFile(sleepPidFile, 2000);
    assert.ok(found, "sleep shim reported its PID within 2s");
    const sleepPid = Number(fs.readFileSync(sleepPidFile, "utf8").trim());
    assert.ok(sleepPid > 0, "sleep PID is a positive integer");

    // Ensure the helper still has the sleep as a direct child and that the
    // child lives in a distinct, plugin-owned process group.
    const helperChildren = await getChildPids(child.pid);
    assert.ok(helperChildren.indexOf(sleepPid) >= 0,
        `sleep shim ${sleepPid} is a direct child of the helper`);
    const sleepPgid = readProcessGroup(sleepPid);
    const helperPgid = readProcessGroup(child.pid);
    assert.notStrictEqual(sleepPgid, helperPgid,
        "sleep child has its own process group, not the helper's");

    child.kill("SIGTERM");
    const result = await waitForExit(child, 2000);
    assert.strictEqual(result.code, 130, "helper exits with the cleanup code 130");
    assert.strictEqual(result.signal, null, "helper exits, it is not killed by a signal");

    const gone = await waitForProcessExit(sleepPid, 2000);
    assert.ok(gone, `sleep shim (pid ${sleepPid}) must not survive helper termination`);

    // The helper itself must be gone.
    assert.ok(!isProcessAlive(child.pid), "helper process must be gone");

    // No leftover child of the helper may be alive.
    const leftover = await getChildPids(child.pid);
    assert.deepStrictEqual(leftover, [], "helper has no surviving direct children");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("HealthCheckProcess sleep-cleanup fixture passed.");
}

async function testProbeCleanupWithForcedKill() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hc-probe-"));
    const probePidFile = path.join(tmpDir, "probe.pid");

    // The probe shim ignores SIGTERM, so the helper's cleanup must escalate
    // to SIGKILL within a bounded, short period.
    writeShim(
        path.join(tmpDir, "bash"),
        `#!/bin/bash
trap '' TERM
if [ -n "\$HC_TEST_PID_FILE" ]; then
    echo "\$\$" > "\$HC_TEST_PID_FILE"
fi
exec /usr/bin/sleep 60
`
    );

    const child = spawnHelper(tmpDir, "1.2.3.4:5555", {
        HC_TEST_PID_FILE: probePidFile,
    });

    let probePid = null;
    let timeoutPid = null;
    for (let i = 0; i < 40; i++) {
        if (!probePid && fs.existsSync(probePidFile)) {
            probePid = Number(fs.readFileSync(probePidFile, "utf8").trim());
        }
        if (probePid && !timeoutPid) {
            const children = await getChildPids(child.pid);
            timeoutPid = children[0];
        }
        if (probePid && timeoutPid) break;
        await sleep(50);
    }
    assert.ok(probePid, "probe shim reported its PID within 2s");
    assert.ok(timeoutPid, "timeout child was spawned");

    // Verify the probe is a descendant of timeout and shares the timeout's
    // process group (an exact, plugin-owned group created by the background job).
    const timeoutChildren = await getChildPids(timeoutPid);
    assert.ok(timeoutChildren.indexOf(probePid) >= 0 || probePid === timeoutChildren[0],
        `probe shim ${probePid} is a descendant of timeout ${timeoutPid}`);

    child.kill("SIGTERM");
    const result = await waitForExit(child, 3000);
    assert.strictEqual(result.code, 130, "helper exits with the cleanup code 130");
    assert.strictEqual(result.signal, null, "helper exits, it is not killed by a signal");

    // The probe ignored SIGTERM, so the helper's forced-kill escalation must
    // remove it within a bounded period (well under the 10s primary timeout).
    const probeGone = await waitForProcessExit(probePid, 3000);
    assert.ok(probeGone,
        `TERM-ignoring probe (pid ${probePid}) must be killed within the forced-kill bound`);

    const timeoutGone = await waitForProcessExit(timeoutPid, 3000);
    assert.ok(timeoutGone,
        `timeout process (pid ${timeoutPid}) must not survive helper termination`);

    assert.ok(!isProcessAlive(child.pid), "helper process must be gone");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("HealthCheckProcess probe-cleanup-with-forced-kill fixture passed.");
}

async function run() {
    sourceAssertions();
    await testSleepCleanup();
    await testProbeCleanupWithForcedKill();
    console.log("All HealthCheckProcess fixtures passed.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
