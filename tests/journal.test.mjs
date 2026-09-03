import assert from "node:assert/strict";
import test from "node:test";

import {
  SCHEMA_VERSION,
  createAppData,
  extractJournalSections,
  generateJournalId,
  mergeJournals,
  normalizeAppData,
  normalizeJournalContext,
  normalizeJournals,
} from "../app/study-data.ts";

test("Journal ID 生成: 单调自增，同一天多次记录序号递增，删除历史记录后不复用旧序号", () => {
  const date = "2026-08-15";
  const initial = [];

  const id1 = generateJournalId(initial, date);
  assert.equal(id1, "20260815001");

  const list1 = [
    {
      id: id1,
      createdAt: "2026-08-15T10:00:00Z",
      updatedAt: "2026-08-15T10:00:00Z",
      title: "第一条",
      content: "内容 1",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
      important: false,
    },
  ];

  const id2 = generateJournalId(list1, date);
  assert.equal(id2, "20260815002");

  const list2 = [
    ...list1,
    {
      id: id2,
      createdAt: "2026-08-15T11:00:00Z",
      updatedAt: "2026-08-15T11:00:00Z",
      title: "第二条",
      content: "内容 2",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
      important: false,
    },
  ];

  const id3 = generateJournalId(list2, date);
  assert.equal(id3, "20260815003");

  // 模拟删除中间的 id2 (002)，保留 001 和 003
  const listWithGap = [list2[0], { ...list2[1], id: "20260815003" }];
  const idNext = generateJournalId(listWithGap, date);
  // 新生成的序号应该是 004，绝对不复用被删除的 002 空隙
  assert.equal(idNext, "20260815004");

  // 跨天生成新序号，序号应从 001 重新开始
  const nextDayId = generateJournalId(list2, "2026-08-16");
  assert.equal(nextDayId, "20260816001");
});

test("JournalContext: 支持 project / subject / section / sections / paper 多级上下文与容错清洗", () => {
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

  // 3. section 级上下文 (单小节)
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

  // 4. paper 级上下文 (试卷日志)
  const paperCtx = normalizeJournalContext({
    type: "paper",
    area: "408",
    paperId: "past-408-2025",
    paperTitle: "2025年408真题",
  });
  assert.deepEqual(paperCtx, {
    type: "paper",
    area: "408",
    paperId: "past-408-2025",
    paperTitle: "2025年408真题",
  });

  // 5. sections 级多小节上下文（支持自动去重与非法项过滤）
  const multiSectionCtx = normalizeJournalContext({
    type: "sections",
    sections: [
      {
        area: "408",
        bookId: "operating-system",
        sectionId: "os-2-3",
        bookTitle: "操作系统",
        sectionTitle: "CPU 调度",
        sectionNumber: "2.3",
      },
      {
        area: "math",
        bookId: "linear-algebra",
        sectionId: "la-1-1",
        bookTitle: "线性代数",
        sectionTitle: "行列式",
        sectionNumber: "1.1",
      },
      // 重复的 sectionId 必须被剔除
      {
        area: "408",
        bookId: "operating-system",
        sectionId: "os-2-3",
        bookTitle: "操作系统",
      },
      // 缺少必要字段的非法小节
      { invalid: true },
      null,
    ],
  });
  assert.deepEqual(multiSectionCtx, {
    type: "sections",
    sections: [
      {
        area: "408",
        bookId: "operating-system",
        sectionId: "os-2-3",
        bookTitle: "操作系统",
        sectionTitle: "CPU 调度",
        sectionNumber: "2.3",
      },
      {
        area: "math",
        bookId: "linear-algebra",
        sectionId: "la-1-1",
        bookTitle: "线性代数",
        sectionTitle: "行列式",
        sectionNumber: "1.1",
      },
    ],
  });

  // 6. extractJournalSections 统一提取辅助方法
  const extractedSingle = extractJournalSections(sectionCtx);
  assert.equal(extractedSingle.length, 1);
  assert.equal(extractedSingle[0].sectionId, "os-2-3");

  const extractedMulti = extractJournalSections(multiSectionCtx);
  assert.equal(extractedMulti.length, 2);
  assert.equal(extractedMulti[0].sectionId, "os-2-3");
  assert.equal(extractedMulti[1].sectionId, "la-1-1");

  assert.deepEqual(extractJournalSections(projectCtx), []);
  assert.deepEqual(extractJournalSections(paperCtx), []);
  assert.deepEqual(extractJournalSections(null), []);

  // 7. 异常或缺少必要字段的上下文归一化为 null
  assert.equal(normalizeJournalContext(null), null);
  assert.equal(normalizeJournalContext({ type: "unknown", area: "408" }), null);
  assert.equal(normalizeJournalContext({ type: "subject", area: "408" }), null); // 缺少 bookId
  assert.equal(normalizeJournalContext({ type: "section", area: "408", bookId: "os" }), null); // 缺少 sectionId
  assert.equal(normalizeJournalContext({ type: "paper", area: "408" }), null); // 缺少 paperId
  assert.equal(normalizeJournalContext({ type: "sections", sections: [] }), null); // 空 sections 数组
});

