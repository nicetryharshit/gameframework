import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntity, computeWorlds, createSceneRuntime, emptyScene, setField, worldTransform, type AudioHandle, type Scene } from '../src/scene/index';

function ground(scene: Scene): Scene {
  return addEntity(scene, { id: 'ground', components: { transform: { x: 0, y: -3 }, collider: { shape: 'box', width: 10, height: 1 } } });
}

test('a dynamic crate falls and comes to rest on static ground', () => {
  let scene = ground(emptyScene());
  scene = addEntity(scene, { id: 'crate', components: { transform: { x: 0, y: 2 }, collider: {}, rigidbody: {} } });
  const runtime = createSceneRuntime(scene);
  for (let i = 0; i < 180; i++) runtime.advance(1 / 60);
  // The ground top is at y = -2.5 and the crate's half height is 0.5, so it rests with its centre near y = -2.
  const crate = runtime.worlds.get('crate');
  assert.ok(crate && Math.abs(crate.y - -2) < 0.05, `crate rested at ${crate?.y}`);
  runtime.dispose();
});

test('children follow a simulated parent, keeping their offset', () => {
  let scene = addEntity(emptyScene(), { id: 'crate', components: { transform: { x: 0, y: 2 }, collider: {}, rigidbody: {} } });
  scene = addEntity(scene, { id: 'label', parent: 'crate', components: { transform: { x: 0, y: 1 } } });
  const runtime = createSceneRuntime(scene);
  for (let i = 0; i < 60; i++) runtime.advance(1 / 60);
  const crate = runtime.worlds.get('crate');
  const label = runtime.worlds.get('label');
  assert.ok(crate && label);
  assert.ok(crate.y < 1.9, 'the crate should have fallen');
  assert.ok(Math.abs(label.y - (crate.y + 1)) < 1e-9, 'the label stays one unit above the crate');
  runtime.dispose();
});

test('without a physics pose, the runtime reports the scene transforms', () => {
  let scene = addEntity(emptyScene(), { id: 'a', components: { transform: { x: 1, y: 2, rotation: 30 } } });
  scene = addEntity(scene, { id: 'b', parent: 'a', components: { transform: { x: 1, y: 0 } } });
  const worlds = computeWorlds(scene);
  for (const id of ['a', 'b']) {
    const expected = worldTransform(scene, id);
    const actual = worlds.get(id);
    assert.ok(actual);
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9 && Math.abs(actual.rotation - expected.rotation) < 1e-9);
  }
});

test('audio starts on play when playOnStart is set, and stops when the runtime is disposed', () => {
  const played: string[] = [];
  const stopped: string[] = [];
  const createAudio = (clip: string): AudioHandle => ({
    play() {
      played.push(clip);
    },
    stop() {
      stopped.push(clip);
    }
  });
  let scene = addEntity(emptyScene(), { id: 'speaker', components: { audio: { clip: 'audio/beep.wav' } } });
  scene = addEntity(scene, { id: 'quiet', components: { audio: { clip: 'audio/hum.wav', playOnStart: false } } });
  scene = addEntity(scene, { id: 'empty', components: { audio: {} } });
  const runtime = createSceneRuntime(scene, { createAudio });
  assert.deepEqual(played, ['audio/beep.wav']);
  runtime.dispose();
  assert.deepEqual(stopped.sort(), ['audio/beep.wav', 'audio/hum.wav']);
});

test('unusual setups produce warnings instead of errors', () => {
  const warnings: string[] = [];
  let scene = addEntity(emptyScene(), { id: 'floaty', components: { rigidbody: {} } });
  scene = addEntity(scene, { id: 'crate', components: { collider: {}, rigidbody: {} } });
  scene = addEntity(scene, { id: 'box-on-crate', parent: 'crate', components: { collider: {} } });
  const runtime = createSceneRuntime(scene, { onWarning: message => warnings.push(message) });
  assert.ok(warnings.some(message => /"floaty" has a rigidbody but no collider/.test(message)));
  assert.ok(warnings.some(message => /"box-on-crate" has a collider under a rigidbody/.test(message)));
  runtime.dispose();
});

test('a disposed runtime refuses to advance and can be disposed twice', () => {
  const runtime = createSceneRuntime(emptyScene());
  runtime.dispose();
  runtime.dispose();
  assert.throws(() => runtime.advance(1 / 60), /disposed/);
});

test('asset fields only accept paths', () => {
  const scene = addEntity(emptyScene(), { id: 'a', components: { sprite: {} } });
  assert.throws(() => setField(scene, 'a', 'sprite', 'texture', 5), /sprite\.texture must be an asset path/);
  assert.equal(setField(scene, 'a', 'sprite', 'texture', 'images/crate.png').entities[0].components.sprite.texture, 'images/crate.png');
});
