/**
 * 蛇事件的人话。
 *
 * 与吃豆人同一套分工：事件长什么样只有这款游戏自己知道，所以句子跟着事件类型一起住在
 * 游戏目录里，共用的右栏只拿到一串已经说好的字符串。
 */

import type { SnakeEvent } from "./types";

export function describeSnakeEvent(event: SnakeEvent): string {
  switch (event.type) {
    case "FOOD_EATEN":
      return `在 (${event.cell.x}, ${event.cell.y}) 吃到食物，长度 ${event.length}`;
    case "SNAKE_DIED":
      // 两种死法要分开说：撞墙是自己把路走死，自撞是把自己关起来了。
      return event.reason === "WALL" ? "撞到盘边，游戏结束" : "咬到自己，游戏结束";
    case "BOARD_CLEARED":
      return "盘面已经没有空格，通关";
  }
}
