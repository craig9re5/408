import type { StudyArea } from "./data/books";

export const SCHEMA_VERSION = 1;
export const APP_VERSION = "1.5-beta";
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
  isCurrent: boolean;
};

export type ProgressMap = Record<string, SectionProgress>;
export type PlanChangeSource = "manual" | "batchSchedule" | "shift" | "undo";
export type ChapterPlanMode = "uniform" | "spread";

export type ChapterPlanSection = {
  id: string;
  learned: boolean;
  plannedAt: string;
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

export type StudyAppData = {
  schemaVersion: number;
  appVersion: string;
  progress: ProgressMap;
  projectSettings: ProjectSettings;
  planHistory: PlanHistoryEntry[];
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

export function isOverdueTask(state: SectionProgress | undefined, today: string): boolean {
  return Boolean(state?.plannedAt && state.plannedAt < today && !state.learned);
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
): Record<string, string> {
  if (!isDate(range.start) || (mode === "spread" && (!isDate(range.end) || range.end < range.start))) return {};

  const eligible = sections.filter((section) => {
    if (!range.includeCompleted && section.learned) return false;
    // “统一日期”用于补齐尚未安排的项目，不能覆盖已有计划。
    return mode !== "uniform" || !section.plannedAt;
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
  const base = fallback ?? {
    learned: false,
    learnedAt: "",
    reviewed: false,
    reviewedAt: "",
    plannedAt: "",
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

  return {
    learned,
    learnedAt,
    reviewed,
    reviewedAt: reviewed ? candidateReviewedAt : "",
    plannedAt: value.plannedAt === "" || isDate(value.plannedAt) ? value.plannedAt : base.plannedAt,
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

export function normalizeAppData(value: unknown, fallbackProgress: ProgressMap): StudyAppData | null {
  if (!isRecord(value)
    || value.schemaVersion !== SCHEMA_VERSION
    || !isRecord(value.progress)
    || !isRecord(value.projectSettings)
    || !Array.isArray(value.planHistory)) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof value.appVersion === "string" ? value.appVersion : APP_VERSION,
    progress: normalizeProgressMap(value.progress, fallbackProgress),
    projectSettings: normalizeProjectSettings(value.projectSettings),
    planHistory: normalizePlanHistory(value.planHistory),
  };
}

export function createAppData(
  progress: ProgressMap,
  projectSettings = defaultProjectSettings(),
  planHistory: PlanHistoryEntry[] = [],
): StudyAppData {
  return { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, progress, projectSettings, planHistory };
}

export function summarizeImport(data: StudyAppData, projectCount: number, subjectCount: number) {
  return {
    projects: projectCount,
    subjects: subjectCount,
    sections: Object.keys(data.progress).length,
    planHistory: data.planHistory.length,
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
        const normalized = normalizeAppData(JSON.parse(currentRaw), fallbackProgress);
        if (normalized) return normalized;
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
}
