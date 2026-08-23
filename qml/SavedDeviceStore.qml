import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "SavedDeviceData.js" as SavedDeviceData

// Persistent known-device metadata for wireless connections.
// Lives in Quickshell.stateDir and writes atomically. Pairing codes and other
// credentials never reach this store.
Scope {
    id: root

    property var devices: []
    property bool loaded: false
    property string error: ""

    readonly property string _stateFilePath: Quickshell.stateDir + "/dev.android-mirroring.saved-devices.json"

    signal saved()

    function _load(raw) {
        var result = SavedDeviceData.parseState(raw);
        if (result.ok) {
            root.devices = result.devices;
            root.error = "";
            root.loaded = true;
        } else {
            root.devices = [];
            root.error = result.error || "Saved-devices state could not be loaded.";
            root.loaded = false;
        }
    }

    function _persist() {
        if (!root.loaded) return;
        stateFile.setText(SavedDeviceData.serializeState(root.devices));
    }

    // Add or update a record from a successful connection. The live device is
    // optional; if omitted a record with the endpoint as its serial is created.
    function addOrUpdate(endpoint, liveDevice, recordId) {
        if (!root.loaded) return;

        var update = { lastKnownEndpoint: endpoint };
        if (liveDevice) {
            if (liveDevice.model !== undefined) update.model = liveDevice.model;
            if (liveDevice.serial !== undefined) update.adbSerial = liveDevice.serial;
        }
        if (recordId) update.id = recordId;
        if (!update.adbSerial) update.adbSerial = endpoint;

        root.devices = SavedDeviceData.addOrUpdateRecord(root.devices, update);
        _persist();
    }

    // Update the stored endpoint for a specific record. Returns true if the id
    // was found. Use addOrUpdate instead when a live device is available.
    function updateEndpoint(recordId, endpoint) {
        if (!root.loaded) return false;
        var list = SavedDeviceData.updateEndpoint(root.devices, recordId, endpoint);
        if (!list) return false;
        root.devices = list;
        _persist();
        return true;
    }

    Process {
        id: ensureDirProc
        running: false
        command: ["mkdir", "-p", Quickshell.stateDir]
        onExited: function(exitCode, exitStatus) {
            if (exitCode !== 0) {
                root.error = "Could not create saved-devices state directory.";
                root.loaded = false;
                return;
            }
            stateFile.path = root._stateFilePath;
        }
    }

    FileView {
        id: stateFile
        path: ""
        atomicWrites: true
        watchChanges: false
        printErrors: false
        onLoaded: root._load(text())
        onLoadFailed: root._load("")
    }

    Component.onCompleted: ensureDirProc.running = true
}
