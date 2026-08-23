import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "WirelessCommand.js" as WirelessCommand

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

    property string _pairStdout: ""
    property string _pairStderr: ""
    property string _connectStdout: ""
    property string _connectStderr: ""

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
        root._pairStdout = "";
        root._pairStderr = "";
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
        root._connectStdout = "";
        root._connectStderr = "";
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

        stdout: StdioCollector {
            id: pairStdout
            waitForEnd: true
            onStreamFinished: root._pairStdout = String(text || "")
        }

        stderr: StdioCollector {
            id: pairStderr
            waitForEnd: true
            onStreamFinished: root._pairStderr = String(text || "")
        }

        onStarted: {
            if (root._pairingCode.length > 0) {
                pairProc.write(root._pairingCode + "\n");
                root._pairingCode = "";
            }
        }

        onExited: function(exitCode, exitStatus) {
            root._pairingCode = "";

            var out = String(root._pairStdout || pairStdout.text || "");
            var err = String(root._pairStderr || pairStderr.text || "");
            var result = WirelessCommand.classifyPairResult(exitCode, out, err);

            if (!result.ok) {
                root.state = "error";
                root.errorMessage = "Pairing failed. Verify the address, port, and pairing code.";
                return;
            }

            root._lastConnectionEndpoint = root._connectionEndpoint;
            root._connectStdout = "";
            root._connectStderr = "";
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

        stdout: StdioCollector {
            id: connectStdout
            waitForEnd: true
            onStreamFinished: root._connectStdout = String(text || "")
        }

        stderr: StdioCollector {
            id: connectStderr
            waitForEnd: true
            onStreamFinished: root._connectStderr = String(text || "")
        }

        onExited: function(exitCode, exitStatus) {
            var out = String(root._connectStdout || connectStdout.text || "");
            var err = String(root._connectStderr || connectStderr.text || "");
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
