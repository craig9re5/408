import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CS408_PAPER_STRUCTURE,
  ENGLISH_PAPER_STRUCTURE,
  MATH_PAPER_STRUCTURE,
  clampPaperScore,
  defaultPastPapers,
  mergePapers,
  normalizePaperRecord,
  normalizePapers,
  parseQuestionRanges,
} from "../app/study-data.ts";

test("Sprint 真题骨架生成: 生成全四科61套真题基准数据且状态干净", () => {
  const papers = defaultPastPapers();
  // 408(17) + 数学(17) + 英语(17) + 政治(10) = 61套
  assert.equal(papers.length, 61);

  // 408 真题
  const past408 = papers.filter((p) => p.area === "408" && p.kind === "past");
  assert.equal(past408.length, 17);
  assert.equal(past408[0].year, 2026);
  assert.equal(past408[16].year, 2010);
  assert.equal(past408[0].completed, false);
  assert.equal(past408[0].score, null);
  assert.equal(past408[0].secondRound, false);

  // 数学真题
  const pastMath = papers.filter((p) => p.area === "math" && p.kind === "past");
  assert.equal(pastMath.length, 17);
  assert.equal(pastMath[0].year, 2026);

  // 英语真题
  const pastEnglish = papers.filter((p) => p.area === "english" && p.kind === "past");
  assert.equal(pastEnglish.length, 17);
  assert.equal(pastEnglish[0].title, "2026年英语真题");

  // 政治真题 (2017~2026)
  const pastPolitics = papers.filter((p) => p.area === "politics" && p.kind === "past");
  assert.equal(pastPolitics.length, 10);
  assert.equal(pastPolitics[0].year, 2026);
  assert.equal(pastPolitics[9].year, 2017);
});

test("Visual Question Board 题型结构验证: 408、数学、英语题目分布与分值权重定义完备", () => {
  // 1. 408 试卷结构 (47题: 数构1-11, 组原12-22, 系统23-32, 网络33-40, 大题41-47)
  assert.equal(CS408_PAPER_STRUCTURE.total, 47);
  assert.equal(CS408_PAPER_STRUCTURE.groups.length, 8);
  assert.equal(CS408_PAPER_STRUCTURE.groups[0].subject, "数据结构");
  assert.equal(CS408_PAPER_STRUCTURE.groups[0].start, 1);
  assert.equal(CS408_PAPER_STRUCTURE.groups[0].end, 11);
  assert.equal(CS408_PAPER_STRUCTURE.groups[3].subject, "计算机网络");
  assert.equal(CS408_PAPER_STRUCTURE.groups[3].start, 33);
  assert.equal(CS408_PAPER_STRUCTURE.groups[3].end, 40);
  assert.equal(CS408_PAPER_STRUCTURE.groups[7].start, 47);

  // 2. 数学试卷结构 (22题: 选择1-10, 填空11-16, 解答17-22)
  assert.equal(MATH_PAPER_STRUCTURE.total, 22);
  assert.equal(MATH_PAPER_STRUCTURE.groups.length, 3);
  assert.equal(MATH_PAPER_STRUCTURE.groups[0].type, "选择题");
  assert.equal(MATH_PAPER_STRUCTURE.groups[0].start, 1);
  assert.equal(MATH_PAPER_STRUCTURE.groups[0].end, 10);
  assert.equal(MATH_PAPER_STRUCTURE.groups[1].start, 11);
  assert.equal(MATH_PAPER_STRUCTURE.groups[1].end, 16);
  assert.equal(MATH_PAPER_STRUCTURE.groups[2].start, 17);
  assert.equal(MATH_PAPER_STRUCTURE.groups[2].end, 22);

  // 3. 英语试卷结构 (52题: 完型1-20/0.5分, 传统阅读21-40/2分, 新题型41-45/2分, 翻译46-50, 写作51-52)
  assert.equal(ENGLISH_PAPER_STRUCTURE.total, 52);
  assert.equal(ENGLISH_PAPER_STRUCTURE.groups.length, 5);
  assert.equal(ENGLISH_PAPER_STRUCTURE.groups[0].scorePerQuestion, 0.5);
  assert.equal(ENGLISH_PAPER_STRUCTURE.groups[1].scorePerQuestion, 2.0);
  assert.equal(ENGLISH_PAPER_STRUCTURE.groups[2].scorePerQuestion, 2.0);
});

