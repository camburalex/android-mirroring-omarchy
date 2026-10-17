import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import qs.Commons
import qs.Ui
import "ScrcpyCommand.js" as ScrcpyCommand
import "WirelessCommand.js" as WirelessCommand
import "QrPairing.js" as QrPairing

Panel {
    id: root

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    property var displayItems: []
    property string _formError: ""
    property string _wirelessMode: "menu" // menu, qr, pair-step1, pair-step2, already, update
    property string _step1Endpoint: ""
    property string _pendingWirelessEndpoint: ""
    property string _pendingRecordId: ""
    property var _updateRecord: null
    property string _confirmRemoveId: ""

    property string _selectedPreset: "balanced"
    property bool _audioOn: true
    property bool _screenOff: false
    property bool _recordingOn: false
    readonly property bool _controlsEnabled: !scrcpyBackend.running && !scrcpyBackend.starting && !scrcpyBackend.stopping

    DependencyManager {
        id: dependencies
        onBecameReady: {
            if (root.opened) deviceManager.refresh()
        }
    }

    DeviceManager {
        id: deviceManager
    }

    ScrcpyBackend {
        id: scrcpyBackend
    }

    WirelessManager {
        id: wirelessManager
    }

    QrPairingManager {
        id: qrPairing
        wireless: wirelessManager
    }

    SavedDeviceStore {
        id: savedStore
    }

    Connections {
        target: root
        function onOpenedChanged() {
            if (root.opened) {
                dependencies.check()
                deviceManager.refresh()
                return
            }
            root._confirmRemoveId = ""
            // A QR code nobody can see cannot be scanned. Drop the session so
            // its one-time credentials do not outlive the open panel.
            if (qrPairing.state === "preparing" || qrPairing.state === "waiting") {
                root._setWirelessMode("menu")
            }
        }
    }

    Connections {
        target: scrcpyBackend
        function onSessionStarted() {
            // Dismiss the control panel once the backend confirms scrcpy has
            // actually started. Do not close directly from the Mirror click.
            root.close()
        }
        function onSessionEnded(expected, exitCode) {
            // Refresh discovery so an unplug or a recovered device is shown
            // correctly after the session finishes.
            deviceManager.refresh()
        }
    }

    Connections {
        target: wirelessManager
        function onConnected(endpoint) { root._onWirelessConnected(endpoint) }
        function onStateChanged() {
            if (wirelessManager.state === "error") {
                root._pendingWirelessEndpoint = ""
                root._pendingRecordId = ""
            }
        }
    }

    Connections {
        target: deviceManager
        function onDevicesChanged() { root._rebuildDisplayItems() }
        function onRefreshCompleted(success) { root._onDevicesRefreshed() }
    }

    Connections {
        target: savedStore
        function onDevicesChanged() {
            root._rebuildKnownWirelessSerials()
            root._rebuildDisplayItems()
        }
    }

    BarIconButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: "\uf10b"

        onPressed: function(b) {
            if (b !== Qt.LeftButton) return
            root.toggle()
        }
    }

    function _setWirelessMode(mode) {
        if (mode !== "update") {
            root._updateRecord = null
        }
        // Any mode change away from an in-flight connection flow drops the
        // transient connect-intent state. It will be set again if the user
        // actually starts a new connection.
        root._pendingRecordId = ""
        root._pendingWirelessEndpoint = ""
        if (mode !== "qr") qrPairing.cancel()
        root._wirelessMode = mode
        root._formError = ""
        wirelessManager.clearError()
    }

    function _startQrPairing() {
        if (wirelessManager.busy) return
        scrcpyBackend.clearError()
        wirelessManager.clearError()
        root._formError = ""
        root._pendingRecordId = ""
        qrPairing.start()
    }

    function _qrStatusText() {
        if (qrPairing.state === "preparing") return "Generating QR code\u2026"
        if (qrPairing.state === "waiting") return "Waiting for your phone to scan\u2026"
        if (qrPairing.state === "locating") return "Paired. Finding your phone\u2026"
        return ""
    }

    function _onWirelessConnected(endpoint) {
        root._pendingWirelessEndpoint = endpoint
        deviceManager.wirelessEndpoint = endpoint
        deviceManager.refresh()
    }

    function _onDevicesRefreshed() {
        root._rebuildDisplayItems()

        if (root._pendingWirelessEndpoint === "") return

        var live = null
        var devices = deviceManager.devices || []
        for (var i = 0; i < devices.length; i++) {
            if (devices[i].serial === root._pendingWirelessEndpoint
                && devices[i].connection === "wireless"
                && devices[i].rawState === "device") {
                live = devices[i]
                break
            }
        }

        savedStore.addOrUpdate(root._pendingWirelessEndpoint, live, root._pendingRecordId)
        root._pendingWirelessEndpoint = ""
        root._pendingRecordId = ""

        if (wirelessManager.errorMessage === "") root._setWirelessMode("menu")
    }

    function _matchesSavedRecord(device, saved) {
        for (var i = 0; i < saved.length; i++) {
            if (device.serial === saved[i].lastKnownEndpoint || device.serial === saved[i].adbSerial) return true
        }
        return false
    }

    function _rebuildDisplayItems() {
        var saved = savedStore.devices || []
        var live = (deviceManager.devices || []).filter(function(device) {
            return device.rawState !== "offline" || !root._matchesSavedRecord(device, saved)
        })
        var result = []
        var confirmRowVisible = false

        for (var i = 0; i < live.length; i++) {
            result.push({ kind: "live", device: live[i] })
        }

        for (var j = 0; j < saved.length; j++) {
            var record = saved[j]
            var isLive = false
            for (var k = 0; k < live.length; k++) {
                if (live[k].serial === record.lastKnownEndpoint
                    || live[k].serial === record.adbSerial) {
                    isLive = true
                    break
                }
            }
            if (!isLive) {
                result.push({ kind: "saved", record: record })
                if (record.id === root._confirmRemoveId) confirmRowVisible = true
            }
        }

        root.displayItems = result
        if (!confirmRowVisible) root._confirmRemoveId = ""
    }

    // Build the set of known wireless identities for the parser. This lets a
    // previously saved phone be classified as "Wireless Ready" after a shell
    // restart, as long as the live ADB serial exactly matches a saved endpoint
    // or adbSerial.
    function _rebuildKnownWirelessSerials() {
        var set = {}
        var saved = savedStore.devices || []
        for (var i = 0; i < saved.length; i++) {
            var rec = saved[i]
            if (rec.lastKnownEndpoint) set[rec.lastKnownEndpoint] = true
            if (rec.adbSerial && rec.adbSerial !== rec.lastKnownEndpoint) {
                set[rec.adbSerial] = true
            }
        }
        var result = []
        for (var k in set) result.push(k)
        deviceManager.knownWirelessSerials = result
    }

    function _moveFocus(direction) {
        var current = Window.activeFocusItem
        if (!current || !current.nextItemInFocusChain) return
        var next = current.nextItemInFocusChain(direction > 0)
        if (next && next !== current) next.forceActiveFocus()
    }

    function _activateFocusedItem() {
        var current = Window.activeFocusItem
        if (current && typeof current.actionFn === "function") current.actionFn()
    }

    function _buildOptions() {
        return {
            preset: root._selectedPreset,
            audioEnabled: root._audioOn,
            screenOff: root._screenOff,
            recordingEnabled: root._recordingOn
        }
    }

    function _setPreset(preset) {
        if (ScrcpyCommand.PRESETS[preset]) root._selectedPreset = preset
    }

    function _cycleAudio() {
        root._audioOn = !root._audioOn
    }

    function _cycleScreenOff() {
        root._screenOff = !root._screenOff
    }

    function _cycleRecording() {
        root._recordingOn = !root._recordingOn
    }

    function _startPairStep2() {
        var endpoint = step1ConnAddrLoader.item.text
        var check = WirelessCommand.validateEndpoint(endpoint)
        if (!check.ok) {
            root._formError = "Connection address is invalid. " + check.reason
            return
        }
        root._formError = ""
        root._step1Endpoint = endpoint
        root._setWirelessMode("pair-step2")
    }

    function _pairAndConnect() {
        if (wirelessManager.busy) return
        scrcpyBackend.clearError()
        wirelessManager.clearError()
        root._formError = ""
        wirelessManager.pairAndConnect(
            pairingAddrLoader.item.text,
            root._step1Endpoint,
            pairingCodeLoader.item.text
        )
        pairingCodeLoader.item.text = ""
    }

    function _connectFromField() {
        if (wirelessManager.busy) return

        var endpoint = connectAddrLoader.item.text
        var check = WirelessCommand.validateEndpoint(endpoint)
        if (!check.ok) {
            root._formError = "Connection address is invalid. " + check.reason
            return
        }

        root._formError = ""
        scrcpyBackend.clearError()
        wirelessManager.clearError()

        root._pendingRecordId = ""
        if (root._updateRecord) root._pendingRecordId = root._updateRecord.id
        wirelessManager.connect(endpoint)
    }

    function _reconnectRecord(record) {
        if (wirelessManager.busy) return
        scrcpyBackend.clearError()
        wirelessManager.clearError()
        root._formError = ""
        root._pendingRecordId = record.id
        wirelessManager.connect(record.lastKnownEndpoint)
    }

    function _startUpdate(record) {
        root._updateRecord = record
        root._setWirelessMode("update")
        connectAddrLoader.item.text = record.lastKnownEndpoint
    }

    function _removeRecord(record) {
        if (wirelessManager.busy) return
        if (root._updateRecord && root._updateRecord.id === record.id) root._setWirelessMode("menu")
        root._confirmRemoveId = ""
        savedStore.remove(record.id)
    }

    KeyboardPanel {
        id: panel
        anchorItem: button
        owner: root
        bar: root.bar
        open: root.opened
        focusTarget: keyCatcher
        centerOnBar: true
        contentWidth: Style.space(280)
        contentHeight: Math.max(Style.space(160), panel.fittedContentHeight(contentLayout.implicitHeight))

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            blocked: (step1ConnAddrLoader.item !== null && step1ConnAddrLoader.item.activeFocus)
                || (pairingAddrLoader.item !== null && pairingAddrLoader.item.activeFocus)
                || (pairingCodeLoader.item !== null && pairingCodeLoader.item.activeFocus)
                || (connectAddrLoader.item !== null && connectAddrLoader.item.activeFocus)
            onCloseRequested: root.close()
            onTabRequested: function(direction) { root._moveFocus(direction) }
            onActivateRequested: root._activateFocusedItem()

            Column {
                id: contentLayout
                width: parent.width
                spacing: Style.space(12)

                RowLayout {
                    width: parent.width
                    spacing: Style.space(8)

                    Text {
                        text: "Android Mirroring"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                    }

                    Item {
                        Layout.fillWidth: true
                    }

                    Button {
                        text: "Refresh"
                        enabled: !deviceManager.busy
                        property var actionFn: function() {
                            scrcpyBackend.clearError()
                            deviceManager.refresh()
                        }
                        onClicked: actionFn()
                        Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                    }
                }

                RowLayout {
                    width: parent.width
                    visible: scrcpyBackend.running || scrcpyBackend.starting || scrcpyBackend.stopping
                    spacing: Style.space(8)

                    Text {
                        text: scrcpyBackend.stopping
                            ? "Stopping\u2026"
                            : (scrcpyBackend.starting
                                ? "Starting\u2026"
                                : (scrcpyBackend.recordingActive ? "Mirroring \u00b7 Recording" : "Mirroring"))
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                    }

                    Item {
                        Layout.fillWidth: true
                    }

                    Button {
                        text: "Stop"
                        enabled: scrcpyBackend.running || scrcpyBackend.starting
                        property var actionFn: function() { scrcpyBackend.stopMirroring() }
                        onClicked: actionFn()
                        Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                    }
                }

                Column {
                    visible: dependencies.missing
                    width: parent.width
                    spacing: Style.space(8)

                    Text {
                        text: dependencies.installing
                            ? "Installing scrcpy and ADB\u2026 Finish the install in the terminal window."
                            : "Android Mirroring needs scrcpy and ADB, which are not installed yet."
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Text {
                        visible: dependencies.error !== ""
                        text: dependencies.error
                        color: Color.urgent
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Button {
                        text: dependencies.installing ? "Installing\u2026" : "Install scrcpy and ADB"
                        enabled: !dependencies.installing
                        property var actionFn: function() { dependencies.install() }
                        onClicked: actionFn()
                    }
                }

                Text {
                    visible: deviceManager.busy && !dependencies.missing
                    text: "Checking devices\u2026"
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Text {
                    visible: !dependencies.missing && !deviceManager.busy && deviceManager.error !== ""
                    text: deviceManager.error
                    color: Color.urgent
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Text {
                    visible: !deviceManager.busy && scrcpyBackend.errorMessage !== ""
                    text: scrcpyBackend.errorMessage
                    color: Color.urgent
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Text {
                    visible: savedStore.error !== ""
                    text: savedStore.error
                    color: Color.urgent
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Text {
                    visible: !deviceManager.busy && deviceManager.error === "" && scrcpyBackend.errorMessage === "" && root._formError !== ""
                    text: root._formError
                    color: Color.urgent
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Text {
                    visible: !dependencies.missing && !deviceManager.busy && deviceManager.error === "" && scrcpyBackend.errorMessage === "" && root._formError === "" && displayItems.length === 0
                    text: "No Android devices detected."
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Column {
                    id: controlsSection
                    width: parent.width
                    spacing: Style.space(12)
                    visible: !dependencies.missing

                    Text {
                        text: "Controls"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                    }

                    Column {
                        width: parent.width
                        spacing: Style.space(4)

                        Text {
                            text: "Preset"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            textFormat: Text.PlainText
                        }

                        Column {
                            width: parent.width
                            spacing: Style.space(4)

                            Button {
                                text: ScrcpyCommand.PRESETS["performance"].label
                                width: parent.width
                                focusable: true
                                bordered: true
                                selected: root._selectedPreset === "performance"
                                enabled: root._controlsEnabled
                                property var actionFn: function() { root._setPreset("performance") }
                                onClicked: actionFn()
                            }

                            Button {
                                text: ScrcpyCommand.PRESETS["balanced"].label
                                width: parent.width
                                focusable: true
                                bordered: true
                                selected: root._selectedPreset === "balanced"
                                enabled: root._controlsEnabled
                                property var actionFn: function() { root._setPreset("balanced") }
                                onClicked: actionFn()
                            }

                            Button {
                                text: ScrcpyCommand.PRESETS["quality"].label
                                width: parent.width
                                focusable: true
                                bordered: true
                                selected: root._selectedPreset === "quality"
                                enabled: root._controlsEnabled
                                property var actionFn: function() { root._setPreset("quality") }
                                onClicked: actionFn()
                            }
                        }
                    }

                    RowLayout {
                        width: parent.width
                        spacing: Style.space(8)

                        Text {
                            text: "Audio"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                            Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                        Button {
                            text: root._audioOn ? "On" : "Off"
                            focusable: true
                            bordered: true
                            selected: root._audioOn
                            enabled: root._controlsEnabled
                            property var actionFn: function() { root._cycleAudio() }
                            onClicked: actionFn()
                            Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                        }
                    }

                    RowLayout {
                        width: parent.width
                        spacing: Style.space(8)

                        Text {
                            text: "Screen off"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                            Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                        Button {
                            text: root._screenOff ? "On" : "Off"
                            focusable: true
                            bordered: true
                            selected: root._screenOff
                            enabled: root._controlsEnabled
                            property var actionFn: function() { root._cycleScreenOff() }
                            onClicked: actionFn()
                            Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                        }
                    }

                    RowLayout {
                        width: parent.width
                        spacing: Style.space(8)

                        Text {
                            text: "Recording"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                            Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                        }

                        Item {
                            Layout.fillWidth: true
                        }

                        Button {
                            text: root._recordingOn ? "On" : "Off"
                            focusable: true
                            bordered: true
                            selected: root._recordingOn
                            enabled: root._controlsEnabled
                            property var actionFn: function() { root._cycleRecording() }
                            onClicked: actionFn()
                            Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                        }
                    }

                    Text {
                        visible: root._recordingOn
                        text: "Saves to Videos/Android Mirroring"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                        opacity: 0.7
                    }
                }

                Column {
                    id: deviceList
                    width: parent.width
                    spacing: Style.space(10)
                    visible: !dependencies.missing && !deviceManager.busy && deviceManager.error === "" && scrcpyBackend.errorMessage === "" && displayItems.length > 0

                    Repeater {
                        model: root.displayItems

                        delegate: Column {
                            width: parent.width
                            spacing: Style.space(2)

                            property bool isLiveDevice: modelData.kind === "live"
                            property string recordId: !isLiveDevice && modelData.record && modelData.record.id ? modelData.record.id : ""
                            property bool isConfirmingRemove: recordId !== "" && root._confirmRemoveId === recordId
                            property bool isActive: isLiveDevice
                                && scrcpyBackend.activeSerial === modelData.device.serial
                                && (scrcpyBackend.running || scrcpyBackend.starting || scrcpyBackend.stopping)

                            RowLayout {
                                width: parent.width
                                spacing: Style.space(8)
                                visible: isLiveDevice

                                Text {
                                    id: liveDeviceLabel
                                    text: isLiveDevice ? modelData.device.label : ""
                                    color: isActive ? Color.accent : Color.foreground
                                    font.family: Style.font.family
                                    font.pixelSize: Style.font.body
                                    textFormat: Text.PlainText
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                                }

                                Button {
                                    id: liveMirrorBtn
                                    visible: isLiveDevice
                                        && modelData.device.rawState === "device"
                                        && !isActive
                                        && !scrcpyBackend.running
                                        && !scrcpyBackend.starting
                                        && !scrcpyBackend.stopping
                                    text: "Mirror"
                                    property var actionFn: function() { scrcpyBackend.startMirroring(modelData.device.serial, root._buildOptions()) }
                                    onClicked: actionFn()
                                    Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                                }

                                Text {
                                    visible: isLiveDevice && isActive
                                    text: "Active"
                                    color: Color.accent
                                    font.family: Style.font.family
                                    font.pixelSize: Style.font.body
                                    textFormat: Text.PlainText
                                    Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                                }
                            }

                            Text {
                                visible: isLiveDevice && !isActive
                                text: isLiveDevice ? deviceManager.stateText(modelData.device) : ""
                                color: Color.foreground
                                font.family: Style.font.family
                                font.pixelSize: Style.font.body
                                textFormat: Text.PlainText
                                wrapMode: Text.WordWrap
                                width: parent.width
                            }

                            Column {
                                width: parent.width
                                spacing: Style.space(4)
                                visible: !isLiveDevice

                                RowLayout {
                                    width: parent.width
                                    spacing: Style.space(8)

                                    Text {
                                        text: !isLiveDevice && modelData.record
                                            ? (modelData.record.model || modelData.record.lastKnownEndpoint)
                                            : ""
                                        color: Color.foreground
                                        font.family: Style.font.family
                                        font.pixelSize: Style.font.body
                                        textFormat: Text.PlainText
                                        elide: Text.ElideRight
                                        Layout.fillWidth: true
                                        Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                                    }

                                    PanelActionButton {
                                        visible: recordId !== ""
                                        iconText: "\udb80\udd59"
                                        tooltipText: "Remove from list"
                                        foreground: Color.foreground
                                        hoverColor: Color.urgent
                                        enabled: !wirelessManager.busy
                                        onClicked: root._confirmRemoveId = isConfirmingRemove ? "" : recordId
                                        Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                                    }
                                }

                                Text {
                                    text: "Wireless \u00b7 Unavailable"
                                    color: Color.foreground
                                    font.family: Style.font.family
                                    font.pixelSize: Style.font.bodySmall
                                    textFormat: Text.PlainText
                                    wrapMode: Text.WordWrap
                                    width: parent.width
                                }

                                RowLayout {
                                    width: parent.width
                                    spacing: Style.space(8)
                                    visible: !isConfirmingRemove

                                    Item {
                                        Layout.fillWidth: true
                                    }

                                    Button {
                                        text: "Reconnect"
                                        enabled: !wirelessManager.busy
                                        property var actionFn: function() { root._reconnectRecord(modelData.record) }
                                        onClicked: actionFn()
                                    }

                                    Button {
                                        text: "Update"
                                        enabled: !wirelessManager.busy
                                        property var actionFn: function() { root._startUpdate(modelData.record) }
                                        onClicked: actionFn()
                                    }
                                }

                                RowLayout {
                                    width: parent.width
                                    spacing: Style.space(8)
                                    visible: isConfirmingRemove

                                    Text {
                                        text: "Remove from list?"
                                        color: Color.foreground
                                        font.family: Style.font.family
                                        font.pixelSize: Style.font.body
                                        textFormat: Text.PlainText
                                        wrapMode: Text.WordWrap
                                        Layout.fillWidth: true
                                        Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                                    }

                                    Button {
                                        text: "Remove"
                                        foreground: Color.urgent
                                        enabled: !wirelessManager.busy
                                        property var actionFn: function() { root._removeRecord(modelData.record) }
                                        onClicked: actionFn()
                                    }

                                    Button {
                                        text: "Cancel"
                                        property var actionFn: function() { root._confirmRemoveId = "" }
                                        onClicked: actionFn()
                                    }
                                }
                            }

                            Text {
                                visible: !isLiveDevice && wirelessManager.errorMessage !== "" && wirelessManager.state === "error"
                                text: wirelessManager.errorMessage
                                color: Color.urgent
                                font.family: Style.font.family
                                font.pixelSize: Style.font.body
                                textFormat: Text.PlainText
                                wrapMode: Text.WordWrap
                                width: parent.width
                            }
                        }
                    }
                }

                Column {
                    id: wirelessSection
                    width: parent.width
                    spacing: Style.space(10)
                    visible: !dependencies.missing

                    // ---- menu ------------------------------------------------

                    Text {
                        visible: root._wirelessMode === "menu"
                        text: "Wireless"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                    }

                    Text {
                        visible: root._wirelessMode === "menu"
                        text: "Pair a new phone over Wi-Fi with a QR code or a pairing code, or connect a phone that is already paired."
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Button {
                        visible: root._wirelessMode === "menu"
                        text: "Pair with QR code"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() {
                            root._setWirelessMode("qr")
                            root._startQrPairing()
                        }
                        onClicked: actionFn()
                    }

                    Button {
                        visible: root._wirelessMode === "menu"
                        text: "Pair with pairing code"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() { root._setWirelessMode("pair-step1") }
                        onClicked: actionFn()
                    }

                    Button {
                        visible: root._wirelessMode === "menu"
                        text: "Already paired? Connect"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() { root._setWirelessMode("already") }
                        onClicked: actionFn()
                    }

                    // ---- pair with QR code ----------------------------------

                    Text {
                        visible: root._wirelessMode === "qr"
                        text: "Pair with QR code"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                    }

                    Text {
                        visible: root._wirelessMode === "qr" && (qrPairing.state === "preparing" || qrPairing.state === "waiting")
                        text: "On your phone, open Wireless debugging, tap \"Pair device with QR code\", and scan this code. The phone and computer must be on the same network."
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    // Dot-style QR code in the theme's own two colours. Data
                    // modules are round dots and the three finder patterns are
                    // rounded shapes. The darker theme colour is always the
                    // dots and the lighter one the backdrop, so the code stays
                    // dark-on-light for phone cameras on any theme; the quiet
                    // zone is part of the matrix.
                    Item {
                        visible: root._wirelessMode === "qr" && qrPairing.state === "waiting" && qrPairing.qrSize > 0
                        width: parent.width
                        height: qrCanvas.height

                        Rectangle {
                            id: qrCanvas
                            readonly property int moduleSize: qrPairing.qrSize > 0
                                ? Math.max(2, Math.floor(parent.width / qrPairing.qrSize))
                                : 0

                            readonly property var palette: QrPairing.pickQrPalette(Color.foreground, Color.background)
                            readonly property color dotColor: Qt.rgba(palette.dark.r, palette.dark.g, palette.dark.b, 1)

                            anchors.horizontalCenter: parent.horizontalCenter
                            width: qrPairing.qrSize * moduleSize
                            height: width
                            color: Qt.rgba(palette.light.r, palette.light.g, palette.light.b, 1)
                            // Stays well inside the quiet zone.
                            radius: moduleSize * 2

                            Grid {
                                anchors.fill: parent
                                columns: Math.max(1, qrPairing.qrSize)

                                Repeater {
                                    model: qrPairing.qrSize * qrPairing.qrSize

                                    Rectangle {
                                        required property int index
                                        readonly property int matrixRowIndex: Math.floor(index / qrPairing.qrSize)
                                        readonly property int matrixColumn: index % qrPairing.qrSize
                                        readonly property string matrixRow: qrPairing.qrRows[matrixRowIndex] || ""

                                        width: qrCanvas.moduleSize
                                        height: qrCanvas.moduleSize
                                        radius: width / 2
                                        color: matrixRow.charAt(matrixColumn) === "1"
                                            && !QrPairing.isFinderModule(matrixRowIndex, matrixColumn, qrPairing.qrSize)
                                            ? qrCanvas.dotColor : "transparent"
                                    }
                                }
                            }

                            // Finder patterns: a 7-module rounded square, a
                            // 5-module gap, and a 3-module rounded centre.
                            Repeater {
                                model: QrPairing.finderOrigins(qrPairing.qrSize)

                                Rectangle {
                                    required property var modelData

                                    x: modelData.col * qrCanvas.moduleSize
                                    y: modelData.row * qrCanvas.moduleSize
                                    width: QrPairing.FINDER_SIZE * qrCanvas.moduleSize
                                    height: width
                                    radius: qrCanvas.moduleSize * 2
                                    color: qrCanvas.dotColor

                                    Rectangle {
                                        anchors.centerIn: parent
                                        width: 5 * qrCanvas.moduleSize
                                        height: width
                                        radius: qrCanvas.moduleSize * 1.25
                                        color: qrCanvas.color

                                        Rectangle {
                                            anchors.centerIn: parent
                                            width: 3 * qrCanvas.moduleSize
                                            height: width
                                            radius: qrCanvas.moduleSize
                                            color: qrCanvas.dotColor
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Text {
                        visible: root._wirelessMode === "qr" && root._qrStatusText() !== ""
                        text: root._qrStatusText()
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Text {
                        visible: root._wirelessMode === "qr" && qrPairing.errorMessage !== ""
                        text: qrPairing.errorMessage
                        color: Color.urgent
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Button {
                        visible: root._wirelessMode === "qr" && qrPairing.state === "error"
                        text: "New QR code"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() { root._startQrPairing() }
                        onClicked: actionFn()
                    }

                    // ---- pair step 1 ----------------------------------------

                    Text {
                        visible: root._wirelessMode === "pair-step1"
                        text: "Pair with pairing code"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                    }

                    Column {
                        width: parent.width
                        spacing: Style.space(2)
                        visible: root._wirelessMode === "pair-step1"

                        Text {
                            text: "Wireless IP & port"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                        }

                        Text {
                            text: "On your phone, open Wireless debugging and enter the IP address & port shown on the main screen."
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            textFormat: Text.PlainText
                            wrapMode: Text.WordWrap
                            width: parent.width
                        }

                        // Each field exists only while its form is on screen, so typed text,
                        // including the pairing code, is dropped on Back or panel close.
                        Loader {
                            id: step1ConnAddrLoader
                            width: parent.width
                            active: panel.visible && parent.visible
                            sourceComponent: KeyEntryField {
                                placeholderText: "192.168.1.20:5555"
                                onAccepted: nextToPairBtn.actionFn()
                            }
                        }
                    }

                    Button {
                        id: nextToPairBtn
                        visible: root._wirelessMode === "pair-step1"
                        text: "Next: Pair device"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() { root._startPairStep2() }
                        onClicked: actionFn()
                    }

                    // ---- pair step 2 ----------------------------------------

                    Text {
                        visible: root._wirelessMode === "pair-step2"
                        text: "Pair device"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                    }

                    Text {
                        visible: root._wirelessMode === "pair-step2"
                        text: "On your phone, tap \"Pair device with pairing code\". Keep that popup open until pairing finishes."
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Text {
                        visible: root._wirelessMode === "pair-step2" && root._step1Endpoint !== ""
                        text: "Connection address: " + root._step1Endpoint
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Column {
                        width: parent.width
                        spacing: Style.space(2)
                        visible: root._wirelessMode === "pair-step2"

                        Text {
                            text: "Pairing IP & port"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                        }

                        Text {
                            text: "Enter the IP address & port shown inside the pairing-code popup."
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            textFormat: Text.PlainText
                            wrapMode: Text.WordWrap
                            width: parent.width
                        }

                        Loader {
                            id: pairingAddrLoader
                            width: parent.width
                            active: panel.visible && parent.visible
                            sourceComponent: KeyEntryField {
                                placeholderText: "192.168.1.20:37123"
                                onAccepted: pairBtn.actionFn()
                            }
                        }
                    }

                    Column {
                        width: parent.width
                        spacing: Style.space(2)
                        visible: root._wirelessMode === "pair-step2"

                        Text {
                            text: "Pairing code"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                        }

                        Text {
                            text: "Enter the 6-digit code from the same popup."
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            textFormat: Text.PlainText
                            wrapMode: Text.WordWrap
                            width: parent.width
                        }

                        Loader {
                            id: pairingCodeLoader
                            width: parent.width
                            active: panel.visible && parent.visible
                            sourceComponent: KeyEntryField {
                                placeholderText: "123456"
                                kind: "code"
                                password: true
                                onAccepted: pairBtn.actionFn()
                            }
                        }
                    }

                    Button {
                        id: pairBtn
                        visible: root._wirelessMode === "pair-step2"
                        text: "Pair & Connect"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() { root._pairAndConnect() }
                        onClicked: actionFn()
                    }

                    // ---- already paired / update address --------------------

                    Text {
                        visible: root._wirelessMode === "already" || root._wirelessMode === "update"
                        text: root._wirelessMode === "already" ? "Already paired? Connect" : "Update address"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                    }

                    Column {
                        width: parent.width
                        spacing: Style.space(2)
                        visible: root._wirelessMode === "already" || root._wirelessMode === "update"

                        Text {
                            text: "Wireless IP & port"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                        }

                        Text {
                            text: "Use the IP address & port shown on the main Wireless debugging screen."
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            textFormat: Text.PlainText
                            wrapMode: Text.WordWrap
                            width: parent.width
                        }

                        Loader {
                            id: connectAddrLoader
                            width: parent.width
                            active: panel.visible && parent.visible
                            sourceComponent: KeyEntryField {
                                placeholderText: "192.168.1.20:5555"
                                onAccepted: connectBtn.actionFn()
                            }
                        }
                    }

                    Button {
                        id: connectBtn
                        visible: root._wirelessMode === "already" || root._wirelessMode === "update"
                        text: "Connect"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() { root._connectFromField() }
                        onClicked: actionFn()
                    }

                    // ---- shared status / progress ---------------------------

                    Text {
                        visible: wirelessManager.busy
                        text: wirelessManager.state === "pairing" ? "Pairing\u2026" : "Connecting\u2026"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Text {
                        visible: wirelessManager.errorMessage !== "" && root._wirelessMode !== "menu"
                        text: wirelessManager.errorMessage
                        color: Color.urgent
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    // ---- navigation ----------------------------------------

                    Button {
                        visible: root._wirelessMode !== "menu"
                        text: "Back"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() { root._setWirelessMode("menu") }
                        onClicked: actionFn()
                    }
                }

                RowLayout {
                    width: parent.width

                    Item {
                        Layout.fillWidth: true
                    }

                    Button {
                        id: closeBtn
                        text: "Close"
                        property var actionFn: function() { root.close() }
                        onClicked: actionFn()
                        Layout.alignment: Qt.AlignHCenter
                    }

                    Item {
                        Layout.fillWidth: true
                    }
                }
            }
        }
    }
}
