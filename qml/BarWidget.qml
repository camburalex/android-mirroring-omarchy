import QtQuick
import qs.Commons
import qs.Ui

BarWidget {
    id: root

    // Shell-injected properties available to every plugin entry point.
    property string omarchyPath: ""
    property var shell: null
    property var manifest: null
    property var pluginRegistry: null
    property var barWidgetRegistry: null

    // Compact placeholder for the Omarchy bar.
    implicitWidth: label.implicitWidth + Style.space(16)
    implicitHeight: root.barSize

    Text {
        id: label
        anchors.centerIn: parent
        text: "\u2026"
        color: root.bar ? root.bar.foreground : Color.foreground
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.font.body
    }
}
