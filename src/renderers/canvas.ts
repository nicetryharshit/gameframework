export interface CanvasRendererOptions {
  /** Fill colour used by clear(). Leave out for a transparent canvas. */
  background?: string;
  /** Overrides the device pixel ratio. Capped at 2 by default to keep fill rate reasonable. */
  pixelRatio?: number;
}

export interface CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  /** Size in CSS pixels. Draw in these units; the renderer scales the backing store for sharp output. */
  readonly width: number;
  readonly height: number;
  clear(): void;
  dispose(): void;
}

/**
 * A renderer with no dependencies: a plain 2D canvas kept the size of its container.
 * The framework game loop decides when to draw, so call clear() and draw each frame.
 */
export function createCanvasRenderer(container: HTMLElement, options: CanvasRendererOptions = {}): CanvasRenderer {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create a 2D canvas.');
  container.appendChild(canvas);

  const state = { width: 1, height: 1 };
  const resize = () => {
    const ratio = options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(1, container.clientWidth);
    state.height = Math.max(1, container.clientHeight);
    canvas.width = Math.round(state.width * ratio);
    canvas.height = Math.round(state.height * ratio);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
  observer?.observe(container);
  resize();

  return {
    canvas, context,
    get width() { return state.width; },
    get height() { return state.height; },
    clear() {
      context.clearRect(0, 0, state.width, state.height);
      if (options.background) { context.fillStyle = options.background; context.fillRect(0, 0, state.width, state.height); }
    },
    dispose() { observer?.disconnect(); canvas.remove(); }
  };
}
