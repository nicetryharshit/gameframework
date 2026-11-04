# Updating a game

Each game keeps its own copy of the framework in `tools/gameframework/`. Your game code, `src-tauri/`, `export-profiles.json` and `Builds/` belong to the game and are never overwritten by a framework update.

## Bringing in a newer framework

In the framework's dashboard, open **Games**. A game with older tools shows **Update available** (and the sidebar's Games item gets a dot). Click **Update tools** to choose what to update:

| Part | What it is |
| --- | --- |
| Core framework | `src/framework`: events, UI, state, input, saves, audio, assets, timers, tweens and more |
| Renderers | `src/renderers`: the renderers the game uses, and their registry |
| Physics engines | `src/physics`: the engines the game uses, and their registry |
| Platform layer | `src/platform`: desktop and mobile hooks |
| Workshop dashboard | `scripts/export-ui`, the doctor, the generator and the wiring check |
| Docs | `docs` |

Each part shows **Current**, **Outdated**, **Edited here** (you changed your copy by hand, so updating would overwrite your edits; unchecked by default) or **New** (added to the framework after the game was created). Outdated and new parts are pre-selected; tick or untick as you like.

**Versions.** `0.2.0 · ffe443` is the framework version plus a short revision: a hash of the files themselves. The version number only moves on releases, but the revision changes with any edit, so "same version, different revision" means the tools differ. Updating only some parts leaves the version number unchanged until everything is current.

**Renderers and physics engines.** Updating these parts refreshes what the game already uses. To add a renderer or physics engine, use **Add** in the same dialog; it maps the alias, copies the files and adds the npm packages to `package.json`. Use **Remove** to take one out, which is refused while game code still imports it. Run **Install dependencies** afterwards. See [Renderers](RENDERERS.md) and [Physics](PHYSICS.md).

If the game's dashboard was running, the update stops it. Click **Open** to start the new one.

Then run `npm run build` in the game (or **Build** on the Web page) and play it to check it still works. Commit the changes in the game's Git repository.

Your own files are not touched by this. If the framework changes an alias or the build setup, its release notes will say so, and the game's `vite.config.ts` and `tsconfig.json` may need the same change.

**Checks after an update.** The dashboard runs the wiring check and lists anything that still needs attention, such as a missing alias or package, so you can fix it before building.

## Older games

Games created before this layout used a linked dependency on the framework. Create a fresh game with the current framework and copy your `src/` files into it, or ask for help converting the old one.
