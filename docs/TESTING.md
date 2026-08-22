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

## Android hardware checks (NOT YET RUN)

- ADB device detection over USB
- scrcpy USB and wireless launch
- Android 11+ wireless pairing
- Recording and quality presets
