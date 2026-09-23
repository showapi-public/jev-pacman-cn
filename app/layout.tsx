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

export const metadata: Metadata = {
  title: "Jev 玩吃豆人",
  description:
    "TypeSafe 的 Jev（System One 模型）依据结构化游戏状态实时游玩吃豆人：每个路口做一次选择，不看截图，无需微调。",
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
