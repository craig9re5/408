import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  defaultPastPapers,
  normalizePapers,
  mergePapers,
  maxPaperScore,
} from "../app/study-data.ts";

test("消融测试 1: CSS 布局与基线规范消融 (Layout & Baseline Invariants)", async () => {
  const css = await readFile("app/globals.css", "utf8");

  // 1.1 验证外层卡片头部统一为水平中心对齐且严禁换行 (flex-wrap: nowrap)
  const bentoCardTopMatch = css.match(/\.bento-card-top\s*\{([^}]+)\}/);
  assert.ok(bentoCardTopMatch, "必须包含 .bento-card-top 规则");
  assert.match(bentoCardTopMatch[1], /align-items:\s*center/, "卡片头部必须为垂直居中对齐 align-items: center");
  assert.match(bentoCardTopMatch[1], /flex-wrap:\s*nowrap/, "卡片头部必须严禁折行 flex-wrap: nowrap");
  assert.match(bentoCardTopMatch[1], /position:\s*relative/, "卡片头部必须具有 position: relative 作为右上角按钮的锚点");

  // 1.2 验证模拟卷头部预留右上角按钮空间 (padding-right: 24px)
  const mockCardTopMatch = css.match(/\.bento-card-top--mock\s*\{([^}]+)\}/);
  assert.ok(mockCardTopMatch, "必须包含 .bento-card-top--mock 规则");
  assert.match(mockCardTopMatch[1], /padding-right:\s*24px/, "模拟卷头部必须保留右上角删除按钮区域 padding-right: 24px");

  // 1.3 验证标题容器与控制项防换行规则
  const titleWrapMatch = css.match(/\.bento-title-wrap\s*\{([^}]+)\}/);
  assert.ok(titleWrapMatch, "必须包含 .bento-title-wrap 规则");
  assert.match(titleWrapMatch[1], /flex:\s*1\s+1\s+auto/, "标题自适应收缩 flex: 1 1 auto");

  const topControlsMatch = css.match(/\.bento-top-controls\s*\{([^}]+)\}/);
  assert.ok(topControlsMatch, "必须包含 .bento-top-controls 规则");
  assert.match(topControlsMatch[1], /flex-wrap:\s*nowrap/, "控制区严禁换行 flex-wrap: nowrap");
  assert.match(topControlsMatch[1], /flex-shrink:\s*0/, "控制区禁止压缩 flex-shrink: 0");

  // 1.4 验证分数输入容器和复选框标签高度标准化为 22px
  const scoreInlineMatch = css.match(/\.bento-score-inline\s*\{([^}]+)\}/);
  assert.ok(scoreInlineMatch, "必须包含 .bento-score-inline 规则");
  assert.match(scoreInlineMatch[1], /height:\s*22px/, "分数框高度必须标准为 22px");
  assert.match(scoreInlineMatch[1], /box-sizing:\s*border-box/, "分数框必须声明 box-sizing: border-box");

  const checkLabelMatch = css.match(/\.bento-check-label\s*\{([^}]+)\}/);
  assert.ok(checkLabelMatch, "必须包含 .bento-check-label 规则");
  assert.match(checkLabelMatch[1], /height:\s*22px/, "复选框标签高度必须标准为 22px");

  // 1.5 验证文字与占位符行高精准对齐
  const scoreInputMatch = css.match(/\.bento-score-input\s*\{([^}]+)\}/);
  assert.ok(scoreInputMatch, "必须包含 .bento-score-input 规则");
  assert.match(scoreInputMatch[1], /line-height:\s*18px/, "分数输入框 line-height 必须对齐为 18px");
  assert.match(scoreInputMatch[1], /vertical-align:\s*middle/, "输入框文字应居中对齐 vertical-align: middle");

  const scorePlaceholderMatch = css.match(/\.bento-score-input::placeholder\s*\{([^}]+)\}/);
  assert.ok(scorePlaceholderMatch, "必须包含 .bento-score-input::placeholder 规则");
  assert.match(scorePlaceholderMatch[1], /line-height:\s*18px/, "占位符行高必须为 18px 确保基线对齐");

  const checkTextMatch = css.match(/\.bento-check-text\s*\{([^}]+)\}/);
  assert.ok(checkTextMatch, "必须包含 .bento-check-text 规则");
  assert.match(checkTextMatch[1], /display:\s*inline-flex/, "复选框文字必须为 inline-flex 确保文字垂直居中");

  // 1.6 验证旧的排版冲突类名已完全清除
  assert.doesNotMatch(css, /\.bento-title-row/, "废弃的 .bento-title-row 类必须彻底移除");
  assert.doesNotMatch(css, /\.bento-card-actions/, "废弃的 .bento-card-actions 类必须彻底移除");
});

