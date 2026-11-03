/** Opt-in diagnostics. Refreshes DOM at most twice per second. */
export class DebugOverlay {
  private element = document.createElement('pre');
  private elapsed = 0;
  private frames = 0;
  constructor(root: HTMLElement, private inspect: () => Record<string, unknown> = () => ({})) {
    this.element.style.cssText = 'position:fixed;top:0;right:0;z-index:9999;pointer-events:none;background:#000c;color:#aff;padding:8px;font:12px monospace'; root.append(this.element);
  }
  update(dt: number): void {
    this.elapsed += dt; this.frames++;
    if (this.elapsed < 0.5) return;
    this.element.textContent = `FPS: ${Math.round(this.frames / this.elapsed)}\n${JSON.stringify(this.inspect(), null, 2)}`; this.frames = this.elapsed = 0;
  }
  dispose(): void { this.element.remove(); }
}
