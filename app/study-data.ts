import type { StudyArea } from "./data/books";

export const SCHEMA_VERSION = 2;
export const APP_VERSION = "1.8.0";
export const MAX_BACKUPS = 15;

const APP_DATA_KEY = "study-app-data-v1";
const LEGACY_PROGRESS_KEY = "408-section-progress-v1";
const BACKUPS_KEY = "study-local-backups-v1";

export type SectionProgress = {
  learned: boolean;
  learnedAt: string;
  reviewed: boolean;
  reviewedAt: string;
  plannedAt: string;
  reviewedPlannedAt: string;
  isCurrent: boolean;
};

export type ProgressMap = Record<string, SectionProgress>;
export type PlanChangeSource = "manual" | "batchSchedule" | "shift" | "undo";
export type ChapterPlanMode = "uniform" | "spread";

export type ChapterPlanSection = {
  id: string;
  learned: boolean;
  reviewed: boolean;
  plannedAt: string;
  reviewedPlannedAt?: string;
};

export type PlanHistoryEntry = {
  id: string;
  sectionId: string;
  from: string;
  to: string;
  changedAt: string;
  source: PlanChangeSource;
};

export type ProjectSetting = {
  examDate: string;
};

export type ProjectSettings = Record<StudyArea, ProjectSetting>;

export type JournalProjectContext = {
  type: "project";
  area: StudyArea;
};

export type JournalSubjectContext = {
  type: "subject";
  area: StudyArea;
  bookId: string;
  bookTitle?: string;
};

export type JournalSectionItem = {
  area: StudyArea;
  bookId: string;
  sectionId: string;
  bookTitle?: string;
  sectionTitle?: string;
  sectionNumber?: string;
};

export type JournalSectionContext = {
  type: "section";
  area: StudyArea;
  bookId: string;
  sectionId: string;
  bookTitle?: string;
  sectionTitle?: string;
  sectionNumber?: string;
};

export type JournalSectionsContext = {
  type: "sections";
  sections: JournalSectionItem[];
};

export type JournalPaperContext = {
  type: "paper";
  area: StudyArea;
  paperId: string;
  paperTitle: string;
};

export type JournalContext =
  | JournalProjectContext
  | JournalSubjectContext
  | JournalSectionContext
  | JournalSectionsContext
  | JournalPaperContext;

export type JournalPublish = {
  status: "local" | "published";
  publishedAt: string | null;
  blogUrl: string | null;
  blogPostId: string | null;
};

export type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string | null;
  content: string;
  context: JournalContext | null;
  publish: JournalPublish;
};

export type PaperKind = "past" | "mock";

export type QuestionState = "correct" | "wrong";

export type QuestionGroupDef = {
  type: "选择题" | "填空题" | "解答题" | "综合应用题";
  subject?: string;
  start: number;
  end: number;
  count: number;
};

export const MATH_PAPER_STRUCTURE: { total: number; groups: QuestionGroupDef[] } = {
  total: 22,
  groups: [
    { type: "选择题", start: 1, end: 10, count: 10 },
    { type: "填空题", start: 11, end: 16, count: 6 },
    { type: "解答题", start: 17, end: 22, count: 6 },
  ],
};

export const CS408_PAPER_STRUCTURE: { total: number; groups: QuestionGroupDef[] } = {
  total: 47,
  groups: [
    { type: "选择题", subject: "数据结构", start: 1, end: 10, count: 10 },
    { type: "选择题", subject: "计算机组成原理", start: 11, end: 20, count: 10 },
    { type: "选择题", subject: "操作系统", start: 21, end: 30, count: 10 },
    { type: "选择题", subject: "计算机网络", start: 31, end: 40, count: 10 },
    { type: "综合应用题", subject: "数据结构", start: 41, end: 42, count: 2 },
    { type: "综合应用题", subject: "计算机组成原理", start: 43, end: 44, count: 2 },
    { type: "综合应用题", subject: "操作系统", start: 45, end: 46, count: 2 },
    { type: "综合应用题", subject: "计算机网络", start: 47, end: 47, count: 1 },
  ],
};

export type PaperRecord = {
  id: string;
  kind: PaperKind;
  area: StudyArea;
  title: string;
  groupName?: string;
  year?: number;
  completed: boolean;
  completedAt: string;
  score?: number | null;
  durationMinutes?: number | null;
  secondRound?: boolean;
  secondRoundAt?: string;
  notes?: string;
  questions?: Record<number, QuestionState>;
};

export type StudyAppData = {
  schemaVersion: number;
  appVersion: string;
  progress: ProgressMap;
  projectSettings: ProjectSettings;
  planHistory: PlanHistoryEntry[];
  journals: JournalEntry[];
  papers: PaperRecord[];
};

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
    const date = new Date(`${cursor}T00:00:00`);
    date.setDate(date.getDate() - 1);
    cursor = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
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

