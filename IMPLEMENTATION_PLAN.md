# Jev Plays Pac-Man — Detailed Implementation Plan

## 0. Goal

Build a web app that lets TypeSafe AI's **Jev** play Pac-Man in real time.

We do not hand Jev the game screen as an image. Instead the pipeline is:

```text
Pac-Man game
    ↓
game engine reads the current state
    ↓
code computes legal moves, distances, danger
    ↓
structured JSON
    ↓
Jev
    ↓
UP / DOWN / LEFT / RIGHT
    ↓
game engine
```

Jev does not simulate the game or run pathfinding itself.

> **"Given the current situation, which of the available directions should it pick?"**

That local judgement is the whole of its job.

No extra training, fine-tuning, or RL is done on Jev.

**It plays fully zero-shot.**

---

# 1. The Finished Product

Open the web page and Pac-Man appears in the center.

Jev's decisions are displayed in real time on the right.

Example:

```text
JEV DECISION

Target junction: (14, 17)

UP      0.08
LEFT    0.71  ← SELECTED
RIGHT   0.21

Confidence: 0.83
Latency: 126 ms

Reasoning inputs
────────────────────
LEFT
  nearest pellet: 1
  danger ghost: 8
  pellets nearby: 7
  dead end: false

RIGHT
  nearest pellet: 2
  danger ghost: 3
  pellets nearby: 4
  dead end: false
```

Pac-Man moves in the chosen direction.

When the game ends, the app shows:

```text
Score
Pellets eaten
Ghosts eaten
Survival time
Jev decisions
Average latency
Jev decision success rate
Fallback count
```

Display all of them.

---

# 2. Most Important Design Principle

## Do Not Let Jev Act Every Frame

Never do this:

```text
60 FPS
↓
60 Jev API calls per second
```

Pac-Man's movement itself is handled by the game engine.

Jev is called only at:

```text
junctions
or
points where a direction must be chosen from several options
```

That is, we ask Jev only when Pac-Man approaches a junction such as

```text
───────┬──────
       │
       │
```

Straight corridors advance automatically.

Jev is not called where only one turn is possible either.

---

# 3. Jev's Role and the Code's Role

Separate the responsibilities cleanly.

## What the Code Owns

The code owns **computing facts**.

Examples:

- wall detection
- movement
- collision detection
- pellet pickup
- power pellet pickup
- ghost movement
- enumerating legal moves
- shortest distance
- distance to ghosts
- distance to pellets
- dead end detection
- pellet count nearby
- next junction
- frightened state
- score
- lives

The code does not normally make the final call such as

> "LEFT is the best option."

---

## What Jev Owns

Out of

```text
UP
DOWN
LEFT
RIGHT
```

Jev picks one of **the currently legal directions only**.

Jev uses `Choice`.

Jev never generates free-form text.

---

# 4. Tech Stack

Pin the stack to the following to keep the implementation simple.

```text
Next.js
React
TypeScript
HTML Canvas
@typesafe-ai/sdk
Vitest
```

Use Node.js 20 or newer.

Jev's official JavaScript SDK:

```bash
npm install @typesafe-ai/sdk
```

The API key lives on the server only.

```env
TYPESAFE_API_KEY=...
```

Never send it to the browser.

The official TypeSafe SDK exposes `TypeSafeClient().systemOne(...)` and `choice(...)`.

---

# 5. Project Structure

The final layout is roughly this:

```text
jev-pacman/
├── app/
│   ├── api/
│   │   └── decide/
│   │       └── route.ts
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── PacmanCanvas.tsx
│   ├── GameHud.tsx
│   ├── DecisionPanel.tsx
│   ├── DecisionFeed.tsx
│   ├── MetricsPanel.tsx
│   └── Controls.tsx
│
├── lib/
│   ├── game/
│   │   ├── types.ts
│   │   ├── maze.ts
│   │   ├── engine.ts
│   │   ├── movement.ts
│   │   ├── collision.ts
│   │   ├── ghosts.ts
│   │   ├── pathfinding.ts
│   │   └── analysis.ts
│   │
│   ├── agent/
│   │   ├── types.ts
│   │   ├── observation.ts
│   │   ├── candidates.ts
│   │   ├── controller.ts
│   │   ├── fallback.ts
│   │   └── telemetry.ts
│   │
│   └── jev/
│       ├── client.ts
│       ├── prompt.ts
│       └── validation.ts
│
├── tests/
│   ├── engine.test.ts
│   ├── maze.test.ts
│   ├── pathfinding.test.ts
│   ├── analysis.test.ts
│   ├── controller.test.ts
│   └── observation.test.ts
│
├── .env.example
├── package.json
├── README.md
└── IMPLEMENTATION_PLAN.md
```

