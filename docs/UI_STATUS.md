# UI 现状说明

本文档描述 Atlas 当前的界面约定，以代码为准。历史审计与流水记录已合并进本文并删除；新增或修改 UI 时，请同步更新这里。

---

## 1. 设计令牌

所有颜色令牌定义在 `app/globals.css` 的 `:root` 中。组件样式应引用令牌，不直接写 Tailwind 色值（如 `#2563eb`、`#10b981`）。

| 分组 | 令牌 | 用途 |
| :--- | :--- | :--- |
| 基础 | `--ink` `--ink-soft` `--muted` `--paper` `--canvas` `--line` `--line-soft` `--meta` `--meta-strong` | 文字、底色、分隔线、次要信息 |
| 侧栏 | `--sidebar` `--sidebar-soft` | 深青墨导航 |
| 主色 | `--coral` `--coral-soft` `--coral-ink` `--coral-line` | 强调、主按钮、危险操作 |
| 蓝 | `--blue` `--blue-ink` `--blue-ink-rgb` `--blue-deep` `--blue-soft` `--blue-line` | 「当前 / 进行中」、焦点环、日期编辑器 |
| 绿 | `--green` `--green-ink` `--green-rgb` `--green-soft` `--green-line` | 完成、正向状态 |
| 赭黄 | `--ochre` `--ochre-ink` `--ochre-soft` `--ochre-line` | 提醒、自定义课程 |
| 石板灰 | `--slate-ink` `--slate-soft` `--slate-line` | 中性标签、常规课程 |
| 作答状态 | `--state-correct(-ink)` `--state-partial(-ink)` `--state-wrong(-ink/-deep)` | 答题卡、热力图、正答率 |
| 课表主题 | `--theme-{408,math-intense,math-regular,english-pol,custom}-{bg,fg,line,bar}` | 课程卡片底色、文字、边框、进度条 |
| 字体 | `--serif` `--sans` | 标题衬线 / 正文无衬线 |
| 阴影 | `--shadow` | 卡片投影（目前仅少数位置使用，见第 7 节） |

课表主题配色：408 = 蓝，数学强化 = 绿，数学常规 = 石板灰，英语与政治 = 珊瑚，自定义 = 赭黄。

## 2. 字体与字号

- 标题字体为 **Noto Serif SC Variable**，通过 `@fontsource-variable/noto-serif-sc` 自托管，在 `app/layout.tsx` 中引入，构建后按 unicode-range 拆成多个 woff2 分片，按需加载，不再依赖 Google Fonts。
- 正文使用系统无衬线字体栈（`--sans`）。
- **字号下限 10px**：任何 CSS 规则都不得低于 10px。紧凑课表的时间刻度只显示开始时间，并使用 `tabular-nums`。
- 触屏输入框保持 16px，避免 iOS 自动放大。

## 3. 断点

六档断点，唯一真源是 `app/lib/breakpoints.ts`，`app/globals.css` 顶部有对应说明。CSS 一律使用范围语法：

| 名称 | 数值 | 含义 |
| :--- | :--- | :--- |
| `xs` | 375 | 小屏手机 |
| `sm` | 480 | 手机紧凑排版 |
| `md` | 600 | 手机布局上限 |
| `lg` | 768 | 平板竖屏上限 |
| `xl` | 900 | 侧栏收起上限 |
| `xxl` | 1120 | 窄桌面上限 |

写法示例：`(width <= 600px)`、`(width > 900px)`、`(600px < width <= 900px)`。TS 中使用 `maxWidthQuery("md")` / `aboveQuery("md")` 生成 `matchMedia` 查询，不要手写数字。

## 4. 布局分档

| 宽度 | 导航 | 说明 |
| :--- | :--- | :--- |
| > 900px | 左侧深色侧栏 + 页面标题 | 完整桌面布局；> 1120px 时冲刺页科目切换器固定 420px |
| 600–900px | 顶部 4 个标签：进度 / 冲刺 / 今日 / 课表；设置在「⋯」菜单 | 平板样式集中在 `app/tablet.css`（最后加载）：页面标题视觉隐藏但保留给读屏；导航 `max-width: 380px`；内容区左右留白 24px；首页 hero 为 1.5fr / 1fr 双列 |
| ≤ 600px | 顶部 3 个标签：进度 / 冲刺 / 今日；课表与设置在「⋯」菜单 | 手机紧凑布局，见 `progress-mobile.css`、`sprint-mobile.css`、`mobile-density.css` |

「⋯」按钮上的小圆点同时显示同步状态（已同步 / 同步中 / 离线 / 失败）。

### 样式文件加载顺序

`layout.tsx` 依次引入：KaTeX → 字体 → `globals.css` → `journal.css` → `sprint.css` → `touch.css` → `schedule.css` → `paper-netdisk.css` → `sprint-mobile.css` → `progress-mobile.css` → `mobile-density.css` → `tablet.css`。后加载的同优先级规则会覆盖前者，平板样式因此放在最后。`analytics.css` 不在全局引入，由 `AnalyticsActivity.tsx` 自己引入，随懒加载的分析页一起拆包。

## 5. 图标