test("Journal 数据标准化与重点标记: 填充默认发布状态，保留重要标记并支持精准筛选", () => {
  const rawList = [
    {
      id: "20260815001",
      createdAt: "2026-08-15T10:00:00Z",
      content: "普通本地笔记",
      // 缺少 title, context, publish, important
    },
    {
      id: "20260815002",
      createdAt: "2026-08-15T11:00:00Z",
      title: "重点日志",
      content: "含有重要标记和发布信息",
      context: {
        type: "section",
        area: "408",
        bookId: "operating-system",
        sectionId: "os-2-3",
        bookTitle: "操作系统",
        sectionTitle: "CPU调度",
        sectionNumber: "2.3",
      },
      publish: {
        status: "published",
        publishedAt: "2026-08-15T12:00:00Z",
        blogUrl: "https://example.com/p/20260815002",
        blogPostId: "post-002",
      },
      important: true,
    },
    null,
    { invalid: "data" },
  ];

  const normalized = normalizeJournals(rawList);
  assert.equal(normalized.length, 2);

  // 第一条记录填充默认值
  assert.equal(normalized[0].id, "20260815001");
  assert.equal(normalized[0].title, null);
  assert.equal(normalized[0].context, null);
  assert.equal(normalized[0].publish.status, "local");
  assert.equal(normalized[0].publish.publishedAt, null);
  assert.equal(normalized[0].important, false);

  // 第二条记录保持原有的完整字段
  assert.equal(normalized[1].id, "20260815002");
  assert.equal(normalized[1].title, "重点日志");
  assert.equal(normalized[1].important, true);
  assert.equal(normalized[1].publish.status, "published");
  assert.equal(normalized[1].publish.blogPostId, "post-002");

  // 重点筛选断言
  const importantList = normalized.filter((j) => j.important);
  assert.equal(importantList.length, 1);
  assert.equal(importantList[0].id, "20260815002");
});

test("Schema 自动升级与打包导出: V1数据无缝升级至V2并挂载 journals 数组", () => {
  const v1Data = {
    schemaVersion: 1,
    appVersion: "1.7.0",
    progress: {
      "os-1-1": { plannedAt: "2026-08-15", learned: true, learnedAt: "2026-08-15", reviewed: false, reviewedAt: "" },
    },
    projectSettings: {
      "408": { examDate: "2026-12-19" },
      math: { examDate: "2026-12-19" },
    },
    planHistory: [],
  };

  const migrated = normalizeAppData(v1Data, {});
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.journals, []);
  assert.equal(migrated.progress["os-1-1"].learned, true);

  // 打包导出验证
  const exported = createAppData({}, {}, [], [
    {
      id: "20260815001",
      createdAt: "2026-08-15T10:00:00Z",
      updatedAt: "2026-08-15T10:00:00Z",
      title: "导出校验",
      content: "测试内容",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
      important: false,
    },
  ]);
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.journals.length, 1);
  assert.equal(exported.journals[0].id, "20260815001");
});

test("多设备同步冲突解决: mergeJournals 基于 ID 与 updatedAt 时间戳执行 LWW 无丢失合并", () => {
  const deviceA = [
    {
      id: "20260815001",
      createdAt: "2026-08-15T10:00:00Z",
      updatedAt: "2026-08-15T10:00:00Z",
      title: "设备A独占新增",
      content: "A1",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
      important: false,
    },
    {
      id: "20260815002",
      createdAt: "2026-08-15T10:10:00Z",
      updatedAt: "2026-08-15T10:10:00Z",
      title: "共同日记-旧版",
      content: "内容旧版",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
      important: false,
    },
  ];

  const deviceB = [
    {
      id: "20260815002",
      createdAt: "2026-08-15T10:10:00Z",
      updatedAt: "2026-08-15T10:30:00Z", // 设备B在更新的时间修改了此篇
      title: "共同日记-新版B",
      content: "内容已在B更新",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
      important: true, // B标记了重点
    },
    {
      id: "20260815003",
      createdAt: "2026-08-15T10:20:00Z",
      updatedAt: "2026-08-15T10:20:00Z",
      title: "设备B独占新增",
      content: "B3",
      context: null,
      publish: { status: "local", publishedAt: null, blogUrl: null, blogPostId: null },
      important: false,
    },
  ];

  const merged = mergeJournals(deviceA, deviceB);

  // 1. 三篇日志均被保留，不发生静默丢弃
  assert.equal(merged.length, 3);
  assert.ok(merged.some((j) => j.id === "20260815001"));
  assert.ok(merged.some((j) => j.id === "20260815003"));

  // 2. 发生冲突的 002 采用较晚 updatedAt 的设备B版本
  const entry2 = merged.find((j) => j.id === "20260815002");
  assert.ok(entry2);
  assert.equal(entry2.title, "共同日记-新版B");
  assert.equal(entry2.content, "内容已在B更新");
  assert.equal(entry2.important, true);

  // 3. 时间戳完全相同时，稳定保留前一个版本
  const sameTimeA = [{ ...deviceA[0], updatedAt: "2026-08-15T12:00:00Z", title: "A版" }];
  const sameTimeB = [{ ...deviceA[0], updatedAt: "2026-08-15T12:00:00Z", title: "B版" }];
  const mergedSame = mergeJournals(sameTimeA, sameTimeB);
  assert.equal(mergedSame[0].title, "A版");
});
