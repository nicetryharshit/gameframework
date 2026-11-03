import type { Input } from './input';
/** Active pointers in normalized canvas coordinates, including multitouch drags. */
export class PointerInput {
  readonly pointers = new Map<number, { x: number; y: number; type: string }>();
  private originalTouchAction: string;
  private down = (event: PointerEvent) => { this.element.setPointerCapture(event.pointerId); this.move(event); };
  private move = (event: PointerEvent) => {
    if (event.type === 'pointermove' && !this.pointers.has(event.pointerId)) return;
    const rect = this.element.getBoundingClientRect();
    this.pointers.set(event.pointerId, { x: (event.clientX - rect.left) / Math.max(1, rect.width), y: (event.clientY - rect.top) / Math.max(1, rect.height), type: event.pointerType });
  };
  private up = (event: PointerEvent) => { this.pointers.delete(event.pointerId); };
  constructor(private element: HTMLElement) {
    this.originalTouchAction = element.style.touchAction; element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.down); element.addEventListener('pointermove', this.move);
    element.addEventListener('pointerup', this.up); element.addEventListener('pointercancel', this.up); element.addEventListener('lostpointercapture', this.up);
  }
  dispose(): void {
    this.element.removeEventListener('pointerdown', this.down); this.element.removeEventListener('pointermove', this.move);
    this.element.removeEventListener('pointerup', this.up); this.element.removeEventListener('pointercancel', this.up); this.element.removeEventListener('lostpointercapture', this.up);
    this.element.style.touchAction = this.originalTouchAction; this.pointers.clear();
  }
}
/** Returns cleanup; separate sources keep simultaneous touches independent. */
export function bindActionButton(element: HTMLElement, input: Input, action: string): () => void {
  const sources = new Map<number, object>();
  const previous = element.style.touchAction; element.style.touchAction = 'none';
  const down = (event: PointerEvent) => {
    event.preventDefault(); element.setPointerCapture(event.pointerId);
    let source = sources.get(event.pointerId); if (!source) { source = {}; sources.set(event.pointerId, source); }
    input.setVirtual(action, true, source);
  };
  const up = (event: PointerEvent) => { const source = sources.get(event.pointerId); if (source) input.setVirtual(action, false, source); sources.delete(event.pointerId); };
  element.addEventListener('pointerdown', down);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, up as EventListener);
  return () => {
    element.removeEventListener('pointerdown', down);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.removeEventListener(type, up as EventListener);
    for (const source of sources.values()) input.setVirtual(action, false, source);
    sources.clear(); element.style.touchAction = previous;
  };
}
