import test from "node:test";
import assert from "node:assert/strict";
import {
  generateJournalId,
  normalizeJournals,
  normalizeAppData,
  SCHEMA_VERSION,
  createAppData,
} from "../app/study-data.ts";
import { renderMarkdownWithKaTeX, getMarkdownSummary } from "../app/lib/markdown.ts";

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
  assert.equal(normalized[1].context?.sectionId, "os-2-3");
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

test("Markdown & KaTeX 渲染: 屏蔽下划线与星号干扰并正确转换公式", () => {
  const markdown = `# 算法分析
对于快速排序的时间复杂度为 $O(n \\log n)$，其递归式为 $T(n) = 2T(n/2) + O(n)$。
注意公式下标 $a_i + b_j$ 不应被错误渲染为斜体。

块级公式：
$$
\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

- [x] 掌握第一类换元法
- [ ] 掌握分部积分法
`;

  const html = renderMarkdownWithKaTeX(markdown);

  // 验证包含 KaTeX 渲染生成的 math class
  assert.ok(html.includes("katex"));
  assert.ok(html.includes("katex-display"));
  // 验证任务列表包含 checkbox
  assert.ok(html.includes('type="checkbox"'));
  // 验证下标没有被解析为 <em> 破损标签
  assert.ok(!html.includes("<em>i + b</em>"));
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
