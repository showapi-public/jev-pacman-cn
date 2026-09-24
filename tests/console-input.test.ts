import { describe, expect, it } from "vitest";

import { orderActions } from "@/components/console/input";
import { PACMAN_VOCAB } from "@/lib/games/pacman/meta";
import type { ActionId, ActionVocab } from "@/lib/games/types";

/**
 * `orderActions` 是右栏共用的那一小段纯逻辑：动作盘、概率阶梯与「推理输入」表都靠它
 * 决定动作的展示次序。它必须住在游戏之外，所以这里用的是一个人造词表，不是吃豆人的。
 */
const VOCAB: ActionVocab = {
  order: ["B", "A"],
  label: (action: ActionId) => action,
  slot: () => null,
};

describe("orderActions", () => {
  it("按词表的展示次序排列，而不是按动作到达的次序", () => {
    expect(orderActions(VOCAB, ["A", "B"])).toEqual(["B", "A"]);
    expect(orderActions(VOCAB, ["A", "B", "C"])).toEqual(["B", "A", "C"]);
  });

  it("只保留合法动作", () => {
    expect(orderActions(VOCAB, ["A"])).toEqual(["A"]);
    expect(orderActions(VOCAB, [])).toEqual([]);
  });

  it("词表漏掉的动作补在后面，而不是被丢掉", () => {
    // 一个合法动作从动作盘、阶梯和事实表里静默消失，比多出一列没人认识的标签危险得多。
    expect(orderActions(VOCAB, ["C", "B"])).toEqual(["B", "C"]);
    expect(orderActions(VOCAB, ["C", "D"])).toEqual(["C", "D"]);
  });

  it("重复的动作只出现一次", () => {
    expect(orderActions(VOCAB, ["A", "A"])).toEqual(["A"]);
    expect(orderActions(VOCAB, ["C", "C"])).toEqual(["C"]);
  });
});

/**
 * 右栏对词表的假设。它不 import 任何游戏，所以这些假设必须在注册层被钉住 ——
 * 否则一个词表写错的游戏会在运行期表现为「少了一个键」而不是报错。
 */
describe("动作词表（以吃豆人为样本）", () => {
  it("展示次序覆盖全部四向动作，且 slot() 给得出槽位", () => {
    expect([...PACMAN_VOCAB.order].sort()).toEqual(["DOWN", "LEFT", "RIGHT", "UP"]);
    for (const action of PACMAN_VOCAB.order) {
      expect(PACMAN_VOCAB.slot(action)).toBe(action);
    }
  });

  it("标签是给人看的短词，未知动作原样透出而不是空白", () => {
    expect(PACMAN_VOCAB.label("UP")).toBe("上");
    expect(PACMAN_VOCAB.label("DOWN")).toBe("下");
    expect(PACMAN_VOCAB.label("LEFT")).toBe("左");
    expect(PACMAN_VOCAB.label("RIGHT")).toBe("右");
    // 未知动作宁可露出一个生字符串，也不要显示成空 —— 空白会读成「没有动作」。
    expect(PACMAN_VOCAB.label("SIDEWAYS")).toBe("SIDEWAYS");
  });
});
