import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "WirelessCommand.js" as WirelessCommand
import "BoundedOutput.js" as BoundedOutput

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

    property var _pairOutCapture: null
    property var _pairErrCapture: null
    property var _connectOutCapture: null
    property var _connectErrCapture: null

    signal connected(string endpoint)

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

        root._pairingEndpoint = pairingEndpoint;
        root._connectionEndpoint = connectionEndpoint;
        root._pairingCode = pairingCode;
        root._pairOutCapture = BoundedOutput.create();
        root._pairErrCapture = BoundedOutput.create();
        root.state = "pairing";
        root.errorMessage = "";

        var pairCmd = WirelessCommand.buildPairCommand(pairingEndpoint);
        pairProc.command = pairCmd.argv;
        pairProc.running = true;
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

        root._connectionEndpoint = connectionEndpoint;
        root._connectOutCapture = BoundedOutput.create();
        root._connectErrCapture = BoundedOutput.create();
        root.state = "connecting";
        root.errorMessage = "";

        var connectCmd = WirelessCommand.buildConnectCommand(connectionEndpoint);
        connectProc.command = connectCmd.argv;
        connectProc.running = true;
    }

    function clearError() {
        root.errorMessage = "";
        if (root.state === "error") root.state = "idle";
    }

    function _clearPairingCode() {
        root._pairingCode = "";
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
                if (BoundedOutput.isOverflow(root._pairOutCapture) && pairProc.running) pairProc.running = false;
            }
        }

        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._pairErrCapture, data)) return;
                if (BoundedOutput.isOverflow(root._pairErrCapture) && pairProc.running) pairProc.running = false;
            }
        }

        onStarted: {
            if (root._pairingCode.length > 0) {
                pairProc.write(root._pairingCode + "\n");
                root._pairingCode = "";
            }
        }

        onExited: function(exitCode, exitStatus) {
            root._pairingCode = "";

            if (BoundedOutput.isOverflow(root._pairOutCapture) || BoundedOutput.isOverflow(root._pairErrCapture)) {
                root.state = "error";
                root.errorMessage = "ADB returned an unexpectedly large response.";
                return;
            }

            var out = BoundedOutput.value(root._pairOutCapture);
            var err = BoundedOutput.value(root._pairErrCapture);
            var result = WirelessCommand.classifyPairResult(exitCode, out, err);

            if (!result.ok) {
                root.state = "error";
                root.errorMessage = "Pairing failed. Verify the address, port, and pairing code.";
                return;
            }

            root._lastConnectionEndpoint = root._connectionEndpoint;
            root._connectOutCapture = BoundedOutput.create();
            root._connectErrCapture = BoundedOutput.create();
            root.state = "connecting";

            var connect2Cmd = WirelessCommand.buildConnectCommand(root._connectionEndpoint);
            connectProc.command = connect2Cmd.argv;
            connectProc.running = true;
        }

        // Quickshell does not emit onExited when the binary cannot be started
        // (FailedToStart). This fallback clears the in-memory pairing code and
        // returns the UI to an error state.
        onRunningChanged: {
            if (!pairProc.running && root.state === "pairing") {
                root._pairingCode = "";
                root.state = "error";
                root.errorMessage = "Pairing failed. Verify the address, port, and pairing code.";
            }
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
                if (BoundedOutput.isOverflow(root._connectOutCapture) && connectProc.running) connectProc.running = false;
            }
        }

        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._connectErrCapture, data)) return;
                if (BoundedOutput.isOverflow(root._connectErrCapture) && connectProc.running) connectProc.running = false;
            }
        }

        onExited: function(exitCode, exitStatus) {
            if (BoundedOutput.isOverflow(root._connectOutCapture) || BoundedOutput.isOverflow(root._connectErrCapture)) {
                root.state = "error";
                root.errorMessage = "ADB returned an unexpectedly large response.";
                return;
            }

            var out = BoundedOutput.value(root._connectOutCapture);
            var err = BoundedOutput.value(root._connectErrCapture);
            var result = WirelessCommand.classifyConnectResult(exitCode, out, err);

            if (!result.ok) {
                root.state = "error";
                root.errorMessage = "Could not reach this device. Make sure the phone and computer are on the same network and Wireless Debugging is enabled.";
                return;
            }

            root._lastConnectionEndpoint = root._connectionEndpoint;
            root.state = "connected";
            root.connected(root._connectionEndpoint);
        }

        // Quickshell does not emit onExited when the binary cannot be started
        // (FailedToStart). This fallback returns the UI to an error state.
        onRunningChanged: {
            if (!connectProc.running && root.state === "connecting") {
                root.state = "error";
                root.errorMessage = "Could not reach this device. Make sure the phone and computer are on the same network and Wireless Debugging is enabled.";
            }
        }
    }
}
