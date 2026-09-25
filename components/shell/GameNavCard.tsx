import Link from "next/link";

import type { GameMeta } from "@/lib/games/types";

/**
 * 导航页的一张游戏卡：**整块是一个 `<Link>`**，不是「一张卡 + 卡里一个链接」。
 *
 * 设计规范 §2.5：卡内三行（名称 / 标语 / 决策形态一句话），左侧 2px 标识条用该游戏的
 * 自身色。**颜色不是唯一信号** —— 自身色只出现在那条 2px 的条上，游戏名是可读文字，
 * 所以色弱与单色屏都照样能分辨两个游戏。
 *
 * 它是服务端可渲染的（没有状态、没有事件），所以导航页的静态部分可以被预渲染。
 */
export function GameNavCard({ meta }: { meta: GameMeta }) {
  return (
    <Link
      href={`/${meta.id}`}
      title={`进入 ${meta.name}`}
      className={[
        "flex min-w-0 items-stretch gap-3 rounded-lg border border-line bg-panel p-4",
        "transition-[border-color,background-color] duration-[var(--dur-fast)] ease-swift",
        "hover:border-line-strong hover:bg-elevated focus-visible:focus-ring",
      ].join(" ")}
    >
      <span aria-hidden="true" className="w-0.5 shrink-0 rounded-pill" style={{ backgroundColor: meta.selfColor }} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-title font-[590] tracking-[-0.011em] text-fg">{meta.name}</span>
        <span className="text-body text-fg-2">{meta.tagline}</span>
        <span className="text-micro text-fg-3">{meta.decisionShape}</span>
      </span>
    </Link>
  );
}
