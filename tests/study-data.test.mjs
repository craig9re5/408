import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BACKUPS,
  SCHEMA_VERSION,
  StorageRepository,
  addCalendarDays,
  buildChapterPlanChanges,
  calculateActivityHeatmap,
  calculateDisciplineStats,
  calculateMaxStreak,
  calculateRecentStreak,
  calculateVelocityAndForecast,
  calculateWeeklyTrends,
  createAppData,
  isOverdueTask,
  isTodayPlan,
  isUnreviewedTask,
  normalizeAppData,
  normalizeSectionProgress,
} from "../app/study-data.ts";

const createSection = (overrides = {}) => ({
  learned: false,
  learnedAt: "",
  reviewed: false,
  reviewedAt: "",
  plannedAt: "",
  reviewedPlannedAt: "",
  isCurrent: false,
  ...overrides,
});

class MockLocalStorage {
  #store = new Map();

  get length() {
    return this.#store.size;
  }
  clear() {
    this.#store.clear();
  }
  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null;
  }
  key(index) {
    return [...this.#store.keys()][index] ?? null;
  }
  removeItem(key) {
    this.#store.delete(key);
  }
  setItem(key, value) {
    this.#store.set(key, String(value));
  }
}

test("学习状态派生规则: 今日安排、逾期任务与待复习任务判定准确且互不干扰", () => {
  const today = "2026-08-15";

  // 1. 今日安排判定
  assert.equal(isTodayPlan(createSection({ plannedAt: today }), today), true);
  assert.equal(isTodayPlan(createSection({ plannedAt: today, learned: true, learnedAt: today }), today), true);
  // 已学完但学完日期不是今天且计划不是今天 -> 不是今日安排
  assert.equal(isTodayPlan(createSection({ plannedAt: "2026-08-10", learned: true, learnedAt: "2026-08-10" }), today), false);
  assert.equal(isTodayPlan(createSection({ plannedAt: "" }), today), false);

  // 2. 逾期任务判定
  assert.equal(isOverdueTask(createSection({ plannedAt: "2026-08-10" }), today), true);
  // 当天计划不属于逾期
  assert.equal(isOverdueTask(createSection({ plannedAt: today }), today), false);
  // 过去计划但已完成的不属于逾期
  assert.equal(isOverdueTask(createSection({ plannedAt: "2026-08-10", learned: true, learnedAt: today }), today), false);
  // 未设日期的不属于逾期
  assert.equal(isOverdueTask(createSection({ plannedAt: "" }), today), false);

  // 3. 待复习任务判定
  // 过去学完且未复习 -> 待复习
  assert.equal(isUnreviewedTask(createSection({ learned: true, learnedAt: "2026-08-14" }), today), true);
  // 今天刚学完的 -> 不在今日待复习中（复习通常针对过往记忆）
  assert.equal(isUnreviewedTask(createSection({ learned: true, learnedAt: today }), today), false);
  // 已经复习过的 -> 不属于待复习
  assert.equal(
    isUnreviewedTask(createSection({ learned: true, learnedAt: "2026-08-12", reviewed: true, reviewedAt: today }), today),
    false
  );
  // 未学过的 -> 不属于待复习
  assert.equal(isUnreviewedTask(createSection({ learned: false }), today), false);
});

test("连续学习天数计算: 支持当天未学保持连续性、跨月/闰年边界与断档重置", () => {
  // 1. 最近一次活动为昨天，今天尚未学习 -> 不因今天暂未学习错误归零
  const streakWithYesterday = calculateRecentStreak(
    {
      sec1: createSection({ learned: true, learnedAt: "2026-08-13" }),
      sec2: createSection({ learned: true, learnedAt: "2026-08-14" }),
    },
    "2026-08-15"
  );
  assert.equal(streakWithYesterday, 2);

  // 2. 断档一天 -> 连续天数应只计算最近一次连续片段
  const streakWithGap = calculateRecentStreak(
    {
      sec1: createSection({ learned: true, learnedAt: "2026-08-10" }),
      sec2: createSection({ learned: true, learnedAt: "2026-08-14" }),
    },
    "2026-08-15"
  );
  assert.equal(streakWithGap, 1);

  // 3. 空进度计算
  assert.equal(calculateRecentStreak({}, "2026-08-15"), 0);

  // 4. 最大连续打卡测试（跨月测试）
  const maxStreak = calculateMaxStreak(
    {
      s1: createSection({ learned: true, learnedAt: "2026-07-30" }),
      s2: createSection({ learned: true, learnedAt: "2026-07-31" }),
      s3: createSection({ learned: true, learnedAt: "2026-08-01" }),
      s4: createSection({ learned: true, learnedAt: "2026-08-02" }),
      s5: createSection({ learned: true, learnedAt: "2026-08-10" }),
    },
    "2026-08-15"
  );
  assert.equal(maxStreak, 4);
});

