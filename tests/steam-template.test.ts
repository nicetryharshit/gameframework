import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addSteamToGame } from '../scripts/export-ui/steam.mjs';

// A game's tools/gameframework copy has no src-tauri folder, so Add Steam support must take its templates from the dashboard itself.
test('Add Steam support finds its code templates from a framework copy that has only desktop.ts', async () => {
  const game = mkdtempSync(path.join(tmpdir(), 'steam-game-'));
  const frameworkCopy = mkdtempSync(path.join(tmpdir(), 'steam-tools-'));
  mkdirSync(path.join(frameworkCopy, 'src', 'platform'), { recursive: true });
  writeFileSync(path.join(frameworkCopy, 'src', 'platform', 'desktop.ts'), 'export function createSteamControls() {}\n');
  mkdirSync(path.join(game, 'src-tauri', 'src'), { recursive: true });
  writeFileSync(path.join(game, 'src-tauri', 'Cargo.toml'), '[package]\nname = "game"\n\n[dependencies]\n');
  writeFileSync(path.join(game, 'src-tauri', 'src', 'lib.rs'), 'pub fn run() {\n    tauri::Builder::default()\n        .invoke_handler(tauri::generate_handler![\n            greet,\n        ])\n        .run(tauri::generate_context!())\n        .unwrap();\n}\n');
  writeFileSync(path.join(game, 'src-tauri', 'build.rs'), 'fn main(){tauri_build::build()}\n');
  // The game's own desktop file may still need a manual step; this test only checks the templates are found.
  await addSteamToGame(game, frameworkCopy, { dryRun: true }).catch(error => {
    assert.doesNotMatch(error.message, /Could not find the Steam code templates|Could not read the Steam build script template/);
  });
});
