import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/framework/events';
import { StateManager } from '../src/framework/state';
import { SaveStore } from '../src/framework/storage';

test('events unsubscribe and once fires once, including recursive emission', () => {
  const bus = new EventBus<{ hit: number }>();
  const values: number[] = [];
  const off = bus.on('hit', value => values.push(value));
  bus.once('hit', value => { if (value === 1) bus.emit('hit', 2); });
  bus.emit('hit', 1); off(); bus.emit('hit', 3);
  assert.deepEqual(values, [1, 2]);
});
test('state transitions run lifecycle and queue transitions from enter', () => {
  const calls: string[] = [];
  const states = new StateManager({});
  states.register('a', { enter: () => { calls.push('enter a'); states.change('b'); }, exit: () => calls.push('exit a') });
  states.register('b', { enter: () => calls.push('enter b'), update: (_, dt) => calls.push(`update ${dt}`), exit: () => calls.push('exit b') });
  states.change('a'); states.update(0.5); states.dispose();
  assert.deepEqual(calls, ['enter a', 'exit a', 'enter b', 'update 0.5', 'exit b']);
  assert.throws(() => new StateManager({}).change('missing'), /Unknown state/);
});
test('stale unsubscribe after clear cannot remove a newer subscription', () => {
  const bus = new EventBus<{ hit: number }>();
  const stale = bus.on('hit', () => {}); bus.clear();
  let received = 0; bus.on('hit', value => { received += value; });
  stale(); stale(); bus.emit('hit', 3); assert.equal(received, 3);
});
test('save store handles absent and malformed data', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } } as Storage;
  const saves = new SaveStore('test', storage);
  assert.equal(saves.load('score', 0), 0);
  saves.save('score', 42); assert.equal(saves.load('score', 0), 42);
  data.set('test:score', '{'); assert.equal(saves.load('score', 0), 0);
  saves.remove('score'); assert.equal(data.size, 0);
});
