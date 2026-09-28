import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChapterReviewAnalyticsProgress,
  cancelChapterReview,
  chapterReviewPlanStatus,
  completeChapterReview,
  migrateLegacyChapterReviews,
  setChapterReviewPlan,
  summarizeChapterReview,
} from "../app/chapter-review.ts";
import { books } from "../app/data/books.ts";
import { buildDefaultProgress } from "../app/study-data.ts";

const section = (id) => ({ id, number: id, title: id });
const chapter = (id, ids) => ({ id, number: "1", title: id, sections: ids.map(section) });
const book = (area, id, chapters) => ({ id, area, title: id, shortTitle: id, initiallyComplete: false, chapters });
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

test("one reviewed legacy subsection completes its chapter, using the latest reviewed and planned dates", () => {
  const target = chapter("math-chapter-1", ["a", "b", "c"]);
  const data = {
    a: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-10", reviewedPlannedAt: "2026-09-12" }),
    b: progress({ learned: true, learnedAt: "2026-09-05", reviewedPlannedAt: "2026-09-15" }),
    c: progress({ learned: true, learnedAt: "2026-09-12", reviewedPlannedAt: "2026-09-13" }),
  };

  const summary = summarizeChapterReview(target, data);
  assert.deepEqual(summary, {
    chapterId: target.id,
    sectionCount: 3,
    learnedCount: 3,
    reviewedCount: 1,
    allLearned: true,
    canReview: true,
    reviewed: true,
    reviewedAt: "2026-09-10",
    reviewedPlannedAt: "2026-09-15",
  });
  assert.equal(chapterReviewPlanStatus(target, data, "2026-09-16"), "completed");

  const migrated = migrateLegacyChapterReviews([book("math", "math", [target])], data);
  assert.equal(migrated.error, null);
  assert.deepEqual(migrated.changedSectionIds, ["a", "b", "c"]);
  assert.equal(migrated.progress.a.reviewedAt, "2026-09-10");
  assert.equal(migrated.progress.b.reviewedAt, "2026-09-10");
  assert.equal(migrated.progress.b.reviewed, true);
  assert.equal(migrated.progress.c.reviewed, false, "historical review date cannot precede this subsection's learnedAt");
  assert.deepEqual(target.sections.map((entry) => migrated.progress[entry.id].reviewedPlannedAt), ["2026-09-15", "2026-09-15", "2026-09-15"]);
  assert.equal(data.b.reviewed, false, "migration must leave its input untouched");

  const again = migrateLegacyChapterReviews([book("math", "math", [target])], migrated.progress);
  assert.equal(again.progress, migrated.progress);
  assert.deepEqual(again.changedSectionIds, []);
});

test("migration preserves differing historical review dates and ignores other areas", () => {
  const math = chapter("math-chapter-2", ["a", "b"]);
  const other = chapter("english-chapter-1", ["e1", "e2"]);
  const data = {
    a: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-10" }),
    b: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-14" }),
    e1: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-10", reviewedPlannedAt: "2026-09-12" }),
    e2: progress({ learned: true, learnedAt: "2026-09-01" }),
  };
  const result = migrateLegacyChapterReviews([book("math", "math", [math]), book("english", "english", [other])], data);
  assert.equal(result.progress, data);
  assert.deepEqual(result.changedSectionIds, []);
  assert.equal(result.progress.a.reviewedAt, "2026-09-10");
  assert.equal(result.progress.b.reviewedAt, "2026-09-14");
  assert.equal(result.progress.e2.reviewed, false);
  assert.equal(summarizeChapterReview(math, result.progress).reviewedAt, "2026-09-14");
});

test("migration fills undated learned sections without inventing a learning date", () => {
  const target = chapter("408-chapter-undated", ["a", "b"]);
  const data = {
    a: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-10" }),
    b: progress({ learned: true, learnedAt: "" }),
  };
  const migrated = migrateLegacyChapterReviews([book("408", "408", [target])], data);
  assert.equal(migrated.progress.b.reviewed, true);
  assert.equal(migrated.progress.b.reviewedAt, "2026-09-10");
  assert.equal(migrated.progress.b.learnedAt, "");
});

