# UI 审计文档整合与残留问题复核（2026-10-14）

> **性质**：把此前 8 份 UI 相关审计/裁定文档合并为一张状态表，并对照**当前代码**复核每条结论是否仍然成立。
> **复核方式**：逐条 grep 源码验证，未做任何代码改动。
> **基线**：`main` @ `ab3f1af`（工作区另有 2 处未提交改动，见文末）。
> **测试基线**：`npm test` = 77 项通过。

---

## 一、被整合的文档清单

| 文档 | 行数 | 日期 | 覆盖范围 | 本次处置 |
| :--- | ---: | :--- | :--- | :--- |
| `SPRINT_UI_AUDIT.md` | 402 | 08-31 | 冲刺页 20 项（A 设计语言 / B 信息架构 / C 交互 / D 维护债） | 合并，逐条复核 |
| `SPRINT_UI_AUDIT_V2.md` | 140 | 08-31 | 冲刺页复核 + P0/P1/P2 | 合并，逐条复核 |
| `SPRINT_UI_OPTIMIZATION_PRD.md` | 231 | — | 14 项产品裁定，7 项实施 | 作为"裁定不改"权威来源 |
| `mobile-ui-issue-list.md` | 163 | 09-26/27 | M01–M17 手机端 | 合并，逐条复核 |
| `ui-audit-2026-09-30.md` | 21 | 09-30 | 六页桌面+手机走查 | 合并 |
| `MOBILE_LAYOUT_FIX_2026-10-13.md` | 59 | 10-13 | 手机端目录/答题卡三轮修正 | 合并 |
| `MOBILE_DENSITY_2026-10-13.md` | 31 | 10-13 | 手机信息密度 | 合并 |
| `CODE_QUALITY_AUDIT_AND_REFACTORING_PRIORITIES.md` | 392 | — | 含 M-02 答题卡 JSX、M-03 单体 CSS | 仅取 UI 相关条目 |

**整合后的结论**：这批文档本身存在三个结构性问题，是后续复查反复出错的根因。

1. **行号全部失效**。审计引用的是 `globals.css:3113–4692`、`study-dashboard.tsx:3214–3653` 这类区间；而 `globals.css` 已从约 4880 行降到 **1484 行**，`study-dashboard.tsx` 从 5538 行降到 **4932 行**。旧文档里的任何行号都不能直接跳转。
2. **"已修复"与"待修复"混排，且没有统一状态字段**。V1 有"待改造"、V2 有"P0/P1/P2"、PRD 有"✅保留/❌忽略/🔄重构"、手机清单有"已处理/暂不修改"——四套词表。
3. **无单一真源**。冲刺页同一问题在三份文档里各出现一次，措辞不同，容易重复改造。

下文用统一的三态词表：**已修复 / 已裁定不改（勿再提）/ 残留**。

---

## 二、状态总表

### 2.1 已修复（有代码证据，勿重复改造）

