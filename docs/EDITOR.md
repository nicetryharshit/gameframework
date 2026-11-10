# Scene editor

A desktop editor for scene files. Open it with the dev server:

```sh
npm run dev
```

then go to `http://127.0.0.1:5173/editor.html`. The page is desktop only.

The editor is a dev tool. Its save and asset endpoints exist only under the Vite dev server, so a built game never contains them. Shipping the editor inside generated games is a separate, opt-in step that is not wired up yet.

## What it does

- **Hierarchy**: entities with parent links. Drop an entity on another to parent it, or on the empty area to unparent it.
- **View**: a Canvas 2D viewport with y-up world coordinates, pan and zoom, and click, drag and nudge editing. Sprites are drawn with their asset images. Colliders and selection outlines are drawn on top.
- **Inspector**: fields from each component's schema. Asset fields are dropdowns that list the project's assets. A field that points at a missing asset is flagged. Components the editor has no schema for are shown as raw JSON and kept as written.
- **Assets**: the `assets/images` and `assets/audio` folders, with thumbnails and an audio player preview. Import with the button, or drop files on the panel. Drag an image or sound from the panel onto the view to place a new entity.
- **Play**: runs the scene with physics and audio (`createSceneRuntime`, the same runtime a game uses). Pause and resume are available. Stopping returns to the scene as it was before play. Edits are blocked while playing, so the scene the runtime is running stays fixed.
- **Save**: writes `scenes/<name>.scene.json` through the dev server and logs a download link in the console. **Download** saves the current scene to a file without the server.
- **Undo and redo** cover every edit, including drags. A drag is one undo step.

## Layout

The panels are a docking workspace, built on [flexlayout-react](https://github.com/caplin/FlexLayout) (the same library Meerkat uses). Drag a tab onto another tab strip to group it, onto an edge to split the space, or away from the strip to float it. Drag the splitters to resize. Closed panels come back from **Window → Show …**, and **Window → Reset layout** restores the default arrangement.

The arrangement is saved in this browser under `scene-editor.workspace.v1`. A saved layout is checked before use; anything unexpected falls back to the default. Panel contents live in persistent containers outside the layout, so moving or floating a tab keeps the viewport, the selection and the console as they are.

The editor is a dev tool, so flexlayout, React and react-dom are `devDependencies`. They are not in any generated game. Pop-out windows are off: they would need the panel containers moved across browser windows, which is not built yet.

## Controls

| Action | Input |
| --- | --- |
| Select | Click an entity; click empty space or press Esc to clear |
| Move | Drag an entity (snaps when a snap step is set) |
| Pan | Drag empty space |
| Zoom | Scroll wheel, centred on the pointer |
| Nudge | Arrow keys (snap step, or 0.1 units); Shift+arrow moves 1 unit |
| Focus | F |
| Duplicate / delete | Ctrl+D / Delete |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Save | Ctrl+S |
| Play / stop | Ctrl+P, or the Play button |
| Command search | Ctrl+K (menus and shortcuts are listed there too) |

While you type in a field, shortcuts other than Ctrl+P are ignored.

## Design

Research that shaped the design:

- Unity separates the scene (a hierarchy of objects with components) from the assets (files referenced from the scene), and reloads a scene from its saved file when play starts. See [Unity: scene reloading](https://docs.unity3d.com/Manual/scene-reloading.html).
- Godot identifies resources with stable UIDs so references survive renames and moves. See [Godot: ResourceUID](https://docs.godotengine.org/en/4.2/classes/class_resourceuid.html).

What we took from that:

1. **The scene file is data, not code.** It is a flat entity list linked by parent ids, with components keyed by name. Unknown components and fields are kept as written, so a scene made with one adapter still loads in another.
2. **Every edit is an immutable operation.** Scene operations return a new scene, which makes undo a stack of snapshots and keeps the runtime and the editor apart.
3. **The editor does not own the renderer.** The viewport draws the scene itself with Canvas 2D and never imports a game renderer.
4. **Play runs a copy of the scene.** The runtime is built from the scene and thrown away on stop. Nothing the simulation does can change the saved scene.
5. **Components describe themselves.** Each component has a schema with field types and defaults. The inspector, validation and serialization all read the schema, so a game can register its own components.

## Known limits

- **Assets are referenced by path.** Renaming or moving a file in `assets/` breaks scenes that point to it. Stable asset IDs with a rename-safe index are the planned fix.
- **Saving needs the dev server.** Without it the editor still works, but Save logs an error in the console. Use Download instead.
- **No scripting yet.** Behaviours that run game code on entities are not part of the format.
- **Play uses planck physics only.** Other physics adapters are not used by the editor.
- **Not yet in create-game.** Generated games do not include the editor. The opt-in wiring is the next step.

## Tests

The scene logic, the runtime and the dev-server rules have tests that run without a browser:

```sh
npx tsx --test tests/scene.test.ts tests/scene-runtime.test.ts tests/editor*.test.ts
```
