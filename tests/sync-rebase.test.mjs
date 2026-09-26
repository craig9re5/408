import assert from "node:assert/strict";
import test from "node:test";

import { createAppData, createAppDataPatch, rebaseAppData } from "../app/study-data.ts";

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
