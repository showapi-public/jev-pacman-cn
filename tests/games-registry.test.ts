import { describe, expect, it } from "vitest";

import { GAME_PAGE_IDS } from "@/components/games/page-ids";
import { GAME_META, getGameMeta } from "@/lib/games/registry";
import { PLAY_MODES } from "@/lib/ui";

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

  it("四个玩家各自的说明都给了", () => {
    // `modeHints` 的键在契约里只能写成 `string`（`GameMeta` 住在叶子模块，不能
    // import `lib/ui` 的 `PlayMode`，否则成环）。这条测试就是那个类型放松的补偿：
    // 它把「键必须覆盖 `PLAY_MODES` 的四个值」钉死在测试里，缺一个就红。
    for (const meta of GAME_META) {
      for (const mode of PLAY_MODES) {
        const hint = meta.modeHints[mode];
        expect(hint, `${meta.id} 缺 ${mode} 的说明`).toBeTruthy();
        expect(hint.trim(), `${meta.id} 的 ${mode} 说明`).toBe(hint);
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

/**
 * 两张表必须**逐条对齐**。
 *
 * 它们分开是有理由的：`GAME_META` 只有元数据、无泛型，所以导航页与路由表能直接 import 它，
 * 不必因此把引擎拖进包里；页面表必须知道泛型，所以它住在组件侧。代价是「新增一个游戏」
 * 要登记两次 —— 这条测试就是把那两次登记绑在一起的那个结：漏了 A 表，路由会 404；
 * 漏了 B 表，路由会渲染出一个空白壳。
 *
 * 断言的是 `GAME_PAGE_IDS` 而**不是** `GAME_PAGES` 本身：后者会拖进整棵页面组件树，
 * 在这个无 DOM 的 node 环境里会把 worker 直接打挂（实测 `SIGTERM`）。清单与那份组件表
 * 之间由编译器绑着（`Record<GamePageId, ComponentType>`），所以这里比 id 就够了。
 */
describe("游戏页面表", () => {
  it("每个注册的 id 都有实现，也没有多出来的实现", () => {
    // 断言「相等」而不是「包含」：多出来的那条实现不可达（`generateStaticParams` 只列
    // `GAME_META`），留着只会让人以为它上线了。
    expect([...GAME_PAGE_IDS].sort()).toEqual(GAME_META.map((meta) => meta.id).sort());
  });

  it("清单本身不重复", () => {
    // 空转与重复都要挡住：重复的话上面的排序比较仍可能通过，但键只实现了一个。
    expect(new Set(GAME_PAGE_IDS).size).toBe(GAME_PAGE_IDS.length);
    expect(GAME_PAGE_IDS.length).toBeGreaterThan(0);
  });
});
