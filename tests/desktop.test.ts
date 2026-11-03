import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopControls } from '../src/platform/desktop';

test('native display controls select window modes and remain unavailable on mobile/web', async () => {
  const globals = new Map(['window', 'isTauri'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let fullscreen = true, platform = 'desktop';
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const native = {
    metadata: { currentWindow: { label: 'main' } },
    async invoke(command: string, args: Record<string, unknown> = {}) {
      calls.push({ command, args });
      if (command === 'platform_kind') return platform;
      if (command === 'plugin:window|is_fullscreen') return fullscreen;
      if (command === 'plugin:window|set_fullscreen') fullscreen = Boolean(args.value);
    }
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: native } });
  Object.defineProperty(globalThis, 'isTauri', { configurable: true, value: true, writable: true });
  try {
    const desktop = await createDesktopControls(); assert.ok(desktop);
    await desktop.apply('windowed', 1280, 720); assert.equal(fullscreen, false);
    assert.ok(calls.some(call => call.command === 'plugin:window|set_decorations' && call.args.value === true));
    assert.ok(calls.some(call => call.command === 'plugin:window|set_size'));
    await desktop.apply('borderless', 960, 540);
    assert.ok(calls.some(call => call.command === 'plugin:window|set_decorations' && call.args.value === false));
    await desktop.apply('fullscreen', 1280, 720); assert.equal(fullscreen, true);
    await desktop.quit(); assert.equal(calls.at(-1)?.command, 'plugin:window|close');
    platform = 'mobile'; assert.equal(await createDesktopControls(), undefined);
    Object.defineProperty(globalThis, 'isTauri', { value: false }); assert.equal(await createDesktopControls(), undefined);
  } finally {
    for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
