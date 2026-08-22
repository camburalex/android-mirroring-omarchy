# Status

- Milestone: M2 (in progress)
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
- Wireless pairing remains planned for M3.
- Installed target environment:
  - Omarchy 4.0.0-1
  - Quickshell 0.3.0 (quickshell-git)
  - scrcpy 4.1
  - adb / platform-tools 37.0.0
- M1 is complete.
- M2-T1 discovery is complete.
- C1–C4 cold-start UI validation passed.
- U1–U7 USB discovery hardware tests passed.
- M2-T2 is the active task; scrcpy USB session launch/stop has been added.
- The long authorization/status text overflow observed in U2 is addressed by
  M2-T2 with constrained `Layout.maximumWidth` wrapping.
- M2-T2B corrects USB session panel containment and stale session errors:
  - ScrcpyBackend now classifies exits using startup/running/stopping state
    instead of `activeSerial`, so startup failures report
    "Could not start mirroring." and post-start failures report
    "Mirroring ended unexpectedly."
  - A `clearError()` method lets explicit user recovery (Refresh) clear a
    stale session error without erasing bounded diagnostics.
  - The panel layout is now bounded so the title, Refresh, session status,
    Stop, device rows, and wrapped status text all remain inside the
    KeyboardPanel card.
- Hardware validation results (Redmi Note 8 Pro, Android 11):
  - U1-U7 USB discovery: PASS
  - H1 selected phone launches and displays: PASS
  - H2 initial mouse input failed until the Xiaomi
    "USB debugging (Security settings)" Developer Option was enabled and the
    phone rebooted; H2R: PASS after that prerequisite
  - H3 panel/session independence: PASS
  - H4 owned Stop: PASS
  - H5 closing scrcpy window and relaunching: PASS
  - H6 unplug while mirroring: PASS
  - H7 reconnect/relaunch: PASS
  - H8 shell restart during active owned session: PASS
  - H9 keyboard Mirror/Stop focus UX: deferred to M5
- M2 is now complete. M3 wireless pairing is the next milestone.
- Wireless mirroring, device presets, audio/screen-off/recording controls, and
  Hyprland phone-window styling remain unimplemented future work.