Do not write game logic directly inside React components.

---

# 6. Game Engine

## 6.1 Coordinate System

Treat the maze as a tile grid.

```ts
type TilePosition = {
  x: number;
  y: number;
};
```

Separate game-logic coordinates from Canvas pixel coordinates.

```text
game coordinates
    ↓
render transform
    ↓
canvas coordinates
```

This way game speed and Canvas size can change without affecting game logic.

---

# 7. Maze

Define the maze as ASCII or as a 2D array.

For example:

```text
###################
#........#........#
#.###.##.#.##.###.#
#o###.##.#.##.###o#
#.................#
#.###.#.#####.#.###.
#.....#...#...#....#
#####.### # ###.####
    #.#   G   #.#
#####.# ##### #.####
#....... P .......#
###################
```

The real maze is larger and looks more like Pac-Man's.

It does not need to copy the original game data or sprites, though.

Symbols:

```text
# = wall
. = pellet
o = power pellet
P = Pac-Man spawn
G = ghost spawn
space = walkable floor
```

---

# 8. Maze Validation

Always validate the maze at startup.

Throw immediately in development on any of these:

```text
rows with different widths
no Pac-Man spawn
multiple Pac-Man spawns
no ghost spawn
isolated walkable tiles
unreachable pellets
```

Use BFS to check that

```text
Pac-Man spawn
↓
every walkable tile
```

is reachable from the spawn.

This keeps a small maze mistake by a coding agent from breaking the whole game.

---

# 9. Direction

Fix directions as a string union.

```ts
export type Direction =
  | "UP"
  | "DOWN"
  | "LEFT"
  | "RIGHT";
```

Helpers:

```ts
directionVector(direction)
oppositeDirection(direction)
turnLeft(direction)
turnRight(direction)
```

Provide all four.

---

# 10. Pac-Man Movement

Pac-Man moves continuously between tile centers.

Example internal state:

```ts
interface PacmanState {
  tile: TilePosition;
  position: {
    x: number;
    y: number;
  };
  direction: Direction;
  requestedDirection: Direction | null;
  speed: number;
  lives: number;
}
```

Change direction at tile centers as a rule.

Never let Pac-Man sink into a wall.

---

# 11. Fixed Timestep

Do not tie game logic to React's render rate.

```text
requestAnimationFrame
        ↓
elapsed time
        ↓
fixed 60 Hz simulation
```

Use that.

For example:

```ts
const FIXED_DT = 1 / 60;
```

Advance the simulation with an accumulator.

---

# 12. Ghost

Implement four ghosts.

```ts
type GhostMode =
  | "CHASE"
  | "SCATTER"
  | "FRIGHTENED";
```

At minimum, these must be distinguishable:

```text
Blinky
Pinky
Inky
Clyde
```

The initial implementation does not have to reproduce the arcade version exactly.

---

# 13. Ghost AI

Ghosts are not controlled by Jev.

They are deterministic game logic.

### Blinky

Targets Pac-Man's current tile.

### Pinky

Targets a few tiles ahead along Pac-Man's heading.

### Inky

Builds its target from the tile ahead of Pac-Man and Blinky's position.

If that gets complicated,

```text
2–4 tiles ahead of Pac-Man
```

is acceptable.

### Clyde

CHASE while Pac-Man is far away.

Head back to a maze corner within a fixed distance.

---

# 14. Ghost Junction Movement

When a ghost reaches an intersection, it computes the distance to its target for each legal direction and

```text
shortest
```

picks the shortest.

Avoid immediate reversals in normal mode.

Use a seeded RNG only in FRIGHTENED mode.

Do not call `Math.random()` directly in game logic.

Provide a seeded RNG.

This makes a game reproducible from the same seed.

---

# 15. Power Pellet

When a power pellet is eaten:

```text
GhostMode = FRIGHTENED
```

Switch to that mode.

For example:

```ts
FRIGHTENED_DURATION_MS = 7000;
```

The ghosts may blink before it ends.

When a FRIGHTENED ghost collides with Pac-Man,

```text
Pac-Man dies
```

