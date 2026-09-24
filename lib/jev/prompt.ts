/**
 * The question as the server sees it.
 *
 * This module knows no game. It is handed the game's own system prompt, its
 * legal actions and its fact table, and turns the table into the per-action
 * criteria the Choice question expects.
 */

import type { ActionId, FactRow } from "../agent/types";

/** The one question in the payload; the answer comes back keyed by it. */
export const QUESTION_ID = "action";

/**
 * Flatten the fact table into one block of text per action.
 *
 * This is the *only* place the table becomes prose, and it is the same table the
 * right-hand panel renders — so the reader and the model are looking at one
 * object rather than at two renderings that can drift apart. Every row is
 * emitted for every action; a missing value would become a silent gap in the
 * prompt, so it is written as an em dash instead.
 */
export function buildCriteria(facts: readonly FactRow[], actions: readonly ActionId[]): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const action of actions) {
    criteria[action] = facts.map((row) => `${row.modelLabel}: ${row.values[action] ?? "—"}`).join("\n");
  }
  return criteria;
}
