// SavedDeviceData.js — safe, versioned persistence for known wireless devices.
//
// This is plain JavaScript so it can be imported by both QML
// (`import "SavedDeviceData.js" as SavedDeviceData`) and a Node test harness
// (`require`).

var SCHEMA_VERSION = 1;

// Explicit allow-list for persisted record fields. Unknown keys (including any
// pairing-code-shaped field) are stripped on both parse and serialize.
var ALLOWED_FIELDS = {
    id: true,
    model: true,
    adbSerial: true,
    lastKnownEndpoint: true,
    lastConnectionType: true,
    lastConnectedTimestamp: true
};

function _coerceString(value) {
    if (value === undefined || value === null) return "";
    return String(value);
}

function _generateId() {
    var now = Date.now().toString(36);
    var rand = Math.floor(Math.random() * 0x100000000).toString(36);
    return now + "-" + rand;
}

function _sameTransport(a, b) {
    if (!a || !b) return false;
    return a.lastKnownEndpoint === b.lastKnownEndpoint
        && a.adbSerial === b.adbSerial;
}

// Copy only allow-listed fields and coerce to strings. This prevents any
// credential, object, or arbitrary QML content from reaching disk.
function sanitizeRecord(record) {
    if (!record || typeof record !== "object") return {};
    var out = {};
    for (var key in record) {
        if (ALLOWED_FIELDS[key]) out[key] = _coerceString(record[key]);
    }
    return out;
}

function createRecord(endpoint, model, serial) {
    if (!serial) serial = endpoint;
    return {
        id: _generateId(),
        model: _coerceString(model),
        adbSerial: _coerceString(serial),
        lastKnownEndpoint: _coerceString(endpoint),
        lastConnectionType: "wireless",
        lastConnectedTimestamp: new Date().toISOString()
    };
}

function _findRecordIndex(records, endpoint, serial) {
    if (!records) return -1;
    for (var i = 0; i < records.length; i++) {
        if (records[i].lastKnownEndpoint === endpoint) return i;
        if (serial && records[i].adbSerial === serial) return i;
    }
    return -1;
}

// Remove any records other than the one at keepIdx that share the same
// transport. If a removed record has a model and the kept record does not,
// copy the model over so useful metadata is preserved.
function _removeTransportDuplicates(list, keepIdx) {
    var keep = list[keepIdx];
    if (!keep) return list.slice();
    for (var i = 0; i < list.length; i++) {
        if (i === keepIdx) continue;
        var rec = list[i];
        if (_sameTransport(rec, keep) && rec.model && !keep.model) {
            keep.model = rec.model;
        }
    }
    var out = [];
    for (var j = 0; j < list.length; j++) {
        if (j === keepIdx) {
            out.push(keep);
        } else if (!_sameTransport(list[j], keep)) {
            out.push(list[j]);
        }
    }
    return out;
}

// Add a new record or update an existing one. Matching is by explicit id
// (preferred), lastKnownEndpoint, or adbSerial. Returns a new array.
function addOrUpdateRecord(records, update) {
    if (!records) records = [];
    if (!update || typeof update !== "object") return records.slice();

    var endpoint = _coerceString(update.lastKnownEndpoint || "");
    var serial = _coerceString(update.adbSerial || "");
    if (!endpoint && !serial) return records.slice();
    if (!endpoint) endpoint = serial;
    if (!serial) serial = endpoint;

    var list = records.slice();
    var idx = -1;

    if (update.id) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === update.id) {
                idx = i;
                break;
            }
        }
    }

    if (idx < 0) {
        idx = _findRecordIndex(list, endpoint, serial);
    }

    if (idx >= 0) {
        var rec = list[idx];
        rec.lastKnownEndpoint = endpoint;
        if (serial) rec.adbSerial = serial;
        rec.lastConnectedTimestamp = new Date().toISOString();
        if (update.model !== undefined && _coerceString(update.model) !== "") rec.model = _coerceString(update.model);
        if (update.lastConnectionType !== undefined) rec.lastConnectionType = _coerceString(update.lastConnectionType);
        list = _removeTransportDuplicates(list, idx);
    } else {
        list.push(createRecord(endpoint, update.model, serial));
        list = _removeTransportDuplicates(list, list.length - 1);
    }

    return list;
}

// Update the endpoint for a specific record id. Returns the new array, or null
// if the id was not found.
function updateEndpoint(records, id, endpoint) {
    if (!records) return null;
    var ep = _coerceString(endpoint);
    for (var i = 0; i < records.length; i++) {
        if (records[i].id === id) {
            var list = records.slice();
            var rec = list[i];
            var oldEndpoint = rec.lastKnownEndpoint;
            rec.lastKnownEndpoint = ep;
            rec.lastConnectedTimestamp = new Date().toISOString();
            if (rec.adbSerial === oldEndpoint) {
                rec.adbSerial = ep;
            }
            return _removeTransportDuplicates(list, i);
        }
    }
    return null;
}

function removeRecord(records, id) {
    if (!records) return [];
    if (!id) return records.slice();
    return records.filter(function(r) { return r.id !== id; });
}

function serializeState(devices) {
    if (!devices) devices = [];
    var arr = [];
    for (var i = 0; i < devices.length; i++) {
        arr.push(sanitizeRecord(devices[i]));
    }
    return JSON.stringify({ schemaVersion: SCHEMA_VERSION, devices: arr }, null, 2) + "\n";
}

function parseState(text) {
    var raw = String(text || "").trim();
    if (raw === "") return { ok: true, devices: [] };

    var parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return { ok: false, devices: [], error: "Malformed saved-devices state." };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, devices: [], error: "Saved-devices state is not an object." };
    }

    if (parsed.schemaVersion !== SCHEMA_VERSION) {
        return { ok: false, devices: [], error: "Unsupported saved-devices schema version." };
    }

    if (!Array.isArray(parsed.devices)) {
        return { ok: false, devices: [], error: "Saved-devices 'devices' is not an array." };
    }

    var devices = [];
    for (var j = 0; j < parsed.devices.length; j++) {
        var rec = parsed.devices[j];
        if (rec && typeof rec === "object" && !Array.isArray(rec)) {
            devices.push(sanitizeRecord(rec));
        }
    }

    return { ok: true, devices: devices };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        SCHEMA_VERSION: SCHEMA_VERSION,
        ALLOWED_FIELDS: ALLOWED_FIELDS,
        sanitizeRecord: sanitizeRecord,
        createRecord: createRecord,
        addOrUpdateRecord: addOrUpdateRecord,
        updateEndpoint: updateEndpoint,
        removeRecord: removeRecord,
        serializeState: serializeState,
        parseState: parseState
    };
}
