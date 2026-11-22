---
name: React Native Web keyboard activation
description: Why horizontal row controls use an explicit web Enter handler.
---

Use `KeyboardAccessiblePressable` for horizontal overflow cues, Personal Activity sections, host experience tabs, and participant filters. It adds web-only Enter activation and prevents a second action if React Native Web also reports the keyup as a press; touch and Space activation remain handled by the regular press behavior.

**Why:** Browser checks showed that ordinary React Native Web `Pressable` controls received focus but did not activate with Enter in this workspace, so focus-order checks alone were not enough to verify keyboard access.

**How to apply:** Keep these controls on the shared wrapper and test both focus order and activation in browser checks. Do not assume that a visible focus ring proves the control can be activated.
