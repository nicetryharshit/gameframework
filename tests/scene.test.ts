import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addEntity,
  ComponentRegistry,
  composeTransforms,
  getEntity,
  parseScene,
  removeEntity,
  sceneToJson,
  setComponent,
  setField,
  setParent,
  worldTransform,
  type Scene
} from '../src/scene/index';

const fixture = readFileSync(new URL('./fixtures/scene-example.json', import.meta.url), 'utf8');
const loadFixture = () => parseScene(fixture).scene;

function near(actual: number, expected: number, message: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

test('the example level loads, keeps its hierarchy, and reports unknown components', () => {
  const { scene, warnings } = parseScene(fixture);
  assert.deepEqual(scene.entities.map(entity => entity.id), ['ship', 'gun', 'crate', 'smoke']);
  assert.equal(getEntity(scene, 'gun').parent, 'ship');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"particles".*kept but not used/);
});

test('a child is placed in its parent space: the gun sits at the ship rotated 90 degrees', () => {
  const scene = loadFixture();
  const gun = worldTransform(scene, 'gun');
  // The ship is at (3, 2) and turned 90 degrees, so the gun's local (1, 0) points up in the world.
  near(gun.x, 3, 'gun x');
  near(gun.y, 3, 'gun y');
  near(gun.rotation, 90, 'gun rotation');
});

test('saving and loading gives back the same scene, and defaults are left out of the file', () => {
  const scene = loadFixture();
  const text = sceneToJson(scene);
  const reloaded = parseScene(text).scene;
  assert.deepEqual(reloaded, scene);

  const written = JSON.parse(text);
  const crate = written.entities.find((entity: { id: string }) => entity.id === 'crate');
  assert.deepEqual(crate.components.sprite, { texture: 'crate.png' });
  assert.equal(crate.components.transform.y, undefined);
});

test('unknown components are written back exactly as they were read', () => {
  const written = JSON.parse(sceneToJson(loadFixture()));
  const smoke = written.entities.find((entity: { id: string }) => entity.id === 'smoke');
  assert.deepEqual(smoke.components.particles, { rate: 12, colour: 'grey' });
});

test('a known field with a bad value falls back to its default and warns', () => {
  const text = JSON.stringify({
    format: 'gameframework.scene',
    version: 1,
    entities: [{ id: 'a', components: { sprite: { texture: 'a.png', layer: 'top' } } }]
  });
  const { scene, warnings } = parseScene(text);
  assert.equal(scene.entities[0].components.sprite.layer, 0);
  assert.equal(scene.entities[0].components.sprite.texture, 'a.png');
  assert.match(warnings[0], /sprite\.layer on "a" must be a finite number/);
});

