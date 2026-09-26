---
name: Live UI source context
description: Handling UI edits when earlier code excerpts no longer match the current workspace.
---

Treat reopened file excerpts and earlier-turn code snapshots as historical context, not authoritative source. When an edit spans multiple patch batches, re-search and re-read the live component and style regions before each batch, especially for shared authentication flows.

**Why:** During an authentication-screen redesign, the live component and its style keys no longer matched earlier excerpts; patches against the stale structure caused parse and type errors. Re-reading the current file exposed the mismatch before final verification.

**How to apply:** Use `rg` to find current anchors, read those lines, apply narrow patches, then run the package typecheck and `git diff --check` before restarting the preview.