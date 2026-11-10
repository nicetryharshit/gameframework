# Scene files

A scene is a level or screen as data: entities, their parents, and their components. The format never mentions a renderer. Renderers and physics adapters read the scene and decide how to show or simulate it. The built-in play runtime (`createSceneRuntime`) uses planck.js, which is what the editor's Play button runs.

## File format (version 1)

```json
{
  "format": "gameframework.scene",
  "version": 1,
  "entities": [
    { "id": "ship", "components": { "transform": { "x": 3, "y": 2, "rotation": 90 }, "sprite": { "texture": "images/ship.svg" } } },
    { "id": "gun", "parent": "ship", "components": { "transform": { "x": 1 } } }
  ]
}
```

- `id` is a unique text id. References use ids, never positions, so reordering entries does not break them.
- `parent` is an id, or left out for a root. Parent loops and missing parents are refused on load.
- Components are keyed by name. Each component's data is an object of fields.
- Known fields that equal their default are left out when saving.
- Unknown components and unknown fields are kept exactly as written, so a scene edited on a machine without that component's adapter still round-trips.
- Known fields with a bad value fall back to their default and produce a warning. Nothing is silently dropped.

## Assets

Asset fields hold a path relative to the project's `assets/` folder, such as `images/crate.svg` or `audio/beep.wav`. Images go in `assets/images/`, audio in `assets/audio/`. The editor's Assets panel lists them and lets you drop them onto the view. The editor API checks uploads: a file must go in the matching folder, use a safe name and an allowed extension, and cannot climb out of `assets/`. Scene files are checked to be JSON with the scene format before they are written.

Assets are referenced by path, not by a stable id. Renaming or moving a file breaks scenes that point to it. This is a known limitation; see `docs/EDITOR.md`.

## Built-in components

| Name | Fields (default) |
| --- | --- |
| `transform` | `x` (0), `y` (0), `rotation` in degrees (0), `scaleX` (1), `scaleY` (1) |
| `sprite` | `texture` (asset path, image, `""`), `width` (1), `height` (1), `layer` (0), `tint` (`"#ffffff"`) |
| `collider` | `shape` (`"box"` or `"circle"`, `"box"`), `width` (1), `height` (1), `radius` (0.5) |
| `rigidbody` | `type` (`"dynamic"` or `"static"`, `"dynamic"`), `gravityScale` (1), `density` (1), `bounce` (0 to 1, 0) |
| `audio` | `clip` (asset path, audio, `""`), `volume` (0 to 1, 1), `loop` (false), `playOnStart` (true) |

A `rigidbody` needs a `collider` on the same entity to take part in physics. A `collider` on an entity that has a rigidbody parent is not simulated separately, and the runtime warns about it. A child of a body follows the body's physics pose.

Games add their own components with `ComponentRegistry.register()`. Field types are `number` (with optional `min` and `max`), `string`, `boolean`, `enum` and `asset` (with `kind: "image"` or `kind: "audio"`).

## Play runtime

```ts
import { createSceneRuntime, parseScene } from 'gameframework/scene';

const { scene } = parseScene(text);
const runtime = createSceneRuntime(scene, {
  createAudio: (clip, options) => myAudio(clip, options), // optional
  onWarning: message => console.warn(message)
});
// each frame:
runtime.advance(deltaSeconds);  // fixed 1/60 s steps, gravity -9.81
runtime.dispose();              // when the scene is left
```

The runtime does not change the scene. Stopping play throws the runtime away and the scene is exactly as it was before play.

## Using it

```ts
import { parseScene, sceneToJson, setField, worldTransform } from 'gameframework/scene';

const { scene, warnings } = parseScene(text);
const edited = setField(scene, 'gun', 'transform', 'x', 2);
const saved = sceneToJson(edited);
const placed = worldTransform(edited, 'gun'); // where the gun is in the world
```

Every operation returns a new scene and never changes the one it was given. Keep the previous scene to get undo.

## Rules for contributors

- Do not add renderer or physics fields to the format. Put them in a component that a renderer or adapter reads.
- Adding a field with a new default is a compatible change. Removing a field, renaming it, or changing a default's meaning needs a version bump and a note in `docs/UPGRADING.md`.
- Keep scene code free of DOM, Pixi and Three imports so it runs in tests with no renderer. The runtime may import planck but not a renderer.
