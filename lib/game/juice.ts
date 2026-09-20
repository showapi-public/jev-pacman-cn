/**
 * Juice: the feedback layer that sits on top of the game state.
 *
 * Nothing here changes the simulation. Particles, score popups, screen shake and
 * hit-stop are pure presentation, triggered by the events the engine already
 * emits. Coordinates are tile units (the renderer multiplies by TILE); shake is
 * reported in pixels.
 */

export type ParticleKind = "spark" | "chunk" | "confetti";

export interface JuiceParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
}

export interface JuicePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}

export interface JuiceState {
  particles: JuiceParticle[];
  popups: JuicePopup[];
  /** 0..1, decays linearly; shake is trauma squared so small knocks stay small. */
  trauma: number;
  /** While > 0 the game loop does not step the simulation (hit-stop). */
  hitstopMs: number;
  flashMs: number;
  flashMaxMs: number;
  flashColor: string;
}

export const MAX_PARTICLES = 260;
export const MAX_SHAKE_PX = 9;
const TRAUMA_DECAY_PER_SEC = 1.7;
const GRAVITY_TILES_PER_SEC2 = 14;

export function createJuice(): JuiceState {
  return { particles: [], popups: [], trauma: 0, hitstopMs: 0, flashMs: 0, flashMaxMs: 0, flashColor: "#ffffff" };
}

/** Frame-rate independent friction: keeps a fraction of the velocity per second. */
function decay(value: number, perSecond: number, dt: number): number {
  return value * Math.pow(perSecond, dt);
}

export function stepJuice(state: JuiceState, dtMs: number): void {
  const dt = dtMs / 1000;

  state.particles = state.particles.filter((particle) => {
    particle.life -= dtMs;
    if (particle.life <= 0) return false;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    if (particle.kind !== "spark") particle.vy += GRAVITY_TILES_PER_SEC2 * dt;
    particle.vx = decay(particle.vx, 0.02, dt);
    particle.vy = decay(particle.vy, 0.2, dt);
    return true;
  });

  state.popups = state.popups.filter((popup) => {
    popup.life -= dtMs;
    if (popup.life <= 0) return false;
    popup.y -= 0.9 * dt;
    return true;
  });

  state.trauma = Math.max(0, state.trauma - TRAUMA_DECAY_PER_SEC * dt);
  state.hitstopMs = Math.max(0, state.hitstopMs - dtMs);
  state.flashMs = Math.max(0, state.flashMs - dtMs);
}

/** Deterministic pseudo-noise so a shake is testable and never needs Math.random. */
function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** Shake offset in pixels. Trauma squared: light hits rumble, big ones hit. */
export function shakeOffset(state: JuiceState, timeMs: number): { x: number; y: number } {
  if (state.trauma <= 0) return { x: 0, y: 0 };
  const amplitude = state.trauma * state.trauma * MAX_SHAKE_PX;
  const step = Math.floor(timeMs / 24);
  return {
    x: (noise(step) * 2 - 1) * amplitude,
    y: (noise(step + 101) * 2 - 1) * amplitude,
  };
}

export function isFrozen(state: JuiceState): boolean {
  return state.hitstopMs > 0;
}

function push(state: JuiceState, particle: JuiceParticle): void {
  state.particles.push(particle);
  if (state.particles.length > MAX_PARTICLES) {
    state.particles.splice(0, state.particles.length - MAX_PARTICLES);
  }
}

export function addTrauma(state: JuiceState, amount: number): void {
  state.trauma = Math.min(1, state.trauma + amount);
}

export function freezeFor(state: JuiceState, ms: number): void {
  state.hitstopMs = Math.max(state.hitstopMs, ms);
}

export function flashScreen(state: JuiceState, ms: number, color: string): void {
  state.flashMs = ms;
  state.flashMaxMs = ms;
  state.flashColor = color;
}

export function addPopup(state: JuiceState, x: number, y: number, text: string, color: string, lifeMs = 780): void {
  state.popups.push({ x, y, text, life: lifeMs, maxLife: lifeMs, color });
  if (state.popups.length > 12) state.popups.shift();
}

/** The everyday response: a pellet disappears with a puff, nothing more. */
export function addPelletSpark(state: JuiceState, x: number, y: number, color: string, count = 3): void {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + x + y;
    push(state, {
      x,
      y,
      vx: Math.cos(angle) * 2.2,
      vy: Math.sin(angle) * 2.2,
      life: 260,
      maxLife: 260,
      size: 1.6,
      color,
      kind: "spark",
    });
  }
}

/** A ghost eating Pac-Man or being eaten: chunks, shake, freeze. */
export function addBurst(state: JuiceState, x: number, y: number, color: string, count = 14): void {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + noise(index + x) * 0.8;
    const speed = 2.6 + noise(index + y) * 3.2;
    push(state, {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.4,
      life: 620,
      maxLife: 620,
      size: 2.4 + noise(index * 3 + x + y) * 1.8,
      color,
      kind: "chunk",
    });
  }
}

/** Level cleared: a wide, slow shower from the top of the maze. */
export function addConfetti(state: JuiceState, width: number, height: number, colors: readonly string[], count = 54): void {
  for (let index = 0; index < count; index += 1) {
    push(state, {
      x: noise(index * 7.1) * width,
      y: noise(index * 3.3) * height * 0.5,
      vx: (noise(index * 1.7) - 0.5) * 3,
      vy: 1.5 + noise(index * 5.9) * 3,
      life: 1400,
      maxLife: 1400,
      size: 2.6,
      color: colors[index % colors.length],
      kind: "confetti",
    });
  }
}
