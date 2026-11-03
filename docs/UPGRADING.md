# Updating a game without regenerating it

Create each game once. Its gameplay and native project belong to that game; the framework is a dependency.

## Local development

The generator defaults to a `file:` dependency on the framework checkout. npm normally links that directory. Edit the framework source and restart the game's development server if necessary. If your package manager copied the dependency, reinstall it from the framework path. Do not rerun the generator over an existing game.

## Shared and release builds

In the game directory, install a specific framework commit or tag (substitute your actual URL):

```sh
npm install "git+https://github.com/YOUR_NAME/webgameframework.git#COMMIT_OR_TAG"
npm run build:web
```

Run the game's own tests and smoke-test it, then commit both `package.json` and `package-lock.json`. Keep other games pinned until you are ready to upgrade them. To roll back, restore the previous dependency spec and lockfile from your game's Git history, then run `npm ci`.

## What updates automatically?

Updating the dependency updates shared services in `src/framework` and the imported Pixi/Three renderer helpers. It does not replace game code or settings copied by the generator:

- `src/demo*` and `src/flappy.ts` belong to the game after generation.
- `package.json` scripts, Vite configuration and `src-tauri` belong to the game.
- Native identity, icons, permissions and generated mobile project customizations belong to the game.

Desktop fullscreen/settings additions also require merging `src-tauri/tauri.conf.json`, `src-tauri/capabilities/desktop.json`, the `platform_kind` command/registration in `src-tauri/src/lib.rs`, and the sample settings UI. Install `@tauri-apps/api` in the game and rebuild it. New window permissions are desktop-scoped; retain the game's existing commands and capabilities when merging. See [platform builds](PLATFORM-BUILDS.md). Existing games should stop ignoring the entire `src-tauri/gen/` tree if they intend to commit native mobile customizations; retain ignores for build/cache/signing files.

For a starter or build-configuration improvement, generate a temporary project with the new framework, compare the relevant files, and apply only the changes your game needs. Preserve your game code and app identity. Delete the temporary comparison project when done.

## Current compatibility notes

- `AudioMixer` is the recommended audio service. `AudioPlayer` remains exported for existing games but is deprecated. With the mixer, load a sound, call `unlock()` from a user gesture, and call `play()`. `play()` returns a voice with `stop()`, or `undefined` when suspended or at its voice limit; it does not return an HTML audio element.
- `Input.pressed()` and `released()` now preserve keyboard/virtual transitions between frame polls. A quick tap can report both edges in the same frame while `held()` is false. Gamepad input is sampled each frame and cannot detect events that happen entirely between polls.
- New Pocket Flight starters use Space/Enter/controller A to select, arrows/D-pad/stick to navigate menus, and Escape/controller Start to pause or resume. Existing copied examples need these flow changes applied separately.

## Optional GitHub checks

The framework has no active GitHub Actions workflow by default. To enable the supplied checks in this framework repository, copy `templates/github/framework-checks.yml.example` to `.github/workflows/checks.yml` and commit it. It runs dependency installation, tests and frontend builds on pushes and pull requests. For a game, adjust the commands to its own scripts before enabling it. New game generation never enables GitHub Actions automatically.

## Manual smoke test before release

The automated flow test uses the real menus, input, state manager, gameplay and persistence with an in-memory DOM and a stub renderer. It does not test graphics drivers, native packaging or physical controllers.

On each intended device, check starting a run, flapping, scoring, pause/resume, losing focus/backgrounding, death, restart, menu navigation, and saved best after relaunch. On mobile, also check touch, safe areas and orientation. Check the actual packaged build as well as the browser version. Signing and store distribution remain separate setup steps.
