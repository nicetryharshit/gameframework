# Web game starter

A small TypeScript foundation for browser games, with a renderer-independent core and optional PixiJS 2D and Three.js 3D helpers. The runnable examples demonstrate an HTML UI over a canvas, input, game states, pause, and rendering.

## Use it in a new game

The quickest local setup is now:

```sh
npm install
npm run create:game -- ../my-new-game 2d
# use 3d instead for Three.js
cd ../my-new-game
npm install
npm run dev
```

The generator refuses to overwrite an existing directory. It creates one renderer example, touch controls, the shared framework dependency, and Tauri export scripts. By default it uses a local file dependency on this checkout. For portable builds, pass a pinned Git package spec as the third argument: `npm run create:game -- ../my-game 3d "git+https://github.com/YOUR_NAME/webgameframework.git#COMMIT"`. It creates files only; installation and SDK setup remain explicit. Configure your game's placeholder app identifier and icons before mobile initialization. You can also run `create-web-game <directory> <2d|3d>` from an installed package.

Keep this repository as one shared framework rather than maintaining separate branches. In a new **Vite + TypeScript** game, install this repository as a Git dependency, replacing the URL and tag with the actual repository and released commit/tag:

```sh
npm install 'git+https://github.com/YOUR_NAME/webgameframework.git#v0.1.0'
npm install pixi.js                 # for 2D
# OR: npm install three && npm install -D @types/three  # for 3D
```

Commit the new game's lockfile. Pin a framework tag or commit to make builds reproducible, and update it deliberately when you want framework changes. This repository must first be committed, hosted, and tagged; the URL above is an example, not an existing published package. To work on both repositories locally, npm supports a local path dependency, e.g. `npm install ../webgameframework` (reinstall after framework changes if your package manager copies it).

```ts
import { GameLoop, Input, StateManager } from 'web-game-framework';
import { createPixiRenderer } from 'web-game-framework/pixi'; // 2D only
// or: import { createThreeRenderer } from 'web-game-framework/three'; // 3D only
```

The package exports TypeScript source and is intended for Vite or another bundler that handles TypeScript dependencies. PixiJS and Three.js are optional peer dependencies; install only the one your game uses. These helpers expose the actual libraries, so game code can use their full APIs. See `src/demo-2d.ts`, `src/demo-3d.ts`, and `src/demo.ts` for complete working examples. The examples are reference code in this repository; copy the relevant pieces into a new game as a starting point.

In Unity terms, Pixi's stage is a hierarchy of 2D display objects; Three's scene contains 3D objects, lights, and a camera. The shared game loop calls your world's update and render each frame. The state manager controls flow such as playing and paused, while HTML screens sit over the canvas. In the examples, pausing stops world updates but keeps rendering the world behind the pause screen.

## Run

Install Node.js, then run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite and select the 2D or 3D example. `npm run build` checks types and creates `dist/`; `npm test` runs the core tests. Serve `dist/` with a web server to preview a production build.

## Export builds

The example Tauri wrapper packages the current `index.html`, including its example links. Replace the frontend with your game before releasing. Run `npm install` first.

| Command | Result and requirements |
| --- | --- |
| `npm run build:web` | Web files in `dist/`. |
| `npm run dev:desktop` | Run the game in a desktop window with Vite. |
| `npm run build:desktop` | Unsigned build for the host OS, under `src-tauri/target/release/` and `bundle/`. Run on Windows for Windows or macOS for macOS; this is not a cross-compiler. |
| `npm run init:android` | Generate the Android project once on a machine with the Android prerequisites. |
| `npm run build:android` | Debug APK for local testing, under `src-tauri/gen/android/app/build/outputs/apk/`. Android's debug key is used; no release signing is configured. |
| `npm run dev:android` | Run on an Android device or emulator. |
| `npm run init:ios` | Generate an Xcode project on a Mac with the iOS prerequisites. |
| `npm run dev:ios` | Run using the iOS simulator or a configured device. Simulator use does not require distribution signing. |
| `npm run build:ios` | Invoke Tauri's iOS release build on a Mac. An installable device or distribution build requires Apple signing; none is configured here. |

Install Rust and the platform SDKs described in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Windows needs MSVC C++ build tools and WebView2; Android needs Java, Android Studio/SDK/NDK and Rust Android targets; iOS needs macOS, Xcode, CocoaPods and Rust iOS targets. `npx tauri info` checks the local environment. The generated mobile projects in `src-tauri/gen/` are ignored and can be regenerated; if you customize them, manage those changes in your game repository rather than losing them on regeneration.

Before shipping, change `productName`, `identifier`, window title, version and icons in `src-tauri/tauri.conf.json`. The sample identifier and Tauri icons are placeholders. Store signing, notarization, Steamworks, store uploads, and CI are not configured. An unsigned macOS app can be blocked by Gatekeeper; iOS devices and store distribution need signing. The samples use keyboard/gamepad controls, so mobile export does not yet imply touch-playable games.

### Adding exports to a separate game repository

Installing the framework dependency does not automatically configure an app wrapper: each game owns its native project and metadata. Copy `node_modules/web-game-framework/src-tauri` into the game root as `src-tauri`, install the CLI with `npm install -D @tauri-apps/cli`, and copy the export scripts from this repository's `package.json`. Ensure the game has a `build:web` script that builds its Vite frontend to `dist/`, and a `dev` script serving port 5173. Set Vite's `base` to `./` and `server.port` to 5173 with `strictPort: true`, or update the Tauri configuration to match. Replace the placeholder metadata, ignore `src-tauri/target` and generated projects as appropriate, and run the commands above from the game root. Commit the native project files and Cargo lockfile after the first build with the game.

## Where to start

