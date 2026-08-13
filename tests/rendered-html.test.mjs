import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_BACKUPS,
  SCHEMA_VERSION,
  StorageRepository,
  calculateRecentStreak,
  createAppData,
  isOverdueTask,
  isTodayPlan,
  isUnreviewedTask,
  normalizeAppData,
} from "../app/study-data.ts";

const emptyProgress = (overrides = {}) => ({
  learned: false,
  learnedAt: "",
  reviewed: false,
  reviewedAt: "",
  plannedAt: "",
  isCurrent: false,
  ...overrides,
});

class MemoryStorage {
  #values = new Map();

  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

test("今日、逾期、未复习规则只由同一条小节记录派生", () => {
  const today = "2026-08-13";
  assert.equal(isTodayPlan(emptyProgress({ plannedAt: today }), today), true);
  assert.equal(isTodayPlan(emptyProgress({ plannedAt: today, learned: true, learnedAt: today }), today), true);
  assert.equal(isOverdueTask(emptyProgress({ plannedAt: "2026-08-10" }), today), true);
  assert.equal(isOverdueTask(emptyProgress({ plannedAt: "2026-08-10", learned: true, learnedAt: today }), today), false);
  assert.equal(isUnreviewedTask(emptyProgress({ learned: true, learnedAt: today }), today), false);
  assert.equal(isUnreviewedTask(emptyProgress({ learned: true, learnedAt: "2026-08-12" }), today), true);
  assert.equal(isUnreviewedTask(emptyProgress({ learned: true, learnedAt: "2026-08-12", reviewed: true, reviewedAt: today }), today), false);
});

test("连续学习按最近一次活动向前计算，不因今天暂未学习错误归零", () => {
  assert.equal(calculateRecentStreak({
    monday: emptyProgress({ learned: true, learnedAt: "2026-08-10" }),
    tuesday: emptyProgress({ learned: true, learnedAt: "2026-08-11" }),
  }, "2026-08-13"), 2);
  assert.equal(calculateRecentStreak({
    monday: emptyProgress({ learned: true, learnedAt: "2026-08-10" }),
    wednesday: emptyProgress({ learned: true, learnedAt: "2026-08-12" }),
  }, "2026-08-13"), 1);
  assert.equal(calculateRecentStreak({}, "2026-08-13"), 0);
});

test("数据校验保留 schemaVersion 并修复不合法复习状态", () => {
  const value = normalizeAppData({
    schemaVersion: SCHEMA_VERSION,
    appVersion: "test",
    progress: {
      section: emptyProgress({ reviewed: true, reviewedAt: "2026-08-12" }),
    },
    projectSettings: { "408": { examDate: "2026-12-20" }, math: { examDate: "bad" } },
    planHistory: [],
  }, {});

  assert.ok(value);
  assert.equal(value.schemaVersion, SCHEMA_VERSION);
  assert.equal(value.progress.section.reviewed, false);
  assert.equal(value.projectSettings["408"].examDate, "2026-12-20");
  assert.equal(value.projectSettings.math.examDate, "2026-12-19");
  assert.equal(normalizeAppData({ schemaVersion: 99 }, {}), null);
  assert.equal(normalizeAppData({ schemaVersion: SCHEMA_VERSION }, {}), null);
  assert.equal(normalizeAppData({
    schemaVersion: SCHEMA_VERSION,
    progress: {},
    projectSettings: { "408": { examDate: "2026-13-40" }, math: { examDate: "2026-12-19" } },
    planHistory: [],
  }, {})?.projectSettings["408"].examDate, "2026-12-19");
});

test("旧 localStorage 进度会迁移并先建立迁移备份", () => {
  const storage = new MemoryStorage();
  storage.setItem("408-section-progress-v1", JSON.stringify({
    section: emptyProgress({ plannedAt: "2026-08-15" }),
  }));
  const repository = new StorageRepository(storage);
  const migrated = repository.load({ section: emptyProgress() });

  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.progress.section.plannedAt, "2026-08-15");
  assert.equal(repository.backups()[0].kind, "before-migration");
});

test("无法迁移的数据不会被覆盖，并保留可导出的原文", () => {
  const storage = new MemoryStorage();
  const raw = '{"schemaVersion":99,"futureData":true}';
  storage.setItem("study-app-data-v1", raw);
  const repository = new StorageRepository(storage);

  assert.equal(repository.load({}), null);
  assert.equal(storage.getItem("study-app-data-v1"), raw);
  const issue = repository.takeLoadIssue();
  assert.ok(issue);
  assert.equal(issue.raw, raw);
  assert.match(issue.message, /未被覆盖/);
});

test("本地备份按上限自动清理", () => {
  const storage = new MemoryStorage();
  const repository = new StorageRepository(storage);
  const data = createAppData({ section: emptyProgress() });
  for (let index = 0; index < MAX_BACKUPS + 4; index += 1) repository.createBackup(data, "manual");
  assert.equal(repository.backups().length, MAX_BACKUPS);
});

test("页面与 Worker 数据骨架满足 V1.5 beta 的静态约束", async () => {
  const [dashboard, worker, migration] = await Promise.all([
    readFile(new URL("../app/study-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0004_create_app_state.sql", import.meta.url), "utf8"),
  ]);

  for (const label of ["学习进度", "今日", "数据分析", "设置"]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /\/api\/app-data/);
  assert.match(dashboard, /projectTaskEntries\("408"\)[\s\S]*projectTaskEntries\("math"\)/);
  assert.match(dashboard, /activePage === "progress" && <div className="study-switchers"/);
  assert.match(dashboard, /className="area-switcher"/);
  assert.match(dashboard, /className="book-switcher"/);
  assert.match(dashboard, /allFirstRoundComplete && <section className="task-panel task-panel--review"/);
  assert.match(dashboard, /\["408", "math"\][\s\S]*settings-project-row/);
  assert.doesNotMatch(dashboard, /<article><span>待复习<\/span>/);
  assert.doesNotMatch(dashboard, /<article><span>项目进度<\/span>/);
  assert.doesNotMatch(dashboard, /当前项目：/);
  assert.doesNotMatch(dashboard, /useState[^\n]*(todayTask|todayReviewTask|todayCompleted)/i);
  assert.match(worker, /plan_history/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS app_state/);
});
