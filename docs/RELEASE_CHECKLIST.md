# Release Checklist — v0.1

This checklist tracks the remaining gates before the v0.1 public release.
Items marked `[ ]` are intentionally unchecked until final release validation.

## Pre-release documentation

- [ ] README is complete and accurate.
- [ ] LICENSE (MIT) is present and clearly applies to the plugin's own code.
- [ ] scrcpy attribution and Apache-2.0 notice are present.
- [ ] `manifest.json` release metadata is correct.
- [ ] Install, update, remove, and dependency instructions match the
  installed Omarchy CLI.
- [ ] Hyprland integration is documented non-destructively.

## Security and correctness

- [ ] Security audit (no persisted pairing codes, no root recommendations,
  no `pkill scrcpy`, no destructive config edits).
- [ ] Resource cleanup (only plugin-owned ADB/scrcpy processes are stopped,
  recording placeholders are discarded on failure, state file is safe).

## Validation

- [ ] `git diff --check` passes.
- [ ] `omarchy plugin validate .` passes.
- [ ] Full automated test suite passes.
- [ ] `omarchy-shell shell ping` succeeds after install.
- [ ] `omarchy-shell shell listPlugins` shows `dev.android-mirroring` enabled.
- [ ] `hyprctl configerrors` reports no errors after Hyprland reload.

## Fresh install / uninstall

- [ ] Fresh install on a clean Omarchy target succeeds.
- [ ] `omarchy plugin remove dev.android-mirroring` succeeds.
- [ ] Uninstall leaves user Hyprland config intact (guard block is inert).
- [ ] Saved device state behavior is documented and behaves as documented.

## Regression

- [ ] USB discovery, mirroring, and control (Mirror/Stop) regression.
- [ ] Android 11+ wireless pairing, mirroring, and control (Mirror/Stop)
  regression.
- [ ] Preset selection (Performance, Balanced, Quality).
- [ ] Audio On/Off.
- [ ] Screen off On/Off.
- [ ] Recording On/Off and output path behavior.
- [ ] Hyprland validation (panel tokens, phone window border, rotation under
  XWayland, `hyprctl configerrors` reports no errors).

## Publication

- [ ] Public GitHub repository is published and accessible.
- [ ] v0.1.0 tag is created.
- [ ] omarchyplugins.com submission readiness is confirmed.

## Notes

- Do not mark hardware or release gates complete based only on older
  milestone tests; they require final-release validation.
- The plugin is currently validated against:
  - Omarchy 4.0.0-1
  - Hyprland 0.56.2
  - Quickshell 0.3.0
  - scrcpy 4.1
  - android-tools 37.0.0 / adb 1.0.41

## M6-T2 — security/process/resource audit

- [x] Source-level security audit complete.
- [x] No shell-string construction or user-controlled shell interpolation.
- [x] Pairing code stays stdin-only, never persisted or normally logged.
- [x] `Stop` only terminates the tracked plugin-owned scrcpy process.
- [x] Recording path cannot escape `Videos/Android Mirroring` root.
- [x] Reserved recording placeholder is discarded when scrcpy fails to start.
- [x] Saved-device state uses atomic writes and an allow-listed schema.
- [x] All automated tests pass; `omarchy plugin validate .` passes.
- [ ] Physical resource cleanup (phone unplug, Wi-Fi loss, shell restart during
  active session, scrcpy crash) — requires M6-T3 hardware validation.
- [ ] Clean install / uninstall / final release matrix — requires M6-T3.
