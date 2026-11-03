/** Synchronous, typed messages. Subscriptions return a cleanup function. */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<(value: never) => void>>();

  on<K extends keyof Events>(type: K, listener: (value: Events[K]) => void): () => void {
    let group = this.listeners.get(type);
    if (!group) this.listeners.set(type, group = new Set());
    const handler = listener as (value: never) => void;
    group.add(handler);
    return () => { group.delete(handler); if (!group.size && this.listeners.get(type) === group) this.listeners.delete(type); };
  }

  once<K extends keyof Events>(type: K, listener: (value: Events[K]) => void): () => void {
    const off = this.on(type, value => { off(); listener(value); });
    return off;
  }

  emit<K extends keyof Events>(type: K, value: Events[K]): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(value as never);
  }

  clear(): void { this.listeners.clear(); }
}