is not the outcome;

```text
Ghost eaten
```

is.

---

# 16. Junction Detection

This is the most important part.

Read the legal directions of a tile with:

```ts
getLegalDirections(tile)
```

For example, if it returns

```text
LEFT
RIGHT
UP
```

the tile is a junction.

But if Pac-Man is currently heading right,

```text
LEFT = reverse
```

so the meaningful options are

```text
RIGHT
UP
```

---

# 17. When to Call Jev

Call Jev only when

```ts
meaningfulLegalDirections.length >= 2
```

or when

```text
the current direction is blocked and
several forward directions are available
```

Conversely, do not call Jev in

```text
straight corridors
forced corners
```

---

# 18. Why Not Call Jev on Every Tile

Most tiles in Pac-Man require no decision at all.

For example,

```text
──────────────>
```

just means keeping RIGHT.

So Jev is called only at places such as

```text
        ↑
───────┼───────
        ↓
```

This gives:

- lower API latency
- fewer API calls
- unambiguous state
- a decision feed that is easy to follow
- a classification problem Jev is good at

---

# 19. Jev Does Not See Images

Do not send Canvas screenshots to Jev.

Today's Jev is designed for returning typed decisions from text / JSON such as program state.

So instead of

```text
Canvas
↓
computer vision
↓
Jev
```

use

```text
Game engine state
↓
JSON
↓
Jev
```

---

# 20. Building the Observation

`observation.ts` builds the Jev-facing state from the game's internal state.

**Never serialize internal classes or the huge game object straight to Jev.**

Build a dedicated DTO.

```ts
interface JevObservation {
  objective: string;

  game: {
    score: number;
    lives: number;
    pelletsRemaining: number;
    powerPelletsRemaining: number;
  };

  pacman: {
    tile: TilePosition;
    heading: Direction;
  };

  targetJunction: {
    tile: TilePosition;
    legalDirections: Direction[];
  };

  mode: {
    frightened: boolean;
    frightenedRemainingMs: number;
  };

  ghosts: GhostObservation[];

  candidates: Record<
    Direction,
    CandidateAnalysis
  >;

  recentDecisions: RecentDecision[];
}
```

---

# 21. CandidateAnalysis

Compute features in code for each legal direction.

```ts
interface CandidateAnalysis {
  direction: Direction;

  nearestPelletDistance: number | null;

  pelletsWithin6Tiles: number;

  nearestPowerPelletDistance: number | null;

  nearestDangerousGhostDistance: number | null;

  nearestFrightenedGhostDistance: number | null;

  reachableArea: number;

  deadEnd: boolean;

  deadEndDepth: number | null;

  continuesForward: boolean;

  reversesDirection: boolean;
}
```

---

# 22. Pathfinding

Use BFS for distance calculations.

The maze is small, so A* and the like are unnecessary.

Keep the functions cleanly separated.

```ts
shortestPathDistance(
  from,
  target,
  maze
)
```

```ts
nearestPelletDistance(
  from,
  gameState
)
```

```ts
nearestGhostDistance(
  from,
  ghosts
)
```

---

# 23. Where Each Candidate Is Evaluated

For example, if LEFT is chosen at a junction,

first assume Pac-Man has moved one step into the adjacent tile on the LEFT.

```text
junction
   ↓
candidate first tile
   ↓
the BFS runs
```

Apply the same rule to every candidate.

---

# 24. Dangerous Ghosts

Only these ghosts count as dangerous:

```text
CHASE
SCATTER
```

FRIGHTENED ghosts do not count as dangerous.

---

# 25. Safe Reachable Area

If needed, treat the area near dangerous ghosts as temporarily blocked and

flood fill the number of tiles reachable from a candidate.

Example:

```text
distance from a ghost <= 2
```

marks unsafe tiles.

Then compute

```ts
reachableSafeArea
```

This is useful for avoiding decisions that run into dead ends.

But it is an auxiliary feature only,

**so do not use it to pick the final action in code.**

---

# 26. Jev Request

Conceptually, the server does the following.

```ts
import {
  choice,
  TypeSafeClient,
} from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const result = await client.systemOne({
  state: observation,

  questions: {
    direction: choice(
      `
Choose Pac-Man's next direction at the target junction.

Priority:
1. Stay alive.
2. Avoid dangerous ghosts.
3. When ghosts are frightened, eat them when reasonably safe.
4. Use power pellets when useful for survival.
5. Collect pellets efficiently.
6. Avoid dead ends and unnecessary reversals unless they are safer.

