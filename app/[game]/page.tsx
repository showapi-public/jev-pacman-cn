import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getGamePage } from "@/components/games/pages";
import { GAME_META, getGameMeta } from "@/lib/games/registry";

/**
 * One route for every game.
 *
 * Dynamic segment + `generateStaticParams` rather than a folder per game:
 * 「新增一个游戏」becomes "add a directory and register it twice", with no page
 * file to write. An unknown segment is a 404 rather than a blank shell — the
 * registry is the whole truth about which ids exist.
 *
 * Both metadata and the body read the same two tables, so they can never
 * disagree about whether a game exists.
 */

export function generateStaticParams() {
  return GAME_META.map((meta) => ({ game: meta.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  const meta = getGameMeta(game);
  if (!meta) return { title: "未找到这个游戏" };
  return { title: `Jev 玩${meta.name}`, description: meta.tagline };
}

export default async function GameRoute({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const Page = getGamePage(game);
  if (!Page) notFound();
  return <Page />;
}
