/**
 * 吃豆人事件的人话。
 *
 * 它原来住在 `lib/ui.ts` —— 那是个共用的模块，却要 import `PacmanEvent` 才能把一个
 * 事件说成一句中文。事件长什么样只有这款游戏自己知道，所以句子跟着事件类型一起
 * 搬到游戏目录里；`lib/ui.ts` 现在只剩真正共用的文案与格式化。
 *
 * 面板拿到的是一串已经说好的字符串（`ConsoleInput.events`），所以右栏仍然不需要
 * 知道「吃豆人事件」这个概念。
 */

import type { PacmanEvent } from "./types";

export function describePacmanEvent(event: PacmanEvent): string {
  switch (event.type) {
    case "PELLET_EATEN":
      return `在 (${event.tile.x}, ${event.tile.y}) 吃到豆子 +${event.score}`;
    case "POWER_PELLET_EATEN":
      return `在 (${event.tile.x}, ${event.tile.y}) 吃到能量豆 +${event.score}`;
    case "GHOST_EATEN":
      return `${event.ghost} 被吃掉 +${event.score}`;
    case "PACMAN_DIED":
      return `吃豆人被抓住，剩余 ${event.livesLeft} 条命`;
    case "LEVEL_CLEARED":
      return `第 ${event.level} 关通过`;
    case "FRIGHTENED_STARTED":
      return `幽灵进入受惊状态 ${(event.durationMs / 1000).toFixed(0)} 秒`;
    case "FRIGHTENED_ENDED":
      return "幽灵恢复正常";
    case "GHOST_RELEASED":
      return `${event.ghost} 离开鬼屋`;
    case "GAME_OVER":
      return "游戏结束";
  }
}
