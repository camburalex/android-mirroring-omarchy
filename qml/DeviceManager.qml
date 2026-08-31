import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "AdbParser.js" as AdbParser
import "BoundedOutput.js" as BoundedOutput
import "AdbOperation.js" as AdbOperation

// Scope exposes `children` as its default property and is intended for
// nonvisual Quickshell objects. QtObject does not provide a default data
// property, so a direct `Process {}` child would fail on cold QML load.
Scope {
    id: root

    property var devices: []
    property bool busy: false
    property string error: ""

    // If set, a device whose serial exactly matches this endpoint and which
    // carries no USB metadata is reported as a wireless transport. This is set
    // from a successful WirelessManager connect and is not persisted.
    property string wirelessEndpoint: ""

    // Saved/transient wireless identities supplied from outside. The parser
    // treats each string as a known wireless serial/endpoint. A live non-USB
    // device is only reported as wireless when its serial is in this set.
    property var knownWirelessSerials: []

    property string _stdoutText: ""
    property string _stderrText: ""

    property var _stdoutCapture: null
    property var _stderrCapture: null

    property var _runCtx: null
    property int _runGen: 0
    property int _runExitCode: 0

    signal refreshCompleted(bool success)

    onWirelessEndpointChanged: root._reparseIfNeeded()
    onKnownWirelessSerialsChanged: root._reparseIfNeeded()

    function _buildWirelessContext() {
        var set = {}
        if (root.wirelessEndpoint) set[root.wirelessEndpoint] = true
        if (Array.isArray(root.knownWirelessSerials)) {
            for (var i = 0; i < root.knownWirelessSerials.length; i++) {
                var s = String(root.knownWirelessSerials[i] || "")
                if (s) set[s] = true
            }
        }
        var result = []
        for (var k in set) result.push(k)
        return result
    }

    function _reparseIfNeeded() {
        // Do not reparse while a discovery run is in flight; the in-flight
        // refresh will use the current context when it finalizes.
        if (root.busy) return
        if (!root._stdoutText) return
        root.devices = AdbParser.parseDevices(root._stdoutText, root._buildWirelessContext())
    }

    function _resetRunState() {
        root._runCtx = null
        root._runGen = 0
        root._runExitCode = 0
    }

    function _stopDiscoveryTimers() {
        discoveryDeadlineTimer.stop()
        discoveryKillTimer.stop()
    }

    function _onDiscoveryTimeout(gen) {
        if (!AdbOperation.isActive(root._runCtx)) return
        if (root._runCtx.gen !== gen) return
        if (!AdbOperation.markTimeout(root._runCtx, gen)) return

        if (adbProc.running) {
            adbProc.running = false
            discoveryKillTimer.gen = gen
            discoveryKillTimer.start()
        }
    }

    function _onDiscoveryKill(gen) {
        if (!AdbOperation.isActive(root._runCtx)) return
        if (root._runCtx.gen !== gen) return
        if (adbProc.running) {
            adbProc.signal(9)
            AdbOperation.markKillSent(root._runCtx, gen)
        }
    }

    function _onDiscoveryExited(exitCode, exitStatus) {
        if (!root._runCtx) return
        if (!AdbOperation.markExited(root._runCtx, root._runGen)) return
        root._runExitCode = exitCode
        root._attemptFinalize()
    }

    function _onDiscoveryRunningChanged() {
        if (adbProc.running || !root._runCtx) return
        if (AdbOperation.isFinalized(root._runCtx)) return
        if (!root._runCtx.exited) {
            if (!AdbOperation.markExited(root._runCtx, root._runGen)) return
            root._runExitCode = 1
        }
        root._attemptFinalize()
    }

    function _attemptFinalize() {
        if (!AdbOperation.canFinalize(root._runCtx, root._runGen)) return

        AdbOperation.finalize(root._runCtx, root._runGen)
        root.busy = false
        root._stopDiscoveryTimers()

        if (root._runCtx.overflow
            || BoundedOutput.isOverflow(root._stdoutCapture)
            || BoundedOutput.isOverflow(root._stderrCapture)) {
            console.warn("adb devices -l produced excessive output")
            root.error = "ADB returned an unexpectedly large response."
            root._stdoutText = ""
            root.devices = []
            root.refreshCompleted(false)
            return
        }

        if (root._runCtx.timedOut) {
            root.error = AdbOperation.terminalErrorMessage(root._runCtx)
            root._stdoutText = ""
            root.devices = []
            root.refreshCompleted(false)
            return
        }

        if (root._runExitCode !== 0) {
            var err = String(BoundedOutput.value(root._stderrCapture) || "").trim()
            if (err) console.warn("adb devices -l failed:", root._runExitCode, err)
            root.error = "ADB discovery failed."
            root.devices = []
            root.refreshCompleted(false)
            return
        }

        var out = String(BoundedOutput.value(root._stdoutCapture) || "")
        root._stdoutText = out
        root.devices = AdbParser.parseDevices(out, root._buildWirelessContext())
        root.refreshCompleted(true)
    }

    function refresh() {
        if (root.busy) return

        root._resetRunState()

        var ctx = AdbOperation.createContext(
            AdbOperation.DEVICE_DISCOVERY_TIMEOUT_MS,
            AdbOperation.SIGTERM_GRACE_MS,
            "device"
        )
        var gen = AdbOperation.start(ctx)
        root._runCtx = ctx
        root._runGen = gen

        root.busy = true
        root.error = ""
        // Preserve the previous device list during the query; the UI uses
        // `busy` to show the loading state. The list is atomically replaced
        // when the current run finalizes.
        root._stdoutText = ""
        root._stderrText = ""
        root._stdoutCapture = BoundedOutput.create()
        root._stderrCapture = BoundedOutput.create()

        adbProc.command = ["adb", "devices", "-l"]
        adbProc.running = true

        discoveryDeadlineTimer.gen = gen
        discoveryDeadlineTimer.start()
    }

    function stateText(device) {
        return AdbParser.stateText(device.rawState, device.connection)
    }

    Process {
        id: adbProc

        command: ["adb", "devices", "-l"]

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._stdoutCapture, data)) return;
                if (AdbOperation.markOverflow(root._runCtx, root._runGen)) {
                    discoveryDeadlineTimer.stop()
                    if (adbProc.running) {
                        adbProc.running = false
                        discoveryKillTimer.gen = root._runGen
                        discoveryKillTimer.start()
                    }
                }
            }
        }

        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (BoundedOutput.append(root._stderrCapture, data)) return;
                if (AdbOperation.markOverflow(root._runCtx, root._runGen)) {
                    discoveryDeadlineTimer.stop()
                    if (adbProc.running) {
                        adbProc.running = false
                        discoveryKillTimer.gen = root._runGen
                        discoveryKillTimer.start()
                    }
                }
            }
        }

        onExited: function(exitCode, exitStatus) {
            root._onDiscoveryExited(exitCode, exitStatus)
        }

        onRunningChanged: {
            root._onDiscoveryRunningChanged()
        }
    }

    Timer {
        id: discoveryDeadlineTimer
        interval: AdbOperation.DEVICE_DISCOVERY_TIMEOUT_MS
        repeat: false
        property int gen: 0
        onTriggered: root._onDiscoveryTimeout(gen)
    }

    Timer {
        id: discoveryKillTimer
        interval: AdbOperation.SIGTERM_GRACE_MS
        repeat: false
        property int gen: 0
        onTriggered: root._onDiscoveryKill(gen)
    }
}
