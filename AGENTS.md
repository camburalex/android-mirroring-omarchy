# Agent Rules: Omarchy Android Mirroring Plugin

## Purpose
A third-party Omarchy Quattro plugin for Android device mirroring. v0.1 uses
upstream scrcpy as the mirroring engine. The plugin runs inside the existing
`omarchy-shell` process.

## Architecture invariants
- Upstream scrcpy is the v0.1 backend. Do not fork, rewrite, proxy, or redecode
  its video stream.
- Integrate into the existing `omarchy-shell`; do not create a separate
  Quickshell desktop process.
- Plugin entry points are ordinary QML `Item`s. Do not use `ShellRoot`.
- Do not modify package-owned Omarchy files.
- Do not rewrite user configuration destructively; do not silently replace
  keybindings.
- Process execution must prefer `program + argv` over shell string construction
  where supported.
- Pairing codes are transient credentials; never persist them or log them
  normally.
- Track and stop only processes launched by this plugin. Never use global
  `pkill scrcpy`.
- Long-running ADB/scrcpy work must not block the UI.
- Development currently happens directly on the real Omarchy target.
- Native Omarchy commands (e.g. `omarchy plugin validate`) may be run on the
  target and are the authoritative integration signal.
- Installed Omarchy source on this machine is valid read-only evidence.
- External web research is owned by the technical lead; Devin must not
  browse/search/fetch external sources unless the task explicitly authorizes it.
- If a supervisor-provided upstream fact conflicts with installed local behavior,
  stop and report the conflict instead of researching around it.
- Current authoritative upstream source beats stale examples.
- Keep diffs narrow; avoid unrelated refactors.
- Normal Git operations are allowed; no force-pushing or history rewriting.
- Repository searches and diagnostics stay inside the repository and
  task-authorized paths; do not recursively scan the user's home directory,
  unrelated config/state directories, or collect unrelated credentials/data.
