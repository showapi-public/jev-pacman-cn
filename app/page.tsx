import { notFound, redirect } from "next/navigation";

import { NavHome } from "@/components/shell/NavHome";
import { GAME_META } from "@/lib/games/registry";

/**
 * The root path.
 *
 * **Exactly one game** has nothing to choose between, so `/` hands the reader
 * straight to that game with a redirect — a navigation page listing a single
 * card would be a step with no information in it. With two or more, it is the
 * navigation page: one card per game, plus the model picker every cabinet starts
 * from (`jev:model` is shared with the game pages).
 *
 * Both branches read the same table and neither hard-codes an id, so adding a
 * third game changes nothing here.
 */
export default function RootPage() {
  const [first] = GAME_META;
  if (!first) notFound();
  if (GAME_META.length === 1) redirect(`/${first.id}`);
  return <NavHome />;
}
