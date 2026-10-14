---
name: Expo JSX class typing bridge
description: A narrowly typed boundary for third-party native class components rejected by JSX.
---

When third-party native class component declarations fail JSX compatibility under the Expo/React Native toolchain, keep them behind a local adapter typed with the package's declared props. Do not disable JSX checking or blanket-cast component usage throughout the app.

**Why:** Expo LinearGradient and react-native-svg class declarations produced many TS2607/TS2786 diagnostics despite a successful runtime build; SDK patch alignment and changing TypeScript versions did not resolve the incompatibility.

**How to apply:** Adapt only the affected imports with a shared JSX component bridge, preserve public prop types, explicitly type unannotated callbacks, and rerun the full mobile typecheck.
