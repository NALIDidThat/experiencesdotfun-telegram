---
name: Expo preview bundle behavior
description: Why the mobile preview can keep rendering an older bundle after UI edits.
---

The mobile preview workflow sets `CI=1`, which starts Metro with reloads disabled. After source edits, the running preview can continue rendering an older bundle until the Expo workflow is restarted. Typechecking can pass against the new source while screenshots still show the previous UI.

**Why:** A profile redesign typechecked, but the preview stayed unchanged; workflow logs showed Metro running in CI mode.

**How to apply:** If Expo screenshots contradict the edited source, check the mobile workflow logs for CI mode and restart the configured workflow before capturing the screen again.