"use client";

import { useEffect, useState } from "react";

/**
 * 历史最长长度，存在这台机器上。
 *
 * 上游（patorjk/JavaScript-Snake）的高分也是存在 `localStorage` 里的，但它记在渲染层 ——
 * 这里照做：**引擎不碰存储**。引擎是纯的，它连 `window` 都不该知道，所以「历史最长」
 * 是 UI 层的一件事。
 *
 * 每长一节就写一次，所以看到的是这一局**正在**刷新记录，而不是局终才跳一下 ——
 * 上游的高分条也是这个手感。
 */
const STORAGE_KEY = "jev:snake:high-score";

/** 读不出来（没写过、被清过、值坏了）一律当 0：这不是错误，只是还没有记录。 */
function read(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * 传入这一局现在的长度，返回历史最长。
 *
 * 首次挂载之后才读存储：服务端渲染时没有 `localStorage`，读早了就是 hydration 不一致。
 * 返回 `max(best, length)` 是为了那第一帧 —— 那时存储还没读回来，而「历史最长」按定义
 * 不可能小于这一局现在的长度，所以不该先闪一个 0。
 */
export function useSnakeHighScore(length: number): number {
  const [best, setBest] = useState(0);

  useEffect(() => {
    setBest(read());
  }, []);

  useEffect(() => {
    if (length <= 0 || length <= read()) return;
    window.localStorage.setItem(STORAGE_KEY, String(length));
    setBest(length);
  }, [length]);

  return Math.max(best, length);
}
