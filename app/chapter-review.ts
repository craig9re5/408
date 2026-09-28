import type { Book, Chapter } from "./data/books.ts";
import type { ProgressMap, SectionProgress } from "../shared/types.ts";
import { isDate } from "../shared/merge.ts";

export type ChapterReviewSummary = {
  chapterId: string;
  sectionCount: number;
  learnedCount: number;
  reviewedCount: number;
  allLearned: boolean;
  canReview: boolean;
  reviewed: boolean;
  reviewedAt: string;
  reviewedPlannedAt: string;
};

export type ChapterReviewError = "not-ready" | "invalid-date" | "date-before-learned";

export type ChapterReviewChange = {
  progress: ProgressMap;
  changedSectionIds: string[];
  error: ChapterReviewError | null;
};

export type ChapterReviewPlanStatus = "completed" | "unscheduled" | "today" | "overdue" | "upcoming";

const EMPTY_PROGRESS: SectionProgress = {
  learned: false,
  learnedAt: "",
  reviewed: false,
  reviewedAt: "",
  plannedAt: "",
  reviewedPlannedAt: "",
  isCurrent: false,
};

function latestDate(dates: string[]): string {
  return dates.filter(isDate).sort().at(-1) ?? "";
}

function isChapterReviewBook(book: Book): boolean {
  return book.area === "408" || book.area === "math";
}

export function summarizeChapterReview(chapter: Chapter, progress: ProgressMap): ChapterReviewSummary {
  const states = chapter.sections.map((section) => progress[section.id]);
  const sectionCount = states.length;
  const learnedCount = states.filter((state) => state?.learned).length;
  const reviewedCount = states.filter((state) => state?.reviewed).length;
  return {
    chapterId: chapter.id,
    sectionCount,
    learnedCount,
    reviewedCount,
    allLearned: sectionCount > 0 && learnedCount === sectionCount,
    // Historical main-workspace defaults can be learned without a completion
    // date. The learned flag is enough to unlock chapter review; a present
    // learnedAt still constrains the review date when completing it.
    canReview: sectionCount > 0 && states.every((state) => state?.learned),
    // One reviewed legacy subsection is enough to represent the completed chapter.
    reviewed: reviewedCount > 0,
    reviewedAt: latestDate(states.flatMap((state) => state?.reviewed && state.reviewedAt ? [state.reviewedAt] : [])),
    reviewedPlannedAt: latestDate(states.flatMap((state) => state?.reviewedPlannedAt ? [state.reviewedPlannedAt] : [])),
  };
}

export function chapterReviewPlanStatus(
  chapter: Chapter,
  progress: ProgressMap,
  today: string,
): ChapterReviewPlanStatus {
  const summary = summarizeChapterReview(chapter, progress);
  if (summary.reviewed) return "completed";
  if (!summary.reviewedPlannedAt) return "unscheduled";
  if (summary.reviewedPlannedAt === today) return "today";
  return summary.reviewedPlannedAt < today ? "overdue" : "upcoming";
}

/** Convert historical subsection reviews to the chapter's one review state. */
export function migrateLegacyChapterReviews(books: Book[], progress: ProgressMap): ChapterReviewChange {
  let next = progress;
  const changed = new Set<string>();
  for (const book of books) {
    if (!isChapterReviewBook(book)) continue;
    for (const chapter of book.chapters) {
      const { reviewed, reviewedAt, reviewedPlannedAt } = summarizeChapterReview(chapter, next);
      for (const section of chapter.sections) {
        const current = next[section.id];
        let updated = current;
        if (reviewedPlannedAt && current?.reviewedPlannedAt !== reviewedPlannedAt) {
          updated = { ...(updated ?? EMPTY_PROGRESS), reviewedPlannedAt };
        }
        // Keep dates on already reviewed subsections. A later learnedAt cannot
        // be paired with this historical chapter completion date safely; an
        // absent learnedAt is valid for initially complete books.
        if (reviewed && reviewedAt && current && !current.reviewed
          && current.learned && (!current.learnedAt || (isDate(current.learnedAt) && current.learnedAt <= reviewedAt))) {
          updated = { ...updated, reviewed: true, reviewedAt };
        }
        if (updated && updated !== current) {
          if (next === progress) next = { ...progress };
          next[section.id] = updated;
          changed.add(section.id);
        }
      }
    }
  }
  return { progress: next, changedSectionIds: [...changed], error: null };
}

