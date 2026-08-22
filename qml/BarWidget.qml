import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

Panel {
    id: root

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    DeviceManager {
        id: deviceManager
    }

    Connections {
        target: root
        function onOpenedChanged() {
            if (root.opened) deviceManager.refresh()
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

    KeyboardPanel {
        id: panel
        anchorItem: button
        owner: root
        bar: root.bar
        open: root.opened
        focusTarget: keyCatcher
        centerOnBar: true
        contentWidth: Style.space(280)
        contentHeight: Math.max(Style.space(160), contentLayout.implicitHeight + Style.space(32))

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            onCloseRequested: root.close()

            ColumnLayout {
                id: contentLayout
                anchors.fill: parent
                spacing: Style.space(12)

                RowLayout {
                    Layout.fillWidth: true

                    Text {
                        text: "Android Mirroring"
                        color: Color.foreground
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                    }

                    Button {
                        text: "Refresh"
                        enabled: !deviceManager.busy
                        Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                        onClicked: deviceManager.refresh()
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
                    Layout.fillWidth: true
                }

                Text {
                    visible: !deviceManager.busy && deviceManager.error !== ""
                    text: deviceManager.error
                    color: Color.urgent
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                Text {
                    visible: !deviceManager.busy && deviceManager.error === "" && deviceManager.devices.length === 0
                    text: "No Android devices detected."
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                Repeater {
                    model: deviceManager.devices
                    visible: !deviceManager.busy && deviceManager.error === ""

                    RowLayout {
                        Layout.fillWidth: true

                        Text {
                            text: modelData.label
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                            Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                        }

                        Text {
                            text: deviceManager.stateText(modelData)
                            color: Color.foreground
                            font.family: Style.font.family
                            font.pixelSize: Style.font.body
                            textFormat: Text.PlainText
                            wrapMode: Text.WordWrap
                            Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                        }
                    }
                }

                Button {
                    text: "Close"
                    Layout.alignment: Qt.AlignHCenter
                    onClicked: root.close()
                }
            }
        }
    }
}
