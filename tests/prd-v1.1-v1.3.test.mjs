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
