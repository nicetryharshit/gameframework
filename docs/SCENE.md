# Scene files

A scene is a level or screen as data: entities, their parents, and their components. It never mentions a renderer or a physics engine. Renderers and physics adapters read the scene and decide how to show or simulate it.

## File format (version 1)

```json
{
  "format": "gameframework.scene",
  "version": 1,
  "entities": [
    { "id": "ship", "components": { "transform": { "x": 3, "y": 2, "rotation": 90 }, "sprite": { "texture": "ship.png" } } },
    { "id": "gun", "parent": "ship", "components": { "transform": { "x": 1 } } }
  ]
}
```

- `id` is a unique text id. References use ids, never positions, so reordering or renaming entries does not break them.
- `parent` is an id, or left out for a root. Parent loops and missing parents are refused on load.
- Components are keyed by name. Each component's data is an object of fields.
- Known fields that equal their default are left out when saving.
- Unknown components and unknown fields are kept exactly as written. A level edited on a machine without that component's adapter still round-trips.
- Known fields with a bad value fall back to their default and produce a warning. Nothing is silently dropped.

## Built-in components

| Name | Fields (default) |
| --- | --- |
| `transform` | `x` (0), `y` (0), `rotation` in degrees (0), `scaleX` (1), `scaleY` (1) |
| `sprite` | `texture` (`""`), `layer` (0), `tint` (`"#ffffff"`) |
| `collider` | `shape` (`"box"` or `"circle"`, `"box"`), `width` (1), `height` (1), `radius` (0.5) |

Games add their own components with `ComponentRegistry.register()`. Field types are `number` (with optional `min` and `max`), `string`, `boolean` and `enum`.

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
- Keep scene code free of DOM, Pixi and Three imports so it runs in tests with no renderer.
