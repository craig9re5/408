import type { Book } from "./data/books";
import { books } from "./data/books.ts";
import { migrateLegacyChapterReviews, summarizeChapterReview } from "./chapter-review.ts";
import type {
  StudyArea,
  SectionProgress,
  ProgressValue,
  ProgressMap,
  PlanChangeSource,
  PlanHistoryEntry,
  ProjectSetting,
  ProjectSettings,
  JournalProjectContext,
  JournalSubjectContext,
  JournalSectionItem,
  JournalSectionContext,
  JournalSectionsContext,
  JournalPaperContext,
  JournalContext,
  JournalPublish,
  JournalEntry,
  PaperKind,
  QuestionState,
  QuestionGroupDef,
  PaperRecord,
  ExamPaperItem,
  ExamPaperSubject,
  PaperQuotaInfo,
} from "../shared/types.ts";
import {
  DEFAULT_EXAM_DATE,
  DEFAULT_PROJECT_SETTINGS,
  PAST_PAPER_YEARS,
  POLITICS_PAST_PAPER_YEARS,
  maxPaperScore,
  MAX_PAPER_FILE_SIZE,
  DEFAULT_USER_QUOTA_BYTES,
  EXAM_PAPER_SUBJECT_MAP,
} from "../shared/constants.ts";
import {
  isRecord,
  isDate,
  addCalendarDays,
  normalizeProjectSettings,
  normalizePlanHistory,
  normalizeJournalContext,
  normalizeJournalPublish,
  normalizeJournalEntry,
  normalizeJournals,
  defaultPastPapers,
  normalizePaperRecord,
  normalizePapers,
  mergePapers,
  mergeJournals,
  clampPaperScore,
  parseQuestionRanges,
} from "../shared/merge.ts";

export type {
  StudyArea,
  SectionProgress,
  ProgressValue,
  ProgressMap,
  PlanChangeSource,
  PlanHistoryEntry,
  ProjectSetting,
  ProjectSettings,
  JournalProjectContext,
  JournalSubjectContext,
  JournalSectionItem,
  JournalSectionContext,
  JournalSectionsContext,
  JournalPaperContext,
  JournalContext,
  JournalPublish,
  JournalEntry,
  PaperKind,
  QuestionState,
  QuestionGroupDef,
  PaperRecord,
  ExamPaperItem,
  ExamPaperSubject,
  PaperQuotaInfo,
};

export {
  DEFAULT_EXAM_DATE,
  DEFAULT_PROJECT_SETTINGS,
  PAST_PAPER_YEARS,
  POLITICS_PAST_PAPER_YEARS,
  maxPaperScore,
  MAX_PAPER_FILE_SIZE,
  DEFAULT_USER_QUOTA_BYTES,
  EXAM_PAPER_SUBJECT_MAP,
  isRecord,
  isDate,
  addCalendarDays,
  clampPaperScore,
  parseQuestionRanges,
  normalizeProjectSettings,
  normalizePlanHistory,
  normalizeJournalContext,
  normalizeJournalPublish,
  normalizeJournalEntry,
  normalizeJournals,
  defaultPastPapers,
  normalizePaperRecord,
  normalizePapers,
  mergePapers,
  mergeJournals,
};

export const SCHEMA_VERSION = 2;
export const APP_VERSION = "2.0.0";
export const MAX_BACKUPS = 15;

const APP_DATA_KEY = "study-app-data-v1";
const LEGACY_PROGRESS_KEY = "408-section-progress-v1";
const BACKUPS_KEY = "study-local-backups-v1";

export function buildDefaultProgress(bookList: Book[], isMain = false): ProgressMap {
  const progress: ProgressMap = {};

  bookList.forEach((book) => {
    book.chapters.forEach((chapter) => {
      chapter.sections.forEach((section) => {
        progress[section.id] = {
          learned: isMain ? Boolean(book.initiallyComplete) : false,
          learnedAt: "",
          reviewed: false,
          reviewedAt: "",
          plannedAt: isMain ? (section.plannedAt ?? "") : "",
          reviewedPlannedAt: "",
          isCurrent: false,
        };
      });
    });
  });

  return progress;
}

export function createBlankProgress(bookList: Book[]): ProgressMap {
  return buildDefaultProgress(bookList, false);
}

export type ChapterPlanMode = "uniform" | "spread";

export type ChapterPlanSection = {
  id: string;
  learned: boolean;
  reviewed: boolean;
  plannedAt: string;
  reviewedPlannedAt?: string;
};

export const MATH_PAPER_STRUCTURE: { total: number; groups: QuestionGroupDef[] } = {
  total: 22,
  groups: [
    { type: "选择题", start: 1, end: 10, count: 10, scorePerQuestion: 5 },
    { type: "填空题", start: 11, end: 16, count: 6, scorePerQuestion: 5 },
    {
      type: "解答题",
      start: 17,
      end: 22,
      count: 6,
      scorePerQuestion: 12,
      questionScores: { 17: 10, 18: 12, 19: 12, 20: 12, 21: 12, 22: 12 },
    },
  ],
};

export const CS408_PAPER_STRUCTURE: { total: number; groups: QuestionGroupDef[] } = {
  total: 47,
  groups: [
    { type: "选择题", subject: "数据结构", start: 1, end: 11, count: 11, scorePerQuestion: 2.0 },
    { type: "选择题", subject: "计算机组成原理", start: 12, end: 22, count: 11, scorePerQuestion: 2.0 },
    { type: "选择题", subject: "操作系统", start: 23, end: 32, count: 10, scorePerQuestion: 2.0 },
    { type: "选择题", subject: "计算机网络", start: 33, end: 40, count: 8, scorePerQuestion: 2.0 },
    { type: "综合应用题", subject: "数据结构", start: 41, end: 42, count: 2, scorePerQuestion: 10 },
    { type: "综合应用题", subject: "计算机组成原理", start: 43, end: 44, count: 2, scorePerQuestion: 10 },
    { type: "综合应用题", subject: "操作系统", start: 45, end: 46, count: 2, scorePerQuestion: 10 },
    { type: "综合应用题", subject: "计算机网络", start: 47, end: 47, count: 1, scorePerQuestion: 9 },
  ],
};

export const ENGLISH_PAPER_STRUCTURE: { total: number; groups: QuestionGroupDef[] } = {
  total: 52,
  groups: [
    { type: "选择题", subject: "完形填空", start: 1, end: 20, count: 20, scorePerQuestion: 0.5 },
    { type: "选择题", subject: "传统阅读", start: 21, end: 40, count: 20, scorePerQuestion: 2.0 },
    { type: "选择题", subject: "新题型", start: 41, end: 45, count: 5, scorePerQuestion: 2.0 },
    { type: "主观表达题", subject: "英译汉", start: 46, end: 50, count: 5, scorePerQuestion: 2.0 },
    {
      type: "主观表达题",
      subject: "写作",
      start: 51,
      end: 52,
      count: 2,
      scorePerQuestion: 15,
      questionScores: { 51: 10, 52: 20 },
    },
  ],
};

export const POLITICS_PAPER_STRUCTURE: { total: number; groups: QuestionGroupDef[] } = {
  total: 33,
  groups: [
    { type: "选择题", subject: "单选", start: 1, end: 16, count: 16, scorePerQuestion: 1.0 },
    { type: "选择题", subject: "多选", start: 17, end: 33, count: 17, scorePerQuestion: 2.0 },
  ],
};

// 客观题（含填空）满分合计：英/政第二卡“选择均分”分母的统一口径。
export function choiceFullScore(area: StudyArea): number {
  return paperStructure(area).groups
    .filter((group) => group.type === "选择题" || group.type === "填空题")
    .reduce((sum, group) => sum + (group.scorePerQuestion ?? 0) * group.count, 0);
}

// 模拟卷目标量：冲刺页 endless-track 的满格刻度，可按备考规划调整。
export const MOCK_MILESTONE_TARGET = 30;
export const MOCK_MILESTONES = [5, 10, 15, 20, 25, 30];

export function paperStructure(area: StudyArea): { total: number; groups: QuestionGroupDef[] } {
  if (area === "math") return MATH_PAPER_STRUCTURE;
  if (area === "english") return ENGLISH_PAPER_STRUCTURE;
  if (area === "politics") return POLITICS_PAPER_STRUCTURE;
  return CS408_PAPER_STRUCTURE;
}

export function paperTotalQuestions(area: StudyArea): number {
  return paperStructure(area).total;
}

// 客观题（含填空）题号上界：选择正确率、批量录入、一键全对的统一口径。
export function paperMaxChoiceNum(area: StudyArea): number {
  let max = 0;
  for (const group of paperStructure(area).groups) {
    if (group.type === "选择题" || group.type === "填空题") {
      max = Math.max(max, group.end);
    }
  }
  return max;
}

