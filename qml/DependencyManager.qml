import QtQuick
import Quickshell
import Quickshell.Io
import "DependencySetup.js" as DependencySetup

// Integrated setup for the system packages the plugin drives. A standard
// `omarchy plugin add ... --enable` is enough: when scrcpy or ADB is missing
// the widget offers a one-click install through Omarchy's own installer.
Scope {
    id: root

    // False until the first package check has completed.
    property bool checked: false
    property bool ready: false
    property bool installing: false
    property string error: ""

    readonly property bool missing: root.checked && !root.ready

    property double _installStartedAt: 0

    signal becameReady()

    function check() {
        if (checkProc.running) return
        checkProc.command = DependencySetup.buildCheckArgv()
        checkProc.running = true
    }

    // The install runs in Omarchy's floating installer terminal, which owns
    // the password prompt. It has to outlive this panel, so it is the one
    // detached launch in the plugin; its argv is fixed and never built from
    // user input. The plugin itself never asks for privileges.
    function install() {
        if (root.ready || root.installing) return
        root.error = ""
        root.installing = true
        root._installStartedAt = Date.now()
        Quickshell.execDetached(DependencySetup.buildInstallArgv())
        installWatch.restart()
    }

    function _onChecked(exitCode) {
        var wasReady = root.ready
        root.ready = DependencySetup.isReadyExitCode(exitCode)
        root.checked = true

        if (root.ready) {
            root.installing = false
            root.error = ""
            installWatch.stop()
            if (!wasReady) root.becameReady()
            return
        }

        if (root.installing
            && DependencySetup.installTimedOut(root._installStartedAt, Date.now())) {
            root.installing = false
            installWatch.stop()
            root.error = "The install did not finish. Try again."
        }
    }

    Process {
        id: checkProc

        onExited: function(exitCode, exitStatus) {
            root._onChecked(exitCode)
        }
    }

    Timer {
        id: installWatch
        interval: DependencySetup.INSTALL_POLL_INTERVAL_MS
        repeat: true
        onTriggered: root.check()
    }
}
