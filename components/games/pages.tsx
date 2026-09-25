import type { ComponentType } from "react";

import { PacmanPage } from "./pacman/PacmanPage";
import type { GamePageId } from "./page-ids";
import { SnakePage } from "./snake/SnakePage";

/**
 * ★ 引擎与 UI 缝合处 —— 全项目唯一把一款游戏的引擎接到页面上的地方。
 *
 * 这里的每一条右边都是一个自洽的页面组件：它自己 `useGameSession(那款游戏)`，
 * 自己决定六格读数是什么、帮助弹层说什么。所以这张表**不需要泛型**，`app/[game]`
 * 只要按 id 取一个组件渲染就行 —— 换游戏不会牵动路由，加游戏也不会牵动别的游戏。
 *
 * 这个文件**不能加 `"use client"`**：它被服务端组件 `app/[game]/page.tsx` import，
 * 需要真的在服务端求值出一张表。标识成客户端模块的话，导出的就是一个客户端引用，
 * 服务端调 `GAME_PAGES[id]` 会拿到代理而不是组件。右边的页面组件自己带
 * `"use client"`，所以它们被 import 进来时会正确地成为客户端边界。
 *
 * 另一份表在 `lib/games/registry.ts`（只有元数据、无组件）—— 导航页、头部切换器与
 * `generateStaticParams` 只要元数据，不该因此把引擎拖进包里。于是
 * 「新增一个游戏 = 加一个目录 + 在两张表里各登记一条」。
 *
 * 键写成 `Record<GamePageId, …>`：清单在 `page-ids.ts`，两边由编译器绑着，
 * 少一条是编译错误、多一条是多余属性错误。**注意别把这份表 import 进 node 测试** ——
 * 它会拖进整棵组件树（见 `page-ids.ts` 的说明）。
 */
export const GAME_PAGES: Readonly<Record<GamePageId, ComponentType>> = {
  pacman: PacmanPage,
  snake: SnakePage,
};

export function getGamePage(id: string): ComponentType | undefined {
  /*
   * `Object.hasOwn` 而不是直接 `GAME_PAGES[id]`：后者会沿原型链取到 `toString`、
   * `constructor` 这些函数，于是 `/toString` 会被当成一个页面渲染出来而不是 404。
   * 只有乱敲地址段才会撞上，但那时用户看到的应该是一个 404，而不是一段莫名其妙的内容。
   */
  if (!Object.hasOwn(GAME_PAGES, id)) return undefined;
  return GAME_PAGES[id as GamePageId];
}