test("日历工具与批量排期: addCalendarDays 处理闰年跨月，buildChapterPlanChanges 统一与均分排期", () => {
  // 1. addCalendarDays 闰年与月份边界
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addCalendarDays("2028-02-29", 1), "2028-03-01");
  assert.equal(addCalendarDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addCalendarDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addCalendarDays("invalid-date", 1), "");

  // 2. 统一排期: 仅对未排期项生效，跳过已完成项
  const uniformChanges = buildChapterPlanChanges(
    [
      { id: "sec-1", learned: false, plannedAt: "" },
      { id: "sec-2", learned: false, plannedAt: "2026-08-01" },
      { id: "sec-3", learned: true, plannedAt: "" },
    ],
    {
      start: "2026-08-20",
      end: "2026-08-20",
      includeCompleted: false,
    },
    "uniform"
  );
  assert.deepEqual(uniformChanges, { "sec-1": "2026-08-20" });

  // 3. 均分排期: 覆盖完整时间跨度，支持显式包含已完成项
  const sections = ["a", "b", "c", "d"].map((id, idx) => ({
    id,
    learned: idx === 0,
    plannedAt: "",
  }));
  const spreadChanges = buildChapterPlanChanges(
    sections,
    {
      start: "2026-09-01",
      end: "2026-09-03",
      includeCompleted: true,
    },
    "spread"
  );
  assert.deepEqual(spreadChanges, {
    a: "2026-09-01",
    b: "2026-09-01",
    c: "2026-09-02",
    d: "2026-09-03",
  });
});

test("数据标准化与状态清洗: 修复非法复习时序，校验项目配置与 Schema 版本", () => {
  // 1. normalizeSectionProgress 清理失效复习标记与非法当前小节标记
  const cleanedSection = normalizeSectionProgress(
    createSection({
      learned: true,
      learnedAt: "2026-08-15",
      reviewed: true,
      reviewedAt: "2026-08-10", // 复习早于学完，非法
      isCurrent: true,
    })
  );
  assert.equal(cleanedSection.learned, true);
  assert.equal(cleanedSection.learnedAt, "2026-08-15");
  assert.equal(cleanedSection.reviewed, false);
  assert.equal(cleanedSection.reviewedAt, "");
  assert.equal(cleanedSection.isCurrent, false); // isCurrent 不应该在归一化中盲目保留

  // 2. 未学完但标记了已复习 -> 清理为未复习
  const unlearnedButReviewed = normalizeSectionProgress(
    createSection({
      learned: false,
      reviewed: true,
      reviewedAt: "2026-08-10",
    })
  );
  assert.equal(unlearnedButReviewed.reviewed, false);
  assert.equal(unlearnedButReviewed.reviewedAt, "");

  // 3. normalizeAppData 整体校验与非法考研日期纠错
  const normalizedApp = normalizeAppData(
    {
      schemaVersion: SCHEMA_VERSION,
      appVersion: "2.0.0",
      progress: {
        os1: createSection({ learned: true, learnedAt: "2026-08-15", reviewed: true, reviewedAt: "2026-08-10" }),
      },
      projectSettings: {
        "408": { examDate: "2026-12-20" },
        math: { examDate: "invalid-date" },
      },
      planHistory: [],
    },
    {}
  );
  assert.ok(normalizedApp);
  assert.equal(normalizedApp.schemaVersion, SCHEMA_VERSION);
  assert.equal(normalizedApp.progress.os1.reviewed, false);
  assert.equal(normalizedApp.projectSettings["408"].examDate, "2026-12-20");
  assert.equal(normalizedApp.projectSettings.math.examDate, "2026-12-19"); // 回退到默认日期

  // 4. 不兼容的高版本或非法 Schema 阻断归一化
  assert.equal(normalizeAppData({ schemaVersion: 99 }, {}), null);
  assert.equal(normalizeAppData(null, {}), null);
  assert.equal(normalizeAppData("not-an-object", {}), null);
});

