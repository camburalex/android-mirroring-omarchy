const assert = require("assert");
const data = require("../qml/SavedDeviceData.js");

function run() {
    // 1. empty state
    const empty = data.parseState("");
    assert.strictEqual(empty.ok, true, "empty state parses ok");
    assert.deepStrictEqual(empty.devices, [], "empty state has no devices");

    // 2. one valid wireless record
    const rec1 = data.createRecord("192.168.1.20:5555", "MyModel", "192.168.1.20:5555");
    assert.ok(rec1.id, "record has id");
    assert.strictEqual(rec1.model, "MyModel");
    assert.strictEqual(rec1.adbSerial, "192.168.1.20:5555");
    assert.strictEqual(rec1.lastKnownEndpoint, "192.168.1.20:5555");
    assert.strictEqual(rec1.lastConnectionType, "wireless");
    assert.ok(rec1.lastConnectedTimestamp, "record has timestamp");

    const oneJson = data.serializeState([rec1]);
    const one = data.parseState(oneJson);
    assert.strictEqual(one.ok, true, "one record parses ok");
    assert.strictEqual(one.devices.length, 1, "one record");
    assert.strictEqual(one.devices[0].id, rec1.id, "id preserved");

    // 3. multiple independent records
    const rec2 = data.createRecord("192.168.1.21:5555", "OtherModel", "192.168.1.21:5555");
    const multi = data.parseState(data.serializeState([rec1, rec2]));
    assert.strictEqual(multi.ok, true);
    assert.strictEqual(multi.devices.length, 2);
    assert.ok(multi.devices[0].id !== multi.devices[1].id, "ids are independent");

    // 4. unknown fields ignored
    const withUnknown = data.parseState(JSON.stringify({
        schemaVersion: data.SCHEMA_VERSION,
        devices: [{
            id: "x",
            model: "M",
            adbSerial: "s",
            lastKnownEndpoint: "192.168.1.20:5555",
            lastConnectionType: "wireless",
            lastConnectedTimestamp: "t",
            unknownKey: "foo",
            nestedObject: { a: 1 }
        }]
    }));
    assert.strictEqual(withUnknown.devices[0].unknownKey, undefined);
    assert.strictEqual(withUnknown.devices[0].nestedObject, undefined);

    // 5. fake pairingCode field stripped
    const withCode = data.parseState(JSON.stringify({
        schemaVersion: data.SCHEMA_VERSION,
        devices: [{
            id: "y",
            model: "M",
            adbSerial: "s",
            lastKnownEndpoint: "192.168.1.20:5555",
            lastConnectionType: "wireless",
            lastConnectedTimestamp: "t",
            pairingCode: "123456"
        }]
    }));
    const codeJson = data.serializeState(withCode.devices);
    assert.strictEqual(codeJson.indexOf("pairingCode") < 0, true, "pairingCode key absent");
    assert.strictEqual(codeJson.indexOf("123456") < 0, true, "pairingCode value absent");

    // 6. malformed JSON handled
    const malformed = data.parseState("{not json");
    assert.strictEqual(malformed.ok, false, "malformed JSON fails");
    assert.deepStrictEqual(malformed.devices, [], "malformed JSON yields empty devices");

    // 7. unsupported/wrong schema version handled safely
    const wrongVer = data.parseState(JSON.stringify({ schemaVersion: 99, devices: [] }));
    assert.strictEqual(wrongVer.ok, false, "wrong schema version fails");
    assert.deepStrictEqual(wrongVer.devices, [], "wrong schema version yields empty devices");

    // 8. updating lastKnownEndpoint preserves stable record ID
    const rec3 = data.createRecord("192.168.1.20:5555", "M", "192.168.1.20:5555");
    const updated = data.updateEndpoint([rec3], rec3.id, "192.168.1.20:7777");
    assert.ok(updated, "updateEndpoint returns a list");
    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].id, rec3.id, "stable id preserved");
    assert.strictEqual(updated[0].lastKnownEndpoint, "192.168.1.20:7777");

    // 9. reconnect metadata update does not create a duplicate
    const rec4 = data.createRecord("192.168.1.20:5555", "OldModel", "192.168.1.20:5555");
    const afterReconnect = data.addOrUpdateRecord([rec4], {
        lastKnownEndpoint: "192.168.1.20:5555",
        model: "NewModel",
        adbSerial: "192.168.1.20:5555"
    });
    assert.strictEqual(afterReconnect.length, 1, "no duplicate created");
    assert.strictEqual(afterReconnect[0].id, rec4.id, "same record id");
    assert.strictEqual(afterReconnect[0].model, "NewModel", "model updated");

    // 10. serialized output includes only allow-listed fields
    const dirty = data.createRecord("192.168.1.20:5555", "M", "192.168.1.20:5555");
    dirty.pairingCode = "123456";
    dirty.arbitrary = "value";
    const cleanJson = data.serializeState([dirty]);
    const clean = data.parseState(cleanJson).devices[0];
    for (const key in clean) {
        assert.ok(data.ALLOWED_FIELDS[key], "serialized field is allow-listed: " + key);
    }
    assert.strictEqual(cleanJson.indexOf("pairingCode") < 0, true, "pairingCode absent in output");
    assert.strictEqual(cleanJson.indexOf("arbitrary") < 0, true, "arbitrary field absent in output");

    // 11. two identical phone models stay independent; matching is by exact
    // lastKnownEndpoint/adbSerial, not by model name.
    const sameModelA = data.createRecord("192.168.1.20:5555", "SameModel", "192.168.1.20:5555");
    const sameModelB = data.createRecord("192.168.1.30:5555", "SameModel", "192.168.1.30:5555");
    const both = data.addOrUpdateRecord([sameModelA], {
        model: "SameModel",
        adbSerial: "192.168.1.30:5555",
        lastKnownEndpoint: "192.168.1.30:5555"
    });
    assert.strictEqual(both.length, 2, "same model does not merge distinct records");

    console.log("All SavedDeviceData fixtures passed.");
}

run();
