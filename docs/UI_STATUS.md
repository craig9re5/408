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
| 阴影 | `--elevation-1/2/3` | 普通卡片与控件 / 悬浮卡片与概览 / 弹层与菜单 |

课表主题配色：408 = 蓝，数学强化 = 绿，数学常规 = 石板灰，英语与政治 = 珊瑚，自定义 = 赭黄。

## 1.5 数值阶梯

桌面与手机共用 `globals.css` 的 `:root` 数值阶梯。桌面基础样式、学习日志、套卷冲刺、课表、试卷云盘和分析页均已接入；新增样式先按用途选择令牌。

| 类别 | 令牌 | 值 / 用途 |
| :--- | :--- | :--- |
| 辅助字号 | `--text-2xs/xs/sm/md` | 10 / 11 / 12 / 13 |
| 正文与小标题 | `--text-base/lg/xl/2xl` | 14 / 16 / 18 / 22 |
| 指标数字 | `--text-3xl/4xl/5xl/6xl` | 26 / 34 / 58 / 74 |
| 圆角 | `--radius-sm/md/lg/xl/pill` | 6 / 10 / 14 / 20 / 999 |
| 间距 | `--space-1..6` | 4 / 8 / 12 / 16 / 24 / 32 |
| 动效 | `--duration-fast/base` | 120ms / 220ms |
| 缓动 | `--ease-out` / `--ease-in-out` | `cubic-bezier(.16,1,.3,1)` / `cubic-bezier(.4,0,.2,1)` |
| 阴影 | `--elevation-1/2/3` | 普通表面 / 悬浮与概览 / 弹层与菜单 |

- 桌面的主进度与本周节奏保留独立的大数字层级，正文、表格和元信息使用较小档位；不同宽度可选用不同令牌。
- 常规留白与间距按 4px 网格取值；20px、28px 和更大留白用 `calc()` 组合现有间距令牌。1–3px 的微调、图标绘制、固定侧栏偏移和安全区不强行套用容器间距。
- 容器圆角使用四档与胶囊令牌；圆形、绘制图标的微小曲率保留原几何值。
- 交互过渡统一使用两档时长与两条曲线；加载旋转、同步脉冲与错误抖动保留专用节奏。减少动态效果的系统设置仍会关闭动画与过渡。
- 普通表面投影使用三级阴影；焦点环、状态光晕、内描边、图标绘制和抽屉的方向性边缘阴影保留各自语义。
- 字体样式采用 `font-weight` / `font-size` / `line-height` / `font-family` 分项声明，方便响应式覆盖；`font: inherit` 仍用于继承父级样式。图标容器的 24px、公式的相对字号与触屏输入框的 16px 属于几何或可读性约束，保留专用值。

## 2. 字体与字号

- 标题字体为 **Noto Serif SC Variable**，通过 `@fontsource-variable/noto-serif-sc` 自托管，在 `app/layout.tsx` 中引入，构建后按 unicode-range 拆成多个 woff2 分片，按需加载，不再依赖 Google Fonts。
- 正文使用系统无衬线字体栈（`--sans`）。
- **字号下限 10px**：任何 CSS 规则都不得低于 10px。紧凑课表的时间刻度只显示开始时间，并使用 `tabular-nums`。
- 触屏输入框保持 16px，避免 iOS 自动放大。
- 手机常用操作的触控目标按 44×44 校准：设置入口、展开小节操作、日期、任务勾选、日志操作、冲刺筛选与答题卡按钮。题号保留 36px 外观，上下各扩 4px 命中区；日志筛选保留 32px 外观，上下各扩 6px，容器预留空间，左右不扩展以免相邻目标重叠。桌面密集工具栏不统一增高。
- 全站按钮按下时有 `scale(0.97)` 回弹（`prefers-reduced-motion` 下关闭）。
- 悬停样式统一限制在 `(hover: hover) and (pointer: fine)`，触屏保留按压、选中和展开反馈；键盘焦点与 ARIA 状态不受门控。
- 过渡逐项声明颜色、边框、阴影、透明度和变换等实际变化属性，不使用 `transition: all`；进度条等有意的尺寸过渡保留。
- 首次打开固定进入进度页；会话检查期间显示导航、概览和目录轮廓骨架，使用同一套纸色与圆角，避免登录表单闪现。无会话或检查失败（含 10 秒超时）后显示访问码表单；已登录直接呈现云端进度。切换冲刺/今日使用已加载数据，不额外加入等待。减少动态效果时骨架保持静态，装饰块对读屏隐藏。

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
| 600–900px | 顶部 3 个标签：进度 / 冲刺 / 今日；设置在「⋯」菜单 | 平板样式集中在 `app/tablet.css`（最后加载）：页面标题视觉隐藏但保留给读屏；导航 `max-width: 380px`；内容区左右留白 24px；首页 hero 为 1.5fr / 1fr 双列 |
| ≤ 600px | 顶部 3 个标签：进度 / 冲刺 / 今日；右上角齿轮直接进入设置；隐藏顶栏「⋯」 | 手机紧凑布局，见 `progress-mobile.css`、`sprint-mobile.css`、`mobile-density.css` |

