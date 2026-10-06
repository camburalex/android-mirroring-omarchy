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
- M6: PASS.
- M6-T2 — final security/process/resource source audit: PASS.
  - Command/process ownership reviewed; only plugin-owned scrcpy/ADB processes
    are stopped.
  - Pairing-code handling reviewed: the six-digit code is written to ADB stdin
    and is never persisted, normally logged, or placed in argv.
  - Recording cleanup reviewed: reserved recording placeholders are discarded
    when scrcpy fails to start.
  - ADB and scrcpy command construction remains argv-based; user-controlled
    endpoint data is not interpolated into executable shell text. The wireless
    `health-check` probe uses a constant shell fragment with endpoint values
    passed as positional parameters. No global `pkill`/`killall`/`startDetached`
    and no runtime privilege escalation.
  - All seven automated test suites pass and `omarchy plugin validate .` passes.
- M6-T2B — native phone bar icon: PASS. Human verified clicking the icon opens
  the panel.
- M6-T3A — native remove/install/enable/clean reinstall: PASS. The plugin
  loads, the shell restarts cleanly, `hyprctl configerrors` is empty, and the
  bar widget is present.
- M6-T3B — hardware release/recovery validation: PASS after the f968459
  wireless-loss blocker fix.
  - USB unplug cleanup and USB reconnect/relaunch: PASS.
  - Wireless Wi-Fi-loss cleanup and wireless reconnect/relaunch: PASS.
  - Exact owned-scrcpy termination recovery: PASS.
  - Shell restart during active session: PASS.
  - No orphaned owned scrcpy/health-check processes: PASS.
- M6-T3C — final release-candidate verification at f968459: PASS after native
  reinstall.
  - `omarchy plugin validate .` passes.
  - All seven automated test suites pass.
  - `qml/health-check.sh` syntax passes.
  - Installed clone full HEAD exactly equals development HEAD (f968459).
  - Cold shell restart passes; `omarchy-shell shell ping` passes.
  - Plugin is enabled and the phone bar widget is present; the panel opens.
  - `hyprctl configerrors` is empty.
  - Normal USB launch/input/stop and normal wireless launch/input/stop pass on
    hardware.
  - Wireless `health-check` exists only for an active wireless session and exits
    when the session ends.
  - Numeric endpoint/port entry works normally.
  - No plugin-owned process remains after stop/uninstall.
- No required P0 hardware or release-gate tests remain pending for v0.1.1.
- QR-code wireless pairing (v0.2.0): implemented. Maintainer hardware test
  on a phone: QR pairing and the automatic connect work.
  - adds `qml/QrPairing.js` and a `Scope`-owned `qml/QrPairingManager.qml`
    that generates one-time credentials from `/dev/urandom`, renders the
    `WIFI:T:ADB;S:<name>;P:<password>;;` code through `qrencode` (payload on
    stdin), and watches `avahi-browse` for the phone's `_adb-tls-pairing._tcp`
    and `_adb-tls-connect._tcp` services;
  - adds `WirelessManager.pair()`, a pair-only path that reuses the existing
    stdin-fed `adb pair` process and emits `paired()`; the existing
    `connect()` and saved-device handling finish the flow;
  - adds a "Pair with QR code" entry to the Wireless menu; the former "Pair a
    new phone" entry is now "Pair with pairing code";
  - follows the v0.1.1 review hardening: every QR-pairing process stream is
    a chunk-mode `SplitParser` (no `StdioCollector`, no newline parser);
    `od`/`qrencode` output is a `BoundedOutput` capture whose overflow ends
    the run; `avahi-browse` output goes through bounded line assembly
    (2,048 code units per record, 262,144 per run); the rendered QR matrix is
    capped at 64 modules per side; stderr is discarded per chunk; QR
    generation, the scan wait, and the endpoint lookup have finite deadlines
    (5 s, 180 s, 20 s) and `adb pair`/`adb connect` keep their existing
    30 s deadlines; every stop request escalates to SIGKILL after 1.5 s;
  - the code is drawn dot-style (round data modules, rounded finder patterns)
    in the theme's foreground/background colours, never inverted, with a
    near-black-on-white fallback below a 7:1 contrast ratio; the on-screen
    code decodes with `zbarimg`;
  - `adb mdns check` on the target reports mDNS as unsupported by the
    android-tools build, so discovery does not use `adb mdns`;
  - automated: `tests/QrPairing.test.js` plus extended
    `tests/WirelessCommand.test.js` and `tests/ProcessSafety.test.js` pass;
    `omarchy plugin validate .` passes;
  - target, no phone: cold shell restart loads the plugin without QML errors,
    the panel renders the QR code, the on-screen code decodes to the session
    payload, and a simulated `_adb-tls-pairing._tcp` advertisement drives the
    real `adb pair` to the expected failure message;
  - not run individually: cancel/re-pair, expiry, the second theme polarity,
    and the pairing-code regression (Q3–Q6 in `docs/TESTING.md`).
- Known limitations for v0.1:
  - Wireless liveness/health-check and final M6 validation targeted IPv4-style
    ADB endpoints; IPv6 wireless endpoints are not guaranteed.
  - Plugin-owned scrcpy is forced through the SDL X11 backend (XWayland) on the
    verified Omarchy target because native Wayland did not reliably resize the
    outer floating window on device rotation.
  - Geometry, always-on-top, and keybindings are intentionally not persisted.
- Next action: publish the v0.1.1 security patch and provide the new exact SHA to the Omarchy marketplace reviewer.
