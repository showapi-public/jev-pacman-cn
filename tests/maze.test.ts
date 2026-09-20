import { describe, expect, it } from "vitest";

import { MAZE_ROWS, parseMaze } from "@/lib/game/maze";
import type { TileKind, TilePosition } from "@/lib/game/types";

const WIDTH = 28;
const HEIGHT = 31;

const WALL = "#";
const FLOOR = " ";
const PELLET = ".";
const POWER_PELLET = "o";
const GATE = "-";
const PACMAN_SPAWN = "P";
const GHOST_SPAWN = "G";

const NEIGHBOURS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

/**
 * The deliberately pellet-free zone around the ghost house: the house itself,
 * the corridor loop that surrounds it, and the two passages that drop down to it
 * from the corridor above (columns 9..18, rows 11..19 plus (12|15, 9..10)).
 * Pac-Man's spawn clearing at (13,23) and its mirror (14,23) also stays bare.
 */
function isPelletFreeByDesign(x: number, y: number): boolean {
  const houseAndLoop = x >= 9 && x <= 18 && y >= 11 && y <= 19;
  const wayDown = (x === 12 || x === 15) && (y === 9 || y === 10);
  const spawnClearing = (x === 13 || x === 14) && y === 23;
  return houseAndLoop || wayDown || spawnClearing;
}

function positionsOf(char: string, rows: readonly string[] = MAZE_ROWS): TilePosition[] {
  const found: TilePosition[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((value, x) => {
      if (value === char) found.push({ x, y });
    });
  });
  return found;
}

function keyOf(tile: TilePosition): string {
  return `${tile.x},${tile.y}`;
}

