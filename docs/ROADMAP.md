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

- [x] Workshop redesign: separate Framework and Game screens, full-page platform views, job bar.
- [x] **Update tools**: per-part updates (core, renderers, platform, dashboard, docs) with content-hash revisions, and an "Update available" flag on games with older tools. Framework version bumped to 0.2.0.
- [x] `npm run doctor`: checks Node, dependencies, type checks, tests and per-target prerequisites. Writes `Builds/support-report.json`. (`scripts/doctor.mjs`)
- [x] Content security policy set in `src-tauri/tauri.conf.json` (replaces `"csp": null`). **Not yet verified in a running desktop build.**
- [x] Removed `src/main.ts`, which nothing loaded.
- [x] Steam manual checklist (`docs/integrations/steam.md`) and the `vendor/` folder with its README.
- [x] Storage access was already guarded in the example game (`demo.ts`, `demo-settings.ts`). No change needed there.

## First game, physics and wiring (done)

- [x] A game carries only its chosen renderer and physics engine. Other engines stay in the framework and can be added from Update tools, one at a time. Removing an engine is refused while game code still imports it.
- [x] Two free, open source physics engines: Planck (`gameframework/physics/planck`) and Matter.js (`gameframework/physics/matter`). Matter loads in Node, and generated games include the selected engine's packages.
- [x] Wiring check (`scripts/wiring-check.mjs`). It runs before a build and after an update, and checks renderer and engine files, tsconfig paths, Vite aliases, packages and imports. Blocking problems stop the build and are listed on the build page. Covered by `tests/wiring.test.ts`.
- [x] Build page: failing checks are listed first, and a finished build shows its time, file count and total size.
- [x] Honest release labels: desktop release builds say "unsigned", and Android release says "needs signing".
- [x] Page titles: the workshop says "Workshop", and each game's dashboard and page use the game's name.
- [x] Removed the `2d.html` and `3d.html` entry pages, the CI example template, `scripts/benchmark.ts` and the old `2d`/`3d` renderer names.
- [x] `npm test` covers the generator, the wiring check, the physics adapters and the dashboard. Last full run on the developer's machine: 68 of 70 passed. Both failures are fixed in the code; a rerun is pending.

## Dashboard, first pass (done)

Run with `npm run export:ui`. The page is now a set of platform cards, not a profile editor.

- [x] One card per platform (Web, Windows, macOS, Linux, iPhone and iPad, Android) and a Steam add-on card. Each shows a plain status: Ready, Setup needed, Not set up yet, or Needs a Mac/Windows/Linux computer.
- [x] Each card's main button does the next useful step: build, set up a project, or open it in Xcode or Android Studio.
- [x] Opening a platform shows a checklist of what's missing, the actions available, a Test or Release switch, and a result panel with download and open-folder links. Logs are hidden under "Show details".
- [x] Game details (name, version, identifier) are edited once, in a dialog, and applied to every platform.
- [x] Opening an iOS or Android project hands off to the native tool (Xcode, or the folder for Android Studio) instead of starting a long-running dev session.
- [x] Steam add-on: checks for the Steamworks SDK in `vendor/steamworks/sdk` and shows the manual steps. Upload is not automated yet.
- [x] `tests/dashboard.test.ts` loads the real page in a headless DOM and checks the platform table, a platform page and the build request.

- [x] Generated games are self-contained. `create-game` copies the framework runtime, build dashboard, doctor and docs into `tools/gameframework/`, and the game imports them through aliases. A generated game never reads the framework checkout after creation. Covered by `tests/scaffold.test.ts`, which type-checks and builds a generated game.
- [x] `npm run doctor` runs on the current folder, so it works in a generated game too.

- [x] Framework folder: a **Games** list (open a game next to the framework), a **New game** form (name and renderer), and **Maintenance** (install dependencies, run tests). Games open in their own dashboard in a new browser tab.
- [x] Game dashboards: "Play in browser" starts the live dev server (overview header and Web page). "Install dependencies" appears first whenever dependencies are missing.
- [x] Double-click launchers: `Game Workshop.command` (Mac), `Game Workshop.bat` (Windows) and `Game Workshop.sh` (Linux), in the framework folder and in every generated game. If Node.js is missing they open the download page.
- [x] `tests/workshop.test.ts` checks the create and open rules and the install and test actions.

**Not verified yet:**
- Double-click launchers on Mac and Windows, and the Node.js check they do.
- The browser flows for New game, Open, Update tools, Add renderer and Play in browser. The rendering and the API are covered by tests, and the screens were checked in screenshots with stubbed data, but not clicked through against a real game.
- Opening Xcode and Android Studio from the dashboard. This needs a Mac (and Android Studio installed).
- The Mac release build. The Mac debug build has been tested and works. On Windows, the app opens and the renderer runs after the CSP fix. Fullscreen, settings persistence and Quit are not yet checked on either platform.
- The bundled fonts: the dashboard uses the system font stack. Geist and Lucide icons were considered but not bundled.

**Next dashboard steps:**
- Add the Steam hook (P0 item 2) so Steam builds can be enabled from the Steam page.
- Make the iOS export collect a self-contained Xcode project into `Builds/` (P0 item 5).

## P0: blockers for shipping to mobile and Steam

1. **Verify the desktop build on macOS and Windows.** Run `npm run build:desktop`, launch the app, and check fullscreen, settings persistence, Quit, and that the CSP does not block anything. Status: the macOS debug build has been tested and works. Windows opens and the renderer runs after the CSP fix. Still to check: the release build on macOS, and fullscreen, settings and Quit on both platforms.
2. **Build the Steam hook.** A Steamworks adapter behind a shared `PlatformService` interface, loaded only when the profile enables `steam`. Include the upload step that generates the depot script and runs SteamCMD with credentials from the environment.
3. **Android release signing.** Keystore configuration, signed AAB output, and a documented secret-handling checklist.
4. **iOS signing and archive.** Certificate and provisioning checklist, archive and export, and a TestFlight upload test on the developer's Mac.
5. **Export the iOS project into `Builds/`.** The output should open in Xcode without the rest of the repo.

## P1: correctness and coverage

6. **More renderers.** Done: renderer registry, a dependency-free `canvas` renderer, and one-step **Add renderer** for existing games (see `docs/RENDERERS.md`). New game offers every registry renderer, including Canvas. Still open: a Phaser adapter (best 2D candidate) and a Babylon.js adapter (game-oriented 3D), each with a bundling check inside the Tauri shell.
7. **Add renderer tests** for PixiJS and Three.js: mount, resize and dispose.
8. **Add a native shell smoke test** for the Tauri shell, the `platform_kind` command and the desktop settings path.
9. **Test on real devices**: touch, controller and fullscreen on an iPhone, an Android phone, and a Steam Deck or similar.
10. **Re-measure bundle size.** The old `3d.html` entry that produced the 523 kB 3D chunk has been removed. Measure again once a real game ships Three.js.
11. **Make the doctor run the build.** Currently it checks prerequisites only. A "verified" status should come from a real build run.

## P2: polish and scale

12. **Release the framework as tagged versions.** Games now carry a copy of the tools, with a version and a content revision. Tag releases and add a changelog so "Update available" can say what changed.
13. **Stream large music.** `AudioMixer` decodes whole files into memory, which is fine for effects but not for long tracks.
14. **Menu focus and reduced motion** in the shared UI controller.
15. **Release checklist**: versioning, changelog, store metadata, icons, and steps per target.
