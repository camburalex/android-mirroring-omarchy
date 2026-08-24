# Release Checklist — v0.1

This checklist tracks the remaining gates before the v0.1 public release.
Items marked `[x]` are evidenced from M6 validation. Items under **Publication**
remain `[ ]` because they are the final release steps themselves (public
repository, tag, marketplace submission).

## Pre-release documentation

- [x] README is complete and accurate.
- [x] LICENSE (MIT) is present and clearly applies to the plugin's own code.
- [x] scrcpy attribution and Apache-2.0 notice are present.
- [x] `manifest.json` release metadata is correct.
- [x] Install, update, remove, and dependency instructions match the
  installed Omarchy CLI.
- [x] Hyprland integration is documented non-destructively.

## Security and correctness

- [x] Security audit (no persisted pairing codes, no root recommendations,
  no `pkill scrcpy`, no destructive config edits).
- [x] Resource cleanup (only plugin-owned ADB/scrcpy processes are stopped,
  recording placeholders are discarded on failure, state file is safe).

## Validation

- [x] `git diff --check` passes.
- [x] `omarchy plugin validate .` passes.
- [x] Full automated test suite passes.
- [x] `omarchy-shell shell ping` succeeds after install.
- [x] `omarchy-shell shell listPlugins` shows `dev.android-mirroring` enabled.
- [x] `hyprctl configerrors` reports no errors after Hyprland reload.

## Install / uninstall

- [x] Native remove/reinstall on the verified Omarchy target succeeds.
- [x] `omarchy plugin remove dev.android-mirroring` succeeds.
- [x] Uninstall leaves user Hyprland config intact (guard block is inert).
- [x] Saved device state behavior is documented and behaves as documented.

## Regression

- [x] USB discovery, mirroring, and control (Mirror/Stop) regression.
- [x] Android 11+ wireless pairing, mirroring, and control (Mirror/Stop)
  regression.
- [x] Preset selection (Performance, Balanced, Quality).
- [x] Audio On/Off.
- [x] Screen off On/Off.
- [x] Recording On/Off and output path behavior.
- [x] Hyprland validation (panel tokens, phone window border, rotation under
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
- [x] No user-controlled shell interpolation; ADB/scrcpy launches remain argv-based.
  The wireless health probe uses a constant shell fragment with endpoint values passed as positional arguments.
- [x] Pairing code stays stdin-only, never persisted or normally logged.
- [x] `Stop` only terminates the tracked plugin-owned scrcpy process.
- [x] Recording path cannot escape `Videos/Android Mirroring` root.
- [x] Reserved recording placeholder is discarded when scrcpy fails to start.
- [x] Saved-device state uses atomic writes and an allow-listed schema.
- [x] All automated tests pass; `omarchy plugin validate .` passes.
- [x] Physical resource cleanup (phone unplug, Wi-Fi loss, shell restart during
  active session, scrcpy crash) — M6-T3 hardware validation passed.
- [x] Native remove/reinstall / final release matrix — M6-T3 passed.
