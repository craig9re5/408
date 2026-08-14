import test from "node:test";
import assert from "node:assert/strict";
import {
  generateJournalId,
  normalizeJournals,
  normalizeJournalContext,
  normalizeAppData,
  mergeJournals,
  SCHEMA_VERSION,
  createAppData,
} from "../app/study-data.ts";
import { renderMarkdownWithKaTeX, getMarkdownSummary, sanitizeHtml } from "../app/lib/markdown.ts";

const mockDefaultProgress = () => ({});

test("Journal ID: 单调自增且删除后不会复用序号", () => {
  const date = "2026-08-14";
  const initial = [];

  const id1 = generateJournalId(initial, date);
  assert.equal(id1, "20260814001");

  const entries1 = [
    {
      id: id1,
      createdAt: "2026-08-14T10:00:00Z",
      updatedAt: "2026-08-14T10:00:00Z",
      title: "First",
      content: "Content 1",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
    },
  ];

  const id2 = generateJournalId(entries1, date);
  assert.equal(id2, "20260814002");

  const entries2 = [
    ...entries1,
    {
      id: id2,
      createdAt: "2026-08-14T11:00:00Z",
      updatedAt: "2026-08-14T11:00:00Z",
      title: "Second",
      content: "Content 2",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
    },
  ];

  const id3 = generateJournalId(entries2, date);
  assert.equal(id3, "20260814003");

  // 模拟删除 id2 (20260814002)，留下 001 和 003
  const entriesWithGap = [entries2[0], { ...entries2[1], id: "20260814003" }];
  const idNext = generateJournalId(entriesWithGap, date);
  // 新生成的序号应该是 004，不复用被删除的 002
  assert.equal(idNext, "20260814004");
});

test("JournalContext: 底层支持 project / subject / section 三级结构并容错", () => {
  // 1. project 级上下文
  const projectCtx = normalizeJournalContext({
    type: "project",
    area: "408",
  });
  assert.deepEqual(projectCtx, { type: "project", area: "408" });

  // 2. subject 级上下文
  const subjectCtx = normalizeJournalContext({
    type: "subject",
    area: "math",
    bookId: "higher-mathematics",
    bookTitle: "高等数学",
  });
  assert.deepEqual(subjectCtx, {
    type: "subject",
    area: "math",
    bookId: "higher-mathematics",
    bookTitle: "高等数学",
  });

  // 3. section 级上下文
  const sectionCtx = normalizeJournalContext({
    type: "section",
    area: "408",
    bookId: "operating-system",
    sectionId: "os-2-3",
    bookTitle: "操作系统",
    sectionTitle: "CPU 调度",
    sectionNumber: "2.3",
  });
  assert.deepEqual(sectionCtx, {
    type: "section",
    area: "408",
    bookId: "operating-system",
    sectionId: "os-2-3",
    bookTitle: "操作系统",
    sectionTitle: "CPU 调度",
    sectionNumber: "2.3",
  });

  // 4. 非法或缺字段的上下文 -> 归一化为 null
  assert.equal(normalizeJournalContext(null), null);
  assert.equal(normalizeJournalContext({ type: "unknown", area: "408" }), null);
  assert.equal(normalizeJournalContext({ type: "subject", area: "408" }), null); // 缺少 bookId
  assert.equal(normalizeJournalContext({ type: "section", area: "408", bookId: "os" }), null); // 缺少 sectionId
});

test("Journal 数据标准化: 校验并填充默认结构与发布状态", () => {
  const rawList = [
    {
      id: "20260814001",
      createdAt: "2026-08-14T10:00:00Z",
      content: "测试内容",
      // 缺少 title, context, publish
    },
    {
      id: "20260814002",
      createdAt: "2026-08-14T11:00:00Z",
      title: "带标题",
      content: "带上下文内容",
      context: {
        type: "section",
        area: "408",
        bookId: "operating-system",
        sectionId: "os-2-3",
        bookTitle: "操作系统",
        sectionTitle: "CPU调度算法",
        sectionNumber: "2.3",
      },
      publish: {
        status: "published",
        publishedAt: "2026-08-14T12:00:00Z",
        blogUrl: "https://craig9re5.github.io/posts/20260814002/",
        blogPostId: "20260814002",
      },
    },
    // 非法数据
    null,
    { invalid: true },
  ];

  const normalized = normalizeJournals(rawList);
  assert.equal(normalized.length, 2);

  // 第一条填充了默认 publish 与 null context
  assert.equal(normalized[0].id, "20260814001");
  assert.equal(normalized[0].title, null);
  assert.equal(normalized[0].context, null);
  assert.equal(normalized[0].publish.status, "local");
  assert.equal(normalized[0].publish.publishedAt, null);

  // 第二条保持完整上下文与发布状态
  assert.equal(normalized[1].id, "20260814002");
  assert.equal(normalized[1].title, "带标题");
  assert.equal(normalized[1].context?.type, "section");
  if (normalized[1].context?.type === "section") {
    assert.equal(normalized[1].context.sectionId, "os-2-3");
  }
  assert.equal(normalized[1].publish.status, "published");
  assert.equal(normalized[1].publish.blogPostId, "20260814002");
});

