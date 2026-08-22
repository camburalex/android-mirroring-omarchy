# Testing

## Static checks

- JSON parse of `manifest.json`.
- Entry-point files exist and are relative.
- No `ShellRoot` in QML entry points.
- Panel exposes `open(payloadJson)` and `close()`.
- `git diff --check`.

These checks do **not** validate runtime behavior or Omarchy integration.

## Omarchy integration checks

- `omarchy plugin validate <path>`
- `omarchy-shell shell rescanPlugins`
- Plugin load with `omarchy plugin enable dev.android-mirroring`
- Bar widget placement and panel summon/hide
- Quickshell QML errors in logs

## Android hardware checks (NOT YET RUN)

- ADB device detection
- scrcpy USB and wireless launch
- Android 11+ wireless pairing
- Recording and quality presets
