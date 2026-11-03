/** Backgrounding pauses once. Returning requires an explicit resume. */
export class AppLifecycle {
  private inactive = false;
  private pause = () => { if (!this.inactive) { this.inactive = true; this.onPause(); } };
  private visibility = () => { if (this.document.hidden) this.pause(); };
  constructor(private onPause: () => void, private document: Document = window.document, private target: Window = window) {
    target.addEventListener('blur', this.pause); target.addEventListener('pagehide', this.pause); document.addEventListener('visibilitychange', this.visibility);
    if (document.hidden) this.pause();
  }
  resume(): boolean { if (this.document.hidden) return false; this.inactive = false; return true; }
  dispose(): void { this.target.removeEventListener('blur', this.pause); this.target.removeEventListener('pagehide', this.pause); this.document.removeEventListener('visibilitychange', this.visibility); }
}
