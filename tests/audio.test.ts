import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioMixer } from '../src/framework/mixer';

test('audio voice cap, live volume, release, pause and idempotent disposal', async () => {
  const gains: number[] = [];
  const sources: { onended?: () => void; stop(): void }[] = [];
  let state = 'suspended', closed = 0;
  const context = {
    destination: {}, currentTime: 0,
    get state() { return state; },
    createGain: () => ({ connect() {}, disconnect() {}, gain: { setValueAtTime(value: number) { gains.push(value); } } }),
    createBufferSource: () => {
      const source = { buffer: {}, loop: false, connect() {}, disconnect() {}, start() {}, onended: undefined as undefined | (() => void), stop() {} };
      sources.push(source); return source;
    },
    resume: async () => { state = 'running'; }, suspend: async () => { state = 'suspended'; }, close: async () => { closed++; },
    decodeAudioData: async () => ({})
  };
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([0]));
  try {
    const audio = new AudioMixer(context as unknown as AudioContext, 1);
    await audio.load('click', 'click.wav'); assert.equal(audio.play('click'), undefined);
    await audio.unlock(); const voice = audio.play('click'); assert.ok(voice);
    assert.equal(audio.play('click'), undefined);
    audio.setVolume('effects', 0.3); assert.deepEqual(gains, [0.3]);
    voice.stop(); voice.stop(); assert.ok(audio.play('click'));
    sources.at(-1)!.onended!(); assert.ok(audio.play('click'));
    await audio.suspend(); assert.equal(audio.play('click'), undefined);
    await audio.dispose(); await audio.dispose(); assert.equal(closed, 1);
    await assert.rejects(audio.load('another', 'x'), /disposed/);
  } finally { globalThis.fetch = original; }
});
