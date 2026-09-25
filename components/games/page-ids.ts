/**
 * 「哪些 id 有页面实现」这张清单。
 *
 * 单列一个文件是有原因的：`pages.tsx` 一被 import 就会拖进整棵页面组件树，光图标库那个
 * barrel 就有三千个模块 —— 在无 DOM 的 node 测试里走那条路会把 worker 直接打挂
 * （实测 `SIGTERM`，`games-registry` 用例挂在这里）。测试只需要**清单**，不需要组件。
 *
 * 它与 `pages.tsx` 不会分叉：那边的记录类型写成 `Record<GamePageId, ComponentType>`，
 * 于是少写一个键是编译错误、多写一个键是多余属性错误。清单只管「有哪些」，
 * 「有没有实现」交给编译器看着。
 */
export const GAME_PAGE_IDS = ["pacman", "snake"] as const;

export type GamePageId = (typeof GAME_PAGE_IDS)[number];