test("试卷分数校验与满分上限夹取: clampPaperScore 真实业务逻辑深度测试", () => {
  // 408 满分 150
  assert.equal(clampPaperScore(125.5, "408"), 125.5);
  assert.equal(clampPaperScore(160, "408"), 150);
  assert.equal(clampPaperScore(-10, "408"), 0);
  assert.equal(clampPaperScore("138.46", "408"), 138.5); // 四舍五入保留一位小数

  // 数学 满分 150
  assert.equal(clampPaperScore(150, "math"), 150);
  assert.equal(clampPaperScore(151, "math"), 150);
  assert.equal(clampPaperScore(-0.1, "math"), 0);

  // 英语 满分 100
  assert.equal(clampPaperScore(78.5, "english"), 78.5);
  assert.equal(clampPaperScore(105, "english"), 100);
  assert.equal(clampPaperScore(-5, "english"), 0);

  // 政治 满分 50 (专注于选择题模考分值)
  assert.equal(clampPaperScore(42.5, "politics"), 42.5);
  assert.equal(clampPaperScore(60, "politics"), 50);

  // 非法值与空值兜底
  assert.equal(clampPaperScore(null, "408"), null);
  assert.equal(clampPaperScore(undefined, "math"), null);
  assert.equal(clampPaperScore("not-a-number", "english"), null);
  assert.equal(clampPaperScore(NaN, "politics"), null);
});

test("批量错题题号与范围解析: parseQuestionRanges 支持复杂分隔符、波浪线、汉字区间与边界截断", () => {
  const total = 47;

  // 1. 混合输入：英文逗号、中文逗号、空格、区间、波浪线
  const input1 = "1, 3 5-8 10~12 43";
  const tokens1 = parseQuestionRanges(input1, total);
  assert.deepEqual(tokens1, [1, 3, 5, 6, 7, 8, 10, 11, 12, 43]);

  // 2. 中文分隔符与汉字区间："到"、"至"、顿号、分号
  const input2 = "2、4；15到17，20至22";
  const tokens2 = parseQuestionRanges(input2, total);
  assert.deepEqual(tokens2, [2, 4, 15, 16, 17, 20, 21, 22]);

  // 3. 反向区间自动纠偏（如用户误输入 8-5）
  const input3 = "8-5, 30";
  const tokens3 = parseQuestionRanges(input3, total);
  assert.deepEqual(tokens3, [5, 6, 7, 8, 30]);

  // 4. 重复数字去重与超出上限截断（超过47的题号被剔除）
  const input4 = "5, 5, 5, 46-50";
  const tokens4 = parseQuestionRanges(input4, total);
  assert.deepEqual(tokens4, [5, 46, 47]);

  // 5. 异常与空字符串输入安全容错
  assert.deepEqual(parseQuestionRanges("", total), []);
  assert.deepEqual(parseQuestionRanges("   ", total), []);
  assert.deepEqual(parseQuestionRanges("invalid text without numbers", total), []);
});

