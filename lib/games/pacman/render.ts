/**
 * Canvas rendering. Drawing only: it reads game state and never changes it.
 *
 * Walls are drawn as outlines (a bright line on every wall face that touches
 * floor) rather than filled blocks, which is what makes a tile maze read as a
 * Pac-Man maze instead of a spreadsheet.
 */

import type { PacmanState, GhostState, TilePosition } from "./types";
import { FRIGHTENED_FLASH_MS, directionVector, tileCenter } from "./types";
import type { JuiceState } from "./juice";
import { shakeOffset } from "./juice";

export const TILE = 20;

/** Hue-cycled wall colour for the neon easter egg. */
function neonWall(time: number): string {
  return `hsl(${Math.round((time / 9) % 360)} 92% 62%)`;
}

/**
 * Canvas colours. A canvas cannot read CSS custom properties while drawing, so
 * these literals mirror the `--pacman` / `--maze-wall` / `--ghost-*` / pellet
 * tokens in app/globals.css. Change both together.
 */
const COLORS = {
  background: "#08090a",
  wall: "#2f5cff",
  wallGlow: "rgba(47, 92, 255, 0.42)",
  pellet: "#f0d7a8",
  powerPellet: "#ffe9b8",
  pacman: "#ffd23f",
  eyeWhite: "#ffffff",
  eyePupil: "#1a1f3a",
  frightened: "#7d5cff",
  frightenedFlash: "#f2f5ff",
  debug: "#7cf5c8",
  junction: "#ffd23f",
  candidate: "#8b93a8",
};

const GHOST_COLORS: Record<string, string> = {
  Blinky: "#ff5b5b",
  Pinky: "#ffa9d4",
  Inky: "#57dcff",
  Clyde: "#ffb15c",
};

/** The ghost's own colour, for the burst when it is eaten. */
export function ghostColor(name: string): string {
  return GHOST_COLORS[name] ?? "#ff5b5b";
}

/** Juice palette: the game's own colours, named by what happened. */
export const EFFECT_COLORS = {
  pellet: "#f0d7a8",
  power: "#ffe9b8",
  death: "#ff6b6b",
  score: "#ffd23f",
  level: ["#ffd23f", "#4cc2e0", "#f0709a", "#34d399"] as const,
};

export interface RenderOptions {
  /** Draw tile coordinates, the target junction, candidates and ghost targets. */
  debug?: boolean;
  /** Milliseconds since the page loaded; drives the pellet pulse and the mouth. */
  time?: number;
  /** Presentation-only effects: particles, popups, shake, flash. */
  juice?: JuiceState;
  /** The easter egg: hue-cycled walls and pellets. */
  neon?: boolean;
  /** A request to Jev is in flight: pulse the junction on the canvas. */
  thinking?: boolean;
  debugInfo?: {
    junction: TilePosition | null;
    legalDirections: string[];
    candidateTiles: TilePosition[];
    ghostTargets: TilePosition[];
  } | null;
}

export function createCanvas(maze: { width: number; height: number }, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(maze.width * TILE * scale);
  canvas.height = Math.round(maze.height * TILE * scale);
  return canvas;
}

export function drawGame(context: CanvasRenderingContext2D, state: PacmanState, options: RenderOptions = {}): void {
  const { maze } = state;
  const time = options.time ?? 0;
  const width = maze.width * TILE;
  const height = maze.height * TILE;
  const juice = options.juice;
  const neon = options.neon === true;

  // Background first, unshaken. Shaken content is scaled up a hair so a shake
  // can never expose the canvas edge.
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, width, height);

  context.save();
  if (juice && juice.trauma > 0) {
    const offset = shakeOffset(juice, time);
    context.translate(offset.x, offset.y);
    context.scale(1.02, 1.02);
    context.translate(-width * 0.01, -height * 0.01);
  }

  drawWalls(context, state, time, neon);
  drawPellets(context, state, time, neon);
  drawGhosts(context, state, time);
  drawPacman(context, state, time);
  if (juice) drawJuice(context, juice);
  if (options.thinking) drawThinkingRing(context, options.debugInfo?.junction ?? null, time);
  if (options.debug) drawDebugGrid(context, state, options);

  context.restore();

  // The flash sits above everything and never shakes.
  if (juice && juice.flashMs > 0 && juice.flashMaxMs > 0) {
    context.save();
    context.globalAlpha = (juice.flashMs / juice.flashMaxMs) * 0.26;
    context.fillStyle = juice.flashColor;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
}

