"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { books, type Book, type Section, type StudyArea } from "./data/books";
import { MarkdownRenderer, getMarkdownSummary } from "./components/markdown-renderer";
import {
  APP_VERSION,
  StorageRepository,
  addCalendarDays,
  buildChapterPlanChanges,
  calculateActivityHeatmap,
  calculateDisciplineStats,
  calculateMaxStreak,
  calculateVelocityAndForecast,
  calculateWeeklyTrends,
  createAppData,
  dateToday,
  defaultProjectSettings,
  generateJournalId,
  mergeJournals,
  isOverdueTask,
  isTodayPlan,
  isUnreviewedTask,
  normalizeAppData,
  normalizeSectionProgress,
  summarizeImport,
  type DisciplineStats,
  type ForecastHealth,
  type HeatmapDay,
  type JournalContext,
  type JournalEntry,
  type JournalPublish,
  type LocalBackup,
  type PlanChangeSource,
  type PlanHistoryEntry,
  type ProgressMap,
  type ProjectSettings,
  type SectionProgress,
  type StorageLoadIssue,
  type StudyAppData,
  type VelocityForecast,
  type WeeklyTrend,
} from "./study-data";

type AuthState = "locked" | "authenticated";
type SyncStatus = "loading" | "saving" | "saved" | "offline" | "error";
type StudyPlanStatus = "completed" | "overdue" | "due_today" | "upcoming" | "unscheduled";
type CatalogFilter = "all" | "unlearned" | "unreviewed" | "overdue";
type ShiftScope = "chapter" | "subject";
type AppPage = "progress" | "today" | "analytics" | "settings";
type NavigationIcon = "progress" | "today" | "analytics" | "settings";
type JournalFilter = "all" | "unlinked" | "linked" | "408" | "math" | "published";
type EditorMode = "edit" | "split" | "preview";

const pageNavigation: { page: AppPage; icon: NavigationIcon; label: string }[] = [
  { page: "progress", icon: "progress", label: "学习进度" },
  { page: "today", icon: "today", label: "今日" },
  { page: "analytics", icon: "analytics", label: "数据分析" },
];

const pageTitles: Record<AppPage, string> = {
  progress: "学习进度",
  today: "今日",
  analytics: "数据分析",
  settings: "设置",
};

const mobileNavigation: { page: AppPage; mark: string; label: string }[] = [
  { page: "progress", mark: "进", label: "进度" },
  { page: "today", mark: "今", label: "今日" },
  { page: "analytics", mark: "析", label: "分析" },
  { page: "settings", mark: "设", label: "设置" },
];

type PlanUndo = {
  message: string;
  field: "plannedAt" | "reviewedPlannedAt";
  values: Record<string, string>;
};

type PlanPreview = {
  message: string;
  field: "plannedAt" | "reviewedPlannedAt";
  source: Exclude<PlanChangeSource, "manual" | "undo">;
  values: Record<string, string>;
};

function defaultProgress(): ProgressMap {
  const progress: ProgressMap = {};

  books.forEach((book) => {
    book.chapters.forEach((chapter) => {
      chapter.sections.forEach((section) => {
        progress[section.id] = {
          learned: book.initiallyComplete,
          learnedAt: "",
          reviewed: false,
          reviewedAt: "",
          plannedAt: section.plannedAt ?? "",
          reviewedPlannedAt: "",
          isCurrent: false,
        };
      });
    });
  });

  return progress;
}

function allSections(book: Book): Section[] {
  return book.chapters.flatMap((chapter) => chapter.sections);
}

function progressStage(sections: Section[], progress: ProgressMap) {
  const learned = sections.filter((section) => progress[section.id]?.learned).length;
  const phase = sections.length > 0 && learned === sections.length ? "reviewed" : "learned";
  const completed = phase === "reviewed"
    ? sections.filter((section) => progress[section.id]?.reviewed).length
    : learned;

  return {
    phase,
    completed,
    percentage: sections.length ? Math.round((completed / sections.length) * 100) : 0,
  } as const;
}

function formatDateShort(value: string): string {
  if (!value) return "";
  const [, month, day] = value.split("-");
  return `${month}/${day}`;
}

function formatDateChinese(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function formatDateChineseWithWeekday(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const [, month, day] = dateStr.split("-");
  return `${Number(month)}月${Number(day)}日 · ${weekdays[date.getDay()]}`;
}

function formatTimeShort(isoStr: string): string {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatPlanRange(plannedDates: string[], label = "计划"): string {
  const dates = plannedDates
    .filter((date): date is string => Boolean(date))
    .sort();
  if (!dates.length) return `${label}未设置`;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return `${label}：${formatDateChinese(first)}`;
  return `${label}：${formatDateChinese(first)}—${formatDateChinese(last)}`;
}

function chapterCompletionDate(
  sections: Section[],
  progress: ProgressMap,
  phase: "learned" | "reviewed",
): string {
  if (!sections.length) return "";

  const dates = sections.map((section) => {
    const state = progress[section.id];
    const completed = phase === "learned" ? state?.learned : state?.reviewed;
    return completed ? (phase === "learned" ? state.learnedAt : state.reviewedAt) : "";
  });

  if (dates.some((date) => !date)) return "";
  return dates.sort().at(-1) ?? "";
}

function basePlanStatus(state: SectionProgress | undefined): StudyPlanStatus {
  if (state?.learned) return "completed";
  if (!state?.plannedAt) return "unscheduled";
  const today = dateToday();
  if (state.plannedAt < today) return "overdue";
  if (state.plannedAt === today) return "due_today";
  return "upcoming";
}

function reviewPlanStatus(state: SectionProgress | undefined): StudyPlanStatus {
  if (state?.reviewed) return "completed";
  if (!state?.reviewedPlannedAt) return "unscheduled";
  const today = dateToday();
  if (state.reviewedPlannedAt < today) return "overdue";
  if (state.reviewedPlannedAt === today) return "due_today";
  return "upcoming";
}

function studyPlanStatus(state: SectionProgress | undefined): StudyPlanStatus {
  if (state?.learned) {
    if (state.reviewed) return "completed";
    if (state.reviewedPlannedAt) return reviewPlanStatus(state);
    return "completed";
  }
  return basePlanStatus(state);
}

function planTone(status: StudyPlanStatus): "late" | "soon" | "normal" | "empty" {
  if (status === "overdue") return "late";
  if (status === "due_today") return "soon";
  if (status === "unscheduled") return "empty";
  return "normal";
}

function calculateDaysUntilExam(examDate: string): number {
  const today = new Date();
  const target = new Date(`${examDate}T00:00:00`);
  const diffTime = target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function calculateTimeProgress(examDate: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(now.getFullYear(), 2, 1).getTime();
  const end = new Date(`${examDate}T00:00:00`).getTime();
  if (end <= start) return today >= end ? 100 : 0;
  return Math.round(Math.max(0, Math.min(1, (today - start) / (end - start))) * 100);
}

type TaskEntry = {
  book: Book;
  chapterTitle: string;
  section: Section;
};

function projectTaskEntries(area: StudyArea): TaskEntry[] {
  return books
    .filter((book) => book.area === area)
    .flatMap((book) => book.chapters.flatMap((chapter) => chapter.sections.map((section) => ({
      book,
      chapterTitle: chapter.title,
      section,
    }))));
}

function findSectionById(sectionId: string | null): { book: Book; chapter: (typeof books)[number]["chapters"][number]; section: Section } | null {
  if (!sectionId) return null;
  for (const book of books) {
    for (const chapter of book.chapters) {
      for (const section of chapter.sections) {
        if (section.id === sectionId) {
          return { book, chapter, section };
        }
      }
    }
  }
  return null;
}

function formatLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function backupKindLabel(kind: LocalBackup["kind"]): string {
  if (kind === "manual") return "手动备份";
  if (kind === "before-import") return "导入前";
  if (kind === "before-restore") return "恢复前";
  return "迁移前";
}

function getWeekDaysActivity(progress: ProgressMap) {
  const todayStr = dateToday();
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMonday);

  const activeDates = new Set<string>();
  Object.values(progress).forEach((entry) => {
    if (entry.learnedAt) activeDates.add(entry.learnedAt);
    if (entry.reviewedAt) activeDates.add(entry.reviewedAt);
  });

  const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
  return weekDays.map((label, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const dateStr = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const isToday = dateStr === todayStr;
    const isDone = activeDates.has(dateStr);
    return { label, dateStr, isToday, isDone };
  });
}

function calculateWeeklySectionCount(progress: ProgressMap): number {
  const weekDates = new Set(getWeekDaysActivity(progress).map((day) => day.dateStr));

  return Object.values(progress).reduce((count, entry) => {
    const learnedCount = entry.learnedAt && weekDates.has(entry.learnedAt) ? 1 : 0;
    const reviewedCount = entry.reviewedAt && weekDates.has(entry.reviewedAt) ? 1 : 0;
    return count + learnedCount + reviewedCount;
  }, 0);
}

function parseFlexibleDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let month = 0;
  let day = 0;

  const ymdMatch = trimmed.match(/^(\d{4})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])$/);
  if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10);
    day = parseInt(ymdMatch[3], 10);
  } else {
    const mdMatch = trimmed.match(/^(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])$/);
    if (mdMatch) {
      month = parseInt(mdMatch[1], 10);
      day = parseInt(mdMatch[2], 10);
    } else if (/^\d{4}$/.test(trimmed)) {
      month = parseInt(trimmed.slice(0, 2), 10);
      day = parseInt(trimmed.slice(2, 4), 10);
    } else if (/^\d{3}$/.test(trimmed)) {
      month = parseInt(trimmed.slice(0, 1), 10);
      day = parseInt(trimmed.slice(1, 3), 10);
    } else {
      return null;
    }
  }

  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      const mStr = String(month).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      return `${year}-${mStr}-${dStr}`;
    }
  }

  return null;
}

function EditableDate({
  value,
  emptyLabel,
  ariaLabel,
  prefix = "",
  tone = "normal",
  validate,
  onError,
  onChange,
}: {
  value: string;
  emptyLabel: string;
  ariaLabel: string;
  prefix?: string;
  tone?: "late" | "soon" | "normal" | "empty";
  validate?: (value: string) => string | null;
  onError?: (message: string) => void;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setInputText(value ? formatDateShort(value).replace("/", "") : "");
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const parsed = parseFlexibleDate(inputText);
    if (parsed !== null) {
      const validationError = validate?.(parsed);
      if (validationError) {
        onError?.(validationError);
        return;
      }
      if (parsed !== value) {
        onChange(parsed);
      }
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="date-editor"
        type="text"
        inputMode="numeric"
        placeholder="如 0805"
        value={inputText}
        aria-label={ariaLabel}
        onChange={(event) => setInputText(event.target.value)}
        onBlur={handleSave}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            handleSave();
          } else if (event.key === "Escape") {
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button className={`date-text ${tone}`} type="button" onClick={startEditing} aria-label={`${ariaLabel}，点击编辑`}>
      {value ? `${prefix}${formatDateShort(value)}` : emptyLabel}
    </button>
  );
}

function mergeRemoteProgress(remote: Record<string, SectionProgress>, base = defaultProgress()): ProgressMap {
  const merged = { ...base };
  Object.keys(merged).forEach((sectionId) => {
    const value = remote[sectionId];
    if (!value || typeof value !== "object") return;
    merged[sectionId] = normalizeSectionProgress(value, merged[sectionId]);
  });
  return merged;
}

function ProgressRing({ value }: { value: number }) {
  return (
    <span className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}>
      <span>{value}%</span>
    </span>
  );
}

function UniversityLogo() {
  return (
    <div className="university-logo" role="img" aria-label="北京大学校徽">
      <img src="/pku-logo.svg" alt="北京大学校徽" width={80} height={80} />
    </div>
  );
}