test("消融测试 2: 删除按钮右上角绝对定位与悬浮无障碍消融 (Hover & A11y Invariants)", async () => {
  const css = await readFile("app/globals.css", "utf8");

  // 2.1 右上角绝对定位：不占 flex 流宽度，从根源避免挤出第二行
  const delBtnMatch = css.match(/\.paper-btn-del\s*\{([^}]+)\}/);
  assert.ok(delBtnMatch, "必须包含 .paper-btn-del 规则");
  assert.match(delBtnMatch[1], /position:\s*absolute/, "删除按钮必须采用绝对定位 position: absolute");
  assert.match(delBtnMatch[1], /right:\s*0/, "删除按钮必须锚定在右上角 right: 0");
  assert.match(delBtnMatch[1], /opacity:\s*0/, "删除按钮默认状态必须透明隐藏 opacity: 0");
  assert.match(delBtnMatch[1], /pointer-events:\s*none/, "删除按钮默认状态必须禁用鼠标交互 pointer-events: none");
  assert.match(delBtnMatch[1], /width:\s*20px/, "删除按钮必须保留标准宽度 20px");

  // 2.2 悬浮态与键盘聚焦态：平滑显示并开启鼠标交互
  const hoverDelMatch = css.match(/\.sprint-bento-card:hover\s+\.paper-btn-del/);
  assert.ok(hoverDelMatch, "卡片 hover 时必须联动显示删除按钮");

  const focusDelMatch = css.match(/\.paper-btn-del:focus-visible/);
  assert.ok(focusDelMatch, "必须支持键盘 Tab 聚焦显示 :focus-visible");

  // 2.3 按钮直接悬浮态：红底珊瑚色高亮
  const directHoverMatch = css.match(/\.paper-btn-del:hover\s*\{([^}]+)\}/);
  assert.ok(directHoverMatch, "必须包含 .paper-btn-del:hover 直接高亮规则");
  assert.match(directHoverMatch[1], /color:\s*var\(--coral\)/, "删除按钮 hover 应显示珊瑚红");

  // 2.4 触屏保底规则：无 hover 能力的设备上保持适度可见
  assert.match(css, /@media\s*\(\s*hover:\s*none\s*\)/, "必须包含针对移动触屏的 @media (hover: none) 降级适配");
});

test("消融测试 3: 模拟卷头部单行结构统一性消融 (Component Markup Invariants)", async () => {
  const tsx = await readFile("app/study-dashboard.tsx", "utf8");

  // 3.1 模拟卷必须与真题共享单行结构且包含 bento-card-top--mock
  assert.match(
    tsx,
    /<div className="bento-card-top bento-card-top--mock">\s*<div className="bento-title-wrap"/,
    "模拟卷必须使用单行 bento-card-top bento-card-top--mock 结构",
  );

  // 3.2 模拟卷删除按钮必须置于右上角且拥有完整无障碍标签
  assert.match(
    tsx,
    /<button[^>]*className="paper-btn-del"[^>]*title="删除该模拟卷"[^>]*aria-label=/,
    "删除按钮必须包含 title 与 aria-label 辅助阅读语义",
  );
});