export const defaultProjectSettings = (): ProjectSettings => ({
  "408": { examDate: "2026-12-19" },
  math: { examDate: "2026-12-19" },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addCalendarDays(value: string, days: number): string {
  if (!isDate(value) || !Number.isInteger(days)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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
    && Boolean(learnedAt)
    && Boolean(value.reviewed)
    && Boolean(candidateReviewedAt)
    && candidateReviewedAt >= learnedAt;

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

function normalizeProjectSettings(value: unknown): ProjectSettings {
  const defaults = defaultProjectSettings();
  if (!isRecord(value)) return defaults;
  (["408", "math"] as StudyArea[]).forEach((area) => {
    const setting = value[area];
    if (isRecord(setting) && isDate(setting.examDate)) defaults[area] = { examDate: setting.examDate };
  });
  return defaults;
}

function normalizePlanHistory(value: unknown): PlanHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const sources: PlanChangeSource[] = ["manual", "batchSchedule", "shift", "undo"];
  return value.flatMap((entry): PlanHistoryEntry[] => {
    if (!isRecord(entry)
      || typeof entry.id !== "string"
      || typeof entry.sectionId !== "string"
      || typeof entry.changedAt !== "string"
      || typeof entry.source !== "string"
      || !sources.includes(entry.source as PlanChangeSource)) return [];
    const from = entry.from === "" || isDate(entry.from) ? entry.from : "";
    const to = entry.to === "" || isDate(entry.to) ? entry.to : "";
    return [{
      id: entry.id,
      sectionId: entry.sectionId,
      from,
      to,
      changedAt: entry.changedAt,
      source: entry.source as PlanChangeSource,
    }];
  }).slice(-1000);
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
    if (typeof entry.id === "string" && entry.id.startsWith(prefix) && entry.id.length === prefix.length + 3) {
      const seq = parseInt(entry.id.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  });
  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `${prefix}${nextSeq}`;
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

export function normalizeJournalContext(value: unknown): JournalContext | null {
  if (!isRecord(value)) return null;

  if (value.type === "sections" && Array.isArray(value.sections)) {
    const validSections: JournalSectionItem[] = [];
    const seenSectionIds = new Set<string>();

    value.sections.forEach((item) => {
      if (!isRecord(item)) return;
      const area = item.area === "math" ? "math" : item.area === "408" ? "408" : null;
      if (!area) return;
      if (typeof item.bookId !== "string" || !item.bookId.trim()) return;
      if (typeof item.sectionId !== "string" || !item.sectionId.trim()) return;
      const secId = item.sectionId.trim();
      if (seenSectionIds.has(secId)) return;
      seenSectionIds.add(secId);

      validSections.push({
        area,
        bookId: item.bookId.trim(),
        sectionId: secId,
        bookTitle: typeof item.bookTitle === "string" && item.bookTitle.trim() ? item.bookTitle.trim() : undefined,
        sectionTitle: typeof item.sectionTitle === "string" && item.sectionTitle.trim() ? item.sectionTitle.trim() : undefined,
        sectionNumber: typeof item.sectionNumber === "string" && item.sectionNumber.trim() ? item.sectionNumber.trim() : undefined,
      });
    });

    if (validSections.length === 0) return null;
    return {
      type: "sections",
      sections: validSections,
    };
  }

  const area = value.area === "math" ? "math" : value.area === "408" ? "408" : null;
  if (!area) return null;

  if (value.type === "project") {
    return {
      type: "project",
      area,
    };
  }

  if (value.type === "subject") {
    if (typeof value.bookId !== "string" || !value.bookId.trim()) return null;
    return {
      type: "subject",
      area,
      bookId: value.bookId.trim(),
      bookTitle: typeof value.bookTitle === "string" && value.bookTitle.trim() ? value.bookTitle.trim() : undefined,
    };
  }

  if (value.type === "section") {
    if (typeof value.bookId !== "string" || !value.bookId.trim()) return null;
    if (typeof value.sectionId !== "string" || !value.sectionId.trim()) return null;
    return {
      type: "section",
      area,
      bookId: value.bookId.trim(),
      sectionId: value.sectionId.trim(),
      bookTitle: typeof value.bookTitle === "string" && value.bookTitle.trim() ? value.bookTitle.trim() : undefined,
      sectionTitle: typeof value.sectionTitle === "string" && value.sectionTitle.trim() ? value.sectionTitle.trim() : undefined,
      sectionNumber: typeof value.sectionNumber === "string" && value.sectionNumber.trim() ? value.sectionNumber.trim() : undefined,
    };
  }

  if (value.type === "paper") {
    if (typeof value.paperId !== "string" || !value.paperId.trim()) return null;
    return {
      type: "paper",
      area,
      paperId: value.paperId.trim(),
      paperTitle: typeof value.paperTitle === "string" && value.paperTitle.trim() ? value.paperTitle.trim() : "真题/模拟卷",
    };
  }

  return null;
}

export function normalizeJournalPublish(value: unknown): JournalPublish {
  if (!isRecord(value)) {
    return {
      status: "local",
      publishedAt: null,
      blogUrl: null,
      blogPostId: null,
    };
  }
  const status = value.status === "published" ? "published" : "local";
  return {
    status,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    blogUrl: typeof value.blogUrl === "string" ? value.blogUrl : null,
    blogPostId: typeof value.blogPostId === "string" ? value.blogPostId : null,
  };
}

export function normalizeJournalEntry(value: unknown): JournalEntry | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !/^\d{8}\d{3}$/.test(value.id)
    || typeof value.createdAt !== "string"
    || typeof value.content !== "string") {
    return null;
  }
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : value.createdAt;
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : null;
  const context = normalizeJournalContext(value.context);
  const publish = normalizeJournalPublish(value.publish);

  return {
    id: value.id,
    createdAt: value.createdAt,
    updatedAt,
    title,
    content: value.content,
    context,
    publish,
  };
}

export function normalizeJournals(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: JournalEntry[] = [];
  value.forEach((candidate) => {
    const entry = normalizeJournalEntry(candidate);
    if (entry) entries.push(entry);
  });
  return entries;
}

export const PAST_PAPER_YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020,
  2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010
] as const;

export function defaultPastPapers(): PaperRecord[] {
  const list: PaperRecord[] = [];
  (["408", "math"] as StudyArea[]).forEach((area) => {
    PAST_PAPER_YEARS.forEach((year) => {
      list.push({
        id: `past-${area}-${year}`,
        kind: "past",
        area,
        title: `${year}年 ${area === "408" ? "408 计算机学科专业基础" : "全国硕士研究生招生考试数学"} 真题`,
        groupName: "历年真题",
        year,
        completed: false,
        completedAt: "",
        score: null,
        durationMinutes: null,
        secondRound: false,
        secondRoundAt: "",
      });
    });
  });
  return list;
}

export function normalizePaperRecord(value: unknown): PaperRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  const kind: PaperKind = value.kind === "mock" ? "mock" : "past";
  const area: StudyArea = value.area === "math" ? "math" : "408";
  const title = typeof value.title === "string" && value.title.trim()
    ? value.title.trim()
    : (kind === "past" ? `${value.year ?? ""} 真题` : "模拟卷");
  const year = typeof value.year === "number" && value.year >= 2000 && value.year <= 2100 ? value.year : undefined;
  const completed = Boolean(value.completed);
  const completedAt = isDate(value.completedAt) ? value.completedAt : "";
  const score = typeof value.score === "number" && !Number.isNaN(value.score) && value.score >= 0 && value.score <= 150
    ? Math.round(value.score * 10) / 10
    : null;
  const durationMinutes = typeof value.durationMinutes === "number" && value.durationMinutes > 0 && value.durationMinutes <= 600
    ? Math.round(value.durationMinutes)
    : null;
  const secondRound = Boolean(value.secondRound);
  const secondRoundAt = isDate(value.secondRoundAt) ? value.secondRoundAt : "";
  const groupName = typeof value.groupName === "string" && value.groupName.trim() ? value.groupName.trim() : undefined;
  const notes = typeof value.notes === "string" ? value.notes.trim() : undefined;

  let questions: Record<number, QuestionState> | undefined = undefined;
  if (isRecord(value.questions)) {
    const qMap: Record<number, QuestionState> = {};
    Object.entries(value.questions).forEach(([k, v]) => {
      const qNum = parseInt(k, 10);
      if (!Number.isNaN(qNum) && qNum >= 1 && qNum <= 100) {
        if (v === "correct" || v === "wrong") {
          qMap[qNum] = v;
        }
      }
    });
    if (Object.keys(qMap).length > 0) {
      questions = qMap;
    }
  }

  return {
    id: value.id.trim(),
    kind,
    area,
    title,
    groupName,
    year,
    completed: completed && Boolean(completedAt),
    completedAt: completed ? completedAt : "",
    score,
    durationMinutes,
    secondRound: secondRound && Boolean(secondRoundAt),
    secondRoundAt: secondRound ? secondRoundAt : "",
    notes,
    questions,
  };
}