function drawWalls(context: CanvasRenderingContext2D, state: PacmanState, time: number, neon: boolean): void {
  const { maze } = state;
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.strokeStyle = neon ? neonWall(time) : COLORS.wall;
  context.shadowColor = neon ? "rgba(255, 255, 255, 0.22)" : COLORS.wallGlow;
  context.shadowBlur = 4;

  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      const kind = maze.tileAt(x, y);
      const left = x * TILE;
      const top = y * TILE;
      const right = left + TILE;
      const bottom = top + TILE;

      if (kind === "wall") {
        context.beginPath();
        if (maze.tileAt(x, y - 1) !== "wall") {
          context.moveTo(left + 2, top + 2);
          context.lineTo(right - 2, top + 2);
        }
        if (maze.tileAt(x, y + 1) !== "wall") {
          context.moveTo(left + 2, bottom - 2);
          context.lineTo(right - 2, bottom - 2);
        }
        if (maze.tileAt(x - 1, y) !== "wall") {
          context.moveTo(left + 2, top + 2);
          context.lineTo(left + 2, bottom - 2);
        }
        if (maze.tileAt(x + 1, y) !== "wall") {
          context.moveTo(right - 2, top + 2);
          context.lineTo(right - 2, bottom - 2);
        }
        context.stroke();
        continue;
      }

      if (kind === "gate") {
        context.save();
        // The house door: a muted rose bar, continuous across both gate tiles,
        // so it reads as part of the maze rather than a stray mark.
        context.shadowBlur = 0;
        context.lineCap = "butt";
        context.strokeStyle = "rgba(196, 124, 154, 0.85)";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(left, top + TILE / 2);
        context.lineTo(right, top + TILE / 2);
        context.stroke();
        context.restore();
      }
    }
  }
}

function drawPellets(context: CanvasRenderingContext2D, state: PacmanState, time: number, neon: boolean): void {
  context.shadowBlur = 0;
  context.fillStyle = neon ? neonWall(time + 460) : COLORS.pellet;
  for (const key of state.pellets) {
    const [x, y] = key.split(",");
    const center = tileCenter({ x: Number(x), y: Number(y) });
    context.beginPath();
    context.arc(center.x * TILE, center.y * TILE, 1.9, 0, Math.PI * 2);
    context.fill();
  }

  const pulse = 1 + Math.sin(time / 220) * 0.18;
  context.fillStyle = neon ? neonWall(time + 900) : COLORS.powerPellet;
  context.shadowColor = "rgba(255, 233, 184, 0.7)";
  context.shadowBlur = 10;
  for (const key of state.powerPellets) {
    const [x, y] = key.split(",");
    const center = tileCenter({ x: Number(x), y: Number(y) });
    context.beginPath();
    context.arc(center.x * TILE, center.y * TILE, 5 * pulse, 0, Math.PI * 2);
    context.fill();
  }
  context.shadowBlur = 0;
}

function drawPacman(context: CanvasRenderingContext2D, state: PacmanState, time: number): void {
  if (state.status === "GAME_OVER") return;
  const position = state.pacman.position;
  const x = position.x * TILE;
  const y = position.y * TILE;
  const vector = directionVector(state.pacman.direction);
  const angle = Math.atan2(vector.y, vector.x);
  const moving = state.status === "PLAYING";
  const mouth = moving ? 0.08 + 0.22 * Math.abs(Math.sin(time / 90)) : 0.18;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  if (moving) {
    // Squash and stretch, volume preserved: a chomping Pac-Man has weight.
    const chomp = Math.abs(Math.sin(time / 90));
    context.scale(1 + 0.07 * chomp, 1 - 0.05 * chomp);
  }
  context.fillStyle = COLORS.pacman;
  context.shadowColor = "rgba(255, 210, 63, 0.65)";
  context.shadowBlur = 12;
  context.beginPath();
  context.moveTo(0, 0);
  context.arc(0, 0, TILE * 0.44, mouth * Math.PI, (2 - mouth) * Math.PI);
  context.closePath();
  context.fill();
  context.restore();
}

