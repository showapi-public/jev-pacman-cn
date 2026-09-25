import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

// The design system's two faces: Inter for everything, JetBrains Mono for every
// number. next/font self-hosts both at build time — no runtime request, no shift.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

/**
 * The platform's metadata. The template is what makes each game's page its own
 * document title: a game sets `Jev 玩吃豆人`, and the tab reads
 * `Jev 玩吃豆人 · Jev 游戏台` — so the machine is named once, here, instead of
 * being pasted into every page's title.
 */
export const metadata: Metadata = {
  title: {
    default: "Jev 游戏台",
    template: "%s · Jev 游戏台",
  },
  description:
    "TypeSafe 的 Jev（System One 模型）依据结构化游戏状态实时游玩：每个决策点做一次选择，不看截图，无需微调。",
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
