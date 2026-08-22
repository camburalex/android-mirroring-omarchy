# Android Mirroring (Omarchy plugin) — early development

A third-party plugin for [Omarchy](https://omarchy.org/) Quattro that aims to
provide Android device mirroring on the desktop.

## Current status

- This repository is at milestone M0. It contains only the plugin shell
  skeleton.
- [scrcpy](https://github.com/Genymobile/scrcpy) is intended to be the
  underlying mirroring engine for v0.1.
- No mirroring, ADB, device, or scrcpy integration exists yet.
- The current `dev.android-mirroring` plugin id is temporary and will be renamed
  before any public release.

## Development environment

- Windows is suitable for source development and static checks only.
- The actual runtime and integration target is a real Omarchy machine.
- Do not install Omarchy, Hyprland, Quickshell, scrcpy, or ADB on Windows solely
  for this task.

## License

No license has been chosen yet. This is a release decision still to be made.
