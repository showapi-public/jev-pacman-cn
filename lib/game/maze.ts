/**
 * The maze: 28 x 31 tiles of ASCII art plus the parser that turns it into the
 * validated `Maze` the engine runs on.
 *
 * Art characters
 *   '#'  wall                          '.'  pellet
 *   'o'  power pellet                  ' '  empty floor
 *   'P'  Pac-Man spawn (exactly one)   'G'  ghost spawn (exactly four)
 *   '-'  ghost-house gate: walkable for ghosts, a wall for Pac-Man
 *
 * The art is written out in full — every row explicitly, no runtime mirroring —
 * and is left/right mirror symmetric: row[x] === row[27 - x] once the 'P' and
 * 'G' spawn markers are read as plain floor.
 *
 * Ghost house (classic proportions, dead centre): a 6 x 3 room at columns
 * 11..16, rows 13..15, holding the four ghost spawns on its middle row in
 * Blinky, Pinky, Inky, Clyde order left to right. Its top wall carries a
 * 2-tile door '-' at columns 13 and 14; the door has house floor below it and
 * ordinary (Pac-Man reachable) maze floor above it, so ghosts walk straight up
 * out of the house. The door is two tiles wide rather than one because the grid
 * is 28 tiles wide: a single gate tile cannot sit on the centre line (x = 13.5)
 * and still keep the maze mirror symmetric, and the classic arcade door is two
 * tiles wide as well. Parser and tests therefore require at least one gate tile.
 *
 * Pellets cover every Pac-Man-reachable tile except the house, the gate, the
 * corridor loop around the house and the two passages that drop down to it from
 * the corridor above (240 pellets + 4 power pellets, the classic count).
 */
import type { Maze, TileKind, TilePosition } from "./types";

export const MAZE_ROWS: readonly string[] = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "######.##### ## #####.######",
  "######.##          ##.######",
  "######.## ###--### ##.######",
  "######.## #      # ##.######",
  "######.## # GGGG # ##.######",
  "######.## #      # ##.######",
  "######.## ######## ##.######",
  "######.##          ##.######",
  "######.## ######## ##.######",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......P .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

/** Art characters. */
const WALL_CHAR = "#";
const PELLET_CHAR = ".";
const POWER_PELLET_CHAR = "o";
const GATE_CHAR = "-";
const PACMAN_SPAWN_CHAR = "P";
const GHOST_SPAWN_CHAR = "G";

/** A maze shorter than this is almost certainly a typo, not a maze. */
const MIN_MAZE_HEIGHT = 5;

const PACMAN_WALKABLE_TILES: ReadonlySet<TileKind> = new Set<TileKind>([
  "floor",
  "pellet",
  "powerPellet",
]);

const GHOST_WALKABLE_TILES: ReadonlySet<TileKind> = new Set<TileKind>([
  "floor",
  "pellet",
  "powerPellet",
  "gate",
]);

const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function tileKindOf(char: string): TileKind {
  switch (char) {
    case WALL_CHAR:
      return "wall";
    case PELLET_CHAR:
      return "pellet";
    case POWER_PELLET_CHAR:
      return "powerPellet";
    case GATE_CHAR:
      return "gate";
    default:
      // ' ', 'P', 'G' and anything else sit on plain, pellet-free floor.
      return "floor";
  }
}

function describeTile(tile: TilePosition): string {
  return `column ${tile.x}, row ${tile.y}`;
}

function describeTiles(tiles: readonly TilePosition[]): string {
  if (tiles.length === 0) return "none";
  return tiles.map((tile) => `(${tile.x}, ${tile.y})`).join(", ");
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Flood fill over tiles `canEnter` accepts, starting at `starts` (which are
 * themselves assumed to be enterable).
 */
function floodFrom(
  starts: readonly TilePosition[],
  canEnter: (x: number, y: number) => boolean,
): Set<string> {
  const seen = new Set<string>();
  const stack: TilePosition[] = [];
  for (const start of starts) {
    const key = keyOf(start.x, start.y);
    if (!seen.has(key)) {
      seen.add(key);
      stack.push(start);
    }
  }
  while (stack.length > 0) {
    const tile = stack.pop() as TilePosition;
    for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      const key = keyOf(x, y);
      if (!seen.has(key) && canEnter(x, y)) {
        seen.add(key);
        stack.push({ x, y });
      }
    }
  }
  return seen;
}

/**
 * Build and validate a `Maze` from ASCII art.
 *
 * Throws an `Error` naming the offending row/column for every violation:
 * ragged rows, a short maze, a missing/duplicated spawn, a missing gate,
 * an unreachable pellet, a pellet inside the ghost house, a walkable tile that
 * belongs to neither the Pac-Man region nor the house, and a ghost spawn that
 * cannot walk out of the house.
 *
 * Pellets are checked before the generic isolated-tile sweep so the thrown
 * message names the most specific problem (an unreachable pellet).
 *
 * Test mazes may pass `{ requireGhostHouse: false }`: that drops the four
 * ghost spawns, the gate and the house-escape rules, and keeps the rest.
 */