test("学习数据分析运算: 14天学力速率、冲刺预测、热力图网格与自律统计推导准确", () => {
  const today = "2026-08-14";
  const examDate = "2026-12-19";

  const progress = {
    s1: createSection({ learned: true, learnedAt: "2026-08-10", plannedAt: "2026-08-11" }),
    s2: createSection({ learned: true, learnedAt: "2026-08-12", plannedAt: "2026-08-10" }),
    s3: createSection({ learned: true, learnedAt: "2026-08-14", reviewed: true, reviewedAt: "2026-08-14" }),
    s4: createSection({ learned: false, plannedAt: "2026-08-20" }),
  };

  // 1. 学力速率与冲刺预测
  const forecast = calculateVelocityAndForecast(progress, ["s1", "s2", "s3", "s4"], examDate, today);
  assert.equal(forecast.totalSections, 4);
  assert.equal(forecast.learnedTotal, 3);
  assert.equal(forecast.remainingSections, 1);
  assert.equal(forecast.learnedLast14d, 3);
  assert.ok(forecast.dailyVelocity14d > 0);
  assert.ok(forecast.estimatedCompletionDate !== null);
  assert.ok(typeof forecast.sprintDays === "number");

  // 2. 13周（91天）热力图网格
  const heatmap = calculateActivityHeatmap(progress, today, 13);
  assert.equal(heatmap.length, 91);
  const todayCell = heatmap.find((d) => d.date === today);
  assert.ok(todayCell);
  assert.equal(todayCell.learnedCount, 1);
  assert.equal(todayCell.reviewedCount, 1);
  assert.equal(todayCell.totalActions, 2);

  // 3. 8周趋势与当前周判定
  const weekly = calculateWeeklyTrends(progress, today, 8);
  assert.equal(weekly.length, 8);
  assert.equal(weekly[weekly.length - 1].isCurrentWeek, true);

  // 4. 自律统计
  const discipline = calculateDisciplineStats(progress, [], today);
  assert.equal(discipline.currentStreak, 1);
  assert.equal(discipline.totalActions, 4); // 3 learned + 1 reviewed
  assert.equal(discipline.onTimeLearnedCount, 1); // s1: 08-10完成 <= 08-11计划
  assert.equal(discipline.onTimeRate, 50); // 2 planned & learned (s1, s2), 1 on time = 50%
});

test("本地存储仓储: V1历史数据平滑迁移、非法数据隔离防丢失及备份上限循环轮换", () => {
  const storage = new MockLocalStorage();

  // 1. 旧版 localStorage 数据结构迁移并生成前置备份
  storage.setItem(
    "408-section-progress-v1",
    JSON.stringify({
      sec1: createSection({ plannedAt: "2026-08-20" }),
    })
  );
  const repo = new StorageRepository(storage);
  const migrated = repo.load({ sec1: createSection() });

  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.progress.sec1.plannedAt, "2026-08-20");
  assert.equal(repo.backups().length, 1);
  assert.equal(repo.backups()[0].kind, "before-migration");

  // 2. 无法识别的未来或损坏数据不会被盲目覆盖，保留可导出原文
  const corruptedStorage = new MockLocalStorage();
  const corruptRaw = '{"schemaVersion":99,"futureField":"critical-data"}';
  corruptedStorage.setItem("study-app-data-v1", corruptRaw);
  const corruptRepo = new StorageRepository(corruptedStorage);

  assert.equal(corruptRepo.load({}), null);
  assert.equal(corruptedStorage.getItem("study-app-data-v1"), corruptRaw);
  const issue = corruptRepo.takeLoadIssue();
  assert.ok(issue);
  assert.equal(issue.raw, corruptRaw);
  assert.match(issue.message, /未被覆盖/);

  // 3. 备份创建上限（MAX_BACKUPS）自动修剪与手动删除
  const freshStorage = new MockLocalStorage();
  const cleanRepo = new StorageRepository(freshStorage);
  const sampleData = createAppData({ sec: createSection() });

  for (let i = 0; i < MAX_BACKUPS + 5; i++) {
    cleanRepo.createBackup(sampleData, "manual");
  }
  assert.equal(cleanRepo.backups().length, MAX_BACKUPS);

  const deleteTarget = cleanRepo.backups()[0];
  const afterDelete = cleanRepo.deleteBackup(deleteTarget.id);
  assert.equal(afterDelete.length, MAX_BACKUPS - 1);
  assert.ok(!afterDelete.some((b) => b.id === deleteTarget.id));
});
