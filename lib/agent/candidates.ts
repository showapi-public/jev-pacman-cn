/**
 * Candidates and the words Jev is asked with.
 *
 * Only directions Pac-Man may legally take are candidates, and each one comes
 * with a sentence built from the same facts as the observation. Jev cannot
 * answer with a direction that was not offered, which is the whole point of
 * using a Choice question here.
 */

import type { CandidateAnalysis } from "../games/pacman/analysis";
import type { Direction, GameState } from "../games/pacman/types";

export interface Candidate {
  direction: Direction;
  analysis: CandidateAnalysis;
  /** The option text Jev is shown for this direction. */
  text: string;
}

export function buildCandidates(
  state: GameState,
  candidates: Record<Direction, CandidateAnalysis>,
  directions: readonly Direction[],
): Candidate[] {
  return directions.map((direction) => ({
    direction,
    analysis: candidates[direction],
    text: candidateText(direction, candidates[direction]),
  }));
}

/** A factual sentence: numbers, in the same words as the observation's fields. */
export function candidateText(direction: Direction, candidate: CandidateAnalysis): string {
  const parts: string[] = [`Move ${direction}.`];

  parts.push(
    candidate.nearestPelletDistance === null
      ? "No pellet is reachable that way."
      : `Nearest pellet is ${candidate.nearestPelletDistance} tile${plural(candidate.nearestPelletDistance)} away; ${candidate.pelletsWithin6Tiles} pellets within 6 tiles.`,
  );

  parts.push(
    candidate.nearestPowerPelletDistance === null
      ? "No power pellet is reachable that way."
      : `Nearest power pellet is ${candidate.nearestPowerPelletDistance} tile${plural(candidate.nearestPowerPelletDistance)} away.`,
  );

  parts.push(
    candidate.nearestDangerousGhostDistance === null
      ? "No dangerous ghost on this side of the maze."
      : `Nearest dangerous ghost is ${candidate.nearestDangerousGhostDistance} tile${plural(candidate.nearestDangerousGhostDistance)} away.`,
  );

  if (candidate.nearestFrightenedGhostDistance !== null) {
    parts.push(
      `A frightened ghost is ${candidate.nearestFrightenedGhostDistance} tile${plural(candidate.nearestFrightenedGhostDistance)} away and can be eaten.`,
    );
  }

  parts.push(
    `Room to move: ${candidate.reachableArea} tiles, ${candidate.reachableSafeArea} of them clear of dangerous ghosts.`,
  );

  parts.push(
    candidate.deadEnd
      ? `This is a dead end ${candidate.deadEndDepth ?? 1} tile${plural(candidate.deadEndDepth ?? 1)} deep.`
      : "Not a dead end.",
  );

  if (candidate.continuesForward) parts.push("Keeps the current heading.");
  if (candidate.reversesDirection) parts.push("Turns back the way Pac-Man came.");

  return parts.join(" ");
}

export function buildCriteria(candidates: Candidate[]): Record<string, string> {
  return candidates.reduce<Record<string, string>>((criteria, candidate) => {
    criteria[candidate.direction] = candidate.text;
    return criteria;
  }, {});
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