Replace `src/main.ts` and `src/style.css` with your game. The example is intentionally small and shows how the pieces fit together:

1. Create shared services such as `EventBus`, `Input`, `SaveStore`, and `UIController`.
2. Register states with `StateManager`: each can have `enter`, `update`, and `exit` methods. Change states with `states.change('playing')`. Put cleanup for state-owned objects and subscriptions in `exit`.
3. Register DOM screens with `UIController` and call `ui.show('menu')` from state lifecycle methods. Screens may also have `show` and `hide` hooks. One screen is visible at a time; use ordinary DOM elements inside it for overlays.
4. Start a `GameLoop` and call `input.update()` before `states.update(dt)`. `dt` is seconds and is capped at 0.1 after a stall. Stop the loop and dispose services when tearing down a game.

```ts
import { EventBus, GameLoop, StateManager } from './framework';

const events = new EventBus<{ collected: number }>();
const off = events.on('collected', amount => console.log(amount));
events.emit('collected', 1);
off(); // remove a listener when its owner exits

const states = new StateManager({ events });
states.register('playing', {
  enter: context => console.log('start', context),
  update: (_context, dt) => { /* update game objects, then render */ },
  exit: () => { /* release state-owned resources */ }
});
states.change('playing');
const loop = new GameLoop(dt => states.update(dt));
loop.start();
// On shutdown: loop.stop(); states.dispose(); events.clear();
```

The event bus is synchronous; `on` and `once` return unsubscribe functions. State transitions requested in `enter` or `exit` are queued; the last request during a lifecycle call wins. Don't create cycles between state enter hooks. States remain registered until their manager is discarded.

## Other services

### Production-oriented helpers

- `Input.value(action)` returns analog strength in 0..1. Axis bindings use `{ index, direction }` with a configurable dead zone; `bind` replaces an action's binding at runtime. Keyboard shortcuts skip editable fields. `reset()` clears input on interruption. Persist chosen bindings in your own settings schema if needed.
- `PointerInput(element)` tracks active pointers normalized to the element, with capture and cancellation handling. Call `dispose()` on teardown. `bindActionButton(button, input, action)` adds multitouch virtual controls and returns cleanup.
- `AppLifecycle(onPause)` coalesces blur, page-hide and hidden-document signals. `resume()` explicitly acknowledges return (and rejects while hidden). The demos pause on interruption; native wrapper-specific interruption signals may need forwarding in a platform adapter.
- `fitViewport(availableWidth, availableHeight, logicalWidth, logicalHeight)` calculates a letterboxed layout; `clientToGame` maps screen coordinates through that layout. Apply its offsets/scale to your scene container. The default examples use responsive worlds; their CSS includes safe-area padding and viewport-fit metadata.
- `VersionedSaveStore(namespace, schema, storage)` validates and migrates versioned slots. Pass a storage backend explicitly, such as `localStorage`. `load`, `save`, and `remove` return `{ ok, value }` or `{ ok: false, error }`, including quota and access errors. Missing slots return `undefined`; rejected/future saves remain untouched. Migration happens in memory; explicitly save the migrated value after deciding to accept it. This is local persistence, not cloud sync or a multi-file transaction system.
- `createSettingsStore(namespace, storage)` provides a validated versioned schema for master/music/effects volume and mute; `defaultSettings` supplies defaults. Handle a failed load visibly rather than automatically overwriting existing settings.
- `AudioMixer` is an optional Web Audio service: `load(name, url, signal?)`, `unlock()` from a user gesture, `play(name, 'music'|'effects', loop?)`, `setVolume(bus|'master', volume)`, `suspend()`, and `dispose()`. It decodes once and limits simultaneous voices (32 by default); play returns `undefined` if suspended or at capacity, otherwise a stoppable voice. Bus volume changes affect active voices. Use `suspend` with lifecycle pause and `unlock` on resume; handle rejected promises. Buffer-based audio is intended for short assets; large music files may need streaming.
- `DebugOverlay(root, inspect)` is opt-in. Call `update(dt)` once per frame and `dispose()` on teardown. Append `?debug` to an example URL for FPS and active state. It updates DOM twice per second.

The core has no runtime library dependencies. Renderer imports remain separate. `npm run benchmark` reports an input-polling microbenchmark; it is not a full-game FPS guarantee. Tests cover lifecycle interruption, action edges, save corruption/migration/quota errors, transition cycles, frame stalls and audio voice cleanup. CI runs tests and frontend builds on Windows, macOS and Linux; physical-device smoke testing is still required for mobile releases.

- `Input`: map action names to keyboard codes, gamepad buttons or axes. Call `update()` once per frame, then use `value`, `held`, `pressed`, or `released`. Rebinding UI is game-owned.
- `SaveStore`: `save(key, value)`, `load(key, fallback)`, and `remove(key)` use namespaced `localStorage`. JSON is not validated or versioned; validate/migrate your own save data. Storage access and quota errors can throw, so handle them in your game. Browser storage may be cleared by the player.
- `AudioPlayer`: `add(name, url)`, then `await play(name, { loop: true })`. Playback returns the audio element so you can pause or stop it. Set volume before playback with `setVolume(0..1)`; it applies to subsequently played sounds. Start audio from a user gesture and handle rejected playback promises.
- `UIController`: DOM-based menus work independently of your renderer. Provide your own accessibility, focus handling, and visual design for each game.

The renderer helpers resize their canvases to the container. Keep the container explicitly sized in CSS. For Three.js, dispose game-owned geometries, materials, and textures as well as the renderer helper; for PixiJS, destroy the application and its owned objects. If the world persists across pause, dispose it when leaving the game, not when entering pause. This starter does not yet include Steam integration, advanced audio mixing, physics, asset management, resolution scaling, or a debug overlay; add them when a project needs them.
