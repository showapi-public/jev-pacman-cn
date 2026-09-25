"use client";

import type { CSSProperties, ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The machine: one header, then two columns that scroll inside themselves.
 *
 * The layout is fixed to the viewport, and that is the whole point of this
 * component — a 52px header plus a two-column grid whose overflow is owned by
 * the columns, so **the page never grows a scrollbar of its own**. Each game
 * fills the two columns; none of them gets to re-decide that.
 *
 * `--self` is hung here for the same reason. The run's own colour is a property
 * of the machine the game is loaded into, so one inline style at the outermost
 * element makes every `bg-self` / `text-self` / `border-self` below it follow the
 * game — see `docs/design-system.md` §4.2.
 */

/** What the machine is, in one line. Games rarely override it: it is about the model. */
const DEFAULT_SUBTITLE = "TypeSafe System One · 输入结构化状态，输出一个合法动作 · 无需微调，不看截图";

export interface AppShellProps {
  /** 本局自身色，CSS 变量引用（如 `"var(--pacman)"`），挂到外壳的 `--self`。 */
  selfColor: string;
  /** 头部 H1。 */
  title: ReactNode;
  /** H1 下面那行小字。缺省是这台机器的一句话说明。 */
  subtitle?: ReactNode;
  /** 头部右侧：状态胶囊与主操作按钮。 */
  status: ReactNode;
  /** 两栏的内容：左栏（舞台 + 控制条）与右栏（决策台）。 */
  children: ReactNode;
}

export function AppShell({ selfColor, title, subtitle, status, children }: AppShellProps) {
  return (
    <div className="app-shell" style={{ "--self": selfColor } as CSSProperties}>
      <a className="skip-link" href="#stage">
        跳到游戏区域
      </a>

      <TooltipProvider delayDuration={180} skipDelayDuration={400}>
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-subtle px-5">
          <div className="flex min-w-0 items-center gap-3">
            {/* 这台机器的主角，用本局自身色 —— 换游戏只换 `--self`。 */}
            <span
              aria-hidden="true"
              className="size-[22px] shrink-0 rounded-full bg-self [clip-path:polygon(100%_24%,52%_50%,100%_76%,100%_100%,0_100%,0_0,100%_0)]"
            />
            <div className="flex min-w-0 flex-col">
              <h1 className="anim-flicker m-0 text-title font-[590] tracking-[-0.011em] text-fg">{title}</h1>
              <p className="m-0 truncate text-micro text-fg-3">{subtitle ?? DEFAULT_SUBTITLE}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">{status}</div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(430px,0.95fr)] min-[900px]:overflow-hidden">
          {children}
        </main>
      </TooltipProvider>
    </div>
  );
}
