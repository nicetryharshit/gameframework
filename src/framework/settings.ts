import { VersionedSaveStore } from './storage';
export interface GameSettings { master: number; music: number; effects: number; muted: boolean }
export const defaultSettings: Readonly<GameSettings> = Object.freeze({ master: 1, music: 0.7, effects: 1, muted: false });
export function createSettingsStore(namespace: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): VersionedSaveStore<GameSettings> {
  return new VersionedSaveStore(namespace, {
    version: 1,
    validate(value): value is GameSettings {
      if (!value || typeof value !== 'object') return false;
      const settings = value as GameSettings;
      return typeof settings.muted === 'boolean' && [settings.master, settings.music, settings.effects].every(v => Number.isFinite(v) && v >= 0 && v <= 1);
    }
  }, storage);
}
