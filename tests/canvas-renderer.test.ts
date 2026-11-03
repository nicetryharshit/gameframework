import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createCanvasRenderer } from '../src/renderers/canvas';

test('canvas renderer sizes its backing store to the container, clears, and cleans up', () => {
  const window = new Window({ url: 'http://localhost/' });
  const calls: string[] = [];
  const context = {
    clearRect: () => calls.push('clear'), fillRect: () => calls.push('fill'),
    setTransform: (...args: number[]) => calls.push(`transform ${args.join(',')}`), fillStyle: ''
  };
  const globals = globalThis as Record<string, unknown>;
  const previous = { document: globals.document, window: globals.window, ResizeObserver: globals.ResizeObserver };
  const doc = window.document as unknown as Document;
  const container = doc.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 320 });
  Object.defineProperty(container, 'clientHeight', { value: 180 });
  const create = doc.createElement.bind(doc);
  doc.createElement = ((tag: string) => {
    const node = create(tag);
    if (tag === 'canvas') (node as unknown as { getContext: () => unknown }).getContext = () => context;
    return node;
  }) as typeof doc.createElement;
  Object.assign(globals, { document: doc, window: { devicePixelRatio: 3 }, ResizeObserver: undefined });
  try {
    const renderer = createCanvasRenderer(container, { background: '#123' });
    assert.equal(container.children.length, 1);
    assert.equal(renderer.width, 320); assert.equal(renderer.height, 180);
    assert.equal(renderer.canvas.width, 640, 'pixel ratio is capped at 2');
    assert.ok(calls.includes('transform 2,0,0,2,0,0'));
    renderer.clear();
    assert.deepEqual(calls.slice(-2), ['clear', 'fill']);
    assert.equal(context.fillStyle, '#123');
    renderer.dispose();
    assert.equal(container.children.length, 0);
  } finally { Object.assign(globals, previous); }
});

test('canvas renderer explains when a 2D canvas is unavailable', () => {
  const window = new Window({ url: 'http://localhost/' });
  const doc = window.document as unknown as Document;
  const globals = globalThis as Record<string, unknown>;
  const previous = { document: globals.document, window: globals.window };
  const create = doc.createElement.bind(doc);
  doc.createElement = ((tag: string) => { const node = create(tag); if (tag === 'canvas') (node as unknown as { getContext: () => null }).getContext = () => null; return node; }) as typeof doc.createElement;
  Object.assign(globals, { document: doc, window: { devicePixelRatio: 1 } });
  try { assert.throws(() => createCanvasRenderer(doc.createElement('div')), /2D canvas/); }
  finally { Object.assign(globals, previous); }
});
