import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import qs.Commons
import qs.Ui
import "ScrcpyCommand.js" as ScrcpyCommand
import "WirelessCommand.js" as WirelessCommand

Panel {
    id: root

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    property var displayItems: []
    property string _formError: ""
    property string _wirelessMode: "menu" // menu, pair-step1, pair-step2, already, update
    property string _step1Endpoint: ""
    property string _pendingWirelessEndpoint: ""
    property string _pendingRecordId: ""
    property var _updateRecord: null

    property string _selectedPreset: "balanced"
    property bool _audioOn: true
    property bool _screenOff: false
    property bool _recordingOn: false
    readonly property bool _controlsEnabled: !scrcpyBackend.running && !scrcpyBackend.starting && !scrcpyBackend.stopping

    DeviceManager {
        id: deviceManager
    }

    ScrcpyBackend {
        id: scrcpyBackend
    }

    WirelessManager {
        id: wirelessManager
    }

    SavedDeviceStore {
        id: savedStore
    }

    Connections {
        target: root
        function onOpenedChanged() {
            if (root.opened) deviceManager.refresh()
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
        root._wirelessMode = mode
        root._formError = ""
        wirelessManager.clearError()
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

    function _rebuildDisplayItems() {
        var live = deviceManager.devices || []
        var saved = savedStore.devices || []
        var result = []

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
            if (!isLive) result.push({ kind: "saved", record: record })
        }

        root.displayItems = result
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
        var check = WirelessCommand.validateEndpoint(step1ConnAddrField.text)
        if (!check.ok) {
            root._formError = "Connection address is invalid. " + check.reason
            return
        }
        root._formError = ""
        root._step1Endpoint = step1ConnAddrField.text
        root._setWirelessMode("pair-step2")
        pairingAddrField.text = ""
        pairingCodeField.text = ""
    }

    function _pairAndConnect() {
        if (wirelessManager.busy) return
        scrcpyBackend.clearError()
        wirelessManager.clearError()
        root._formError = ""
        wirelessManager.pairAndConnect(
            pairingAddrField.text,
            root._step1Endpoint,
            pairingCodeField.text
        )
        pairingCodeField.text = ""
    }

    function _connectFromField() {
        if (wirelessManager.busy) return

        var endpoint = connectAddrField.text
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
        connectAddrField.text = record.lastKnownEndpoint
        root._setWirelessMode("update")
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
            blocked: step1ConnAddrField.activeFocus
                || pairingAddrField.activeFocus
                || pairingCodeField.activeFocus
                || connectAddrField.activeFocus
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

                Text {
                    visible: deviceManager.busy
                    text: "Checking devices\u2026"
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Text {
                    visible: !deviceManager.busy && deviceManager.error !== ""
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
                    visible: !deviceManager.busy && deviceManager.error === "" && scrcpyBackend.errorMessage === "" && root._formError === "" && displayItems.length === 0
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
                    visible: !deviceManager.busy && deviceManager.error === "" && scrcpyBackend.errorMessage === "" && displayItems.length > 0

                    Repeater {
                        model: root.displayItems

                        delegate: Column {
                            width: parent.width
                            spacing: Style.space(2)

                            property bool isLiveDevice: modelData.kind === "live"
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

                                Text {
                                    text: !isLiveDevice && modelData.record
                                        ? (modelData.record.model || modelData.record.lastKnownEndpoint)
                                        : ""
                                    color: Color.foreground
                                    font.family: Style.font.family
                                    font.pixelSize: Style.font.body
                                    textFormat: Text.PlainText
                                    elide: Text.ElideRight
                                    width: parent.width
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
                        text: "Pair a new phone over Wi-Fi, or connect a phone that is already paired."
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Button {
                        visible: root._wirelessMode === "menu"
                        text: "Pair a new phone"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() {
                            step1ConnAddrField.text = ""
                            root._setWirelessMode("pair-step1")
                        }
                        onClicked: actionFn()
                    }

                    Button {
                        visible: root._wirelessMode === "menu"
                        text: "Already paired? Connect"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() {
                            connectAddrField.text = ""
                            root._setWirelessMode("already")
                        }
                        onClicked: actionFn()
                    }

                    // ---- pair step 1 ----------------------------------------

                    Text {
                        visible: root._wirelessMode === "pair-step1"
                        text: "Pair a new phone"
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

                        TextField {
                            id: step1ConnAddrField
                            width: parent.width
                            placeholderText: "192.168.1.20:5555"
                            onAccepted: nextToPairBtn.actionFn()
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

                        TextField {
                            id: pairingAddrField
                            width: parent.width
                            placeholderText: "192.168.1.20:37123"
                            onAccepted: pairBtn.actionFn()
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

                        TextField {
                            id: pairingCodeField
                            width: parent.width
                            placeholderText: "123456"
                            password: true
                            maximumLength: 6
                            inputMethodHints: Qt.ImhDigitsOnly
                            onAccepted: pairBtn.actionFn()
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

                        TextField {
                            id: connectAddrField
                            width: parent.width
                            placeholderText: "192.168.1.20:5555"
                            onAccepted: connectBtn.actionFn()
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
