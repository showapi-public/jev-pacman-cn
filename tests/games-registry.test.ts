import { describe, expect, it } from "vitest";

import { GAME_META, getGameMeta } from "@/lib/games/registry";

/**
 * 注册表的不变式。导航首页、路由表与头部切换器都按这些假设写，
 * 所以每加一个游戏都要在这里过一遍 —— 这里的断言是自动化的，别靠人肉复查。
 */
describe("游戏注册表", () => {
  it("至少注册了一个游戏", () => {
    // 空表会让下面所有循环变成空转，测试「通过」但什么也没验。
    expect(GAME_META.length).toBeGreaterThan(0);
  });

  it("id 唯一", () => {
    const ids = GAME_META.map((meta) => meta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id 是 URL 安全的路径段", () => {
    for (const meta of GAME_META) {
      // 它会成为 `/pacman` 这样的路由段，也是 `POST /api/decide` 的 game 字段。
      expect(meta.id, `游戏 ${meta.id} 的 id`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("展示字段齐全且非空", () => {
    for (const meta of GAME_META) {
      // `actor` / `place` 是右栏共用的两个名词（「当{actor}抵达{place}时」）；共用面板
      // 一条文案都不能自己写游戏名，所以它们必须每个游戏都给，且不能是空白。
      for (const field of ["name", "tagline", "decisionShape", "actor", "place"] as const) {
        expect(meta[field], `${meta.id} 的 ${field}`).toBeTruthy();
        expect(meta[field].trim(), `${meta.id} 的 ${field}`).toBe(meta[field]);
      }
    }
  });

  it("自身色指向一个 CSS 变量，而不是写死的颜色", () => {
    for (const meta of GAME_META) {
      // 挂在 `--self` 上，所以必须是个变量引用；写死十六进制会让暗色主题换不掉它。
      expect(meta.selfColor, `${meta.id} 的 selfColor`).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });

  it("getGameMeta 命中已注册的 id，未知 id 得到 undefined", () => {
    for (const meta of GAME_META) {
      expect(getGameMeta(meta.id)).toBe(meta);
    }
    expect(getGameMeta("no-such-game")).toBeUndefined();
  });
});