导航栏的列数由 `grid-auto-flow: column` 按实际入口数均分，不再写死 `repeat(4, …)` / `repeat(3, …)`；增删入口时无需再改 CSS。

「⋯」按钮（平板）与手机端设置齿轮上的小圆点同时显示同步状态（已同步 / 同步中 / 离线 / 失败）。

### 样式文件加载顺序

`layout.tsx` 依次引入：KaTeX → 字体 → `globals.css` → `journal.css` → `sprint.css` → `touch.css` → `schedule.css` → `paper-netdisk.css` → `sprint-mobile.css` → `progress-mobile.css` → `mobile-density.css` → `tablet.css`。后加载的同优先级规则会覆盖前者，平板样式因此放在最后。`analytics.css` 不在全局引入，由 `AnalyticsActivity.tsx` 自己引入，随懒加载的分析页一起拆包。

### 下拉选择器

原生 `<select>` 的展开列表由浏览器/系统绘制（Windows 上是深灰高亮、无圆角、字号不受页面控制），无法与站点风格统一。手机端的科目切换、目录筛选、冲刺科目一律使用 `app/components/common/SelectMenu.tsx`：

- 触发区沿用原外观（`book-select__surface` / 药丸形）；
- 展开面板为纸色 `--mobile-surface`、`--radius-lg` 圆角、分组标题 + 选中打勾；
- 支持 ↑↓ / Home / End / Enter / Esc、点击外部关闭，`role="listbox"` + `aria-selected`。

桌面端不受影响。

## 5. 图标

- 统一使用 `app/components/common/Icon.tsx`：`<Icon name="pen" />`。图标为 24×24 线性 SVG，颜色继承 `currentColor`，默认 `aria-hidden`。
- 现有图标：`x` `check` `chevron-down` `chevron-up` `arrow-right` `arrow-down` `arrow-up` `arrow-up-right` `pen` `target` `coffee` `hourglass` `monitor` `smartphone` `star`（支持 `filled`）`alert` `link` `square-check` `quote` `table` `maximize` `note` `map-pin` `book-open` `library` `globe` `lightbulb` `sparkle` `settings`。
- 界面中不使用 emoji 或 Unicode 符号充当图标，提示文案中也不加 emoji。CSS 伪元素需要图标时，使用 `mask` + 内联 SVG。
- 导航图标（`MobileNavIcon` / `navigation-symbol--*`）是单独的一套，保持不变。
- 站点图标（浏览器标签页与 iOS 主屏）与侧栏品牌标记都用人大校徽 `public/ruc-logo.svg`。前者由 `app/layout.tsx` 的 `metadata.icons` 引用；后者是 `.brand-emblem` 的 `background-image`，配 26px 米白圆底，保证红色印章在深色侧栏上的对比度。「Atlas」字标保留。校徽文件为多路径 SVG，修改时不要用手写脚本重新压平数字（会丢失路径笔画），用 SVGO 的 `--precision=2` 处理并保留 `viewBox`。

## 6. 各页面现状

### 学习进度
- 顶部切换 408 / 数学，再切换科目；hero 区为当前书目进度 + 本周节奏。
- 目录筛选：全部 / 未学 / 未复习 / 逾期；支持编辑模式下批量排期。
- 手机端隐藏本周节奏区，目录筛选使用紧凑下拉。
- 手机端展开某一小节时，详情第一行是「新学勾选 + 完成日期」与「写日志」按钮，第二行是「新学计划」；写日志不再只剩一个加号。

### 套卷冲刺
- 科目：408 / 数学 / 英语 / 政治；筛选：试卷类型、完成状态，真题可按年份排序。
- 只有卡片视图（`sprint-bento-grid`），没有表格 / 分屏视图。手机端卡片默认折叠为「标题 + 分数」摘要行，筛选收进折叠面板。
- 答题卡「一键清零」有行内二次确认。
- 顶部有试卷云盘入口。

### 今日
- 执行看板：左侧当天课表时间线（约 69%），右侧「今日任务」与「逾期任务」。
- 手机端**没有顶部横幅**：日期与星期显示在当天课程卡左上角，写记录入口由日志区的「写一条」承担。
- 手机端当天课程明细**默认展开**，折叠箭头并入日期行右侧；「作息 / 复习课表 / 第 N 周」标题组隐藏。
- 状态只在一处显示：进行中的课程行内标「进行中」，休息时在「当天安排」行右侧显示「午休 · 剩 N 分钟」。
- 手机端一律不出现「复习课表」字样：更多菜单、页面标题都用「课表」。
- 桌面今日页的「全屏/设置」按钮同样受 `SHOW_DESKTOP_SCHEDULE` 控制，与整页课表一起隐藏。
- 手机端顶栏右上角是齿轮（设置）入口，点一下直接进入设置；「⋯」只在平板显示。
- 空任务面板在标题旁显示真实文本节点「暂无安排 / 无逾期」（`.task-panel-empty-note`），不再用 CSS `content` 写文案，便于读屏与翻译。
- 学习日志：唯一的深色主按钮是「写今日记录」；时间流中的「写一条」和空状态的「记录第一条」都是文字按钮（`.journal-action-btn--text`）。
- 日志筛选 5 项：全部 / 重点 / 408 / 数学 / 已发布。手机端（≤600px）排成一行，外层一道轻边框收成一个控件。