function drawGhosts(context: CanvasRenderingContext2D, state: PacmanState, time: number): void {
  for (const ghost of state.ghosts) {
    drawGhost(context, state, ghost, time);
  }
}

function drawGhost(context: CanvasRenderingContext2D, state: PacmanState, ghost: GhostState, time: number): void {
  const x = ghost.position.x * TILE;
  // Attract mode: while the game waits to start, the ghosts breathe.
  const bob = state.status === "PLAYING" ? 0 : Math.sin(time / 300 + ghost.tile.x * 0.7) * TILE * 0.07;
  const y = ghost.position.y * TILE + bob;
  const radius = TILE * 0.42;

  if (ghost.mode === "HOUSE" || ghost.mode === "EATEN") {
    // Waiting in the house: barely there, so the eye can stay on the maze.
    context.save();
    context.globalAlpha = ghost.mode === "EATEN" ? 0.35 : 0.55;
    drawGhostBody(context, x, y, radius, GHOST_COLORS[ghost.name] ?? "#ff5b5b", ghost, false);
    context.restore();
    return;
  }

  const flashing =
    ghost.mode === "FRIGHTENED" && state.fright.remainingMs <= FRIGHTENED_FLASH_MS && Math.floor(time / 180) % 2 === 0;
  const body = ghost.mode === "FRIGHTENED" ? (flashing ? COLORS.frightenedFlash : COLORS.frightened) : GHOST_COLORS[ghost.name] ?? "#ff5b5b";

  drawGhostBody(context, x, y, radius, body, ghost, ghost.mode === "FRIGHTENED");
}

