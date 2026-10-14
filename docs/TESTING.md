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
  `SavedDeviceStore.qml`, `SavedDeviceData.js`, `AdbParser.js`, or
  `dev.android-mirroring` QML load error
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

## Saved device checks

- `node tests/SavedDeviceData.test.js` runs the fixture suite for empty state,
  valid records, unknown/pairing-code field stripping, malformed JSON and wrong
  schema handling, endpoint updates, record removal, and allow-list
  serialization against the real production `qml/SavedDeviceData.js`.

## Wireless pairing checks

- `node tests/WirelessCommand.test.js` runs the fixture suite for endpoint
  validation, pairing-code validation, and `adb pair` / `adb connect` command
  building against the real production `qml/WirelessCommand.js`.

## QR pairing checks

- `node tests/QrPairing.test.js` runs the fixture suite for credential
  generation, the QR payload, `qrencode` matrix parsing, `avahi-browse` record
  parsing, pairing/connect service matching, and bounded line assembly against
  the real production `qml/QrPairing.js`.
- `node tests/ProcessSafety.test.js` also covers `qml/QrPairingManager.qml`:
  FailedToStart fallbacks, bounded streams, finite deadlines, and stdin-only
  handling of the pairing password.

## Dependency setup checks

- `node tests/DependencySetup.test.js` runs the fixture suite for the required
  package list, the fixed `pacman -Q` and `omarchy-install-app` argv, and the
  finite installer wait against the real production `qml/DependencySetup.js`.
- `node tests/ProcessSafety.test.js` also covers `qml/DependencyManager.qml`:
  the Omarchy installer is the only detached launch in the plugin and uses the
  fixed argv.
- With `scrcpy` and `android-tools` removed, the panel shows **Install scrcpy
  and ADB** instead of the device list; pressing it opens Omarchy's installer
  terminal, and the panel continues to the device list once it finishes.

## USB session regression checks (M2-T2B)

- Panel controls (title, Refresh, session status, Stop, device rows,
  wrapped status text) remain inside the KeyboardPanel bounds.
- `Refresh` clears a stale "Mirroring ended unexpectedly." error.
- Reconnect + Refresh does not leave the previous session error visible.
- `Mirror` and `Stop` still own and terminate exactly the plugin's scrcpy
  process.

## Android hardware checks

### M2

- ADB device detection over USB: validated
- scrcpy USB launch, mirror, unplug, reconnect, and relaunch: validated

### M3-T1

- W1 pairing UI / masked code: PASS
- W2 incorrect pairing code: PASS
- W3 incorrect pairing port: PASS
- W4 correct pair + connect: PASS
- W5 wireless scrcpy with USB physically disconnected: PASS
- W6 wireless close / relaunch: PASS
- W7 Wireless Debugging disabled / device disappears: PASS

### M3-T2

- Saved-device persistence: PASS
- Reconnect without pairing code: PASS
- Stale endpoint update without re-pairing: PASS
- Final saved-device duplicate/update behavior: PASS

### M4

- Presets (Performance, Balanced, Quality): PASS
- Audio On/Off: PASS
- Screen off On/Off: PASS
- Recording: PASS
- USB/wireless regression: PASS

### M5

- Native Hyprland floating/theme behavior: PASS
- Plugin-owned XWayland rotation both directions: PASS
- Input/Stop: PASS
- Panel auto-dismiss/reopen/Stop: PASS
- Saved-device duplicate fix: PASS

### QR pairing

Maintainer hardware test of QR pairing on a phone: pair and connect work.
The remaining cases were not run individually.

- Q1 QR code appears and the phone's "Pair device with QR code" scanner
  accepts the dot-style, theme-coloured code (check a dark and a light
  theme): PASS on the maintainer's theme; the other polarity not run
- Q2 pair + automatic connect, phone shows as `Wireless · Ready` and is saved:
  PASS
- Q3 Back / panel close while waiting, then a new QR code pairs: PENDING
- Q4 QR code left unscanned expires with a visible message: PENDING
- Q5 wireless scrcpy after QR pairing with USB physically disconnected:
  PENDING
- Q6 pairing-code and "Already paired? Connect" regression: PENDING

### Saved-device removal

- R1 the remove icon appears only on **Wireless · Unavailable** saved rows:
  PENDING
- R2 the remove icon shows the confirm row, and **Cancel** (or the icon
  again) restores Reconnect/Update: PENDING
- R3 **Remove** deletes the row and it stays gone after `omarchy restart
  shell`: PENDING
- R4 the remove icon and **Remove** are disabled while a wireless connect is
  in flight: PENDING
- R5 removing the record open in the **Update** form returns to the Wireless
  menu: PENDING
- R6 closing the panel cancels a pending confirmation: PENDING

### Saved-device offline state

- O1 turning off Wireless debugging while a saved phone is connected shows it
  as **Wireless · Unavailable** with Reconnect, Update, and the remove icon,
  not the bare "Device is offline" row: PASS
- O2 pressing **Reconnect** while ADB still lists the address as `offline`
  either reaches **Wireless · Ready** or shows a connect error (record which):
  PASS, "Could not reach this device" with Wireless debugging still off

### Text-field lifetime

- F1 **Pair with pairing code**: the address field starts empty, **Next**
  shows empty pairing fields, Enter in each field triggers its button, and
  pairing connects: PASS
- F2 **Already paired? Connect**: the field starts empty and Enter connects:
  PASS
- F3 **Update** on a saved row pre-fills its address and Connect updates the
  same record: PASS
- F4 typing j, k, x and Space in any field enters them as text instead of
  triggering panel keys: PASS
- F5 text typed into a form is gone after Back, or after closing and
  reopening the panel: PASS
