"use client";

/**
 * 选哪条模型目录项 —— 游戏页与导航首页共用同一份选择。
 *
 * 它从 `use-game-session.ts` 里抽出来，因为导航首页也要摆同一个控件（设计规范 §2.5 的
 * 「模型选择」），而首页没有「一局」可言、拿不到 `useGameSession`。抽出来真正的收益是
 * **键与那条「存的 id 不见了」的规则只有一份**：写两遍的话，环境里删掉一条模型线时，
 * 两处会表现不一样 —— 一处退回默认，另一处继续拿着一个服务端不认识的 id 提问。
 *
 * 「换模型要重开一局」**不在这里**：那是「一局」的性质，属于 `useGameSession`。
 * 这个 hook 只管「选了什么」，并且把它记住。
 */

import { useCallback, useEffect, useState } from "react";

import type { ModelCatalogue } from "@/lib/jev/models";

/**
 * 选中的条目。机台级偏好而不是某一局的：导航首页选的那条，就是下一局用的那条。
 * 键前缀与 `jev:sound` / `jev:crt` 一致。
 */
export const MODEL_STORAGE_KEY = "jev:model";

export interface ModelChoice {
  /** 模型目录；null = 还没拿到（请求在飞或失败）。 */
  catalogue: ModelCatalogue | null;
  /** 选中的条目 id；null = 用服务端默认。 */
  modelId: string | null;
  /** 选中一条，并记住它。**不负责重开一局** —— 谁需要谁自己调。 */
  choose(id: string): void;
}

export function useModelCatalogue(): ModelChoice {
  const [catalogue, setCatalogue] = useState<ModelCatalogue | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 存储里的选择先落地：它不依赖网络，晚一步设的话首屏会先显示默认那条。
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored) setModelId(stored);

    void fetch("/api/models", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ModelCatalogue>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setCatalogue(data);
        // 存的 id 可能已经从目录里消失（那条线被从环境里删了）。退回默认，
        // 而不是继续拿着一个服务端不认识的 id 提问。
        if (stored && !data.models.some((entry) => entry.id === stored)) {
          setModelId(null);
          window.localStorage.removeItem(MODEL_STORAGE_KEY);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback((id: string) => {
    setModelId(id);
    window.localStorage.setItem(MODEL_STORAGE_KEY, id);
  }, []);

  return { catalogue, modelId, choose };
}
