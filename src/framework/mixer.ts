export type AudioBus = 'music' | 'effects';
export interface Voice { stop(): void }
/** Decoded audio buffers and bounded voices. Call unlock from a user gesture. */
export class AudioMixer {
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private buses: Record<AudioBus, GainNode>;
  private master: GainNode;
  private disposed = false;
  constructor(private context: AudioContext = new AudioContext(), readonly maxVoices = 32) {
    if (!Number.isInteger(maxVoices) || maxVoices < 1) throw new Error('Invalid voice limit');
    this.master = context.createGain(); this.master.connect(context.destination);
    this.buses = { music: context.createGain(), effects: context.createGain() };
    this.buses.music.connect(this.master); this.buses.effects.connect(this.master);
  }
  async load(name: string, url: string, signal?: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error('Audio mixer disposed');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Audio load failed: ${response.status} ${url}`);
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    if (this.disposed || signal?.aborted) throw new Error('Audio load cancelled');
    this.buffers.set(name, buffer);
  }
  unlock(): Promise<void> { return this.context.resume(); }
  setBuffer(name: string, buffer: AudioBuffer): void {
    if (this.disposed) throw new Error('Audio mixer disposed');
    this.buffers.set(name, buffer);
  }
  suspend(): Promise<void> { return this.context.suspend(); }
  setVolume(bus: AudioBus | 'master', value: number): void {
    if (!Number.isFinite(value)) throw new Error('Invalid volume');
    (bus === 'master' ? this.master : this.buses[bus]).gain.setValueAtTime(Math.max(0, Math.min(1, value)), this.context.currentTime);
  }
  play(name: string, bus: AudioBus = 'effects', loop = false): Voice | undefined {
    const buffer = this.buffers.get(name); if (!buffer) throw new Error(`Unknown audio: ${name}`);
    if (this.voices.size >= this.maxVoices || this.context.state !== 'running') return undefined;
    const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = loop; source.connect(this.buses[bus]);
    const cleanup = () => { this.voices.delete(source); source.disconnect(); };
    source.onended = cleanup; this.voices.add(source); source.start();
    return { stop: () => { if (this.voices.has(source)) { source.stop(); cleanup(); } } };
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.voices) { source.stop(); source.disconnect(); }
    this.voices.clear(); this.buffers.clear(); this.master.disconnect();
    this.buses.music.disconnect(); this.buses.effects.disconnect(); await this.context.close();
  }
}
