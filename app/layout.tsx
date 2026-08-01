import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "408 Atlas｜一周操作系统学习计划",
  description: "把 408 操作系统的章节主线、难度、重点和七天时间表放在同一张学习地图里。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
