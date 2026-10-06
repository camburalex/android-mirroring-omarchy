# Architecture

## Boundary

```
Omarchy bar widget (qml/BarWidget.qml)
  → qml/DeviceManager.qml       (ADB device discovery)
  → qml/WirelessManager.qml     (Android 11+ pair / connect)
  → qml/QrPairingManager.qml    (QR-code pairing session and mDNS discovery)
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
- QR-code pairing shows a one-time service name and password as a QR code,
  waits for the phone to advertise `_adb-tls-pairing._tcp` under that name,
  pairs with `adb pair`, then reads the phone's main endpoint from its
  `_adb-tls-connect._tcp` service and runs `adb connect`. Discovery uses
  `avahi-browse` because the android-tools `adb` build has no mDNS support.
- The QR pairing password comes from `/dev/urandom`, is written to `qrencode`
  and `adb` stdin, and is never logged, persisted, or placed in a process
  argument. It is cleared when it is handed to ADB, on cancel, on timeout, and
  when the panel closes.
- QR-pairing helper output (`od`, `qrencode`, `avahi-browse`) is never
  retained unbounded: captures are capped, the network-influenced
  `avahi-browse` stream has a per-record and a per-run limit, and every step
  has a finite deadline with SIGKILL escalation.
- The plugin tracks and stops only the `scrcpy`/`adb` processes it launches.
- Discovery, pairing, and recording-path preparation are asynchronous and do not
  block the panel UI.

## Current state

M5 is complete. M6 release packaging is in progress.
