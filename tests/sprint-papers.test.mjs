import assert from "node:assert/strict";
import test from "node:test";

import {
  CS408_PAPER_STRUCTURE,
  ENGLISH_PAPER_STRUCTURE,
  MATH_PAPER_STRUCTURE,
  clampPaperScore,
  answerSheetScore,
  syncAnswerSheetScore,
  defaultPastPapers,
  mergePapers,
  normalizePaperRecord,
  normalizePapers,
  parseQuestionRanges,
} from "../app/study-data.ts";

test("答题卡自动汇总截图中的数学成绩，并同步已有总分", () => {
  const paper = {
    ...defaultPastPapers().find((p) => p.area === "math"),
    score: 150,
    questions: Object.fromEntries(Array.from({ length: 22 }, (_, i) => [i + 1,
      [10, 12, 13].includes(i + 1) ? "wrong" : i >= 17 && i <= 19 ? "partial" : "correct"])),
    questionScores: { 17: 10, 18: 8, 19: 8, 20: 6, 21: 12, 22: 12 },
  };
  assert.deepEqual(answerSheetScore(paper), { objective: 65, subjective: 56, total: 121, remaining: 0 });
  assert.equal(syncAnswerSheetScore(paper).score, 121);
  assert.equal(syncAnswerSheetScore({ ...paper, questions: {}, questionScores: {} }).score, null);
});

test("答题卡按各科客观题权重计分，保留零分与小数，并提示未录入题目", () => {
  const paper = (area, questions, questionScores = {}) => ({
    ...defaultPastPapers().find((p) => p.area === area), questions, questionScores,
  });
  assert.deepEqual(answerSheetScore(paper("english", { 1: "correct", 21: "correct", 46: "partial", 51: "wrong" }, { 46: 1.5, 51: 0 })),
    { objective: 2.5, subjective: 1.5, total: 4, remaining: 48 });
  assert.deepEqual(answerSheetScore(paper("politics", { 1: "correct", 17: "correct", 18: "wrong" })),
    { objective: 3, subjective: 0, total: 3, remaining: 30 });
  assert.equal(answerSheetScore(paper("408", { 1: "correct", 41: "partial" }, { 41: 6.5 })).total, 8.5);
  assert.equal(answerSheetScore(paper("math", { 1: "wrong" })).total, 0);
  assert.equal(answerSheetScore(paper("math", { 17: "partial" })).remaining, 22);
  assert.equal(answerSheetScore(paper("math", {}, { 999: 100, 17: NaN })).total, null);
});

test("录入任意一道题自动标记已做，零分和主观评级也算做题记录", () => {
  const blank = defaultPastPapers().find((p) => p.area === "math");
  const date = "2026-10-13";
  for (const record of [
    { questions: { 1: "correct" } },
    { questions: { 1: "wrong" } },
    { questions: { 17: "partial" } },
    { questionScores: { 17: 0 } },
    { questionScores: { 17: 8.5 } },
  ]) {
    const synced = syncAnswerSheetScore({ ...blank, ...record }, date);
    assert.equal(synced.completed, true);
    assert.equal(synced.completedAt, date);
  }
  const earlier = syncAnswerSheetScore({ ...blank, completedAt: "2026-10-12", questions: { 1: "correct" } }, date);
  assert.equal(earlier.completedAt, "2026-10-12");
  assert.equal(syncAnswerSheetScore(blank, date).completed, false);
  assert.equal(syncAnswerSheetScore({ ...blank, questions: { 999: "correct" }, questionScores: { 17: NaN } }, date).completed, false);
  assert.equal(syncAnswerSheetScore({ ...blank, completed: true, completedAt: date }, date).completed, true);
});

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

