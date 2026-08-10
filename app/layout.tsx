import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "学习进度",
  description: "记录数据结构、计算机组成原理、操作系统和计算机网络各小节的学习与复习进度。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