test("消融测试 4: 试卷分数与状态全排列消融 (Data & State Permutations)", () => {
  // 4.1 科目满分边界消融
  assert.equal(maxPaperScore("408"), 150);
  assert.equal(maxPaperScore("math"), 150);
  assert.equal(maxPaperScore("english"), 100);
  assert.equal(maxPaperScore("politics"), 50);

  // 4.2 数据状态消融：空值、零分、浮点数、极值
  const testCases = [
    { score: null, completed: false, secondRound: false },
    { score: 0, completed: true, secondRound: false },
    { score: 112.5, completed: true, secondRound: true, secondRoundAt: "2026-11-15" },
    { score: 150, completed: true, secondRound: true, secondRoundAt: "2026-11-20" },
  ];

  for (const tc of testCases) {
    const raw = [{
      id: "mock-test-1",
      kind: "mock",
      area: "408",
      title: "合工大共创 卷一",
      groupName: "合工大超越共创",
      score: tc.score,
      completed: tc.completed,
      secondRound: tc.secondRound,
      secondRoundAt: tc.secondRoundAt ?? "",
      completedAt: tc.completed ? "2026-11-10" : "",
    }];
    const normalized = normalizePapers(raw, defaultPastPapers());
    const paper = normalized.find((p) => p.id === "mock-test-1");
    assert.ok(paper, "标准化必须保留测试模拟卷");
    assert.equal(paper.score, tc.score, `分数 ${tc.score} 必须严格保持`);
    assert.equal(paper.completed, tc.completed, `完成态 ${tc.completed} 必须严格保持`);
    assert.equal(paper.secondRound, tc.secondRound, `二刷态 ${tc.secondRound} 必须严格保持`);
  }

  // 4.3 模拟卷墓碑删除消融：删除后本地与多端合并均生效
  const base = defaultPastPapers();
  const mockPaper = {
    id: "mock-delete-ablation",
    kind: "mock",
    area: "math",
    title: "李林考前冲刺6套卷 (卷一)",
    groupName: "李林6套卷",
    completed: false,
    score: null,
  };
  const withMock = [...base, mockPaper];
  const normalizedWithMock = normalizePapers(withMock, base);
  assert.ok(normalizedWithMock.some((p) => p.id === "mock-delete-ablation"));

  // 标记删除（墓碑状态）
  const deletedMock = {
    ...mockPaper,
    deleted: true,
    deletedAt: "2026-09-03T14:30:00Z",
  };
  const mergedAfterDelete = mergePapers(normalizedWithMock, [...base, deletedMock]);
  assert.equal(
    mergedAfterDelete.some((p) => p.id === "mock-delete-ablation" && !p.deleted),
    false,
    "已墓碑删除的模拟卷在合并后不应出现在活跃试卷列表中",
  );
});

test("消融测试 5: 套卷冲刺容器解构与完成态视觉消融 (Container Deconstruction & Completion Visual Invariants)", async () => {
  const css = await readFile("app/globals.css", "utf8");

  // 5.1 验证外层 .sprint-section 解构：消除双重卡片嵌套与 padding 侵蚀
  const sectionMatch = css.match(/\.sprint-section\s*\{([^}]+)\}/);
  assert.ok(sectionMatch, "必须包含 .sprint-section 规则");
  assert.match(sectionMatch[1], /background:\s*transparent/, "sprint-section 必须为透明背景");
  assert.match(sectionMatch[1], /border:\s*none/, "sprint-section 必须移除边框");
  assert.match(sectionMatch[1], /padding:\s*0/, "sprint-section 必须移除 padding 释放横向宽度");
  assert.match(sectionMatch[1], /box-shadow:\s*none/, "sprint-section 必须移除阴影");

  // 5.2 验证完成态卡片底色归正为统一白色
  const completedCardMatch = css.match(/\.sprint-bento-card\.completed\s*\{([^}]+)\}/);
  assert.ok(completedCardMatch, "必须包含 .sprint-bento-card.completed 规则");
  assert.match(completedCardMatch[1], /background:\s*#ffffff/, "完成态卡片必须保持白底");
  assert.match(completedCardMatch[1], /border-left:\s*3\.5px\s*solid\s*var\(--green\)/, "完成态卡片必须保留绿色左条微标");

  // 5.3 验证废除黑底反色年份药丸，归正为灰绿低饱和标签
  const completedYearMatch = css.match(/\.sprint-bento-card\.completed\s+\.bento-year-pill\s*\{([^}]+)\}/);
  assert.ok(completedYearMatch, "必须包含 .sprint-bento-card.completed .bento-year-pill 规则");
  assert.doesNotMatch(completedYearMatch[1], /var\(--sidebar-soft\)/, "完成态年份药丸严禁使用黑底反色 var(--sidebar-soft)");
  assert.match(completedYearMatch[1], /rgba\(124,\s*172,\s*133/, "完成态年份药丸必须使用柔和灰绿背景与边框");

  // 5.4 验证模拟卷进度条双色渐变收敛
  const endlessFillMatch = css.match(/\.endless-fill\s*\{([^}]+)\}/);
  assert.ok(endlessFillMatch, "必须包含 .endless-fill 规则");
  assert.match(endlessFillMatch[1], /linear-gradient\(90deg,\s*var\(--blue\),\s*var\(--coral\)\)/, "模拟卷进度条必须为蓝至珊瑚平滑渐变");
  assert.doesNotMatch(endlessFillMatch[1], /#e8b277/, "模拟卷进度条严禁出现中间黄色断层");

  // 5.5 验证日期选择器平滑过渡与 Footer 稳定性
  const footerMatch = css.match(/\.bento-card-footer\s*\{([^}]+)\}/);
  assert.ok(footerMatch, "必须包含 .bento-card-footer 规则");
  assert.match(footerMatch[1], /min-height:\s*28px/, "Footer 必须声明 min-height 28px 稳定排版");
  assert.match(css, /@keyframes\s+bento-fade-in/, "必须包含 bento-fade-in 淡入关键帧动画");
});

