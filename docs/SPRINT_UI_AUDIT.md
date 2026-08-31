# 套卷冲刺页面 UI 设计审计与改造清单

> **文档性质**：单页 UI 设计审计结论 + 已裁定改造清单
> **审计对象**：「套卷冲刺」页面 (Sprint)
> **基线 commit**：`b88a562`（2026-08-31 17:00）
> **审计日期**：2026-08-31
> **适用对象**：后续执行改造的开发者 / 协同 Agent

---

## 目录

- [0. 裁定结论速查](#0-裁定结论速查)
- [1. A 类：设计语言断裂](#1-a-类设计语言断裂全部成立)
- [2. B 类：信息架构与内容](#2-b-类信息架构与内容)
- [3. C 类：交互与可用性](#3-c-类交互与可用性)
- [4. D 类：维护债](#4-d-类维护债全部成立)
- [5. 建议执行顺序](#5-建议执行顺序)

---

## 0. 裁定结论速查

审计初稿共提出 20 项问题，经产品方逐条裁定后结论如下：

| 编号 | 问题摘要 | 裁定 | 处置 |
|------|----------|------|------|
| A1 | 冲刺页与全站为两套色板 | ✅ 成立 | 待改造 |
| A2 | 颜色依赖未定义的假 CSS 变量 | ✅ 成立 | **优先改造（根因）** |
| A3 | 圆角 / 阴影 / 字体形制不统一 | ✅ 成立 | 待改造 |
| B1 | 模拟卷进度条硬编码上限 30 | ❌ 撤回 | **保留现状**，30 套上限为产品定死值，非缺陷 |
| B2 | 5 个派生指标计算后未使用 | ✅ 成立 | **改为删除**，不做展示 |
| B3 | 缺考试倒计时 | ❌ 撤回 | **保留现状**，冲刺阶段有意降低焦虑感 |
| B4 | 真题区缺空状态 | ✅ 成立 | 待改造 |
| C1 | 清空按钮位置与确认体系 | ⚠️ 部分撤回 | 位置问题已随 `b88a562` 解决；**确认体系不一致仍成立** |
| C1′ | 单张模拟卷删除删不干净 | ✅ **已验证属实** | 见 [3.1](#31-c1-清空操作与确认体系) |
| C2 | 已完成状态几乎不可辨 | ✅ 成立 | 待改造 |
| C3 | 两组筛选器外观雷同 | ✅ 成立 | 待改造 |
| C4 | 热力图圆点 affordance 失真 | ✅ 成立 | 待改造 |
| C5 | 字号击穿设计系统下限 | ✅ 成立 | 待改造 |
| C6 | 分数输入无校验反馈 | ✅ 成立 | 待改造 |
| C7 | 响应式缺口 | ✅ 成立 | 待改造 |
| D1 | 约 15 个死 CSS 类 | ✅ 成立 | 待清理 |
| D2 | `renderBentoHeatmap` 三分支重复 | ✅ 成立 | 待重构 |
| D3 | `.mini-subj-chip.chip-unset` 重复定义 | ✅ 成立 | 待清理 |
| D4 | 间距刻度失控（11 档） | ✅ 成立 | 待收敛 |

**涉及文件**

| 文件 | 说明 |
|------|------|
| `app/study-dashboard.tsx` | 冲刺页渲染 3365–3788、答题卡热力图 1389–1691、状态派生 948–1058 |
| `app/globals.css` | Sprint 样式块 3113–4050 |
| `app/study-data.ts` | `mergePapers` 合并策略 1038 |
| `worker/api.ts` | 云端 PUT 合并与墓碑过滤 769–792 |

---

## 1. A 类：设计语言断裂（全部成立）

### 1.1 两套设计令牌并存

全站为**暖纸质学术人文风**，冲刺页为**冷灰蓝 SaaS 风**。逐项对照：

| 属性 | 全站基准 | 套卷冲刺页 |
|------|----------|-----------|
| 页面底色 | `#f2efe7` (`--canvas`) | `#ffffff` |
| 卡片底色 | `#fbfaf6` (`--paper`) | `#ffffff` |
| 描边 | `#dcd9d0` (`--line`) | `#edf1f3` / `#e5e9ec` |
| 主 / 次文字 | `#172129` / `#8b918f` | `#1f2937` / `#64748b` |
| 强调色 | `#ef846d` (`--coral`) | `#ea580c` |
| 状态色 | `#7cac85` `#74a4b5` `#ef846d` | `#10b981` `#3b82f6` `#f59e0b` `#ef4444` |
| 数字字体 | Noto Serif SC (`--serif`) | Consolas, Monaco, monospace |
| 卡片圆角 | 16px | 12 / 14px |
| 卡片阴影 | `0 4px 20px rgba(35,42,44,.03)` | `0 1px 3px rgba(0,0,0,.03)` |

**状态色与渐变是落差最大的部分。** 全站只使用 coral / blue / green 三个低饱和语义色及其 `rgba()` 变体；冲刺页引入四色高饱和霓虹（`#10b981` `#3b82f6` `#f59e0b` `#ef4444`），并在 `.endless-fill`(3247) 使用 `蓝 → 紫 → 粉` 三色渐变、在 `.endless-tick.is-reached`(3269) 与 `.mini-dot.dot-wrong`(3787) 等处使用发光 `box-shadow` / `text-shadow`。以上效果在全站其余部分均无先例。

**割裂感最强的位置**是页面顶部接缝：`.topbar`(182) 为暖色毛玻璃 + 衬线标题，其下第一张 `.sprint-stat-card`(3126) 立即切换为纯白冷灰。

### 1.2 根因：颜色写在未定义的假变量上 ⚠️ 优先

冲刺页所有颜色均采用「不存在的变量 + 硬编码兜底」形式：

```css
/* app/globals.css:3127-3128 */
background: var(--card-bg, #ffffff);
border: 1px solid var(--border-color, #e5e9ec);
```

经全文核查，`--card-bg`、`--text-primary`、`--border-color`、`--text-muted` 在 `:root` 中**从未定义**，全文件 **0 处定义、16 处引用**，因此永远走硬编码兜底值。

**这一条是 A 类的技术根因，必须先于其他改造解决：**

- 现状下无法通过调整主题变量统一风格，改动只能逐行替换硬编码；
- 若将来在 `:root` 补上这 4 个变量，冲刺页会在无预警的情况下整体变色。

**改造方向**：将冲刺页颜色统一迁移到既有令牌体系（`--paper` / `--canvas` / `--ink` / `--ink-soft` / `--muted` / `--line` / `--line-soft` / `--coral` / `--blue` / `--green`），删除 16 处假变量引用。

### 1.3 形制不统一

除色板外，圆角、阴影、字体三处形制同样脱轨（见 1.1 表）。其中数字字体从 Noto Serif SC 切换为 Consolas 等宽，在同一页面的滚动过程中字体家族发生跳变，观感影响大于色差。

---

## 2. B 类：信息架构与内容

### 2.1 B1 — 模拟卷进度上限（已撤回，保留现状）

初稿指出「模拟试题」卡片的里程碑刻度使用硬编码魔数 `30`：

```tsx
/* app/study-dashboard.tsx:3430 */
style={{ width: `${Math.min(100, Math.round((sprintMockCompleted / 30) * 100))}%` }}
```

**裁定：非缺陷。** 模拟套卷总量上限即为 30，是产品侧定死的值，不需要做成可配置。

> 保留建议（非阻塞）：可将 `30` 提取为具名常量（如 `MOCK_PAPER_TARGET = 30`）并加注释说明其产品含义，避免后续维护者误判为笔误。不做也不影响。

### 2.2 B2 — 5 个死指标（成立，处置改为删除）

以下派生值经全文核查**均只计算、不渲染**（grep 命中行仅为其定义处）：

| 变量 | 定义位置 | 含义 |
|------|----------|------|
| `sprintPastSecondRound` | 953 | 真题二刷套数 |
| `sprintMockPercent` | 959 | 模拟卷完成百分比 |
| `sprintAvgScore` | 1006 | 全科目总平均分 |
| `sprintAvgDuration` | 1013 | 平均用时（分钟） |
| `sprintJournalsCount` | 1030 | 关联复盘日志条数 |

其中 `sprintPastSecondRound`、`sprintAvgDuration`、`sprintJournalsCount` 原本具备展示价值（二刷进度、平均用时、复盘条数），但**产品裁定不做展示**。

**处置：直接删除这 5 个 `useMemo`**，不要保留为注释代码。删除后需确认无残留引用、构建通过。

### 2.3 B3 — 缺考试倒计时（已撤回，保留现状）

初稿指出冲刺页未展示「距初试 N 天」，而 `examDate`(904)、`daysUntilExam`(905)、`timeProgressPercent`(906) 均已计算完成。

**裁定：有意为之。** 冲刺阶段刻意弱化倒计时以降低用户焦虑感，不补此模块。

> 备注：`examDate` 等变量仍被侧栏学期卡 (2674) 使用，**不可删除**。

### 2.4 B4 — 真题区缺空状态（成立）

模拟题区在 `visibleMockPapers.length === 0` 时渲染 `.sprint-empty-card`；真题区则是整段条件渲染：

```tsx
/* app/study-dashboard.tsx:3522 */
{(sprintTab === "all" || sprintTab === "past") && visiblePastPapers.length > 0 && (
  <section className="sprint-section" …>
```

**后果**：在「已完成」筛选下若结果为 0，真题区整块消失且无任何提示，页面直接出现空白断层。

**改造方向**：统一两区空状态策略——真题区同样保留 section 容器，内部渲染与模拟题区一致的空状态卡（文案区分「暂无真题」与「当前筛选无结果」）。

---

## 3. C 类：交互与可用性

### 3.1 C1 — 清空操作与确认体系（位置已解决，体系不一致仍成立）

**位置问题已随基线 commit 解决。** 该操作已迁移至「设置」页危险操作区：

```tsx
/* app/study-dashboard.tsx:4127 */
<button type="button" className="settings-btn settings-btn--danger"
        onClick={clearAllPaperRecords} title="清空全部学科历年真题与模拟卷的做题与打分记录">
  清空套卷完成记录 ⚠️
</button>
```

作用域（跨全部学科）与视觉层级（`settings-btn--danger`）现已匹配，本条前半部分作废。

**仍成立的部分：确认弹窗体系不一致。** `clearAllPaperRecords`(2015) 使用浏览器原生 `window.confirm`：

```tsx
/* app/study-dashboard.tsx:2016 */
if (!window.confirm("⚠️ 危险操作确认：\n\n确定要清空全部套卷和题目的完成记录与打分吗？…")) return;
```

而站内已有成熟的自研确认体系（删除模拟卷使用的 `.confirm-overlay` / `.confirm-dialog confirm-dialog--danger`）。两条路径并存导致：视觉不统一、无法在原生弹窗中承载复选确认等更强的安全交互、移动端体验割裂。

**改造方向**：改用站内 `confirm-dialog` 组件（可参照删除模拟卷的 `pendingDeletePaperId` 模式，引入 `pendingClearAllPapers` 状态）。

#### 3.1.1 C1′ — 单张模拟卷删除删不干净（存疑项，已验证属实）⚠️

产品方提出「删模拟卷删不干净」的怀疑，经代码链路核查**确认属实**，根因如下。

**删除函数只更新本地状态，不走替换式上传：**

```tsx
/* app/study-dashboard.tsx:1111-1115 */
function handleDeleteMockPaper(id: string) {
  setPapers((current) => current.filter((p) => p.id !== id));
  setPendingDeletePaperId(null);
  setFeedbackMessage("已删除模拟试卷");
}
```

它依赖 350ms 防抖的常规自动保存 effect (653–705)，该 effect 发出的 PUT **不带 `replace: true`**。

**服务端在非 replace 路径下与 D1 现存数据做并集：**

```ts
/* worker/api.ts:779-782 */
if (stateRow?.papers) {
  const existingPapers = normalizePapers(JSON.parse(stateRow.papers));
  finalPapers = mergePapers(data.papers, existingPapers);
}
```

**`mergePapers` 是按 id 的纯并集，没有墓碑机制：**

```ts
/* app/study-data.ts:1038-1055 */
export function mergePapers(local: PaperRecord[], remote: PaperRecord[]): PaperRecord[] {
  const map = new Map<string, PaperRecord>();
  const defaults = defaultPastPapers();
  defaults.forEach((p) => map.set(p.id, p));
  remote.forEach((p) => { … map.set(p.id, existing ? { ...existing, ...p } : p); });
  local.forEach((p) => { … if (!existing) { map.set(p.id, p); } else { … } });
  // 全程只有 map.set，无任何 delete 分支
}
```

**墓碑机制只存在于日志，套卷没有对等实现：**

```ts
/* worker/api.ts:789-792 —— 仅过滤 journal，papers 无对应逻辑 */
if (deletedJournalIds.length > 0) {
  const deletedSet = new Set(deletedJournalIds);
  finalJournals = finalJournals.filter((j) => !deletedSet.has(j.id));
}
```

**因此形成如下循环：**

1. 本地删除模拟卷 → `papers` 数组不再包含该 id；
2. 防抖 PUT 发送常规请求（无 `replace`）；
3. 服务端 `mergePapers(新数组, D1 旧数组)` → 被删记录由 D1 侧重新并入；
4. 30 秒轮询 (718) 或窗口 focus (717) 触发 `loadRemoteData` → **已删除的模拟卷重新出现**。

**对比：`clearAllPaperRecords` 不受影响**，因为它走 `replaceCloudData`(1903)，显式携带 `replace: true`(1909)，服务端跳过并集直接整表替换。

**修复方向**（任选其一，建议前者）

- **方案 A（推荐）**：为 papers 增加与 journals 对等的墓碑机制——新增 `deletedPaperIds` 请求字段与 `deletedPaperIdsRef`，在 `worker/api.ts:789` 后追加 papers 过滤分支。改动面与现有 journal 机制完全对称，风险可控。
- **方案 B（最小改动）**：`handleDeleteMockPaper` 改为删除后立即调用 `replaceCloudData`。缺点：整表替换会覆盖其他设备并发新增的数据，与现有多端 Merge 策略相冲突，**不推荐**。

### 3.2 C2 — 已完成状态几乎不可辨（成立）

```css
/* app/globals.css:3472-3493 */
.sprint-bento-card { background: #ffffff; border: 1px solid #edf1f3; … }
.sprint-bento-card:hover { … border-color: #cbd5e1; }
.sprint-bento-card.completed { border-color: #cbd5e1; background: #ffffff; }
```

三处叠加后产生两个问题：

1. `.completed` 的 `background` 与默认态完全相同（均为 `#ffffff`），整条声明是空操作；
2. `.completed` 的 `border-color: #cbd5e1` 与 **未完成卡片的 hover 态边框值完全一致** —— 即「hover 一张未完成卡片」与「一张已完成卡片」在边框上无法区分。

唯一的完成信号是年份药丸反色 (3516)，但黑底在交互语境中更容易被读作「选中 / hover」，语义不明确。

**改造方向**：为完成态增加独立且不与 hover 冲突的视觉通道（建议左侧色条 + 卡片底色微染，参照 `.section-row.is-current` 的既有处理方式），并让 hover 态改用阴影 / 位移表达。

### 3.3 C3 — 两组筛选器外观雷同（成立）

「类型」(3462 `.sprint-tab-group`) 与「状态」(3495 `.sprint-status-filters`) 共用同一条样式规则：

```css
/* app/globals.css:3310-3335 */
.sprint-tab-group, .sprint-status-filters { background: #f1f4f6; border-radius: 8px; padding: 3px; gap: 2px; }
.sprint-tab-group button, .sprint-status-filters button { padding: 6px 14px; font-size: 12.5px; color: #64748b; … }
.sprint-tab-group button.active, .sprint-status-filters button.active { background: #ffffff; … }
```

两组控件背景、药丸、字号、圆角、激活态完全一致，且**均无任何文字标签**，用户无法判断哪一组是「试卷类型」、哪一组是「完成状态」。

**改造方向**：为两组分别加前置标签（如「类型」「状态」），或将状态组改为不同的控件形态（下拉 / 复选 chip）以作区分。

### 3.4 C4 — 热力图圆点 affordance 失真（成立）

```css
/* app/globals.css:3765-3775 */
.mini-dot { width: 6.5px; height: 6.5px; border-radius: 50%; transition: transform 0.12s ease; }
.mini-dot:hover { transform: scale(1.6); }
```

圆点具备 hover 放大反馈，视觉上承诺「可单独点击」；但实际点击行为由父容器 `.bento-mini-heatmap`(1416–1431) 统一接管——点击任意位置（含圆点）都是打开答题卡弹窗，**圆点本身不可单独交互**。触屏设备无 hover，反馈完全消失。

**改造方向**：二选一——(a) 去掉 hover 放大，改为整块热区的 hover 反馈；(b) 保留放大但让圆点直接可点并即时切换该题状态。当前状态是两者都不成立的中间态。

### 3.5 C5 — 字号击穿设计系统下限（成立）

| 选择器 | 行号 | 字号 |
|--------|------|------|
| `.mini-subj-chip` | 3804 | **8.5px** |
| `.endless-tick` | 3262 | 9px |
| `.mini-heatmap-tag` | 3703 | 9px |
| `.mini-row-label` | 3748 | 9px |

全站字号下限为 10px（`.macro-card__meta` 1206、`.storage-note` 122）。冲刺页出现 8.5px 题号与 9px 标签，中文环境下基本不可读，且破坏了全局排版节奏。

**改造方向**：将下限收敛至 10px；8.5px 的题号 chip 需同步放大圆角与内边距以维持可点性。

### 3.6 C6 — 分数输入无校验反馈（成立）

```tsx
/* app/study-dashboard.tsx:3567-3579 / 3688-3700 */
<input type="number" className="bento-score-input"
       min={0} max={activeArea === "english" ? 100 : 150} step={0.5}
       value={paper.score ?? ""}
       onChange={(e) => { const val = e.target.value;
         updatePaper(paper.id, { score: val === "" ? null : parseFloat(val) }); }} />
```

`min` / `max` 仅为 HTML 原生属性，输入 `200` 时 `parseFloat` 会静默接受并立即写入本地与云端，无夹取、无提示、无红框。

**改造方向**：在 `updatePaper` 入口按科目满分夹取（408/数学 150，英语 100），并对越界输入给出即时反馈。

### 3.7 C7 — 响应式缺口（成立）

Sprint 样式块 (3113–4050) 内**仅有一处媒体查询**，且只覆盖概览网格：

```css
/* app/globals.css:4745-4749 */
@media (max-width: 640px) { .sprint-macro-grid { grid-template-columns: 1fr; } }
```

存在两类问题：

1. **横向溢出**：`.sprint-bento-grid`(3466) 为 `repeat(auto-fill, minmax(280px, 1fr))`。375px 视口下 `.page-content` 内宽约 311px，扣除 `.sprint-section` 左右各 20px padding 后约 271px < 280px，**产生约 9px 横向溢出**。
2. **无断点覆盖**：`.sprint-stat-card--dual`(3137，窄屏下 `1fr auto` + 分数区 `min-width: 120px` 会挤压标题)、`.sprint-bento-grid`(3466)、`.sprint-toolbar`(3292) 均无窄屏适配。

**改造方向**：`minmax(280px, 1fr)` 改为 `minmax(min(280px, 100%), 1fr)`；补 `@media (max-width: 640px)` 断点，将双列概览卡改为纵向堆叠、工具栏改为纵向排列（可参照 `.analytics-toolbar` 在 1689 的既有处理）。

---

## 4. D 类：维护债（全部成立）

### 4.1 D1 — 约 15 个死 CSS 类

以下类在 `app/study-dashboard.tsx` 中 **0 处引用**，均为旧表格布局遗留：

```
.sprint-section-tag      .paper-name            .paper-year-badge
.paper-title-group       .paper-check-col       .paper-check-label
.paper-status-hint       .paper-score-pill      .paper-btn-add-val
.paper-duration-pill     .paper-second-col      .paper-second-date
.paper-actions-col       .paper-manage-col      .btn-add-mock-inline
```

主要分布在 `app/globals.css:3450-3457` 与 `3847-4049`，约 **150 行**。注意 `.paper-btn-del`(4018) 与 `.paper-score-sub`(4051) 仍在使用，清理时勿误删。

### 4.2 D2 — `renderBentoHeatmap` 三分支重复

`app/study-dashboard.tsx:1389-1691`（约 300 行）中，408 / 英语 / 数学三个分支结构完全一致，差异仅在：

- 选择题分组配置（`choiceGroups` 的起止题号与标签）
- 主观题题号表（`bigQuestions`）
- 汇总标签文案（「大题」vs「主观」）

**改造方向**：抽取为配置表 + 单一渲染函数，三分支收敛为一份 `PAPER_STRUCTURE` 配置驱动。（工程侧已有 `MATH_PAPER_STRUCTURE` / `CS408_PAPER_STRUCTURE` / `ENGLISH_PAPER_STRUCTURE` 常量被 import 但当前未在该函数中使用，可复用。）

### 4.3 D3 — 重复定义

```css
/* app/globals.css:3837-3845 —— 连续定义两次，后者覆盖前者 */
.mini-subj-chip.chip-unset { background: #e2e8f0; color: #94a3b8; }
.mini-subj-chip.chip-unset { background: #e2e8f0; color: #64748b; }
```

### 4.4 D4 — 间距刻度失控

Sprint 块内共出现 11 档间距值：`3.5 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24`。同一组件族内并存 15px 与 16px（`.sprint-stat-card` padding `16px 18px` vs `.sprint-stat-card--dual` padding `15px 18px`）。

**改造方向**：收敛至全站既有刻度（4 / 6 / 8 / 12 / 16 / 20 / 24）。

---

## 5. 建议执行顺序

改造之间存在依赖，建议按以下顺序推进：

| 阶段 | 内容 | 理由 |
|------|------|------|
| **P0** | A2 假变量清理 + C1′ 删除墓碑机制 | 前者是 A 类的技术根因，不先解决则风格改造无法收敛；后者是功能性缺陷（数据无法真正删除），与视觉改造正交，可独立发版 |
| **P1** | C2 完成态、C6 分数校验、C7 响应式 | 属于功能 / 可用性缺陷，改动面小、风险低 |
| **P2** | A1 + A3 色板与形制对齐 | 依赖 P0 完成后令牌可用；改动面最大，需整页回归 |
| **P3** | B4 空状态、C3 筛选器区分、C4 affordance、C5 字号 | 体验优化项，可在 P2 改造时顺带处理 |
| **P4** | B2 删除死指标、D1/D2/D3/D4 清理 | 纯清理，建议在视觉改造完成后统一执行，避免与改造中的代码冲突 |

**注意事项**

- B1（30 套上限）与 B3（无倒计时）为**有意设计，不要改动**；
- `examDate` / `daysUntilExam` / `timeProgressPercent` 虽不在冲刺页展示，但被侧栏学期卡使用，**删除 B2 指标时勿误删**；
- 执行 P2 前建议先建本地备份（设置页「手动备份」），色板改造涉及 3113–4050 全部样式。
