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
        Qt.callLater(function() {
            if (root.opened && keyCatcher) keyCatcher.forceActiveFocus()
        })
    }

    function close() {
        root.opened = false
    }

    function dismiss() {
        if (root.shell && typeof root.shell.hide === "function") {
            root.shell.hide((root.manifest && root.manifest.id) || "dev.android-mirroring")
        } else {
            root.close()
        }
    }

    PanelWindow {
        visible: root.opened
        anchors { top: true; bottom: true; left: true; right: true }
        color: "transparent"
        WlrLayershell.namespace: "dev-android-mirroring"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
        exclusionMode: ExclusionMode.Ignore

        Rectangle {
            anchors.fill: parent
            color: Util.alpha(Color.background, 0.35)
        }

        MouseArea {
            anchors.fill: parent
            onClicked: root.dismiss()
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

            // Swallow clicks on the card so they do not bubble to the
            // scrim MouseArea and dismiss the panel.
            MouseArea {
                anchors.fill: parent
                onClicked: {}
            }

            Item {
                id: keyCatcher
                anchors.fill: parent

                focus: true
                Keys.onEscapePressed: root.dismiss()

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
}