Use only the supplied game state and candidate facts.
Choose exactly one legal direction.
      `.trim(),

      criteria
    ),
  },
});
```

---

# 27. Dynamic Criteria

Important.

Do not offer all four directions as fixed candidates.

Only put the currently legal directions into `criteria`.

Example:

```ts
const criteria = {
  LEFT:
    "Move LEFT. Pellet distance 1. Dangerous ghost distance 8. 6 nearby pellets. Not a dead end.",

  RIGHT:
    "Move RIGHT. Pellet distance 2. Dangerous ghost distance 3. 3 nearby pellets. Not a dead end.",
};
```

Jev then cannot return anything but

```text
LEFT
RIGHT
```

This is one of the biggest advantages of using Jev for game control.

---

# 28. Example State

A state that is actually sent looks like this:

```json
{
  "objective": "Survive and maximize Pac-Man score.",
  "game": {
    "score": 1840,
    "lives": 2,
    "pelletsRemaining": 73,
    "powerPelletsRemaining": 2
  },
  "pacman": {
    "tile": { "x": 13, "y": 17 },
    "heading": "RIGHT"
  },
  "targetJunction": {
    "tile": { "x": 16, "y": 17 },
    "legalDirections": [
      "UP",
      "RIGHT",
      "DOWN"
    ]
  },
  "mode": {
    "frightened": false,
    "frightenedRemainingMs": 0
  },
  "ghosts": [
    {
      "name": "Blinky",
      "tile": { "x": 19, "y": 17 },
      "mode": "CHASE"
    }
  ],
  "candidates": {
    "UP": {
      "nearestPelletDistance": 1,
      "pelletsWithin6Tiles": 8,
      "nearestPowerPelletDistance": 7,
      "nearestDangerousGhostDistance": 9,
      "nearestFrightenedGhostDistance": null,
      "reachableArea": 38,
      "deadEnd": false,
      "deadEndDepth": null,
      "continuesForward": false,
      "reversesDirection": false
    },
    "RIGHT": {
      "nearestPelletDistance": 1,
      "pelletsWithin6Tiles": 4,
      "nearestPowerPelletDistance": 10,
      "nearestDangerousGhostDistance": 2,
      "nearestFrightenedGhostDistance": null,
      "reachableArea": 31,
      "deadEnd": false,
      "deadEndDepth": null,
      "continuesForward": true,
      "reversesDirection": false
    }
  }
}
```

---

# 29. Do Not Send the Whole Maze Every Time

The MVP does not send the whole maze on every request.

The existing Jev Pac-Man demo has been shown to work by supplying the maze, actors, and legal directions as structured state.

For stability, this implementation sends, not

```text
a giant maze JSON blob
```

but

```text
the game state that matters
+
the facts computed in code for each candidate
```

as the core payload.

That cuts down the low-level pathfinding Jev is bad at and

**keeps it focused on semantic decisions.**

---

# 30. Optional Raw Mode

Once it works, you may add two modes for research and comparison:

```text
ASSISTED
RAW
```

### ASSISTED

Candidate features included.

### RAW

Maze + actors + legal directions only.

This lets you compare

> how much an engineered state representation improves Jev's game performance

against the raw representation.

Only ASSISTED is implemented in the MVP, though.

---

# 31. API Route

The browser never calls the TypeSafe API directly.

```text
browser
   ↓
POST /api/decide
   ↓
Next.js server
   ↓
TypeSafe
```

Make this the only path.

Reason:

```text
TYPESAFE_API_KEY
```

must not leak to the browser.

---

# 32. /api/decide Input

```ts
interface DecideRequest {
  decisionId: string;
  observation: JevObservation;
  legalDirections: Direction[];
}
```

---

# 33. /api/decide Output

```ts
interface DecideResponse {
  decisionId: string;

  direction: Direction;

  confidence: number | null;

  probabilities: Partial<
    Record<Direction, number>
  >;

  latencyMs: number;

  model: string | null;
}
```

---

# 34. API Response Validation

Do not fully trust the value that comes back from the server.

Always re-check

```ts
legalDirections.includes(direction)
```

If it fails, do not accept it as a Jev decision.

---

# 35. Handling Real-Time Latency

Calling the Jev API only after Pac-Man reaches the junction gives you

