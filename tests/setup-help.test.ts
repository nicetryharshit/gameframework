import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// builds.mjs has no type declarations; the shape used here is asserted by the test itself.
// @ts-ignore
const { setupHelp, rustToolchain } = await import('../scripts/export-ui/builds.mjs') as { setupHelp(host: string): Record<string, string>; rustToolchain(host: string): Promise<{ rustc?: string; detail?: string }> };

test('Windows setup hints use PowerShell commands, never Unix shell commands', () => {
  const help = setupHelp('win32');
  assert.match(help.rust, /winget install --id Rustlang\.Rustup/);
  assert.match(help.rust, /rustup-init\.exe/);
  for (const [key, text] of Object.entries(help)) {
    assert.doesNotMatch(text, /curl |sudo |export [A-Z_]+=|~\//, `${key} shows a Unix command on Windows`);
  }
  assert.match(help.androidSdk, /setx ANDROID_HOME "\$env:LOCALAPPDATA\\Android\\Sdk"/);
  assert.equal(help.cargoPath, '%USERPROFILE%\\.cargo\\bin');
});

test('macOS and Linux setup hints use the rustup shell installer and the right SDK folders', () => {
  const mac = setupHelp('darwin');
  const linux = setupHelp('linux');
  for (const help of [mac, linux]) {
    assert.match(help.rust, /curl --proto '=https' --tlsv1\.2 -sSf https:\/\/sh\.rustup\.rs \| sh/);
    assert.doesNotMatch(help.rust, /winget|PowerShell/);
  }
  assert.match(mac.androidSdk, /Library\/Android\/sdk/);
  assert.match(mac.androidSdk, /~\/\.zshrc/);
  assert.match(linux.androidSdk, /\$HOME\/Android\/Sdk/);
  assert.match(linux.androidSdk, /~\/\.bashrc/);
});

/** Runs fn with HOME/USERPROFILE and PATH replaced, then restores them. */
async function withHome(home: string, pathValue: string, fn: () => Promise<void>) {
  const saved = { PATH: process.env.PATH, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  try {
    process.env.PATH = pathValue; process.env.HOME = home; process.env.USERPROFILE = home;
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

function fakeTool(bin: string, name: string, output: string) {
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${output}"\n`, { mode: 0o755 });
}

test('Rust check finds rustc in rustup\'s folder when PATH was read before Rust was installed', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'rust-home-'));
  fakeTool(path.join(home, '.cargo', 'bin'), 'rustc', 'rustc 9.9.9 (test)');
  await withHome(home, '/nonexistent-dir', async () => {
    const result = await rustToolchain('linux');
    assert.equal(result.rustc, 'rustc 9.9.9 (test)');
    assert.ok(process.env.PATH?.startsWith(path.join(home, '.cargo', 'bin')), 'rustup folder should be added to PATH');
  });
});

test('Rust check explains the missing default toolchain when only rustup is installed', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'rust-home-'));
  fakeTool(path.join(home, '.cargo', 'bin'), 'rustup.exe', 'rustup 1.27.0');
  await withHome(home, '/nonexistent-dir', async () => {
    const result = await rustToolchain('win32');
    assert.equal(result.rustc, undefined);
    assert.match(result.detail ?? '', /rustup default stable-msvc/);
    assert.match(result.detail ?? '', /reopen Game Workshop/);
  });
});

test('Rust check reports nothing when Rust is not installed at all', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'rust-home-'));
  await withHome(home, '/nonexistent-dir', async () => {
    const result = await rustToolchain('linux');
    assert.deepEqual(result, {});
  });
});