export function parseMaze(
  rows: readonly string[] = MAZE_ROWS,
  options: { requireGhostHouse?: boolean } = {},
): Maze {
  const requireGhostHouse = options.requireGhostHouse ?? true;
  const height = rows.length;
  if (height < MIN_MAZE_HEIGHT) {
    throw new Error(
      `maze must be at least ${MIN_MAZE_HEIGHT} rows tall, got ${height} row(s)`,
    );
  }

  const width = rows[0].length;
  if (width === 0) {
    throw new Error("maze row 0 is empty: the maze must be at least one column wide");
  }
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    if (row.length !== width) {
      throw new Error(
        `maze row ${y} has width ${row.length}, but row 0 has width ${width}: every row must have the same width`,
      );
    }
  }

  const tiles: TileKind[][] = [];
  const pacmanSpawns: TilePosition[] = [];
  const ghostSpawns: TilePosition[] = [];
  const gateTiles: TilePosition[] = [];
  const initialPellets: TilePosition[] = [];
  const initialPowerPellets: TilePosition[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    const kindRow: TileKind[] = [];
    for (let x = 0; x < width; x += 1) {
      const char = row[x];
      kindRow.push(tileKindOf(char));
      switch (char) {
        case PACMAN_SPAWN_CHAR:
          pacmanSpawns.push({ x, y });
          break;
        case GHOST_SPAWN_CHAR:
          ghostSpawns.push({ x, y });
          break;
        case GATE_CHAR:
          gateTiles.push({ x, y });
          break;
        case PELLET_CHAR:
          initialPellets.push({ x, y });
          break;
        case POWER_PELLET_CHAR:
          initialPowerPellets.push({ x, y });
          break;
        default:
          break;
      }
    }
    tiles.push(kindRow);
  }

  if (pacmanSpawns.length !== 1) {
    throw new Error(
      `maze must contain exactly one Pac-Man spawn 'P', found ${pacmanSpawns.length} at ${describeTiles(pacmanSpawns)}`,
    );
  }
  if (requireGhostHouse && ghostSpawns.length !== 4) {
    throw new Error(
      `maze must contain exactly four ghost spawns 'G', found ${ghostSpawns.length} at ${describeTiles(ghostSpawns)}`,
    );
  }
  if (requireGhostHouse && gateTiles.length === 0) {
    throw new Error(
      "maze has no ghost-house gate '-': ghosts need a gate tile in the house wall to walk out",
    );
  }

  // Blinky, Pinky, Inky, Clyde: left to right, then top to bottom.
  ghostSpawns.sort((a, b) => a.x - b.x || a.y - b.y);

  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height;

  const tileAt = (x: number, y: number): TileKind =>
    inBounds(x, y) ? tiles[y][x] : "wall";

  const isWall = (x: number, y: number): boolean => tileAt(x, y) === "wall";
  const isGate = (x: number, y: number): boolean => tileAt(x, y) === "gate";
  const isPacmanWalkable = (x: number, y: number): boolean =>
    PACMAN_WALKABLE_TILES.has(tileAt(x, y));
  const isGhostWalkable = (x: number, y: number): boolean =>
    GHOST_WALKABLE_TILES.has(tileAt(x, y));

  const pacmanSpawn = pacmanSpawns[0];

  // Region A: everything Pac-Man can reach from his spawn (gate is a wall).
  const regionA = floodFrom([pacmanSpawn], isPacmanWalkable);

  // The house: everything a ghost can reach from a ghost spawn, minus region A.
  // With a walled-in house that is exactly the interior plus the gate.
  const ghostRegion = floodFrom(ghostSpawns, isGhostWalkable);
  const houseKeys = new Set<string>();
  const houseTiles: TilePosition[] = [];
  for (const key of ghostRegion) {
    if (regionA.has(key)) continue;
    houseKeys.add(key);
    const [x, y] = key.split(",");
    houseTiles.push({ x: Number(x), y: Number(y) });
  }

  for (const pellet of [...initialPellets, ...initialPowerPellets]) {
    const key = keyOf(pellet.x, pellet.y);
    const label = tiles[pellet.y][pellet.x] === "powerPellet" ? "power pellet" : "pellet";
    if (houseKeys.has(key)) {
      throw new Error(
        `${label} inside the ghost house at ${describeTile(pellet)}: the house interior must be pellet-free`,
      );
    }
    if (!regionA.has(key)) {
      throw new Error(
        `unreachable ${label} at ${describeTile(pellet)}: Pac-Man cannot reach it from his spawn at ${describeTile(pacmanSpawn)}`,
      );
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tiles[y][x] === "wall") continue;
      const key = keyOf(x, y);
      if (regionA.has(key) || houseKeys.has(key)) continue;
      throw new Error(
        `isolated walkable tile at column ${x}, row ${y}: it is neither reachable from the Pac-Man spawn at ${describeTile(pacmanSpawn)} nor part of the ghost house`,
      );
    }
  }

  for (const spawn of ghostSpawns) {
    const reach = floodFrom([spawn], isGhostWalkable);
    let escapes = false;
    for (const key of reach) {
      if (regionA.has(key)) {
        escapes = true;
        break;
      }
    }
    if (!escapes && requireGhostHouse) {
      throw new Error(
        `ghost spawn at ${describeTile(spawn)} cannot leave the ghost house: no path over ghost-walkable tiles reaches the Pac-Man region (the gate must open upwards into the maze)`,
      );
    }
  }

  return {
    rows,
    width,
    height,
    tiles,
    tileAt,
    isWall,
    isGate,
    isPacmanWalkable,
    isGhostWalkable,
    pacmanSpawn,
    ghostSpawns,
    houseTiles,
    initialPellets,
    initialPowerPellets,
  };
}