// 客观题单题分值（加权正确率用）；非客观题返回 1（仅参与计数，不参与加权）。
export function choiceQuestionWeight(area: StudyArea, qNum: number): number {
  for (const group of paperStructure(area).groups) {
    if ((group.type === "选择题" || group.type === "填空题")
      && typeof group.scorePerQuestion === "number"
      && qNum >= group.start && qNum <= group.end) {
      return group.scorePerQuestion;
    }
  }
  return 1;
}

// Only recorded answers contribute; an unscored subjective rating is not a numeric score.
export function answerSheetScore(paper: PaperRecord) {
  const structure = paperStructure(paper.area);
  const maxChoice = paperMaxChoiceNum(paper.area);
  let objective = 0;
  let subjective = 0;
  let recorded = 0;
  for (let num = 1; num <= structure.total; num++) {
    if (num <= maxChoice) {
      const state = paper.questions?.[num];
      if (state === "correct" || state === "wrong") {
        recorded++;
        if (state === "correct") objective += choiceQuestionWeight(paper.area, num);
      }
    } else {
      const score = paper.questionScores?.[num];
      if (typeof score === "number" && Number.isFinite(score) && score >= 0) {
        recorded++;
        subjective += score;
      } else if (paper.questions?.[num] === "wrong") {
        recorded++;
      }
    }
  }
  objective = Math.round(objective * 10) / 10;
  subjective = Math.round(subjective * 10) / 10;
  return {
    objective,
    subjective,
    total: recorded > 0 ? clampPaperScore(objective + subjective, paper.area) : null,
    remaining: structure.total - recorded,
  };
}

export function syncAnswerSheetScore(paper: PaperRecord, completedDate = dateToday()): PaperRecord {
  const score = answerSheetScore(paper).total;
  const total = paperTotalQuestions(paper.area);
  const hasAnswers = score !== null || Object.entries(paper.questions ?? {}).some(([num, state]) =>
    Number.isInteger(Number(num)) && Number(num) >= 1 && Number(num) <= total
      && (state === "correct" || state === "partial" || state === "wrong"));
  return {
    ...paper,
    score,
    completed: hasAnswers ? true : paper.completed,
    completedAt: hasAnswers ? (paper.completedAt || completedDate) : paper.completedAt,
  };
}

export type BentoChoiceGroup = { name: string; start: number; count: number; label: string };

const SUBJECT_ABBR: Record<string, string> = {
  "数据结构": "DS",
  "计算机组成原理": "CO",
  "操作系统": "OS",
  "计算机网络": "CN",
};

// 套卷卡片点阵的客观题分组（起止与数量派生自试卷结构，展示名保持现有文案）。
export function bentoChoiceGroups(area: StudyArea): BentoChoiceGroup[] {
  if (area === "408") {
    return paperStructure(area).groups
      .filter((group) => group.type === "选择题")
      .map((group) => ({
        name: SUBJECT_ABBR[group.subject ?? ""] ?? group.subject ?? "",
        start: group.start,
        count: group.count,
        label: group.subject ?? "",
      }));
  }
  if (area === "math") {
    return [
      { name: "单选", start: 1, count: 10, label: "单选 · 5分" },
      { name: "填空", start: 11, count: 6, label: "填空 · 5分" },
    ];
  }
  if (area === "english") {
    return [
      { name: "完形", start: 1, count: 20, label: "完形" },
      { name: "阅读A", start: 21, count: 20, label: "阅读A" },
      { name: "阅读B", start: 41, count: 5, label: "阅读B" },
    ];
  }
  return [
    { name: "单选", start: 1, count: 16, label: "单选 · 1分" },
    { name: "多选", start: 17, count: 17, label: "多选 · 2分" },
  ];
}

export type ModalChoiceGroup = { name: string; start: number; count: number; scoreLabel: string };

// 答题卡弹窗客观题分行（起止与数量与 *_PAPER_STRUCTURE 对齐，展示名保持现有文案；
// 408 在弹窗内直接使用 CS408_PAPER_STRUCTURE，此处返回空）。
export function modalChoiceGroups(area: StudyArea): ModalChoiceGroup[] {
  if (area === "math") {
    return [
      { name: "单选", start: 1, count: 10, scoreLabel: "单选 · 5分" },
      { name: "填空", start: 11, count: 6, scoreLabel: "填空 · 5分" },
    ];
  }
  if (area === "english") {
    return [
      { name: "完形", start: 1, count: 20, scoreLabel: "完形 · 0.5分" },
      { name: "阅读A", start: 21, count: 20, scoreLabel: "阅读A · 2分" },
      { name: "阅读B", start: 41, count: 5, scoreLabel: "阅读B新题型 · 2分" },
    ];
  }
  if (area === "politics") {
    return [
      { name: "单选", start: 1, count: 16, scoreLabel: "单选 · 1分" },
      { name: "多选", start: 17, count: 17, scoreLabel: "多选 · 2分" },
    ];
  }
  return [];
}

export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ScheduleThemeKey = "cs408" | "math_intense" | "math_regular" | "english_pol" | "custom";

export interface CustomPeriodConfig {
  period: number;
  start: string;
  end: string;
}

export interface RestBreak {
  id: "lunch" | "dinner";
  label: "午休" | "晚休";
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  theme: ScheduleThemeKey;
  dayOfWeek: WeekdayNumber;
  startPeriod: number;
  endPeriod: number;
  locationOrNotes?: string;
  linkedArea?: "408" | "math" | "english" | "politics";
  applicableWeeks?: number[];
}

export interface ScheduleAppData {
  version: number;
  activeWeek: number;
  semesterStartDate: string;
  periods: CustomPeriodConfig[];
  lunchBreak: { start: string; end: string };
  dinnerBreak: { start: string; end: string };
  events: ScheduleEvent[];
}

export type ScheduleSlotStatus = "in_progress" | "rest_break" | "intermission" | "idle";

export interface ActiveScheduleInfo {
  status: ScheduleSlotStatus;
  activeEvent: ScheduleEvent | null;
  activePeriod: CustomPeriodConfig | null;
  restBreak: RestBreak | null;
  intermissionNextEvent: ScheduleEvent | null;
  elapsedPercent: number;
  remainingMinutes: number;
  startsInMinutes: number;
  isRest?: boolean;
  restTitle?: string;
}

export type StudyAppData = {
  schemaVersion: number;
  appVersion: string;
  progress: ProgressMap;
  projectSettings: ProjectSettings;
  planHistory: PlanHistoryEntry[];
  journals: JournalEntry[];
  papers: PaperRecord[];
  schedule?: ScheduleAppData;
};

function sameSyncValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function hasStringId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string";
}

/** Apply only local changes made since base on top of the newest server state. */
function rebaseSyncValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (sameSyncValue(local, base)) return remote;
  if (sameSyncValue(remote, base)) return local;
  if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)
    && [...base, ...local, ...remote].every(hasStringId)) {
    const baseMap = new Map(base.map((entry) => [entry.id, entry]));
    const localMap = new Map(local.map((entry) => [entry.id, entry]));
    const remoteMap = new Map(remote.map((entry) => [entry.id, entry]));
    const result: unknown[] = [];
    for (const id of new Set([...remoteMap.keys(), ...localMap.keys(), ...baseMap.keys()])) {
      if (!localMap.has(id) && baseMap.has(id)) continue;
      if (!remoteMap.has(id) && !localMap.has(id)) continue;
      const merged = rebaseSyncValue(baseMap.get(id), localMap.get(id), remoteMap.get(id));
      if (merged !== undefined) result.push(merged);
    }
    return result;
  }
  if (isRecord(local) && isRecord(remote) && isRecord(base)) {
    return Object.fromEntries(Array.from(new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]))
      .filter((key) => {
        if (!Object.hasOwn(local, key) && Object.hasOwn(base, key)) return false;
        return Object.hasOwn(local, key) || Object.hasOwn(remote, key);
      }).map((key) => [key, rebaseSyncValue(base[key], local[key], remote[key])]));
  }
  return local;
}