| 原编号 | 问题 | 证据 |
| :--- | :--- | :--- |
| V1 A2 | 冲刺页颜色写在**未定义的假变量**上（`--card-bg` 等，0 定义 16 引用） | `grep 'var(--card-bg\|var(--text-primary\|var(--border-color\|var(--text-muted'` → **0 命中** |
| V1 A1/A3 | 冲刺页冷灰蓝 SaaS 色板 / 圆角阴影字体脱轨 | `sprint.css` 主体已用 `--paper/--line/--ink/--coral/--green/--serif` |
| V2 P0-1 | 英语科目下"模拟试题"Tab 状态残留 → 整页空白 | `study-dashboard.tsx:591` `effectiveSprintTab` 兜底 + `:1869` 切换时重置 |
| V2 P0-2 / M01 | 答题卡"一键清零"无确认直接清空整卷 | `AnswerSheetModal.tsx:37,131-146` 行内二次确认（`q-clear-confirmation`）——**比 PRD 裁定更进一步** |
| V2 P1-2 | 顶栏冲刺科目切换器 ≤980px 横向溢出 | 已补断点覆盖（**但修复无效，见残留 A**） |
| V2 P1-3 | 卡片 checkbox 用 `display:none`，退出键盘序列 | `sprint.css:660` 已改为 1px+opacity:0；`:686` 有 `input:focus-visible + .bento-check-box` 焦点环 |
| V2 P1-4 | 分数越界静默夹取无提示 | `study-dashboard.tsx:1427-1447` 夹取时 `setFeedbackMessage("已按满分 N 分修正")` |
| V2 P2-1 | "二刷"可在一刷前勾选 | `:1471-1489` 正向联动补记一刷；`:1450-1466` 取消一刷时级联清二刷（PRD REQ-P0-1 完整落地） |
| V2 P2-3 | 空均分挂 `/150 分` 单位、分数框 42px 溢出 | `:3829,3903` 加 `!== "--"` 条件；`sprint.css:596` 改 `min-width:24px; width:32px` |
| V2 P2-4 | 弹窗按钮 emoji | `AnswerSheetModal.tsx` 按钮已无 emoji（仅 `feedbackMessage` 文案内保留 🟢🔴） |
| V1 B2 | 5 个死指标 | 5 个变量全部 0 引用 |
| V1 B4 | 真题区缺空状态 | `:4067-4075` 已按筛选态给三种文案 |
| V1 C2 | 完成态与 hover 态不可分 | `sprint.css:465` 左侧 3.5px 绿条 + `:507` 年份 pill 绿调（黑底已废） |
| V1 C3 | 两组筛选器外观雷同无标签 | `:3939,3974` 已加 `.sprint-filter-label`「类型」「状态」 |
| V1 C4 | 热力图圆点 hover 放大但不可点 | `sprint.css` 已无 `mini-dot:hover`；改由 `.mini-heatmap-open-btn` 显式呼出（PRD REQ-P1-3） |
| V1 C5 | 冲刺页字号击穿 10px 下限 | `sprint.css` 已无 <10px |
| V1 C6 | 分数输入无校验 | 同 V2 P1-4 |
| V1 C7 | 冲刺块无断点、`minmax` 溢出 | `sprint.css:443` 已用 `minmax(min(360px,100%),1fr)` |
| V1 D1 | 15 个死 CSS 类（表格布局遗留） | 全部 0 命中 |
| V1 D3 | `.mini-subj-chip.chip-unset` 重复定义 | 已合并为单条 |
| V1 D4 | 间距刻度失控（11 档） | 已收敛 |
| PRD REQ-P1-1 | `.sprint-section` 卡片套卡片 | `sprint.css:360-369` 已改 `background:transparent; border:none; padding:0` |
| PRD REQ-P2-1 | 里程碑进度条蓝→黄→粉三色渐变 | `sprint.css:144` 已改 `linear-gradient(90deg,var(--blue),var(--coral))` |
| PRD REQ-P2-2 | 完成日期突现导致 footer 抖动 | `sprint.css:729-733` `.editable-date-btn { animation: bento-fade-in .18s }` |
| M02–M06, M08–M17 | 手机端课表/顶栏/导航/筛选/触控区/滚动提示 | 逐条核对，均有对应实现 |
| CQ M-02 | 答题卡多科目 JSX 重复 4 遍 | 已抽为 `AnswerSheetModal.tsx` |
| CQ M-05 | 编辑器打字触发巨石组件重绘 | 已抽为 `JournalEditorModal.tsx` |
| CQ M-01/H-02/H-03/H-05/M-04 | 共享层、密钥、Markdown、迁移序号、时区 | 均已落地 |

### 2.2 已裁定不改（**不要再提**）

| 原编号 | 问题 | 裁定 | 备注 |
| :--- | :--- | :--- | :--- |
| V1 B1 | 模拟卷进度硬编码 30 | ❌ 撤回 | 30 是产品定死值 |
| V1 B3 | 冲刺页缺考试倒计时 | ❌ 撤回 | **有意**降低焦虑感；`examDate` 仍被侧栏使用，勿删 |
| PRD P0-1 | 一键清零零确认 | ❌ 忽略 | 但代码后来已加了确认，现状优于裁定 |
| PRD P1-3 | 280px 卡片 7 个交互维度过密 | ❌ 忽略 | 维持现有密度 |
| PRD P1-5 | 批量录入覆盖全对的副作用 | ❌ 忽略 | 见残留 I，仅"撤销"部分仍建议 |
| PRD P2-1 | 408 用 DS/CO/OS/CN 英文缩写 | ❌ 忽略 | 保持英文简称；且卡片与弹窗现在**同源**（都用 `bentoChoiceGroups`），已无两套称谓问题 |
| PRD P2-2 | 排序控件位置 | ❌ 忽略 | — |
| PRD P2-4 | 分数输入回车无响应 | ❌ 忽略 | — |
| PRD P2-6 | 英/政主观题结构分值 | ❌ 忽略 | — |
| M01 | 一键清零 | 暂不修改 | 同上 |
| M07 | 分析热力图单日格子 17.6px | 暂不修改 | — |

