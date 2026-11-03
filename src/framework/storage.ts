/** Simple namespaced JSON saves. Storage errors (including quota) propagate to the caller. */
export class SaveStore {
  constructor(private namespace: string, private storage: Storage = localStorage) {}
  save<T>(key: string, value: T): void { this.storage.setItem(`${this.namespace}:${key}`, JSON.stringify(value)); }
  load<T>(key: string, fallback: T): T {
    const value = this.storage.getItem(`${this.namespace}:${key}`);
    if (value === null) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  remove(key: string): void { this.storage.removeItem(`${this.namespace}:${key}`); }
}

export interface SaveSchema<T> {
  version: number;
  validate(value: unknown): value is T;
  migrate?(value: unknown, fromVersion: number): unknown;
}
export type SaveResult<T> = { ok: true; value: T } | { ok: false; error: unknown };
/** Slots carry a schema version. Invalid/future data is preserved and reported. */
export class VersionedSaveStore<T> {
  constructor(private namespace: string, private schema: SaveSchema<T>, private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    if (!Number.isInteger(schema.version) || schema.version < 1) throw new Error('Invalid save version');
  }
  load(slot: string): SaveResult<T | undefined> {
    try {
      const raw = this.storage.getItem(`${this.namespace}:${slot}`);
      if (raw === null) return { ok: true, value: undefined };
      const envelope = JSON.parse(raw);
      if (!envelope || !Number.isInteger(envelope.version) || envelope.version < 1 || envelope.version > this.schema.version) throw new Error('Unsupported save version');
      const value: unknown = envelope.version === this.schema.version ? envelope.data : this.schema.migrate?.(envelope.data, envelope.version);
      if (!this.schema.validate(value)) throw new Error('Invalid save data');
      return { ok: true, value };
    } catch (error) { return { ok: false, error }; }
  }
  save(slot: string, value: T): SaveResult<void> {
    try {
      if (!this.schema.validate(value)) throw new Error('Invalid save data');
      this.storage.setItem(`${this.namespace}:${slot}`, JSON.stringify({ version: this.schema.version, data: value }));
      return { ok: true, value: undefined };
    } catch (error) { return { ok: false, error }; }
  }
  remove(slot: string): SaveResult<void> {
    try { this.storage.removeItem(`${this.namespace}:${slot}`); return { ok: true, value: undefined }; }
    catch (error) { return { ok: false, error }; }
  }
}
