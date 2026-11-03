export interface Screen {
  element: HTMLElement;
  show?(): void;
  hide?(): void;
}

/** Displays one DOM screen at a time; game states decide which screen to show. */
export class UIController {
  private screens = new Map<string, Screen>();
  private active?: Screen;
  name?: string;
  constructor(private root: HTMLElement) {}
  register(name: string, screen: Screen): this {
    if (this.screens.has(name)) throw new Error(`Screen already registered: ${name}`);
    screen.element.hidden = true;
    this.root.append(screen.element);
    this.screens.set(name, screen);
    return this;
  }
  show(name: string): void {
    const next = this.screens.get(name);
    if (!next) throw new Error(`Unknown screen: ${name}`);
    if (this.active === next) return;
    this.hide();
    this.active = next; this.name = name;
    next.element.hidden = false; next.show?.();
  }
  hide(): void {
    const previous = this.active;
    this.active = undefined; this.name = undefined;
    if (previous) { previous.element.hidden = true; previous.hide?.(); }
  }
  dispose(): void { this.hide(); for (const screen of this.screens.values()) screen.element.remove(); this.screens.clear(); }
}
