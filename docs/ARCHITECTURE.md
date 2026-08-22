# Architecture

## Boundary

```
Omarchy plugin
  → device/session layer
  → ADB + scrcpy backend
  → external scrcpy rendering window
  → Hyprland styling
```

## Ownership

- scrcpy owns mirroring, rendering, and the video stream.
- This project owns the Omarchy UX, device/session management, wireless workflow,
  options, error reporting, and integration.
- For v0.1 the video is **not** embedded, proxied, or redecoded.

## Current state

M0-T1 only establishes the plugin shell contract. No device/session layer, ADB,
scrcpy, or Hyprland integration exists yet.