test("试卷标准化与多端合并: normalizePaperRecord 过滤非法题号，mergePapers 优先保留本地做题状态", () => {
  // 1. normalizePaperRecord 过滤非数字与越界题目
  const normalized = normalizePaperRecord({
    id: "past-408-2025",
    kind: "past",
    area: "408",
    title: "2025年408真题",
    completed: true,
    completedAt: "2026-10-15",
    score: 125,
    questions: {
      "1": "correct",
      "3": "wrong",
      "41": "partial",
      "999": "wrong", // 越界，应被过滤
    },
    questionScores: {
      "41": 8.5,
      "999": 10, // 越界，应被过滤
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.questions?.[1], "correct");
  assert.equal(normalized.questions?.[3], "wrong");
  assert.equal(normalized.questions?.[41], "partial");
  assert.equal(normalized.questions?.[999], undefined);
  assert.equal(normalized.questionScores?.[41], 8.5);
  assert.equal(normalized.questionScores?.[999], undefined);

  // 2. mergePapers 本地优先合约：本地正在编辑态拥有更高权威，显式清空 {} 不会被远端快照旧数据复活
  const localEdited = [
    {
      id: "past-408-2025",
      kind: "past",
      area: "408",
      title: "2025年408真题",
      completed: true,
      completedAt: "2026-10-15",
      questions: { 1: "correct", 2: "correct" },
      questionScores: { 41: 10 },
    },
  ];

  const remoteOld = [
    {
      id: "past-408-2025",
      kind: "past",
      area: "408",
      title: "2025年408真题",
      completed: true,
      completedAt: "2026-10-14",
      questions: { 1: "wrong", 2: "wrong", 3: "wrong" },
      questionScores: { 41: 5, 42: 6 },
    },
  ];

  const merged = mergePapers(localEdited, remoteOld);
  const p2025 = merged.find((p) => p.id === "past-408-2025");
  assert.equal(p2025?.questions?.[1], "correct");
  assert.equal(p2025?.questions?.[2], "correct");
  assert.equal(p2025?.questions?.[3], undefined); // 本地已修改，不保留远端遗留的第3题
  assert.equal(p2025?.questionScores?.[41], 10);
  assert.equal(p2025?.questionScores?.[42], undefined);

  // 3. 显式清空空对象 {} 获胜，阻止已清除的记录在云端同步后被还原
  const localCleared = [
    {
      ...localEdited[0],
      questions: {},
      questionScores: {},
    },
  ];
  const mergedCleared = mergePapers(localCleared, remoteOld);
  const targetCleared = mergedCleared.find((p) => p.id === "past-408-2025");
  assert.deepEqual(targetCleared?.questions, {});
  assert.deepEqual(targetCleared?.questionScores, {});
});

test("模拟卷真实墓碑删除与多端同步防复活流水线", () => {
  // 模拟场景：本地删除了 mock-2，生成 deletedPaperIds 墓碑
  const localPapers = [
    { id: "past-408-2026", kind: "past", area: "408", title: "2026真题", completed: false, completedAt: "", score: null, durationMinutes: null, secondRound: false, secondRoundAt: "" },
    { id: "mock-1", kind: "mock", area: "408", title: "模拟卷一", completed: true, completedAt: "2026-08-30", score: 120, durationMinutes: 180, secondRound: false, secondRoundAt: "" },
  ];

  // 远端 D1 数据库中依然存有历史上报的 mock-2
  const remotePapersInD1 = [
    ...localPapers,
    { id: "mock-2", kind: "mock", area: "408", title: "已被删除的模拟卷二", completed: false, completedAt: "", score: null, durationMinutes: null, secondRound: false, secondRoundAt: "" },
  ];

  const deletedPaperIds = ["mock-2"];

  // 模拟 worker writeAppData 的合并与过滤管道：
  // 1) 先将本地与远端 union 合并 (包含61套默认真题基线 + 2套模拟卷 = 63套)
  const unionMerged = mergePapers(localPapers, remotePapersInD1);
  assert.equal(unionMerged.length, 63); // 此时如果不应用墓碑，mock-2 会由于 union 复活

  // 2) 应用 deletedPaperIds 墓碑机制进行清洗
  const deletedSet = new Set(deletedPaperIds);
  const finalSyncedPapers = unionMerged.filter((p) => !deletedSet.has(p.id));

  // 验证防复活成功 (63 - 1 = 62)
  assert.equal(finalSyncedPapers.length, 62);
  assert.ok(finalSyncedPapers.some((p) => p.id === "past-408-2026"));
  assert.ok(finalSyncedPapers.some((p) => p.id === "mock-1"));
  assert.ok(!finalSyncedPapers.some((p) => p.id === "mock-2"));
});

test("消融测试: 英语主观题分值重构 (翻译5*2=10, 作文A 10分 + 作文B 20分) 与防溢出消融", async () => {
  // 1. 数据结构与分值消融
  const translationGroup = ENGLISH_PAPER_STRUCTURE.groups.find((g) => g.subject === "英译汉");
  assert.ok(translationGroup, "英语必须包含英译汉题组");
  assert.equal(translationGroup.start, 46);
  assert.equal(translationGroup.end, 50);
  assert.equal(translationGroup.count, 5);
  assert.equal(translationGroup.scorePerQuestion, 2.0, "英译汉单题分值必须为 2 分 (5 * 2 = 10分)");

  const writingGroup = ENGLISH_PAPER_STRUCTURE.groups.find((g) => g.subject === "写作");
  assert.ok(writingGroup, "英语必须包含写作题组");
  assert.equal(writingGroup.start, 51);
  assert.equal(writingGroup.end, 52);
  assert.equal(writingGroup.count, 2);
  assert.equal(writingGroup.questionScores?.[51], 10, "作文A必须为 10 分");
  assert.equal(writingGroup.questionScores?.[52], 20, "作文B必须为 20 分");

  // 总分校验：完形 10 + 阅读A 40 + 阅读B 10 + 翻译 10 + 作文 30 = 100 分
  const totalScore = ENGLISH_PAPER_STRUCTURE.groups.reduce((acc, g) => {
    if (g.questionScores) {
      return acc + Object.values(g.questionScores).reduce((a, b) => a + b, 0);
    }
    return acc + (g.scorePerQuestion ?? 0) * g.count;
  }, 0);
  assert.equal(totalScore, 100, "英语全卷题型分值总和必须严丝合缝等于 100 分");

  // 2. 答题卡组件文案消融 (淘汰应用文/短文写作，改用作文A/作文B)
  const modalCode = await readFile("app/components/sprint/AnswerSheetModal.tsx", "utf8");
  assert.match(modalCode, /第 46 ~ 50 题 · 每题 2 分 · 共 10 分/, "英译汉提示必须显示每题2分共10分");
  assert.match(modalCode, /第 51 ~ 52 题 · 作文A 10 分 · 作文B 20 分 · 共 30 分/, "写作提示必须显示作文A 10分、作文B 20分、共30分");
  assert.match(modalCode, /subj:\s*"作文A",\s*max:\s*10/, "作文A配置必须为10分");
  assert.match(modalCode, /subj:\s*"作文B",\s*max:\s*20/, "作文B配置必须为20分");
  assert.doesNotMatch(modalCode, /应用文/, "旧版【应用文】标签必须彻底移除");
  assert.doesNotMatch(modalCode, /短文写作/, "旧版【短文写作】标签必须彻底移除");

  // 3. CSS 布局防溢出消融
  const css = await readFile("app/globals.css", "utf8");
  const qItemMatch = css.match(/\.q-rating-item\s*\{([^}]+)\}/);
  assert.ok(qItemMatch, "必须存在 .q-rating-item 规则");
  assert.match(qItemMatch[1], /box-sizing:\s*border-box/, ".q-rating-item 必须声明 box-sizing: border-box 避免溢出");
  assert.match(qItemMatch[1], /min-width:\s*0/, ".q-rating-item 必须声明 min-width: 0 允许弹性收缩");

  const qTypeBlockMatch = css.match(/\.q-type-block\s*\{([^}]+)\}/);
  assert.ok(qTypeBlockMatch, "必须存在 .q-type-block 规则");
  assert.match(qTypeBlockMatch[1], /box-sizing:\s*border-box/, ".q-type-block 必须声明 box-sizing: border-box");
  assert.match(qTypeBlockMatch[1], /min-width:\s*0/, ".q-type-block 必须声明 min-width: 0");

  const qRatingBtnMatch = css.match(/\.q-rating-btn\s*\{([^}]+)\}/);
  assert.ok(qRatingBtnMatch, "必须存在 .q-rating-btn 规则");
  assert.match(qRatingBtnMatch[1], /padding:\s*0\s+7px/, "评级按钮宽度应紧凑为 padding: 0 7px 防挤出");
});

