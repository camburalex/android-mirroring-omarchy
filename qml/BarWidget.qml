import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import qs.Commons
import qs.Ui

Panel {
    id: root

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    DeviceManager {
        id: deviceManager
    }

    ScrcpyBackend {
        id: scrcpyBackend
    }

    WirelessManager {
        id: wirelessManager
    }

    Connections {
        target: root
        function onOpenedChanged() {
            if (root.opened) deviceManager.refresh()
        }
    }

    Connections {
        target: scrcpyBackend
        function onSessionStarted() {}
        function onSessionEnded(expected, exitCode) {
            // Refresh discovery so an unplug or a recovered device is shown
            // correctly after the session finishes.
            deviceManager.refresh()
        }
    }

    Connections {
        target: wirelessManager
        function onConnected(endpoint) {
            deviceManager.wirelessEndpoint = endpoint
            deviceManager.refresh()
        }
    }

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: "\u2026"

        onPressed: function(b) {
            if (b !== Qt.LeftButton) return
            root.toggle()
        }
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
            blocked: pairingAddrField.activeFocus || pairingCodeField.activeFocus || connAddrField.activeFocus
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
                            : (scrcpyBackend.starting ? "Starting\u2026" : "Mirroring")
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
                    visible: !deviceManager.busy && deviceManager.error === "" && scrcpyBackend.errorMessage === "" && deviceManager.devices.length === 0
                    text: "No Android devices detected."
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    width: parent.width
                }

                Column {
                    id: deviceList
                    width: parent.width
                    spacing: Style.space(10)
                    visible: !deviceManager.busy && deviceManager.error === "" && scrcpyBackend.errorMessage === "" && deviceManager.devices.length > 0

                    Repeater {
                        model: deviceManager.devices

                        delegate: Column {
                            width: parent.width
                            spacing: Style.space(2)

                            property bool isActive: scrcpyBackend.activeSerial === modelData.serial
                                && (scrcpyBackend.running || scrcpyBackend.starting || scrcpyBackend.stopping)

                            RowLayout {
                                width: parent.width
                                spacing: Style.space(8)

                                Text {
                                    id: deviceLabel
                                    text: modelData.label
                                    color: isActive ? Color.accent : Color.foreground
                                    font.family: Style.font.family
                                    font.pixelSize: Style.font.body
                                    textFormat: Text.PlainText
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                                }

                                Button {
                                    id: rowActionBtn
                                    visible: !isActive
                                        && modelData.rawState === "device"
                                        && !scrcpyBackend.running
                                        && !scrcpyBackend.starting
                                        && !scrcpyBackend.stopping
                                    text: "Mirror"
                                    property var actionFn: function() { scrcpyBackend.startMirroring(modelData.serial) }
                                    onClicked: actionFn()
                                    Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                                }

                                Text {
                                    visible: isActive
                                    text: "Active"
                                    color: Color.accent
                                    font.family: Style.font.family
                                    font.pixelSize: Style.font.body
                                    textFormat: Text.PlainText
                                    Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                                }
                            }

                            Text {
                                visible: !isActive
                                text: deviceManager.stateText(modelData)
                                color: Color.foreground
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

                    Text {
                        text: "Pair wirelessly"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                    }

                    Column {
                        width: parent.width
                        spacing: Style.space(2)

                        Text {
                            text: "Pairing address"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                        }

                        Text {
                            text: "From ‘Pair device with pairing code’"
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
                        }
                    }

                    Column {
                        width: parent.width
                        spacing: Style.space(2)

                        Text {
                            text: "Pairing code"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                        }

                        Text {
                            text: "Temporary six-digit code"
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

                    Column {
                        width: parent.width
                        spacing: Style.space(2)

                        Text {
                            text: "Connection address"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                        }

                        Text {
                            text: "IP address & port on the main Wireless debugging screen"
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            textFormat: Text.PlainText
                            wrapMode: Text.WordWrap
                            width: parent.width
                        }

                        TextField {
                            id: connAddrField
                            width: parent.width
                            placeholderText: "192.168.1.20:5555"
                            onAccepted: pairBtn.actionFn()
                        }
                    }

                    Button {
                        id: pairBtn
                        text: "Pair"
                        enabled: !wirelessManager.busy
                        property var actionFn: function() {
                            scrcpyBackend.clearError()
                            wirelessManager.clearError()
                            wirelessManager.pairAndConnect(
                                pairingAddrField.text,
                                connAddrField.text,
                                pairingCodeField.text
                            )
                            pairingCodeField.text = ""
                        }
                        onClicked: actionFn()
                    }

                    Text {
                        visible: wirelessManager.busy
                        text: wirelessManager.state === "pairing" ? "Pairing…" : "Connecting…"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Text {
                        visible: wirelessManager.errorMessage !== ""
                        text: wirelessManager.errorMessage
                        color: Color.urgent
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
                    }

                    Text {
                        visible: wirelessManager.state === "connected"
                        text: "Connected. The device will appear in the list after Refresh."
                        color: Color.accent
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        wrapMode: Text.WordWrap
                        width: parent.width
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