```text
Pac-Man
↓
stops at the junction
↓
waits for the API
```

Avoid this.

The existing Jev Pac-Man uses the same approach: **it queries the junction before Pac-Man arrives** so Pac-Man can keep moving.

---

# 36. Junction Lookahead

While Pac-Man is moving along a corridor, run

```ts
findNextDecisionPoint(
  currentTile,
  currentDirection
)
```

For example:

```text
Pac-Man
   ↓

P ─ ─ ─ ─ ─ J
            junction
```

Locate this J ahead of time.

---

# 37. Prefetch Distance

Initial value:

```ts
const DECISION_PREFETCH_TILES = 3;
```

Once Pac-Man is within 3 tiles of the junction, start the

```text
Jev request
```

Pac-Man itself never stops.

---

# 38. Pending Decision

The controller holds at most one

```ts
pendingDecision
```

```ts
interface PendingDecision {
  decisionId: string;

  junction: TilePosition;

  requestedAt: number;

  promise: Promise<DecisionResult>;
}
```

Never send more than one request for the same junction.

---

# 39. Stale Responses

Very important.

By the time a Jev response arrives,

```text
Pac-Man already passed the junction
Pac-Man died
the game restarted
the game moved to another level
```

may all be true.

So check

```ts
gameEpoch
decisionId
targetJunction
```

Never apply an old response.

```text
response
↓
decision still relevant?
    ↓ yes
apply
    ↓ no
discard
```

---

# 40. Game Epoch

At game start:

```ts
gameEpoch++;
```

Update it on death and on restart too.

Associate an epoch with every request.

Ignore any response whose epoch differs.

---

# 41. Decision Timing

The state transitions are:

```text
IDLE

↓ junction detected

REQUESTING

↓ response received

READY

↓ Pac-Man enters junction

APPLIED

↓ next corridor

IDLE
```

If the response does not arrive before the junction, run

```text
FALLBACK
```

---

# 42. Fallback

Do not make the fallback a clever AI.

Otherwise a different bot effectively plays the game whenever Jev fails.

Keep the fallback simple.

Priority:

```text
1. current direction is still legal → straight
2. exactly one legal direction other than reverse → take it
3. legal direction farthest from dangerous ghosts
4. deterministic direction order
```

Final tie break:

```text
UP
LEFT
DOWN
RIGHT
```

in this fixed order.

Any decision that used the fallback must be shown in the UI as

```text
FALLBACK
```

---

# 43. Guaranteeing That Jev Is Playing the Game

For normal decisions, do not overwrite Jev's output with a

```text
heuristic score
```

Otherwise

> a heuristic bot is really the one playing

is what you end up with.

If Jev's response is

```text
within the deadline
legal
matched to the current decision
```

accept it as is.

---

# 44. Confidence

Show Jev's `confidence` and `probabilities` in the UI.

Example:

```text
UP      ███░░░░░░░ 0.27
LEFT    ███████░░░ 0.65
RIGHT   █░░░░░░░░░ 0.08

confidence 0.76
```

The initial implementation does not overwrite a decision just because

```text
confidence is low
```

Store it as evaluation data.

---

# 45. Recent Decision History

Do not depend on Jev's own previous API calls.

Put the history you need into the state explicitly.

Three entries at most.

```json
[
  {
    "junction": [12, 7],
    "chosen": "LEFT"
  },
  {
    "junction": [8, 7],
    "chosen": "DOWN"
  }
]
```

Its purpose is loop avoidance.

Never include a large history.

---

# 46. Game Rendering

Use Canvas.

Do not create a DOM element per tile in React.

What the Canvas draws:

```text
walls
pellets
power pellets
Pac-Man
ghosts
frightened ghosts
```

Keep game logic and rendering fully separate.

---

# 47. Visual Design

Screen layout:

```text
┌──────────────────────────────────────────────────────────┐
│ JEV PLAYS PAC-MAN                           LIVE ●       │
├────────────────────────────┬─────────────────────────────┤
│                            │ JEV DECISION                │
│                            │                             │
│                            │ LEFT        71%             │
│        GAME CANVAS         │ UP          19%             │
│                            │ RIGHT       10%             │
│                            │                             │
│                            │ Confidence  0.83             │
│                            │ Latency     126 ms           │
├────────────────────────────┼─────────────────────────────┤
│ Score  1840                │ DECISION FEED               │
│ Lives  ● ●                 │ #53 LEFT   126ms            │
│ Pellets 73                 │ #52 UP      104ms            │
│ Level 1                    │ #51 RIGHT   131ms            │
└────────────────────────────┴─────────────────────────────┘
```

