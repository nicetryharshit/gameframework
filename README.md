# Web Game Framework

A small TypeScript game starter for **PixiJS (2D)** or **Three.js (3D)**, with shared game systems and a local visual build dashboard. Develop in the browser, then package the same game for desktop or mobile with Tauri.

Each new game starts with **Pocket Flight**, a removable Flappy-style example with menus, scoring, pause, restart, settings and a saved personal best.

## On this page

- [Create your first game](#create-your-first-game)
- [Run and test your game](#run-and-test-your-game)
- [Build and export](#build-and-export)
- [Replace the example](#replace-the-example)
- [How the framework fits together](#how-the-framework-fits-together)
- [Update an existing game](#update-an-existing-game)
- [Detailed guides](#detailed-guides)

## Create your first game

For browser development, you need Node.js 22+, npm, and a browser. Native builds also need Rust and the relevant platform SDKs; you can set those up later.

From this framework checkout:

```sh
npm install
npm run create:game -- ../my-game 2d
```

Use `3d` instead of `2d` to choose Three.js. The generator creates the destination directory, so **it must not already exist**.

Then switch to your new game:

```sh
cd ../my-game
npm install
npm run dev
```

Open the URL printed in the terminal. Your game is ready to play.

Keep the framework and game as separate projects:

```text
Projects/
  webgameframework/   ← shared framework checkout
  my-game/            ← your game's own repository
```

The generated game uses a local dependency on the framework. You do not need a nested clone. When you want to share or release the game, pin that dependency to a framework Git commit or tag. See [updating and sharing games](docs/UPGRADING.md).

## Run and test your game

Run these commands **from your game directory**:

| What you want | What to use |
| --- | --- |
| Quickly play while editing code | `npm run dev` |
| Open the visual development/export tools | `npm run export:ui` |
| Produce web files from the terminal | `npm run build:web` |

### Use the visual dashboard

```sh
npm run export:ui
```

This starts the **dashboard**, not a game build. Open the local URL printed in the terminal, normally `http://127.0.0.1:4179`.

Select **Web**, then choose an action:

| Dashboard action | What happens |
| --- | --- |
| **Run Dev Server** | Starts the game with live source updates. No export build is created. |
| **Build** | Checks TypeScript, builds the game, and collects the exported files. |
| **Build & Run** | Builds an export and gives you a link to preview that finished snapshot. |

For everyday development, use **Run Dev Server → Open live game**. Changes to your source update the running game. The dev server uses port 5173; stop an existing server on that port before starting another.

Use **Stop Session** to end a dev session. Closing the game tab does not stop the server. Keep the dashboard's terminal open; Ctrl+C stops the dashboard and its active build/session.

### Try the example

Tap the sky, press Space/Enter, or use controller A to flap. Pass a pipe to score; hitting a pipe, the ceiling or the ground ends the run.

- Menus: arrows, D-pad or vertical stick to navigate; Space/Enter/A to select.
- Pause/resume: Escape or controller Start.
- Settings: available from the main and pause menus.
- Desktop fullscreen toggle: F11.

To try examples directly in the framework checkout, run `npm run dev`. The root page uses PixiJS; open `/3d.html` for the Three.js version.

## Build and export

The easiest route is **`npm run export:ui`**. Choose a platform, select Development or Release, check the prerequisites, then build or open its native project.

The dashboard provides saved profiles, live logs, cancellation, output-folder links and build reports. Profiles are stored in `export-profiles.json`; commit this file with your game. Collected artifacts go into `Builds/<platform>/<mode>/<build-id>/`, which is ignored by Git.

| Target | Current workflow and output |
| --- | --- |
| **Web** | Export static files for hosting or itch.io. The terminal command writes `dist/`; the dashboard also collects a separate snapshot under `Builds/`. |
| **Windows / macOS / Linux** | Build on the matching operating system. Tauri produces a desktop app and the configured bundles/installers. Desktop builds currently skip signing. |
| **Android** | Initialize an editable Android Studio/Gradle project, then build a development debug APK. Dashboard release builds are disabled until release signing is configured. |
| **iOS** | On your Mac, initialize an editable Xcode project, then open Xcode for simulator/device work. Dashboard archive/export builds are disabled until signing is configured. |

Desktop games start fullscreen without a title bar. Their Settings menu includes fullscreen/windowed/borderless mode, window-size presets, frame limit, render quality, volume controls and mute. Saved preferences are restored on launch, and a Quit button is available on desktop.

### Open native mobile projects

Set your app identifier and icons in `src-tauri` before initializing mobile projects. Then run:

```sh
# iOS — on your Mac
npm run init:ios
npm run open:ios

# Android
npm run init:android
npm run open:android
```

The editable projects live in `src-tauri/gen/apple/` and `src-tauri/gen/android/`. Initialize them once, keep customizations in your game's Git repository, and preserve them between builds. They remain integrated with the rest of the game source.

For SDK requirements, command-line alternatives and exact output locations, see [desktop and mobile builds](docs/PLATFORM-BUILDS.md). For dashboard profiles and supported actions, see [the dashboard guide](docs/EXPORT-DASHBOARD.md).

## Replace the example

Pocket Flight belongs to your generated game; its rules are separate from the shared framework.

| Generated file | What it contains |
| --- | --- |
| `src/flappy.ts` | Gameplay rules, movement, collisions and scoring |
| `src/demo.ts` | Main menu, gameplay, pause and game-over flow |
| `src/demo-settings.ts` | The example settings screen |
| `src/demo-2d.ts` **or** `src/demo-3d.ts` | Renderer setup, visual objects and game entry point |
| `src/demo.css` | Example layout and styling |

Replace these files as your game takes shape, or remove them and point `index.html` at your own entry file. Keep `package.json`, `vite.config.ts` and `src-tauri` for the development/export setup.

Choose a unique save/settings namespace when adapting the example; the sample uses `pocket-flight`.

## How the framework fits together

The game world is drawn into a **canvas** by PixiJS or Three.js. Menus and the HUD use **HTML/CSS over the canvas**.

If you come from Unity: Pixi's stage is a hierarchy of 2D objects; Three's scene contains meshes, lights and cameras. The framework's state manager controls game flow such as menu, playing and paused. The game loop updates the active state and asks your renderer to draw.

| Shared service | Purpose |
| --- | --- |
| `GameLoop` | Frame timing, capped delta time and optional frame limiting |
| `StateManager` | `enter`, `update` and `exit` hooks for game flow |
| `EventBus` | Typed events and removable subscriptions |
| `UIController` | Show/hide DOM menu screens |
| `Input` / pointer helpers | Keyboard, gamepad, analog actions, touch and virtual buttons |
| Save/settings stores | Validated versioned data, migration and error reporting |
| `AudioMixer` | Music/effects buses, volume, playback and voice limits |
| Lifecycle / viewport helpers | Background pause signals, scaling and coordinate mapping |
| `DebugOverlay` | Optional FPS and game-state display; try `?debug` on an example URL |

The core has no runtime library dependencies. Renderer and native-window imports are separate, and the helpers expose the actual libraries so you can use their full APIs.

See [framework API and lifecycle notes](docs/FRAMEWORK.md) for imports, a small code example and cleanup guidance.

## Update an existing game

**Generate once; update the dependency later.** You do not need to recreate your game.

- With the default local link, edits to the framework source are available to the game. Restart the dev server if needed.
- For shared/release builds, install a newer pinned framework Git commit/tag, test the game, and commit its updated `package.json` and lockfile.
- Copied game files, build scripts and native configuration belong to the game. Dependency updates do not rewrite them.

For the exact commands, rollback, copied-file updates and adding the dashboard to older games, use [the upgrade guide](docs/UPGRADING.md) and [dashboard setup for existing games](docs/EXPORT-DASHBOARD.md#existing-games).

## Detailed guides

| Guide | When to read it |
| --- | --- |
| [Visual export dashboard](docs/EXPORT-DASHBOARD.md) | Profiles, live dev sessions, builds, logs and output folders |
| [Desktop and mobile builds](docs/PLATFORM-BUILDS.md) | Platform SDKs, fullscreen settings, Xcode/Android Studio and native outputs |
| [Framework API](docs/FRAMEWORK.md) | Shared services, imports and lifecycle/cleanup details |
| [Updating games](docs/UPGRADING.md) | Dependency updates, compatibility and preserving game-owned files |

To check changes in **this framework repository**, run `npm test` and `npm run build`. `npm run benchmark` measures input polling only. GitHub checks are optional; the inactive template is in `templates/github/`.

Store signing, notarization, store uploads, Steamworks, physics and cloud saves are separate integrations. Platform builds still need testing on actual target devices.
