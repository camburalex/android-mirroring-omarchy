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
            // Do not overwrite the current in-memory list with empty state when
            // the on-disk file is malformed or otherwise broken. Mark loaded as
            // false so persist will not clobber the problematic file either.
            root.error = result.error || "Could not load remembered devices.";
            root.loaded = false;
        }
    }

    function _onLoadFailed(error) {
        if (error === FileViewError.FileNotFound) {
            // A missing state file is the normal first-run condition.
            root._load("");
            return;
        }

        // Genuine path/storage failures are not a successful empty state and
        // must not silently erase existing in-memory state.
        root.loaded = false;
        root.error = "Could not load remembered devices.";
    }

    function _onSaveFailed(error) {
        // Retain in-memory state; do not report save success or dump raw JSON.
        root.error = "Could not save remembered devices.";
    }

    function _persist() {
        if (!root.loaded) return;
        root.error = "";
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

    function remove(recordId) {
        if (!root.loaded) return;
        root.devices = SavedDeviceData.removeRecord(root.devices, recordId);
        _persist();
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
        onLoadFailed: function(error) { root._onLoadFailed(error) }
        onSaved: { root.error = ""; root.saved() }
        onSaveFailed: function(error) { root._onSaveFailed(error) }
    }

    Component.onCompleted: ensureDirProc.running = true
}