Default to a dark UI.

The game itself must be the most prominent element.

---

# 48. Controls

At minimum:

```text
Start
Pause
Restart

Mode:
Jev
Manual

Speed:
0.5×
1×
2×
```

The first demo can default to

```text
0.5×
```

Move to 1× once it runs reliably.

---

# 49. Manual Mode

Drive it from the keyboard:

```text
ArrowUp
ArrowDown
ArrowLeft
ArrowRight
```

This is required to verify that the game engine itself works.

**Finish Manual mode before connecting Jev.**

---

# 50. Telemetry

Record every Jev decision.

```ts
interface DecisionTelemetry {
  decisionId: string;

  tick: number;

  junction: TilePosition;

  legalDirections: Direction[];

  requestedAt: number;

  respondedAt: number | null;

  latencyMs: number | null;

  choice: Direction | null;

  probabilities:
    Partial<Record<Direction, number>>;

  confidence: number | null;

  source:
    | "JEV"
    | "FALLBACK";

  status:
    | "APPLIED"
    | "STALE"
    | "TIMEOUT"
    | "ERROR"
    | "INVALID";
}
```

---

# 51. Metrics

Aggregate the following in real time.

```text
Jev requests
Jev applied decisions
Fallback decisions
Stale responses
Errors
Mean latency
p50 latency
p95 latency
Current score
Pellets eaten
Ghosts eaten
Survival time
```

---

# 52. Debug Mode

Make the debug overlay toggleable from the URL or the UI.

It shows:

```text
tile coordinates
junction tiles
current target junction
legal directions
ghost targets
candidate metrics
pending Jev request
```

Example:

```text
?debug=1
```

---

# 53. Raw State Viewer

The right panel gets a

```text
STATE
```

tab.

It shows the exact JSON that was sent to Jev.

This matters a lot for the demo.

It lets the user check

> what Jev is actually being shown

---

# 54. API Status

Show values like these in the UI:

```text
JEV ONLINE
JEV REQUESTING
JEV ERROR
FALLBACK
```

When no API key is configured,

the game must not crash.

```text
JEV API key not configured.
Manual mode is still available.
```

Display that instead.

---

# 55. Error Handling

The game must keep running through all of these:

```text
network error
401
429
5xx
invalid response
timeout
stale response
```

A Jev failure must never throw out of the game loop.

---

# 56. API Rate Control

Never send more than one request for the same decision.

Also set a minimum request interval.

Example:

```ts
MIN_JEV_INTERVAL_MS = 100;
```

Junction decisions themselves are less frequent than that, so this is normally not an issue.

---

# 57. Game Restart

On restart, fully reset

```text
engine
score
lives
pellets
ghosts
pending decision
recent decisions
telemetry
metrics
```

and

```ts
gameEpoch++
```

to invalidate old API responses.

---

# 58. Deterministic Simulation

Keep the game seed.

Example:

```text
seed = 42
```

It may be changeable from the UI.

With the same seed,

replaying with fixed Jev decisions

must produce the same game result.

---

# 59. Replay

If time allows, implement

```text
telemetry export
```

Save

```json
{
  "seed": 42,
  "decisions": [...]
}
```

and make it possible to replay decisions without calling the API.

This is useful for debugging and comparison experiments.

---

# 60. Baselines

To evaluate Jev's performance, eventually provide:

```text
MANUAL
RANDOM
HEURISTIC
JEV
```

The main mode in the UI is JEV, though.

### RANDOM

Seeded random over the legal directions.

### HEURISTIC

Deterministic selection from the candidate features.

### JEV

Jev's choice.

This lets you measure

```text
whether Jev really beats random
```

---

# 61. Evaluation Protocol

Run multiple trials on the same maze and the same ghost RNG seed.

For example, across

```text
20 seeds
```

compare

```text
Random
Heuristic
Jev
```

Metrics:

```text
score
pellets eaten
survival time
levels completed
ghosts eaten
```

Jev does not have to win.

The goal is to show

> that Jev can make real-time game decisions from structured state alone

---

# 62. Test Strategy

Fully test the game before connecting the Jev API.

---

# 63. Maze Tests

Required:

