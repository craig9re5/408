import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "408 学习目录",
  description: "记录数据结构、计算机组成原理和操作系统各小节的学习与复习进度。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
