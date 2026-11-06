---
name: Feed category boundaries
description: Product rules for Personal and Professional feed classification.
---

Feed category and topic are separate from a post's existing kind and visibility. Personal and Professional categories classify status posts; topic filters apply only to status posts. Automatically generated experience-published activity is Professional, while other automatic activity remains Personal.

**Why:** The feed needs to support two distinct audience contexts without changing existing post intent or privacy behavior.

**How to apply:** Preserve these boundaries in feed API filters, post editing, profile lists, and automatic activity classification. When category columns are not yet present, legacy posts display as Personal/General; do not pretend non-default filters work without the migration.
