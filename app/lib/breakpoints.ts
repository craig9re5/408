/**
 * 全站响应式断点（唯一真源）。
 * CSS 无法直接引用变量做媒体查询，样式表中统一使用同一组数值的范围语法：
 *   (width <= N px) 表示“N 及以下”，(width > N px) 表示其补集。
 * 修改断点时请同步 globals.css 顶部注释与所有样式表。
 */
export const BREAKPOINTS = {
  /** 小屏手机（iPhone SE / mini 等） */
  xs: 375,
  /** 常规手机竖屏的紧凑排版 */
  sm: 480,
  /** 手机布局上限：顶部标签导航、手机卡片 */
  md: 600,
  /** 平板竖屏上限 */
  lg: 768,
  /** 侧边栏收起上限：≤900px 使用顶部导航 */
  xl: 900,
  /** 窄桌面上限：>1120px 为完整桌面排版 */
  xxl: 1120,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** 生成 “N 及以下” 的媒体查询字符串，供 matchMedia 使用。 */
export function maxWidthQuery(name: BreakpointName): string {
  return `(max-width: ${BREAKPOINTS[name]}px)`;
}

/** 生成 “大于 N” 的媒体查询字符串，与 maxWidthQuery 互补。 */
export function aboveQuery(name: BreakpointName): string {
  return `(min-width: ${BREAKPOINTS[name] + 1}px)`;
}