export function normalizePapers(value: unknown): PaperRecord[] {
  const defaults = defaultPastPapers();
  const map = new Map<string, PaperRecord>();
  defaults.forEach((paper) => map.set(paper.id, paper));

  if (Array.isArray(value)) {
    value.forEach((candidate) => {
      const normalized = normalizePaperRecord(candidate);
      if (!normalized) return;
      map.set(normalized.id, normalized);
    });
  }

  return Array.from(map.values());
}

export function mergePapers(local: PaperRecord[], remote: PaperRecord[]): PaperRecord[] {
  const map = new Map<string, PaperRecord>();
  const defaults = defaultPastPapers();
  defaults.forEach((p) => map.set(p.id, p));

  remote.forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });

  local.forEach((p) => {
    if (!p || !p.id) return;
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
    } else {
      const completed = p.completed || existing.completed;
      const completedAt = p.completedAt || existing.completedAt;
      const score = p.score !== undefined && p.score !== null ? p.score : (existing.score ?? null);
      const durationMinutes = p.durationMinutes !== undefined && p.durationMinutes !== null ? p.durationMinutes : (existing.durationMinutes ?? null);
      const secondRound = p.secondRound || existing.secondRound;
      const secondRoundAt = p.secondRoundAt || existing.secondRoundAt;
      const questions = p.questions || existing.questions
        ? { ...(existing.questions ?? {}), ...(p.questions ?? {}) }
        : undefined;
      map.set(p.id, {
        ...existing,
        ...p,
        completed,
        completedAt,
        score,
        durationMinutes,
        secondRound,
        secondRoundAt,
        questions,
      });
    }
  });

  return Array.from(map.values());
}

