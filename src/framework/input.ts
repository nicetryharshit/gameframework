export interface ActionBinding { keys?: string[]; buttons?: number[]; axes?: { index: number; direction: 1 | -1 }[] }
type Action = { binding: ActionBinding; value: number; previous: number; virtual: Set<object> };
const empty: readonly never[] = [];
/** Stable action records avoid per-frame action allocations. Call update before reading. */
export class Input {
  private keys = new Set<string>();
  private actions = new Map<string, Action>();
  private down = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    for (const action of this.actions.values()) if (action.binding.keys?.includes(event.code)) { event.preventDefault(); this.keys.add(event.code); break; }
  };
  private up = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  reset = (): void => { this.keys.clear(); for (const action of this.actions.values()) { action.value = action.previous = 0; action.virtual.clear(); } };
  constructor(bindings: Record<string, ActionBinding>, private target: Window = window, readonly deadZone = 0.2) {
    if (deadZone < 0 || deadZone >= 1 || !Number.isFinite(deadZone)) throw new Error('Invalid dead zone');
    for (const [name, binding] of Object.entries(bindings)) this.bind(name, binding);
    target.addEventListener('keydown', this.down); target.addEventListener('keyup', this.up); target.addEventListener('blur', this.reset);
  }
  bind(name: string, binding: ActionBinding): void { this.actions.set(name, { binding, value: 0, previous: 0, virtual: new Set() }); }
  setVirtual(name: string, held: boolean, source: object = this): void {
    const action = this.actions.get(name); if (!action) throw new Error(`Unknown action: ${name}`);
    if (held) action.virtual.add(source); else action.virtual.delete(source);
  }
  update(): void {
    let pads: readonly (Gamepad | null)[] = empty;
    try { pads = this.target.navigator.getGamepads?.() ?? empty; } catch { /* blocked in some embeds */ }
    for (const action of this.actions.values()) {
      action.previous = action.value;
      let value = action.virtual.size ? 1 : 0;
      for (const key of action.binding.keys ?? empty) if (this.keys.has(key)) { value = 1; break; }
      for (const pad of pads) if (pad?.connected) {
        for (const button of action.binding.buttons ?? empty) if (pad.buttons[button]?.pressed) value = 1;
        for (const axis of action.binding.axes ?? empty) value = Math.max(value, Math.min(1, Math.max(0, ((pad.axes[axis.index] ?? 0) * axis.direction - this.deadZone) / (1 - this.deadZone))));
      }
      action.value = value;
    }
  }
  value(name: string): number { return this.actions.get(name)?.value ?? 0; }
  held(name: string): boolean { return this.value(name) > 0; }
  pressed(name: string): boolean { const a = this.actions.get(name); return !!a && a.value > 0 && a.previous === 0; }
  released(name: string): boolean { const a = this.actions.get(name); return !!a && a.value === 0 && a.previous > 0; }
  dispose(): void { this.target.removeEventListener('keydown', this.down); this.target.removeEventListener('keyup', this.up); this.target.removeEventListener('blur', this.reset); this.reset(); }
}
