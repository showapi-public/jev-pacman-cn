"use client";

import { GameNavCard } from "@/components/shell/GameNavCard";
import { ModelPicker } from "@/components/shell/ModelPicker";
import { GAME_META } from "@/lib/games/registry";
import { useModelCatalogue } from "@/lib/use-model-catalogue";

/**
 * 游戏导航首页（设计规范 §2.5）。
 *
 * 它**不复用**锁高度的 `.app-shell`：目录页不是机台，内容多长页面就多长，
 * 但 §2.2 的不变式照旧 —— 全页只有一层滚动条，那一层是页面自己，页内不放滚动容器。
 * 这里也没有「切换游戏」：它本来就在列游戏。
 *
 * 模型选择与游戏页共用同一个 hook（`useModelCatalogue`）与同一个键（`jev:model`）——
 * 在这里选的那条，就是走进任何一台机台时的默认项。`disabled` 恒为 `false`：
 * 首页没有「非模型玩家」可言，没有该变灰的场景。
 */
export function NavHome() {
  const { catalogue, modelId, choose } = useModelCatalogue();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-kpi font-[590] tracking-[-0.011em] text-fg">游戏台</h1>
        <p className="m-0 max-w-[64ch] text-body leading-relaxed text-fg-2">
          TypeSafe System One · 输入结构化状态，输出一个合法动作 · 无需微调，不看截图。
          选一个游戏开始：每个游戏一台机台，右边是同一块模型仪表盘。
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 pt-1">
          <ModelPicker catalogue={catalogue} value={modelId} onChange={choose} disabled={false} />
          <span className="text-micro text-fg-3">这里选的模型是所有游戏共用的默认项。</span>
        </div>
      </header>

      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[900px]:grid-cols-2">
        {GAME_META.map((meta) => (
          <li key={meta.id} className="min-w-0">
            <GameNavCard meta={meta} />
          </li>
        ))}
      </ul>
    </div>
  );
}