/**
 * Deterministic CRDT/LWW map-merge for JournalEntry lists across devices.
 * Prevents silent overwriting when different devices create or edit journals concurrently.
 */
export function mergeJournals(local: JournalEntry[], remote: JournalEntry[]): JournalEntry[] {
  const map = new Map<string, JournalEntry>();

  remote.forEach((entry) => {
    if (entry && entry.id) map.set(entry.id, entry);
  });

  local.forEach((entry) => {
    if (!entry || !entry.id) return;
    const existing = map.get(entry.id);
    if (!existing) {
      map.set(entry.id, entry);
    } else {
      const localTime = new Date(entry.updatedAt || entry.createdAt).getTime();
      const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
      if (Number.isNaN(localTime) || Number.isNaN(existingTime)) {
        map.set(entry.id, entry);
      } else if (localTime >= existingTime) {
        map.set(entry.id, entry);
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function normalizeAppData(value: unknown, fallbackProgress: ProgressMap): StudyAppData | null {
  if (!isRecord(value)
    || (value.schemaVersion !== 1 && value.schemaVersion !== SCHEMA_VERSION)
    || !isRecord(value.progress)
    || !isRecord(value.projectSettings)
    || !Array.isArray(value.planHistory)) return null;

  const journals = Array.isArray(value.journals) ? normalizeJournals(value.journals) : [];
  const papers = normalizePapers(value.papers);

  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof value.appVersion === "string" ? value.appVersion : APP_VERSION,
    progress: normalizeProgressMap(value.progress, fallbackProgress),
    projectSettings: normalizeProjectSettings(value.projectSettings),
    planHistory: normalizePlanHistory(value.planHistory),
    journals,
    papers,
  };
}

export function createAppData(
  progress: ProgressMap,
  projectSettings = defaultProjectSettings(),
  planHistory: PlanHistoryEntry[] = [],
  journals: JournalEntry[] = [],
  papers: PaperRecord[] = defaultPastPapers(),
): StudyAppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    progress,
    projectSettings,
    planHistory,
    journals,
    papers,
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
  private loadIssue: StorageLoadIssue | null = null;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  load(fallbackProgress: ProgressMap): StudyAppData | null {
    this.loadIssue = null;
    const currentRaw = this.storage.getItem(APP_DATA_KEY);
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

    const legacyRaw = this.storage.getItem(LEGACY_PROGRESS_KEY);
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

  save(data: StudyAppData): void {
    this.storage.setItem(APP_DATA_KEY, JSON.stringify(data));
  }

  backups(): LocalBackup[] {
    try {
      const value = JSON.parse(this.storage.getItem(BACKUPS_KEY) || "[]");
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
    const backup: LocalBackup = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind,
      data,
    };
    const next = [backup, ...this.backups()].slice(0, MAX_BACKUPS);
    this.storage.setItem(BACKUPS_KEY, JSON.stringify(next));
    return next;
  }

  deleteBackup(id: string): LocalBackup[] {
    const next = this.backups().filter((backup) => backup.id !== id);
    this.storage.setItem(BACKUPS_KEY, JSON.stringify(next));
    return next;
  }
}
