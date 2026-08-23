# Architecture

## Boundary

```
Omarchy bar widget (qml/BarWidget.qml)
  → qml/DeviceManager.qml       (ADB device discovery)
  → qml/WirelessManager.qml     (Android 11+ pair / connect)
  → qml/SavedDeviceStore.qml    (known-device persistence)
  → qml/ScrcpyBackend.qml       (tracked scrcpy process)
  → qml/RecordingManager.qml    (recording path preparation)
  → external scrcpy rendering window
  → hyprland.lua                (floating phone window rules)
```

## Ownership

- scrcpy owns mirroring, rendering, and the video stream.
- This project owns the Omarchy UX, device/session management, wireless workflow,
  options, error reporting, and integration.
- For v0.1 the video is **not** embedded, proxied, or redecoded.

## Process model

- ADB and scrcpy run as `Quickshell.Io.Process` children with direct `program + argv`.
- The wireless pairing code is written to `adb` stdin once and is never logged,
  persisted, or placed in a process argument.
- The plugin tracks and stops only the `scrcpy`/`adb` processes it launches.
- Discovery, pairing, and recording-path preparation are asynchronous and do not
  block the panel UI.

## Current state

M5 is complete. M6 release packaging is in progress.