test("Schema 自动升级: V1 数据无缝迁移为 V2 并带有 journals 数组", () => {
  const v1Data = {
    schemaVersion: 1,
    appVersion: "1.7.0",
    progress: {
      "os-1-1": { plannedAt: "2026-08-14", learned: true, learnedAt: "2026-08-14", reviewed: false, reviewedAt: "" },
    },
    projectSettings: {
      "408": { examDate: "2026-12-19" },
      math: { examDate: "2026-12-19" },
    },
    planHistory: [],
  };

  const migrated = normalizeAppData(v1Data, mockDefaultProgress());
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.journals, []);
  assert.equal(migrated.progress["os-1-1"].learned, true);
});

test("Markdown XSS 安全防护: 阻断 script/onerror/javascript 伪协议注入", () => {
  // 1. Script 标签转义
  const scriptInput = `Hello <script>alert('xss')</script> World`;
  const scriptHtml = renderMarkdownWithKaTeX(scriptInput);
  assert.ok(!scriptHtml.includes("<script>"));
  assert.ok(scriptHtml.includes("&lt;script&gt;"));

  // 2. Img onerror 注入
  const imgInput = `<img src="x" onerror="alert(1)">`;
  const imgHtml = renderMarkdownWithKaTeX(imgInput);
  assert.ok(!imgHtml.includes("<img src"));
  assert.ok(imgHtml.includes("&lt;img src="));

  // 3. Iframe 标签
  const iframeInput = `<iframe src="javascript:alert(1)"></iframe>`;
  const iframeHtml = renderMarkdownWithKaTeX(iframeInput);
  assert.ok(!iframeHtml.includes("<iframe"));

  // 4. Markdown 链接中的 javascript: 伪协议
  const linkInput = `[点击跳转](javascript:alert(document.cookie))`;
  const linkHtml = renderMarkdownWithKaTeX(linkInput);
  assert.ok(!linkHtml.includes('href="javascript:'));
  assert.ok(linkHtml.includes('href="#"'));

  // 5. sanitizeHtml 单元测试
  const dirty = `<div onclick="evil()">Safe text</div><style>body{display:none}</style><a href="vbscript:msgbox">Click</a>`;
  const clean = sanitizeHtml(dirty);
  assert.ok(!clean.includes("onclick"));
  assert.ok(!clean.includes("<style>"));
  assert.ok(!clean.includes("vbscript:"));
});

test("Markdown + KaTeX 边界测试: 转义符、代码块中包含$、连续与多行公式", () => {
  // 1. 转义 \$
  const escapedInput = `苹果价格是 \\$5，西瓜价格是 \\$10。`;
  const escapedHtml = renderMarkdownWithKaTeX(escapedInput);
  assert.ok(!escapedHtml.includes("katex"));
  assert.ok(escapedHtml.includes("$5"));
  assert.ok(escapedHtml.includes("$10"));

  // 2. 行内代码包含 $
  const inlineCodeInput = `在 PHP 中使用 \`$variable = $foo + $bar;\` 声明变量。`;
  const inlineCodeHtml = renderMarkdownWithKaTeX(inlineCodeInput);
  assert.ok(inlineCodeHtml.includes("<code>$variable = $foo + $bar;</code>"));
  assert.ok(!inlineCodeHtml.includes("katex"));

  // 3. 代码块包含 $
  const blockCodeInput = `\`\`\`bash\n$ npm install\n$ echo $PATH\n\`\`\``;
  const blockCodeHtml = renderMarkdownWithKaTeX(blockCodeInput);
  assert.ok(blockCodeHtml.includes("$ npm install"));
  assert.ok(blockCodeHtml.includes("$ echo $PATH"));
  assert.ok(!blockCodeHtml.includes("katex"));

  // 4. 连续公式
  const multiInlineInput = `设 $a=1$, $b=2$, $c=3$，且 $x=1$$y=2$。`;
  const multiInlineHtml = renderMarkdownWithKaTeX(multiInlineInput);
  assert.ok(multiInlineHtml.includes("katex"));

  // 5. 多行 $$...$$ 块级公式
  const multilineBlockInput = `$$
\\begin{cases}
x + y = 1 \\\\
x - y = 0
\\end{cases}
$$`;
  const multilineBlockHtml = renderMarkdownWithKaTeX(multilineBlockInput);
  assert.ok(multilineBlockHtml.includes("katex-display"));

  // 6. 未闭合 $ 与孤立单 $ 符号
  const singleDollarInput = `普通文本中的单 $ 符号，以及单独的一句话。`;
  const singleDollarHtml = renderMarkdownWithKaTeX(singleDollarInput);
  assert.ok(singleDollarHtml.includes("$ 符号"));

  // 7. 公式内部包含 Markdown 特殊字符 _, *, \\, |, ~
  const complexFormula = `计算期望 $\\sum_{i=1}^n x_i^* \\cdot \\tilde{y}_i$ 与行列式 $\\det |A|$。`;
  const complexHtml = renderMarkdownWithKaTeX(complexFormula);
  assert.ok(complexHtml.includes("katex"));
  // 确保公式里的 _ 和 * 不会被 marked 解析成 <em>
  assert.ok(!complexHtml.includes("<em>i=1"));
});