test("消融测试 6: 答题卡交互入口收敛与热力图只读消融 (Heatmap & Open Button Affordance Invariants)", async () => {
  const tsx = await readFile("app/study-dashboard.tsx", "utf8");
  const css = await readFile("app/globals.css", "utf8");

  // 6.1 TSX 验证：热力图容器必须为只读 <div>，禁止为外层 <button>
  assert.match(
    tsx,
    /<div className="bento-mini-heatmap">/,
    "热力图最外层容器必须使用语义化 div，不可使用 button",
  );
  assert.doesNotMatch(
    tsx,
    /<button[^>]*className="bento-mini-heatmap"/,
    "严禁将热力图全区包裹为 button 导致误触",
  );

  // 6.2 TSX 验证：打开弹窗必须由独立的 mini-heatmap-open-btn 承载
  assert.match(
    tsx,
    /<button[^>]*className="mini-heatmap-open-btn"[^>]*onClick=\{[^}]*setActivePaperQuestionModalId/,
    "必须由独立的【答题卡 ↗】按钮显式触发弹窗",
  );

  // 6.3 CSS 验证：热力图容器默认光标，打开按钮具备独立交互样式
  const heatmapMatch = css.match(/\.bento-mini-heatmap\s*\{([^}]+)\}/);
  assert.ok(heatmapMatch, "必须包含 .bento-mini-heatmap 规则");
  assert.match(heatmapMatch[1], /cursor:\s*default/, "热力图全区必须为 cursor: default");

  const openBtnMatch = css.match(/\.mini-heatmap-open-btn\s*\{([^}]+)\}/);
  assert.ok(openBtnMatch, "必须包含 .mini-heatmap-open-btn 规则");
  assert.match(openBtnMatch[1], /cursor:\s*pointer/, "答题卡打开按钮必须为 cursor: pointer");

  const openBtnHoverMatch = css.match(/\.mini-heatmap-open-btn:hover\s*\{([^}]+)\}/);
  assert.ok(openBtnHoverMatch, "答题卡打开按钮必须具备 hover 反馈");
});

test("消融测试 7: 一刷与二刷状态机联动与级联消融 (First & Second Round Cascade Invariants)", async () => {
  const tsx = await readFile("app/study-dashboard.tsx", "utf8");

  // 7.1 取消一刷时必须级联重置二刷
  assert.match(
    tsx,
    /secondRound:\s*completed\s*\?\s*p\.secondRound\s*:\s*false/,
    "togglePaperCompleted 中取消一刷必须将 secondRound 重置为 false",
  );
  assert.match(
    tsx,
    /secondRoundAt:\s*completed\s*\?\s*p\.secondRoundAt\s*:\s*""/,
    "togglePaperCompleted 中取消一刷必须清空 secondRoundAt",
  );

  // 7.2 勾选二刷时必须自动联动标记一刷
  assert.match(
    tsx,
    /const nextCompleted = secondRound \? true : p\.completed;/,
    "togglePaperSecondRound 中勾选二刷必须将 completed 提升为 true",
  );

  // 7.3 effectiveSprintTab 派生状态防止空白页
  assert.match(
    tsx,
    /const effectiveSprintTab =\s*\(activeArea === "english" \|\| activeArea === "politics"\) && sprintTab === "mock" \? "all" : sprintTab;/,
    "必须声明 effectiveSprintTab 消除英语与政治切换时的空白页缺陷",
  );

  // 7.4 复选框文案与提示
  assert.match(
    tsx,
    /!paper\.completed \? "标记二刷（将同步标记一刷）" : "标记二刷"/,
    "未一刷时二刷复选框必须提示用户将同步标记一刷",
  );
});

