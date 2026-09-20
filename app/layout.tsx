import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jev Plays Pac-Man",
  description:
    "TypeSafe's Jev (a System One model) plays Pac-Man in real time from structured game state: no screenshots, no fine-tuning, no retraining.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