test("多设备同步冲突: mergeJournals 基于 ID 和时间戳实现无丢失合并", () => {
  const deviceA_journals = [
    {
      id: "20260814001",
      createdAt: "2026-08-14T10:00:00Z",
      updatedAt: "2026-08-14T10:00:00Z",
      title: "设备A新建的日志1",
      content: "内容A1",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
    },
    {
      id: "20260814002",
      createdAt: "2026-08-14T10:10:00Z",
      updatedAt: "2026-08-14T10:10:00Z",
      title: "共同的日志2-原版",
      content: "内容2原版",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
    },
  ];

  const deviceB_journals = [
    {
      id: "20260814002",
      createdAt: "2026-08-14T10:10:00Z",
      updatedAt: "2026-08-14T10:20:00Z", // 设备B编辑了此篇
      title: "共同的日志2-设备B编辑版",
      content: "内容2被设备B更新",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
    },
    {
      id: "20260814003",
      createdAt: "2026-08-14T10:30:00Z",
      updatedAt: "2026-08-14T10:30:00Z",
      title: "设备B并发新建的日志3",
      content: "内容B3",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
    },
  ];

  // 合并双端
  const merged = mergeJournals(deviceA_journals, deviceB_journals);

  // 1. 三条日志全部保留（没有哪条被丢弃覆盖）
  assert.equal(merged.length, 3);

  // 2. 日志 2 采用了 updatedAt 较新的设备B版本
  const entry2 = merged.find((item) => item.id === "20260814002");
  assert.ok(entry2);
  assert.equal(entry2.title, "共同的日志2-设备B编辑版");
  assert.equal(entry2.content, "内容2被设备B更新");

  // 3. 设备A新建的 001 与设备B新建的 003 均存在
  assert.ok(merged.some((item) => item.id === "20260814001"));
  assert.ok(merged.some((item) => item.id === "20260814003"));
});

test("Markdown Summary: 准确截取前缀纯文本并忽略公式特殊符号", () => {
  const content = `# 操作系统调度算法
所谓调度就是解决多个任务在有限资源下的分配次序。
设进程集合为 $P = \\{p_1, p_2, \\dots, p_n\\}$，优先级为 $pri(p_i)$。
详细调度策略包括 FCFS、SJF、RR 等等...`;

  const summary = getMarkdownSummary(content, 60);
  assert.ok(summary.length <= 65);
  assert.ok(summary.includes("操作系统调度算法"));
});

test("createAppData: 打包导出数据包含 journals 与最新 schema", () => {
  const progress = mockDefaultProgress();
  const settings = { "408": { examDate: "2026-12-19" }, math: { examDate: "2026-12-19" } };
  const journals = [
    {
      id: "20260814001",
      createdAt: "2026-08-14T10:00:00Z",
      updatedAt: "2026-08-14T10:00:00Z",
      title: "导出测试",
      content: "测试内容",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
    },
  ];

  const appData = createAppData(progress, settings, [], journals);
  assert.equal(appData.schemaVersion, 2);
  assert.equal(appData.journals.length, 1);
  assert.equal(appData.journals[0].id, "20260814001");
});
