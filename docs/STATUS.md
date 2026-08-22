# Status

- Milestone: M1 (in progress)
- M0-T1 bootstrap completed.
- M1-T1 native plugin-shell bring-up completed (manifest, plugin loading, shell
  IPC show/hide passed).
- M1-T2 attempted a custom standalone fullscreen panel and failed real UI
  validation: pointer capture, outside-click dismissal, and Escape dismissal did
  not work.
- M1-T3 converted the plugin to the installed first-party `bar-widget`-owned
  `KeyboardPanel` architecture. Shell IPC `toggle`/`hide` pass and the layer
  lifecycle is stable. Human UI validation is still pending.
- M2 remains blocked until human UI validation confirms the panel lifecycle.
- No device/backend functionality implemented yet.
- No Android hardware testing performed yet.
