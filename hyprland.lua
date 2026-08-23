-- Hyprland window rule for the Omarchy Android Mirroring plugin.
--
-- This file is intended to be loaded from the user's Hyprland Lua config
-- (typically ~/.config/hypr/hyprland.lua) AFTER Omarchy's default helpers
-- have been required, so the `o.window` helper is available. The plugin does
-- not modify any user-owned Hyprland files.
--
-- To activate, add the following guarded loader to
-- ~/.config/hypr/hyprland.lua after `require("default.hypr.omarchy")`:
--
--   do
--       local path = (os.getenv("HOME") or "")
--           .. "/.config/omarchy/plugins/dev.android-mirroring/hyprland.lua"
--       local file = io.open(path, "r")
--
--       if file then
--           file:close()
--           dofile(path)
--       end
--   end
--
-- The guard means removing the plugin leaves Hyprland config loading intact.
--
-- The rule matches only plugin-owned scrcpy windows:
--   * class is the upstream scrcpy app_id ("scrcpy")
--   * initial_title is the fixed, application-controlled product title
--     passed by the plugin via --window-title=Android Mirroring
--
-- It does NOT match user-launched scrcpy sessions, which keep the default
-- device-model title.
--
-- Visuals are inherited from the current Omarchy theme: border_size is set
-- to 1 so the phone gets a thin frame, but border_color and rounding are
-- deliberately omitted so the active/inactive border colors and global
-- rounding of the current theme apply automatically.

o.window(
    {
        class = "^scrcpy$",
        initial_title = "^Android Mirroring$",
    },
    {
        float = true,
        center = true,
        border_size = 1,
    }
)
