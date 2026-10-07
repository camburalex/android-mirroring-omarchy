const assert = require("assert");
const DependencySetup = require("../qml/DependencySetup.js");

function run() {
    // 1. The required packages are exactly the two system runtimes.
    assert.deepStrictEqual(DependencySetup.REQUIRED_PACKAGES, ["scrcpy", "android-tools"],
        "required packages are scrcpy and android-tools");

    // 2. The check is a plain pacman query with one argv element per package.
    assert.deepStrictEqual(DependencySetup.buildCheckArgv(),
        ["pacman", "-Q", "scrcpy", "android-tools"], "check argv");

    // 3. The install goes through Omarchy's installer with a fixed argv: a
    //    display name and one space-separated package list.
    const install = DependencySetup.buildInstallArgv();
    assert.deepStrictEqual(install,
        ["omarchy-install-app", "Android Mirroring tools", "scrcpy android-tools"], "install argv");
    for (const arg of install) {
        assert.ok(/^[A-Za-z0-9 -]+$/.test(arg), "install argv has no shell metacharacters");
    }

    // 4. Builders return fresh arrays, so a caller cannot mutate the constants.
    DependencySetup.buildCheckArgv().push("extra");
    assert.strictEqual(DependencySetup.buildCheckArgv().length, 4, "check argv is not shared");
    assert.strictEqual(DependencySetup.REQUIRED_PACKAGES.length, 2, "package list is unchanged");

    // 5. Only a zero exit status means every package is installed.
    assert.strictEqual(DependencySetup.isReadyExitCode(0), true, "exit 0 is ready");
    assert.strictEqual(DependencySetup.isReadyExitCode(1), false, "exit 1 is missing");
    assert.strictEqual(DependencySetup.isReadyExitCode(127), false, "exit 127 is missing");

    // 6. Waiting for the installer is finite.
    assert.ok(DependencySetup.INSTALL_POLL_INTERVAL_MS > 0, "poll interval is finite");
    assert.ok(DependencySetup.INSTALL_WAIT_TIMEOUT_MS > DependencySetup.INSTALL_POLL_INTERVAL_MS,
        "wait timeout is longer than one poll");
    assert.strictEqual(DependencySetup.installTimedOut(1000, 1000), false, "not timed out at start");
    assert.strictEqual(
        DependencySetup.installTimedOut(1000, 1000 + DependencySetup.INSTALL_WAIT_TIMEOUT_MS - 1),
        false, "not timed out just before the deadline");
    assert.strictEqual(
        DependencySetup.installTimedOut(1000, 1000 + DependencySetup.INSTALL_WAIT_TIMEOUT_MS),
        true, "timed out at the deadline");

    console.log("All DependencySetup fixtures passed.");
}

run();
