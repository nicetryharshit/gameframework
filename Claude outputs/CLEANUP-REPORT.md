# Gameframework cleanup report

Scope: the working copy (uploads), the staged root files from the device (package.json, vite.config.ts, tsconfig.json, 2d.html, 3d.html, index.html, export-profiles.json, scripts/benchmark.ts, scripts/doctor.mjs, scripts/export-ui/builds.mjs), and the generator/dashboard code. Not fully scanned: docs/, vendor/, src-tauri/, and the rest of src/ on the device. Nothing has been changed by this report.

## Open problems first

1. **Remove buttons are untested and not on the device.** The generator functions `removeRenderer` and `removePhysics`, the server routes, and the Remove buttons in Update tools are in the uploads copy only. The test script `scratchpad/test-remove.mjs` has a syntax error (a `tsOf(a).then ?` line I wrote), so the tests did not run.
2. **Drift has already caused real bugs.** The device `app.js` was stale after an earlier write, so the duplicate-None fix did not reach your machine until it was caught. Hand-copied files across uploads, outputs and the device keep diverging. The git repo should be the only source of truth.
3. **The generator's tests are not in the repo.** `test-removal.mjs` and `test-remove.mjs` live in scratchpad, so `npm test` never runs them. Move them into `tests/`.

## Dead or unneeded (candidates to delete)

| Item | Why | Suggested action |
|---|---|---|
| `2d.html`, `3d.html` at repo root | Dev entry pages for `src/demo-2d.ts` and `src/demo-3d.ts`, which both exist. Not referenced by package.json. | Keep if you use them to open demos directly; otherwise delete along with the demos. |
| `scripts/benchmark.ts` + `"benchmark"` script | Times input polling only (its own output says so). Not part of build or tests. | Delete, or keep if you want it as a perf check. |
| `legacyRenderers = { '2d': 'pixi', '3d': 'three' }` in create-game.mjs | Compatibility for old CLI names. | Delete if nobody types the old names. |
| `templates/github/framework-checks.yml.example` | An example CI file that is not wired in. | Keep only if you plan to use CI soon. |
| Physics `none` entry in `src/physics/registry.json` | The UI adds its own "None" and the update list skips it. Two sources of truth. | Remove the entry and make None implicit in the generator and UI. |

## Duplicated code (merge, don't delete)

- **Package adding is written three times.** `addRenderer` and `addPhysics` each have the same loop that adds packages and sorts `package.json`. `dropPackages` and `packageText` (new) do the reverse. Extract `addPackages` and `dropPackages` into one helper pair.
- **Config wiring is written three times.** `planRendererWiring`, `planPhysicsWiring`, and the new `planRemoveWiring` each edit `tsconfig.json` and `vite.config.ts`. One module that knows the alias shape would replace all three.
- **Registry readers.** `readRegistry` and `readPhysics` parse the same kind of file. A single `readRegistryFile(root, kind)` would do.

## Dead exports and small debt

- `COMPONENTS`, `hashComponent`, `rewriteExample`, `writeLaunchers` are exported but only used inside create-game.mjs. Unexport them.
- Labels disagree: "Planck.js" and "matter.js" in the registry. Pick one style ("Planck", "Matter.js").
- Line endings are mixed (CRLF and LF) in create-game.mjs and server.mjs. Normalize to LF. This makes diffs readable and stops the edit tool from silently missing lines.
- `kind` falls back to `'2d'` in server.mjs. Make the registry always set `kind`, then remove the fallback.
- `app.js` is about 45 KB in one file. Splitting it (games, platform pages, dialogs) would help, but it is a larger job. Leave it for later unless it keeps causing bugs.
- The stray doc comment above `addRenderer` in server.mjs is fixed in the uploads copy. Check the device copy when it is next synced.

## Things that look fine

- `replaceItems` all-or-nothing swap with rollback and lock recovery. Keep it. Changes to it need tests first.
- `builds.mjs` (on the device, not in the uploads tree before this scan) is imported by the server and must stay.
- The three launchers (`.bat`, `.command`, `.sh`) are needed for each OS.

## Suggested order

1. Fix and run the remove tests, then ship Remove (or drop it if you'd rather keep things lean).
2. Move generator tests into `tests/` so `npm test` covers them.
3. Make git the single source. Stop hand-copying files to the device and outputs.
4. Delete the dead items above after you confirm each one.
5. Merge the duplicated package and wiring helpers.
6. Normalize line endings and labels.

## Questions for you

- Keep or delete `benchmark.ts`, `2d.html`, `3d.html`, the old `2d`/`3d` CLI names, and the CI template?
- Should the registry's `none` entry stay, or should None be implicit?
- Is splitting `app.js` worth doing now?
