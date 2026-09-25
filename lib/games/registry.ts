/**
 * 游戏注册表。
 *
 * **只存元数据，没有泛型** —— 所以导航首页、头部切换器与 `generateStaticParams`
 * 都能直接 import 它，不必碰任何具体游戏的状态类型，也不会因此把引擎拖进包里。
 *
 * 真正把「引擎 + UI」缝起来的那张表在 `components/games/pages.tsx`（它必须知道泛型）。
 * 于是「新增一个游戏」= 加一个目录 + 在这里登记一条 + 在那边登记一条。
 */

import { PACMAN_META } from "./pacman/meta";
import { SNAKE_META } from "./snake/meta";
import type { GameMeta } from "./types";

/** 导航页与路由表的顺序就是这里的顺序。 */
export const GAME_META: readonly GameMeta[] = [PACMAN_META, SNAKE_META];

export function getGameMeta(id: string): GameMeta | undefined {
  return GAME_META.find((meta) => meta.id === id);
}