### 2.3 残留（本次复核确认仍然成立）

按严重度排列。

---

## 三、残留问题清单

### A · P1 · 冲刺顶栏科目切换器的断点修复实际无效

**V2 P1-2 声称已修，实际未生效。**

- `globals.css:890` 在 `@media (max-width:980px)` 内写 `width: auto`，`:922` 在 `@media (max-width:768px)` 内再写一次。
- 但 `sprint.css:169-178` 的 `.study-switchers.sprint-top-switchers { width: 420px }` 是**无条件顶层规则**，且 `layout.tsx` 中 `sprint.css`（第 6 行）**在 `globals.css`（第 3 行）之后**导入。
- 构建产物验证：该规则位于 `dist/client/assets/index-*.css` 偏移 146578，**不在任何 `@media` 块内**（相对最近的 `@media (width<=768px)` 花括号深度为 0），而两个断点覆盖在偏移 79797 / 81499。

**后果**：凡切换器可见的宽度（>600px），宽度都锁死在 420px。601–980px 区间顶栏最紧张。

**修复**：把 `sprint.css:169` 的 `width: 420px` 降级为桌面基准（或直接删除），让 globals 的断点覆盖生效；或把该规则整体移进 `@media (min-width: 981px)`。

---

### B · P1 · 课表页整体脱离设计令牌体系，且冷蓝已外溢

- `schedule.css` 中 `#2563eb`（Tailwind blue-600）出现 **35 次**，`#1d4ed8` 12 次；另有 `#10b981`、`#b45309`、`#fde68a`、`#fef3c7`。
- 用途是"当前/进行中"语义（`.timetable-card--active` :422、`.timetable-active-pill` :449、`.timetable-header-cell--today` :269），而全站的对应语义色是 `--blue: #74a4b5`。
- **外溢证据**：`globals.css:848` 的 `.date-editor` 也用 `#2563eb` 边框 + `rgba(37,99,235,.15)` 焦点环。该类由 `app/components/common/EditableDate.tsx:60` 渲染，**进度页与答题卡共用**，所以冷蓝已经出现在非课表页面。

**修复**：课表"进行中"映射到 `--blue`；若确实需要更高对比度，应提升为 `:root` 令牌（如 `--live`）并同步改 `.date-editor`。

---

### C · P2 · 答题卡状态色已对齐色板，但未抽成令牌

V2 P1-1 的建议是抽 `--state-correct / --state-partial / --state-wrong`。实际只完成了"换色"，没有"抽令牌"：

- `#e8b277`（部分正确）在 `sprint.css` 出现 **7 次**（:886, 922, 1171, 1471, 1473, 1604, 1617）
- `#3b6c45` / `#8c5b1c` / `#c44b34` / `#9c3f2d` 另有 8 处（:813, 819, 825, 1186, 1192, 1303, 1321, 1613-1619）

**后果**：改一处"部分正确"的颜色要改 7 个地方，且卡片热力图与答题卡弹窗靠人工保持同步。

---

### D · P2 · 死 CSS 未清理干净（V1 D1 只清了表格布局那一批）

本次全量扫描（顶层类名 0 处 TSX 引用）：

| 文件 | 死类 |
| :--- | :--- |
| `globals.css` | `.placeholder-page` `.placeholder-card` `.today-sections` `.book-summary` `.current-task` `.progress-foot` `.chapter-plan-phase-toggle` `.settings-countdown-badge` `.university-logo` |
| `sprint.css` | `.mini-subj-chips` `.mini-subj-chip`（6 条规则）`.paper-q-col` `.paper-q-pill` `.paper-btn-q-add` `.q-tag-choice-rate` |
| `analytics.css` | `.analytics-discipline-grid` `.discipline-card` `.discipline-icon` `.discipline-info` `.forecast-insight-banner` `.insight-content` `.insight-icon` `.green-text` `.section-sub` |
| `journal.css` | `.journal-editor-toolbar` `.blog-status-badge` `.journal-important-field` `.journal-important-toggle-btn` `.journal-tb-btn--strike` `.preview-empty-hint` `.preview-journal-title` |
| `schedule.css` | `.schedule-week-nav` `.schedule-week-picker` `.schedule-week-select-wrapper` `.schedule-pill-btn` 系列 `.idle-badge` `.bg-cell-idle-label` `.schedule-icon-btn` |

