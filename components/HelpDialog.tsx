"use client";

import * as React from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * What used to live in a footer under the board, moved to where it does not
 * cost a single pixel of layout: an overlay opened on demand.
 *
 * It answers the three questions a first-time reader actually has — how a
 * decision is made, what the colours mean, and what each register on the right
 * is showing — and then gets out of the way.
 */

const GHOSTS = [
  { piece: "pacman", name: "吃豆人", note: "受你控制或由所选玩家驾驶" },
  { piece: "blinky", name: "Blinky", note: "红色幽灵" },
  { piece: "pinky", name: "Pinky", note: "粉色幽灵" },
  { piece: "inky", name: "Inky", note: "青色幽灵" },
  { piece: "clyde", name: "Clyde", note: "橙色幽灵" },
  { piece: "frightened", name: "受惊幽灵", note: "吃到能量豆后短暂可被反吃" },
] as const;

/** The canvas's palette, by name. Mirrors the literals in lib/game/render.ts. */
const PIECE_COLOR: Record<(typeof GHOSTS)[number]["piece"], string> = {
  pacman: "var(--pacman)",
  blinky: "var(--ghost-blinky)",
  pinky: "var(--ghost-pinky)",
  inky: "var(--ghost-inky)",
  clyde: "var(--ghost-clyde)",
  frightened: "var(--ghost-frightened)",
};

export function HelpDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogTitle>这块面板在看什么</DialogTitle>
        <DialogDescription>
          <section className="flex flex-col gap-1.5">
            <h3 className="label m-0 label-strong">决策是怎么产生的</h3>
            <p className="m-0">
              吃豆人以固定 60 Hz 移动。每到路口，系统会在它抵达前三格向 Jev 提问一次，而且只问它合法可走的方向。
              迟到的回答会被丢弃；任何不是 Jev 给出的选择，都会在记录里标记为 <code className="num">FALLBACK</code>{" "}
              并注明用了哪条兜底规则。Jev 看不到截图，只拿到结构化的数字。
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="label m-0 label-strong">方向十字</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              <li>
                <b className="font-[510] text-fg">有底框的箭头</b>：这个方向可以走。
              </li>
              <li>
                <b className="font-[510] text-pacman">琥珀色</b>：Jev 选的方向；箭头脚下的细条是它的概率。
              </li>
              <li>
                <b className="font-[510] text-warn">黄色警示</b>：这个方向来自兜底规则，不是 Jev 的答案。
              </li>
              <li>
                <b className="font-[510] text-fg-3">暗淡无框的箭头</b>：走不通。
              </li>
              <li>中心的圆点指向吃豆人当前的朝向；提问期间它会缓慢呼吸。</li>
            </ul>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="label m-0 label-strong">右边另外三处读数</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              <li>
                <b className="font-[510] text-fg">概率阶梯</b>：Jev 给每个合法方向分配的权重，从大到小排。
              </li>
              <li>
                <b className="font-[510] text-fg">整局置信度</b>：随决策顺序变化的两条线 ——「自评置信度」是
                Jev 声称的把握，「选项占比」是分布里给选中方向的权重。两者长期背离，说明它在犹豫。
              </li>
              <li>
                <b className="font-[510] text-fg">执行率</b>：答案合法、及时抵达并被采纳的比例。
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="label m-0 label-strong">迷宫里的颜色</h3>
            <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1">
              {GHOSTS.map((ghost) => (
                <React.Fragment key={ghost.piece}>
                  <dt className="flex items-center gap-1.5 text-fg-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-xs"
                      style={{ backgroundColor: PIECE_COLOR[ghost.piece] }}
                    />
                    {ghost.name}
                  </dt>
                  <dd className="m-0 text-fg-3">{ghost.note}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
