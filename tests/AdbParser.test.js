const assert = require("assert")
const parser = require("../qml/AdbParser.js")

const fixtures = {
    A: "List of devices attached\n",

    B: [
        "List of devices attached",
        "ABC123\tdevice usb:1234567X product:MyProduct model:MyModel device:MyDevice transport_id:1"
    ].join("\n"),

    C: [
        "List of devices attached",
        "ABC123\tunauthorized usb:1234567X product:MyProduct model:MyModel device:MyDevice transport_id:1"
    ].join("\n"),

    D: [
        "List of devices attached",
        "ABC123\toffline usb:1234567X product:MyProduct model:MyModel device:MyDevice transport_id:1"
    ].join("\n"),

    E: [
        "List of devices attached",
        "ABC123\tdevice usb:1234567X product:MyProduct model:MyModel device:MyDevice transport_id:1",
        "DEF456\tdevice usb:7654321X product:OtherProduct model:OtherModel device:OtherDevice transport_id:2"
    ].join("\n"),

    F: [
        "List of devices attached",
        "ABC123\tdevice usb:1234567X product:MyProduct device:MyDevice transport_id:1"
    ].join("\n"),

    G: [
        "List of devices attached",
        "ABC123\tdevice model:MyModel transport_id:1 foo:bar product:MyProduct usb:1234567X extra:baz"
    ].join("\n"),

    H: [
        "List of devices attached",
        "ABC123\tdevice usb:1234567X product:MyProduct model:MyModel device:MyDevice transport_id:1"
    ].join("\r\n"),

    I: [
        "* daemon not running; starting now at tcp:5037",
        "* daemon started successfully",
        "List of devices attached",
        "ABC123\tdevice usb:1234567X product:MyProduct model:MyModel device:MyDevice transport_id:1"
    ].join("\n")
}

function run() {
    let devices

    devices = parser.parseDevices(fixtures.A)
    assert.deepStrictEqual(devices, [], "A: no devices")

    devices = parser.parseDevices(fixtures.B)
    assert.strictEqual(devices.length, 1, "B: one device")
    assert.strictEqual(devices[0].serial, "ABC123")
    assert.strictEqual(devices[0].rawState, "device")
    assert.strictEqual(devices[0].model, "MyModel")
    assert.strictEqual(devices[0].product, "MyProduct")
    assert.strictEqual(devices[0].device, "MyDevice")
    assert.strictEqual(devices[0].usb, "1234567X")
    assert.strictEqual(devices[0].transportId, "1")
    assert.strictEqual(devices[0].connection, "usb")
    assert.strictEqual(devices[0].label, "MyModel")

    devices = parser.parseDevices(fixtures.C)
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].rawState, "unauthorized")
    assert.strictEqual(devices[0].connection, "usb")

    devices = parser.parseDevices(fixtures.D)
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].rawState, "offline")

    devices = parser.parseDevices(fixtures.E)
    assert.strictEqual(devices.length, 2)
    assert.strictEqual(devices[0].serial, "ABC123")
    assert.strictEqual(devices[0].label, "MyModel")
    assert.strictEqual(devices[1].serial, "DEF456")
    assert.strictEqual(devices[1].label, "OtherModel")

    devices = parser.parseDevices(fixtures.F)
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].model, "")
    assert.strictEqual(devices[0].label, "ABC123")
    assert.strictEqual(devices[0].usb, "1234567X")

    devices = parser.parseDevices(fixtures.G)
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].model, "MyModel")
    assert.strictEqual(devices[0].product, "MyProduct")
    assert.strictEqual(devices[0].metadata.foo, "bar")
    assert.strictEqual(devices[0].metadata.extra, "baz")
    assert.strictEqual(devices[0].transportId, "1")
    assert.strictEqual(devices[0].connection, "usb")

    devices = parser.parseDevices(fixtures.H)
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].serial, "ABC123")
    assert.strictEqual(devices[0].rawState, "device")
    assert.strictEqual(devices[0].model, "MyModel")

    devices = parser.parseDevices(fixtures.I)
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].serial, "ABC123")
    assert.strictEqual(devices[0].rawState, "device")

    assert.strictEqual(parser.stateText("device", "usb"), "USB \u00b7 Ready")
    assert.strictEqual(parser.stateText("device", "wireless"), "Wireless \u00b7 Ready")
    assert.strictEqual(parser.stateText("device", "unknown"), "Ready")
    assert.strictEqual(parser.stateText("unauthorized", "usb").indexOf("Authorization required") >= 0, true)
    assert.strictEqual(parser.stateText("offline", "unknown").indexOf("offline") >= 0, true)
    assert.strictEqual(parser.stateText("foobar", "unknown"), "Unavailable")

    devices = parser.parseDevices([
        "List of devices attached",
        "192.168.1.20:5555\tdevice product:MyProduct model:MyModel device:MyDevice transport_id:3"
    ].join("\n"), "192.168.1.20:5555")
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].connection, "wireless")
    assert.strictEqual(devices[0].label, "MyModel")

    // A saved lastKnownEndpoint in the context array classifies a non-USB
    // device as wireless.
    devices = parser.parseDevices([
        "List of devices attached",
        "192.168.1.20:38843\tdevice product:MyProduct model:MyModel device:MyDevice transport_id:4"
    ].join("\n"), ["192.168.1.20:38843"])
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].connection, "wireless")

    // A saved adbSerial in the context array also classifies the live non-USB
    // serial as wireless.
    devices = parser.parseDevices([
        "List of devices attached",
        "192.168.1.21:5555\tdevice product:OtherProduct model:OtherModel device:OtherDevice transport_id:5"
    ].join("\n"), ["some-endpoint", "192.168.1.21:5555"])
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].connection, "wireless")

    // A non-USB serial that is not in any known wireless context must not be
    // classified as wireless.
    devices = parser.parseDevices([
        "List of devices attached",
        "emulator-5554\tdevice product:EmuProduct model:EmuModel device:EmuDevice transport_id:6"
    ].join("\n"), ["192.168.1.20:5555", "192.168.1.21:5555"])
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].connection, "unknown")
    assert.strictEqual(devices[0].label, "EmuModel")

    // USB metadata always wins, even if the serial is a known wireless context.
    devices = parser.parseDevices([
        "List of devices attached",
        "192.168.1.20:5555\tdevice usb:1234567X product:MyProduct model:MyModel device:MyDevice transport_id:7"
    ].join("\n"), ["192.168.1.20:5555"])
    assert.strictEqual(devices.length, 1)
    assert.strictEqual(devices[0].connection, "usb")

    // Multiple known contexts: the one that matches becomes wireless; the other
    // live non-USB device remains unknown.
    devices = parser.parseDevices([
        "List of devices attached",
        "192.168.1.20:5555\tdevice product:PhoneA model:PhoneA device:PhoneA transport_id:8",
        "192.168.1.30:5555\tdevice product:PhoneB model:PhoneB device:PhoneB transport_id:9"
    ].join("\n"), ["192.168.1.20:5555", "saved-adb-serial"])
    assert.strictEqual(devices.length, 2)
    assert.strictEqual(devices[0].connection, "wireless")
    assert.strictEqual(devices[1].connection, "unknown")

    console.log("All AdbParser fixtures passed.")
}

run()