function drawGhostBody(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  ghost: GhostState,
  frightened: boolean,
): void {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y - radius * 0.15, radius, Math.PI, 0);
  const feet = 4;
  const footWidth = (radius * 2) / feet;
  const bottom = y + radius * 0.85;
  context.lineTo(x + radius, bottom);
  for (let index = 0; index < feet; index += 1) {
    const startX = x + radius - index * footWidth;
    context.quadraticCurveTo(startX - footWidth / 2, bottom - radius * 0.45, startX - footWidth, bottom);
  }
  context.closePath();
  context.fill();
  // A dark edge so a ghost never reads as part of the (blue) wall behind it.
  context.strokeStyle = "rgba(5, 6, 11, 0.9)";
  context.lineWidth = 1.1;
  context.stroke();

  if (frightened) {
    context.fillStyle = "#ffffff";
    for (const offset of [-0.34, 0.34]) {
      context.beginPath();
      context.arc(x + offset * radius, y - radius * 0.2, radius * 0.16, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.4;
    context.beginPath();
    const wobble = Math.sin(x + y) * radius * 0.12;
    context.moveTo(x - radius * 0.5, y + radius * 0.35 + wobble);
    for (let index = 0; index <= 6; index += 1) {
      const stepX = x - radius * 0.5 + (index * radius) / 6;
      const stepY = y + radius * 0.35 + (index % 2 === 0 ? -radius * 0.12 : radius * 0.12) + wobble;
      context.lineTo(stepX, stepY);
    }
    context.stroke();
    return;
  }

  const vector = directionVector(ghost.direction);
  for (const offset of [-0.32, 0.32]) {
    const eyeX = x + offset * radius + vector.x * radius * 0.16;
    const eyeY = y - radius * 0.22 + vector.y * radius * 0.16;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.ellipse(eyeX, eyeY, radius * 0.26, radius * 0.31, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = COLORS.eyePupil;
    context.beginPath();
    context.arc(eyeX + vector.x * radius * 0.13, eyeY + vector.y * radius * 0.13, radius * 0.13, 0, Math.PI * 2);
    context.fill();
  }
}

/* Canvas text is drawn with the mono face, but the popups also carry Chinese
   ("+10 第 3 关"), so the stack has to name a Simplified Chinese family too. */
const CANVAS_FONT_STACK =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", monospace';

/** Particles and score popups. Purely decorative: the HUD carries the numbers. */
function drawJuice(context: CanvasRenderingContext2D, juice: JuiceState): void {
  context.save();
  context.shadowBlur = 0;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const particle of juice.particles) {
    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    const size = particle.size * (0.6 + alpha * 0.6);
    context.globalAlpha = particle.kind === "confetti" ? Math.min(1, alpha * 1.5) : alpha;
    context.fillStyle = particle.color;
    context.fillRect(particle.x * TILE - size / 2, particle.y * TILE - size / 2, size, size * 1.6);
  }

  for (const popup of juice.popups) {
    const alpha = Math.max(0, Math.min(1, popup.life / popup.maxLife));
    const size = Math.round(TILE * 0.66 * (1 + (1 - alpha) * 0.22));
    context.globalAlpha = alpha;
    context.font = `600 ${size}px ${CANVAS_FONT_STACK}`;
    context.lineWidth = 3;
    context.strokeStyle = "rgba(5, 6, 11, 0.85)";
    context.strokeText(popup.text, popup.x * TILE, popup.y * TILE);
    context.fillStyle = popup.color;
    context.fillText(popup.text, popup.x * TILE, popup.y * TILE);
  }

  context.restore();
}

/** The junction Jev is being asked about: a ring that pulses while the answer is on its way. */
function drawThinkingRing(context: CanvasRenderingContext2D, junction: TilePosition | null, time: number): void {
  if (!junction) return;
  const center = tileCenter(junction);
  const phase = (time % 900) / 900;
  context.save();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255, 210, 63, 0.9)";
  context.lineWidth = 1.6;
  context.globalAlpha = 1 - phase;
  context.beginPath();
  context.arc(center.x * TILE, center.y * TILE, TILE * (0.45 + phase * 0.5), 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.75;
  context.fillStyle = "rgba(255, 210, 63, 0.95)";
  context.beginPath();
  context.arc(center.x * TILE, center.y * TILE, 2.4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawDebugGrid(context: CanvasRenderingContext2D, state: PacmanState, options: RenderOptions): void {
  const info = options.debugInfo;
  context.save();
  context.shadowBlur = 0;

  // Tile centres, faint.
  context.fillStyle = "rgba(118, 124, 133, 0.35)"; // --text-quaternary
  for (let y = 0; y < state.maze.height; y += 1) {
    for (let x = 0; x < state.maze.width; x += 1) {
      if (!state.maze.isPacmanWalkable(x, y)) continue;
      const center = tileCenter({ x, y });
      context.fillRect(center.x * TILE - 0.8, center.y * TILE - 0.8, 1.6, 1.6);
    }
  }

  // Where the decision will be taken.
  if (info?.junction) {
    const center = tileCenter(info.junction);
    context.strokeStyle = COLORS.junction;
    context.lineWidth = 1.6;
    context.setLineDash([3, 3]);
    context.strokeRect(center.x * TILE - TILE / 2, center.y * TILE - TILE / 2, TILE, TILE);
    context.setLineDash([]);
  }

  context.fillStyle = "rgba(113, 112, 255, 0.8)"; // --accent: the legal choices
  for (const tile of info?.candidateTiles ?? []) {
    const center = tileCenter(tile);
    context.fillRect(center.x * TILE - 2, center.y * TILE - 2, 4, 4);
  }

  context.strokeStyle = "rgba(255, 107, 107, 0.85)"; // --status-bad: where a ghost is heading
  context.lineWidth = 1.4;
  for (const tile of info?.ghostTargets ?? []) {
    const center = tileCenter(tile);
    context.beginPath();
    context.moveTo(center.x * TILE - 4, center.y * TILE - 4);
    context.lineTo(center.x * TILE + 4, center.y * TILE + 4);
    context.moveTo(center.x * TILE + 4, center.y * TILE - 4);
    context.lineTo(center.x * TILE - 4, center.y * TILE + 4);
    context.stroke();
  }

  context.restore();
}
