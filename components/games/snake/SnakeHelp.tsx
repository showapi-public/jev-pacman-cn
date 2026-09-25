"use client";

import * as React from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * 蛇这一半的帮助：第一次来的人真正会问的三件事 —— 决策是怎么产生的、动作盘怎么读、
 * 右边那些读数是什么 —— 然后它就退场。
 *
 * 它住在蛇的目录里，因为这里每一句都是在说**这块盘面**：一格 500 毫秒、不能掉头、
 * 尾巴让出的那一格不算咬到自己。外壳的弹层框架是共用的，这些字不是。
 */

const PIECES = [
  { piece: "head", name: "蛇头", note: "受你驾驶或由所选玩家决定方向；两眼指向它正在走的方向" },
  { piece: "body", name: "蛇身", note: "吃到食物后每走一步长一节，共长 5 节" },
  { piece: "food", name: "食物", note: "吃到就变长。脉动是提示它还在；系统设置里关掉动画时它就不动" },
] as const;

/** 画布上的调色板，按名字列。镜像 `lib/games/snake/render.ts` 里的字面量。 */
const PIECE_COLOR: Record<(typeof PIECES)[number]["piece"], string> = {
  head: "var(--snake-head)",
  body: "var(--snake-body)",
  food: "var(--snake-food)",
};

export function SnakeHelp({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogTitle>这块面板在看什么</DialogTitle>
        <DialogDescription>
          <section className="flex flex-col gap-1.5">
            <h3 className="label m-0 label-strong">决策是怎么产生的</h3>
            <p className="m-0">
              蛇每隔 500 毫秒才走一格（速度倍率只改这个时钟的快慢）。
              <b className="font-[510] text-fg">每一步开始前</b>
              系统都会问一次 Jev 该往哪走，而且只问它合法可走的方向 —— 立刻掉头不算合法。迟到的回答会被丢弃；
              任何不是 Jev 给出的选择，都会在记录里标记为 <code className="num">FALLBACK</code>{" "}
              并注明用了哪条兜底规则。Jev 看不到画面，只拿到结构化的数字。
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="label m-0 label-strong">动作盘</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              <li>
                <b className="font-[510] text-fg">有底框的箭头</b>：这个方向可以走。
              </li>
              <li>
                <b className="font-[510] text-self">自身色</b>：Jev 选的方向；箭头脚下的细条是它的概率。
              </li>
              <li>
                <b className="font-[510] text-warn">黄色警示</b>：这个方向来自兜底规则，不是 Jev 的答案。
              </li>
              <li>
                <b className="font-[510] text-fg-3">暗淡无框的箭头</b>：走不通，或者会立刻掉头。
              </li>
              <li>中心的圆点指向蛇正在走的方向；提问期间它会缓慢呼吸。</li>
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
            <h3 className="label m-0 label-strong">盘面上的颜色</h3>
            <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1">
              {PIECES.map((piece) => (
                <React.Fragment key={piece.piece}>
                  <dt className="flex items-center gap-1.5 text-fg-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-xs"
                      style={{ backgroundColor: PIECE_COLOR[piece.piece] }}
                    />
                    {piece.name}
                  </dt>
                  <dd className="m-0 text-fg-3">{piece.note}</dd>
                </React.Fragment>
              ))}
            </dl>
            <p className="m-0 text-fg-3">
              撞到盘边时蛇头会变红，画面停在这一格 —— 那是这一局的最后一格，不是它摔出去之后的样子。
            </p>
          </section>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