**注意误报**（不是死代码，勿删）：
- 模板字符串拼接类：`.navigation-symbol--${icon}`、`.sync-note--${cls}`、`.topbar-sync--${cls}`、`.backup-tag--${kind}`、`.timetable-card--${theme}`、`.event-progress-bar--${theme}`、`.event-title-text--${theme}`、`.schedule-theme-tag--${theme}`、`.netdisk-upload-task--${status}`
- 库输出：`.katex-display`
- 伪类组合：`.is-empty`（`AnalyticsActivity.tsx:181` 真实使用）

---

### E · P2 · 字号下限被课表页击穿（V1 C5 只修了冲刺页）

V1 把冲刺页 8.5px 收敛到 10px（已确认 `sprint.css` 无 <10px）。但 `schedule.css` 仍有：

| 字号 | 位置 |
| :--- | :--- |
| **7.5px** | :1022 紧凑课表时间刻度 |
| **8px** | :1054 紧凑课表 period-time |
| **8.5px** | :1439 转置课表时间行、:1461 课间副标题、:1571 |
| 9px | :1078, :1425, :1678, :1722 |
| 9.5px | :298, :845, :1058, :1506 |

中文环境下 7.5–8.5px 基本不可读。

---

### F · P2 · `prefers-reduced-motion` 覆盖不全

