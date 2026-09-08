---
name: Android native build toolchain
description: Environment constraints for building the Capacitor Android project.
---

Capacitor 8.5 Android builds in this workspace require a standard JDK 21 runtime. The available GraalVM Java 19 runtime fails Android Gradle Plugin JDK image transformation, while JDK 17 fails because generated Capacitor sources target Java 21.

**Why:** The Android Gradle build reached different failures depending on the runtime, so selecting a compatible JDK before diagnosing native source errors avoids misleading build failures.

**How to apply:** Use a transient standard JDK 21 environment for Android Gradle builds and keep Android SDK/toolchain setup outside the committed project configuration unless the project explicitly needs a persistent environment change. For a debug-only launcher variant, explicitly remove inherited production activities/deep links and use manifest `tools:replace` for debug label/icon overrides.