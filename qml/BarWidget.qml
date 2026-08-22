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

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: "\u2026"
        horizontalMargin: 7.5

        onPressed: function(b) {
            if (!root.bar) return
            if (root.bar.shell && typeof root.bar.shell.toggle === "function")
                root.bar.shell.toggle(root.moduleName, "{}")
        }
    }
}
