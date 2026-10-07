// DependencySetup.js — the system packages the plugin needs and the fixed
// argv used to check for them and to install them through Omarchy.
//
// Quickshell Process/Timer lifecycle is kept in DependencyManager.qml; this
// plain JavaScript module can be unit tested from Node.

// System packages the plugin cannot work without. `scrcpy` is the mirroring
// engine and `android-tools` provides `adb`. Neither ships with stock Omarchy,
// so the widget offers to install them instead of asking for a manual step.
var REQUIRED_PACKAGES = ["scrcpy", "android-tools"];

var INSTALL_DISPLAY_NAME = "Android Mirroring tools";

// How often the package state is re-checked while the Omarchy installer
// terminal is open, and how long the widget keeps waiting for it.
var INSTALL_POLL_INTERVAL_MS = 2000;
var INSTALL_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

// `pacman -Q` exits non-zero when any named package is not installed. This is
// the same check `omarchy-pkg-add` uses to confirm an install.
function buildCheckArgv() {
    return ["pacman", "-Q"].concat(REQUIRED_PACKAGES);
}

// Omarchy's own installer flow: it opens a floating terminal that owns the
// password prompt and runs `omarchy-pkg-add`. The package list is one fixed
// argument; nothing user-supplied is ever part of this argv.
function buildInstallArgv() {
    return ["omarchy-install-app", INSTALL_DISPLAY_NAME, REQUIRED_PACKAGES.join(" ")];
}

function isReadyExitCode(exitCode) {
    return exitCode === 0;
}

function installTimedOut(startedAtMs, nowMs) {
    return nowMs - startedAtMs >= INSTALL_WAIT_TIMEOUT_MS;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        REQUIRED_PACKAGES: REQUIRED_PACKAGES,
        INSTALL_DISPLAY_NAME: INSTALL_DISPLAY_NAME,
        INSTALL_POLL_INTERVAL_MS: INSTALL_POLL_INTERVAL_MS,
        INSTALL_WAIT_TIMEOUT_MS: INSTALL_WAIT_TIMEOUT_MS,
        buildCheckArgv: buildCheckArgv,
        buildInstallArgv: buildInstallArgv,
        isReadyExitCode: isReadyExitCode,
        installTimedOut: installTimedOut
    };
}