export function rebaseAppData(base: StudyAppData, local: StudyAppData, remote: StudyAppData): StudyAppData {
  const merged = rebaseSyncValue(base, local, remote);
  const normalized = normalizeAppData(merged, remote.progress);
  if (!normalized) return remote;

  // Review completion and scheduling are chapter actions. Resolve each vector
  // as one unit so a concurrent cancel/complete cannot leave a mixed chapter.
  const progress = { ...normalized.progress };
  const migratedBaseProgress = migrateLegacyChapterReviews(books, base.progress).progress;
  for (const book of books) {
    if (book.area !== "408" && book.area !== "math") continue;
    for (const chapter of book.chapters) {
      const ids = chapter.sections.map((section) => section.id);
      const reviewVector = (data: StudyAppData) => ids.map((id) => ({
        reviewed: Boolean(data.progress[id]?.reviewed),
        reviewedAt: data.progress[id]?.reviewedAt ?? "",
      }));
      const planVector = (data: StudyAppData) => ids.map((id) => data.progress[id]?.reviewedPlannedAt ?? "");
      const baseReview = reviewVector(base);
      const localReview = reviewVector(local);
      const migratedBaseReview = ids.map((id) => ({
        reviewed: Boolean(migratedBaseProgress[id]?.reviewed),
        reviewedAt: migratedBaseProgress[id]?.reviewedAt ?? "",
      }));
      const basePlan = planVector(base);
      const localPlan = planVector(local);
      const migratedBasePlan = ids.map((id) => migratedBaseProgress[id]?.reviewedPlannedAt ?? "");
      // A local vector produced solely by automatic legacy migration is not a
      // user edit. Preserve a newer remote chapter action in that case.
      const localReviewChanged = !sameSyncValue(localReview, baseReview)
        && !sameSyncValue(localReview, migratedBaseReview);
      const localPlanChanged = !sameSyncValue(localPlan, basePlan)
        && !sameSyncValue(localPlan, migratedBasePlan);
      const reviewSource = localReviewChanged ? local : remote;
      const planSource = localPlanChanged ? local : remote;
      const selectedReview = reviewVector(reviewSource);
      const isSingleChapterCompletion = selectedReview.length > 0
        && Boolean(selectedReview[0].reviewedAt)
        && selectedReview.every((entry) => entry.reviewed && entry.reviewedAt === selectedReview[0].reviewedAt);

      for (const id of ids) {
        const state = progress[id];
        if (!state) continue;
        const review = reviewSource.progress[id];
        const plan = planSource.progress[id];
        // A concurrent learnedAt edit can make a selected review date invalid.
        // Normalize against the merged learning fields before persisting it.
        progress[id] = normalizeSectionProgress({
          ...state,
          reviewed: Boolean(review?.reviewed),
          reviewedAt: review?.reviewedAt ?? "",
          reviewedPlannedAt: plan?.reviewedPlannedAt ?? "",
        }, state);
      }
      // If a concurrent learning edit invalidates one section of a newly
      // completed chapter, clear the entire completion rather than saving a
      // partially reviewed chapter. Older partial reviews remain untouched.
      if (isSingleChapterCompletion && ids.some((id) => !progress[id]?.reviewed)) {
        for (const id of ids) {
          const state = progress[id];
          if (state) progress[id] = { ...state, reviewed: false, reviewedAt: "" };
        }
      }
    }
  }
  return { ...normalized, progress };
}

export type AppDataPatch = {
  progressChanges: ProgressMap;
  journalChanges: JournalEntry[];
  deletedJournalIds: string[];
  paperChanges: PaperRecord[];
  deletedPaperIds: string[];
  projectSettings?: ProjectSettings;
  planHistory?: PlanHistoryEntry[];
  schedule?: ScheduleAppData;
};

export function createAppDataPatch(base: StudyAppData, current: StudyAppData): AppDataPatch {
  const progressChanges = Object.fromEntries(Object.entries(current.progress)
    .filter(([id, value]) => !sameSyncValue(value, base.progress[id])));
  const changedRecords = <T extends { id: string }>(before: T[], after: T[]) => {
    const beforeMap = new Map(before.map((entry) => [entry.id, entry]));
    const afterIds = new Set(after.map((entry) => entry.id));
    return {
      changed: after.filter((entry) => !sameSyncValue(entry, beforeMap.get(entry.id))),
      deleted: before.filter((entry) => !afterIds.has(entry.id)).map((entry) => entry.id),
    };
  };
  const journals = changedRecords(base.journals, current.journals);
  const papers = changedRecords(base.papers, current.papers);
  return {
    progressChanges,
    journalChanges: journals.changed,
    deletedJournalIds: journals.deleted,
    paperChanges: papers.changed,
    deletedPaperIds: papers.deleted,
    ...(!sameSyncValue(base.projectSettings, current.projectSettings) ? { projectSettings: current.projectSettings } : {}),
    ...(!sameSyncValue(base.planHistory, current.planHistory) ? { planHistory: current.planHistory } : {}),
    ...(!sameSyncValue(base.schedule, current.schedule) ? { schedule: current.schedule } : {}),
  };
}

export type BackupKind = "manual" | "before-import" | "before-restore" | "before-migration";

export type LocalBackup = {
  id: string;
  createdAt: string;
  kind: BackupKind;
  data: StudyAppData;
};

export type StorageLoadIssue = {
  message: string;
  raw: string;
};

export function isTodayPlan(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.plannedAt && state.plannedAt === today);
}

export function isTodayBasePlan(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.plannedAt && state.plannedAt === today);
}

export function isTodayReviewPlan(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.reviewedPlannedAt && state.reviewedPlannedAt === today);
}

export function isOverdueTask(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.plannedAt && state.plannedAt < today && !state.learned);
}

export function isOverdueBaseTask(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.plannedAt && state.plannedAt < today && !state.learned);
}

export function isOverdueReviewTask(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.reviewedPlannedAt && state.reviewedPlannedAt < today && state.learned && !state.reviewed);
}

export function isUnreviewedTask(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.learned && !state.reviewed && state.learnedAt && state.learnedAt < today);
}

export function calculateRecentStreak(progress: ProgressMap, today: string): number {
  const activeDates = new Set<string>();
  Object.values(progress).forEach((entry) => {
    if (entry.learnedAt && entry.learnedAt <= today) activeDates.add(entry.learnedAt);
    if (entry.reviewedAt && entry.reviewedAt <= today) activeDates.add(entry.reviewedAt);
  });
  if (!activeDates.size) return 0;

  const latestActiveDate = [...activeDates].sort().at(-1);
  if (!latestActiveDate) return 0;

  let streak = 0;
  let cursor = latestActiveDate;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}

export function calculateMaxStreak(progress: ProgressMap): number {
  const activeDates = new Set<string>();
  Object.values(progress).forEach((entry) => {
    if (entry.learnedAt) activeDates.add(entry.learnedAt);
    if (entry.reviewedAt) activeDates.add(entry.reviewedAt);
  });
  if (!activeDates.size) return 0;
  const sorted = [...activeDates].sort();
  let max = 0;
  let current = 0;
  let prev: string | null = null;
  for (const dateStr of sorted) {
    if (!prev) {
      current = 1;
    } else {
      const expectedNext = addCalendarDays(prev, 1);
      if (dateStr === expectedNext) {
        current += 1;
      } else {
        current = 1;
      }
    }
    if (current > max) max = current;
    prev = dateStr;
  }
  return max;
}

export type ForecastHealth = "completed" | "healthy" | "steady" | "tight" | "behind" | "pending";

export type VelocityForecast = {
  dailyVelocity14d: number;
  dailyVelocityAllTime: number;
  learnedLast14d: number;
  reviewedLast14d: number;
  totalSections: number;
  learnedTotal: number;
  reviewedTotal: number;
  remainingSections: number;
  daysNeeded: number | null;
  estimatedCompletionDate: string | null;
  daysUntilExam: number;
  sprintDays: number | null;
  health: ForecastHealth;
};

export function calculateVelocityAndForecast(
  progress: ProgressMap,
  sectionIds: string[],
  examDate: string,
  today: string,
): VelocityForecast {
  const totalSections = sectionIds.length;
  const learnedTotal = sectionIds.filter((id) => progress[id]?.learned).length;
  const reviewedTotal = sectionIds.filter((id) => progress[id]?.reviewed).length;
  const remainingSections = Math.max(0, totalSections - learnedTotal);

  // 14 天时间窗口
  const windowStart = addCalendarDays(today, -13);
  let learnedLast14d = 0;
  let reviewedLast14d = 0;
  const allLearnedDates: string[] = [];

  sectionIds.forEach((id) => {
    const item = progress[id];
    if (!item) return;
    if (item.learnedAt && item.learnedAt <= today) {
      allLearnedDates.push(item.learnedAt);
      if (item.learnedAt >= windowStart) learnedLast14d += 1;
    }
    if (item.reviewedAt && item.reviewedAt <= today && item.reviewedAt >= windowStart) {
      reviewedLast14d += 1;
    }
  });

  const dailyVelocity14d = Number((learnedLast14d / 14).toFixed(2));

  // 全周期日均速率
  let dailyVelocityAllTime = 0;
  if (allLearnedDates.length > 0) {
    allLearnedDates.sort();
    const earliest = allLearnedDates[0];
    const diffDays = Math.max(1, Math.ceil((new Date(`${today}T00:00:00`).getTime() - new Date(`${earliest}T00:00:00`).getTime()) / 86_400_000) + 1);
    dailyVelocityAllTime = Number((learnedTotal / diffDays).toFixed(2));
  }

  // 考研倒计时
  const targetTime = new Date(`${examDate}T00:00:00`).getTime();
  const todayTime = new Date(`${today}T00:00:00`).getTime();
  const daysUntilExam = Math.max(0, Math.ceil((targetTime - todayTime) / 86_400_000));

  let daysNeeded: number | null = null;
  let estimatedCompletionDate: string | null = null;
  let sprintDays: number | null = null;
  let health: ForecastHealth = "pending";

  if (remainingSections === 0 && totalSections > 0) {
    health = "completed";
    daysNeeded = 0;
    estimatedCompletionDate = today;
    sprintDays = daysUntilExam;
  } else {
    // 优先采用近 14 天速率，若为 0 则尝试历史总平均
    const effectiveVelocity = dailyVelocity14d > 0 ? dailyVelocity14d : dailyVelocityAllTime;
    if (effectiveVelocity > 0) {
      daysNeeded = Math.ceil(remainingSections / effectiveVelocity);
      estimatedCompletionDate = addCalendarDays(today, daysNeeded);
      sprintDays = daysUntilExam - daysNeeded;

      if (sprintDays >= 45) {
        health = "healthy";
      } else if (sprintDays >= 15) {
        health = "steady";
      } else if (sprintDays >= 0) {
        health = "tight";
      } else {
        health = "behind";
      }
    } else {
      health = "pending";
    }
  }

  return {
    dailyVelocity14d,
    dailyVelocityAllTime,
    learnedLast14d,
    reviewedLast14d,
    totalSections,
    learnedTotal,
    reviewedTotal,
    remainingSections,
    daysNeeded,
    estimatedCompletionDate,
    daysUntilExam,
    sprintDays,
    health,
  };
}

