import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "WirelessCommand.js" as WirelessCommand
import "BoundedOutput.js" as BoundedOutput
import "AdbOperation.js" as AdbOperation

// Cold-start-safe owner for the wireless pair/connect ADB processes.
// Uses Scope because it owns Quickshell.Io.Process children.
Scope {
    id: root

    property string state: "idle"
    property string errorMessage: ""
    property bool busy: state === "pairing" || state === "connecting"
    readonly property string lastConnectionEndpoint: _lastConnectionEndpoint

    // Transient state only. The pairing code is written to ADB stdin once and
    // cleared immediately; it is never persisted, logged, or sent as an argv
    // element. The underscore names mark internal-only properties.
    property string _pairingEndpoint: ""
    property string _connectionEndpoint: ""
    property string _pairingCode: ""
    property string _lastConnectionEndpoint: ""

    // True while the current pair run was started by pair(): it stops after a
    // successful `adb pair` instead of chaining into `adb connect`.
    property bool _pairOnly: false

    property var _pairCtx: null
    property int _pairGen: 0
    property int _pairExitCode: 0
    property var _pairOutCapture: null
    property var _pairErrCapture: null

    property var _connectCtx: null
    property int _connectGen: 0
    property int _connectExitCode: 0
    property var _connectOutCapture: null
    property var _connectErrCapture: null

    signal connected(string endpoint)
    signal paired(string pairingEndpoint)

    function pairAndConnect(pairingEndpoint, connectionEndpoint, pairingCode) {
        if (root.busy) return;

        root.clearError();

        var pairCheck = WirelessCommand.validateEndpoint(pairingEndpoint);
        if (!pairCheck.ok) {
            root.state = "error";
            root.errorMessage = "Pairing address is invalid. " + pairCheck.reason;
            return;
        }

        var connCheck = WirelessCommand.validateEndpoint(connectionEndpoint);
        if (!connCheck.ok) {
            root.state = "error";
            root.errorMessage = "Connection address is invalid. " + connCheck.reason;
            return;
        }

        if (!WirelessCommand.isValidPairingCode(pairingCode)) {
            root.state = "error";
            root.errorMessage = "Pairing code must be six digits.";
            return;
        }

        root._pairOnly = false;
        root._startPair(pairingEndpoint, connectionEndpoint, pairingCode);
    }

    // Pair without connecting. Used by the QR-code workflow, where the main
    // connection endpoint is only discovered after pairing succeeds. Emits
    // paired() on success; the caller then calls connect().
    function pair(pairingEndpoint, pairingPassword) {
        if (root.busy) return;

        root.clearError();

        var pairCheck = WirelessCommand.validateEndpoint(pairingEndpoint);
        if (!pairCheck.ok) {
            root.state = "error";
            root.errorMessage = "Pairing address is invalid. " + pairCheck.reason;
            return;
        }

        if (!WirelessCommand.isValidPairingPassword(pairingPassword)) {
            root.state = "error";
            root.errorMessage = "Pairing password is invalid.";
            return;
        }

        root._pairOnly = true;
        root._startPair(pairingEndpoint, "", pairingPassword);
    }

    function _startPair(pairingEndpoint, connectionEndpoint, pairingCode) {
        root._pairingEndpoint = pairingEndpoint;
        root._connectionEndpoint = connectionEndpoint;
        root._pairingCode = pairingCode;

        var ctx = AdbOperation.createContext(
            AdbOperation.PAIR_TIMEOUT_MS,
            AdbOperation.SIGTERM_GRACE_MS,
            "pair"
        );
        var gen = AdbOperation.start(ctx);
        root._pairCtx = ctx;
        root._pairGen = gen;
        root._pairExitCode = 0;

        root._pairOutCapture = BoundedOutput.create();
        root._pairErrCapture = BoundedOutput.create();
        root.state = "pairing";
        root.errorMessage = "";

        var pairCmd = WirelessCommand.buildPairCommand(pairingEndpoint);
        pairProc.command = pairCmd.argv;
        pairProc.running = true;

        pairDeadlineTimer.gen = gen;
        pairDeadlineTimer.start();
    }

    function connect(connectionEndpoint) {
        if (root.busy) return;

        root.clearError();

        var check = WirelessCommand.validateEndpoint(connectionEndpoint);
        if (!check.ok) {
            root.state = "error";
            root.errorMessage = "Connection address is invalid. " + check.reason;
            return;
        }

        root._startConnect(connectionEndpoint);
    }

    function _startConnect(connectionEndpoint) {
        root._connectionEndpoint = connectionEndpoint;

        var ctx = AdbOperation.createContext(
            AdbOperation.CONNECT_TIMEOUT_MS,
            AdbOperation.SIGTERM_GRACE_MS,
            "connect"
        );
        var gen = AdbOperation.start(ctx);
        root._connectCtx = ctx;
        root._connectGen = gen;
        root._connectExitCode = 0;

        root._connectOutCapture = BoundedOutput.create();
        root._connectErrCapture = BoundedOutput.create();
        root.state = "connecting";
        root.errorMessage = "";

        var connectCmd = WirelessCommand.buildConnectCommand(connectionEndpoint);
        connectProc.command = connectCmd.argv;
        connectProc.running = true;

        connectDeadlineTimer.gen = gen;
        connectDeadlineTimer.start();
    }

    function clearError() {
        root.errorMessage = "";
        if (root.state === "error") root.state = "idle";
    }

    function _clearPairingCode() {
        root._pairingCode = "";
    }

    function _stopPairTimers() {
        pairDeadlineTimer.stop()
        pairKillTimer.stop()
    }

    function _stopConnectTimers() {
        connectDeadlineTimer.stop()
        connectKillTimer.stop()
    }

    function _onPairTimeout(gen) {
        if (!AdbOperation.isActive(root._pairCtx)) return
        if (root._pairCtx.gen !== gen) return
        if (!AdbOperation.markTimeout(root._pairCtx, gen)) return

        root._clearPairingCode()

        if (pairProc.running) {
            pairProc.running = false
            pairKillTimer.gen = gen
            pairKillTimer.start()
        }
    }

    function _onPairKill(gen) {
        if (!AdbOperation.isActive(root._pairCtx)) return
        if (root._pairCtx.gen !== gen) return
        if (pairProc.running) {
            pairProc.signal(9)
            AdbOperation.markKillSent(root._pairCtx, gen)
        }
    }

    function _onConnectTimeout(gen) {
        if (!AdbOperation.isActive(root._connectCtx)) return
        if (root._connectCtx.gen !== gen) return
        if (!AdbOperation.markTimeout(root._connectCtx, gen)) return

        if (connectProc.running) {
            connectProc.running = false
            connectKillTimer.gen = gen
            connectKillTimer.start()
        }
    }

    function _onConnectKill(gen) {
        if (!AdbOperation.isActive(root._connectCtx)) return
        if (root._connectCtx.gen !== gen) return
        if (connectProc.running) {
            connectProc.signal(9)
            AdbOperation.markKillSent(root._connectCtx, gen)
        }
    }

    function _onPairExited(exitCode, exitStatus) {
        if (!root._pairCtx) return
        if (!AdbOperation.markExited(root._pairCtx, root._pairGen)) return
        root._pairExitCode = exitCode
        root._attemptFinalizePair()
    }

    function _onPairRunningChanged() {
        if (pairProc.running || !root._pairCtx) return
        if (AdbOperation.isFinalized(root._pairCtx)) return
        if (!root._pairCtx.exited) {
            if (!AdbOperation.markExited(root._pairCtx, root._pairGen)) return
            root._pairExitCode = 1
        }
        root._attemptFinalizePair()
    }

    function _attemptFinalizePair() {
        if (!AdbOperation.canFinalize(root._pairCtx, root._pairGen)) return

        AdbOperation.finalize(root._pairCtx, root._pairGen)
        root._stopPairTimers()
        root._clearPairingCode()

        if (root._pairCtx.overflow
            || BoundedOutput.isOverflow(root._pairOutCapture)
            || BoundedOutput.isOverflow(root._pairErrCapture)) {
            root.state = "error";
            root.errorMessage = "ADB returned an unexpectedly large response.";
            return;
        }

        if (root._pairCtx.timedOut) {
            root.state = "error";
            root.errorMessage = AdbOperation.terminalErrorMessage(root._pairCtx);
            return;
        }

        var out = BoundedOutput.value(root._pairOutCapture);
        var err = BoundedOutput.value(root._pairErrCapture);
        var result = WirelessCommand.classifyPairResult(root._pairExitCode, out, err);

        if (!result.ok) {
            root.state = "error";
            root.errorMessage = root._pairOnly
                ? "Pairing failed. Scan a new QR code and try again."
                : "Pairing failed. Verify the address, port, and pairing code.";
            return;
        }

        if (root._pairOnly) {
            root.state = "paired";
            root.paired(root._pairingEndpoint);
            return;
        }

        root._lastConnectionEndpoint = root._connectionEndpoint;
        root._startConnect(root._connectionEndpoint);
    }

    function _onConnectExited(exitCode, exitStatus) {
        if (!root._connectCtx) return
        if (!AdbOperation.markExited(root._connectCtx, root._connectGen)) return
        root._connectExitCode = exitCode
        root._attemptFinalizeConnect()
    }

    function _onConnectRunningChanged() {
        if (connectProc.running || !root._connectCtx) return
        if (AdbOperation.isFinalized(root._connectCtx)) return
        if (!root._connectCtx.exited) {
            if (!AdbOperation.markExited(root._connectCtx, root._connectGen)) return
            root._connectExitCode = 1
        }
        root._attemptFinalizeConnect()
    }

    function _attemptFinalizeConnect() {
        if (!AdbOperation.canFinalize(root._connectCtx, root._connectGen)) return

        AdbOperation.finalize(root._connectCtx, root._connectGen)
        root._stopConnectTimers()

        if (root._connectCtx.overflow
            || BoundedOutput.isOverflow(root._connectOutCapture)
            || BoundedOutput.isOverflow(root._connectErrCapture)) {
            root.state = "error";
            root.errorMessage = "ADB returned an unexpectedly large response.";
            return;
        }

        if (root._connectCtx.timedOut) {
            root.state = "error";
            root.errorMessage = AdbOperation.terminalErrorMessage(root._connectCtx);
            return;
        }

        var out = BoundedOutput.value(root._connectOutCapture);
        var err = BoundedOutput.value(root._connectErrCapture);
        var result = WirelessCommand.classifyConnectResult(root._connectExitCode, out, err);

        if (!result.ok) {
            root.state = "error";
            root.errorMessage = "Could not reach this device. Make sure the phone and computer are on the same network and Wireless Debugging is enabled.";
            return;
        }

        root._lastConnectionEndpoint = root._connectionEndpoint;
        root.state = "connected";
        root.connected(root._connectionEndpoint);
    }

    Process {
        id: pairProc
        running: false
        command: []
        stdinEnabled: true

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._pairOutCapture, data)) return;
                if (AdbOperation.markOverflow(root._pairCtx, root._pairGen)) {
                    pairDeadlineTimer.stop()
                    if (pairProc.running) {
                        pairProc.running = false
                        pairKillTimer.gen = root._pairGen
                        pairKillTimer.start()
                    }
                }
            }
        }

        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._pairErrCapture, data)) return;
                if (AdbOperation.markOverflow(root._pairCtx, root._pairGen)) {
                    pairDeadlineTimer.stop()
                    if (pairProc.running) {
                        pairProc.running = false
                        pairKillTimer.gen = root._pairGen
                        pairKillTimer.start()
                    }
                }
            }
        }

        onStarted: {
            if (root._pairingCode.length > 0) {
                pairProc.write(root._pairingCode + "\n");
                root._clearPairingCode();
            }
        }

        onExited: function(exitCode, exitStatus) {
            root._onPairExited(exitCode, exitStatus)
        }

        // Quickshell does not emit onExited when the binary cannot be started
        // (FailedToStart). This fallback clears the in-memory pairing code and
        // returns the UI to an error state.
        onRunningChanged: {
            root._onPairRunningChanged()
        }
    }

    Process {
        id: connectProc
        running: false
        command: []

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._connectOutCapture, data)) return;
                if (AdbOperation.markOverflow(root._connectCtx, root._connectGen)) {
                    connectDeadlineTimer.stop()
                    if (connectProc.running) {
                        connectProc.running = false
                        connectKillTimer.gen = root._connectGen
                        connectKillTimer.start()
                    }
                }
            }
        }

        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._connectErrCapture, data)) return;
                if (AdbOperation.markOverflow(root._connectCtx, root._connectGen)) {
                    connectDeadlineTimer.stop()
                    if (connectProc.running) {
                        connectProc.running = false
                        connectKillTimer.gen = root._connectGen
                        connectKillTimer.start()
                    }
                }
            }
        }

        onExited: function(exitCode, exitStatus) {
            root._onConnectExited(exitCode, exitStatus)
        }

        // Quickshell does not emit onExited when the binary cannot be started
        // (FailedToStart). This fallback returns the UI to an error state.
        onRunningChanged: {
            root._onConnectRunningChanged()
        }
    }

    Timer {
        id: pairDeadlineTimer
        interval: AdbOperation.PAIR_TIMEOUT_MS
        repeat: false
        property int gen: 0
        onTriggered: root._onPairTimeout(gen)
    }

    Timer {
        id: pairKillTimer
        interval: AdbOperation.SIGTERM_GRACE_MS
        repeat: false
        property int gen: 0
        onTriggered: root._onPairKill(gen)
    }

    Timer {
        id: connectDeadlineTimer
        interval: AdbOperation.CONNECT_TIMEOUT_MS
        repeat: false
        property int gen: 0
        onTriggered: root._onConnectTimeout(gen)
    }

    Timer {
        id: connectKillTimer
        interval: AdbOperation.SIGTERM_GRACE_MS
        repeat: false
        property int gen: 0
        onTriggered: root._onConnectKill(gen)
    }
}
