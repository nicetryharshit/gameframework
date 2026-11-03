/** @deprecated Use AudioMixer for new games. Retained for existing game compatibility. */
export class AudioPlayer {
  private sounds = new Map<string, HTMLAudioElement>();
  private volume = 1;
  add(name: string, url: string): void { this.sounds.set(name, new Audio(url)); }
  setVolume(value: number): void { this.volume = Math.max(0, Math.min(1, value)); }
  async play(name: string, options: { loop?: boolean } = {}): Promise<HTMLAudioElement> {
    const source = this.sounds.get(name);
    if (!source) throw new Error(`Unknown sound: ${name}`);
    const audio = source.cloneNode() as HTMLAudioElement;
    audio.volume = this.volume; audio.loop = options.loop ?? false;
    await audio.play(); return audio;
  }
}
