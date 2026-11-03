# Roadmap

Status is updated as work lands. Everything is verified locally, on the developer's own machine. There is no CI.

## Goal

Developers get a playable build for every target without installing toolchains where possible. Where a native toolchain is unavoidable (Xcode, Android Studio, Steamworks), the export produces an editable project and a clear checklist. Optional integrations (Steam, signing, store uploads) are opt-in hooks. Their SDKs are installed by hand, so the default install stays small.

## Design

- **Core stays dependency-free.** Platform features live in optional entry points such as `gameframework/desktop`.
- **Targets and integrations are declared, not hard-coded.** Each declares its host OS, prerequisites and build steps. `npm run doctor` checks them on the current machine.
- **Integrations are hooks plus a checklist.** A hook is a no-op until its SDK is present. Each integration has a checklist in `docs/integrations/`.
- **SDKs are never committed.** They go in `vendor/` (gitignored), installed by hand.
- **Secrets stay out of the repo.** Signing identities and store or Steam credentials come from environment variables.
- **Feature flags for native code.** Desktop-only Rust dependencies go behind Cargo features so iOS and Android builds don't compile them.
- **Support status is local.** `Builds/support-report.json` records what the doctor found on the last run. A target is only "verified" after its build has actually run on that machine.

## Done

- [x] `npm run doctor`: checks Node, dependencies, type checks, tests and per-target prerequisites. Writes `Builds/support-report.json`. (`scripts/doctor.mjs`)
- [x] Content security policy set in `src-tauri/tauri.conf.json` (replaces `"csp": null`). **Not yet verified in a running desktop build.**
- [x] Removed `src/main.ts`, which nothing loaded.
- [x] Steam manual checklist (`docs/integrations/steam.md`) and the `vendor/` folder with its README.
- [x] Storage access was already guarded in the example game (`demo.ts`, `demo-settings.ts`). No change needed there.

## Dashboard, first pass (done)

Run with `npm run export:ui`. The page is now a set of platform cards, not a profile editor.

- [x] One card per platform (Web, Windows, macOS, Linux, iPhone and iPad, Android) and a Steam add-on card. Each shows a plain status: Ready, Setup needed, Not set up yet, or Needs a Mac/Windows/Linux computer.
- [x] Each card's main button does the next useful step: build, set up a project, or open it in Xcode or Android Studio.
- [x] Opening a platform shows a checklist of what's missing, the actions available, a Test or Release switch, and a result panel with download and open-folder links. Logs are hidden under "Show details".
- [x] Game details (name, version, identifier) are edited once, in a dialog, and applied to every platform.
- [x] Opening an iOS or Android project hands off to the native tool (Xcode, or the folder for Android Studio) instead of starting a long-running dev session.
- [x] Steam add-on: checks for the Steamworks SDK in `vendor/steamworks/sdk` and shows the manual steps. Upload is not automated yet.
- [x] `tests/dashboard.test.ts` loads the real page in a headless DOM and checks the cards, the details panel and the build request.

- [x] Generated games are self-contained. `create-game` copies the framework runtime, build dashboard, doctor and docs into `tools/gameframework/`, and the game imports them through aliases. A generated game never reads the framework checkout after creation. Covered by `tests/scaffold.test.ts`, which type-checks and builds a generated game.
- [x] `npm run doctor` runs on the current folder, so it works in a generated game too.

- [x] Framework folder: "New game" (name and 2D/3D), "Open game" for a game folder next to the framework, and "Install and test" tools (install dependencies, run tests). Games open in their own dashboard in a new browser tab.
- [x] Game dashboards: "Play in browser" starts the live dev server from the Web card. "Install dependencies" appears first whenever dependencies are missing.
- [x] Double-click launchers: `Game Workshop.command` (Mac), `Game Workshop.bat` (Windows) and `Game Workshop.sh` (Linux), in the framework folder and in every generated game. If Node.js is missing they open the download page.
- [x] `tests/workshop.test.ts` checks the create and open rules and the install and test actions.

**Not verified yet:**
- Double-click launchers on Mac and Windows, and the Node.js check they do.
- The browser flows for New game, Open game and Play in browser. Only the rendering and the API are covered by tests.
- Opening Xcode and Android Studio from the dashboard. This needs a Mac (and Android Studio installed).
- The desktop build and the CSP on a Mac or Windows machine.
- `docs/EXPORT-DASHBOARD.md` and `docs/UPGRADING.md` still describe the old profile editor and the linked dependency. They need rewriting.
- A one-command way to update `tools/gameframework/` in an existing game.

**Next dashboard steps:**
- Rewrite `docs/EXPORT-DASHBOARD.md` for the new page.
- Add the Steam hook (P0 item 2) so Steam builds can be enabled from the Steam card.
- Make the iOS export collect a self-contained Xcode project into `Builds/` (P0 item 5).

## P0: blockers for shipping to mobile and Steam

1. **Verify the desktop build on macOS and Windows.** Run `npm run build:desktop`, launch the app, and check fullscreen, settings persistence, Quit, and that the CSP does not block anything.
2. **Build the Steam hook.** A Steamworks adapter behind a shared `PlatformService` interface, loaded only when the profile enables `steam`. Include the upload step that generates the depot script and runs SteamCMD with credentials from the environment.
3. **Android release signing.** Keystore configuration, signed AAB output, and a documented secret-handling checklist.
4. **iOS signing and archive.** Certificate and provisioning checklist, archive and export, and a TestFlight upload test on the developer's Mac.
5. **Export the iOS project into `Builds/`.** The output should open in Xcode without the rest of the repo.

## P1: correctness and coverage

6. **Add renderer tests** for PixiJS and Three.js: mount, resize and dispose.
7. **Add a native shell smoke test** for the Tauri shell, the `platform_kind` command and the desktop settings path.
8. **Test on real devices**: touch, controller and fullscreen on an iPhone, an Android phone, and a Steam Deck or similar.
9. **Reduce the 3D bundle.** The 3D chunk is 523 kB minified. Split Three.js or lazy-load the 3D demo.
10. **Make the doctor run the build.** Currently it checks prerequisites only. A "verified" status should come from a real build run.

## P2: polish and scale

11. **Pin the framework dependency for releases.** The generated game uses a `file:` link. Switch to a pinned Git tag for shared builds.
12. **Stream large music.** `AudioMixer` decodes whole files into memory, which is fine for effects but not for long tracks.
13. **Menu focus and reduced motion** in the shared UI controller.
14. **Release checklist**: versioning, changelog, store metadata, icons, and steps per target.
