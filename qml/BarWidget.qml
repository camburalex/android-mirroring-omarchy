import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

Panel {
    id: root

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

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
        contentHeight: Style.space(160)

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            onCloseRequested: root.close()

            ColumnLayout {
                anchors.fill: parent
                spacing: Style.space(16)

                Text {
                    text: "Android Mirroring"
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    Layout.alignment: Qt.AlignHCenter | Qt.AlignVCenter
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
