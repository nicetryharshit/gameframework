import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSteamControls } from '../src/platform/desktop';

// Steam is optional, so these checks cover the wrapper's behaviour with the native side faked.
function withNative(platform: string, handler: (command: string, args: Record<string, unknown>) => unknown) {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const native = {
    metadata: { currentWindow: { label: 'main' } },
    async invoke(command: string, args: Record<string, unknown> = {}) {
      calls.push({ command, args });
      if (command === 'platform_kind') return platform;
      return handler(command, args);
    }
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousTauri = Object.getOwnPropertyDescriptor(globalThis, 'isTauri');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: native } });
  Object.defineProperty(globalThis, 'isTauri', { configurable: true, value: true, writable: true });
  return {
    calls,
    async finish() {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete (globalThis as { window?: unknown }).window;
      if (previousTauri) Object.defineProperty(globalThis, 'isTauri', previousTauri); else delete (globalThis as { isTauri?: unknown }).isTauri;
    }
  };
}

test('Steam controls exist only in the desktop app', async () => {
  const previousTauri = Object.getOwnPropertyDescriptor(globalThis, 'isTauri');
  Object.defineProperty(globalThis, 'isTauri', { configurable: true, value: false, writable: true });
  try {
    assert.equal(await createSteamControls(), undefined, 'web');
  } finally {
    if (previousTauri) Object.defineProperty(globalThis, 'isTauri', previousTauri); else delete (globalThis as { isTauri?: unknown }).isTauri;
  }
});

test('unlocking and setting stats call the native commands and report success', async () => {
  const harness = withNative('desktop', command => command === 'steam_available' ? true : undefined);
  try {
    const steam = await createSteamControls(); assert.ok(steam);
    assert.equal(await steam.available(), true);
    assert.equal(await steam.unlockAchievement('FIRST_FLIGHT'), true);
    assert.equal(await steam.setStat('FLIGHTS', 7), true);
    assert.deepEqual(harness.calls.find(call => call.command === 'steam_unlock_achievement')?.args, { name: 'FIRST_FLIGHT' });
    assert.deepEqual(harness.calls.find(call => call.command === 'steam_set_stat_i32')?.args, { name: 'FLIGHTS', value: 7 });
  } finally {
    await harness.finish();
  }
});

test('a Steam call that fails (for example in a build without Steam) returns false and does not throw', async () => {
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  const harness = withNative('desktop', command => {
    if (command === 'steam_available') return false;
    throw 'Steam is not enabled in this build';
  });
  try {
    const steam = await createSteamControls(); assert.ok(steam);
    assert.equal(await steam.available(), false);
    assert.equal(await steam.unlockAchievement('FIRST_FLIGHT'), false);
    assert.equal(warnings.length, 1, 'the failure is reported once');
  } finally {
    console.warn = originalWarn;
    await harness.finish();
  }
});
