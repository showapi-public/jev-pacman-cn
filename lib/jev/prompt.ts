/**
 * The question Jev is asked.
 *
 * One Choice question named `direction`, whose options are exactly the legal
 * directions at the junction. Jev cannot answer "jump the wall" or "wait":
 * everything it can say is something Pac-Man is allowed to do.
 */

import { candidateText } from "../agent/candidates";
import type { CandidateAnalysis } from "../game/analysis";
import type { Direction } from "../game/types";

export const QUESTION_ID = "direction";

export const DECISION_INSTRUCTIONS = `Choose Pac-Man's next direction at the target junction.

Priority:
1. Stay alive.
2. Avoid dangerous ghosts.
3. When ghosts are frightened, eat them when reasonably safe.
4. Use power pellets when useful for survival.
5. Collect pellets efficiently.
6. Avoid dead ends and unnecessary reversals unless they are safer.

Use only the supplied game state and candidate facts. Choose exactly one legal direction.`;

export function buildCriteria(
  candidates: Partial<Record<Direction, CandidateAnalysis>>,
  legalDirections: readonly Direction[],
): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const direction of legalDirections) {
    const candidate = candidates[direction];
    if (!candidate) continue;
    criteria[direction] = candidateText(direction, candidate);
  }
  return criteria;
}