export function StudyDashboard() {
  const [activePage, setActivePage] = useState<AppPage>("progress");
  const [activeArea, setActiveArea] = useState<StudyArea>("408");
  const [selectedBookByArea, setSelectedBookByArea] = useState<Record<StudyArea, string>>({
    "408": "operating-system",
    math: "advanced-math",
  });
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressMap>(defaultProgress);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(defaultProjectSettings);
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [journalFilter, setJournalFilter] = useState<JournalFilter>("all");
  const [journalSearchQuery, setJournalSearchQuery] = useState("");
  const [expandedJournalIds, setExpandedJournalIds] = useState<string[]>([]);
  const [activeDrawerSectionId, setActiveDrawerSectionId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorContext, setEditorContext] = useState<JournalContext | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("split");
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [pendingDeleteJournal, setPendingDeleteJournal] = useState<JournalEntry | null>(null);
  const [blogPublishJournal, setBlogPublishJournal] = useState<JournalEntry | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishSlug, setPublishSlug] = useState("");
  const [publishContent, setPublishContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("locked");
  const [inviteCode, setInviteCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const [filterChaptersCollapsed, setFilterChaptersCollapsed] = useState(false);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [chapterPlanTarget, setChapterPlanTarget] = useState<"base" | "review">("base");
  const [chapterRanges, setChapterRanges] = useState<Record<string, { start: string; end: string; includeCompleted: boolean }>>({});
  const [shiftSectionId, setShiftSectionId] = useState<string | null>(null);
  const [shiftScope, setShiftScope] = useState<ShiftScope>("chapter");
  const [shiftPlanTarget, setShiftPlanTarget] = useState<"base" | "review">("base");
  const [shiftDays, setShiftDays] = useState(1);
  const [planUndo, setPlanUndo] = useState<PlanUndo | null>(null);
  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [pendingClearSectionId, setPendingClearSectionId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<StudyAppData | null>(null);
  const [pendingRestore, setPendingRestore] = useState<LocalBackup | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [storageLoadIssue, setStorageLoadIssue] = useState<StorageLoadIssue | null>(null);
  const [scrollTargetSectionId, setScrollTargetSectionId] = useState<string | null>(null);
  const [analyticsScope, setAnalyticsScope] = useState<"all" | StudyArea>("all");
  const [hoveredHeatmapDay, setHoveredHeatmapDay] = useState<HeatmapDay | null>(null);
  const [hoveredTrendWeek, setHoveredTrendWeek] = useState<WeeklyTrend | null>(null);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  const repositoryRef = useRef<StorageRepository | null>(null);
  const deletedJournalIdsRef = useRef<string[]>([]);
  const lastSavedPayloadRef = useRef<string>("");

  const repository = useCallback((): StorageRepository => {
    if (!repositoryRef.current) repositoryRef.current = new StorageRepository(window.localStorage);
    return repositoryRef.current;
  }, []);

  const applyRemoteData = useCallback((body: Partial<StudyAppData>, includeLocal: boolean) => {
    const fallback = defaultProgress();
    const local = includeLocal ? repository().load(fallback) : null;
    const localIssue = repository().takeLoadIssue();
    if (localIssue) {
      setStorageLoadIssue(localIssue);
      setFeedbackMessage(localIssue.message);
    }
    const remoteProgress = body.progress ?? {};
    const base = Object.keys(remoteProgress).length === 0 && local ? local.progress : fallback;
    const mergedProgress = mergeRemoteProgress(remoteProgress, base);
    const mergedSettings = body.projectSettings ?? local?.projectSettings ?? defaultProjectSettings();
    const mergedHistory = body.planHistory ?? local?.planHistory ?? [];
    let mergedJournalsList: JournalEntry[] = [];

    setProgress(mergedProgress);
    setProjectSettings(mergedSettings);
    setPlanHistory(mergedHistory);
    setJournals((currentLocal) => {
      const baseLocal = (includeLocal && currentLocal.length === 0 && local?.journals) ? local.journals : currentLocal;
      mergedJournalsList = mergeJournals(baseLocal, body.journals ?? []);
      return mergedJournalsList;
    });
    setBackups(repository().backups());

    // Record the current state payload so auto-save doesn't fire for unchanged data
    lastSavedPayloadRef.current = JSON.stringify({
      ...createAppData(mergedProgress, mergedSettings, mergedHistory, mergedJournalsList),
      deletedJournalIds: [],
    });
  }, [repository]);

  const loadRemoteData = useCallback(async (includeLocal: boolean) => {
    const response = await fetch("/api/app-data", { cache: "no-store" });
    if (response.status === 401) {
      setAuthState("locked");
      setLoaded(false);
      return;
    }
    if (!response.ok) throw new Error("app-data-load-failed");

    const body = await response.json() as Partial<StudyAppData>;
    applyRemoteData(body, includeLocal);
    setLoaded(true);
    setSyncStatus("saved");
  }, [applyRemoteData]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const body = await response.json() as { authenticated?: boolean } & Partial<StudyAppData>;
        if (cancelled) return;
        if (!body.authenticated) return;
        setAuthState("authenticated");
        applyRemoteData(body, true);
        setLoaded(true);
        setSyncStatus("saved");
      } catch {
        // Keep the invite form visible so a transient session-check failure
        // does not block the user from trying to log in.
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [applyRemoteData]);

  useEffect(() => {
    if (!loaded || authState !== "authenticated") return;
    const appData = createAppData(progress, projectSettings, planHistory, journals);
    repository().save(appData);

    const payloadString = JSON.stringify({
      ...appData,
      deletedJournalIds: deletedJournalIdsRef.current,
    });

    // If nothing changed from last saved payload, do not trigger a network PUT
    if (payloadString === lastSavedPayloadRef.current) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setSyncStatus("saving");
      try {
        const response = await fetch("/api/app-data", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: payloadString,
        });
        if (response.status === 401) {
          setAuthState("locked");
          setLoaded(false);
          return;
        }
        if (!response.ok) throw new Error("progress-save-failed");
        lastSavedPayloadRef.current = payloadString;
        deletedJournalIdsRef.current = [];

        const resData = await response.json().catch(() => null) as { saved?: boolean; journals?: JournalEntry[] } | null;
        if (resData?.journals) {
          const currentJournals = appData.journals;
          const isDifferent = resData.journals.length !== currentJournals.length ||
            resData.journals.some((rj, i) => rj.id !== currentJournals[i]?.id || rj.updatedAt !== currentJournals[i]?.updatedAt);
          if (isDifferent) {
            setJournals(resData.journals);
            lastSavedPayloadRef.current = JSON.stringify({
              ...createAppData(progress, projectSettings, planHistory, resData.journals),
              deletedJournalIds: [],
            });
          }
        }
        setSyncStatus("saved");
      } catch {
        setSyncStatus("offline");
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [authState, loaded, planHistory, progress, projectSettings, journals, repository]);

  useEffect(() => {
    if (authState !== "authenticated") return;

    const refresh = async () => {
      try {
        await loadRemoteData(false);
      } catch {
        setSyncStatus("offline");
      }
    };
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [authState, loadRemoteData]);

  const performLogin = useCallback(async (codeToSubmit: string) => {
    if (codeToSubmit.length !== 6 || isSubmitting) return;
    setIsSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: codeToSubmit }),
      });
      const body = await response.json() as { error?: string } & Partial<StudyAppData>;
      if (!response.ok) {
        setAuthError(body.error ?? "邀请码不正确");
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        setIsSubmitting(false);
        return;
      }
      setAuthState("authenticated");
      applyRemoteData(body, true);
      setLoaded(true);
      setSyncStatus("saved");
    } catch {
      setAuthError("暂时无法连接同步服务，请稍后重试");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setIsSubmitting(false);
    }
  }, [applyRemoteData, isSubmitting]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await performLogin(inviteCode);
  }

  const handleOtpChange = (index: number, value: string) => {
    const digitsOnly = value.replace(/\D/g, "");
    if (!digitsOnly && value !== "") return;

    const char = digitsOnly.slice(-1);
    const codeArr = inviteCode.padEnd(6, " ").split("").map((c) => (c === " " ? "" : c));
    codeArr[index] = char;
    const newCode = codeArr.join("").trim();
    setInviteCode(newCode);

    if (char && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    const fullCode = codeArr.slice(0, 6).join("");
    if (fullCode.length === 6 && !fullCode.includes(" ")) {
      void performLogin(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!inviteCode[index] && index > 0) {
        const codeArr = inviteCode.split("");
        codeArr[index - 1] = "";
        setInviteCode(codeArr.join(""));
        otpInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData) {
      setInviteCode(pastedData);
      const nextFocusIndex = Math.min(pastedData.length, 5);
      otpInputsRef.current[nextFocusIndex]?.focus();

      if (pastedData.length === 6) {
        void performLogin(pastedData);
      }
    }
  };

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAuthState("locked");
    setLoaded(false);
    setProgress(defaultProgress());
    setProjectSettings(defaultProjectSettings());
    setPlanHistory([]);
  }

  const areaBooks = useMemo(() => books.filter((book) => book.area === activeArea), [activeArea]);
  const selectedBookId = selectedBookByArea[activeArea];
  const selectedBook = areaBooks.find((book) => book.id === selectedBookId) ?? areaBooks[0];
  const selectedSections = useMemo(() => allSections(selectedBook), [selectedBook]);
  const learnedCount = selectedSections.filter((section) => progress[section.id]?.learned).length;
  const reviewedCount = selectedSections.filter((section) => progress[section.id]?.reviewed).length;
  const selectedProgressStage = progressStage(selectedSections, progress);
  const isReviewPhase = selectedProgressStage.phase === "reviewed";
  const activeProgressPercent = selectedProgressStage.percentage;
  const activeProgressLabel = isReviewPhase ? "强化阶段" : "基础阶段";
  const manualCurrentSection = selectedSections.find((section) => progress[section.id]?.isCurrent && !progress[section.id]?.learned);
  const currentSection = isReviewPhase
    ? selectedSections.find((section) => !progress[section.id]?.reviewed)
    : manualCurrentSection ?? selectedSections.find((section) => !progress[section.id]?.learned);
  const currentSectionLabel = isReviewPhase ? "当前复习" : "当前新学";
  const phaseCompleteLabel = isReviewPhase ? "强化阶段已完成" : "基础阶段已完成";
  const currentChapterId = currentSection
    ? selectedBook.chapters.find((chapter) => chapter.sections.some((section) => section.id === currentSection.id))?.id
    : undefined;

  useEffect(() => {
    if (!scrollTargetSectionId || catalogFilter !== "all") return;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`section-${scrollTargetSectionId}`);
      if (!target) return;
      const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      target.scrollIntoView({ behavior, block: "center" });
      setScrollTargetSectionId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [catalogFilter, expandedChapters, scrollTargetSectionId]);

  function jumpToCurrentSection() {
    if (!currentSection || !currentChapterId) return;
    setCatalogFilter("all");
    setExpandedChapters((current) => current.includes(currentChapterId) ? current : [...current, currentChapterId]);
    setScrollTargetSectionId(currentSection.id);
  }

  const filteredChapters = selectedBook.chapters
    .map((chapter) => {
      const visibleSections = chapter.sections.filter((section) => {
        const state = progress[section.id];
        if (catalogFilter === "unlearned") return !state?.learned;
        if (catalogFilter === "unreviewed") return Boolean(state?.learned) && !state?.reviewed;
        if (catalogFilter === "overdue") return studyPlanStatus(state) === "overdue";
        return true;
      });
      return { chapter, visibleSections };
    })
    .filter(({ visibleSections }) => visibleSections.length > 0);
  const allExpanded = selectedBook.chapters.every((chapter) => expandedChapters.includes(chapter.id));
  const effectiveAllExpanded = catalogFilter === "all" ? allExpanded : !filterChaptersCollapsed;

  const projectTasks = useMemo(() => projectTaskEntries(activeArea), [activeArea]);
  const todayTasks = useMemo(() => [
    ...projectTaskEntries("408"),
    ...projectTaskEntries("math"),
  ], []);
  const today = dateToday();
  const todayBasePlan = todayTasks.filter(({ section }) => isTodayBasePlan(progress[section.id], today));
  const todayReviewPlan = todayTasks.filter(({ section }) => isTodayReviewPlan(progress[section.id], today));
  const todayPlan = [...todayBasePlan, ...todayReviewPlan];
  const overdueBaseTasks = todayTasks
    .filter(({ section }) => isOverdueBaseTask(progress[section.id], today))
    .sort((left, right) => (progress[left.section.id]?.plannedAt ?? "").localeCompare(progress[right.section.id]?.plannedAt ?? ""));
  const overdueReviewTasks = todayTasks
    .filter(({ section }) => isOverdueReviewTask(progress[section.id], today))
    .sort((left, right) => (progress[left.section.id]?.reviewedPlannedAt ?? "").localeCompare(progress[right.section.id]?.reviewedPlannedAt ?? ""));
  const overdueTasks = [...overdueBaseTasks, ...overdueReviewTasks];
  const allFirstRoundComplete = todayTasks.every(({ section }) => progress[section.id]?.learned);
  const unreviewedTasks = todayTasks
    .filter(({ section }) => isUnreviewedTask(progress[section.id], today))
    .sort((left, right) => (progress[left.section.id]?.learnedAt ?? "").localeCompare(progress[right.section.id]?.learnedAt ?? ""));
  const todayCompleted = todayBasePlan.filter(({ section }) => progress[section.id]?.learned).length + todayReviewPlan.filter(({ section }) => progress[section.id]?.reviewed).length;

  const nearestExamDate = [projectSettings["408"].examDate, projectSettings.math.examDate].sort()[0];
  const examDate = activePage === "progress" ? projectSettings[activeArea].examDate : nearestExamDate;
  const daysUntilExam = useMemo(() => calculateDaysUntilExam(examDate), [examDate]);
  const timeProgressPercent = useMemo(() => calculateTimeProgress(examDate), [examDate]);
  const weekDots = useMemo(() => getWeekDaysActivity(progress), [progress]);
  const weeklyDaysCount = useMemo(() => weekDots.filter((day) => day.isDone).length, [weekDots]);
  const weeklySectionCount = useMemo(() => calculateWeeklySectionCount(progress), [progress]);
  const analyticsSections = useMemo(() => {
    if (analyticsScope === "all") return books.flatMap(allSections);
    return books.filter((b) => b.area === analyticsScope).flatMap(allSections);
  }, [analyticsScope]);
  const analyticsSectionIds = useMemo(() => analyticsSections.map((s) => s.id), [analyticsSections]);
  const analyticsExamDate = useMemo(() => {
    if (analyticsScope === "all") return nearestExamDate;
    return projectSettings[analyticsScope].examDate;
  }, [analyticsScope, nearestExamDate, projectSettings]);
  const forecast = useMemo(() => {
    return calculateVelocityAndForecast(progress, analyticsSectionIds, analyticsExamDate, dateToday());
  }, [progress, analyticsSectionIds, analyticsExamDate]);
  const analyticsTimeProgress = useMemo(() => calculateTimeProgress(analyticsExamDate), [analyticsExamDate]);
  const analyticsLearnedPercent = forecast.totalSections > 0
    ? Math.round((forecast.learnedTotal / forecast.totalSections) * 100)
    : 0;
  const analyticsReviewedPercent = forecast.totalSections > 0
    ? Math.round((forecast.reviewedTotal / forecast.totalSections) * 100)
    : 0;
  const heatmapDays = useMemo(() => {
    return calculateActivityHeatmap(progress, dateToday(), 13);
  }, [progress]);
  const weeklyTrends = useMemo(() => {
    return calculateWeeklyTrends(progress, dateToday(), 8);
  }, [progress]);
  const maxWeeklyAction = useMemo(() => {
    const max = Math.max(...weeklyTrends.map((w) => w.totalActions), 0);
    return Math.max(max, 6);
  }, [weeklyTrends]);
  const currentWeekTrend = useMemo(() => weeklyTrends[weeklyTrends.length - 1], [weeklyTrends]);
  const weeklyAverage = useMemo(() => {
    const sum = weeklyTrends.reduce((acc, w) => acc + w.totalActions, 0);
    return (sum / (weeklyTrends.length || 1)).toFixed(1);
  }, [weeklyTrends]);
  const peakWeekActions = useMemo(() => {
    return Math.max(...weeklyTrends.map((w) => w.totalActions), 0);
  }, [weeklyTrends]);

  function updateProgress(sectionId: string, next: Partial<SectionProgress>) {
    setProgress((current) => {
      const previous = current[sectionId];
      return {
        ...current,
        [sectionId]: normalizeSectionProgress({ ...previous, ...next }, previous),
      };
    });
  }

  function updatePlannedAt(sectionId: string, plannedAt: string) {
    const previous = progress[sectionId]?.plannedAt ?? "";
    if (previous === plannedAt) return;
    updateProgress(sectionId, { plannedAt });
    setPlanHistory((current) => [...current, {
      id: crypto.randomUUID(),
      sectionId,
      from: previous,
      to: plannedAt,
      changedAt: new Date().toISOString(),
      source: "manual" as const,
    }].slice(-1000));
  }

  function updateReviewedPlannedAt(sectionId: string, reviewedPlannedAt: string) {
    const previous = progress[sectionId]?.reviewedPlannedAt ?? "";
    if (previous === reviewedPlannedAt) return;
    updateProgress(sectionId, { reviewedPlannedAt });
    setPlanHistory((current) => [...current, {
      id: crypto.randomUUID(),
      sectionId,
      from: previous,
      to: reviewedPlannedAt,
      changedAt: new Date().toISOString(),
      source: "manual" as const,
    }].slice(-1000));
  }

  function setCurrentSection(sectionId: string) {
    setProgress((current) => {
      const next = { ...current };
      selectedSections.forEach((section) => {
        next[section.id] = { ...next[section.id], isCurrent: section.id === sectionId };
      });
      return next;
    });
    setFeedbackMessage("已设为当前新学");
  }

  function selectBook(bookId: string) {
    setSelectedBookByArea((current) => ({ ...current, [activeArea]: bookId }));
    setExpandedChapters([]);
    setCatalogFilter("all");
  }

  function clearLearned(sectionId: string) {
    updateProgress(sectionId, {
      learned: false,
      learnedAt: "",
      reviewed: false,
      reviewedAt: "",
      isCurrent: false,
    });
  }

  function toggleLearned(sectionId: string, checked: boolean) {
    if (checked) {
      updateProgress(sectionId, { learned: true, learnedAt: dateToday(), isCurrent: false });
      return;
    }
    if (progress[sectionId]?.reviewed) {
      setPendingClearSectionId(sectionId);
      return;
    }
    clearLearned(sectionId);
  }

  function toggleReviewed(sectionId: string, checked: boolean) {
    if (checked && (!progress[sectionId]?.learned || !progress[sectionId]?.learnedAt)) {
      setFeedbackMessage("请先完成新学并记录日期，再标记复习");
      return;
    }
    updateProgress(sectionId, {
      reviewed: checked,
      reviewedAt: checked ? dateToday() : "",
    });
  }

  function applyPlanChanges(values: Record<string, string>, message: string, source: PlanChangeSource, field: "plannedAt" | "reviewedPlannedAt" = "plannedAt") {
    const ids = Object.keys(values);
    if (!ids.length) {
      setFeedbackMessage("没有符合条件的计划日期可调整");
      return;
    }
    const previous = Object.fromEntries(ids.map((sectionId) => [sectionId, progress[sectionId]?.[field] ?? ""]));
    const changedAt = new Date().toISOString();
    setProgress((current) => {
      const next = { ...current };
      ids.forEach((sectionId) => {
        next[sectionId] = { ...next[sectionId], [field]: values[sectionId] };
      });
      return next;
    });
    setPlanHistory((current) => [...current, ...ids.map((sectionId) => ({
      id: crypto.randomUUID(),
      sectionId,
      from: previous[sectionId],
      to: values[sectionId],
      changedAt,
      source,
    }))].slice(-1000));
    setPlanUndo({ message, values: previous, field });
    setFeedbackMessage("");
  }

  function previewPlanChanges(values: Record<string, string>, message: string, source: PlanPreview["source"], field: "plannedAt" | "reviewedPlannedAt" = "plannedAt") {
    const changedValues = Object.fromEntries(Object.entries(values).filter(([sectionId, dateVal]) => (
      (progress[sectionId]?.[field] ?? "") !== dateVal
    )));
    if (!Object.keys(changedValues).length) {
      setFeedbackMessage("没有符合条件的计划日期可调整");
      return;
    }
    setPlanPreview({ values: changedValues, message, source, field });
  }

  function undoPlanChange() {
    if (!planUndo) return;
    const changedAt = new Date().toISOString();
    const field = planUndo.field || "plannedAt";
    setProgress((current) => {
      const next = { ...current };
      Object.entries(planUndo.values).forEach(([sectionId, dateVal]) => {
        next[sectionId] = { ...next[sectionId], [field]: dateVal };
      });
      return next;
    });
    setPlanHistory((current) => [...current, ...Object.entries(planUndo.values).map(([sectionId, dateVal]) => ({
      id: crypto.randomUUID(),
      sectionId,
      from: progress[sectionId]?.[field] ?? "",
      to: dateVal,
      changedAt,
      source: "undo" as const,
    }))].slice(-1000));
    setPlanUndo(null);
    setFeedbackMessage("已撤销上一次计划调整");
  }

  function setChapterPlan(
    sections: Section[],
    range: { start: string; end: string; includeCompleted: boolean },
    mode: "uniform" | "spread",
    targetPhase: "base" | "review" = "base",
  ) {
    if (!range.start || (mode === "spread" && !range.end)) {
      setFeedbackMessage("请先设置完整的计划日期或区间");
      return;
    }
    if (mode === "spread" && range.end < range.start) {
      setFeedbackMessage("计划结束日期不能早于开始日期");
      return;
    }
    const field = targetPhase === "review" ? "reviewedPlannedAt" : "plannedAt";
    const values = buildChapterPlanChanges(
      sections.map((section) => ({
        id: section.id,
        learned: Boolean(progress[section.id]?.learned),
        reviewed: Boolean(progress[section.id]?.reviewed),
        plannedAt: progress[section.id]?.plannedAt ?? "",
        reviewedPlannedAt: progress[section.id]?.reviewedPlannedAt ?? "",
      })),
      range,
      mode,
      targetPhase,
    );
    const phaseLabel = targetPhase === "review" ? "强化阶段（复习）" : "基础阶段（新学）";
    previewPlanChanges(
      values,
      mode === "uniform" ? `已统一设置${phaseLabel}章节计划` : `已按天均分${phaseLabel}章节计划`,
      "batchSchedule",
      field,
    );
  }

  function shiftPlans(startSectionId: string, scope: ShiftScope, days: number, targetPhase: "base" | "review" = "base") {
    if (!Number.isInteger(days) || days === 0) {
      setFeedbackMessage("移动天数必须是非零整数");
      return;
    }
    const chapter = selectedBook.chapters.find((item) => item.sections.some((section) => section.id === startSectionId));
    const source = scope === "chapter" ? chapter?.sections ?? [] : selectedSections;
    const startIndex = source.findIndex((section) => section.id === startSectionId);
    const field = targetPhase === "review" ? "reviewedPlannedAt" : "plannedAt";
    const values: Record<string, string> = {};
    source.slice(Math.max(startIndex, 0)).forEach((section) => {
      const state = progress[section.id];
      const dateVal = state?.[field];
      const isDone = targetPhase === "review" ? state?.reviewed : state?.learned;
      if (dateVal && !isDone) values[section.id] = addCalendarDays(dateVal, days);
    });
    const phaseLabel = targetPhase === "review" ? "强化复习" : "基础新学";
    previewPlanChanges(values, `已将后续${phaseLabel}计划${days > 0 ? "后移" : "前移"} ${Math.abs(days)} 天`, "shift", field);
    setShiftSectionId(null);
  }

  function currentAppData(): StudyAppData {
    return createAppData(progress, projectSettings, planHistory, journals);
  }

  async function replaceCloudData(data: StudyAppData): Promise<boolean> {
    setSyncStatus("saving");
    try {
      const response = await fetch("/api/app-data", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, replace: true }),
      });
      if (!response.ok) throw new Error("app-data-replace-failed");
      lastSavedPayloadRef.current = JSON.stringify({ ...data, deletedJournalIds: [] });
      deletedJournalIdsRef.current = [];
      setSyncStatus("saved");
      return true;
    } catch {
      setSyncStatus("offline");
      setFeedbackMessage("数据暂时无法写入云端，请稍后重试");
      return false;
    }
  }

  function downloadExport() {
    const data = currentAppData();
    const payload = {
      ...data,
      exportedAt: new Date().toISOString(),
      projects: (["408", "math"] as StudyArea[]).map((area) => ({
        id: area,
        name: area === "408" ? "408" : "数学",
        subjects: books.filter((book) => book.area === area).map((book) => book.id),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `study-progress-backup-${dateToday()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedbackMessage("已导出全部学习数据（包含学习日志与小节进度）");
  }

  function downloadRecoveryData() {
    if (!storageLoadIssue) return;
    const blob = new Blob([storageLoadIssue.raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `study-unmigrated-data-${dateToday()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function readImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      setFeedbackMessage("导入文件过大，请选择 2MB 以内的 JSON 文件");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const normalized = normalizeAppData(parsed, defaultProgress());
      if (!normalized) throw new Error("invalid-schema");
      setPendingImport({ ...normalized, appVersion: APP_VERSION });
      setFeedbackMessage("");
    } catch {
      setFeedbackMessage("导入失败：文件不是受支持的学习数据 JSON");
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setBackups(repository().createBackup(currentAppData(), "before-import"));
    if (!await replaceCloudData(pendingImport)) return;
    setProgress(mergeRemoteProgress(pendingImport.progress));
    setProjectSettings(pendingImport.projectSettings);
    setPlanHistory(pendingImport.planHistory);
    setJournals(pendingImport.journals);
    repository().save(pendingImport);
    setPendingImport(null);
    setFeedbackMessage("数据导入完成，已自动保留导入前备份");
  }

  function createManualBackup() {
    setBackups(repository().createBackup(currentAppData(), "manual"));
    setFeedbackMessage("已创建本地备份");
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setBackups(repository().createBackup(currentAppData(), "before-restore"));
    const restored = normalizeAppData(pendingRestore.data, defaultProgress());
    if (!restored || !await replaceCloudData(restored)) return;
    setProgress(mergeRemoteProgress(restored.progress));
    setProjectSettings(restored.projectSettings);
    setPlanHistory(restored.planHistory);
    setJournals(restored.journals);
    repository().save(restored);
    setBackups(repository().backups());
    setPendingRestore(null);
    setFeedbackMessage("备份恢复完成，已保留恢复前备份");
  }

  function updateExamStartDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setProjectSettings({
      "408": { examDate: value },
      math: { examDate: value },
    });
  }

  function renderTaskList(
    tasks: TaskEntry[],
    kind: "today" | "today-base" | "today-review" | "overdue" | "unreviewed",
    emptyMessage: string,
  ) {
    if (!tasks.length) return <p className="task-empty">{emptyMessage}</p>;
    return (
      <div className="task-list">
        {tasks.map(({ book, chapterTitle, section }) => {
          const state = progress[section.id];
          const isReviewAction = kind === "today-review" || kind === "unreviewed" || (kind === "overdue" && Boolean(state?.learned) && !state?.reviewed);
          const checked = isReviewAction ? state?.reviewed : state?.learned;
          return (
            <article className={`task-row${checked ? " completed" : ""}`} key={`${kind}-${section.id}`}>
              <div className="task-main">
                <div className="task-title"><span>{section.number}</span><strong>{section.title}</strong></div>
                <div className="task-context"><strong>{book.shortTitle}</strong><span>{chapterTitle}</span></div>
              </div>
              <span className={`task-date ${isReviewAction ? "unreviewed" : kind.startsWith("today") ? "today" : "overdue"}`}>
                {kind === "today-base" || (kind === "today" && !isReviewAction)
                  ? state?.learned ? `新学 ${formatDateShort(state.learnedAt)}` : "计划今天新学"
                  : kind === "today-review"
                    ? state?.reviewed ? `复习 ${formatDateShort(state.reviewedAt)}` : "计划今天复习"
                    : kind === "overdue"
                      ? isReviewAction ? `复习逾期 ${formatDateShort(state?.reviewedPlannedAt ?? "")}` : `新学逾期 ${formatDateShort(state?.plannedAt ?? "")}`
                      : state?.reviewedPlannedAt ? `计划 ${formatDateShort(state.reviewedPlannedAt)}` : `新学 ${formatDateShort(state?.learnedAt ?? "")}`}
              </span>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  onChange={(event) => isReviewAction
                    ? toggleReviewed(section.id, event.target.checked)
                    : toggleLearned(section.id, event.target.checked)}
                />
                <span />
                <em>{isReviewAction ? "复习" : "新学"}</em>
              </label>
            </article>
          );
        })}
      </div>
    );
  }

  const journalsBySection = useMemo(() => {
    const map: Record<string, JournalEntry[]> = {};
    journals.forEach((entry) => {
      if (entry.context && entry.context.type === "section" && entry.context.sectionId) {
        if (!map[entry.context.sectionId]) map[entry.context.sectionId] = [];
        map[entry.context.sectionId].push(entry);
      }
    });
    Object.values(map).forEach((list) => {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    return map;
  }, [journals]);

  const filteredJournals = useMemo(() => {
    return journals.filter((entry) => {
      if (journalFilter === "unlinked" && entry.context !== null) return false;
      if (journalFilter === "linked" && entry.context === null) return false;
      if (journalFilter === "408" && entry.context?.area !== "408") return false;
      if (journalFilter === "math" && entry.context?.area !== "math") return false;
      if (journalFilter === "published" && entry.publish?.status !== "published") return false;

      if (journalSearchQuery.trim()) {
        const q = journalSearchQuery.trim().toLowerCase();
        const titleMatch = entry.title?.toLowerCase().includes(q) ?? false;
        const contentMatch = entry.content.toLowerCase().includes(q);
        let contextMatch = false;
        if (entry.context) {
          if (entry.context.type === "section") {
            contextMatch = Boolean(
              entry.context.sectionTitle?.toLowerCase().includes(q)
              || entry.context.bookTitle?.toLowerCase().includes(q)
              || entry.context.sectionNumber?.toLowerCase().includes(q),
            );
          } else if (entry.context.type === "subject") {
            contextMatch = Boolean(
              entry.context.bookTitle?.toLowerCase().includes(q)
              || entry.context.bookId.toLowerCase().includes(q),
            );
          } else if (entry.context.type === "project") {
            contextMatch = entry.context.area.toLowerCase().includes(q);
          }
        }
        if (!titleMatch && !contentMatch && !contextMatch) return false;
      }

      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [journals, journalFilter, journalSearchQuery]);

  const groupedJournals = useMemo(() => {
    const groups: { dateKey: string; label: string; entries: JournalEntry[] }[] = [];
    const dateMap = new Map<string, JournalEntry[]>();

    filteredJournals.forEach((entry) => {
      const dateKey = entry.createdAt.slice(0, 10);
      if (!dateMap.has(dateKey)) {
        const list: JournalEntry[] = [];
        dateMap.set(dateKey, list);
        groups.push({
          dateKey,
          label: formatDateChineseWithWeekday(dateKey),
          entries: list,
        });
      }
      dateMap.get(dateKey)!.push(entry);
    });

    return groups;
  }, [filteredJournals]);

  const activeDrawerSection = findSectionById(activeDrawerSectionId);

  const openCreateJournal = useCallback((context?: JournalContext | null) => {
    setEditingJournalId(null);
    setEditorTitle("");
    setEditorContent("");
    setEditorContext(context ?? null);
    setShowTitleInput(false);
    setEditorMode("split");
    setIsEditorOpen(true);
  }, []);

  const openEditJournal = useCallback((journal: JournalEntry) => {
    setEditingJournalId(journal.id);
    setEditorTitle(journal.title ?? "");
    setEditorContent(journal.content);
    setEditorContext(journal.context);
    setShowTitleInput(Boolean(journal.title));
    setEditorMode("split");
    setIsEditorOpen(true);
  }, []);

  const handleSaveJournal = useCallback(() => {
    const trimmedContent = editorContent.trim();
    if (!trimmedContent) {
      setFeedbackMessage("日志内容不能为空");
      return;
    }

    const trimmedTitle = editorTitle.trim() ? editorTitle.trim() : null;
    const now = new Date().toISOString();

    if (editingJournalId) {
      setJournals((prev) => prev.map((entry) => {
        if (entry.id !== editingJournalId) return entry;
        return {
          ...entry,
          title: trimmedTitle,
          content: editorContent,
          context: editorContext,
          updatedAt: now,
        };
      }));
      setFeedbackMessage("日志已更新");
    } else {
      const newId = generateJournalId(journals, dateToday());
      const newEntry: JournalEntry = {
        id: newId,
        createdAt: now,
        updatedAt: now,
        title: trimmedTitle,
        content: editorContent,
        context: editorContext,
        publish: {
          status: "local",
          publishedAt: null,
          blogUrl: null,
          blogPostId: null,
        },
      };
      setJournals((prev) => [newEntry, ...prev]);
      setFeedbackMessage("日志已保存");
    }

    setIsEditorOpen(false);
    setEditingJournalId(null);
    setEditorTitle("");
    setEditorContent("");
    setEditorContext(null);
  }, [editorContent, editorTitle, editingJournalId, editorContext, journals]);

  const handleDeleteJournal = useCallback((journal: JournalEntry) => {
    setPendingDeleteJournal(journal);
  }, []);

  const confirmDeleteJournal = useCallback(() => {
    if (!pendingDeleteJournal) return;
    deletedJournalIdsRef.current.push(pendingDeleteJournal.id);
    setJournals((prev) => prev.filter((entry) => entry.id !== pendingDeleteJournal.id));
    setPendingDeleteJournal(null);
    setFeedbackMessage("日志已删除");
  }, [pendingDeleteJournal]);

  const toggleExpandJournal = useCallback((id: string) => {
    setExpandedJournalIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }, []);

  const openBlogPublishModal = useCallback((journal: JournalEntry) => {
    setBlogPublishJournal(journal);
    setPublishTitle(journal.title ?? (journal.context?.type === "section" && journal.context.sectionTitle ? `${journal.context.sectionTitle} 学习记录` : ""));
    setPublishSlug(journal.publish?.blogPostId || journal.id);
    setPublishContent(journal.content);
    setPublishError("");
    setIsPublishing(false);
  }, []);

  const handleBlogPublish = useCallback(async () => {
    if (!blogPublishJournal) return;
    if (!publishTitle.trim()) {
      setPublishError("发布到 Blog 时标题必填");
      return;
    }
    if (!publishSlug.trim()) {
      setPublishError("发布 Slug 必填");
      return;
    }
    if (!publishContent.trim()) {
      setPublishError("发布正文不能为空");
      return;
    }

    setIsPublishing(true);
    setPublishError("");

    try {
      const response = await fetch("/api/blog/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: publishTitle.trim(),
          slug: publishSlug.trim(),
          content: publishContent,
          journalId: blogPublishJournal.id,
        }),
      });

      const data = await response.json() as {
        success?: boolean;
        simulated?: boolean;
        error?: string;
        message?: string;
        publishedAt?: string;
        blogUrl?: string;
        blogPostId?: string;
      };

      if (!response.ok || !data.success) {
        setPublishError(data.error || "发布失败，请稍后重试");
        setIsPublishing(false);
        return;
      }

      if (data.simulated) {
        setFeedbackMessage("【模拟发布】已成功验证排版与 Slug（未配置 GITHUB_TOKEN，未推送到 GitHub 博客，未标记日志为已发布状态）。");
        setBlogPublishJournal(null);
        setIsPublishing(false);
        return;
      }

      setJournals((prev) => prev.map((entry) => {
        if (entry.id !== blogPublishJournal.id) return entry;
        return {
          ...entry,
          publish: {
            status: "published",
            publishedAt: data.publishedAt ?? new Date().toISOString(),
            blogUrl: data.blogUrl ?? null,
            blogPostId: data.blogPostId ?? publishSlug.trim(),
          },
        };
      }));

      setBlogPublishJournal(null);
      setFeedbackMessage("文章已成功发布至 GitHub 博客！");
    } catch {
      setPublishError("无法连接发布服务，请检查网络或后端配置");
    } finally {
      setIsPublishing(false);
    }
  }, [blogPublishJournal, publishTitle, publishSlug, publishContent]);

  const pendingImportSummary = pendingImport
    ? summarizeImport(pendingImport, 2, books.length)
    : null;

  if (authState === "authenticated" && !loaded) {
    return <main className="auth-shell"><div className="auth-card"><UniversityLogo /><strong>正在连接学习空间</strong><p>正在读取云端进度…</p></div></main>;
  }

  if (authState === "locked") {
    return (
      <main className="auth-shell">
        <form className={`auth-card ${isShaking ? "shaking" : ""}`} onSubmit={login}>
          <UniversityLogo />
          <h1>学习进度</h1>
          <p className="auth-subtitle">请输入 6 位专属访问码进入空间</p>

          <div className="otp-container">
            {Array.from({ length: 6 }).map((_, i) => {
              const digit = inviteCode[i] || "";
              return (
                <input
                  key={i}
                  ref={(el) => { otpInputsRef.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onPaste={handleOtpPaste}
                  onFocus={(e) => e.target.select()}
                  className={`otp-box ${digit ? "filled" : ""} ${authError ? "error" : ""}`}
                  disabled={isSubmitting}
                  aria-label={`访问码第 ${i + 1} 位`}
                  autoFocus={i === 0}
                />
              );
            })}
          </div>

          <button
            className={`invite-button ${isSubmitting ? "submitting" : ""}`}
            type="submit"
            disabled={inviteCode.length < 6 || isSubmitting}
          >
            {isSubmitting ? (
              <span className="spinner-wrap">
                <span className="spinner" /> 正在验证...
              </span>
            ) : (
              "进入空间"
            )}
          </button>
          {authError && (
            <div className="auth-error-badge" role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor" className="error-icon">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{authError}</span>
            </div>
          )}
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <svg className="atlas-logo" viewBox="0 0 28 28" aria-hidden="true">
            <path d="M3 10.5 14 5l11 5.5L14 16 3 10.5Z" />
            <path d="M7.2 13v5.1c0 2.2 3.1 4 6.8 4s6.8-1.8 6.8-4V13" />
            <path d="M25 10.5v7" />
            <circle cx="25" cy="19" r="1.25" />
          </svg>
          <strong>Atlas</strong>
        </div>

        <div className="semester-card">
          <div className="semester-card__top">
            <span>距离初试</span>
            <span className="live-dot" />
          </div>
          <div className="semester-card__date">
            还有 <strong>{daysUntilExam}</strong> 天
          </div>
          <div className="mini-track">
            <span style={{ width: `${timeProgressPercent}%` }} />
          </div>
          <div className="semester-card__meta">
            <span>时间进度 {timeProgressPercent}%</span>
            <span>{formatDateShort(examDate)}</span>
          </div>
        </div>

        <nav className="page-navigation" aria-label="页面导航">
          <span className="navigation-kicker">工作台</span>
          {pageNavigation.map(({ page, icon, label }) => (
            <button
              className={activePage === page ? "active" : ""}
              type="button"
              key={page}
              aria-current={activePage === page ? "page" : undefined}
              onClick={() => setActivePage(page)}
            >
              <span className={`navigation-symbol navigation-symbol--${icon}`} aria-hidden="true" />
              <span className="navigation-copy"><strong>{label}</strong></span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className={`settings-navigation${activePage === "settings" ? " active" : ""}`} type="button" onClick={() => setActivePage("settings")}>
            <span className="navigation-symbol navigation-symbol--settings" aria-hidden="true" />
            <span className="navigation-copy"><strong>设置</strong></span>
          </button>
          <p className="storage-note"><i className={syncStatus === "saved" ? "synced" : ""} />{syncStatus === "saved" ? "进度已同步" : syncStatus === "saving" ? "正在同步…" : "等待同步"}</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar" aria-label="全局操作">
          <h1 className="topbar-title" id={`${activePage}-title`}>{pageTitles[activePage]}</h1>
          <div className="topbar-actions">
            {activePage === "progress" && <div className="study-switchers">
              <nav className="book-switcher" aria-label={`切换${activeArea === "408" ? "408" : "数学"}科目`}>
                {areaBooks.map((book) => (
                  <button
                    className={book.id === selectedBook.id ? "active" : ""}
                    type="button"
                    key={book.id}
                    aria-current={book.id === selectedBook.id ? "page" : undefined}
                    onClick={() => selectBook(book.id)}
                  >
                    {book.shortTitle}
                  </button>
                ))}
              </nav>
              <label className="book-select">
                <span className="visually-hidden">切换{activeArea === "408" ? "408" : "数学"}科目</span>
                <select value={selectedBook.id} onChange={(event) => selectBook(event.target.value)}>
                  {areaBooks.map((book) => <option value={book.id} key={book.id}>{book.shortTitle}</option>)}
                </select>
              </label>
              <div className="area-switcher" role="group" aria-label="切换学习领域">
                {(["408", "math"] as StudyArea[]).map((area) => (
                  <button
                    className={activeArea === area ? "active" : ""}
                    type="button"
                    key={area}
                    aria-pressed={activeArea === area}
                    onClick={() => {
                      setActiveArea(area);
                      setExpandedChapters([]);
                      setCatalogFilter("all");
                    }}
                  >
                    {area === "408" ? "408" : "数学"}
                  </button>
                ))}
              </div>
            </div>}
            <button className="logout-button" type="button" onClick={logout}>退出</button>
          </div>
        </header>

        <div className={`page-content page-content--${activePage}`}>
          {feedbackMessage && <div className="feedback-notice feedback-notice--global"><span>{feedbackMessage}</span><button type="button" onClick={() => setFeedbackMessage("")}>×</button></div>}
          {activePage === "progress" ? <>
          <section className="hero-grid" aria-label="学习概览与节奏">
            <article className="hero-card progress-card">
              <div className="card-heading">
                <div>
                  <h2>{selectedBook.title}</h2>
                </div>
                <span className="status-pill status-pill--calm">
                  {isReviewPhase ? (reviewedCount === selectedSections.length ? "全部完成" : "强化阶段") : "基础阶段"}
                </span>
              </div>

              <div className="progress-number">
                {activeProgressPercent}<small>%</small><em>{activeProgressLabel}</em>
              </div>

              <div className={`big-track ${isReviewPhase ? "big-track--review" : ""}`}>
                <span style={{ width: `${activeProgressPercent}%` }} />
                <i style={{ left: `${activeProgressPercent}%` }} />
              </div>

              <div className="progress-note">
                <p>
                  新学 <strong>{learnedCount}/{selectedSections.length}</strong> 小节，复习 <strong>{reviewedCount}/{selectedSections.length}</strong> 小节
                </p>
                {currentSection ? (
                  <button
                    className="current-learning-link"
                    type="button"
                    aria-label={`跳转到${currentSectionLabel}：${currentSection.number} ${currentSection.title}`}
                    onClick={jumpToCurrentSection}
                  >
                    {currentSectionLabel}：<strong>{currentSection.number} {currentSection.title}</strong>
                  </button>
                ) : (
                  <p>{currentSectionLabel}：<strong>{phaseCompleteLabel}</strong></p>
                )}
              </div>
            </article>

            <article className="hero-card streak-card">
              <div className="card-heading">
                <div>
                  <h2>本周节奏</h2>
                </div>
                <span className="streak-flame">✹</span>
              </div>

              <div className="rhythm-metrics" aria-label={`本周学习 ${weeklyDaysCount} 天，完成 ${weeklySectionCount} 小节`}>
                <div className="rhythm-metric">
                  <strong>{weeklyDaysCount}</strong><span>天已学</span>
                </div>
                <i aria-hidden="true" />
                <div className="rhythm-metric">
                  <strong>{weeklySectionCount}</strong><span>小节已学</span>
                </div>
              </div>

              <div className="week-dots" aria-label="本周打卡记录">
                {weekDots.map((day) => (
                  <div key={day.dateStr}>
                    <span
                      className={`dot ${day.isDone ? "dot--done" : ""} ${day.isToday ? "dot--today" : ""}`}
                      title={`${day.dateStr} ${day.isDone ? "已打卡" : "未打卡"}`}
                    />
                    <small>{day.label}</small>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="catalog">
            <div className="catalog-heading">
              <div><h2>目录</h2><span>{selectedBook.chapters.length} 章 · {selectedSections.length} 小节</span></div>
              <div className="catalog-tools">
                <div className="catalog-filters" aria-label="目录筛选">
                  {([
                    ["all", "全部"],
                    ["unlearned", "未新学"],
                    ["unreviewed", "未复习"],
                    ["overdue", "逾期"],
                  ] as [CatalogFilter, string][]).map(([value, label]) => (
                    <button className={catalogFilter === value ? "active" : ""} type="button" key={value} onClick={() => { setCatalogFilter(value); setFilterChaptersCollapsed(false); }}>{label}</button>
                  ))}
                </div>
                <button className={`catalog-action${planEditMode ? " active" : ""}`} type="button" onClick={() => setPlanEditMode((value) => !value)}>{planEditMode ? "完成编辑" : "编辑计划"}</button>
                <button
                  className="catalog-action"
                  type="button"
                  onClick={() => catalogFilter === "all" ? setExpandedChapters(allExpanded ? [] : selectedBook.chapters.map((chapter) => chapter.id)) : setFilterChaptersCollapsed((value) => !value)}
                >
                  {effectiveAllExpanded ? "全部折叠" : "全部展开"}
                </button>
              </div>
            </div>

            {planUndo && <div className="plan-notice"><span>{planUndo.message}</span><button type="button" onClick={undoPlanChange}>撤销</button></div>}
            <div className="chapter-grid">
              {filteredChapters.map(({ chapter, visibleSections }) => {
                const chapterIndex = selectedBook.chapters.findIndex((item) => item.id === chapter.id);
                const open = catalogFilter !== "all" ? !filterChaptersCollapsed : expandedChapters.includes(chapter.id);
                const chapterCompleted = chapter.sections.filter((section) => isReviewPhase
                  ? progress[section.id]?.reviewed
                  : progress[section.id]?.learned).length;
                const chapterComplete = chapterCompleted === chapter.sections.length;
                const chapterOverdue = chapter.sections.some((section) => studyPlanStatus(progress[section.id]) === "overdue");
                const chapterState = chapter.id === currentChapterId ? "current" : chapterOverdue ? "overdue" : chapterComplete ? "completed" : "normal";
                const baseDates = chapter.sections.map((section) => progress[section.id]?.plannedAt ?? "").filter(Boolean).sort();
                const reviewDates = chapter.sections.map((section) => progress[section.id]?.reviewedPlannedAt ?? "").filter(Boolean).sort();
                const activeDates = chapterPlanTarget === "review" ? reviewDates : baseDates;
                const learnedCompletedAt = chapterCompletionDate(chapter.sections, progress, "learned");
                const reviewedCompletedAt = chapterCompletionDate(chapter.sections, progress, "reviewed");
                const range = chapterRanges[chapter.id] ?? {
                  start: activeDates[0] ?? "",
                  end: activeDates[activeDates.length - 1] ?? activeDates[0] ?? "",
                  includeCompleted: false,
                };

                return (
                  <article className={`chapter-card ${chapterState}${open ? " open" : ""}`} key={chapter.id}>
                    <button
                      className="chapter-button"
                      onClick={() => setExpandedChapters((current) => current.includes(chapter.id) ? current.filter((id) => id !== chapter.id) : [...current, chapter.id])}
                      aria-expanded={open}
                    >
                      <span className="chapter-index">{String(chapterIndex + 1).padStart(2, "0")}</span>
                      <span className="chapter-name">
                        <small>第{chapter.number}章</small>
                        <strong>{chapter.title}</strong>
                        <span className="chapter-meta">
                          <em>{formatPlanRange(baseDates, "基础")}</em>
                          {reviewDates.length > 0 && <em>{formatPlanRange(reviewDates, "强化")}</em>}
                          {(learnedCompletedAt || reviewedCompletedAt) && (
                            <span className="chapter-completion-dates">
                              {learnedCompletedAt && <span className="chapter-completion-date learned">基础 {formatDateChinese(learnedCompletedAt)}</span>}
                              {reviewedCompletedAt && <span className="chapter-completion-date reviewed">强化 {formatDateChinese(reviewedCompletedAt)}</span>}
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={`chapter-count${chapterComplete ? " complete" : ""}`}
                        aria-label={`本章${activeProgressLabel}进度 ${chapterCompleted} / ${chapter.sections.length}`}
                      >
                        {chapterComplete && <i>✓</i>}{chapterCompleted} / {chapter.sections.length}
                      </span>
                      <span className="chevron" aria-hidden="true" />
                    </button>

                    {open && (
                      <>
                      {planEditMode && (
                        <div className="chapter-plan-editor">
                          <div className="chapter-plan-phase-toggle" role="group" aria-label="排期阶段">
                            <button type="button" className={chapterPlanTarget === "base" ? "active" : ""} onClick={() => setChapterPlanTarget("base")}>基础新学</button>
                            <button type="button" className={chapterPlanTarget === "review" ? "active" : ""} onClick={() => setChapterPlanTarget("review")}>强化复习</button>
                          </div>
                          <span>计划区间</span>
                          <input type="date" value={range.start} aria-label={`${chapter.title}${chapterPlanTarget === "review" ? "强化复习" : "基础新学"}计划开始日期`} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, start: event.target.value } }))} />
                          <b>—</b>
                          <input type="date" value={range.end} aria-label={`${chapter.title}${chapterPlanTarget === "review" ? "强化复习" : "基础新学"}计划结束日期`} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, end: event.target.value } }))} />
                          <label><input type="checkbox" checked={range.includeCompleted} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, includeCompleted: event.target.checked } }))} />包含已完成项</label>
                          <button type="button" onClick={() => setChapterPlan(chapter.sections, range, "uniform", chapterPlanTarget)}>统一日期</button>
                          <button type="button" onClick={() => setChapterPlan(chapter.sections, range, "spread", chapterPlanTarget)}>按天均分</button>
                        </div>
                      )}
                      <div className={`section-table${planEditMode ? " editing" : ""}`}>
                        <div className="section-head" aria-hidden="true">
                          <span>小节</span><span>新学计划</span><span>新学</span><span>复习计划</span><span>复习</span>
                        </div>
                        {visibleSections.map((section) => {
                          const state = progress[section.id];
                          const baseStatus = basePlanStatus(state);
                          const reviewStatus = reviewPlanStatus(state);
                          const rowStatus = studyPlanStatus(state);
                          const isCurrent = currentSection?.id === section.id;
                          const sectionJournals = journalsBySection[section.id] ?? [];
                          return (
                            <div
                              className={`section-row ${rowStatus}${isCurrent ? " is-current" : ""}`}
                              id={`section-${section.id}`}
                              aria-current={isCurrent ? "step" : undefined}
                              key={section.id}
                            >
                              <div className="section-name">
                                <span>{section.number}</span><strong>{section.title}</strong>
                                {isCurrent && <i title="当前新学" />}
                                {!state?.learned && !isCurrent && <button type="button" onClick={() => setCurrentSection(section.id)}>设为当前</button>}
                                {sectionJournals.length > 0 && (
                                  <button
                                    type="button"
                                    className="section-journal-badge"
                                    title={`查看此小节的 ${sectionJournals.length} 条学习日志`}
                                    onClick={() => setActiveDrawerSectionId(section.id)}
                                  >
                                    📝 {sectionJournals.length} 条记录
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="section-record-btn"
                                  title="写一条关于该小节的学习日志"
                                  onClick={() => openCreateJournal({
                                    type: "section",
                                    area: activeArea,
                                    bookId: selectedBook.id,
                                    sectionId: section.id,
                                    bookTitle: selectedBook.shortTitle,
                                    sectionTitle: section.title,
                                    sectionNumber: section.number,
                                  })}
                                >
                                  记录 +
                                </button>
                              </div>

                              <div className="section-plan section-plan--base">
                                {planEditMode ? (
                                  <input className="inline-plan-input" type="date" value={state?.plannedAt ?? ""} aria-label={`${section.number} 新学计划日期`} onChange={(event) => updatePlannedAt(section.id, event.target.value)} />
                                ) : (
                                  <EditableDate
                                    value={state?.plannedAt ?? ""}
                                    emptyLabel="未设置"
                                    tone={planTone(baseStatus)}
                                    ariaLabel={`${section.number} 新学计划日期`}
                                    onChange={(value) => updatePlannedAt(section.id, value)}
                                  />
                                )}
                              </div>

                              <div className="check-with-date check-with-date--learned">
                                <label aria-label={`${section.number} 新学`}><input type="checkbox" checked={state?.learned ?? false} onChange={(event) => toggleLearned(section.id, event.target.checked)} /><span /><b className="mobile-check-label">新学</b></label>
                                {state?.learned && <EditableDate value={state.learnedAt} emptyLabel="未记录" ariaLabel={`${section.number} 新学完成日期`} validate={(value) => !value ? "新学日期不能为空；如需取消，请取消勾选" : state.reviewedAt && value > state.reviewedAt ? "新学日期不能晚于复习日期" : null} onError={setFeedbackMessage} onChange={(value) => updateProgress(section.id, { learnedAt: value })} />}
                              </div>

                              <div className="section-plan section-plan--review">
                                {planEditMode ? (
                                  <input className="inline-plan-input" type="date" value={state?.reviewedPlannedAt ?? ""} aria-label={`${section.number} 复习计划日期`} onChange={(event) => updateReviewedPlannedAt(section.id, event.target.value)} />
                                ) : (
                                  <EditableDate
                                    value={state?.reviewedPlannedAt ?? ""}
                                    emptyLabel="未设置"
                                    tone={planTone(reviewStatus)}
                                    ariaLabel={`${section.number} 复习计划日期`}
                                    onChange={(value) => updateReviewedPlannedAt(section.id, value)}
                                  />
                                )}
                              </div>

                              <div className="check-with-date check-with-date--reviewed">
                                <label aria-label={`${section.number} 复习`} title={!state?.learnedAt ? "完成新学后可标记复习" : undefined}><input type="checkbox" checked={state?.reviewed ?? false} disabled={!state?.learnedAt} onChange={(event) => toggleReviewed(section.id, event.target.checked)} /><span /><b className="mobile-check-label">复习</b></label>
                                {state?.reviewed && <EditableDate value={state.reviewedAt} emptyLabel="未记录" ariaLabel={`${section.number} 复习完成日期`} validate={(value) => !value ? "复习日期不能为空；如需取消，请取消勾选" : state.learnedAt && value < state.learnedAt ? "复习日期不能早于新学日期" : null} onError={setFeedbackMessage} onChange={(value) => updateProgress(section.id, { reviewedAt: value })} />}
                              </div>

                              {planEditMode && (
                                <div className="shift-anchor">
                                  <button type="button" onClick={() => setShiftSectionId(shiftSectionId === section.id ? null : section.id)}>移动</button>
                                  {shiftSectionId === section.id && (
                                    <div className="shift-popover">
                                      <select value={shiftPlanTarget} onChange={(event) => setShiftPlanTarget(event.target.value as "base" | "review")} aria-label="移动目标阶段"><option value="base">基础新学计划</option><option value="review">强化复习计划</option></select>
                                      <select value={shiftScope} onChange={(event) => setShiftScope(event.target.value as ShiftScope)} aria-label="移动范围"><option value="chapter">本章后续</option><option value="subject">本科目后续</option></select>
                                      {[-3, -2, -1, 1, 2, 3].map((days) => <button type="button" key={days} onClick={() => shiftPlans(section.id, shiftScope, days, shiftPlanTarget)}>{days > 0 ? "+" : ""}{days}天</button>)}
                                      <input type="number" value={shiftDays} onChange={(event) => setShiftDays(Number(event.target.value))} aria-label="自定义移动天数" />
                                      <button type="button" disabled={!Number.isInteger(shiftDays) || shiftDays === 0} onClick={() => shiftPlans(section.id, shiftScope, shiftDays, shiftPlanTarget)}>确定</button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          </> : activePage === "today" ? (
            <section className="page-view today-page" aria-labelledby="today-title">
              <div className="today-header-banner">
                <div className="today-header-intro">
                  <span className="today-date-badge">{formatDateChineseWithWeekday(dateToday())}</span>
                  <h2>今日执行与日志</h2>
                </div>
                <div className="today-header-actions">
                  <button
                    type="button"
                    className="journal-action-btn journal-action-btn--primary"
                    onClick={() => openCreateJournal(null)}
                  >
                    ✍ 写今日记录
                  </button>
                  <button
                    type="button"
                    className="journal-action-btn journal-action-btn--ghost"
                    onClick={() => {
                      const el = document.getElementById("journal-timeline-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    ↓ 学习日志 ({journals.length})
                  </button>
                </div>
              </div>

              <div className="summary-strip" aria-label="今日任务概览">
                <article><span>今日任务</span><strong>{todayPlan.length}</strong><small>{todayCompleted} 项已完成</small></article>
                <article><span>逾期任务</span><strong>{overdueTasks.length}</strong><small>新学逾期 {overdueBaseTasks.length} · 复习逾期 {overdueReviewTasks.length}</small></article>
              </div>

              <div className="today-sections">
                <section className="task-panel task-panel--today" aria-labelledby="today-base-plan-title">
                  <header><div><span>01</span><h2 id="today-base-plan-title">今日新学</h2></div><strong>{todayBasePlan.filter(({ section }) => progress[section.id]?.learned).length}/{todayBasePlan.length}</strong></header>
                  {renderTaskList(todayBasePlan, "today-base", "今天没有安排新学小节，完成的今日新学会保留在这里。")}
                </section>
                <section className="task-panel task-panel--review-today" aria-labelledby="today-review-plan-title">
                  <header><div><span>02</span><h2 id="today-review-plan-title">今日复习</h2></div><strong>{todayReviewPlan.filter(({ section }) => progress[section.id]?.reviewed).length}/{todayReviewPlan.length}</strong></header>
                  {renderTaskList(todayReviewPlan, "today-review", "今天没有安排复习小节。")}
                </section>
                <section className="task-panel task-panel--overdue" aria-labelledby="overdue-title">
                  <header><div><span>03</span><h2 id="overdue-title">逾期任务</h2></div><strong>{overdueTasks.length}</strong></header>
                  {renderTaskList(overdueTasks, "overdue", "没有逾期任务，节奏保持得很好。")}
                </section>
                {unreviewedTasks.length > 0 && <section className="task-panel task-panel--review" aria-labelledby="unreviewed-title">
                  <header><div><span>04</span><h2 id="unreviewed-title">待规划复习</h2></div><strong>{unreviewedTasks.length}</strong></header>
                  {renderTaskList(unreviewedTasks, "unreviewed", "没有待安排的复习任务。")}
                </section>}
              </div>

              <div id="journal-timeline-section" className="journal-stream-container">
                <header className="journal-stream-header">
                  <div className="journal-stream-title">
                    <div className="journal-title-row">
                      <h2>学习日志</h2>
                      <span className="journal-count-pill">{filteredJournals.length} / {journals.length} 篇</span>
                    </div>
                    <p>连续的时间流记录 · 沉淀对概念的理解与复盘反思</p>
                  </div>
                  <div className="journal-stream-actions">
                    <button
                      type="button"
                      className="journal-action-btn journal-action-btn--primary"
                      onClick={() => openCreateJournal(null)}
                    >
                      + 写一条
                    </button>
                  </div>
                </header>

                <div className="journal-controls-bar">
                  <div className="journal-search-wrap">
                    <input
                      type="text"
                      className="journal-search-input"
                      placeholder="搜索日志正文、标题或小节..."
                      value={journalSearchQuery}
                      onChange={(e) => setJournalSearchQuery(e.target.value)}
                    />
                    {journalSearchQuery && (
                      <button
                        type="button"
                        className="journal-search-clear"
                        onClick={() => setJournalSearchQuery("")}
                        aria-label="清空搜索"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="journal-filter-pills" role="tablist" aria-label="日志筛选">
                    {([
                      ["all", "全部"],
                      ["unlinked", "无关联"],
                      ["linked", "有关联"],
                      ["408", "408"],
                      ["math", "数学"],
                      ["published", "已发布"],
                    ] as [JournalFilter, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`filter-pill ${journalFilter === key ? "active" : ""}`}
                        onClick={() => setJournalFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="journal-timeline-content">
                  {groupedJournals.length === 0 ? (
                    <div className="journal-empty-card">
                      <p>
                        {journalSearchQuery || journalFilter !== "all"
                          ? "没有找到符合条件的学习日志。"
                          : "暂无学习日志，随时随地写下您的第一条学习心得吧。"}
                      </p>
                      <button
                        type="button"
                        className="journal-action-btn journal-action-btn--secondary"
                        onClick={() => openCreateJournal(null)}
                      >
                        ✍ 立即记录第一条
                      </button>
                    </div>
                  ) : (
                    groupedJournals.map(({ dateKey, label, entries }) => (
                      <div className="journal-date-group" key={dateKey}>
                        <div className="journal-date-header">
                          <span className="journal-date-dot" />
                          <h3 className="journal-date-text">{label}</h3>
                          <span className="journal-date-count">{entries.length} 条</span>
                        </div>

                        <div className="journal-cards-stack">
                          {entries.map((entry) => {
                            const isExpanded = expandedJournalIds.includes(entry.id);
                            const isLong = entry.content.length > 280;
                            const displayContent = isLong && !isExpanded
                              ? getMarkdownSummary(entry.content, 240)
                              : entry.content;

                            return (
                              <article className="journal-card" key={entry.id}>
                                <div className="journal-card-meta">
                                  <div className="journal-card-badges">
                                    <span className="journal-time-tag">{formatTimeShort(entry.createdAt)}</span>
                                    {entry.context && (
                                      <button
                                        type="button"
                                        className={`journal-context-badge area-${entry.context.area}`}
                                        title={
                                          entry.context.type === "section"
                                            ? `${entry.context.bookTitle ?? ""} ${entry.context.sectionNumber ?? ""} ${entry.context.sectionTitle ?? ""}`
                                            : entry.context.type === "subject"
                                              ? `${entry.context.bookTitle ?? entry.context.bookId}`
                                              : entry.context.area === "408" ? "408" : "数学"
                                        }
                                        onClick={() => {
                                          if (entry.context?.type === "section") {
                                            setActiveDrawerSectionId(entry.context.sectionId);
                                          }
                                        }}
                                      >
                                        {entry.context.type === "section"
                                          ? `📖 ${entry.context.bookTitle} · ${entry.context.sectionNumber} ${entry.context.sectionTitle}`
                                          : entry.context.type === "subject"
                                            ? `📚 ${entry.context.bookTitle ?? entry.context.bookId}`
                                            : `🎯 ${entry.context.area === "408" ? "408" : "数学"}`}
                                      </button>
                                    )}
                                    {entry.publish?.status === "published" && (
                                      <a
                                        href={entry.publish.blogUrl || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="journal-publish-badge"
                                        title="在 GitHub Blog 查看文章"
                                      >
                                        🌐 已发布 ↗
                                      </a>
                                    )}
                                  </div>

                                  <div className="journal-card-actions">
                                    <button
                                      type="button"
                                      className="journal-btn-tool"
                                      onClick={() => openEditJournal(entry)}
                                      title="编辑此日志"
                                    >
                                      编辑
                                    </button>
                                    <button
                                      type="button"
                                      className="journal-btn-tool journal-btn-tool--publish"
                                      onClick={() => openBlogPublishModal(entry)}
                                      title="发布到 GitHub Blog"
                                    >
                                      {entry.publish?.status === "published" ? "重新发布" : "发布到 Blog"}
                                    </button>
                                    <button
                                      type="button"
                                      className="journal-btn-tool journal-btn-tool--delete"
                                      onClick={() => handleDeleteJournal(entry)}
                                      title="删除此日志"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>

                                {entry.title && (
                                  <h4 className="journal-card-title">{entry.title}</h4>
                                )}

                                <div className="journal-card-content">
                                  <MarkdownRenderer content={displayContent} />
                                </div>

                                {isLong && (
                                  <div className="journal-card-footer">
                                    <button
                                      type="button"
                                      className="journal-expand-toggle"
                                      onClick={() => toggleExpandJournal(entry.id)}
                                    >
                                      {isExpanded ? "收起全文 ↑" : "展开阅读全文 ↓"}
                                    </button>
                                  </div>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          ) : activePage === "analytics" ? (
            <section className="page-view analytics-page" aria-labelledby="analytics-title">
              <div className="analytics-toolbar">
                <div className="analytics-scope-switch" role="tablist" aria-label="数据分析范围切换">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={analyticsScope === "all"}
                    className={analyticsScope === "all" ? "active" : ""}
                    onClick={() => setAnalyticsScope("all")}
                  >
                    总览
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={analyticsScope === "408"}
                    className={analyticsScope === "408" ? "active" : ""}
                    onClick={() => setAnalyticsScope("408")}
                  >
                    408
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={analyticsScope === "math"}
                    className={analyticsScope === "math" ? "active" : ""}
                    onClick={() => setAnalyticsScope("math")}
                  >
                    数学
                  </button>
                </div>

                <div className="analytics-exam-tag">
                  <span>目标初试</span>
                  <strong>{analyticsExamDate}</strong>
                  <small>剩 {forecast.daysUntilExam} 天</small>
                </div>
              </div>

              <div className="analytics-section-title">
                <div className="section-dot" />
                <h2>备考宏观罗盘与工期预测</h2>
              </div>

              <div className="analytics-overview-grid">
                <article className="analytics-card macro-card">
                  <div className="macro-card__top">
                    <span className="macro-card__label">初试倒计时</span>
                    <span className={`macro-badge ${forecast.daysUntilExam <= 60 && forecast.daysUntilExam > 0 ? "urgent" : ""}`}>
                      {forecast.daysUntilExam > 0 ? `剩 ${forecast.daysUntilExam} 天` : "初试已结束"}
                    </span>
                  </div>
                  <div className="macro-card__val">
                    <strong>{forecast.daysUntilExam}</strong>
                    <span className="macro-card__unit">天</span>
                  </div>
                  <div className="macro-card__progress-wrap">
                    <div className="macro-card__progress-bar">
                      <span style={{ width: `${Math.min(100, Math.max(0, analyticsTimeProgress))}%` }} />
                    </div>
                    <div className="macro-card__meta">
                      <span>时间流逝 (自 03/01 起)</span>
                      <strong>{analyticsTimeProgress}%</strong>
                    </div>
                  </div>
                </article>

                <article className="analytics-card macro-card">
                  <div className="macro-card__top">
                    <span className="macro-card__label">推进完成度</span>
                    <span className="macro-badge status-badge">
                      {analyticsLearnedPercent >= analyticsTimeProgress ? "进度超前" : "平稳跟进"}
                    </span>
                  </div>
                  <div className="macro-card__dual-val">
                    <div>
                      <small>基础阶段</small>
                      <strong className="coral-text">{analyticsLearnedPercent}%</strong>
                    </div>
                    <div className="divider" />
                    <div>
                      <small>强化阶段</small>
                      <strong className="blue-text">{analyticsReviewedPercent}%</strong>
                    </div>
                  </div>
                  <div className="macro-card__dual-bar">
                    <div className="dual-bar-track">
                      <span className="dual-bar-learned" style={{ width: `${analyticsLearnedPercent}%` }} />
                    </div>
                    <div className="dual-bar-track review-track">
                      <span className="dual-bar-reviewed" style={{ width: `${analyticsReviewedPercent}%` }} />
                    </div>
                    <div className="macro-card__meta">
                      <span>已新学 {forecast.learnedTotal}/{forecast.totalSections} 节</span>
                      <span>已复习 {forecast.reviewedTotal} 节</span>
                    </div>
                  </div>
                </article>

                <article className="analytics-card macro-card">
                  <div className="macro-card__top">
                    <span className="macro-card__label">近 14 天学力速率</span>
                    <span className="macro-badge rate-badge">
                      {forecast.dailyVelocity14d > 0 ? "学力活跃" : "积累中"}
                    </span>
                  </div>
                  <div className="macro-card__val">
                    <strong>{forecast.dailyVelocity14d > 0 ? forecast.dailyVelocity14d : (forecast.dailyVelocityAllTime > 0 ? forecast.dailyVelocityAllTime : "0.0")}</strong>
                    <span className="macro-card__unit">节 / 天</span>
                  </div>
                  <div className="macro-card__meta-box">
                    <div>近 14 天新学 <strong>{forecast.learnedLast14d}</strong> 节</div>
                    <div>近 14 天复习 <strong>{forecast.reviewedLast14d}</strong> 节</div>
                    {forecast.dailyVelocityAllTime > 0 && (
                      <div className="meta-sub">历史全周期均速 {forecast.dailyVelocityAllTime} 节/天</div>
                    )}
                  </div>
                </article>

                <article className="analytics-card macro-card">
                  <div className="macro-card__top">
                    <span className="macro-card__label">工期预测与冲刺</span>
                    <span className={`macro-badge health-${forecast.health}`}>
                      {forecast.health === "completed" ? "基础完成" : forecast.health === "healthy" ? "冲刺充裕" : forecast.health === "steady" ? "节奏稳健" : forecast.health === "tight" ? "工期紧凑" : forecast.health === "behind" ? "需加速" : "数据积累中"}
                    </span>
                  </div>
                  <div className="macro-card__val">
                    {forecast.health === "completed" ? (
                      <strong className="finish-text">基础全部完成</strong>
                    ) : forecast.estimatedCompletionDate ? (
                      <>
                        <strong className="date-text">{formatDateShort(forecast.estimatedCompletionDate)}</strong>
                        <span className="macro-card__unit">预计结课</span>
                      </>
                    ) : (
                      <strong className="pending-text">数据积累中</strong>
                    )}
                  </div>
                  <div className="macro-card__meta-box">
                    {forecast.health === "completed" ? (
                      <div>剩余 <strong>{forecast.daysUntilExam}</strong> 天全量用于强化冲刺与真题模拟</div>
                    ) : forecast.sprintDays !== null ? (
                      <div>
                        预计留出 <strong className={forecast.sprintDays >= 30 ? "green-text" : "coral-text"}>{Math.max(0, forecast.sprintDays)}</strong> 天真题冲刺
                      </div>
                    ) : (
                      <div>持续打卡后自动测算</div>
                    )}
                    <div className="meta-sub">剩余 <strong>{forecast.remainingSections}</strong> 节未新学</div>
                  </div>
                </article>
              </div>

              <div className="forecast-insight-banner">
                <div className="insight-icon">💡</div>
                <div className="insight-content">
                  <strong>备考节奏诊断：</strong>
                  {forecast.health === "completed" ? (
                    <span>恭喜！所选范围的小节已全部完成基础阶段新学。建议把备考重心全面切换至历年真题模拟、错题重做和强化阶段复习。</span>
                  ) : forecast.dailyVelocity14d > 0 && forecast.estimatedCompletionDate && forecast.sprintDays !== null ? (
                    <span>
                      按近 14 天日均 <strong>{forecast.dailyVelocity14d} 节</strong> 的推进节奏，剩余 <strong>{forecast.remainingSections} 节</strong> 预计将于 <strong>{formatDateChinese(forecast.estimatedCompletionDate)}</strong> 完成基础阶段新学。届时距离 <strong>{analyticsExamDate}</strong> 考试仍有 <strong>{forecast.sprintDays} 天</strong> 充裕期，非常有利于展开真题模考与强化复习。
                    </span>
                  ) : (
                    <span>
                      目前所选范围仍有 <strong>{forecast.remainingSections} 节</strong> 待完成基础阶段新学。保持规律学习并在今日或进度页面勾选新学/复习，系统将自动根据真实速率推算结课节点与冲刺窗口。
                    </span>
                  )}
                </div>
              </div>

              <div className="analytics-section-title">
                <div className="section-dot" />
                <h2>学习动量与沉淀热力</h2>
              </div>

              <div className="analytics-activity-grid">
                <article className="analytics-card heatmap-card">
                  <div className="card-header-row">
                    <div>
                      <h3>打卡轨迹</h3>
                    </div>
                    <div className="heatmap-legend">
                      <span>少</span>
                      <i className="level-0" />
                      <i className="level-1" />
                      <i className="level-2" />
                      <i className="level-3" />
                      <span>多</span>
                    </div>
                  </div>

                  <div className="heatmap-viewport">
                    <div className="heatmap-labels-col" aria-hidden="true">
                      <span>一</span>
                      <span>二</span>
                      <span>三</span>
                      <span>四</span>
                      <span>五</span>
                      <span>六</span>
                      <span>日</span>
                    </div>
                    <div className="heatmap-matrix">
                      {Array.from({ length: 13 }).map((_, colIdx) => (
                        <div className="heatmap-col" key={colIdx}>
                          {heatmapDays.slice(colIdx * 7, (colIdx + 1) * 7).map((day) => (
                            <div
                              key={day.date}
                              className={`heatmap-cell level-${day.level} ${day.isToday ? "today-cell" : ""} ${day.isFuture ? "future-cell" : ""}`}
                              onMouseEnter={() => setHoveredHeatmapDay(day)}
                              onMouseLeave={() => setHoveredHeatmapDay((curr) => curr?.date === day.date ? null : curr)}
                              title={`${day.date}: 学完 ${day.learnedCount} 节, 复习 ${day.reviewedCount} 节`}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="heatmap-hover-info">
                    {hoveredHeatmapDay ? (
                      <div className="hover-detail">
                        <strong>{formatDateChinese(hoveredHeatmapDay.date)} ({hoveredHeatmapDay.date})</strong>
                        <span>
                          {hoveredHeatmapDay.isFuture
                            ? "未来日期"
                            : hoveredHeatmapDay.totalActions > 0
                            ? `学完 ${hoveredHeatmapDay.learnedCount} 节 · 复习 ${hoveredHeatmapDay.reviewedCount} 节 · 共 ${hoveredHeatmapDay.totalActions} 项动作`
                            : "当日无打卡记录"}
                        </span>
                      </div>
                    ) : (
                      <div className="hover-detail placeholder">
                        <span>💡 鼠标悬停上方方块，查看当日学完与复习详情</span>
                      </div>
                    )}
                  </div>
                </article>

                <article className="analytics-card trend-card">
                  <div className="card-header-row">
                    <div>
                      <h3>周度产出趋势</h3>
                      <p>近 8 周新学与复习动作对比</p>
                    </div>
                    <div className="trend-legend">
                      <span className="legend-item learned"><i /> 新学</span>
                      <span className="legend-item reviewed"><i /> 复习</span>
                    </div>
                  </div>

                  <div className="trend-summary-strip">
                    <div className="trend-summary-item">
                      <small>本周已学</small>
                      <strong>{currentWeekTrend?.totalActions ?? 0} <small>节</small></strong>
                    </div>
                    <div className="trend-summary-item">
                      <small>8周周均</small>
                      <strong>{weeklyAverage} <small>节/周</small></strong>
                    </div>
                    <div className="trend-summary-item">
                      <small>最高周产出</small>
                      <strong>{peakWeekActions} <small>节</small></strong>
                    </div>
                  </div>

                  <div className="trend-chart-wrap">
                    <div className="trend-grid-lines" aria-hidden="true">
                      <div className="trend-grid-line"><span className="trend-grid-val">{maxWeeklyAction}</span></div>
                      <div className="trend-grid-line"><span className="trend-grid-val">{Math.round(maxWeeklyAction / 2)}</span></div>
                      <div className="trend-grid-line"><span className="trend-grid-val">0</span></div>
                    </div>
                    <div className="trend-bars-container">
                      {weeklyTrends.map((week) => {
                        const totalHeightPercent = maxWeeklyAction > 0
                          ? Math.round((week.totalActions / maxWeeklyAction) * 100)
                          : 0;
                        const learnedPercent = week.totalActions > 0
                          ? (week.learnedCount / week.totalActions) * 100
                          : 0;
                        const reviewedPercent = week.totalActions > 0
                          ? (week.reviewedCount / week.totalActions) * 100
                          : 0;
                        const isHovered = hoveredTrendWeek?.startDate === week.startDate;
                        return (
                          <div
                            className={`trend-col ${week.isCurrentWeek ? "current-week" : ""} ${isHovered ? "is-hovered" : ""}`}
                            key={week.startDate}
                            onMouseEnter={() => setHoveredTrendWeek(week)}
                            onMouseLeave={() => setHoveredTrendWeek((curr) => curr?.startDate === week.startDate ? null : curr)}
                          >
                            <div className="trend-col-track" title={`${week.startDate} ~ ${week.endDate}: 新学 ${week.learnedCount} 节, 复习 ${week.reviewedCount} 节, 共 ${week.totalActions} 节`}>
                              <span className={`bar-total-num ${week.totalActions > 0 ? "visible" : ""}`}>
                                {week.totalActions > 0 ? week.totalActions : ""}
                              </span>
                              <div
                                className="trend-bar-stack"
                                style={{
                                  height: week.totalActions > 0 ? `${Math.max(totalHeightPercent, 8)}%` : "3px",
                                  opacity: week.totalActions > 0 ? 1 : 0.35,
                                }}
                              >
                                {week.reviewedCount > 0 && (
                                  <div className="bar-segment bar-reviewed" style={{ height: `${reviewedPercent}%` }} />
                                )}
                                {week.learnedCount > 0 && (
                                  <div className="bar-segment bar-learned" style={{ height: `${learnedPercent}%` }} />
                                )}
                              </div>
                            </div>
                            <span className="trend-col-label">{week.shortLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="trend-hover-info">
                    {hoveredTrendWeek ? (
                      <div className="hover-detail">
                        <strong>{hoveredTrendWeek.startDate} ~ {hoveredTrendWeek.endDate} {hoveredTrendWeek.isCurrentWeek ? "(本周)" : ""}</strong>
                        <span>
                          {hoveredTrendWeek.totalActions > 0
                            ? `新学 ${hoveredTrendWeek.learnedCount} 节 · 复习 ${hoveredTrendWeek.reviewedCount} 节 · 合计 ${hoveredTrendWeek.totalActions} 项动作`
                            : "本周暂无打卡记录"}
                        </span>
                      </div>
                    ) : (
                      <div className="hover-detail placeholder">
                        <span>💡 鼠标悬停柱状图，查看各周新学与复习打卡构成</span>
                      </div>
                    )}
                  </div>
                </article>
              </div>

            </section>
          ) : (
            <section className="page-view settings-page" aria-labelledby="settings-title">
              <div className="settings-stack">
                <section className="settings-card settings-card--schedule">
                  <header className="settings-card__header">
                    <div>
                      <h2>日程看板</h2>
                      <p>全国硕士研究生统一考试初试日程安排。</p>
                    </div>
                    <div className="settings-schedule-actions">
                      <label className="settings-exam-picker">
                        <span className="settings-date-label">初试首日</span>
                        <input
                          className="settings-date-input"
                          type="date"
                          aria-label="考研初试首日日期"
                          value={projectSettings["408"].examDate}
                          onChange={(event) => updateExamStartDate(event.target.value)}
                        />
                      </label>
                    </div>
                  </header>

                  <div className="schedule-board-grid">
                    <div className="schedule-day-card">
                      <div className="schedule-day-top">
                        <span className="schedule-day-badge">第一天</span>
                        <strong className="schedule-day-date">{formatDateChinese(projectSettings["408"].examDate)}</strong>
                      </div>
                      <div className="schedule-session-list">
                        <div className="schedule-session-item">
                          <span className="schedule-time">08:30 – 11:30</span>
                          <strong className="schedule-subject">政治</strong>
                          <span className="schedule-score">100 分</span>
                        </div>
                        <div className="schedule-session-item">
                          <span className="schedule-time">14:00 – 17:00</span>
                          <strong className="schedule-subject">英语</strong>
                          <span className="schedule-score">100 分</span>
                        </div>
                      </div>
                    </div>

                    <div className="schedule-day-card">
                      <div className="schedule-day-top">
                        <span className="schedule-day-badge">第二天</span>
                        <strong className="schedule-day-date">{formatDateChinese(addCalendarDays(projectSettings["408"].examDate, 1))}</strong>
                      </div>
                      <div className="schedule-session-list">
                        <div className="schedule-session-item">
                          <span className="schedule-time">08:30 – 11:30</span>
                          <strong className="schedule-subject">数学</strong>
                          <span className="schedule-score">150 分</span>
                        </div>
                        <div className="schedule-session-item">
                          <span className="schedule-time">14:00 – 17:00</span>
                          <strong className="schedule-subject">408</strong>
                          <span className="schedule-score">150 分</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="settings-card settings-card--data">
                  <header className="settings-card__header">
                    <div>
                      <h2>数据管理与本地备份</h2>
                      <p>统一管理学习数据的导出、导入迁移以及多版本本地快照恢复。</p>
                    </div>
                  </header>
                  <div className="data-management-grid">
                    <div className="data-management-panel">
                      <div className="data-management-heading">
                        <h3>数据迁移</h3>
                      </div>
                      <p>包含两个项目的全部学习记录、计划安排、设置与操作历史。</p>
                      <div className="settings-actions">
                        <button type="button" className="settings-btn settings-btn--primary" onClick={downloadExport}>
                          导出全部数据
                        </button>
                        <button type="button" className="settings-btn settings-btn--secondary" onClick={() => importInputRef.current?.click()}>
                          导入 JSON
                        </button>
                      </div>
                      {storageLoadIssue && (
                        <button className="recovery-export" type="button" onClick={downloadRecoveryData}>
                          导出无法迁移的原始数据
                        </button>
                      )}
                      <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={readImportFile} />
                    </div>

                    <div className="data-management-panel data-management-panel--backups">
                      <div className="data-management-heading">
                        <div className="backup-title-wrap">
                          <h3>本地快照</h3>
                          <span className="backup-count-badge">{backups.length} / 15</span>
                        </div>
                        <button className="backup-create" type="button" onClick={createManualBackup}>
                          立即创建备份
                        </button>
                      </div>
                      <p>导入、恢复和旧数据迁移前会自动生成快照，最多保留 15 份。</p>
                      <div className="backup-list">
                        {backups.length ? (
                          backups.map((backup) => (
                            <article className="backup-item" key={backup.id}>
                              <div className="backup-item__info">
                                <span className={`backup-tag backup-tag--${backup.kind}`}>
                                  {backupKindLabel(backup.kind)}
                                </span>
                                <span className="backup-item__time">{formatLocalDateTime(backup.createdAt)}</span>
                              </div>
                              <button className="backup-item__restore" type="button" onClick={() => setPendingRestore(backup)}>
                                恢复
                              </button>
                            </article>
                          ))
                        ) : (
                          <div className="backup-empty">
                            <p>还没有本地备份快照，可点击右上角随时手动创建。</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="settings-card settings-card--blog">
                  <header className="settings-card__header">
                    <div>
                      <h2>Blog 发布设置 (V1.9)</h2>
                      <p>将优质学习日志一键发布至个人公开技术博客。</p>
                    </div>
                    <span className="blog-status-badge">就绪</span>
                  </header>
                  <div className="blog-settings-content">
                    <div className="blog-info-item">
                      <span>个人博客站点</span>
                      <a href="https://craig9re5.github.io/" target="_blank" rel="noreferrer">
                        https://craig9re5.github.io/ ↗
                      </a>
                    </div>
                    <div className="blog-info-item">
                      <span>发布架构</span>
                      <strong>Cloudflare Worker Serverless 安全网关（保护 GitHub 凭据）</strong>
                    </div>
                    <div className="blog-info-item">
                      <span>已发布文章统计</span>
                      <strong>{journals.filter((j) => j.publish?.status === "published").length} 篇已同步公开</strong>
                    </div>
                  </div>
                </section>

              </div>
            </section>
          )}
        </div>
      </main>
      <nav className="mobile-navigation" aria-label="移动端页面导航">
        {mobileNavigation.map(({ page, mark, label }) => (
          <button
            className={activePage === page ? "active" : ""}
            type="button"
            key={page}
            aria-current={activePage === page ? "page" : undefined}
            onClick={() => {
              setActivePage(page);
              window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            }}
          >
            <span aria-hidden="true">{mark}</span>
            <strong>{label}</strong>
          </button>
        ))}
      </nav>
      {planPreview && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="plan-preview-title">
            <span className="dialog-kicker">变更预览</span><h2 id="plan-preview-title">确认调整学习计划？</h2>
            <p>{planPreview.message}，共影响 {Object.keys(planPreview.values).length} 个未完成小节。</p>
            <div className="plan-preview-list">
              {Object.entries(planPreview.values).map(([sectionId, nextDate]) => {
                const task = projectTasks.find(({ section }) => section.id === sectionId) ?? projectTaskEntries(activeArea === "408" ? "math" : "408").find(({ section }) => section.id === sectionId);
                const currentVal = progress[sectionId]?.[planPreview.field || "plannedAt"];
                return <article key={sectionId}><div><strong>{task ? `${task.book.shortTitle} · ${task.section.number} ${task.section.title}` : sectionId}</strong><span>{task?.chapterTitle ?? ""}</span></div><p><del>{currentVal ? formatDateShort(currentVal) : "未设置"}</del><i>→</i><b>{nextDate ? formatDateShort(nextDate) : "未设置"}</b></p></article>;
              })}
            </div>
            <div><button type="button" onClick={() => setPlanPreview(null)}>取消</button><button className="primary" type="button" onClick={() => { applyPlanChanges(planPreview.values, planPreview.message, planPreview.source, planPreview.field); setPlanPreview(null); setShiftSectionId(null); }}>确认应用</button></div>
          </div>
        </div>
      )}
      {pendingImport && pendingImportSummary && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <span className="dialog-kicker">导入检查通过</span><h2 id="import-title">用文件数据替换当前数据？</h2>
            <p>导入前会自动保留一份本地备份。云端与本机数据都会更新。</p>
            <dl className="import-summary">
              <div><dt>项目</dt><dd>{pendingImportSummary.projects}</dd></div>
              <div><dt>科目</dt><dd>{pendingImportSummary.subjects}</dd></div>
              <div><dt>小节</dt><dd>{pendingImportSummary.sections}</dd></div>
              <div><dt>计划历史</dt><dd>{pendingImportSummary.planHistory}</dd></div>
              <div><dt>学习日志</dt><dd>{pendingImportSummary.journals}</dd></div>
            </dl>
            <div><button type="button" onClick={() => setPendingImport(null)}>取消</button><button className="primary" type="button" onClick={() => void confirmImport()}>确认导入</button></div>
          </div>
        </div>
      )}
      {pendingRestore && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title">
            <span className="dialog-kicker">{backupKindLabel(pendingRestore.kind)} · {formatLocalDateTime(pendingRestore.createdAt)}</span><h2 id="restore-title">恢复这份备份？</h2>
            <p>恢复前也会自动备份当前数据，随后同步替换云端与本机记录。</p>
            <div><button type="button" onClick={() => setPendingRestore(null)}>取消</button><button className="primary" type="button" onClick={() => void confirmRestore()}>确认恢复</button></div>
          </div>
        </div>
      )}
      {pendingClearSectionId && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-progress-title">
            <h2 id="clear-progress-title">清除学习与复习记录？</h2>
            <p>该小节已经记录过复习。取消“新学”会同时清除复习记录。</p>
            <div><button type="button" onClick={() => setPendingClearSectionId(null)}>取消操作</button><button className="danger" type="button" onClick={() => { clearLearned(pendingClearSectionId); setPendingClearSectionId(null); }}>确认清除</button></div>
          </div>
        </div>
      )}

      {/* Journal Editor Modal */}
      {isEditorOpen && (
        <div className="confirm-overlay journal-editor-overlay" role="presentation">
          <div className="journal-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-editor-title">
            <header className="journal-editor-header">
              <div className="journal-editor-title-wrap">
                <span className="dialog-kicker">{editingJournalId ? "编辑记录" : "新建记录"}</span>
                <h2 id="journal-editor-title">{editingJournalId ? "编辑学习日志" : "写一条学习日志"}</h2>
              </div>
              <div className="journal-editor-view-modes">
                <div className="desktop-view-modes" role="group" aria-label="视图模式">
                  <button
                    type="button"
                    className={editorMode === "edit" ? "active" : ""}
                    onClick={() => setEditorMode("edit")}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className={editorMode === "split" ? "active" : ""}
                    onClick={() => setEditorMode("split")}
                  >
                    分栏
                  </button>
                  <button
                    type="button"
                    className={editorMode === "preview" ? "active" : ""}
                    onClick={() => setEditorMode("preview")}
                  >
                    预览
                  </button>
                </div>
                <div className="mobile-view-modes" role="group" aria-label="移动端视图">
                  <button
                    type="button"
                    className={editorMode !== "preview" ? "active" : ""}
                    onClick={() => setEditorMode("edit")}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className={editorMode === "preview" ? "active" : ""}
                    onClick={() => setEditorMode("preview")}
                  >
                    预览
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="journal-modal-close"
                onClick={() => {
                  setIsEditorOpen(false);
                  setEditingJournalId(null);
                }}
                aria-label="关闭编辑器"
              >
                ×
              </button>
            </header>

            <div className="journal-editor-meta-bar">
              <div className="journal-context-selector">
                <span className="meta-label">关联小节:</span>
                <select
                  value={editorContext?.type === "section" ? editorContext.sectionId : ""}
                  onChange={(e) => {
                    const secId = e.target.value;
                    if (!secId) {
                      setEditorContext(null);
                    } else {
                      const found = books
                        .flatMap((b) => b.chapters.flatMap((c) => c.sections.map((s) => ({ book: b, chapter: c, section: s }))))
                        .find((item) => item.section.id === secId);
                      if (found) {
                        setEditorContext({
                          type: "section",
                          area: found.book.area,
                          bookId: found.book.id,
                          sectionId: found.section.id,
                          bookTitle: found.book.shortTitle,
                          sectionTitle: found.section.title,
                          sectionNumber: found.section.number,
                        });
                      }
                    }
                  }}
                  aria-label="选择关联小节"
                >
                  <option value="">○ 不关联小节 (纯时间流随笔)</option>
                  <optgroup label="408 考研科目">
                    {books.filter((b) => b.area === "408").flatMap((b) =>
                      b.chapters.flatMap((c) =>
                        c.sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {b.shortTitle} · {s.number} {s.title}
                          </option>
                        ))
                      )
                    )}
                  </optgroup>
                  <optgroup label="数学科目">
                    {books.filter((b) => b.area === "math").flatMap((b) =>
                      b.chapters.flatMap((c) =>
                        c.sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {b.shortTitle} · {s.number} {s.title}
                          </option>
                        ))
                      )
                    )}
                  </optgroup>
                </select>
              </div>

              <div className="journal-title-field">
                {showTitleInput || editorTitle ? (
                  <div className="journal-title-input-wrap">
                    <input
                      type="text"
                      className="journal-title-input"
                      placeholder="输入日志标题 (可选)..."
                      value={editorTitle}
                      onChange={(e) => setEditorTitle(e.target.value)}
                    />
                    {!editorTitle && (
                      <button
                        type="button"
                        className="title-remove-btn"
                        onClick={() => setShowTitleInput(false)}
                      >
                        隐藏标题
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="journal-add-title-btn"
                    onClick={() => setShowTitleInput(true)}
                  >
                    + 添加标题 (可选)
                  </button>
                )}
              </div>
            </div>

            <div className={`journal-editor-body mode-${editorMode}`}>
              {(editorMode === "edit" || editorMode === "split") && (
                <div className="journal-editor-pane pane-input">
                  <textarea
                    className="journal-textarea"
                    placeholder="写下今天的学习心得、对定理/算法的理解或复盘体会...&#10;&#10;支持 Markdown 语法与 LaTeX 数学公式：&#10;- 行内公式：$O(n \log n)$ 或 $e^{i\pi} + 1 = 0$&#10;- 块级公式：$$\int_0^1 f(x)dx$$&#10;- 代码块：```cpp ... ```&#10;- 任务列表：- [ ] 待复习"
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    autoFocus
                  />
                  <div className="journal-editor-statusbar">
                    <span>{editorContent.length} 字</span>
                    <span className="math-hint">公式：`$行内$` 与 `$$块级$$`</span>
                  </div>
                </div>
              )}

              {(editorMode === "preview" || editorMode === "split") && (
                <div className="journal-editor-pane pane-preview">
                  <div className="preview-header">
                    <span className="preview-label">实时渲染预览</span>
                  </div>
                  <div className="preview-content-scroll">
                    {editorTitle && <h3 className="preview-journal-title">{editorTitle}</h3>}
                    {editorContent.trim() ? (
                      <MarkdownRenderer content={editorContent} />
                    ) : (
                      <p className="preview-empty-hint">在左侧输入 Markdown 内容即可在此实时预览。</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <footer className="journal-editor-footer">
              <div className="editor-footer-left">
                <span className="editor-shortcut-hint">支持 GFM 表格、Task List 与 KaTeX 公式</span>
              </div>
              <div className="editor-footer-actions">
                <button
                  type="button"
                  className="journal-btn journal-btn--ghost"
                  onClick={() => {
                    setIsEditorOpen(false);
                    setEditingJournalId(null);
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="journal-btn journal-btn--primary"
                  onClick={handleSaveJournal}
                >
                  {editingJournalId ? "保存修改" : "保存日志"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Blog Publish Modal */}
      {blogPublishJournal && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog confirm-dialog--wide blog-publish-dialog" role="dialog" aria-modal="true" aria-labelledby="blog-publish-title">
            <span className="dialog-kicker">GitHub Blog 一键发布 (V1.9)</span>
            <h2 id="blog-publish-title">发布到个人博客</h2>
            <p className="blog-publish-subtitle">
              发布稿与原日志独立解耦，发布前的润色或标题调整不会自动改写原学习日志。
            </p>

            {publishError && (
              <div className="publish-error-banner" role="alert">
                <span>⚠ {publishError}</span>
              </div>
            )}

            <div className="blog-publish-form">
              <label className="publish-form-field">
                <span className="field-label">文章标题 <strong>*</strong></span>
                <input
                  type="text"
                  className="publish-input"
                  placeholder="请输入面向公开发布的文章标题"
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  required
                />
              </label>

              <label className="publish-form-field">
                <span className="field-label">文章 Slug (URL 路径标识) <strong>*</strong></span>
                <input
                  type="text"
                  className="publish-input font-mono"
                  placeholder="例如: 20260814001 或 cpu-scheduling-summary"
                  value={publishSlug}
                  onChange={(e) => setPublishSlug(e.target.value)}
                  required
                />
              </label>

              <label className="publish-form-field">
                <span className="field-label">文章正文 (Markdown 格式) <strong>*</strong></span>
                <textarea
                  className="publish-textarea"
                  rows={8}
                  value={publishContent}
                  onChange={(e) => setPublishContent(e.target.value)}
                  placeholder="输入发布稿正文..."
                />
              </label>
            </div>

            <div className="confirm-actions">
              <button
                type="button"
                className="journal-btn journal-btn--ghost"
                onClick={() => setBlogPublishJournal(null)}
                disabled={isPublishing}
              >
                取消
              </button>
              <button
                type="button"
                className="journal-btn journal-btn--primary"
                onClick={handleBlogPublish}
                disabled={isPublishing}
              >
                {isPublishing ? "正在发布至 GitHub..." : "确认发布到 Blog"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteJournal && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-journal-title">
            <span className="dialog-kicker">删除日志</span>
            <h2 id="delete-journal-title">确定删除这条学习日志？</h2>
            <p>
              删除后该日志将从时间流和小节关联记录中移除。
              {pendingDeleteJournal.publish?.status === "published" && (
                <strong className="delete-publish-warning">
                  <br />注意：此日志已发布到 Blog，删除本地日志不会自动删除 GitHub 上的已发布文章。
                </strong>
              )}
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setPendingDeleteJournal(null)}>取消</button>
              <button className="danger" type="button" onClick={confirmDeleteJournal}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* Section Journal Drawer */}
      {activeDrawerSection && (
        <div className="drawer-overlay" role="presentation" onClick={() => setActiveDrawerSectionId(null)}>
          <aside
            className="section-journal-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-section-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-header">
              <div className="drawer-title-wrap">
                <span className="drawer-kicker">{activeDrawerSection.book.shortTitle} · 第 {activeDrawerSection.chapter.number} 章</span>
                <h3 id="drawer-section-title">{activeDrawerSection.section.number} {activeDrawerSection.section.title}</h3>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setActiveDrawerSectionId(null)}
                aria-label="关闭抽屉"
              >
                ×
              </button>
            </header>

            <div className="drawer-action-row">
              <button
                type="button"
                className="journal-action-btn journal-action-btn--primary drawer-write-btn"
                onClick={() => {
                  openCreateJournal({
                    type: "section",
                    area: activeDrawerSection.book.area,
                    bookId: activeDrawerSection.book.id,
                    sectionId: activeDrawerSection.section.id,
                    bookTitle: activeDrawerSection.book.shortTitle,
                    sectionTitle: activeDrawerSection.section.title,
                    sectionNumber: activeDrawerSection.section.number,
                  });
                }}
              >
                + 为本小节写记录
              </button>
            </div>

            <div className="drawer-body">
              {journalsBySection[activeDrawerSection.section.id]?.length ? (
                <div className="drawer-journals-list">
                  {journalsBySection[activeDrawerSection.section.id].map((entry) => (
                    <article className="drawer-journal-card" key={entry.id}>
                      <div className="drawer-card-meta">
                        <span className="drawer-date-tag">{formatDateChinese(entry.createdAt.slice(0, 10))} {formatTimeShort(entry.createdAt)}</span>
                        <div className="drawer-card-tools">
                          <button type="button" onClick={() => openEditJournal(entry)}>编辑</button>
                          <button type="button" onClick={() => openBlogPublishModal(entry)}>发布</button>
                          <button type="button" className="text-danger" onClick={() => handleDeleteJournal(entry)}>删除</button>
                        </div>
                      </div>
                      {entry.title && <h4 className="drawer-card-title">{entry.title}</h4>}
                      <div className="drawer-card-content">
                        <MarkdownRenderer content={entry.content} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="drawer-empty-state">
                  <p>本小节暂无关联学习日志。</p>
                  <p className="drawer-empty-sub">在学习本节时记录下的思路、错题原因或关键结论将归档于此。</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
