# Framework API and lifecycle notes

The package exports TypeScript source for Vite or another bundler that handles TypeScript dependencies. Generated games import the package; the examples in this framework checkout use relative imports.

## Imports

```ts
import { EventBus, GameLoop, Input, StateManager, UIController } from 'gameframework';
import { createPixiRenderer } from 'gameframework/pixi'; // 2D
// or: import { createThreeRenderer } from 'gameframework/three';
// Optional desktop integration: 'gameframework/desktop'
```

PixiJS, Three.js and the Tauri API are optional peer dependencies. The generator installs the selected renderer and Tauri API. For an existing Vite game, install the renderer/native packages you import yourself.

## A small game loop

```ts
import { EventBus, GameLoop, StateManager } from 'gameframework';

const events = new EventBus<{ collected: number }>();
const off = events.on('collected', amount => console.log(amount));
events.emit('collected', 1);

const states = new StateManager({ events });
states.register('playing', {
  enter: () => { /* create game objects */ },
  update: (_context, dt) => { /* update gameplay, then render */ },
  exit: () => { /* release state-owned resources */ }
});
states.change('playing');

const loop = new GameLoop(dt => states.update(dt));
loop.start();

// On teardown:
loop.stop();
states.dispose();
off();
events.clear();
```

`dt` is seconds, capped at 0.1 by default after a stall. If you use input, call `input.update()` before `states.update(dt)`. A state is a flow controller, not a renderer scene. If the world stays alive during pause, keep rendering it while skipping gameplay updates; dispose it when leaving the game.

Events are synchronous. Both `on` and `once` return unsubscribe functions. State transitions requested inside `enter` or `exit` are queued; the last pending request wins. Transition cycles throw an error. A disposed state manager cannot be reused.

## Input and UI

- `Input` maps action names to keyboard codes, standard gamepad buttons and axes. Call `update()` once per frame, then read `value`, `held`, `pressed` and `released`. `value` is 0..1; axis bindings use `{ index, direction }` and a configurable dead zone. `bind` replaces a binding at runtime.
- Keyboard shortcuts skip editable fields. `reset()` clears input on interruption. Quick keyboard/virtual taps can report both pressed and released in the same frame while held is false. Gamepads are sampled each frame. Rebinding UI and persistence are game-owned.
- `PointerInput(element)` tracks active pointers normalized to the element, including pointer capture and cancellation. `bindActionButton(button, input, action)` adds multitouch virtual input and returns cleanup. Dispose/remove these when leaving their owner.
- `UIController` shows one registered DOM screen at a time, with optional `show`/`hide` hooks. Screen design, accessibility and focus handling belong to the game; see the example menus for a starting point.

## Saves and settings

`VersionedSaveStore(namespace, schema, storage)` accepts an explicit storage backend such as `localStorage`. Its schema provides a version, validation and optional migration function. `load`, `save` and `remove` return `{ ok: true, value }` or `{ ok: false, error }`, including quota/access failures.

A missing slot returns undefined. Rejected or future-version saves remain untouched. Migration happens in memory; explicitly save a migrated value after deciding to accept it. Handle a failed load rather than automatically overwriting a player's data. This is local persistence, not cloud synchronization or multi-file transactions.

`createSettingsStore` provides validated audio settings; `createPreferencesStore` adds display mode, window size, frame limit and render quality. Their defaults are exported. The older `SaveStore` is a simple namespaced JSON helper without validation/versioning; storage access and quota errors can throw.

## Audio

Use the optional `AudioMixer` for new games:

- `load(name, url, signal?)` fetches and decodes a sound once; `setBuffer` accepts an existing audio buffer.
- Call `unlock()` from a user gesture and handle a rejected promise.
- `play(name, 'music' | 'effects', loop?)` returns a stoppable voice, or undefined if suspended or at capacity. The default voice limit is 32.
- `setVolume(bus | 'master', value)` changes active and future voices. Use `suspend()` when pausing and `unlock()` on resume.
- `dispose()` releases voices/buffers and closes the audio context.

Decoded buffers suit short assets. Large music files may need streaming. `AudioPlayer` is deprecated but remains exported for compatibility.

## Lifecycle, viewport and diagnostics

- `AppLifecycle(onPause)` coalesces blur, page-hide and hidden-document signals. `resume()` acknowledges return and rejects while hidden. Native-wrapper-specific interruptions may need forwarding by a platform adapter.
- `fitViewport(width, height, logicalWidth, logicalHeight)` calculates a letterboxed layout. Apply its offsets and scale to your scene container. `clientToGame` maps screen coordinates through the layout. The sample uses a fixed logical play area and CSS safe-area padding.
- `DebugOverlay(root, inspect)` is opt-in. Call `update(dt)` each frame and `dispose()` on teardown. It updates the DOM at most twice a second.

## Renderer resources

Keep the canvas container explicitly sized in CSS; the renderer helpers resize to that container. With Three.js, dispose game-owned geometry, materials and textures as well as the renderer helper. With PixiJS, destroy the application and owned objects. The example's `FlightView` contract keeps this responsibility in the game.

For Tauri window controls and export settings, see [desktop and mobile builds](PLATFORM-BUILDS.md). For runtime behavior changes affecting existing games, see [the upgrade guide](UPGRADING.md).
