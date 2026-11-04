# Desktop and mobile projects

## Status and release builds

- The Mac debug build has been tested and works. Windows opens the desktop app and renders after the Content Security Policy fix. Fullscreen, saved settings and Quit are still to be checked on both platforms.
- Desktop release builds are unsigned (`--no-sign`), so macOS and Windows may warn before opening them.
- Android release builds are blocked until release signing is set up. iOS release archives are not set up.
- Before a build, the dashboard checks the game's wiring as well as the platform's prerequisites. Failing checks are listed on the build page, and blocking failures stop the build.

## Desktop defaults and settings

New desktop games start fullscreen with no title bar. The sample's Settings screen (from main menu or pause menu) saves display mode, logical window size, frame limit, render quality, master/music/effects volume and mute. Saved windowed preferences override the first-run fullscreen default. F11 toggles fullscreen; Quit game closes the native window.

Fullscreen fills the current display. Windowed uses an ordinary decorated window. Borderless window removes decorations at the selected window size; it is distinct from fullscreen. Window size presets are logical window dimensions, not monitor-resolution switching. Frame limits are caps on the browser animation loop and remain limited by the display refresh rate; they do not change hardware VSync. Render quality changes pixel density (capped at 2x), not game coordinates.

The sample includes generated sound effects; it has no music track. The music bus is available for your game's music. Display and quit controls are hidden in web and mobile builds. Web/mobile retain audio, frame limit and render quality settings.

`src/platform/desktop.ts` is an optional package entry, `gameframework/desktop`, using `@tauri-apps/api`. Native window permissions are scoped to desktop in `src-tauri/capabilities/desktop.json`. Each game owns its copied settings UI, native configuration and the `platform_kind` Rust command.

For an existing game, copy or merge the new settings sample and native configuration into its repository, install `@tauri-apps/api`, and rebuild. Updating the framework dependency alone cannot change the game's copied fullscreen configuration, native permissions or menus.

## iOS: editable Xcode project

On your Mac, install the Tauri iOS prerequisites, choose your app identifier, and run:

```sh
npm run init:ios
npm run open:ios
```

Initialization generates the native Xcode project under `src-tauri/gen/apple/`.

**Project settings** (on the iOS page of Game Workshop):

| Setting | What it sets | Default |
| --- | --- | --- |
| App name | The name under the icon and the Xcode project name | The game name |
| Bundle identifier | The App Store identifier | `com.game.<gameName>`, lowercase letters and digits only (`My Game` → `com.game.mygame`) |
| Build number | `CFBundleVersion`. Goes up with each upload | `1` |
| Minimum iOS version | The oldest iOS the app runs on | `15.0` |

Saving applies the settings to the existing Xcode project in place. Only the values above are rewritten, and the page reports which ones it updated and which weren't found in the project. Your other Xcode edits stay as they are.

**Regenerate project** rebuilds the project from scratch. It moves the current folder to `src-tauri/gen/apple.backup-<time>` first, so nothing is deleted. To go back, rename the backup to `apple`. Your Xcode edits are in the backup, so copy anything you need into the new project.


Use `npm run dev:ios` for a simulator or configured device. For physical-device development, Tauri may require `--host`; Vite honors `TAURI_DEV_HOST`. Release archives need Apple signing, which isn't configured yet, so `npm run build:ios` does not produce an App Store build. An IPA becomes the distribution artifact once signing and export are set up.

## Android: editable Android Studio project

After installing Java, Android SDK/NDK and Rust Android targets:

```sh
npm run init:android
npm run open:android
npm run build:android
```

Initialization creates the Gradle/Android Studio project under `src-tauri/gen/android/`. The current build command produces a debug APK for testing under `src-tauri/gen/android/app/build/outputs/apk/`. It uses Android's debug signing, not a release keystore. You can edit the manifest, native code and Gradle configuration in Android Studio. An AAB for Google Play can later be produced with `npm run tauri -- android build --aab` after configuring release signing.

## Preserve native changes

Initialize each native project once. Keep customized native source/configuration in the game's Git repository, review generated changes, and avoid deleting/reinitializing the project as a routine build step. Ignore build directories, caches, machine-local settings and signing files. The starter now ignores those outputs rather than the entire `gen/` tree. Existing games must update their own ignore rules before committing native changes. Follow the generated projects' own ignore rules too.

The workflow has the same broad shape as Unity's iOS export: obtain an Xcode project, edit native configuration, then build/archive with Apple tools. Exact outputs and export behavior vary by engine; this repository follows Tauri's CLI and native-project workflow.

References: [Tauri mobile development](https://v2.tauri.app/develop/), [iOS export](https://v2.tauri.app/distribute/app-store/), [Android artifacts](https://v2.tauri.app/distribute/google-play/), [platform prerequisites](https://v2.tauri.app/start/prerequisites/).
