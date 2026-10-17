import type { ReactElement } from "react";

/**
 * 全站统一线性图标（24×24 网格，1.8px 描边，继承 currentColor）。
 * 取代原先混用的 emoji 与 Unicode 符号，保证在 iOS / Android / Windows 上外观一致，
 * 不依赖系统字体是否包含对应字形。新增图标请保持同一描边风格。
 */
const ICONS = {
  "x": <path d="M18 6 6 18M6 6l12 12" />,
  "check": <path d="M20 6 9 17l-5-5" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-up": <path d="m18 15-6-6-6 6" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-down": <path d="M12 5v14M6 13l6 6 6-6" />,
  "arrow-up": <path d="M12 19V5M6 11l6-6 6 6" />,
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  "pen": <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  "target": <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  "coffee": <><path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z" /><path d="M7 2.5v2.5M11 2.5v2.5" /></>,
  "hourglass": <><path d="M5 2h14M5 22h14" /><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2" /><path d="M7 22v-4.2a2 2 0 0 1 .6-1.4L12 12l4.4 4.4a2 2 0 0 1 .6 1.4V22" /></>,
  "monitor": <><rect x="2.5" y="3.5" width="19" height="13" rx="2" /><path d="M8 21h8M12 16.5V21" /></>,
  "smartphone": <><rect x="6" y="2.5" width="12" height="19" rx="2.2" /><path d="M11 18h2" /></>,
  "star": <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  "alert": <><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4.5M12 17h.01" /></>,
  "link": <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  "square-check": <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  "quote": <><path d="M5 7h5v5c0 3-1.6 5-4.5 6" /><path d="M14 7h5v5c0 3-1.6 5-4.5 6" /></>,
  "table": <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 10h17M3.5 15h17M12 4v16" /></>,
  "maximize": <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  "note": <><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z" /><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5" /></>,
  "map-pin": <><path d="M19.5 10c0 5.5-7.5 11.5-7.5 11.5S4.5 15.5 4.5 10a7.5 7.5 0 0 1 15 0Z" /><circle cx="12" cy="10" r="2.6" /></>,
  "book-open": <><path d="M2.5 4.5h6a3.5 3.5 0 0 1 3.5 3.5v12a2.8 2.8 0 0 0-2.8-2.8H2.5Z" /><path d="M21.5 4.5h-6A3.5 3.5 0 0 0 12 8v12a2.8 2.8 0 0 1 2.8-2.8h6.7Z" /></>,
  "library": <path d="M4.5 4v16M8.5 7v13M12.5 7v13M16 6.5l4 13.5" />,
  "globe": <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  "lightbulb": <><path d="M9 18h6M10 21.5h4" /><path d="M15 14.5c.3-1.2.9-2 1.7-2.8A6 6 0 1 0 6 8c0 1.4.4 2.6 1.4 3.6.8.8 1.3 1.6 1.6 2.9" /></>,
  "sparkle": <path d="M12 3c.6 4.6 2.6 6.8 8 9-5.4 2.2-7.4 4.4-8 9-.6-4.6-2.6-6.8-8-9 5.4-2.2 7.4-4.4 8-9Z" />,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  /** 实心填充（如已标重点的星标） */
  filled?: boolean;
  className?: string;
  /** 提供时作为可访问名称；省略则视为装饰图标 */
  title?: string;
};

export function Icon({ name, filled = false, className, title }: IconProps) {
  return (
    <svg
      className={className ? `ui-icon ${className}` : "ui-icon"}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name]}
    </svg>
  );
}
