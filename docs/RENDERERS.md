# Renderers

A renderer is a small factory in `src/renderers/` that creates a drawing surface inside a container and hands back the engine's own objects. The framework game loop decides when to draw. Games import a renderer by name, for example `gameframework/pixi`.

## Included

| Id | Kind | Packages | Use it for |
| --- | --- | --- | --- |
| `pixi` | 2D | `pixi.js` | Sprites, filters, WebGL/WebGPU 2D |
| `three` | 3D | `three`, `@types/three` | 3D scenes |
| `canvas` | 2D | none | Small games, tools, or anything where a dependency is not worth it |

New games can pick any renderer in the table. Each game's example scene comes from its registry entry (`demo`).

```ts
import { createCanvasRenderer } from 'gameframework/canvas';
const view = createCanvasRenderer(document.getElementById('app')!, { background: '#101820' });
// each frame: view.clear(); view.context.fillRect(10, 10, 40, 40);
```

`view.width` and `view.height` are CSS pixels. The backing store is scaled for sharp output, capped at 2x.

## Adding a renderer to a game

In the framework dashboard open **Games**, then **Update tools** on the game, then **Add** next to the renderer. This:

1. copies that renderer's file into the game's `tools/gameframework/src/renderers/` if it is not there yet,
2. maps `gameframework/<id>` in the game's `tsconfig.json` and `vite.config.ts`,
3. adds the renderer's packages to the game's `package.json` at the versions the framework uses.

It does not run npm. Open the game's dashboard and use **Install dependencies**. Adding a renderer twice changes nothing. Updating the **Renderers** part refreshes only the renderer the game already uses; it does not add others.

## Removing a renderer from a game

In **Update tools**, click **Remove** next to a renderer the game has. This deletes that renderer's file, alias and packages from the game. Removal is refused while game code still imports the renderer, and a game always keeps at least one renderer.

## Adding a renderer to the framework

1. Add `src/renderers/<id>.ts` exporting `create<Id>Renderer(container, ...)`.
2. Add a demo scene `src/demo-<id>.ts` that imports the renderer from `./renderers/<id>` and add it to `package.json` `files`.
3. Add an entry to `src/renderers/registry.json` (`id`, `label`, `kind`, `entry`, `demo`, `note`, `packages`, and `devPackages` for type packages). New games and the New game form pick it up automatically.
4. Add the packages to the framework's `devDependencies` so the version is pinned in one place, and an export in `package.json` (`"./<id>": "./src/renderers/<id>.ts"`).
5. Add a test. A new game carries only its chosen renderer, and the New game form lists every registry entry.

## Alternatives worth considering

These are candidates, not commitments. None is wired in yet.

**2D**
- **Phaser** is a full 2D framework (scenes, physics, input, audio). One comparison found it the strongest of the three on stability and performance, and notes a headless mode for server-side multiplayer. That comparison was published on Phaser's own site and tested one game, so treat it as a lead, not a verdict. [Source](https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework)
- **Kaplay** is described as the easiest to learn, suited to jams and prototypes, with performance limits on larger projects (same source).
- **Excalibur** is a TypeScript-first, Phaser-like engine; the same comparison saw little reason to choose it over Phaser.
- Licences and bundle sizes of these three were not covered by the source and are unchecked.

**3D** (figures from a 2026 comparison: [Utsubo](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison))

| | Three.js | Babylon.js | PlayCanvas |
| --- | --- | --- | --- |
| Licence | MIT | Apache 2.0 | MIT |
| Size (min+gzip, full import) | ~185 kB | ~1.8 MB, tree-shakes | ~615 kB |
| WebGPU | Production-ready (`three/webgpu`) | Full support | Beta, falls back to WebGL 2 |
| Fits | Code-first, small bundles | Games, WebXR, simulations | Teams with non-developers, mobile |

**Where this points.** Phaser is the strongest candidate for a second 2D renderer because it covers what Pixi leaves to you (scenes, physics, audio). Babylon.js is the candidate for a game-oriented 3D option, at a much larger size. Each would need a thin adapter with the same shape as `pixi.ts` and a check that it bundles cleanly in a Tauri shell.
