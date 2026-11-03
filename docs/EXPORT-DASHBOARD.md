# Visual Build & Export

From your game repository:

```sh
npm run export:ui
```

Open the loopback URL printed by the command (normally `http://127.0.0.1:4179`). If that port is occupied, use `npm run export:ui -- --port 4180`. Keep the terminal running; Ctrl+C stops the dashboard and its active build/development session. Closing a browser tab does not stop the server.

The dashboard is a development tool. It is not bundled into the shipped game and does not upload builds or enable GitHub workflows. It binds to loopback, requires a per-session token for API requests, validates request origins, and runs fixed commands without a shell. Treat the game checkout itself as trusted: Vite/Tauri builds can execute the project's own configuration and scripts.

## Profiles

Choose a platform and Development or Release. Edit application name, semantic version and bundle identifier, then save or build. Profiles are stored in `export-profiles.json`; commit that file with the game. Each platform/build-type pair has one profile. Unsaved edits are retained while switching targets within the page, but only saved profiles survive closing the page.

For native builds, metadata is passed as a Tauri config override so existing configuration and native source files remain intact. On web it is build-report metadata; change the game's own HTML/UI source for visible branding. Icons and platform-specific native settings remain in the existing Tauri/Xcode/Android Studio project.

## Actions

| Target | Build | Build & Run / native project |
| --- | --- | --- |
| Web | Type-check and run Vite build | Serve the finished snapshot and provide an Open web preview link |
| Windows/macOS/Linux | Tauri development or unsigned release build on the matching host | Development starts a live Tauri/Vite session; release builds then launches the native executable |
| Android | Development debug APK | Development session on an emulator/device; initialize/open Android Studio separately |
| iOS | Automated archive/export is disabled until signing is configured | Initialize/open Xcode on a Mac, then build/run on a simulator there |

Android release signing is not configured, so release builds are disabled too. No certificates, store submission or Steamworks integration are added. Host/SDK checks catch common missing requirements; native build tools provide detailed diagnostics for missing SDK components and Rust targets. Desktop cross-compilation is not configured.

### Test web without exporting

Select Web and click **Run Dev Server**. This starts Vite directly in development mode with live source updates. It does not run the TypeScript build check, create `dist/`, or collect export artifacts. The console provides **Open live game** once the server is ready. Stop Session ends that server; closing the game tab does not stop it. This action always uses development mode, independently of the selected export profile.

The dev server binds to `127.0.0.1:5173` with a strict port check. If another app is using that port, the session fails with an actionable Vite log rather than linking you to a different project's game. Stop the other server or use `npm run dev` separately with your preferred port. Use Build & Run when you want to test the actual exported snapshot instead.

Initialize mobile projects once. The dashboard refuses to initialize an existing project, preserving customizations. Open Native Project uses Tauri's development integration with Xcode/Android Studio; this is a running session that you stop from the dashboard. Keep native sources in the game's Git repository. Metadata changes after initialization can require project-specific native adjustments; inspect the native project before releasing.

## Logs and output

Only one build/session runs at a time. Stop cancels the active process tree. Logs are bounded to the most recent 200 KB and can be copied. The dashboard retains up to 20 job records in memory for its current session; job history is cleared when the server restarts.

Successful build artifacts are copied under `Builds/<platform>/<development|release>/<build-id>/`, with a JSON build report. `Builds/` should be ignored by Git. The source tools also keep their normal `dist/` or native target outputs. Older export folders are preserved. Web snapshots can be previewed; native files can be downloaded or revealed in the output folder. Development-run and IDE sessions do not collect artifacts until a separate Build action is used.

The collector currently assumes Vite output at `dist/` and Tauri's default `src-tauri/target` and `src-tauri/gen` output locations. Custom output directories, Cargo targets and architectures need a corresponding collector update. Native bundles copied to the output folder are filtered to the current job's modification time to avoid mixing older named installers.

## Existing games

Update the framework dependency, run `npm install` to expose its new `game-export-ui` binary, and add `"export:ui": "game-export-ui"` to the game's scripts. New generated projects include it automatically. Run it from the game's root, not from inside `node_modules`. No regeneration of game code is needed.
