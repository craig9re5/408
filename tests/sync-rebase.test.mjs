import assert from "node:assert/strict";
import test from "node:test";

import { createAppData, createAppDataPatch, rebaseAppData } from "../app/study-data.ts";
import { books } from "../app/data/books.ts";
import { migrateLegacyChapterReviews } from "../app/chapter-review.ts";

const untouched = { learned: false, learnedAt: "", reviewed: false, reviewedAt: "", plannedAt: "", reviewedPlannedAt: "", isCurrent: false };
const paper = (id, score) => ({ id, kind: "mock", area: "math", title: id, completed: true, completedAt: "2026-09-23", score, secondRound: false, secondRoundAt: "" });

test("three-way rebase preserves independent changes and deletions", () => {
  const base = createAppData(
    { a: untouched, b: untouched },
    undefined,
    [],
    [],
    [paper("mock-a", 80), paper("mock-b", 70), paper("mock-deleted-remotely", 60), paper("mock-deleted-locally", 50)],
  );
  const local = createAppData(
    { a: { ...untouched, plannedAt: "2026-09-24" }, b: untouched },
    base.projectSettings,
    [],
    [],
    [paper("mock-a", 90), paper("mock-b", 70), paper("mock-deleted-remotely", 60)],
    base.schedule,
  );
  const remote = createAppData(
    { a: untouched, b: { ...untouched, plannedAt: "2026-09-25" } },
    base.projectSettings,
    [],
    [],
    [paper("mock-a", 80), paper("mock-b", 95), paper("mock-deleted-locally", 50)],
    base.schedule,
  );

  const merged = rebaseAppData(base, local, remote);
  assert.equal(merged.progress.a.plannedAt, "2026-09-24");
  assert.equal(merged.progress.b.plannedAt, "2026-09-25");
  assert.equal(merged.papers.find((entry) => entry.id === "mock-a").score, 90);
  assert.equal(merged.papers.find((entry) => entry.id === "mock-b").score, 95);
  assert.equal(merged.papers.some((entry) => entry.id === "mock-deleted-remotely"), false);
  assert.equal(merged.papers.some((entry) => entry.id === "mock-deleted-locally"), false);

  const patch = createAppDataPatch(base, local);
  assert.deepEqual(Object.keys(patch.progressChanges), ["a"]);
  assert.deepEqual(patch.paperChanges.map((entry) => entry.id), ["mock-a"]);
  assert.deepEqual(patch.deletedPaperIds, ["mock-deleted-locally"]);
});

const reviewChapter = books.find((book) => book.area === "math").chapters[0];
const reviewIds = reviewChapter.sections.map((section) => section.id);
const chapterProgress = (reviewedIds = [], reviewedAt = "", reviewedPlannedAt = "") => Object.fromEntries(
  reviewIds.map((id) => [id, {
    ...untouched,
    learned: true,
    learnedAt: "2026-09-01",
    reviewed: reviewedIds.includes(id),
    reviewedAt: reviewedIds.includes(id) ? reviewedAt : "",
    reviewedPlannedAt,
  }]),
);

test("chapter cancellation wins a concurrent completion as one review vector", () => {
  const base = createAppData(chapterProgress([reviewIds[0]], "2026-09-10"));
  const local = createAppData(chapterProgress());
  const remote = createAppData(chapterProgress(reviewIds, "2026-09-20"));
  const merged = rebaseAppData(base, local, remote);

  assert.deepEqual(reviewIds.map((id) => [merged.progress[id].reviewed, merged.progress[id].reviewedAt]),
    reviewIds.map(() => [false, ""]));
  const afterMigration = migrateLegacyChapterReviews(books, merged.progress);
  assert.deepEqual(afterMigration.changedSectionIds, []);
});

test("chapter completion wins a concurrent cancellation as one review vector", () => {
  const base = createAppData(chapterProgress([reviewIds[0]], "2026-09-10"));
  const local = createAppData(chapterProgress(reviewIds, "2026-09-20"));
  const remote = createAppData(chapterProgress());
  const merged = rebaseAppData(base, local, remote);

  assert.deepEqual(reviewIds.map((id) => [merged.progress[id].reviewed, merged.progress[id].reviewedAt]),
    reviewIds.map(() => [true, "2026-09-20"]));
});

test("chapter plan conflicts resolve as a unit while unrelated remote review changes survive", () => {
  const baseProgress = chapterProgress([], "", "2026-09-20");
  baseProgress[reviewIds[0]].reviewedPlannedAt = "2026-09-10";
  const base = createAppData(baseProgress);
  const local = createAppData(chapterProgress([], "", "2026-09-10"));
  const remote = createAppData(chapterProgress(reviewIds, "2026-09-22", "2026-09-30"));
  const merged = rebaseAppData(base, local, remote);

  assert.deepEqual(reviewIds.map((id) => merged.progress[id].reviewedPlannedAt),
    reviewIds.map(() => "2026-09-10"), "local chapter plan wins despite one subsection already matching it in the base");
  assert.deepEqual(reviewIds.map((id) => merged.progress[id].reviewedAt),
    reviewIds.map(() => "2026-09-22"), "remote review completion survives an independent local plan edit");
});

test("automatic legacy review migration does not overwrite a newer remote chapter completion", () => {
  const base = createAppData(chapterProgress([reviewIds[0]], "2026-09-10"));
  const migrated = migrateLegacyChapterReviews(books, base.progress);
  assert.ok(migrated.changedSectionIds.length > 0);
  const local = createAppData(migrated.progress);
  const remote = createAppData(chapterProgress(reviewIds, "2026-09-20"));

  const merged = rebaseAppData(base, local, remote);
  assert.deepEqual(reviewIds.map((id) => merged.progress[id].reviewedAt),
    reviewIds.map(() => "2026-09-20"));
});

test("automatic legacy plan migration does not overwrite a newer remote chapter plan", () => {
  const oldProgress = chapterProgress([], "", "2026-09-10");
  oldProgress[reviewIds[1]].reviewedPlannedAt = "2026-09-15";
  const base = createAppData(oldProgress);
  const migrated = migrateLegacyChapterReviews(books, base.progress);
  assert.ok(migrated.changedSectionIds.length > 0);
  const local = createAppData({
    ...migrated.progress,
    [reviewIds[0]]: { ...migrated.progress[reviewIds[0]], plannedAt: "2026-09-18" },
  });
  const remote = createAppData(chapterProgress([], "", "2026-09-30"));

  const merged = rebaseAppData(base, local, remote);
  assert.deepEqual(reviewIds.map((id) => merged.progress[id].reviewedPlannedAt),
    reviewIds.map(() => "2026-09-30"));
  assert.equal(merged.progress[reviewIds[0]].plannedAt, "2026-09-18",
    "an unrelated local learning plan edit still survives");
});

test("concurrent learning date edits cannot create a review before learning", () => {
  const base = createAppData(chapterProgress());
  const local = createAppData(chapterProgress(reviewIds, "2026-09-10"));
  const remoteProgress = chapterProgress();
  remoteProgress[reviewIds[1]].learnedAt = "2026-09-12";
  const remote = createAppData(remoteProgress);
  const merged = rebaseAppData(base, local, remote);

  assert.equal(merged.progress[reviewIds[1]].learnedAt, "2026-09-12");
  assert.deepEqual(reviewIds.map((id) => [merged.progress[id].reviewed, merged.progress[id].reviewedAt]),
    reviewIds.map(() => [false, ""]), "a conflict clears the whole chapter completion");
});