function parseKey(key: string): TilePosition {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function sortedKeys(tiles: readonly TilePosition[]): string[] {
  return tiles.map(keyOf).sort();
}

/** Floor, pellet, power pellet or the Pac-Man spawn marker: Pac-Man may stand there. */
function pacmanWalkable(char: string): boolean {
  return char === FLOOR || char === PELLET || char === POWER_PELLET || char === PACMAN_SPAWN;
}

/** Pac-Man walkable, plus the ghost-house gate. */
function ghostWalkable(char: string): boolean {
  return pacmanWalkable(char) || char === GATE;
}

function neighboursOf(x: number, y: number): TilePosition[] {
  return NEIGHBOURS.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter(
    (tile) => tile.x >= 0 && tile.x < WIDTH && tile.y >= 0 && tile.y < HEIGHT,
  );
}

/** Breadth-first flood fill over the art, independent of parseMaze. */
function floodFrom(
  starts: readonly TilePosition[],
  canEnter: (x: number, y: number) => boolean,
): Set<string> {
  const seen = new Set<string>(starts.map(keyOf));
  const stack: TilePosition[] = [...starts];
  while (stack.length > 0) {
    const tile = stack.pop() as TilePosition;
    for (const next of neighboursOf(tile.x, tile.y)) {
      const key = keyOf(next);
      if (!seen.has(key) && canEnter(next.x, next.y)) {
        seen.add(key);
        stack.push(next);
      }
    }
  }
  return seen;
}

function pacmanRegionFrom(): { spawn: TilePosition; region: Set<string> } {
  const [spawn] = positionsOf(PACMAN_SPAWN);
  return {
    spawn,
    region: floodFrom([spawn], (x, y) => pacmanWalkable(MAZE_ROWS[y][x])),
  };
}

function withChar(rows: readonly string[], x: number, y: number, char: string): string[] {
  const copy = [...rows];
  copy[y] = copy[y].slice(0, x) + char + copy[y].slice(x + 1);
  return copy;
}

describe("the maze art", () => {
  it("is 28 columns wide and 31 rows tall, with every row the same width", () => {
    expect(MAZE_ROWS).toHaveLength(HEIGHT);
    MAZE_ROWS.forEach((row, y) => {
      expect(row, `row ${y}`).toHaveLength(WIDTH);
    });
  });

  it("is enclosed by walls on all four sides (no wrap-around tunnels)", () => {
    const openings: string[] = [];
    MAZE_ROWS.forEach((row, y) => {
      if (row[0] !== WALL) openings.push(`left edge, row ${y}`);
      if (row[WIDTH - 1] !== WALL) openings.push(`right edge, row ${y}`);
    });
    for (let x = 0; x < WIDTH; x += 1) {
      if (MAZE_ROWS[0][x] !== WALL) openings.push(`top edge, column ${x}`);
      if (MAZE_ROWS[HEIGHT - 1][x] !== WALL) openings.push(`bottom edge, column ${x}`);
    }
    expect(openings).toEqual([]);
  });

  it("is left/right mirror symmetric (Pac-Man and ghost spawns read as floor)", () => {
    const mismatches: string[] = [];
    MAZE_ROWS.forEach((row, y) => {
      const normalized = row.replace(/[PG]/g, FLOOR);
      for (let x = 0; x < WIDTH; x += 1) {
        const mirrored = normalized[WIDTH - 1 - x];
        if (normalized[x] !== mirrored) {
          mismatches.push(
            `row ${y}: column ${x} is '${normalized[x]}' but column ${WIDTH - 1 - x} is '${mirrored}'`,
          );
        }
      }
    });
    expect(mismatches).toEqual([]);
  });

  it("has exactly one Pac-Man spawn, exactly four ghost spawns and at least one gate", () => {
    expect(sortedKeys(positionsOf(PACMAN_SPAWN))).toHaveLength(1);
    expect(sortedKeys(positionsOf(GHOST_SPAWN))).toHaveLength(4);
    expect(positionsOf(GATE).length).toBeGreaterThanOrEqual(1);
  });

  it("places exactly four power pellets, one near each corner", () => {
    const powerPellets = positionsOf(POWER_PELLET);
    expect(powerPellets).toHaveLength(4);
    const quadrants = new Set(
      powerPellets.map(
        ({ x, y }) =>
          `${y < HEIGHT / 2 ? "top" : "bottom"}-${x < WIDTH / 2 ? "left" : "right"}`,
      ),
    );
    expect([...quadrants].sort()).toEqual([
      "bottom-left",
      "bottom-right",
      "top-left",
      "top-right",
    ]);
  });

  it("has no dead ends: every corridor tile has at least two walkable neighbours", () => {
    const deadEnds: string[] = [];
    MAZE_ROWS.forEach((row, y) => {
      [...row].forEach((char, x) => {
        if (!pacmanWalkable(char)) return;
        const exits = neighboursOf(x, y).filter((tile) =>
          pacmanWalkable(MAZE_ROWS[tile.y][tile.x]),
        );
        if (exits.length <= 1) deadEnds.push(`${keyOf({ x, y })}:${char}`);
      });
    });
    expect(deadEnds).toEqual([]);
  });

  it("pellets every reachable tile except the house and its loop, which stay bare", () => {
    const bare: string[] = [];
    const stray: string[] = [];
    MAZE_ROWS.forEach((row, y) => {
      [...row].forEach((char, x) => {
        if (char === PELLET || char === POWER_PELLET) {
          if (isPelletFreeByDesign(x, y)) stray.push(`${x},${y}:${char}`);
          return;
        }
        if (!pacmanWalkable(char) || char === PACMAN_SPAWN) return;
        if (isPelletFreeByDesign(x, y)) return;
        bare.push(`${x},${y}:'${char}'`);
      });
    });
    expect(stray).toEqual([]);
    expect(bare).toEqual([]);
  });
});

describe("parseMaze structure", () => {
  it("parses the shipped art without throwing", () => {
    const maze = parseMaze();
    expect(maze.rows).toBe(MAZE_ROWS);
    expect(maze.width).toBe(WIDTH);
    expect(maze.height).toBe(HEIGHT);
    expect(maze.tiles).toHaveLength(HEIGHT);
    expect(maze.tiles[0]).toHaveLength(WIDTH);
  });

  it("maps every tile to the TileKind its art character promises", () => {
    const maze = parseMaze();
    const byChar: Record<string, TileKind> = {
      [WALL]: "wall",
      [PELLET]: "pellet",
      [POWER_PELLET]: "powerPellet",
      [GATE]: "gate",
    };
    MAZE_ROWS.forEach((row, y) => {
      [...row].forEach((char, x) => {
        expect(maze.tiles[y][x], `tile (${x}, ${y})`).toBe(byChar[char] ?? "floor");
      });
    });
    // Spawn markers are ordinary floor: they are walkable, not special tiles.
    expect(maze.tileAt(13, 23)).toBe("floor");
    expect(maze.tileAt(12, 14)).toBe("floor");
    expect(maze.tileAt(0, 0)).toBe("wall");
    expect(maze.tileAt(13, 12)).toBe("gate");
  });

  it("treats out-of-bounds tiles as wall", () => {
    const maze = parseMaze();
    const outside: TilePosition[] = [
      { x: -1, y: 5 },
      { x: WIDTH, y: 5 },
      { x: 5, y: -1 },
      { x: 5, y: HEIGHT },
      { x: -1, y: -1 },
    ];
    for (const { x, y } of outside) {
      const where = `(${x}, ${y})`;
      expect(maze.tileAt(x, y), where).toBe("wall");
      expect(maze.isWall(x, y), where).toBe(true);
      expect(maze.isGate(x, y), where).toBe(false);
      expect(maze.isPacmanWalkable(x, y), where).toBe(false);
      expect(maze.isGhostWalkable(x, y), where).toBe(false);
    }
  });

  it("blocks Pac-Man at the gate but lets ghosts through, with house floor below and maze floor above", () => {
    const maze = parseMaze();
    const gates = positionsOf(GATE);
    expect(gates.length).toBeGreaterThanOrEqual(1);
    for (const gate of gates) {
      const where = `gate at (${gate.x}, ${gate.y})`;
      expect(maze.isGate(gate.x, gate.y), where).toBe(true);
      expect(maze.isWall(gate.x, gate.y), where).toBe(false);
      expect(maze.isPacmanWalkable(gate.x, gate.y), where).toBe(false);
      expect(maze.isGhostWalkable(gate.x, gate.y), where).toBe(true);
      const below = MAZE_ROWS[gate.y + 1][gate.x];
      const above = MAZE_ROWS[gate.y - 1][gate.x];
      expect(pacmanWalkable(below), `${where}: tile below is '${below}'`).toBe(true);
      expect(pacmanWalkable(above), `${where}: tile above is '${above}'`).toBe(true);
    }
  });

  it("lists exactly the pellet tiles, power pellet tiles and spawns", () => {
    const maze = parseMaze();
    expect(sortedKeys(maze.initialPellets)).toEqual(sortedKeys(positionsOf(PELLET)));
    expect(sortedKeys(maze.initialPowerPellets)).toEqual(sortedKeys(positionsOf(POWER_PELLET)));
    expect(maze.initialPowerPellets).toHaveLength(4);
    expect(maze.pacmanSpawn).toEqual({ x: 13, y: 23 });
    // Blinky, Pinky, Inky, Clyde: left to right on the house's middle row.
    expect(sortedKeys(maze.ghostSpawns)).toEqual(["12,14", "13,14", "14,14", "15,14"]);
    expect(maze.ghostSpawns.map((tile) => tile.x)).toEqual([12, 13, 14, 15]);
  });

  it("reports houseTiles as the house interior plus the gate, and keeps it pellet-free", () => {
    const maze = parseMaze();
    const expected: string[] = [];
    for (let y = 13; y <= 15; y += 1) {
      for (let x = 11; x <= 16; x += 1) expected.push(`${x},${y}`);
    }
    expected.push("13,12", "14,12"); // the gate
    expect(sortedKeys(maze.houseTiles)).toEqual(expected.sort());
    expect(maze.houseTiles).toHaveLength(20);
    for (const tile of maze.houseTiles) {
      const char = MAZE_ROWS[tile.y][tile.x];
      expect([FLOOR, GHOST_SPAWN, GATE], `house tile (${tile.x}, ${tile.y})`).toContain(char);
    }
    for (const spawn of maze.ghostSpawns) {
      expect(sortedKeys(maze.houseTiles)).toContain(keyOf(spawn));
    }
  });

  it("reports Pac-Man's region as walkable tiles, free of gates", () => {
    const maze = parseMaze();
    const { spawn, region } = pacmanRegionFrom();
    expect(maze.isPacmanWalkable(spawn.x, spawn.y)).toBe(true);
    expect(maze.isPacmanWalkable(maze.pacmanSpawn.x, maze.pacmanSpawn.y)).toBe(true);
    expect(region.size).toBeGreaterThan(0);
    for (const key of region) {
      const { x, y } = parseKey(key);
      expect(maze.isPacmanWalkable(x, y), `region tile ${key}`).toBe(true);
      expect(maze.isGate(x, y), `region tile ${key}`).toBe(false);
    }
  });

  it("throws on the small stuff too: a short maze, a second Pac-Man and three ghosts", () => {
    expect(() => parseMaze(MAZE_ROWS.slice(0, 4))).toThrow(/at least 5 rows/i);
    const twoPacmen = withChar(MAZE_ROWS, 14, 23, PACMAN_SPAWN);
    expect(() => parseMaze(twoPacmen)).toThrow(/exactly one Pac-Man spawn/i);
    const threeGhosts = withChar(MAZE_ROWS, 12, 14, FLOOR);
    expect(() => parseMaze(threeGhosts)).toThrow(/exactly four ghost spawns/i);
  });
});

describe("reachability", () => {
  it("reaches every pellet and power pellet from the Pac-Man spawn with the gate blocked", () => {
    const { region } = pacmanRegionFrom();
    const pellets = positionsOf(PELLET);
    const powerPellets = positionsOf(POWER_PELLET);
    const unreachable = [...pellets, ...powerPellets].filter((tile) => !region.has(keyOf(tile)));
    expect(unreachable).toEqual([]);
    expect(pellets.length).toBeGreaterThanOrEqual(200);
    expect(powerPellets).toHaveLength(4);
  });

  it("connects every Pac-Man-walkable tile outside the house to the spawn in one region", () => {
    const { spawn, region } = pacmanRegionFrom();
    const maze = parseMaze();
    const house = new Set(maze.houseTiles.map(keyOf));

    // Every walkable tile either belongs to the spawn's region or to the house.
    const orphan: string[] = [];
    MAZE_ROWS.forEach((row, y) => {
      [...row].forEach((char, x) => {
        if (!pacmanWalkable(char)) return;
        const key = `${x},${y}`;
        if (!region.has(key) && !house.has(key)) orphan.push(`${key}:'${char}'`);
      });
    });
    expect(orphan).toEqual([]);

    // And the tiles outside the house form exactly one connected component:
    // label components independently of the spawn's flood fill.
    const outsideHouse = new Set<string>();
    MAZE_ROWS.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const key = `${x},${y}`;
        if (pacmanWalkable(char) && !house.has(key)) outsideHouse.add(key);
      });
    });
    const components: string[][] = [];
    const remaining = new Set(outsideHouse);
    while (remaining.size > 0) {
      const [first] = remaining;
      const component = floodFrom([parseKey(first)], (x, y) => outsideHouse.has(`${x},${y}`));
      for (const key of component) remaining.delete(key);
      components.push([...component]);
    }
    expect(components).toHaveLength(1);
    expect(components[0].length).toBe(outsideHouse.size);
    expect(region.size).toBe(outsideHouse.size);
    expect(region.has(keyOf(spawn))).toBe(true);
  });

  it("lets every ghost spawn reach the Pac-Man region over ghost-walkable tiles", () => {
    const maze = parseMaze();
    const { region } = pacmanRegionFrom();
    expect(maze.ghostSpawns).toHaveLength(4);
    for (const spawn of maze.ghostSpawns) {
      const where = `ghost spawn (${spawn.x}, ${spawn.y})`;
      const reach = floodFrom([spawn], (x, y) => ghostWalkable(MAZE_ROWS[y][x]));
      expect([...reach].some((key) => region.has(key)), `${where} escaping the house`).toBe(true);
      // The only way out is up through the gate.
      expect(reach.has("13,12"), `${where} passing the left gate tile`).toBe(true);
      expect(reach.has("14,12"), `${where} passing the right gate tile`).toBe(true);
    }
  });
});

describe("parseMaze rejects broken mazes", () => {
  it("throws on a row that is not the same width as the others", () => {
    const ragged = [...MAZE_ROWS];
    ragged[5] = `${ragged[5]}${WALL}`;
    expect(() => parseMaze(ragged)).toThrow(/row 5 has width 29/i);
  });

  it("throws on an unreachable pellet (a sealed-off tile)", () => {
    // Wall in the pellet at (1, 5): wall above, below and to its right.
    let sealed = withChar(MAZE_ROWS, 1, 4, WALL);
    sealed = withChar(sealed, 2, 5, WALL);
    sealed = withChar(sealed, 1, 6, WALL);
    expect(MAZE_ROWS[5][1]).toBe(PELLET);
    expect(sealed[5][1]).toBe(PELLET);
    expect(() => parseMaze(sealed)).toThrow(/unreachable pellet at column 1, row 5/i);
  });

  it("throws on a maze whose ghost house has no gate", () => {
    let gated = withChar(MAZE_ROWS, 13, 12, WALL);
    gated = withChar(gated, 14, 12, WALL);
    expect(() => parseMaze(gated)).toThrow(/gate/i);
  });
});
