# Android application

The native application is a Capacitor wrapper for `https://cryptogoblin.ru`.
It uses the same secure production backend and does not contain wallet keys or
server credentials.

## Local build

1. Install Android Studio with Android SDK Platform 35 and a Java 21 JDK.
2. Run `npm install` at the repository root.
3. Create `android/keystore.properties` (this file is ignored by Git) with the
   `storeFile`, `storePassword`, `keyAlias`, and `keyPassword` values for your
   private keystore. Then run `npm run android:release`.
4. The publishable file is `android/app/build/outputs/apk/release/app-release.apk`.
   Use `npm run android:bundle` only when an `.aab` is required by a store.
5. Keep the upload keystore and its passwords offline. Losing it prevents future
   updates from being installed over the existing app.

Do not publish a debug APK: Android warns users about it and it cannot be
updated by a production release.
