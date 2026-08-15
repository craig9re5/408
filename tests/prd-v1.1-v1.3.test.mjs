import assert from "node:assert/strict";
import test from "node:test";

import {
  addCalendarDays,
  buildChapterPlanChanges,
  normalizeAppData,
  normalizeSectionProgress,
  SCHEMA_VERSION,
} from "../app/study-data.ts";

const progress = (overrides = {}) => ({
  learned: false,
  learnedAt: "",
  reviewed: false,
  reviewedAt: "",
  plannedAt: "",
  reviewedPlannedAt: "",
  isCurrent: false,
  ...overrides,
});

test("统一日期只补齐未设置项，且默认跳过已完成项", () => {
  const changes = buildChapterPlanChanges([
    { id: "unset", learned: false, plannedAt: "" },
    { id: "scheduled", learned: false, plannedAt: "2026-08-02" },
    { id: "completed", learned: true, plannedAt: "" },
  ], {
    start: "2026-08-10",
    end: "2026-08-10",
    includeCompleted: false,
  }, "uniform");

  assert.deepEqual(changes, { unset: "2026-08-10" });
});

test("按天均分覆盖完整区间并可显式包含已完成项", () => {
  const sections = ["one", "two", "three", "four"].map((id, index) => ({
    id,
    learned: index === 0,
    plannedAt: "",
  }));
  const changes = buildChapterPlanChanges(sections, {
    start: "2026-08-02",
    end: "2026-08-04",
    includeCompleted: true,
  }, "spread");

  assert.deepEqual(changes, {
    one: "2026-08-02",
    two: "2026-08-02",
    three: "2026-08-03",
    four: "2026-08-04",
  });
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
});

test("复习记录必须依赖有效学完日期并清除失效的当前标记", () => {
  assert.deepEqual(normalizeSectionProgress(progress({
    learned: true,
    reviewed: true,
    reviewedAt: "2026-08-12",
    isCurrent: true,
  })), progress({ learned: true }));

  assert.deepEqual(normalizeSectionProgress(progress({
    learned: true,
    learnedAt: "2026-08-13",
    reviewed: true,
    reviewedAt: "2026-08-12",
  })), progress({ learned: true, learnedAt: "2026-08-13" }));

  assert.equal(normalizeSectionProgress(
    progress({ plannedAt: "" }),
    progress({ plannedAt: "2026-08-20" }),
  ).plannedAt, "");
});

test("导入时修复复习早于学完日期的非法状态", () => {
  const data = normalizeAppData({
    schemaVersion: SCHEMA_VERSION,
    progress: {
      section: progress({
        learned: true,
        learnedAt: "2026-08-13",
        reviewed: true,
        reviewedAt: "2026-08-12",
      }),
    },
    projectSettings: {
      "408": { examDate: "2026-12-19" },
      math: { examDate: "2026-12-19" },
    },
    planHistory: [],
  }, {});

  assert.ok(data);
  assert.equal(data.progress.section.reviewed, false);
  assert.equal(data.progress.section.reviewedAt, "");
});

test("数据分析：近14天学力速率与结课冲刺预测推导准确", async () => {
  const {
    calculateVelocityAndForecast,
    calculateActivityHeatmap,
    calculateWeeklyTrends,
    calculateDisciplineStats,
    calculateMaxStreak,
  } = await import("../app/study-data.ts");

  const today = "2026-08-14";
  const examDate = "2026-12-19";

  const p = {
    s1: progress({ learned: true, learnedAt: "2026-08-10", plannedAt: "2026-08-11" }),
    s2: progress({ learned: true, learnedAt: "2026-08-12", plannedAt: "2026-08-10" }),
    s3: progress({ learned: true, learnedAt: "2026-08-14", reviewed: true, reviewedAt: "2026-08-14" }),
    s4: progress({ learned: false, plannedAt: "2026-08-20" }),
  };

  const forecast = calculateVelocityAndForecast(p, ["s1", "s2", "s3", "s4"], examDate, today);
  assert.equal(forecast.totalSections, 4);
  assert.equal(forecast.learnedTotal, 3);
  assert.equal(forecast.remainingSections, 1);
  assert.equal(forecast.learnedLast14d, 3);
  assert.ok(forecast.dailyVelocity14d > 0);
  assert.ok(forecast.estimatedCompletionDate !== null);
  assert.ok(forecast.sprintDays !== null);

  const heatmap = calculateActivityHeatmap(p, today, 13);
  assert.equal(heatmap.length, 91);
  const todayEntry = heatmap.find((d) => d.date === today);
  assert.ok(todayEntry);
  assert.equal(todayEntry.learnedCount, 1);
  assert.equal(todayEntry.reviewedCount, 1);
  assert.equal(todayEntry.totalActions, 2);

  const weekly = calculateWeeklyTrends(p, today, 8);
  assert.equal(weekly.length, 8);
  assert.equal(weekly[weekly.length - 1].isCurrentWeek, true);

  const discipline = calculateDisciplineStats(p, [], today);
  assert.equal(discipline.currentStreak, 1);
  assert.equal(discipline.maxStreak >= 1, true);
  assert.equal(discipline.totalActions, 4); // 3 learned + 1 reviewed
  assert.equal(discipline.onTimeLearnedCount, 1); // s1 completed 08-10 <= planned 08-11
  assert.equal(discipline.onTimeRate, 50); // 2 planned & learned (s1, s2), 1 on time = 50%
});