export type HeatmapDay = {
  date: string;
  dayOfWeek: number; // 0 for Mon ... 6 for Sun
  learnedCount: number;
  reviewedCount: number;
  totalActions: number;
  level: 0 | 1 | 2 | 3;
  isToday: boolean;
  isFuture: boolean;
};

export function calculateActivityHeatmap(
  progress: ProgressMap,
  today: string,
  weeksCount = 13,
): HeatmapDay[] {
  const todayDate = new Date(`${today}T00:00:00`);
  const rawDow = todayDate.getDay(); // 0 is Sun, 1 is Mon...
  const dow = rawDow === 0 ? 6 : rawDow - 1; // 0 is Mon, 6 is Sun

  // 当前周的周日
  const currentWeekSunday = addCalendarDays(today, 6 - dow);
  const totalDays = weeksCount * 7;
  const startDate = addCalendarDays(currentWeekSunday, -(totalDays - 1));

  // 索引打卡数据
  const learnedByDate: Record<string, number> = {};
  const reviewedByDate: Record<string, number> = {};

  Object.values(progress).forEach((entry) => {
    if (entry.learnedAt) {
      learnedByDate[entry.learnedAt] = (learnedByDate[entry.learnedAt] || 0) + 1;
    }
    if (entry.reviewedAt) {
      reviewedByDate[entry.reviewedAt] = (reviewedByDate[entry.reviewedAt] || 0) + 1;
    }
  });

  const days: HeatmapDay[] = [];
  for (let i = 0; i < totalDays; i += 1) {
    const dateStr = addCalendarDays(startDate, i);
    const isFuture = dateStr > today;
    const isToday = dateStr === today;
    const dayDate = new Date(`${dateStr}T00:00:00`);
    const dayDowRaw = dayDate.getDay();
    const dayOfWeek = dayDowRaw === 0 ? 6 : dayDowRaw - 1;

    const learnedCount = isFuture ? 0 : (learnedByDate[dateStr] || 0);
    const reviewedCount = isFuture ? 0 : (reviewedByDate[dateStr] || 0);
    const totalActions = learnedCount + reviewedCount;

    let level: 0 | 1 | 2 | 3 = 0;
    if (totalActions === 1) level = 1;
    else if (totalActions >= 2 && totalActions <= 3) level = 2;
    else if (totalActions >= 4) level = 3;

    days.push({
      date: dateStr,
      dayOfWeek,
      learnedCount,
      reviewedCount,
      totalActions,
      level,
      isToday,
      isFuture,
    });
  }

  return days;
}

export type WeeklyTrend = {
  weekLabel: string;
  shortLabel: string;
  startDate: string;
  endDate: string;
  learnedCount: number;
  reviewedCount: number;
  totalActions: number;
  isCurrentWeek: boolean;
};

export function calculateWeeklyTrends(
  progress: ProgressMap,
  today: string,
  weeksCount = 8,
): WeeklyTrend[] {
  const todayDate = new Date(`${today}T00:00:00`);
  const rawDow = todayDate.getDay();
  const dow = rawDow === 0 ? 6 : rawDow - 1; // 0 for Mon
  const currentMonday = addCalendarDays(today, -dow);

  const learnedByDate: Record<string, number> = {};
  const reviewedByDate: Record<string, number> = {};

  Object.values(progress).forEach((entry) => {
    if (entry.learnedAt && entry.learnedAt <= today) {
      learnedByDate[entry.learnedAt] = (learnedByDate[entry.learnedAt] || 0) + 1;
    }
    if (entry.reviewedAt && entry.reviewedAt <= today) {
      reviewedByDate[entry.reviewedAt] = (reviewedByDate[entry.reviewedAt] || 0) + 1;
    }
  });

  const trends: WeeklyTrend[] = [];

  for (let w = weeksCount - 1; w >= 0; w -= 1) {
    const startDate = addCalendarDays(currentMonday, -w * 7);
    const endDate = addCalendarDays(startDate, 6);
    const isCurrentWeek = w === 0;

    let learnedCount = 0;
    let reviewedCount = 0;

    for (let d = 0; d < 7; d += 1) {
      const curDate = addCalendarDays(startDate, d);
      if (curDate <= today) {
        learnedCount += learnedByDate[curDate] || 0;
        reviewedCount += reviewedByDate[curDate] || 0;
      }
    }

    const startMonth = Number(startDate.slice(5, 7));
    const startDay = Number(startDate.slice(8, 10));
    const endMonth = Number(endDate.slice(5, 7));
    const endDay = Number(endDate.slice(8, 10));
    const weekLabel = isCurrentWeek ? "本周" : `${startMonth}/${startDay} - ${endMonth}/${endDay}`;
    const shortLabel = isCurrentWeek ? "本周" : `${startMonth}.${startDay}`;

    trends.push({
      weekLabel,
      shortLabel,
      startDate,
      endDate,
      learnedCount,
      reviewedCount,
      totalActions: learnedCount + reviewedCount,
      isCurrentWeek,
    });
  }

  return trends;
}

export type DisciplineStats = {
  currentStreak: number;
  maxStreak: number;
  totalActions: number;
  plannedCount: number;
  onTimeLearnedCount: number;
  onTimeRate: number | null;
  planAdjustmentCount: number;
};

export function calculateDisciplineStats(
  progress: ProgressMap,
  planHistory: PlanHistoryEntry[],
  today: string,
): DisciplineStats {
  const currentStreak = calculateRecentStreak(progress, today);
  const maxStreak = calculateMaxStreak(progress);

  let totalActions = 0;
  let plannedCount = 0;
  let plannedAndLearnedCount = 0;
  let onTimeLearnedCount = 0;

  Object.values(progress).forEach((entry) => {
    if (entry.learned) totalActions += 1;
    if (entry.reviewed) totalActions += 1;
    if (entry.plannedAt) {
      plannedCount += 1;
      if (entry.learned && entry.learnedAt) {
        plannedAndLearnedCount += 1;
        if (entry.learnedAt <= entry.plannedAt) {
          onTimeLearnedCount += 1;
        }
      }
    }
  });

  const onTimeRate = plannedAndLearnedCount > 0
    ? Math.round((onTimeLearnedCount / plannedAndLearnedCount) * 100)
    : null;

  return {
    currentStreak,
    maxStreak,
    totalActions,
    plannedCount,
    onTimeLearnedCount,
    onTimeRate,
    planAdjustmentCount: planHistory.length,
  };
}

export const defaultProjectSettings = (): ProjectSettings => structuredClone(DEFAULT_PROJECT_SETTINGS);

export function buildChapterPlanChanges(
  sections: ChapterPlanSection[],
  range: { start: string; end: string; includeCompleted: boolean },
  mode: ChapterPlanMode,
  targetPhase: "base" | "review" = "base",
): Record<string, string> {
  if (!isDate(range.start) || (mode === "spread" && (!isDate(range.end) || range.end < range.start))) return {};

  const eligible = sections.filter((section) => {
    const isCompleted = targetPhase === "review" ? section.reviewed : section.learned;
    const existingPlan = targetPhase === "review" ? section.reviewedPlannedAt : section.plannedAt;
    if (!range.includeCompleted && isCompleted) return false;
    // “统一日期”用于补齐尚未安排的项目，不能覆盖已有计划。
    return mode !== "uniform" || !existingPlan;
  });

  if (mode === "uniform") {
    return Object.fromEntries(eligible.map((section) => [section.id, range.start]));
  }

  const [startYear, startMonth, startDay] = range.start.split("-").map(Number);
  const [endYear, endMonth, endDay] = range.end.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  const dayCount = Math.floor((end - start) / 86_400_000) + 1;

  return Object.fromEntries(eligible.map((section, index) => {
    const offset = Math.floor((index * dayCount) / Math.max(eligible.length, 1));
    return [section.id, addCalendarDays(range.start, Math.min(offset, dayCount - 1))];
  }));
}