```text
maze dimensions valid
spawn exists
all pellets reachable
all walkable tiles connected
```

---

# 64. Movement Tests

Build a tiny test maze.

Verify:

```text
cannot pass through walls
moves along corridors
can turn at junctions
cannot make an illegal turn
can reverse
```

---

# 65. Pellet Tests

Verify:

```text
pellet collected
score increases
pellet disappears
power pellet collected
frightened mode starts
```

---

# 66. Collision Tests

Verify:

```text
normal ghost collision → life loss
frightened ghost collision → ghost eaten
```

---

# 67. Pathfinding Tests

Use a hand-made maze whose true distances are known.

```text
A...B
```

and so on.

Assert the BFS distance directly.

---

# 68. Candidate Analysis Tests

For example, build a tiny maze where

```text
a ghost is 1 tile to the RIGHT
many pellets on the LEFT
```

Verify:

```text
RIGHT.nearestDangerousGhostDistance
<
LEFT.nearestDangerousGhostDistance
```

Here, do not assert

```text
LEFT should be picked
```

The analysis layer returns facts only.

---

# 69. Controller Tests

Use a fake Jev client.

```ts
FakeJevClient
```

Build it in the test suite.

Test the following:

### normal

```text
request
→ LEFT
→ junction
→ LEFT applied
```

### delayed

```text
request
→ Pac-Man passes the junction
→ response
→ ignored
```

### restart

```text
request
→ restart
→ old response
→ ignored
```

### error

```text
request throws
→ fallback
→ game continues
```

---

# 70. Mock Jev

You may support

```env
JEV_MOCK=true
```

so the whole app can be developed without the real API.

The mock returns, for example,

```text
first legal direction
```

or a seeded random choice.

This makes the UI, the controller, and telemetry verifiable without an API key.

---

# 71. Integration Test

Make the fake server latency configurable.

```text
0 ms
100 ms
300 ms
700 ms
1500 ms
```

The game must not crash at any of them.

In particular, a 1500 ms response must be safely discarded as stale.

---

# 72. Stress Test

With seeded random decisions, run at least

```text
10,000 simulation ticks
```

Verify:

```text
no NaN coordinates
no wall penetration
no invalid directions
no unhandled exceptions
```

---

# 73. Implementation Order

Follow this order strictly.

## Phase 1 — Project Bootstrap

Implement:

```text
Next.js
TypeScript
Canvas
Vitest
```

Verify:

```bash
npm run dev
npm test
npm run build
```

All must pass.

---

## Phase 2 — Maze + Manual Pac-Man

Implement:

```text
maze
movement
pellets
manual controls
render
```

No ghosts at this stage.

Pac-Man must be able to move through the whole maze manually.

---

## Phase 3 — Ghosts

Implement:

```text
ghost movement
CHASE
SCATTER
FRIGHTENED
collisions
lives
```

At this point Manual mode must play like a normal Pac-Man game.

**Do not add Jev yet.**

---

## Phase 4 — Path Analysis

Implement:

```text
BFS
junction detection
next junction prediction
candidate analysis
```

Show candidate information on screen in debug mode.

---

## Phase 5 — Fake Agent

Wire up a

```text
FakeDecisionProvider
```

in place of Jev.

The architecture:

```ts
interface DecisionProvider {
  decide(
    observation: JevObservation
  ): Promise<DecisionResult>;
}
```

Do not put Jev-specific code directly in the controller.

---

## Phase 6 — Async Controller

Implement:

```text
prefetch
pending decisions
decision IDs
game epoch
stale protection
fallback
```

Verify with fake latency.

---

## Phase 7 — Jev Integration

Add `/api/decide`.

Wire up the TypeSafe SDK.

`.env.local`:

```env
TYPESAFE_API_KEY=...
```

Fetch the Choice from the real API.

---

## Phase 8 — Decision Visualization

Add:

```text
probability bars
confidence
latency
decision feed
raw JSON
API status
```

---

## Phase 9 — Evaluation

Add:

```text
Random
Heuristic
Jev
seed selection
metrics
telemetry export
```

---

# 74. Definition of Done — Functional

The implementation is complete when all of this holds.

