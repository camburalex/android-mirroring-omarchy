# Status

- M1: PASS
- M2: PASS
- M3: PASS
- M4: PASS
- M5: PASS
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
    endpoint before opening the pairing-code popup, following user-observed
    Android Wireless Debugging behavior;
  - adds an "Already paired? Connect" path that requires no pairing code;
  - adds a reconnect path that uses `lastKnownEndpoint` with `adb connect` and no
    pairing code, plus an "Update address" flow that refreshes the saved endpoint
    without re-pairing;
  - keeps saved and live device rows semantically separate, suppressing a saved
    row when the same endpoint is currently live, and showing saved-but-offline
    phones as `Wireless · Unavailable`.
- M3-T2B hardens saved wireless classification, stale update-intent handling,
  and FileView persistence error semantics. Final saved/reconnect hardware
  validation passed.
- M3-T2C addresses the final M3 F1 hardware-validation failure:
  `adb devices -l` showed the wireless phone live, but the plugin continued to
  show the saved record as `Wireless · Unavailable` even after explicit Refresh.
  The fix makes ADB discovery completion deterministic by coordinating the
  process-exit and stdout-stream-completion signals, introduces an explicit
  `refreshCompleted` signal so `devicesChanged` is no longer treated as a
  completed discovery cycle, preserves the previous device list while a refresh
  is in flight, and fixes the saved-device-row action overlap by placing
  `Reconnect` and `Update` in a bounded second row. M3 final hardware
  validation passed.
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
- M3-T1 wireless pair/connect/mirroring: PASS.
- M3 final hardware validation passed.
- M4 is PASS.
- M4-T1 implements Performance/Balanced/Quality presets, Audio On/Off, and
  Screen off On/Off in the production `ScrcpyCommand.js` builder and the
  `BarWidget.qml` panel. Balanced is the default preset.
- M4-T1 hardware validation C1–C11 passed: Performance/Balanced/Quality presets
  show light but noticeable differences, Audio On/Off works, Screen off On/Off
  works, mirrored input remains usable with the physical screen off, and
  USB/wireless regressions pass. Settings reset to Balanced/Audio On/Screen off
  Off after shell restart.
- M4-T2 adds safe scrcpy session recording through upstream scrcpy's
  `--record=<path>.mp4` mechanism. Recording is Off by default, controlled from
  the BarWidget panel, and records the actual mirrored stream. Audio inclusion
  follows the selected Audio state. The product recording directory is
  `Android Mirroring` under the standard Videos/Movies location, filenames are
  timestamped, and each output path is atomically reserved with GNU mktemp.
  Recording preparation, directory creation, and path validation are performed
  by a persistent `RecordingManager` using shell-free direct argv, and the full
  24-state command matrix (3 presets × 2 audio × 2 screen-off × 2 recording) is
  covered by `tests/ScrcpyCommand.test.js`.
- M4 recording hardware validation: PASS (all three presets, Audio On/Off, Screen
  off On/Off, safe recording, USB/wireless regression).
- M5 is PASS.
- M5-T1 adds a stable, application-controlled scrcpy window identity
  (`--window-title=Android Mirroring`) and a Quattro-native Hyprland Lua rule
  (`hyprland.lua`) that floats, centers, and applies a 1px border while
  inheriting the active/inactive border colors and rounding from the current
  Omarchy theme.
- M5-T1 does not add keybindings, geometry persistence, always-on-top, or
  custom theme parsing.
- M5-T1 human hardware validation (native Wayland):
  - H1 floating/center/border/input: PASS
  - H2 manual move/resize: PASS
  - H3 rotate during session under native Wayland: FAIL (outer Hyprland window
    stayed portrait-shaped while Android content rotated)
  - H4 focus/themed border behavior: PASS
  - H5 theme switching: PASS
  - H6 stop/relaunch: PASS
- M5-T1B forces only the plugin-owned scrcpy rendering process through the SDL
  X11 backend so it runs under XWayland (`SDL_VIDEODRIVER=x11` on the
  `ScrcpyBackend.qml` Process, inherited environment kept, `clearEnvironment: false`).
  XWayland is intentionally used for plugin-owned scrcpy because current target
  hardware testing proved native Wayland failed outer-window resize on device
  rotation while XWayland passed.
- XWayland manual compatibility test: PASS. A manually launched
  `SDL_VIDEODRIVER=x11 scrcpy --window-title="Android Mirroring"` window
  reported `xwayland: 1` and the outer Hyprland floating window immediately
  resized for both portrait-to-landscape and landscape-to-portrait.
- M5-T1 / M5-T1B final plugin-owned hardware validation:
  - plugin scrcpy window: xwayland: 1, floating: 1
  - portrait-to-landscape outer-window resize: PASS
  - landscape-to-portrait outer-window resize: PASS
  - input: PASS
  - plugin Stop: PASS
  - combined M4 regression: audio PASS, screen-off PASS, recording PASS,
    rotation while recording PASS
  - recording isolation (Audio On + Screen Off Off): PASS
  - recording isolation (Audio On + Screen Off On): PASS
- M5-T1 native Hyprland phone-window integration: PASS.
- M5-T2A implements panel dismissal from the existing ScrcpyBackend
  `sessionStarted()` lifecycle event. The bar-widget Panel calls its existing
  `close()` method only when the backend confirms scrcpy has started, not
  directly from the Mirror click. Pre-start validation and recording-preparation
  failures therefore remain visible in the open panel. M5-T2A human hardware
  validation: PASS.
- M5-T2B addresses a pre-existing duplicate saved-wireless-device defect: after
  an Android Wireless Debugging endpoint change, the Update Address flow could
  leave two saved rows with the same `lastKnownEndpoint`/`adbSerial` because
  `SavedDeviceData.addOrUpdateRecord` updated the requested record but did not
  remove another record that now pointed to the same transport. The fix keeps
  safe transport-level deduplication (`_removeTransportDuplicates`) on the
  explicit `addOrUpdateRecord` and `updateEndpoint` paths only, preserving a
  stable record id when an existing record is updated and collapsing duplicate
  transports only during an explicit user update. Cold-start `parseState` no
  longer merges independently persisted records, so historical saved endpoints
  are not treated as a stable physical-device identity. Focused tests cover
  endpoint updates, repeated updates, explicit-path deduplication, load-time
  record preservation, and same-model device independence. Runtime deployment
  and cold-start shell validation succeeded, and the existing duplicate persisted
  state collapsed to one record after explicit Update Address. M5-T2B human
  hardware validation: PASS.
- M5 is PASS.
- Stable v0.1 product name: Android Mirroring
- Stable v0.1 plugin id: dev.android-mirroring
- M6 is ACTIVE.
- M6-T1 release packaging and documentation is statically complete on this
  branch. The public README, LICENSE, manifest release metadata, release
  checklist, and install/remove/Hyprland documentation have been prepared.
- Final M6 security, resource-cleanup, fresh-install, and hardware release
  validation gates remain pending.