export function normalizeSectionProgress(value: unknown, fallback?: SectionProgress): SectionProgress {
  const base: SectionProgress = fallback ?? {
    learned: false,
    learnedAt: "",
    reviewed: false,
    reviewedAt: "",
    plannedAt: "",
    reviewedPlannedAt: "",
    isCurrent: false,
  };
  if (!isRecord(value)) return base;

  const learned = Boolean(value.learned);
  const learnedAt = isDate(value.learnedAt) ? value.learnedAt : "";
  const candidateReviewedAt = isDate(value.reviewedAt) ? value.reviewedAt : "";
  const reviewed = learned
    && Boolean(value.reviewed)
    && Boolean(candidateReviewedAt)
    && (!learnedAt || candidateReviewedAt >= learnedAt);

  const plannedAt = value.plannedAt === "" || isDate(value.plannedAt) ? value.plannedAt : base.plannedAt;
  const reviewedPlannedAt = value.reviewedPlannedAt === "" || isDate(value.reviewedPlannedAt)
    ? value.reviewedPlannedAt
    : (base.reviewedPlannedAt ?? "");

  return {
    learned,
    learnedAt,
    reviewed,
    reviewedAt: reviewed ? candidateReviewedAt : "",
    plannedAt,
    reviewedPlannedAt,
    isCurrent: !learned && Boolean(value.isCurrent),
  };
}

function normalizeProgressMap(value: unknown, fallback: ProgressMap): ProgressMap {
  if (!isRecord(value)) return fallback;
  const normalized = { ...fallback };

  const sectionIds = new Set([...Object.keys(fallback), ...Object.keys(value)]);
  sectionIds.forEach((sectionId) => {
    const entry = value[sectionId];
    if (!isRecord(entry)) return;
    normalized[sectionId] = normalizeSectionProgress(entry, fallback[sectionId]);
  });

  return normalized;
}

