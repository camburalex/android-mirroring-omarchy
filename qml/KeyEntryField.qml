import QtQuick
import qs.Commons
import qs.Ui
import "KeyEntry.js" as KeyEntry

// Single-line entry for the wireless address and pairing-code forms.
//
// The field is plain Text driven by key presses, not a Qt editable text
// control, so the plugin never requests clipboard data and has no paste,
// selection, or input-method handling. KeyEntry.js decides what each key does.
// Styling follows the Omarchy kit's TextField.
//
// When focused, the panel's PanelKeyCatcher must be `blocked` so typed letters
// and Space reach this field instead of driving the panel.
Item {
    id: root

    property string text: ""
    property string placeholderText: ""
    // KeyEntry.KIND_ENDPOINT ("endpoint") or KeyEntry.KIND_CODE ("code").
    property string kind: KeyEntry.KIND_ENDPOINT
    property bool password: false
    property int cursorPosition: 0

    property color foreground: Color.foreground
    property color accent: Color.accent
    property real horizontalPadding: Style.spacing.controlPaddingX
    property real verticalPadding: Style.spacing.inputPaddingY

    signal accepted()

    readonly property bool _focused: activeFocus
    readonly property bool _hot: pointer.containsMouse
    readonly property var _borderSpec: Border.controlSpec(_focused ? "focus" : (_hot ? "hover-cursor" : "normal"), root.foreground, root.accent)
    readonly property real _leftInset: root.horizontalPadding + Border.left(root._borderSpec)
    readonly property real _rightInset: root.horizontalPadding + Border.right(root._borderSpec)

    activeFocusOnTab: true
    implicitWidth: root._leftInset + label.implicitWidth + root._rightInset
    implicitHeight: root.verticalPadding + Border.top(root._borderSpec)
        + label.implicitHeight
        + root.verticalPadding + Border.bottom(root._borderSpec)

    Accessible.role: Accessible.EditableText
    Accessible.name: root.placeholderText
    Accessible.passwordEdit: root.password

    // Text set from outside (Update pre-fill, cleared pairing code) puts the
    // caret at the end; key presses set the caret again right after the text.
    onTextChanged: root.cursorPosition = root.text.length

    Keys.onPressed: function(event) {
        var action = KeyEntry.keyAction({
            submit: event.key === Qt.Key_Return || event.key === Qt.Key_Enter,
            erase: event.key === Qt.Key_Backspace,
            eraseForward: event.key === Qt.Key_Delete,
            left: event.key === Qt.Key_Left,
            right: event.key === Qt.Key_Right,
            home: event.key === Qt.Key_Home,
            end: event.key === Qt.Key_End,
            command: (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) !== 0,
            text: event.text
        })
        var result = KeyEntry.applyKey(root.kind, root.text, root.cursorPosition, action, event.text)
        if (!result.consumed) return
        event.accepted = true
        if (result.text !== root.text) root.text = result.text
        root.cursorPosition = result.cursor
        if (result.submit) root.accepted()
    }

    BorderSurface {
        anchors.fill: parent
        color: Style.controlFill(root._focused, root._hot, root.foreground, root.accent)
        borderSpec: root._borderSpec
        radius: Style.cornerRadius
    }

    Item {
        id: viewport
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: root._leftInset
        anchors.rightMargin: root._rightInset
        anchors.verticalCenter: parent.verticalCenter
        height: label.implicitHeight
        clip: true

        Text {
            id: label
            // Text wider than the field scrolls left just enough to keep the caret in view.
            x: Math.min(0, viewport.width - caretMetrics.advanceWidth - caret.width)
            anchors.verticalCenter: parent.verticalCenter
            text: root.text.length === 0 ? root.placeholderText
                : (root.password ? KeyEntry.mask(root.text) : root.text)
            color: root.text.length === 0 ? Qt.darker(root.foreground, 1.6) : root.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            textFormat: Text.PlainText
        }
    }

    // The mask has one mark per digit, so the caret index is the same in the shown text.
    TextMetrics {
        id: caretMetrics
        font: label.font
        text: root.text.length === 0 ? "" : label.text.substring(0, root.cursorPosition)
    }

    Rectangle {
        id: caret
        visible: root._focused
        width: 1
        height: Math.round(label.font.pixelSize * 1.2)
        x: viewport.x + label.x + caretMetrics.advanceWidth
        anchors.verticalCenter: viewport.verticalCenter
        color: root.foreground
    }

    MouseArea {
        id: pointer
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.IBeamCursor
        onClicked: root.forceActiveFocus()
    }
}
