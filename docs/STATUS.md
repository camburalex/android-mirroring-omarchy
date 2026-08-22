# Status

- Milestone: M1 (in progress)
- M0-T1 bootstrap completed.
- M1-T1 native plugin-shell bring-up completed (manifest, plugin loading, shell
  IPC show/hide passed).
- USER-OBSERVED M1 defect: panel pointer events passed through to applications
  behind the panel, the panel could not be dismissed through the UI, and the
  dimmed overlay could become stuck.
- M1-T2 is the current corrective task to make the panel interactive and
  reliably dismissible.
- M2 remains blocked until human UI validation confirms the panel lifecycle.
- No device/backend functionality implemented yet.
- No Android hardware testing performed yet.
