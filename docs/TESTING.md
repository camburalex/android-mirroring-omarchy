# Testing

## Static checks

- JSON parse of `manifest.json`.
- Entry-point files exist and are relative.
- No `ShellRoot` in QML entry points.
- `qml/BarWidget.qml` is a `qs.Ui.Panel` and exposes the bar-widget lifecycle
  (`opened`, `open()`, `close()`).
- `git diff --check`.

These checks do **not** validate runtime behavior or Omarchy integration.

## Omarchy integration checks

- `omarchy plugin validate <path>`
- `omarchy-shell shell rescanPlugins`
- Plugin load with `omarchy plugin enable dev.android-mirroring` if needed
- Bar widget placement and panel summon/hide
- Quickshell QML errors in logs

## Cold-start checks

Any QML integration change must also survive a full cold restart:

- Synchronize changed runtime files to
  `~/.config/omarchy/plugins/dev.android-mirroring/`
- `omarchy restart shell`
- `omarchy-shell shell ping`
- `omarchy-shell shell listPlugins` shows `dev.android-mirroring` enabled
- `omarchy-shell shell debugBarGeometry` shows a visible, non-zero-size slot
- `omarchy-shell shell toggle dev.android-mirroring '{}'` opens the panel
- Quickshell journal contains no `BarWidget.qml`, `DeviceManager.qml`,
  `AdbParser.js`, or `dev.android-mirroring` QML load error
- Repeat the full `omarchy restart shell` cycle at least once

## Parser checks

- `node tests/AdbParser.test.js` runs the fixture suite against the real
  production `qml/AdbParser.js`.

## Scrcpy command checks

- `node tests/ScrcpyCommand.test.js` runs the fixture suite against the real
  production `qml/ScrcpyCommand.js`.

## Scrcpy backend state checks

- `node tests/ScrcpyBackendState.test.js` runs the fixture suite against the
  real production `qml/ScrcpyState.js` used by `ScrcpyBackend.qml`.

## Wireless pairing checks

- `node tests/WirelessCommand.test.js` runs the fixture suite for endpoint
  validation, pairing-code validation, and `adb pair` / `adb connect` command
  building against the real production `qml/WirelessCommand.js`.

## USB session regression checks (M2-T2B)

- Panel controls (title, Refresh, session status, Stop, device rows,
  wrapped status text) remain inside the KeyboardPanel bounds.
- `Refresh` clears a stale "Mirroring ended unexpectedly." error.
- Reconnect + Refresh does not leave the previous session error visible.
- `Mirror` and `Stop` still own and terminate exactly the plugin's scrcpy
  process.

## Android hardware checks (M2)

- ADB device detection over USB: validated
- scrcpy USB launch, mirror, unplug, reconnect, and relaunch: validated
- Android 11+ wireless pairing: not yet implemented (M3)
- Recording and quality presets: not yet implemented (M4/M5)
