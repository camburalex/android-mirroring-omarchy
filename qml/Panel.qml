import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui

Item {
    id: root

    // Shell-injected properties available to every plugin entry point.
    property string omarchyPath: ""
    property var shell: null
    property var manifest: null
    property var pluginRegistry: null
    property var barWidgetRegistry: null

    property bool opened: false

    function open(payloadJson) {
        root.opened = true
    }

    function close() {
        root.opened = false
    }

    PanelWindow {
        id: panel
        visible: root.opened
        anchors { top: true; bottom: true; left: true; right: true }
        color: "transparent"
        WlrLayershell.namespace: "dev-android-mirroring"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
        exclusionMode: ExclusionMode.Ignore
        mask: Region {}

        Rectangle {
            anchors.fill: parent
            color: Util.alpha(Color.background, 0.35)
        }

        BorderSurface {
            id: card
            anchors.centerIn: parent
            width: Style.space(280)
            height: Style.space(160)
            radius: Style.cornerRadius
            color: Color.background
            borderSpec: Border.surfaceSpec(
                "popups",
                "border",
                Color.popups.border,
                Math.max(1, Style.space(2))
            )

            Text {
                anchors.centerIn: parent
                text: "\u2026"
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.body
            }
        }
    }
}
