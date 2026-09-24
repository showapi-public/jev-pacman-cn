/**
 * The fact table: one shared metric per row, one value per legal action.
 *
 * This replaced a sentence-per-candidate `criteria` block. The reason is the
 * right-hand panel: it renders *these rows*, and the server flattens *these same
 * rows* into the text the model is shown. Reader and model cannot drift apart,
 * because there is only one object.
 *
 * Two labels per row on purpose: `label` is the Chinese table header, `modelLabel`
 * is the English one that goes into the prompt, and `values` is shared verbatim —
 * so the numbers on screen are the numbers the model read.
 *
 * Every row must carry a value for every legal action: a missing key would show
 * as an em dash in the table and a silent gap in the prompt.
 */

import type { ActionId, FactRow } from "../types";
import type { CandidateAnalysis } from "./analysis";
import type { Direction } from "./types";

/** Tiles as the model should read them: "3 tiles away", or whatever "missing" means here. */
function tilesAway(count: number | null, whenMissing: string): string {
  if (count === null) return whenMissing;
  return `${count} tile${count === 1 ? "" : "s"} away`;
}

export function buildFacts(
  actions: readonly Direction[],
  candidates: Record<Direction, CandidateAnalysis>,
): FactRow[] {
  const row = (
    label: string,
    modelLabel: string,
    value: (candidate: CandidateAnalysis) => string,
  ): FactRow => {
    const values: Record<ActionId, string> = {};
    for (const action of actions) values[action] = value(candidates[action]);
    return { label, modelLabel, values };
  };

  return [
    row("最近豆子", "Nearest pellet", (c) => tilesAway(c.nearestPelletDistance, "unreachable")),
    row("6 格内豆子", "Pellets within 6 tiles", (c) => `${c.pelletsWithin6Tiles}`),
    row("最近能量豆", "Nearest power pellet", (c) => tilesAway(c.nearestPowerPelletDistance, "unreachable")),
    row("最近危险幽灵", "Nearest dangerous ghost", (c) => tilesAway(c.nearestDangerousGhostDistance, "none")),
    row("可吃幽灵", "Edible ghost", (c) => tilesAway(c.nearestFrightenedGhostDistance, "none")),
    row("可走空间", "Reachable area", (c) => `${c.reachableArea} tiles, ${c.reachableSafeArea} clear of danger`),
    row("死路", "Dead end", (c) => (c.deadEnd ? `yes, ${c.deadEndDepth ?? 1} tile deep` : "no")),
    row("朝向", "Heading", (c) =>
      c.continuesForward ? "keeps heading" : c.reversesDirection ? "reverses" : "turns",
    ),
  ];
}
