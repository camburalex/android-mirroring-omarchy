# Status

- Milestone: M3 (in progress)
- M0-T1 bootstrap completed.
- M1-T1 native plugin-shell bring-up completed (manifest, plugin loading, shell
  IPC show/hide passed).
- M1-T2 attempted a custom standalone fullscreen panel and failed real UI
  validation.
- M1-T3 converted the plugin to the installed first-party `bar-widget`-owned
  `KeyboardPanel` architecture. Human UI validation passed: T1–T7 all passed.
- M1 is complete.
- M2-T1 implements live ADB device discovery with a fixture-tested parser,
  async Quickshell `Process`, and minimal panel UI. No scrcpy launched.
- M2-T1B restored cold-start bar-widget loading by moving `DeviceManager`
  from `QtObject` to `Quickshell.Scope`; the plugin now survives a full
  `omarchy restart shell` and keeps the M2-T1 discovery behavior.
- M2-T2 adds a `Scope`-owned `ScrcpyBackend` with a tracked Quickshell
  `Process`, a production `scrcpy -s <serial>` argv builder, and panel
  Mirror/Stop controls. Cold-start QML load and bar placement passed after
  `omarchy restart shell`.
- M2-T2B corrects USB session panel containment and stale session errors.
- M2 is complete with R1–R6 user validation.
- M3-T1 implements secure Android 11+ wireless pairing and live wireless
  connection:
  - adds a `Scope`-owned `WirelessManager` with tracked `Process` pair/connect
    pipelines;
  - accepts a pairing endpoint, a six-digit pairing code, and a separate
    connection endpoint;
  - validates all input before launching ADB;
  - launches `adb pair <endpoint>` with the pairing code written to stdin after
    the process starts (the code exists briefly in volatile in-memory state so it
    can be written to ADB stdin; it is never persisted, normally logged, or
    included in process argv);
  - on success, automatically launches `adb connect <endpoint>`;
  - refreshes the existing `DeviceManager` device list after a successful
    connect;
  - classifies a connected transport as `Wireless · Ready` only when its serial
    exactly matches the explicit connection endpoint and no USB metadata is
    present;
  - exposes the new wireless device through the existing device/session UI,
    reusing the existing scrcpy backend with explicit serial selection;
  - adds a compact "Pair wirelessly" form to the existing `KeyboardPanel`;
  - adds `qml/WirelessCommand.js` and `tests/WirelessCommand.test.js` with
    endpoint, pairing-code, and command fixtures.
- M3-T2 implements saved wireless device metadata and reconnect-after-restart:
  - adds `qml/SavedDeviceStore.qml` and `qml/SavedDeviceData.js` for safe,
    versioned, allow-list persistence in `Quickshell.stateDir` with atomic writes;
  - persists only stable id, model, ADB serial, `lastKnownEndpoint`, connection
    type, and timestamp; pairing codes and unknown fields are never stored;
  - reorders the first-time pairing UX to collect the main Wireless Debugging
    endpoint before opening the pairing-code popup, following the USER-OBSERVED
    Redmi Note 8 Pro behavior;
  - adds an "Already paired? Connect" path that requires no pairing code;
  - adds a reconnect path that uses `lastKnownEndpoint` with `adb connect` and no
    pairing code, plus an "Update address" flow that refreshes the saved endpoint
    without re-pairing;
  - keeps saved and live device rows semantically separate, suppressing a saved
    row when the same endpoint is currently live, and showing saved-but-offline
    phones as `Wireless · Unavailable`.
- M3-T2 implements saved wireless device metadata and reconnect-after-restart.
- M3-T2B hardens saved wireless classification, stale update-intent handling,
  and FileView persistence error semantics. Final saved/reconnect hardware
  validation remains required.
- Installed target environment:
  - Omarchy 4.0.0-1
  - Quickshell 0.3.0 (quickshell-git)
  - scrcpy 4.1
  - adb / platform-tools 37.0.0
- C1–C4 cold-start UI validation passed.
- U1–U7 USB discovery hardware tests passed (M2).
- R1–R6 M2-T2B USB session regression: PASS.
- M3-T1 cold-start and panel-load validation passed after
  `omarchy restart shell` (no QML load errors for `BarWidget.qml`,
  `DeviceManager.qml`, `WirelessManager.qml`, or `WirelessCommand.js`).
- M3-T1 wireless pair/connect/mirroring: REQUIRES USER HARDWARE VALIDATION.
- Wireless mirroring is now implemented for manual pairing; saved-device
  persistence, reconnect-after-restart, device presets, audio/screen-off/
  recording controls, and Hyprland phone-window styling remain unimplemented
  future work.
