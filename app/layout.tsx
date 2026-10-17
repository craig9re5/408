import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "@fontsource-variable/noto-serif-sc";
import "./globals.css";
import "./journal.css";
import "./sprint.css";
import "./touch.css";
import "./schedule.css";
import "./paper-netdisk.css";
import "./sprint-mobile.css";
import "./progress-mobile.css";
import "./mobile-density.css";
import "./tablet.css";

export const metadata: Metadata = {
  title: "学习进度",
  description: "记录数学与 408 各科目章节的学习、复习和计划进度。",
  icons: {
    icon: [{ url: "/pku-logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/pku-logo.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "学习进度",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2efe7",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
