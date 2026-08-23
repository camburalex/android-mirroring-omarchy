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

    // 12. Updating an existing record to an endpoint already owned by another
    // record collapses to a single saved row, keeping the explicit record id.
    const oldRecord = data.createRecord("192.168.1.20:1111", "SamePhone", "192.168.1.20:1111");
    const newRecord = data.createRecord("192.168.1.20:2222", "SamePhone", "192.168.1.20:2222");
    const updateMerged = data.addOrUpdateRecord([oldRecord, newRecord], {
        id: oldRecord.id,
        lastKnownEndpoint: "192.168.1.20:2222",
        adbSerial: "192.168.1.20:2222",
        model: "SamePhone"
    });
    assert.strictEqual(updateMerged.length, 1, "update merges records with identical transport");
    assert.strictEqual(updateMerged[0].id, oldRecord.id, "update keeps the record being updated");
    assert.strictEqual(updateMerged[0].lastKnownEndpoint, "192.168.1.20:2222", "updated endpoint is current");
    assert.strictEqual(updateMerged[0].adbSerial, "192.168.1.20:2222", "adbSerial follows endpoint");

    // 13. Repeated endpoint updates on the same record stay idempotent.
    const baseRecord = data.createRecord("192.168.1.20:1111", "SamePhone", "192.168.1.20:1111");
    const step1 = data.addOrUpdateRecord([baseRecord], {
        id: baseRecord.id,
        lastKnownEndpoint: "192.168.1.20:2222",
        adbSerial: "192.168.1.20:2222",
        model: "SamePhone"
    });
    const step2 = data.addOrUpdateRecord(step1, {
        id: step1[0].id,
        lastKnownEndpoint: "192.168.1.20:3333",
        adbSerial: "192.168.1.20:3333",
        model: "SamePhone"
    });
    assert.strictEqual(step2.length, 1, "repeated updates keep one record");
    assert.strictEqual(step2[0].id, baseRecord.id, "stable id across updates");
    assert.strictEqual(step2[0].lastKnownEndpoint, "192.168.1.20:3333", "newest endpoint wins");

    // 14. updateEndpoint keeps adbSerial in sync and deduplicates.
    const uRecord = data.createRecord("192.168.1.20:1111", "SamePhone", "192.168.1.20:1111");
    const vRecord = data.createRecord("192.168.1.20:2222", "SamePhone", "192.168.1.20:2222");
    const updatedU = data.updateEndpoint([uRecord, vRecord], uRecord.id, "192.168.1.20:2222");
    assert.strictEqual(updatedU.length, 1, "updateEndpoint merges duplicate transports");
    assert.strictEqual(updatedU[0].id, uRecord.id, "updateEndpoint keeps the record id");
    assert.strictEqual(updatedU[0].lastKnownEndpoint, "192.168.1.20:2222");
    assert.strictEqual(updatedU[0].adbSerial, "192.168.1.20:2222");

    // 15. Load-time parsing must NOT merge independently persisted records
    // just because they share a historical network transport. A saved endpoint
    // is not a stable physical-device identity, so two records with the same
    // endpoint/adbSerial but different models and different logical ids must
    // both survive a serialization round-trip.
    const dupA = data.createRecord("192.168.1.20:4444", "PhoneA", "192.168.1.20:4444");
    const dupB = data.createRecord("192.168.1.20:4444", "PhoneB", "192.168.1.20:4444");
    dupB.lastConnectedTimestamp = new Date(Date.now() + 1000).toISOString();
    const parsedDup = data.parseState(data.serializeState([dupA, dupB]));
    assert.strictEqual(parsedDup.devices.length, 2, "parseState preserves independent records with the same transport");
    assert.notStrictEqual(parsedDup.devices[0].id, parsedDup.devices[1].id, "different logical ids preserved");
    assert.notStrictEqual(parsedDup.devices[0].model, parsedDup.devices[1].model, "different models preserved");

    // 16. Two distinct phones with the same model but different endpoints
    // remain independent after a serialization round-trip.
    const phoneA = data.createRecord("192.168.1.20:5555", "SameModel", "192.168.1.20:5555");
    const phoneB = data.createRecord("192.168.1.20:6666", "SameModel", "192.168.1.20:6666");
    const twoPhones = data.parseState(data.serializeState([phoneA, phoneB]));
    assert.strictEqual(twoPhones.devices.length, 2, "same model with different endpoints stays separate");

    // 17. Pairing a genuinely new device with a new endpoint creates a new record.
    const firstRecord = data.createRecord("192.168.1.20:5555", "NewModel", "192.168.1.20:5555");
    const withNewDevice = data.addOrUpdateRecord([firstRecord], {
        lastKnownEndpoint: "192.168.1.20:7777",
        adbSerial: "192.168.1.20:7777",
        model: "OtherModel"
    });
    assert.strictEqual(withNewDevice.length, 2, "new endpoint creates a new logical record");
    assert.strictEqual(withNewDevice[0].id, firstRecord.id, "old record unchanged");
    assert.notStrictEqual(withNewDevice[1].id, firstRecord.id, "new record has its own id");

    console.log("All SavedDeviceData fixtures passed.");
}

run();
