"use client";

import { GridFour } from "@phosphor-icons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GAME_META } from "@/lib/games/registry";

/**
 * 头部的「切换游戏」。
 *
 * **游戏页独有**（设计规范 §2.1：导航首页本来就在列游戏，那里再放一个切换器，
 * 就是同一张列表出现两次）。注册的游戏不足两个时它整个不渲染 ——
 * 没有可切的目标就不占 Tab 位（设计规范 §2.5）。
 *
 * 弹层里的每一项是 `DialogClose` 包着的 `<Link>`：点下去弹层先关、路由再切 ——
 * 不包的话，弹层会跟着路由来到新游戏页上，留在那里关不掉（它不属于那个页面）。
 * 当前项用文字标出（「当前」），`aria-current` 同步给读屏器；颜色不单独表意。
 */
export function GameSwitcher({ current }: { current: string }) {
  if (GAME_META.length < 2) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换游戏" title="切换到另一个游戏">
          <GridFour aria-hidden="true" weight="bold" className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>切换游戏</DialogTitle>
        {/* `asChild` + `div`：Radix 的 Description 默认是 `<p>`，而下面是一列链接 ——
            `<p>` 里不能套 `<ul>`（React 会在 hydration 时报非法嵌套）。 */}
        <DialogDescription asChild>
          <div className="m-0 flex flex-col gap-3 text-body leading-relaxed text-fg-2">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {GAME_META.map((meta) => {
              const isCurrent = meta.id === current;
              return (
                <li key={meta.id}>
                  <DialogClose asChild>
                    <Link
                      href={`/${meta.id}`}
                      aria-current={isCurrent ? "page" : undefined}
                      title={isCurrent ? `${meta.name}（正在游玩）` : `切换到 ${meta.name}`}
                      className={[
                        "flex min-w-0 items-center gap-2.5 rounded-md border p-2.5",
                        isCurrent ? "border-line-strong bg-elevated" : "border-transparent hover:border-line hover:bg-hover",
                        "transition-[border-color,background-color] duration-[var(--dur-fast)] ease-swift",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-xs"
                        style={{ backgroundColor: meta.selfColor }}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-body text-fg">
                          {meta.name}
                          {isCurrent ? <span className="text-fg-3">（当前）</span> : null}
                        </span>
                        <span className="text-micro text-fg-3">{meta.decisionShape}</span>
                      </span>
                    </Link>
                  </DialogClose>
                </li>
              );
            })}
          </ul>
          <DialogClose asChild>
            <Link
              href="/"
              title="回到游戏列表"
              className="self-start text-micro text-fg-3 underline-offset-2 hover:text-fg hover:underline"
            >
              返回游戏导航首页
            </Link>
          </DialogClose>
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
