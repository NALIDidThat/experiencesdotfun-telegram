---
name: Explore globe hit testing
description: Testing and layout guidance for interactive SVG city markers and sheet/zoom controls in Explore.
---

Keep city-marker touch targets and globe controls outside the top search/category overlays. Interaction tests must confirm the selected city and its city context, not only a changed result count.

**Why:** A category chip intercepted a marker tap while producing the same result count expected from city selection, so a count-only test passed without exercising the marker. Expanding the experience sheet also covers floating globe controls.

**How to apply:** When adjusting Explore globe or sheet layout, verify event targets at the actual mobile viewport. Collapse the sheet before testing controls placed behind it, and assert city selection, camera movement, and reset state separately.