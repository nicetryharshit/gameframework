# Updating a game

Each game keeps its own copy of the framework in `tools/gameframework/`. Your game code, `src-tauri/`, `export-profiles.json` and `Builds/` belong to the game and are never overwritten by a framework update.

## Bringing in a newer framework

Until a one-command update is added, update the copy by hand:

1. Copy the newer `src/framework`, `src/renderers`, `src/platform`, `scripts/export-ui`, `scripts/doctor.mjs` and `docs` folders from the framework into the game's `tools/gameframework/`, replacing the old ones.
2. Check `tools/gameframework/VERSION.json` to confirm the version you copied.
3. In the game, run the **Install and test** steps, or `npm run build`, and play the game to check it still works.
4. Commit the changes in the game's Git repository.

Your own files are not touched by this. If the framework changes an alias or the build setup, its release notes will say so, and the game's `vite.config.ts` and `tsconfig.json` may need the same change.

## Older games

Games created before this layout used a linked dependency on the framework. Create a fresh game with the current framework and copy your `src/` files into it, or ask for help converting the old one.