### 复习课表（整页已隐藏）
- `app/feature-flags.ts` 的 `SHOW_DESKTOP_SCHEDULE = false`：侧栏、平板/手机导航、更多菜单都不再出现整页课表入口，`navigateMobile("schedule")` 也会被拦截。
- 页面组件、样式与数据保留（`ScheduleView` 仍在静态导入中，因此整页课表样式仍会进主包）；把开关改回 `true` 即可恢复入口，无需改其他代码。
- 课表数据仍在使用：今日页左侧的当天课程时间线、设置页的考试日程看板都读取同一份 `schedule`。
- 恢复时的视觉约定：横向时间轴 / 竖向周课表两种布局，可切换周次，支持重置默认课表；「当前课程」使用蓝色令牌，课程配色见第 1 节。
- 当前默认排课为入冬版（`SCHEDULE_VERSION = 2`）：周一至周六 2~4 节数学、5~7 节 408、9~10 节 408/数学交替、12~13 节英政；周日 5~7 节「总结复习」（自定主题，赭黄）、9~10 节英政。旧版默认模板存档在读取时按版本号整体替换为新模板，含自定义条目的课表保持原样。

### 设置
- 卡片顺序：日程看板 → 数据管理与本地备份 → **危险操作** → 账号与登录 → 关于。
- 危险操作卡片只保留标题与「清空记录」按钮，说明文字已移除（执行前仍会二次确认）。
- 账号与登录卡片为单行：空间名在左，退出按钮在右，不再显示「当前空间：」前缀与说明句。
- 退出登录只在「账号与登录」卡片中提供，顶栏不再放退出按钮。

### 数据分析
- 由 `app/feature-flags.ts` 的 `SHOW_DATA_ANALYSIS = false` 关闭，所有屏幕都不显示入口。
- 组件通过 `lazy()` 加载，样式随组件拆包；重新开启时不会影响首屏体积。

## 7. 已知遗留（暂未处理）

| 项目 | 说明 |
| :--- | :--- |
| 死 CSS | 部分类名已无 TSX 引用，例如 `globals.css` 的 `.placeholder-page` `.today-sections` `.university-logo`，`sprint.css` 的 `.mini-subj-chip` `.paper-q-pill`，`journal.css` 的 `.journal-editor-toolbar` `.blog-status-badge`，`schedule.css` 的 `.schedule-week-picker` `.idle-badge` `.schedule-icon-btn`，`analytics.css` 的 `.forecast-insight-banner` 等。删除前注意排除模板字符串拼接的类名（如 `.timetable-card--${theme}`、`.sync-note--${cls}`）和 KaTeX 输出的类名。 |
| 数值阶梯范围 | 桌面六个基础/功能样式表已接入间距、交互动效和表面投影令牌；手机专用样式表仍有历史间距与阴影字面量。 |
| 触屏热力图 | 试卷卡片热力图的逐题信息只在 `title` 中，触屏无法查看，需通过「打开答题卡」进入。 |
| 中性色字面量 | 已收敛（2026-10-18）：`sprint-mobile.css`、`progress-mobile.css` 与 `globals.css` 手机断点内的卡片底、描边、分隔线、次要文字、强调文字全部改用 `--mobile-*` 令牌，三个手机样式文件不再有颜色字面量。 |

## 8. 已裁定不改

以下事项已经讨论并决定保持现状，不再作为问题提出：

- **手机端一律不出现「复习课表」**：任务卡标题组、更多菜单、页面标题全部不用这个叫法，统一为「课表」。**已确认，勿再作为问题提出。**

- **答题卡「一键全对」不加确认**：保持一键直达。
- **手机端试卷卡片的完成态**：不额外增加视觉标记。
- **桌面今日页主次**：保持左侧课表、右侧任务的现有比例与顺序。
- **模拟卷进度分母固定为 30**：产品定值。
- **冲刺页不显示考试倒计时**：有意降低焦虑感；`examDate` 仍被侧栏和设置页使用，不要删除。
- **408 分科使用 DS / CO / OS / CN 英文缩写**：卡片与答题卡同源（`bentoChoiceGroups`）。
- **试卷卡片的交互密度**：维持现状。
- 排序控件位置、分数输入回车行为、英语与政治主观题的结构分值：维持现状。