export function completeChapterReview(
  chapter: Chapter,
  progress: ProgressMap,
  completedAt: string,
): ChapterReviewChange {
  if (!isDate(completedAt)) return { progress, changedSectionIds: [], error: "invalid-date" };
  const summary = summarizeChapterReview(chapter, progress);
  if (!summary.canReview) return { progress, changedSectionIds: [], error: "not-ready" };
  if (chapter.sections.some((section) => progress[section.id].learnedAt > completedAt)) {
    return { progress, changedSectionIds: [], error: "date-before-learned" };
  }
  const changedSectionIds = chapter.sections
    .filter((section) => !progress[section.id].reviewed || progress[section.id].reviewedAt !== completedAt)
    .map((section) => section.id);
  if (!changedSectionIds.length) return { progress, changedSectionIds, error: null };
  const next = { ...progress };
  for (const sectionId of changedSectionIds) {
    next[sectionId] = { ...progress[sectionId], reviewed: true, reviewedAt: completedAt };
  }
  return { progress: next, changedSectionIds, error: null };
}

export function cancelChapterReview(chapter: Chapter, progress: ProgressMap): ChapterReviewChange {
  const changedSectionIds = chapter.sections
    .filter((section) => progress[section.id]?.reviewed || progress[section.id]?.reviewedAt)
    .map((section) => section.id);
  if (!changedSectionIds.length) return { progress, changedSectionIds, error: null };
  const next = { ...progress };
  for (const sectionId of changedSectionIds) {
    next[sectionId] = { ...progress[sectionId], reviewed: false, reviewedAt: "" };
  }
  return { progress: next, changedSectionIds, error: null };
}

export function setChapterReviewPlan(
  chapter: Chapter,
  progress: ProgressMap,
  reviewedPlannedAt: string,
): ChapterReviewChange {
  if (reviewedPlannedAt !== "" && !isDate(reviewedPlannedAt)) {
    return { progress, changedSectionIds: [], error: "invalid-date" };
  }
  const changedSectionIds = chapter.sections
    .filter((section) => (progress[section.id]?.reviewedPlannedAt ?? "") !== reviewedPlannedAt)
    .map((section) => section.id);
  if (!changedSectionIds.length) return { progress, changedSectionIds, error: null };
  const next = { ...progress };
  for (const sectionId of changedSectionIds) {
    next[sectionId] = { ...(progress[sectionId] ?? EMPTY_PROGRESS), reviewedPlannedAt };
  }
  return { progress: next, changedSectionIds, error: null };
}

/** Keep subsection learning events while counting one review event per chapter. */
export function buildChapterReviewAnalyticsProgress(books: Book[], progress: ProgressMap): ProgressMap {
  const next = { ...progress };
  for (const book of books) {
    if (!isChapterReviewBook(book)) continue;
    for (const chapter of book.chapters) {
      const { reviewed, reviewedAt } = summarizeChapterReview(chapter, progress);
      for (const section of chapter.sections) {
        const state = progress[section.id];
        if (state?.reviewed || state?.reviewedAt) {
          next[section.id] = { ...state, reviewed: false, reviewedAt: "" };
        }
      }
      if (!reviewed || !reviewedAt) continue;
      const representative = chapter.sections.find((section) => {
        const state = progress[section.id];
        return state?.reviewed && state.learned && isDate(state.learnedAt) && state.learnedAt <= reviewedAt;
      });
      if (representative) {
        next[representative.id] = { ...next[representative.id], reviewed: true, reviewedAt };
      }
    }
  }
  return next;
}