test("chapter completion enforces learning dates, then updates or cancels all subsection reviews", () => {
  const target = chapter("408-chapter-1", ["a", "b"]);
  const data = {
    a: progress({ learned: true, learnedAt: "2026-09-10", reviewed: true, reviewedAt: "2026-09-11", reviewedPlannedAt: "2026-09-16" }),
    b: progress({ learned: true, learnedAt: "2026-09-15", reviewedPlannedAt: "2026-09-16" }),
  };
  assert.deepEqual(completeChapterReview(target, data, "2026-09-14"), { progress: data, changedSectionIds: [], error: "date-before-learned" });
  assert.deepEqual(completeChapterReview(target, data, "2026-09-31"), { progress: data, changedSectionIds: [], error: "invalid-date" });
  assert.equal(completeChapterReview(target, { ...data, b: progress() }, "2026-09-16").error, "not-ready");

  const done = completeChapterReview(target, data, "2026-09-16");
  assert.equal(done.error, null);
  assert.deepEqual(done.changedSectionIds, ["a", "b"]);
  assert.deepEqual(target.sections.map((entry) => done.progress[entry.id].reviewedAt), ["2026-09-16", "2026-09-16"]);
  assert.equal(data.a.reviewedAt, "2026-09-11");
  assert.deepEqual(completeChapterReview(target, done.progress, "2026-09-16").changedSectionIds, []);

  const canceled = cancelChapterReview(target, done.progress);
  assert.deepEqual(canceled.changedSectionIds, ["a", "b"]);
  assert.deepEqual(target.sections.map((entry) => canceled.progress[entry.id].reviewedAt), ["", ""]);
  assert.equal(canceled.progress.a.learnedAt, "2026-09-10");
  assert.equal(canceled.progress.a.reviewedPlannedAt, "2026-09-16");
});

test("initially complete chapters can be reviewed without invented learning dates", () => {
  const defaults = buildDefaultProgress(books, true);
  const initiallyCompleteChapters = books.filter((entry) => entry.initiallyComplete).flatMap((entry) => entry.chapters);
  assert.ok(initiallyCompleteChapters.length > 0);
  assert.ok(initiallyCompleteChapters.every((entry) => summarizeChapterReview(entry, defaults).canReview));

  const target = initiallyCompleteChapters[0];
  const done = completeChapterReview(target, defaults, "2026-09-28");
  assert.equal(done.error, null);
  assert.ok(target.sections.every((entry) => done.progress[entry.id].reviewedAt === "2026-09-28"));
  assert.ok(target.sections.every((entry) => done.progress[entry.id].learnedAt === ""));
});

test("chapter review plan updates every subsection and yields one chapter task", () => {
  const target = chapter("math-chapter-3", ["a", "b"]);
  const data = {
    a: progress({ learned: true, learnedAt: "2026-09-01", reviewedPlannedAt: "2026-09-18" }),
    b: progress({ learned: true, learnedAt: "2026-09-02", reviewedPlannedAt: "2026-09-20" }),
  };
  assert.equal(chapterReviewPlanStatus(target, data, "2026-09-18"), "upcoming");
  assert.equal(chapterReviewPlanStatus(target, data, "2026-09-20"), "today");
  assert.equal(chapterReviewPlanStatus(target, data, "2026-09-21"), "overdue");
  const invalid = setChapterReviewPlan(target, data, "tomorrow");
  assert.equal(invalid.progress, data);
  assert.equal(invalid.error, "invalid-date");
  const planned = setChapterReviewPlan(target, data, "2026-09-25");
  assert.deepEqual(planned.changedSectionIds, ["a", "b"]);
  assert.deepEqual(target.sections.map((entry) => planned.progress[entry.id].reviewedPlannedAt), ["2026-09-25", "2026-09-25"]);
  const cleared = setChapterReviewPlan(target, planned.progress, "");
  assert.equal(chapterReviewPlanStatus(target, cleared.progress, "2026-09-25"), "unscheduled");
});

test("analytics view keeps every learning event but counts one latest review event per chapter", () => {
  const cs = chapter("408-chapter-1", ["a", "b", "c"]);
  const math = chapter("math-chapter-1", ["d", "e"]);
  const data = {
    a: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-10" }),
    b: progress({ learned: true, learnedAt: "2026-09-02", reviewed: true, reviewedAt: "2026-09-12" }),
    c: progress({ learned: true, learnedAt: "2026-09-14" }),
    d: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-20" }),
    e: progress({ learned: true, learnedAt: "2026-09-03", reviewed: true, reviewedAt: "2026-09-21" }),
    unrelated: progress({ learned: true, learnedAt: "2026-09-01", reviewed: true, reviewedAt: "2026-09-22" }),
  };
  const view = buildChapterReviewAnalyticsProgress([book("408", "408", [cs]), book("math", "math", [math])], data);
  assert.equal(Object.values(view).filter((state) => state.learned).length, 6);
  assert.deepEqual(Object.values(view).filter((state) => state.reviewed).map((state) => state.reviewedAt).sort(), ["2026-09-12", "2026-09-21", "2026-09-22"]);
  assert.equal(data.b.reviewedAt, "2026-09-12");
});