- 统一使用 `app/components/common/Icon.tsx`：`<Icon name="pen" />`。图标为 24×24 线性 SVG，颜色继承 `currentColor`，默认 `aria-hidden`。
- 现有图标：`x` `check` `chevron-down` `chevron-up` `arrow-right` `arrow-down` `arrow-up` `arrow-up-right` `pen` `target` `coffee` `hourglass` `monitor` `smartphone` `star`（支持 `filled`）`alert` `link` `square-check` `quote` `table` `maximize` `note` `map-pin` `book-open` `library` `globe` `lightbulb` `sparkle`。
- 界面中不使用 emoji 或 Unicode 符号充当图标，提示文案中也不加 emoji。CSS 伪元素需要图标时，使用 `mask` + 内联 SVG。
- 导航图标（`MobileNavIcon` / `navigation-symbol--*`）是单独的一套，保持不变。

## 6. 各页面现状

### 学习进度
- 顶部切换 408 / 数学，再切换科目；hero 区为当前书目进度 + 本周节奏。
- 目录筛选：全部 / 未学 / 未复习 / 逾期；支持编辑模式下批量排期。
- 手机端隐藏本周节奏区，目录筛选使用紧凑下拉。

### 套卷冲刺
- 科目：408 / 数学 / 英语 / 政治；筛选：试卷类型、完成状态，真题可按年份排序。
- 只有卡片视图（`sprint-bento-grid`），没有表格 / 分屏视图。手机端卡片默认折叠为「标题 + 分数」摘要行，筛选收进折叠面板。
- 答题卡「一键清零」有行内二次确认。
- 顶部有试卷云盘入口。

### 今日
- 执行看板：左侧当天课表时间线（约 69%），右侧「今日任务」与「逾期任务」。
- 空任务面板在标题旁显示真实文本节点「暂无安排 / 无逾期」（`.task-panel-empty-note`），不再用 CSS `content` 写文案，便于读屏与翻译。
- 学习日志：唯一的深色主按钮是「写今日记录」；时间流中的「写一条」和空状态的「记录第一条」都是文字按钮（`.journal-action-btn--text`）。
- 日志筛选 7 项：全部 / 重点 / 无关联 / 有关联 / 408 / 数学 / 已发布。手机端（≤600px）用四列网格排成两行，避免第 7 项被挤出屏幕且没有滚动提示。

### 复习课表
- 横向时间轴 / 竖向周课表两种布局，可切换周次，支持重置默认课表。
- 「当前课程」使用蓝色令牌；课程配色见第 1 节。

### 设置
- 卡片顺序：日程看板 → 数据管理与本地备份 → **危险操作** → 账号与登录 → 关于。
- 「清空套卷完成记录」位于独立的危险操作卡片（`settings-card--danger`），按钮文案为「清空记录」，使用珊瑚色令牌。
- 退出登录只在「账号与登录」卡片中提供，顶栏不再放退出按钮。

### 数据分析
- 由 `app/feature-flags.ts` 的 `SHOW_DATA_ANALYSIS = false` 关闭，所有屏幕都不显示入口。
- 组件通过 `lazy()` 加载，样式随组件拆包；重新开启时不会影响首屏体积。

## 7. 已知遗留（暂未处理）

| 项目 | 说明 |
| :--- | :--- |
| 死 CSS | 部分类名已无 TSX 引用，例如 `globals.css` 的 `.placeholder-page` `.today-sections` `.university-logo`，`sprint.css` 的 `.mini-subj-chip` `.paper-q-pill`，`journal.css` 的 `.journal-editor-toolbar` `.blog-status-badge`，`schedule.css` 的 `.schedule-week-picker` `.idle-badge` `.schedule-icon-btn`，`analytics.css` 的 `.forecast-insight-banner` 等。删除前注意排除模板字符串拼接的类名（如 `.timetable-card--${theme}`、`.sync-note--${cls}`）和 KaTeX 输出的类名。 |
| 阴影令牌 | `--shadow` 只在少数位置使用，其余 `box-shadow` 仍是字面量。 |
| 触屏热力图 | 试卷卡片热力图的逐题信息只在 `title` 中，触屏无法查看，需通过「打开答题卡」进入。 |
| 中性色字面量 | `sprint-mobile.css` 与 `progress-mobile.css` 仍有较多暖灰/青灰字面量（如 `#e1e7e4`、`#65777a`、`#426f79`），未纳入令牌；`mobile-density.css` 已使用 `--mobile-surface` / `--mobile-border`，可参照迁移。 |

## 8. 已裁定不改

以下事项已经讨论并决定保持现状，不再作为问题提出：

- **答题卡「一键全对」不加确认**：保持一键直达。
- **手机端试卷卡片的完成态**：不额外增加视觉标记。
- **桌面今日页主次**：保持左侧课表、右侧任务的现有比例与顺序。
- **模拟卷进度分母固定为 30**：产品定值。
- **冲刺页不显示考试倒计时**：有意降低焦虑感；`examDate` 仍被侧栏和设置页使用，不要删除。
- **408 分科使用 DS / CO / OS / CN 英文缩写**：卡片与答题卡同源（`bentoChoiceGroups`）。
- **试卷卡片的交互密度**：维持现状。
- 排序控件位置、分数输入回车行为、英语与政治主观题的结构分值：维持现状。