export function dateToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function generateJournalId(journals: JournalEntry[], dateStr = dateToday()): string {
  const cleanDate = dateStr.replace(/-/g, "");
  const prefix = cleanDate;
  let maxSeq = 0;
  journals.forEach((entry) => {
    if (typeof entry.id === "string" && entry.id.startsWith(prefix) && /^\d{11}(?:-[0-9a-f-]{36})?$/.test(entry.id)) {
      const seq = parseInt(entry.id.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  });
  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `${prefix}${nextSeq}`;
}

// Keep the readable date/sequence while preventing offline devices from sharing an ID.
export function generateUniqueJournalId(journals: JournalEntry[], dateStr = dateToday()): string {
  return `${generateJournalId(journals, dateStr)}-${crypto.randomUUID()}`;
}

export function extractJournalSections(context: JournalContext | null): JournalSectionItem[] {
  if (!context) return [];
  if (context.type === "sections" && Array.isArray(context.sections)) {
    return context.sections;
  }
  if (context.type === "section" && context.sectionId) {
    return [{
      area: context.area,
      bookId: context.bookId,
      sectionId: context.sectionId,
      bookTitle: context.bookTitle,
      sectionTitle: context.sectionTitle,
      sectionNumber: context.sectionNumber,
    }];
  }
  return [];
}

export const WEEKDAY_LABELS: Record<WeekdayNumber, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

export const DEFAULT_SCHEDULE_PERIODS: CustomPeriodConfig[] = [
  { period: 1, start: "08:10", end: "09:00" },
  { period: 2, start: "09:10", end: "10:00" },
  { period: 3, start: "10:10", end: "11:00" },
  { period: 4, start: "11:10", end: "12:00" },
  { period: 5, start: "14:00", end: "14:50" },
  { period: 6, start: "15:00", end: "15:50" },
  { period: 7, start: "16:10", end: "17:00" },
  { period: 8, start: "17:10", end: "18:00" },
  { period: 9, start: "18:30", end: "19:20" },
  { period: 10, start: "19:30", end: "20:20" },
  { period: 11, start: "20:30", end: "21:20" },
  { period: 12, start: "21:30", end: "22:20" },
  { period: 13, start: "22:30", end: "23:20" },
];

export const DEFAULT_SCHEDULE_EVENTS: ScheduleEvent[] = [
  // ── 上午：周一至周五 2~4 节 (09:10 - 12:00) 数学 ──
  { id: "sched_mon_math_intense", title: "数学", theme: "math_intense", dayOfWeek: 1, startPeriod: 2, endPeriod: 4, linkedArea: "math" },
  { id: "sched_tue_math_intense", title: "数学", theme: "math_intense", dayOfWeek: 2, startPeriod: 2, endPeriod: 4, linkedArea: "math" },
  { id: "sched_wed_math_intense", title: "数学", theme: "math_intense", dayOfWeek: 3, startPeriod: 2, endPeriod: 4, linkedArea: "math" },
  { id: "sched_thu_math_intense", title: "数学", theme: "math_intense", dayOfWeek: 4, startPeriod: 2, endPeriod: 4, linkedArea: "math" },
  { id: "sched_fri_math_intense", title: "数学", theme: "math_intense", dayOfWeek: 5, startPeriod: 2, endPeriod: 4, linkedArea: "math" },

  // ── 下午：周一至周六 5~8 节 (14:00 - 18:00) 408 统考 ──
  { id: "sched_mon_408_afternoon", title: "408", theme: "cs408", dayOfWeek: 1, startPeriod: 5, endPeriod: 8, linkedArea: "408" },
  { id: "sched_tue_408_afternoon", title: "408", theme: "cs408", dayOfWeek: 2, startPeriod: 5, endPeriod: 8, linkedArea: "408" },
  { id: "sched_wed_408_afternoon", title: "408", theme: "cs408", dayOfWeek: 3, startPeriod: 5, endPeriod: 8, linkedArea: "408" },
  { id: "sched_thu_408_afternoon", title: "408", theme: "cs408", dayOfWeek: 4, startPeriod: 5, endPeriod: 8, linkedArea: "408" },
  { id: "sched_fri_408_afternoon", title: "408", theme: "cs408", dayOfWeek: 5, startPeriod: 5, endPeriod: 8, linkedArea: "408" },
  { id: "sched_sat_408_afternoon", title: "408", theme: "cs408", dayOfWeek: 6, startPeriod: 5, endPeriod: 8, linkedArea: "408" },

  // ── 下午：周日 5~8 节 (14:00 - 18:00) 数学 ──
  { id: "sched_sun_math_afternoon", title: "数学", theme: "math_intense", dayOfWeek: 7, startPeriod: 5, endPeriod: 8, linkedArea: "math" },

  // ── 晚间前半场：10~11 节 (19:30 - 21:20) 408 与数学交替 ──
  { id: "sched_mon_408_eve", title: "408", theme: "cs408", dayOfWeek: 1, startPeriod: 10, endPeriod: 11, linkedArea: "408" },
  { id: "sched_tue_math_eve", title: "数学", theme: "math_intense", dayOfWeek: 2, startPeriod: 10, endPeriod: 11, linkedArea: "math" },
  { id: "sched_wed_408_eve", title: "408", theme: "cs408", dayOfWeek: 3, startPeriod: 10, endPeriod: 11, linkedArea: "408" },
  { id: "sched_thu_math_eve", title: "数学", theme: "math_intense", dayOfWeek: 4, startPeriod: 10, endPeriod: 11, linkedArea: "math" },
  { id: "sched_fri_408_eve", title: "408", theme: "cs408", dayOfWeek: 5, startPeriod: 10, endPeriod: 11, linkedArea: "408" },
  { id: "sched_sat_math_eve", title: "数学", theme: "math_intense", dayOfWeek: 6, startPeriod: 10, endPeriod: 11, linkedArea: "math" },

  // ── 晚间后半场：13 节 (22:30 - 23:20) / 周日 12~13 节 (21:30 - 23:20) 英政 ──
  { id: "sched_mon_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 1, startPeriod: 13, endPeriod: 13 },
  { id: "sched_tue_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 2, startPeriod: 13, endPeriod: 13 },
  { id: "sched_wed_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 3, startPeriod: 13, endPeriod: 13 },
  { id: "sched_thu_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 4, startPeriod: 13, endPeriod: 13 },
  { id: "sched_fri_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 5, startPeriod: 13, endPeriod: 13 },
  { id: "sched_sat_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 6, startPeriod: 13, endPeriod: 13 },
  { id: "sched_sun_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 7, startPeriod: 12, endPeriod: 13 },
];

export function buildDefaultSchedule(): ScheduleAppData {
  return {
    version: 1,
    activeWeek: 2,
    semesterStartDate: "2026-08-24",
    periods: DEFAULT_SCHEDULE_PERIODS.map((p) => ({ ...p })),
    lunchBreak: { start: "12:00", end: "14:00" },
    dinnerBreak: { start: "18:00", end: "18:30" },
    events: DEFAULT_SCHEDULE_EVENTS.map((e) => ({ ...e })),
  };
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(":")) return 0;
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatMonthDay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return "";
  const [, m, d] = parts;
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export interface WeekDayInfo {
  dayOfWeek: WeekdayNumber;
  label: string;
  dateStr: string;
  monthDay: string;
  isToday: boolean;
}

export function getWeekDaysInfo(
  semesterStartDate: string,
  weekNumber: number,
  todayStr: string,
): WeekDayInfo[] {
  const mondayOffset = (Math.max(1, weekNumber) - 1) * 7;
  const weekMonday = addCalendarDays(semesterStartDate, mondayOffset);

  const days: WeekDayInfo[] = [];
  for (let d = 1; d <= 7; d++) {
    const dow = d as WeekdayNumber;
    const dateStr = addCalendarDays(weekMonday, d - 1);
    days.push({
      dayOfWeek: dow,
      label: WEEKDAY_LABELS[dow],
      dateStr,
      monthDay: formatMonthDay(dateStr),
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

export function calculateWeekNumber(semesterStartDate: string, todayStr: string): number {
  if (!semesterStartDate || !todayStr) return 1;
  const start = new Date(`${semesterStartDate}T00:00:00Z`).getTime();
  const current = new Date(`${todayStr}T00:00:00Z`).getTime();
  const diffDays = Math.floor((current - start) / (86400 * 1000));
  if (diffDays < 0) return 1;
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(1, week), 25);
}

export function normalizeSchedule(value: unknown): ScheduleAppData {
  const fallback = buildDefaultSchedule();
  if (!isRecord(value)) return fallback;

  const version = typeof value.version === "number" ? value.version : 1;
  const activeWeek = typeof value.activeWeek === "number" && value.activeWeek >= 1 && value.activeWeek <= 30
    ? value.activeWeek
    : fallback.activeWeek;
  const semesterStartDate = typeof value.semesterStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.semesterStartDate)
    ? value.semesterStartDate
    : fallback.semesterStartDate;

  const lunchBreak = isRecord(value.lunchBreak) && typeof value.lunchBreak.start === "string" && typeof value.lunchBreak.end === "string"
    ? { start: value.lunchBreak.start, end: value.lunchBreak.end }
    : fallback.lunchBreak;

  const dinnerBreak = isRecord(value.dinnerBreak) && typeof value.dinnerBreak.start === "string" && typeof value.dinnerBreak.end === "string"
    ? { start: value.dinnerBreak.start, end: value.dinnerBreak.end }
    : fallback.dinnerBreak;

  let periods: CustomPeriodConfig[] = fallback.periods;
  if (Array.isArray(value.periods) && value.periods.length > 0) {
    const cleanedPeriods = value.periods
      .filter((p): p is Record<string, unknown> => isRecord(p) && typeof p.period === "number" && typeof p.start === "string" && typeof p.end === "string")
      .map((p) => ({
        period: p.period as number,
        start: String(p.start),
        end: String(p.end),
      }));
    if (cleanedPeriods.length > 0) {
      periods = cleanedPeriods;
    }
  }

  let events: ScheduleEvent[] = fallback.events;
  if (Array.isArray(value.events)) {
    const validThemes = new Set<ScheduleThemeKey>(["cs408", "math_intense", "math_regular", "english_pol", "custom"]);
    const cleanedEvents: ScheduleEvent[] = value.events
      .filter((e): e is Record<string, unknown> =>
        isRecord(e) &&
        typeof e.id === "string" &&
        typeof e.title === "string" &&
        typeof e.dayOfWeek === "number" &&
        e.dayOfWeek >= 1 && e.dayOfWeek <= 7 &&
        typeof e.startPeriod === "number" &&
        typeof e.endPeriod === "number" &&
        e.startPeriod <= e.endPeriod
      )
      .map((e) => {
        const rawTitle = String(e.title).trim();
        const title = rawTitle === "数学强化" ? "数学" : rawTitle;
        let theme = (typeof e.theme === "string" && validThemes.has(e.theme as ScheduleThemeKey) ? e.theme : "custom") as ScheduleThemeKey;
        if (title === "数学" && (theme === "math_regular" || theme === "math_intense")) {
          theme = "math_intense";
        }
        return {
          id: String(e.id),
          title,
          theme,
          dayOfWeek: e.dayOfWeek as WeekdayNumber,
          startPeriod: e.startPeriod as number,
          endPeriod: e.endPeriod as number,
          locationOrNotes: typeof e.locationOrNotes === "string" ? e.locationOrNotes : undefined,
          linkedArea: (e.linkedArea === "408" || e.linkedArea === "math" || e.linkedArea === "english" || e.linkedArea === "politics")
            ? (e.linkedArea as "408" | "math" | "english" | "politics")
            : (title === "数学" ? "math" : undefined),
          applicableWeeks: Array.isArray(e.applicableWeeks) ? e.applicableWeeks.filter((w) => typeof w === "number") : undefined,
        };
      });

    // 默认排课平滑补全：若当前基于默认排课模板但尚未增设周日 5~8 节数学，自动平滑补齐
    const isDefaultTemplate = cleanedEvents.some((e) => e.id.startsWith("sched_"));
    const hasSundayAfternoon = cleanedEvents.some((e) => e.dayOfWeek === 7 && e.startPeriod <= 8 && e.endPeriod >= 5);
    if (isDefaultTemplate && !hasSundayAfternoon) {
      cleanedEvents.push({
        id: "sched_sun_math_afternoon",
        title: "数学",
        theme: "math_intense",
        dayOfWeek: 7,
        startPeriod: 5,
        endPeriod: 8,
        linkedArea: "math",
      });
      cleanedEvents.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriod - b.startPeriod);
    }

    if (cleanedEvents.length > 0 || value.events.length === 0) {
      events = cleanedEvents;
    }
  }

  return {
    version,
    activeWeek,
    semesterStartDate,
    periods,
    lunchBreak,
    dinnerBreak,
    events,
  };
}

export function calculateScheduleStatus(
  schedule: ScheduleAppData,
  now = new Date(),
  overrideDayOfWeek?: WeekdayNumber,
  overrideTimeStr?: string,
): ActiveScheduleInfo {
  let dow: WeekdayNumber;
  let currentMinutes: number;

  if (overrideDayOfWeek !== undefined && overrideTimeStr !== undefined) {
    dow = overrideDayOfWeek;
    currentMinutes = timeToMinutes(overrideTimeStr);
  } else {
    const jsDay = now.getDay();
    dow = (jsDay === 0 ? 7 : jsDay) as WeekdayNumber;
    currentMinutes = now.getHours() * 60 + now.getMinutes();
  }

  const lunchStart = timeToMinutes(schedule.lunchBreak.start);
  const lunchEnd = timeToMinutes(schedule.lunchBreak.end);
  if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
    return {
      status: "rest_break",
      activeEvent: null,
      activePeriod: null,
      restBreak: {
        id: "lunch",
        label: "午休",
        startTime: schedule.lunchBreak.start,
        endTime: schedule.lunchBreak.end,
        startMinutes: lunchStart,
        endMinutes: lunchEnd,
      },
      intermissionNextEvent: null,
      elapsedPercent: Math.round(((currentMinutes - lunchStart) / (lunchEnd - lunchStart)) * 100),
      remainingMinutes: lunchEnd - currentMinutes,
      startsInMinutes: 0,
      isRest: true,
      restTitle: "午休中",
    };
  }

  const dinnerStart = timeToMinutes(schedule.dinnerBreak.start);
  const dinnerEnd = timeToMinutes(schedule.dinnerBreak.end);
  if (currentMinutes >= dinnerStart && currentMinutes < dinnerEnd) {
    return {
      status: "rest_break",
      activeEvent: null,
      activePeriod: null,
      restBreak: {
        id: "dinner",
        label: "晚休",
        startTime: schedule.dinnerBreak.start,
        endTime: schedule.dinnerBreak.end,
        startMinutes: dinnerStart,
        endMinutes: dinnerEnd,
      },
      intermissionNextEvent: null,
      elapsedPercent: Math.round(((currentMinutes - dinnerStart) / (dinnerEnd - dinnerStart)) * 100),
      remainingMinutes: dinnerEnd - currentMinutes,
      startsInMinutes: 0,
      isRest: true,
      restTitle: "晚休中",
    };
  }

  const periodMap = new Map<number, CustomPeriodConfig>();
  for (const p of schedule.periods) {
    periodMap.set(p.period, p);
  }

  const todayEvents = schedule.events.filter((e) => e.dayOfWeek === dow);

  for (const evt of todayEvents) {
    const startP = periodMap.get(evt.startPeriod);
    const endP = periodMap.get(evt.endPeriod);
    if (!startP || !endP) continue;

    const startMin = timeToMinutes(startP.start);
    const endMin = timeToMinutes(endP.end);

    if (currentMinutes >= startMin && currentMinutes < endMin) {
      const elapsed = currentMinutes - startMin;
      const total = endMin - startMin;
      const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0;
      return {
        status: "in_progress",
        activeEvent: evt,
        activePeriod: startP,
        restBreak: null,
        intermissionNextEvent: null,
        elapsedPercent: percent,
        remainingMinutes: endMin - currentMinutes,
        startsInMinutes: 0,
        isRest: false,
        restTitle: undefined,
      };
    }
  }

  // 当前时间如果处于某一节课的时间区间内（但未排课），记录当前时段，标记为休息中
  const currentPeriodSlot = schedule.periods.find((p) => {
    const s = timeToMinutes(p.start);
    const e = timeToMinutes(p.end);
    return currentMinutes >= s && currentMinutes < e;
  }) ?? null;

  let nextEvt: ScheduleEvent | null = null;
  let minStartDiff = Infinity;

  for (const evt of todayEvents) {
    const startP = periodMap.get(evt.startPeriod);
    if (!startP) continue;
    const startMin = timeToMinutes(startP.start);
    if (startMin > currentMinutes) {
      const diff = startMin - currentMinutes;
      if (diff < minStartDiff) {
        minStartDiff = diff;
        nextEvt = evt;
      }
    }
  }

  if (nextEvt && minStartDiff <= 30) {
    return {
      status: "intermission",
      activeEvent: null,
      activePeriod: currentPeriodSlot,
      restBreak: null,
      intermissionNextEvent: nextEvt,
      elapsedPercent: 0,
      remainingMinutes: 0,
      startsInMinutes: minStartDiff,
      isRest: true,
      restTitle: "休息中",
    };
  }

  return {
    status: "idle",
    activeEvent: null,
    activePeriod: currentPeriodSlot,
    restBreak: null,
    intermissionNextEvent: nextEvt,
    elapsedPercent: 0,
    remainingMinutes: 0,
    startsInMinutes: nextEvt ? minStartDiff : 0,
    isRest: true,
    restTitle: "休息中",
  };
}

export function normalizeAppData(value: unknown, fallbackProgress: ProgressMap): StudyAppData | null {
  if (!isRecord(value)
    || (value.schemaVersion !== 1 && value.schemaVersion !== SCHEMA_VERSION)
    || !isRecord(value.progress)
    || !isRecord(value.projectSettings)
    || !Array.isArray(value.planHistory)) return null;

  const journals = Array.isArray(value.journals) ? normalizeJournals(value.journals) : [];
  const papers = normalizePapers(value.papers);
  const schedule = normalizeSchedule(value.schedule);

  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof value.appVersion === "string" ? value.appVersion : APP_VERSION,
    progress: normalizeProgressMap(value.progress, fallbackProgress),
    projectSettings: normalizeProjectSettings(value.projectSettings),
    planHistory: normalizePlanHistory(value.planHistory),
    journals,
    papers,
    schedule,
  };
}

export function createAppData(
  progress: ProgressMap,
  projectSettings = defaultProjectSettings(),
  planHistory: PlanHistoryEntry[] = [],
  journals: JournalEntry[] = [],
  papers: PaperRecord[] = defaultPastPapers(),
  schedule: ScheduleAppData = buildDefaultSchedule(),
): StudyAppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    progress,
    projectSettings,
    planHistory,
    journals,
    papers,
    schedule,
  };
}

export function summarizeImport(data: StudyAppData, projectCount: number, subjectCount: number) {
  return {
    projects: projectCount,
    subjects: subjectCount,
    sections: Object.keys(data.progress).length,
    planHistory: data.planHistory.length,
    journals: data.journals.length,
    papers: data.papers ? data.papers.length : 0,
  };
}

export class StorageRepository {
  private storage: Storage;
  private namespace: string;
  private loadIssue: StorageLoadIssue | null = null;

  constructor(storage: Storage, namespace?: string) {
    this.storage = storage;
    // undefined 表示老单用户单测未传，保持兼容 main
    // 显式传空字符串 "" 则表示未登录或隔离态，进入 quarantine
    this.namespace = namespace === undefined ? "main" : namespace.trim();
  }

  private isQuarantined(): boolean {
    return !this.namespace;
  }

  private appDataKey(): string {
    if (this.isQuarantined()) return `${APP_DATA_KEY}:__unauthenticated__`;
    return this.namespace !== "main"
      ? `${APP_DATA_KEY}:${this.namespace}`
      : APP_DATA_KEY;
  }

  private syncBaseKey(): string {
    return `${this.appDataKey()}:sync-base`;
  }

  loadSyncBase(fallbackProgress: ProgressMap): StudyAppData | null {
    if (this.isQuarantined()) return null;
    try {
      return normalizeAppData(JSON.parse(this.storage.getItem(this.syncBaseKey()) || "null"), fallbackProgress);
    } catch {
      return null;
    }
  }

  saveSyncBase(data: StudyAppData): void {
    if (this.isQuarantined()) return;
    try {
      this.storage.setItem(this.syncBaseKey(), JSON.stringify(data));
    } catch {
      // The remote copy remains authoritative if local storage is full.
    }
  }

  private legacyProgressKey(): string {
    // 只有明确为 main 空间时才允许继承和迁移单用户旧键
    if (this.namespace === "main") return LEGACY_PROGRESS_KEY;
    return "";
  }

  private backupsKey(): string {
    if (this.isQuarantined()) return `${BACKUPS_KEY}:__unauthenticated__`;
    return this.namespace !== "main"
      ? `${BACKUPS_KEY}:${this.namespace}`
      : BACKUPS_KEY;
  }

  load(fallbackProgress: ProgressMap): StudyAppData | null {
    this.loadIssue = null;
    if (this.isQuarantined()) return null;

    const currentRaw = this.storage.getItem(this.appDataKey());
    if (currentRaw) {
      try {
        const parsed = JSON.parse(currentRaw);
        const isV1 = isRecord(parsed) && parsed.schemaVersion === 1;
        const normalized = normalizeAppData(parsed, fallbackProgress);
        if (normalized) {
          if (isV1) {
            this.createBackup(normalized, "before-migration");
            this.save(normalized);
          }
          return normalized;
        }
        this.loadIssue = { message: "本地数据版本无法识别，原始数据未被覆盖，可在设置中导出排查", raw: currentRaw };
      } catch {
        this.loadIssue = { message: "本地数据无法解析，原始数据未被覆盖，可在设置中导出排查", raw: currentRaw };
      }
      return null;
    }

    const legacyKey = this.legacyProgressKey();
    if (!legacyKey) return null;
    const legacyRaw = this.storage.getItem(legacyKey);
    if (!legacyRaw) return null;
    try {
      const legacy = JSON.parse(legacyRaw);
      if (!isRecord(legacy)) {
        this.loadIssue = { message: "旧版数据结构无法识别，原始数据未被覆盖，可在设置中导出排查", raw: legacyRaw };
        return null;
      }
      const migrated = createAppData(normalizeProgressMap(legacy, fallbackProgress));
      this.createBackup(migrated, "before-migration");
      this.save(migrated);
      return migrated;
    } catch {
      this.loadIssue = { message: "旧版数据迁移失败，原始数据未被覆盖，可在设置中导出排查", raw: legacyRaw };
      return null;
    }
  }

  takeLoadIssue(): StorageLoadIssue | null {
    const issue = this.loadIssue;
    this.loadIssue = null;
    return issue;
  }

  save(data: StudyAppData): boolean {
    if (this.isQuarantined()) return false;
    try {
      this.storage.setItem(this.appDataKey(), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  backups(): LocalBackup[] {
    if (this.isQuarantined()) return [];
    try {
      const value = JSON.parse(this.storage.getItem(this.backupsKey()) || "[]");
      if (!Array.isArray(value)) return [];
      const kinds: BackupKind[] = ["manual", "before-import", "before-restore", "before-migration"];
      return value.flatMap((backup): LocalBackup[] => {
        if (!isRecord(backup)
          || typeof backup.id !== "string"
          || typeof backup.createdAt !== "string"
          || typeof backup.kind !== "string"
          || !kinds.includes(backup.kind as BackupKind)) return [];
        const data = normalizeAppData(backup.data, {});
        return data ? [{ ...backup, kind: backup.kind as BackupKind, data } as LocalBackup] : [];
      }).slice(0, MAX_BACKUPS);
    } catch {
      return [];
    }
  }

  createBackup(data: StudyAppData, kind: BackupKind): LocalBackup[] {
    if (this.isQuarantined()) return [];
    const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `backup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const backup: LocalBackup = {
      id: randomId,
      createdAt: new Date().toISOString(),
      kind,
      data,
    };
    const existing = this.backups();
    // 配额紧张时逐级缩减保留份数，保证最新一份能写进去，不直接抛错。
    for (const keep of [MAX_BACKUPS, 10, 5, 1] as const) {
      const next = [backup, ...existing].slice(0, keep);
      try {
        this.storage.setItem(this.backupsKey(), JSON.stringify(next));
        return next;
      } catch {
        continue;
      }
    }
    return existing;
  }

  deleteBackup(id: string): LocalBackup[] {
    if (this.isQuarantined()) return [];
    const next = this.backups().filter((backup) => backup.id !== id);
    try {
      this.storage.setItem(this.backupsKey(), JSON.stringify(next));
    } catch {
      // 删除时配额异常极少见，忽略以避免打断交互。
    }
    return next;
  }
}

export type RecentStudyTarget = {
  area: StudyArea;
  bookId: string;
  chapterId: string;
  sectionId: string;
  isReview: boolean;
};

/**
 * 根据书籍列表和用户当前 progress，智能推导当前每个领域的最佳进行中书籍
 */
export function resolveRecentBookByArea(
  bookList: Book[],
  progress: ProgressMap,
): Record<StudyArea, string> {
  const result: Record<StudyArea, string> = {
    "408": "computer-network",
    math: "probability",
    english: "",
    politics: "",
  };

  const areas: StudyArea[] = ["408", "math"];
  for (const area of areas) {
    const areaBooks = bookList.filter((b) => b.area === area);
    if (areaBooks.length === 0) continue;

    // 1. 优先找有 isCurrent == true 且未学完的科目
    const bookWithCurrent = areaBooks.find((book) =>
      book.chapters.some((c) =>
        c.sections.some((s) => progress[s.id]?.isCurrent && !progress[s.id]?.learned)
      )
    );
    if (bookWithCurrent) {
      result[area] = bookWithCurrent.id;
      continue;
    }

    // 2. 统计每本书的完成情况与最新打卡日期
    const bookStats = areaBooks.map((book) => {
      const sections = book.chapters.flatMap((c) => c.sections);
      const learnedCount = sections.filter((s) => progress[s.id]?.learned).length;
      const reviewedCount = book.chapters.filter((chapter) => summarizeChapterReview(chapter, progress).reviewed).length;
      const total = sections.length;
      const isFullyCompleted = total > 0 && learnedCount === total && reviewedCount === book.chapters.length;
      const isReviewPhase = total > 0 && learnedCount === total && reviewedCount < book.chapters.length;
      const isInProgressLearning = learnedCount > 0 && learnedCount < total;

      let latestDate = "";
      for (const s of sections) {
        const p = progress[s.id];
        if (p?.learnedAt && p.learnedAt > latestDate) latestDate = p.learnedAt;
        if (p?.reviewedAt && p.reviewedAt > latestDate) latestDate = p.reviewedAt;
      }

      return {
        book,
        learnedCount,
        reviewedCount,
        total,
        isFullyCompleted,
        isReviewPhase,
        isInProgressLearning,
        latestDate,
      };
    });

    // 优先：有最近打卡记录且未完全学完/复习完的书，按打卡日期降序
    const activeWithDate = bookStats
      .filter((b) => !b.isFullyCompleted && b.latestDate)
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate));
    if (activeWithDate.length > 0) {
      result[area] = activeWithDate[0].book.id;
      continue;
    }

    // 其次：处于进行中 (新学进行中 0 < learned < total，或正在复习) 的书
    const inProgress = bookStats.find((b) => b.isInProgressLearning || b.isReviewPhase);
    if (inProgress) {
      result[area] = inProgress.book.id;
      continue;
    }

    // 再次：首本有未学完小节的书 (新学优先)
    const unlearnedBook = bookStats.find((b) => b.learnedCount < b.total);
    if (unlearnedBook) {
      result[area] = unlearnedBook.book.id;
      continue;
    }

    // 再次：第一本未完全结束的书
    const uncompleted = bookStats.find((b) => !b.isFullyCompleted);
    result[area] = uncompleted ? uncompleted.book.id : areaBooks[0].id;
  }

  return result;
}

/**
 * 找出全局最近正在进行的学习目标（领域、科目、章节与小节）
 */
export function resolveGlobalRecentTarget(
  bookList: Book[],
  progress: ProgressMap,
): RecentStudyTarget | null {
  const booksByArea = resolveRecentBookByArea(bookList, progress);

  // 1. 是否有跨科目的 isCurrent 标记？
  for (const area of ["408", "math"] as StudyArea[]) {
    const areaBooks = bookList.filter((b) => b.area === area);
    for (const book of areaBooks) {
      for (const chapter of book.chapters) {
        for (const section of chapter.sections) {
          if (progress[section.id]?.isCurrent && !progress[section.id]?.learned) {
            return {
              area,
              bookId: book.id,
              chapterId: chapter.id,
              sectionId: section.id,
              isReview: false,
            };
          }
        }
      }
    }
  }

  // 2. 比较 408 和 数学 中候选书的最新打卡日期
  let bestArea: StudyArea = "408";
  let maxDate = "";

  for (const area of ["408", "math"] as StudyArea[]) {
    const bookId = booksByArea[area];
    const book = bookList.find((b) => b.id === bookId);
    if (!book) continue;

    for (const chapter of book.chapters) {
      for (const section of chapter.sections) {
        const p = progress[section.id];
        if (p?.learnedAt && p.learnedAt > maxDate) {
          maxDate = p.learnedAt;
          bestArea = area;
        }
        if (p?.reviewedAt && p.reviewedAt > maxDate) {
          maxDate = p.reviewedAt;
          bestArea = area;
        }
      }
    }
  }

  const selectedBook = bookList.find((b) => b.id === booksByArea[bestArea])
    ?? bookList.find((b) => b.area === bestArea)
    ?? bookList[0];

  if (!selectedBook) return null;

  const sections = selectedBook.chapters.flatMap((c) => c.sections);
  const learnedCount = sections.filter((s) => progress[s.id]?.learned).length;
  const isReview = sections.length > 0 && learnedCount === sections.length;

  const reviewChapter = isReview
    ? selectedBook.chapters.find((chapter) => !summarizeChapterReview(chapter, progress).reviewed)
      ?? selectedBook.chapters.at(-1)
    : undefined;
  const targetSection = isReview
    ? reviewChapter?.sections[0]
    : sections.find((s) => progress[s.id]?.isCurrent && !progress[s.id]?.learned)
      ?? sections.find((s) => !progress[s.id]?.learned)
      ?? sections[sections.length - 1]
      ?? sections[0];

  if (!targetSection) return null;

  const targetChapter = selectedBook.chapters.find((c) =>
    c.sections.some((s) => s.id === targetSection.id)
  ) ?? selectedBook.chapters[0];

  return {
    area: bestArea,
    bookId: selectedBook.id,
    chapterId: targetChapter.id,
    sectionId: targetSection.id,
    isReview,
  };
}

export const LAST_VIEWED_STUDY_STATE_KEY = "study-last-viewed-state-v1";

export type LastViewedStudyState = {
  activeArea?: StudyArea;
  selectedBookByArea?: Partial<Record<StudyArea, string>>;
};

export function loadLastViewedStudyState(storage?: Storage): LastViewedStudyState | null {
  if (typeof window === "undefined" && !storage) return null;
  const store = storage ?? window.localStorage;
  try {
    const raw = store.getItem(LAST_VIEWED_STUDY_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const state: LastViewedStudyState = {};
    if (parsed.activeArea === "408" || parsed.activeArea === "math") {
      state.activeArea = parsed.activeArea;
    }
    if (isRecord(parsed.selectedBookByArea)) {
      state.selectedBookByArea = {};
      if (typeof parsed.selectedBookByArea["408"] === "string") {
        state.selectedBookByArea["408"] = parsed.selectedBookByArea["408"];
      }
      if (typeof parsed.selectedBookByArea.math === "string") {
        state.selectedBookByArea.math = parsed.selectedBookByArea.math;
      }
    }
    return state;
  } catch {
    return null;
  }
}

export function saveLastViewedStudyState(state: LastViewedStudyState, storage?: Storage): void {
  if (typeof window === "undefined" && !storage) return;
  const store = storage ?? window.localStorage;
  try {
    const existing = loadLastViewedStudyState(store) ?? {};
    const merged: LastViewedStudyState = {
      activeArea: state.activeArea ?? existing.activeArea,
      selectedBookByArea: {
        ...existing.selectedBookByArea,
        ...state.selectedBookByArea,
      },
    };
    store.setItem(LAST_VIEWED_STUDY_STATE_KEY, JSON.stringify(merged));
  } catch {
    // 忽略配额超限错误
  }
}
