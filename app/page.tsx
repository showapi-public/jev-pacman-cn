import { notFound, redirect } from "next/navigation";

import { GAME_META } from "@/lib/games/registry";

/**
 * The root path.
 *
 * With exactly one game registered, `/` has nothing to choose between, so it
 * hands the reader straight to that game with a 302 — a navigation page listing
 * a single card would be a step with no information in it.
 *
 * When a second game lands, this becomes the navigation page instead (one
 * redirect condition to delete, and the card list to add). The rule is written
 * as a test on the registry so neither branch can rot: it never hard-codes
 * `"pacman"`.
 */
export default function RootPage() {
  const [first] = GAME_META;
  if (!first) notFound();
  if (GAME_META.length > 1) notFound();
  redirect(`/${first.id}`);
}