test('files that would produce a wrong scene are refused with a clear message', () => {
  const file = (entities: unknown[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({ format: 'gameframework.scene', version: 1, entities, ...extra });

  assert.throws(() => parseScene('not json'), /not valid JSON/);
  assert.throws(() => parseScene(JSON.stringify({ format: 'something-else', version: 1, entities: [] })), /not a gameframework.scene file/);
  assert.throws(() => parseScene(file([], { version: 2 })), /reads up to version 1/);
  assert.throws(() => parseScene(file([{ id: 'a' }, { id: 'a' }])), /share the id "a"/);
  assert.throws(() => parseScene(file([{ id: 'a', parent: 'missing' }])), /"missing", which is not in the scene/);
  assert.throws(() => parseScene(file([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }])), /parent loop/);
});

test('moving an entity to a new parent carries its world position with it', () => {
  let scene = loadFixture();
  scene = setParent(scene, 'gun', 'crate');
  assert.equal(getEntity(scene, 'gun').parent, 'crate');
  // The crate is at (-2, 0) with no rotation, so the gun's local (1, 0) lands at (-1, 0).
  const gun = worldTransform(scene, 'gun');
  near(gun.x, -1, 'gun x after reparent');
  near(gun.y, 0, 'gun y after reparent');
  near(gun.rotation, 0, 'gun rotation after reparent');
  scene = setParent(scene, 'gun', null);
  assert.equal(getEntity(scene, 'gun').parent, null);
});

test('parenting that would create a loop is refused', () => {
  const scene = loadFixture();
  assert.throws(() => setParent(scene, 'ship', 'gun'), /would create a loop/);
  assert.throws(() => setParent(scene, 'ship', 'ship'), /would create a loop/);
});

test('removing an entity also removes everything below it', () => {
  const scene = removeEntity(loadFixture(), 'ship');
  assert.deepEqual(scene.entities.map(entity => entity.id), ['crate', 'smoke']);
});

test('operations never change the scene they were given', () => {
  const scene: Scene = loadFixture();
  const before = sceneToJson(scene);
  addEntity(scene, { id: 'new', components: { transform: { x: 5 } } });
  setField(scene, 'crate', 'sprite', 'tint', '#ff0000');
  setParent(scene, 'gun', null);
  removeEntity(scene, 'ship');
  assert.equal(sceneToJson(scene), before);
});

test('adding entities checks ids and parents', () => {
  const scene = loadFixture();
  assert.throws(() => addEntity(scene, { id: 'crate' }), /already exists/);
  assert.throws(() => addEntity(scene, { id: 'x', parent: 'nobody' }), /No entity with id "nobody"/);
  assert.throws(() => addEntity(scene, { id: '' }), /needs an id/);
  const grown = addEntity(scene, { id: 'x', parent: 'ship', components: { transform: { x: 4 } } });
  near(worldTransform(grown, 'x').x, 3, 'new child x (ship at 3, rotated 90, local (4, 0) points up)');
});

test('setField checks the value against the schema and adds the component when missing', () => {
  const scene = loadFixture();
  assert.throws(() => setField(scene, 'crate', 'collider', 'shape', 'triangle'), /collider\.shape must be one of box, circle/);
  assert.throws(() => setField(scene, 'crate', 'collider', 'width', -1), /collider\.width must be at least 0/);
  assert.throws(() => setField(scene, 'crate', 'sprite', 'glow', 1), /has no field "glow"/);
  assert.throws(() => setField(scene, 'crate', 'mystery', 'x', 1), /Unknown component "mystery"/);

  const edited = setField(scene, 'gun', 'collider', 'radius', 0.25);
  assert.deepEqual(getEntity(edited, 'gun').components.collider, { shape: 'box', width: 1, height: 1, radius: 0.25 });
});

test('setComponent fills in defaults for missing fields', () => {
  const scene = setComponent(loadFixture(), 'gun', 'sprite', { texture: 'x.png' });
  assert.deepEqual(getEntity(scene, 'gun').components.sprite, { texture: 'x.png', width: 1, height: 1, layer: 0, tint: '#ffffff' });
});

test('the registry refuses bad names, duplicates and defaults that do not match their type', () => {
  const registry = new ComponentRegistry();
  assert.throws(() => registry.register({ name: 'Bad Name', fields: {} }), /must be lowercase/);
  registry.register({ name: 'tag', fields: { kind: { type: 'enum', default: 'a', options: ['a', 'b'] } } });
  assert.throws(() => registry.register({ name: 'tag', fields: {} }), /already registered/);
  assert.throws(
    () => registry.register({ name: 'broken', fields: { kind: { type: 'enum', default: 'z', options: ['a'] } } }),
    /default for broken\.kind/
  );
});

test('composing transforms applies scale, then rotation, then translation', () => {
  const parent = { x: 1, y: 1, rotation: 0, scaleX: 2, scaleY: 2 };
  const child = { x: 1, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const result = composeTransforms(parent, child);
  near(result.x, 3, 'scaled child x');
  near(result.y, 1, 'scaled child y');
  near(result.scaleX, 2, 'inherited scale');
});
