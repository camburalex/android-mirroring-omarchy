import QtQuick
import Quickshell
import Quickshell.Io
import "QrPairing.js" as QrPairing
import "BoundedOutput.js" as BoundedOutput

// Cold-start-safe owner for the QR-code pairing session: the one-time
// credentials, the QR matrix, and the mDNS discovery processes.
// Uses Scope because it owns Quickshell.Io.Process children.
//
// The ADB work itself stays in WirelessManager. This object finds the pairing
// endpoint the phone advertises after scanning, hands it to
// WirelessManager.pair(), then finds the phone's main endpoint and hands that
// to WirelessManager.connect().
Scope {
    id: root

    // The WirelessManager that owns the adb pair/connect processes.
    property var wireless: null

    // idle, preparing, waiting, pairing, locating, connecting, error
    property string state: "idle"
    property string errorMessage: ""

    // Square matrix of "0"/"1" row strings, only populated while waiting for
    // the phone to scan.
    property var qrRows: []
    property int qrSize: 0

    readonly property bool active: state !== "idle" && state !== "error"

    // Transient state only. The password is written to qrencode stdin and
    // later to ADB stdin; it is never persisted, logged, or sent as an argv
    // element. The underscore names mark internal-only properties.
    property string _serviceName: ""
    property string _password: ""
    property string _pairedHost: ""
    property string _prepStep: "" // "", quiet, random, qr
    property var _randomCapture: null
    property var _qrCapture: null
    property var _browseBuffer: null

    function start() {
        if (root.active) return
        if (!root.wireless || root.wireless.busy) return

        root._reset()
        root.errorMessage = ""
        root.state = "preparing"
        prepareDeadlineTimer.restart()
        root._beginWhenQuiet()
    }

    // Abandon the session. An `adb pair` / `adb connect` already handed to
    // WirelessManager is not interrupted; it finishes under its own deadline.
    function cancel() {
        // Leave the active state first so the exit of a stopped process is
        // never mistaken for an unexpected one.
        root.state = "idle"
        root.errorMessage = ""
        root._reset()
    }

    function _fail(message) {
        root.errorMessage = message
        root.state = "error"
        root._reset()
    }

    function _clearSecrets() {
        root._serviceName = ""
        root._password = ""
        root.qrRows = []
        root.qrSize = 0
    }

    function _reset() {
        prepareDeadlineTimer.stop()
        scanDeadlineTimer.stop()
        locateDeadlineTimer.stop()
        quietTimer.stop()
        root._prepStep = ""
        root._pairedHost = ""
        root._randomCapture = null
        root._qrCapture = null
        root._browseBuffer = null
        root._clearSecrets()
        root._stop(randomProc)
        root._stop(qrProc)
        root._stop(pairBrowseProc)
        root._stop(connectBrowseProc)
    }

    function _stop(proc) {
        if (!proc.running) return
        proc.running = false
        killTimer.restart()
    }

    function _anyRunning() {
        return randomProc.running || qrProc.running
            || pairBrowseProc.running || connectBrowseProc.running
    }

    // Force-kill any process that ignored its termination request and is not
    // part of the current session step.
    function _killStragglers() {
        if (randomProc.running && root._prepStep !== "random") randomProc.signal(9)
        if (qrProc.running && root._prepStep !== "qr") qrProc.signal(9)
        if (pairBrowseProc.running && root.state !== "waiting") pairBrowseProc.signal(9)
        if (connectBrowseProc.running && root.state !== "locating") connectBrowseProc.signal(9)
    }

    // A previous session's processes may still be exiting. Wait for them so a
    // restart never reuses a Process that is still running.
    function _beginWhenQuiet() {
        if (root.state !== "preparing") return
        if (root._anyRunning()) {
            root._prepStep = "quiet"
            quietTimer.restart()
            return
        }
        root._startRandom()
    }

    function _startRandom() {
        root._prepStep = "random"
        root._randomCapture = BoundedOutput.create(256)
        randomProc.command = QrPairing.buildRandomCommand().argv
        randomProc.running = true
    }

    function _onRandomDone() {
        if (root.state !== "preparing" || root._prepStep !== "random") return

        var credentials = QrPairing.createCredentials(BoundedOutput.value(root._randomCapture))
        root._randomCapture = null
        if (!credentials.ok) {
            root._fail("Could not generate the QR code.")
            return
        }

        root._serviceName = credentials.serviceName
        root._password = credentials.password
        root._startQr()
    }

    function _startQr() {
        root._prepStep = "qr"
        root._qrCapture = BoundedOutput.create()
        qrProc.command = QrPairing.buildQrencodeCommand().argv
        qrProc.stdinEnabled = true
        qrProc.running = true
    }

    function _onQrDone() {
        if (root.state !== "preparing" || root._prepStep !== "qr") return
        root._prepStep = ""

        var matrix = QrPairing.parseQrMatrix(BoundedOutput.value(root._qrCapture))
        root._qrCapture = null
        if (matrix.size === 0) {
            root._fail("Could not generate the QR code. Make sure qrencode is installed.")
            return
        }

        prepareDeadlineTimer.stop()
        root.qrRows = matrix.rows
        root.qrSize = matrix.size
        root._browseBuffer = QrPairing.createLineBuffer()
        root.state = "waiting"
        if (root.state !== "waiting") return
        scanDeadlineTimer.restart()
        pairBrowseProc.command = QrPairing.buildBrowseCommand(QrPairing.PAIRING_SERVICE_TYPE).argv
        pairBrowseProc.running = true
    }

    // od and qrencode produce a few bytes and a few kilobytes. More than the
    // cap is not a result worth waiting for: stop the process now rather than
    // at the deadline.
    function _onPrepareOverflow() {
        if (root.state !== "preparing") return
        root._fail("Could not generate the QR code.")
    }

    function _onBrowseOverflow() {
        root._fail(root.state === "locating"
            ? "Paired, but network discovery returned an unexpectedly large response. Use \"Already paired? Connect\" with the address shown under Wireless debugging."
            : "Network discovery returned an unexpectedly large response.")
    }

    function _onPairBrowseData(data) {
        if (root.state !== "waiting" || !root._browseBuffer) return

        var lines = QrPairing.pushChunk(root._browseBuffer, data)
        if (QrPairing.isOverBudget(root._browseBuffer)) {
            root._onBrowseOverflow()
            return
        }
        for (var i = 0; i < lines.length; i++) {
            var endpoint = QrPairing.matchPairingService(
                QrPairing.parseBrowseLine(lines[i]), root._serviceName)
            if (endpoint !== "") {
                root._onPairingServiceFound(endpoint)
                return
            }
        }
    }

    function _onPairingServiceFound(endpoint) {
        scanDeadlineTimer.stop()

        var password = root._password
        root._clearSecrets()
        root._browseBuffer = null
        root._pairedHost = QrPairing.endpointHost(endpoint)
        root.state = "pairing"
        root._stop(pairBrowseProc)

        root.wireless.pair(endpoint, password)
        if (root.state === "pairing" && root.wireless.state !== "pairing") {
            root._fail("Another wireless operation is in progress. Try again.")
        }
    }

    function _onPaired() {
        if (root.state !== "pairing") return

        root._browseBuffer = QrPairing.createLineBuffer()
        root.state = "locating"
        if (root.state !== "locating") return
        locateDeadlineTimer.restart()
        connectBrowseProc.command = QrPairing.buildBrowseCommand(QrPairing.CONNECT_SERVICE_TYPE).argv
        connectBrowseProc.running = true
    }

    function _onConnectBrowseData(data) {
        if (root.state !== "locating" || !root._browseBuffer) return

        var lines = QrPairing.pushChunk(root._browseBuffer, data)
        if (QrPairing.isOverBudget(root._browseBuffer)) {
            root._onBrowseOverflow()
            return
        }
        for (var i = 0; i < lines.length; i++) {
            var endpoint = QrPairing.matchConnectService(
                QrPairing.parseBrowseLine(lines[i]), root._pairedHost)
            if (endpoint !== "") {
                root._onConnectServiceFound(endpoint)
                return
            }
        }
    }

    function _onConnectServiceFound(endpoint) {
        locateDeadlineTimer.stop()
        root._browseBuffer = null
        root.state = "connecting"
        root._stop(connectBrowseProc)

        root.wireless.connect(endpoint)
        if (root.state === "connecting" && root.wireless.state !== "connecting") {
            root._fail("Another wireless operation is in progress. Try again.")
        }
    }

    // avahi-browse is expected to run until this object stops it. If it exits
    // on its own (not installed, or the Avahi daemon is not running) the
    // session cannot continue.
    function _onBrowseStopped(expectedState) {
        if (root.state !== expectedState) return
        root._fail(expectedState === "locating"
            ? "Paired, but could not search the network for the phone. Use \"Already paired? Connect\" with the address shown under Wireless debugging."
            : "Could not search the network for the phone. Make sure the Avahi daemon is running.")
    }

    function _onWirelessStateChanged() {
        if (!root.wireless || root.wireless.state !== "error") return
        if (root.state !== "pairing" && root.state !== "connecting") return
        // WirelessManager carries the user-facing message for its own failure.
        root._fail("")
    }

    function _onWirelessConnected() {
        if (root.state !== "connecting") return
        root.cancel()
    }

    Connections {
        target: root.wireless
        function onPaired(pairingEndpoint) { root._onPaired() }
        function onConnected(endpoint) { root._onWirelessConnected() }
        function onStateChanged() { root._onWirelessStateChanged() }
    }

    Process {
        id: randomProc
        running: false
        command: []

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (!root._randomCapture) return
                if (!BoundedOutput.append(root._randomCapture, data)) root._onPrepareOverflow()
            }
        }

        // Diagnostics are not used. Chunk mode hands each piece over
        // immediately and nothing is retained.
        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {}
        }

        onExited: function(exitCode, exitStatus) {
            root._onRandomDone()
        }

        // Quickshell does not emit onExited when the binary cannot be started
        // (FailedToStart). This fallback returns the UI to an error state.
        onRunningChanged: {
            if (!randomProc.running) root._onRandomDone()
        }
    }

    Process {
        id: qrProc
        running: false
        command: []
        stdinEnabled: true

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) {
                if (!root._qrCapture) return
                if (!BoundedOutput.append(root._qrCapture, data)) root._onPrepareOverflow()
            }
        }

        // Diagnostics are not used. Chunk mode hands each piece over
        // immediately and nothing is retained.
        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {}
        }

        // qrencode reads the payload until end-of-file, so stdin is closed
        // right after the single write.
        onStarted: {
            if (root._prepStep === "qr" && root._password.length > 0) {
                qrProc.write(QrPairing.buildQrPayload(root._serviceName, root._password))
            }
            qrProc.stdinEnabled = false
        }

        onExited: function(exitCode, exitStatus) {
            root._onQrDone()
        }

        // FailedToStart fallback; see randomProc.
        onRunningChanged: {
            if (!qrProc.running) root._onQrDone()
        }
    }

    Process {
        id: pairBrowseProc
        running: false
        command: []

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) { root._onPairBrowseData(data) }
        }

        // Diagnostics are not used. Chunk mode hands each piece over
        // immediately and nothing is retained.
        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {}
        }

        onExited: function(exitCode, exitStatus) {
            root._onBrowseStopped("waiting")
        }

        // FailedToStart fallback; see randomProc.
        onRunningChanged: {
            if (!pairBrowseProc.running) root._onBrowseStopped("waiting")
        }
    }

    Process {
        id: connectBrowseProc
        running: false
        command: []

        stdout: SplitParser {
            splitMarker: ""
            onRead: function(data) { root._onConnectBrowseData(data) }
        }

        // Diagnostics are not used. Chunk mode hands each piece over
        // immediately and nothing is retained.
        stderr: SplitParser {
            splitMarker: ""
            onRead: function(data) {}
        }

        onExited: function(exitCode, exitStatus) {
            root._onBrowseStopped("locating")
        }

        // FailedToStart fallback; see randomProc.
        onRunningChanged: {
            if (!connectBrowseProc.running) root._onBrowseStopped("locating")
        }
    }

    Timer {
        id: prepareDeadlineTimer
        interval: QrPairing.PREPARE_TIMEOUT_MS
        repeat: false
        onTriggered: {
            if (root.state === "preparing") root._fail("Could not generate the QR code.")
        }
    }

    Timer {
        id: scanDeadlineTimer
        interval: QrPairing.SCAN_TIMEOUT_MS
        repeat: false
        onTriggered: {
            if (root.state === "waiting") root._fail("The QR code expired before a phone scanned it.")
        }
    }

    Timer {
        id: locateDeadlineTimer
        interval: QrPairing.LOCATE_TIMEOUT_MS
        repeat: false
        onTriggered: {
            if (root.state === "locating") {
                root._fail("Paired, but the phone's connection address was not found. Use \"Already paired? Connect\" with the address shown under Wireless debugging.")
            }
        }
    }

    Timer {
        id: quietTimer
        interval: 50
        repeat: false
        onTriggered: {
            if (root._prepStep === "quiet") root._beginWhenQuiet()
        }
    }

    Timer {
        id: killTimer
        interval: QrPairing.KILL_GRACE_MS
        repeat: false
        onTriggered: root._killStragglers()
    }
}
