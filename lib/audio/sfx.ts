/**
 * The cabinet's voice: a tiny synthesized arcade sound board.
 *
 * No audio assets — every sound is one or two oscillators and a gain envelope.
 * Sound is opt-in: the board stays silent until `unlock()` runs inside a real
 * user gesture (the Start button), and a muted board stays silent always.
 * Every Web Audio call is guarded: an audio failure must never break the game.
 */

export type SfxName = "chomp" | "power" | "ghost" | "death" | "level" | "click" | "start";

export const SOUND_STORAGE_KEY = "jev-pacman:sound";

export class SoundBoard {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private muted: boolean;
  private readonly volume: number;
  private chompFlip = false;

  constructor(options: { muted?: boolean; volume?: number } = {}) {
    this.muted = options.muted ?? true;
    this.volume = options.volume ?? 0.9;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      try {
        this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.context.currentTime, 0.02);
      } catch {
        /* ignore */
      }
    }
  }

  /** Called from a real user gesture (a click handler). Safe to call repeatedly. */
  unlock(): void {
    if (this.unlocked || typeof window === "undefined") return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(context.destination);
      this.context = context;
      this.master = master;
      this.unlocked = true;
      void context.resume().catch(() => undefined);
    } catch {
      this.context = null;
      this.master = null;
    }
  }

  play(name: SfxName): void {
    if (this.muted) return;
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state === "closed") return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    try {
      this.emit(name, context, master);
    } catch {
      /* a sound that fails is not worth a broken frame */
    }
  }

  private emit(name: SfxName, context: AudioContext, master: GainNode): void {
    switch (name) {
      case "chomp": {
        // Waka-waka: the two notes alternate so a run of pellets becomes a rhythm.
        this.chompFlip = !this.chompFlip;
        this.blip(context, master, "square", this.chompFlip ? 196 : 147, this.chompFlip ? 165 : 124, 0.055, 0.05);
        break;
      }
      case "power":
        this.blip(context, master, "sawtooth", 180, 560, 0.28, 0.06);
        break;
      case "ghost":
        this.arp(context, master, [523, 659, 880], 0.06, "triangle", 0.07);
        break;
      case "death":
        this.blip(context, master, "sawtooth", 420, 68, 0.62, 0.09);
        this.blip(context, master, "square", 300, 55, 0.62, 0.035);
        break;
      case "level":
        this.arp(context, master, [523, 659, 784, 1046], 0.085, "triangle", 0.075);
        break;
      case "start":
        this.arp(context, master, [392, 523, 659], 0.11, "square", 0.05);
        break;
      case "click":
        this.blip(context, master, "square", 880, 880, 0.02, 0.03);
        break;
    }
  }

  /** One oscillator sliding from `from` to `to` Hz under a short envelope. */
  private blip(
    context: AudioContext,
    master: GainNode,
    type: OscillatorType,
    from: number,
    to: number,
    seconds: number,
    peak: number,
  ): void {
    const started = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, started);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), started + seconds);
    gain.gain.setValueAtTime(0.0001, started);
    gain.gain.exponentialRampToValueAtTime(peak, started + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, started + seconds);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(started);
    oscillator.stop(started + seconds + 0.02);
  }

  private arp(
    context: AudioContext,
    master: GainNode,
    notes: readonly number[],
    noteSeconds: number,
    type: OscillatorType,
    peak: number,
  ): void {
    notes.forEach((frequency, index) => {
      const at = index * noteSeconds * 0.82;
      const started = context.currentTime + at;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, started);
      gain.gain.setValueAtTime(0.0001, started);
      gain.gain.exponentialRampToValueAtTime(peak, started + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, started + noteSeconds);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(started);
      oscillator.stop(started + noteSeconds + 0.02);
    });
  }
}