只有 `sprint.css:1782` 是全局通配：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior:auto!important; transition:none!important; animation:none!important; }
}
```

另两处只关了单个 chevron 的 transition（`progress-mobile.css:475`、`sprint-mobile.css:238`）。

**未受保护且会动的**：

| 文件 | 动画 |
| :--- | :--- |
| `globals.css` | `auth-shake`（登录错误抖动）、`auth-spinner`（旋转）、`page-reveal`/`auth-reveal`/`reveal`（入场）、`sync-error-pulse`/`sync-saving-pulse`（呼吸） |
| `journal.css` | `drawerSlideIn`（抽屉滑入） |
| `paper-netdisk.css` | `netdisk-fade-in` ×4、`netdisk-spin` |
| `schedule.css` | `schedule-active-pulse`（**无限 alternate 脉冲**）、`schedule-pill-blink`（**无限闪烁**）、`schedule-modal-pop` |

**修复**：把 `sprint.css:1782` 那条通配规则提到 `globals.css`，一次性覆盖全站。

---

### G · P2 · 手机端空状态文案写死在 CSS `content` 里

`mobile-density.css:38-39`：

```css
.task-panel--today:has(> .task-empty) > header::after { content: "暂无安排"; }
.task-panel--overdue:has(> .task-empty) > header::after { content: "无逾期"; }
```

同一文件 `:37` 又把 `.task-empty` 本体 `display: none` 了。CSS 生成的 `content` 通常**不进无障碍树**，所以手机上这块状态对屏幕阅读器可能完全不存在。

**修复**：改用仓库里已有的 `.desktop-density-copy` / `.mobile-density-copy` 成对 span 机制。

---

### H · P2 · 分析页已整体下线，但组件与 955 行样式仍在包里

- `app/feature-flags.ts`：`SHOW_DATA_ANALYSIS = false`，且注释写明"across all deployed navigation surfaces"。
- 渲染有守卫（`study-dashboard.tsx:4184`）。
- 但 `AnalyticsActivity` 是**静态 import**（`:18`），`analytics.css` 仍全局引入（`layout.tsx:4`）。

**后果**：用户永远加载不到、也看不到这 955 行 CSS 与整个组件。加上残留 D 里 analytics.css 的死类，说明该页长期无人维护。

**修复**：改为 `dynamic(() => import(...))` 并移除样式引入，或恢复入口。

---

### I · P2 · 批量"一键全对"可无确认覆盖已录入的对错，且无撤销

M01 的建议原话是"批量『全对』覆盖已有标记时也应提供撤销"。清零侧已加确认，**全对侧未做**：

- `markAllPaperQuestions`（`study-dashboard.tsx:1724-1738`）直接覆写全部客观题状态。
- 触发入口在答题卡里有 **4 处**（`AnswerSheetModal.tsx:182, 304, 352, 543`），均无确认、无撤销。
- 页面唯一的撤销机制 `undoPlanChange`（`:1998`）只服务排期变更。

**后果**：已仔细录入的对错被一次误点全覆盖，只能靠"一键清零"从头再来。

---

### J · P2 · 手机端试卷卡片的完成态没有任何视觉通道

- 桌面的完成态靠 `sprint.css:465` 的 `border-left: 3.5px solid var(--green)`。
- ≤600px 时 `sprint.css:1856-1863` 把卡片重置为 `border:0; background:transparent`；`sprint-mobile.css:69` 又用 `.sprint-bento-card, .sprint-bento-card.completed` **同一条规则**重设为白卡——左侧绿条被吃掉。
- `PaperCard.tsx:102-117` 的手机折叠头只渲染 title + score + chevron，**没有完成标记**。
- `sprint.css:1885` 定义的 `.bento-mobile-status.is-complete` 在 TSX 里 **0 处引用**，是条死规则。

**后果**：手机上无法从卡片外观判断哪套已做完，必须逐个展开。

---

### K · P3 · 热力图逐题信息在触屏不可达

`PaperCard.tsx:254, 271` 的题号与逐题状态全靠 `title` 属性（`第 37 题: 错题`）。热力图已按 PRD 改成纯展示（正确），但 V2 P2-2 提的"热力图点击后弹窗内定位到对应分组"未实施，触屏也没有替代交互。

影响有限（`.mini-heatmap-open-btn` 已提供入口），但触屏用户拿不到逐题明细。

---

### L · P3 · 断点体系仍是字面量散落，无单一真源

实际使用的 `@media` 断点共 **17 个值**：

```
359 360 375 480 600 601 640 767 768 769 900 960 980 1023 1024 1120 1121
```

其中 **767 / 768 / 769 三连**，**600 / 601 成对**，`1023/1024`、`1120/1121` 同理。V2 声称的"断点体系 980/768/640"已与实际严重脱节。

同类规则还会分散到两个文件：sprint 的 ≤600px 规则同时存在于 `sprint.css:1821` 与 `sprint-mobile.css:5,126`，靠导入顺序决定胜负。

---

### M · P3 · `--shadow` 令牌名不副实

`:root` 定义了 `--shadow: 0 18px 52px rgba(35,42,44,.07)`，全站只用了 **2 次**（`globals.css:614` hero-card、`journal.css:88`）；其余 20+ 处阴影全是字面量。改阴影基调需要逐处改。

---

## 四、存疑 / 未验证项

1. **真机未验收**。多份文档自己声明"浏览器模拟不能代替 iPhone Safari"。M15/M17（手机导航改动）等条目至今标着"待 iPhone Safari 复核"。
2. **桌面表头偏移疑似有 11px 缺口**。`.topbar { min-height: 62px }`（`globals.css:219`）vs `.feedback-notice--global { top: 73px }`（`:227`）。手机端两者都是 `52px + safe-area`，一致；桌面这 11px 差值看起来是有意留白，但未实测确认是否有重叠。
3. **本仓库工作区另有 2 处未提交改动**（与本次 UI 复核无关，未触碰）：
   - `worker/api.ts`：`getWorkspaceMap` 去掉 `INVITE_CODE` 旧变量兜底，改用 `env.INVITE_CODES`
   - `.github/workflows/deploy.yml`：secret 名 `INVITE_CODE` → `INVITE_CODES`（带旧名回退）
   - 另有 `iphone-login.png` / `iphone390-login.png` 两个根目录截图已 `git rm --cached`

---

## 五、建议修复顺序

| 批次 | 内容 | 理由 |
| :--- | :--- | :--- |
| **1** | 残留 A（切换器 420px） | 一行改动，修复一条"以为已修其实没修"的回归 |
| **2** | 残留 F（reduced-motion 提全局） | 把一条已有规则挪个位置，零风险，一次覆盖全站 |
| **3** | 残留 B（课表冷蓝 → 令牌） | 全站最后一块脱离设计语言的区域；含跨页面共用的 `.date-editor` |
| **4** | 残留 G + I + J | 三个手机端/安全性体验缺口，均为局部改动 |
| **5** | 残留 E + H | 字号收敛与死代码清理，可合并做一次样式瘦身 |
| **6** | 残留 C + D + K + L + M | 纯打磨，建议与下一次视觉改造顺带处理 |

---

## 六、验证方式

- 每条"已修复"结论均以 grep 源码为准，未依赖旧文档陈述。
- `npm test`：77 项通过（本次复核未改动代码，仅新增本文档）。
- 本文档位于 `docs/`，不属于 `wrangler.jsonc` 的 `assets.directory`（`./dist/client`），**不参与线上静态资源**，无需部署。
