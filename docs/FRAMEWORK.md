# Framework API and lifecycle notes

The package exports TypeScript source for Vite or another bundler that handles TypeScript dependencies. Generated games import the package; the examples in this framework checkout use relative imports.

## Imports

```ts
import { EventBus, GameLoop, Input, StateManager, UIController } from 'gameframework';
import { createPixiRenderer } from 'gameframework/pixi'; // 2D
// or: import { createThreeRenderer } from 'gameframework/three';
// or, with no dependency: import { createCanvasRenderer } from 'gameframework/canvas';
// Optional desktop integration: 'gameframework/desktop'
```

PixiJS, Three.js and the Tauri API are optional peer dependencies (Canvas 2D needs none). See [Renderers](RENDERERS.md). Optional physics engines are imported from `gameframework/physics/planck` or `gameframework/physics/matter`; see [Physics](PHYSICS.md). The generator installs the selected renderer, the selected physics engine and the Tauri API. For an existing Vite game, install the packages you import yourself.

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

`dt` is seconds, capped at 0.1 by default after a stall. If you use input, call `input.update()` before `states.update(dt)`.

### Fixed steps

Physics and deterministic gameplay need a fixed step, not the variable `dt`. `FixedStep` runs an update in whole steps and carries leftover time into the next frame:

```ts
import { FixedStep, GameLoop } from 'gameframework';

const fixed = new FixedStep(1 / 60, 5); // step size, most steps per frame
const loop = new GameLoop(dt => {
  fixed.advance(dt, step => world.update(step)); // whole steps only
  view.render(world, fixed.alpha);              // alpha: 0..1 progress into the next step
});
```

If a frame is longer than `maxSteps` steps, the rest of the backlog is dropped, so a long stall does not replay for seconds. Call `fixed.reset()` when a level starts or the game resumes. `GameLoop` itself is unchanged. A state is a flow controller, not a renderer scene. If the world stays alive during pause, keep rendering it while skipping gameplay updates; dispose it when leaving the game.

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

## Assets

`loadAssets` loads a game's images and sounds before it starts. List each file once in a manifest, await the result, then look files up by name:

```ts
const assets = await loadAssets({
  hero: { kind: 'image', url: hero },   // hero is a URL, for example from import hero from "./hero.png"
  jump: { kind: 'sound', url: jump },
} as const, {
  audio: audioContext,                  // needed for sound files
  onProgress: ({ loaded, total }) => bar.set(loaded / total),
  signal: abort.signal,                 // optional: cancels loading
});
assets.image('hero');                  // ImageBitmap, with width and height
mixer.setBuffer('jump', assets.sound('jump'));
```

- Declare the manifest `as const`. Then a misspelled name is a compile error, and a sound name passed to `image` is too.
- Loading stops at the first failed file. The error names that file and its URL, and `failures` lists what actually failed.
- `signal` cancels loading and rejects with `AssetLoadCancelled`. Files that finished are released.
- Images are `ImageBitmap`s, decoded with `fetch` and `createImageBitmap`. Pass `loaders` to replace either kind of loader, for example in tests.
- `dispose()` closes the images. Lookups after that throw.

## Timers

```ts
const timers = createTimers();
timers.after(2, () => showHint());
const stopBlink = timers.every(0.5, () => toggleCursor());
timers.update(dt);   // call each frame with the same dt as the loop
stopBlink();         // stop one timer
timers.clear();      // stop all of them, when a screen closes
```

- Times are seconds on the game's own clock. Delays must be positive.
- A repeating timer keeps its leftover time, so it does not drift. After a long stall it runs once for each interval it missed.
- Clear timers when a screen closes, so nothing from the old screen fires on the new one.

## Seeded random

```ts
const random = createRandom(levelSeed);
const roll = random.int(1, 6);       // whole numbers, both ends included
const x = random.range(0, 800);      // decimals, end excluded
const drop = random.pick(['coin', 'gem']);
```

- The same seed gives the same sequence. Store the seed to replay a level or reproduce a reported bug.
- Use `Math.random` for anything that does not need to repeat.

## Animation frames

```ts
const walk = createFrameAnimation(walkFrames, { fps: 8 });          // loops by default
walk.update(dt);
sprite.texture = walk.frame;

const boom = createFrameAnimation(boomFrames, { fps: 12, loop: false });
if (boom.done) remove();   // true once the last frame has shown for its full time
```

- Frames can be any type: images from the asset loader, texture names, or numbers.
- The frame shown depends only on elapsed time, so a stall does not make the animation slow down.

## Tweens and easing

```ts
const panel = { x: -300, alpha: 0 };
const slideIn = tween(panel, { x: 0, alpha: 1 }, 0.4, {
  easing: easing.easeOutBack,
  onDone: () => showButtons(),
});
slideIn.update(dt);  // call each frame
slideIn.cancel();    // stops where it is and skips onDone
```

- Only numeric properties can be tweened. Each property starts from its value when the tween is created.
- Easings: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeOutBack` (overshoots) and `easeOutBounce`.
- Two tweens on the same property fight over it. Cancel the first one before starting another.

## Localization

```ts
const text = createLocalizer({
  en: { play: 'Play', score: 'Score: {points}' },
  fr: { play: 'Jouer' },
} as const);

text.t('play');                    // "Play"
text.setLocale('fr');
text.t('play');                    // "Jouer"
text.t('score', { points: 40 });   // "Score: 40", falling back to English
```

- A key missing in the chosen language falls back to the first language. A key missing everywhere is shown as the key, so it stands out.
- Declare the tables `as const` and a misspelled key is a compile error.

## Lifecycle, viewport and diagnostics

- `AppLifecycle(onPause)` coalesces blur, page-hide and hidden-document signals. `resume()` acknowledges return and rejects while hidden. Native-wrapper-specific interruptions may need forwarding by a platform adapter.
- `fitViewport(width, height, logicalWidth, logicalHeight)` calculates a letterboxed layout. Apply its offsets and scale to your scene container. `clientToGame` maps screen coordinates through the layout. The sample uses a fixed logical play area and CSS safe-area padding.
- `DebugOverlay(root, inspect)` is opt-in. Call `update(dt)` each frame and `dispose()` on teardown. It updates the DOM at most twice a second.

## Renderer resources

Keep the canvas container explicitly sized in CSS; the renderer helpers resize to that container. With Three.js, dispose game-owned geometry, materials and textures as well as the renderer helper. With PixiJS, destroy the application and owned objects. The example's `FlightView` contract keeps this responsibility in the game.

For Tauri window controls and export settings, see [desktop and mobile builds](PLATFORM-BUILDS.md). For runtime behavior changes affecting existing games, see [the upgrade guide](UPGRADING.md).
