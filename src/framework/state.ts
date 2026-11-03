export interface GameState<Context> {
  enter?(context: Context): void;
  update?(context: Context, dt: number): void;
  exit?(context: Context): void;
}

/** One active state. Transitions requested during lifecycle calls are queued. */
export class StateManager<Context> {
  private states = new Map<string, GameState<Context>>();
  private current?: GameState<Context>;
  private transitioning = false;
  private pending?: string;
  private disposed = false;
  name?: string;
  constructor(private context: Context) {}

  register(name: string, state: GameState<Context>): this {
    if (this.states.has(name)) throw new Error(`State already registered: ${name}`);
    this.states.set(name, state); return this;
  }
  change(name: string): void {
    if (this.disposed) throw new Error('State manager disposed');
    if (!this.states.has(name)) throw new Error(`Unknown state: ${name}`);
    if (this.transitioning) { this.pending = name; return; }
    if (this.name === name) return;
    let next: string | undefined = name;
    let count = 0;
    this.transitioning = true;
    try {
      while (next !== undefined) {
        if (++count > 100) throw new Error('State transition cycle detected');
        this.pending = undefined;
        if (next !== this.name) {
          this.current?.exit?.(this.context);
          this.current = undefined; this.name = undefined;
          const state = this.states.get(next)!;
          this.current = state; this.name = next;
          try { state.enter?.(this.context); }
          catch (error) { this.current = undefined; this.name = undefined; throw error; }
        }
        next = this.pending;
      }
    } finally { this.transitioning = false; this.pending = undefined; }
  }
  update(dt: number): void { this.current?.update?.(this.context, dt); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = undefined;
    const current = this.current; this.current = undefined; this.name = undefined;
    current?.exit?.(this.context);
  }
}
