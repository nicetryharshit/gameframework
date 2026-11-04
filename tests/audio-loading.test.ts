import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioMixer } from '../src/framework/mixer';

function fakeContext() {
  return {
    destination: {}, currentTime: 0, state: 'running',
    createGain: () => ({ connect() {}, disconnect() {}, gain: { setValueAtTime() {} } }),
    createBufferSource: () => ({ buffer: {}, loop: false, connect() {}, disconnect() {}, start() {}, stop() {}, onended: undefined as undefined | (() => void) }),
    resume: async () => {}, suspend: async () => {}, close: async () => {},
    decodeAudioData: async () => ({})
  };
}

test('has() reports sounds that are loaded, and play() still rejects a name that was never loaded', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([0]));
  try {
    const mixer = new AudioMixer(fakeContext() as unknown as AudioContext);
    assert.equal(mixer.has('flap'), false, 'not loaded yet');
    await mixer.load('flap', 'flap.wav');
    assert.equal(mixer.has('flap'), true, 'loaded');
    assert.ok(mixer.play('flap'), 'a loaded sound plays');
    assert.throws(() => mixer.play('flapp'), /Unknown audio: flapp/, 'a misspelled name is still an error');
  } finally {
    globalThis.fetch = original;
  }
});
