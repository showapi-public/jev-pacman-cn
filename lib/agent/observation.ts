/**
 * Observation builder: the small, purpose-built snapshot Jev sees.
 *
 * Never a screenshot, never the maze array, never a game object with methods:
 * current score, where Pac-Man is, the junction he is heading for, where the
 * ghosts are, and one block of code-computed facts per legal direction.
 */

import type { CandidateAnalysis } from "../game/analysis";
import { bfs } from "../game/pathfinding";
import { occupiedTile } from "../game/collision";
import type { Direction, GameState, TilePosition } from "../game/types";
import { DIRECTION_ORDER } from "../game/types";
import type { GhostObservation, JevObservation, RecentDecision } from "./types";

export const OBJECTIVE = "Survive and maximize Pac-Man's score.";

export const MAX_RECENT_DECISIONS = 3;

export function buildObservation(args: {
  state: GameState;
  junction: TilePosition;
  heading: Direction;
  legalDirections: Direction[];
  candidates: Record<Direction, CandidateAnalysis>;
  recentDecisions: RecentDecision[];
}): JevObservation {
  const { state, junction, heading, legalDirections, candidates, recentDecisions } = args;

  const ghostField = bfs(state.maze, occupiedTile(state.pacman));

  return {
    objective: OBJECTIVE,
    game: {
      score: state.score,
      lives: state.lives,
      pelletsRemaining: state.pellets.size,
      powerPelletsRemaining: state.powerPellets.size,
    },
    pacman: {
      tile: occupiedTile(state.pacman),
      heading,
    },
    targetJunction: {
      tile: junction,
      legalDirections,
    },
    mode: {
      frightened: state.fright.active,
      frightenedRemainingMs: Math.max(0, Math.round(state.fright.remainingMs)),
    },
    ghosts: state.ghosts.map((ghost): GhostObservation => {
      const distance = ghostField.distanceAt(ghost.tile);
      return {
        name: ghost.name,
        tile: ghost.tile,
        mode: ghost.mode,
        distanceToPacman: distance >= 0 ? distance : null,
      };
    }),
    candidates: DIRECTION_ORDER.reduce<Partial<Record<Direction, CandidateAnalysis>>>((acc, direction) => {
      const candidate = candidates[direction];
      if (!candidate) return acc;
      const { firstTile: _firstTile, ...facts } = candidate;
      void _firstTile;
      acc[direction] = facts as CandidateAnalysis;
      return acc;
    }, {}),
    recentDecisions: recentDecisions.slice(-MAX_RECENT_DECISIONS),
  };
}
