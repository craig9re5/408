import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "学习进度",
  description: "记录数学与 408 各科目章节的学习、复习和计划进度。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
