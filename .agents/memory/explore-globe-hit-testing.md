---
name: Explore globe hit testing
description: Testing and layout guidance for interactive SVG city markers and sheet/zoom controls in Explore.
---

Keep city-marker touch targets and globe controls outside the top search/category overlays. On web, the Google 3D map and globe fallback must both forward Node data and selection callbacks, with accessible 48 px targets. Allow clicks through transparent header space so map pins beneath the glass header remain tappable. Interaction tests must confirm the selected city and its city context, not only a changed result count.

**Why:** A category chip intercepted a marker tap while producing the same result count expected from city selection, so a count-only test passed without exercising the marker. The web fallback also dropped Node props, and an empty header overlay intercepted map pins.

**How to apply:** When adjusting Explore map or sheet layout, verify event targets at the actual mobile viewport in both Google Maps and globe-fallback renderers. Collapse the sheet before testing controls placed behind it, and assert city/Node selection, camera movement, and reset state separately.