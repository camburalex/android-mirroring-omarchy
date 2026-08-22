// AdbParser.js — parse `adb devices -l` output into structured records.
//
// This is plain JavaScript so it can be imported by both the QML bar widget
// (via `import "AdbParser.js" as AdbParser`) and a Node test harness
// (via `require`).

function normalizeNewlines(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function isNoise(line) {
    if (!line) return true
    if (line.indexOf("List of devices attached") === 0) return true
    if (line.indexOf("*") === 0) return true
    return false
}

function parseDevices(text, wirelessContext) {
    var context = String(wirelessContext || "")
    var normalized = normalizeNewlines(text)
    var lines = normalized.split("\n")
    var devices = []

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim()
        if (isNoise(line)) continue

        var tokens = line.split(/\s+/)
        if (tokens.length < 2) continue

        var serial = tokens[0]
        var rawState = tokens[1]
        var metadata = {}

        for (var j = 2; j < tokens.length; j++) {
            var token = tokens[j]
            var colon = token.indexOf(":")
            if (colon > 0) {
                var key = token.substring(0, colon)
                var value = token.substring(colon + 1)
                metadata[key] = value
            }
        }

        var connection = metadata.usb ? "usb" : "unknown"
        // If this serial exactly matches an explicitly-connected wireless
        // endpoint and the record carries no USB metadata, classify it as a
        // wireless transport. This avoids misclassifying emulators or unknown
        // network devices.
        if (context && !metadata.usb && serial === context) {
            connection = "wireless"
        }
        var label = metadata.model || serial

        devices.push({
            serial: serial,
            rawState: rawState,
            model: metadata.model || "",
            product: metadata.product || "",
            device: metadata.device || "",
            usb: metadata.usb || "",
            transportId: metadata.transport_id || "",
            metadata: metadata,
            connection: connection,
            label: label
        })
    }

    return devices
}

function stateText(rawState, connection) {
    if (rawState === "device") {
        if (connection === "usb") return "USB \u00b7 Ready"
        if (connection === "wireless") return "Wireless \u00b7 Ready"
        return "Ready"
    }
    if (rawState === "unauthorized") {
        return "Authorization required. Accept the USB debugging prompt on your phone."
    }
    if (rawState === "offline") {
        return "Device is offline. Reconnect it or restart Wireless Debugging."
    }
    return "Unavailable"
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        parseDevices: parseDevices,
        stateText: stateText
    }
}
