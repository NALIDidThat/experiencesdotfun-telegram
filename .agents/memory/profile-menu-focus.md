---
name: Profile menu focus
description: React Native web modal dismissal can compete with form focus after a menu action.
---

When choosing a profile-menu action opens an editable form, close the menu immediately rather than fading it out over the new screen. In the mobile web preview, the fade-out left focus on the menu trigger during keyboard scrolling; immediate dismissal kept the input focused.

**Why:** The existing profile-edit keyboard interaction must keep the active field focused while the user scrolls.

**How to apply:** For profile-menu actions that reveal editable inputs, dismiss the overlay without a close animation or explicitly coordinate focus after dismissal.
