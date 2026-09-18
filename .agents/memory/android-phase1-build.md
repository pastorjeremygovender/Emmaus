---
name: Native Android build environment
description: Toolchain constraints and cleanup rules for Emmaus Capacitor Android builds.
---

Emmaus's Capacitor 8 Android build requires a standard OpenJDK 21 runtime and an Android SDK containing platform 36, platform-tools, and compatible build-tools. The available GraalVM runtime fails during Android's JDK image transform, while OpenJDK 17 is too old for the Java 21 source level.

**Why:** The Replit package index may provide Java and adb without providing a complete Android SDK, and package-manager setup can add workspace metadata changes that are unrelated to the app.

**How to apply:** Use standard OpenJDK 21 and keep any manually provisioned SDK outside the repository. Revert incidental `.replit` or agent-asset metadata changes before committing; never commit generated APK/build output or SDK files.