- the web app starts
- the maze is drawn
- Manual mode is playable
- ghosts move correctly
- pellets / power pellets work
- Pac-Man death and lives work
- Jev mode can be started
- a Jev request fires before the junction
- Jev returns only legal directions
- the response is applied to Pac-Man
- the game loop never blocks waiting for the API
- stale responses are never applied
- the game continues after an API failure
- decision probabilities are displayed
- latency is displayed
- the decision feed is displayed
- restart works
- the API key is never exposed to the client
- tests pass
- the production build passes

---

# 75. Definition of Done — Jev Integrity

This is also required.

While Jev mode is running, if the

```text
Jev response is valid
```

then

**the final direction must be Jev's Choice.**

Never let the code overwrite it, as in

```text
Jev said LEFT
but heuristic thinks RIGHT is better
→ RIGHT
```

Log every fallback that occurs.

This keeps the claim

> "Jev is playing Pac-Man"

consistent with the implementation.

---

# 76. Definition of Done — Robustness

Verify all of these manually.

```text
no API key
network offline
API error
very slow API
restart during request
pause during request
death during request
speed change during request
```

The app must not crash in any of them.

---

# 77. README

The README must include:

```text
What is this?
Architecture
Why structured state instead of screenshots?
Setup
TYPESAFE_API_KEY
Run
Controls
How Jev decides
Fallback behavior
Metrics
Testing
Limitations
```

---

# 78. What the README Must State

Jev does not learn from the game.

```text
No fine-tuning
No reinforcement learning
No previous-game memory
```

For each decision it receives

```text
current structured game state
```

and picks a direction on the spot.

In short, this project is a demo of

> **zero-shot real-time control with a System One decision model**

---

# 79. Out of Scope from the Start

The MVP does not implement any of the following.

```text
image recognition
screenshot input
OCR
Pac-Man emulator
original ROM
online learning
reinforcement learning
LLM reasoning
vector database
database
authentication
multiplayer
mobile app
```

Do not add unnecessary complexity.

---

# 80. Core Implementation Principles

When in doubt during implementation, prefer these:

```text
1. Game engine is deterministic.
2. Code computes facts.
3. Jev makes decisions.
4. Jev sees only relevant structured state.
5. Jev only chooses legal actions.
6. API calls happen only when a choice is required.
7. Never block the game loop waiting for Jev.
8. Never apply stale decisions.
9. Never expose the API key.
10. Every fallback is observable.
```

---

# 81. Final Architecture

```text
                         ┌─────────────────┐
                         │    Pac-Man      │
                         │   Game Engine   │
                         └────────┬────────┘
                                  │
                           current state
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ State Analyzer  │
                         │                 │
                         │ BFS             │
                         │ Ghost distance  │
                         │ Pellet distance │
                         │ Dead ends       │
                         │ Legal actions   │
                         └────────┬────────┘
                                  │
                          structured JSON
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Agent Controller│
                         └────────┬────────┘
                                  │
                           /api/decide
                                  │
                                  ▼
                         ┌─────────────────┐
                         │      Jev        │
                         │                 │
                         │ Choice          │
                         │ UP / DOWN /     │
                         │ LEFT / RIGHT    │
                         └────────┬────────┘
                                  │
                          typed decision
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Validate /      │
                         │ stale check     │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Pac-Man action  │
                         └─────────────────┘
```

---

# 82. The Demo We Want to Show

The user opens the page and clicks

```text
START JEV
```

Pac-Man starts moving on its own.

It approaches a junction.

The right panel shows:

```text
ASKING JEV...
```

About 100 to a few hundred ms later:

```text
JEV #18

UP       12%
LEFT     76%  ←
RIGHT    12%

Confidence 0.88
Latency   117ms
```

Pac-Man reaches the junction without stopping and turns

```text
LEFT
```

When a ghost closes in, Jev picks the escape direction.

After a power pellet, it sometimes chases ghosts based on

```text
nearestFrightenedGhostDistance
```

Every decision streams down the right panel.

This is the finished form of this project.

---

# 83. Final Instructions for the Coding Agent

Do not build every feature at once when implementing this plan.

Always proceed in this order:

```text
Phase 1
↓
test
↓
Phase 2
↓
test
↓
Phase 3
↓
test
...
```

At the end of each phase, run

```bash
npm test
npm run build
```

Do not move on to the next phase while the existing code is broken.

When something is ambiguous, do not add new machinery.

**Pick the simplest implementation defined in this document.**

The top priority is

> **keeping a stable Pac-Man game engine and Jev's decision-making cleanly separated, and making it observable that Jev is actually controlling the game.**

Everything else is secondary to that.
