# Updating a game

Each game keeps its own copy of the framework in `tools/gameframework/`. Your game code, `src-tauri/`, `export-profiles.json` and `Builds/` belong to the game and are never overwritten by a framework update.

## Bringing in a newer framework

In the framework's dashboard, open **Games**. A game with older tools shows **Update available** (and the sidebar's Games item gets a dot). Click **Update tools** to choose what to update:

| Part | What it is |
| --- | --- |
| Core framework | `src/framework`: events, UI, state, input |
| Renderers | `src/renderers`: Pixi, Three, and any renderer added later |
| Platform layer | `src/platform`: desktop and mobile hooks |
| Workshop dashboard | `scripts/export-ui` and the doctor check |
| Docs | `docs` |

Each part shows **Current**, **Outdated**, **Edited here** (you changed your copy by hand, so updating would overwrite your edits; unchecked by default) or **New** (added to the framework after the game was created). Outdated and new parts are pre-selected; tick or untick as you like.

**Versions.** `0.2.0 · ffe443` is the framework version plus a short revision: a hash of the files themselves. The version number only moves on releases, but the revision changes with any edit, so "same version, different revision" means the tools differ. Updating only some parts leaves the version number unchanged until everything is current.

**New renderers.** Updating **Renderers** copies every renderer and maps any the game doesn't have yet, so it can import them straight away. To add one deliberately, use **Add** in the same dialog; it also adds the renderer's npm packages to `package.json`. Run **Install dependencies** afterwards. See [Renderers](RENDERERS.md).

If the game's dashboard was running, the update stops it. Click **Open** to start the new one.

Then run `npm run build` in the game (or **Build** on the Web page) and play it to check it still works. Commit the changes in the game's Git repository.

Your own files are not touched by this. If the framework changes an alias or the build setup, its release notes will say so, and the game's `vite.config.ts` and `tsconfig.json` may need the same change.

## Older games

Games created before this layout used a linked dependency on the framework. Create a fresh game with the current framework and copy your `src/` files into it, or ask for help converting the old one.
