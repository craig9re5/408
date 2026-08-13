"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { books, type Book, type Section, type StudyArea } from "./data/books";
import {
  APP_VERSION,
  SCHEMA_VERSION,
  StorageRepository,
  calculateRecentStreak,
  createAppData,
  defaultProjectSettings,
  isOverdueTask,
  isTodayPlan,
  isUnreviewedTask,
  normalizeAppData,
  summarizeImport,
  type LocalBackup,
  type PlanChangeSource,
  type PlanHistoryEntry,
  type ProgressMap,
  type ProjectSettings,
  type SectionProgress,
  type StorageLoadIssue,
  type StudyAppData,
} from "./study-data";

type AuthState = "locked" | "authenticated";
type SyncStatus = "loading" | "saving" | "saved" | "offline" | "error";
type StudyPlanStatus = "completed" | "overdue" | "due_today" | "upcoming" | "unscheduled";
type CatalogFilter = "all" | "unlearned" | "unreviewed" | "overdue";
type ShiftScope = "chapter" | "subject";
type AppPage = "progress" | "today" | "analytics" | "settings";

type PlanUndo = {
  message: string;
  values: Record<string, string>;
};

type PlanPreview = {
  message: string;
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

function dateToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
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

function formatPlanRange(plannedDates: string[]): string {
  const dates = plannedDates
    .filter((date): date is string => Boolean(date))
    .sort();
  if (!dates.length) return "计划未设置";
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return `计划：${formatDateChinese(first)}`;
  return `计划：${formatDateChinese(first)}—${formatDateChinese(last)}`;
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

function studyPlanStatus(state: SectionProgress | undefined): StudyPlanStatus {
  if (state?.learned) return "completed";
  if (!state?.plannedAt) return "unscheduled";
  const today = dateToday();
  if (state.plannedAt < today) return "overdue";
  if (state.plannedAt === today) return "due_today";
  return "upcoming";
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

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
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
    const learned = Boolean(value.learned);
    const learnedAt = typeof value.learnedAt === "string" ? value.learnedAt : "";
    const candidateReviewedAt = typeof value.reviewedAt === "string" ? value.reviewedAt : "";
    const reviewed = learned && Boolean(value.reviewed) && Boolean(candidateReviewedAt) && (!learnedAt || candidateReviewedAt >= learnedAt);
    merged[sectionId] = {
      ...merged[sectionId],
      learned,
      learnedAt,
      reviewed,
      reviewedAt: reviewed ? candidateReviewedAt : "",
      plannedAt: typeof value.plannedAt === "string" ? value.plannedAt : merged[sectionId].plannedAt,
      isCurrent: Boolean(value.isCurrent),
    };
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
  const [chapterRanges, setChapterRanges] = useState<Record<string, { start: string; end: string; includeCompleted: boolean }>>({});
  const [shiftSectionId, setShiftSectionId] = useState<string | null>(null);
  const [shiftScope, setShiftScope] = useState<ShiftScope>("chapter");
  const [shiftDays, setShiftDays] = useState(1);
  const [planUndo, setPlanUndo] = useState<PlanUndo | null>(null);
  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [pendingClearSectionId, setPendingClearSectionId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<StudyAppData | null>(null);
  const [pendingRestore, setPendingRestore] = useState<LocalBackup | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [storageLoadIssue, setStorageLoadIssue] = useState<StorageLoadIssue | null>(null);
  const [scrollTargetSectionId, setScrollTargetSectionId] = useState<string | null>(null);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  const repositoryRef = useRef<StorageRepository | null>(null);

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
    setProgress(mergeRemoteProgress(remoteProgress, base));
    setProjectSettings(body.projectSettings ?? local?.projectSettings ?? defaultProjectSettings());
    setPlanHistory(body.planHistory ?? local?.planHistory ?? []);
    setBackups(repository().backups());
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
    const appData = createAppData(progress, projectSettings, planHistory);
    repository().save(appData);

    const timer = window.setTimeout(async () => {
      setSyncStatus("saving");
      try {
        const response = await fetch("/api/app-data", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(appData),
        });
        if (response.status === 401) {
          setAuthState("locked");
          setLoaded(false);
          return;
        }
        if (!response.ok) throw new Error("progress-save-failed");
        setSyncStatus("saved");
      } catch {
        setSyncStatus("offline");
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [authState, loaded, planHistory, progress, projectSettings, repository]);

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
  const activeProgressLabel = isReviewPhase ? "复习" : "第一轮";
  const manualCurrentSection = selectedSections.find((section) => progress[section.id]?.isCurrent && !progress[section.id]?.learned);
  const currentSection = isReviewPhase
    ? selectedSections.find((section) => !progress[section.id]?.reviewed)
    : manualCurrentSection ?? selectedSections.find((section) => !progress[section.id]?.learned);
  const currentSectionLabel = isReviewPhase ? "当前复习" : "当前学习";
  const phaseCompleteLabel = isReviewPhase ? "复习已完成" : "第一轮已完成";
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
  const todayPlan = todayTasks.filter(({ section }) => isTodayPlan(progress[section.id], today));
  const overdueTasks = todayTasks
    .filter(({ section }) => isOverdueTask(progress[section.id], today))
    .sort((left, right) => (progress[left.section.id]?.plannedAt ?? "").localeCompare(progress[right.section.id]?.plannedAt ?? ""));
  const allFirstRoundComplete = todayTasks.every(({ section }) => progress[section.id]?.learned);
  const unreviewedTasks = todayTasks
    .filter(({ section }) => isUnreviewedTask(progress[section.id], today))
    .sort((left, right) => (progress[left.section.id]?.learnedAt ?? "").localeCompare(progress[right.section.id]?.learnedAt ?? ""));
  const todayCompleted = todayPlan.filter(({ section }) => progress[section.id]?.learned).length;

  const examDate = activePage === "today"
    ? [projectSettings["408"].examDate, projectSettings.math.examDate].sort()[0]
    : projectSettings[activeArea].examDate;
  const daysUntilExam = useMemo(() => calculateDaysUntilExam(examDate), [examDate]);
  const timeProgressPercent = useMemo(() => calculateTimeProgress(examDate), [examDate]);
  const streakDays = calculateRecentStreak(progress, today);
  const weekDots = useMemo(() => getWeekDaysActivity(progress), [progress]);
  const weeklySectionCount = useMemo(() => calculateWeeklySectionCount(progress), [progress]);

  function updateProgress(sectionId: string, next: Partial<SectionProgress>) {
    setProgress((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], ...next },
    }));
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

  function setCurrentSection(sectionId: string) {
    setProgress((current) => {
      const next = { ...current };
      selectedSections.forEach((section) => {
        next[section.id] = { ...next[section.id], isCurrent: section.id === sectionId };
      });
      return next;
    });
    setFeedbackMessage("已设为当前学习");
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
    if (checked && !progress[sectionId]?.learned) return;
    updateProgress(sectionId, {
      reviewed: checked,
      reviewedAt: checked ? dateToday() : "",
    });
  }

  function applyPlanChanges(values: Record<string, string>, message: string, source: PlanChangeSource) {
    const ids = Object.keys(values);
    if (!ids.length) {
      setFeedbackMessage("没有符合条件的计划日期可调整");
      return;
    }
    const previous = Object.fromEntries(ids.map((sectionId) => [sectionId, progress[sectionId]?.plannedAt ?? ""]));
    const changedAt = new Date().toISOString();
    setProgress((current) => {
      const next = { ...current };
      ids.forEach((sectionId) => {
        next[sectionId] = { ...next[sectionId], plannedAt: values[sectionId] };
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
    setPlanUndo({ message, values: previous });
    setFeedbackMessage("");
  }

  function previewPlanChanges(values: Record<string, string>, message: string, source: PlanPreview["source"]) {
    const changedValues = Object.fromEntries(Object.entries(values).filter(([sectionId, plannedAt]) => (
      (progress[sectionId]?.plannedAt ?? "") !== plannedAt
    )));
    if (!Object.keys(changedValues).length) {
      setFeedbackMessage("没有符合条件的计划日期可调整");
      return;
    }
    setPlanPreview({ values: changedValues, message, source });
  }

  function undoPlanChange() {
    if (!planUndo) return;
    const changedAt = new Date().toISOString();
    setProgress((current) => {
      const next = { ...current };
      Object.entries(planUndo.values).forEach(([sectionId, plannedAt]) => {
        next[sectionId] = { ...next[sectionId], plannedAt };
      });
      return next;
    });
    setPlanHistory((current) => [...current, ...Object.entries(planUndo.values).map(([sectionId, plannedAt]) => ({
      id: crypto.randomUUID(),
      sectionId,
      from: progress[sectionId]?.plannedAt ?? "",
      to: plannedAt,
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
  ) {
    if (!range.start || (mode === "spread" && !range.end)) {
      setFeedbackMessage("请先设置完整的计划日期或区间");
      return;
    }
    if (mode === "spread" && range.end < range.start) {
      setFeedbackMessage("计划结束日期不能早于开始日期");
      return;
    }
    const eligible = sections.filter((section) => range.includeCompleted || !progress[section.id]?.learned);
    const targets = eligible;
    const values: Record<string, string> = {};
    if (mode === "uniform") {
      targets.forEach((section) => { values[section.id] = range.start; });
    } else {
      const start = new Date(`${range.start}T00:00:00`).getTime();
      const end = new Date(`${range.end}T00:00:00`).getTime();
      const dayCount = Math.floor((end - start) / 86_400_000) + 1;
      targets.forEach((section, index) => {
        const offset = Math.floor((index * dayCount) / Math.max(targets.length, 1));
        values[section.id] = addDays(range.start, Math.min(offset, dayCount - 1));
      });
    }
    previewPlanChanges(
      values,
      mode === "uniform" ? "已统一设置章节计划" : "已按天均分章节计划",
      "batchSchedule",
    );
  }

  function shiftPlans(startSectionId: string, scope: ShiftScope, days: number) {
    if (!Number.isInteger(days) || days === 0) {
      setFeedbackMessage("移动天数必须是非零整数");
      return;
    }
    const chapter = selectedBook.chapters.find((item) => item.sections.some((section) => section.id === startSectionId));
    const source = scope === "chapter" ? chapter?.sections ?? [] : selectedSections;
    const startIndex = source.findIndex((section) => section.id === startSectionId);
    const values: Record<string, string> = {};
    source.slice(Math.max(startIndex, 0)).forEach((section) => {
      const state = progress[section.id];
      if (state?.plannedAt && !state.learned) values[section.id] = addDays(state.plannedAt, days);
    });
    previewPlanChanges(values, `已将后续计划${days > 0 ? "后移" : "前移"} ${Math.abs(days)} 天`, "shift");
    setShiftSectionId(null);
  }

  function currentAppData(): StudyAppData {
    return createAppData(progress, projectSettings, planHistory);
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
    setFeedbackMessage("已导出全部学习数据");
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
    repository().save(restored);
    setBackups(repository().backups());
    setPendingRestore(null);
    setFeedbackMessage("备份恢复完成，已保留恢复前备份");
  }

  function updateExamDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setProjectSettings((current) => ({ ...current, [activeArea]: { examDate: value } }));
  }

  function renderTaskList(
    tasks: TaskEntry[],
    kind: "today" | "overdue" | "unreviewed",
    emptyMessage: string,
  ) {
    if (!tasks.length) return <p className="task-empty">{emptyMessage}</p>;
    return (
      <div className="task-list">
        {tasks.map(({ book, chapterTitle, section }) => {
          const state = progress[section.id];
          const checked = kind === "unreviewed" ? state?.reviewed : state?.learned;
          return (
            <article className={`task-row${checked ? " completed" : ""}`} key={`${kind}-${section.id}`}>
              <div className="task-context"><strong>{book.shortTitle}</strong><span>{chapterTitle}</span></div>
              <div className="task-title"><span>{section.number}</span><strong>{section.title}</strong></div>
              <span className={`task-date ${kind}`}>
                {kind === "today"
                  ? state?.learned ? `完成 ${formatDateShort(state.learnedAt)}` : "计划今天"
                  : kind === "overdue"
                    ? `原计划 ${formatDateShort(state?.plannedAt ?? "")}`
                    : `学完 ${formatDateShort(state?.learnedAt ?? "")}`}
              </span>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  onChange={(event) => kind === "unreviewed"
                    ? toggleReviewed(section.id, event.target.checked)
                    : toggleLearned(section.id, event.target.checked)}
                />
                <span />
                <em>{kind === "unreviewed" ? "复习" : "学完"}</em>
              </label>
            </article>
          );
        })}
      </div>
    );
  }

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
          <strong>学习进度</strong>
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
          {([
            ["progress", "学习进度"],
            ["today", "今日"],
            ["analytics", "数据分析"],
          ] as [AppPage, string][]).map(([page, label]) => (
            <button
              className={activePage === page ? "active" : ""}
              type="button"
              key={page}
              aria-current={activePage === page ? "page" : undefined}
              onClick={() => setActivePage(page)}
            >
              <i aria-hidden="true" />{label}
            </button>
          ))}
        </nav>

        {activePage === "progress" && <nav className="subject-progress" aria-label={`切换${activeArea === "408" ? "408" : "数学"}科目`}>
          <h2>{activeArea === "408" ? "408 科目" : "数学科目"}</h2>
          {areaBooks.map((book) => {
            const sections = allSections(book);
            const stage = progressStage(sections, progress);
            const phaseLabel = stage.phase === "reviewed" ? "复习" : "第一轮";
            const shortPhaseLabel = stage.phase === "reviewed" ? "复习" : "一轮";
            return (
              <button
                className={book.id === selectedBook.id ? "current" : ""}
                type="button"
                key={book.id}
                aria-current={book.id === selectedBook.id ? "page" : undefined}
                aria-label={`切换到${book.title}，当前${phaseLabel}进度 ${stage.percentage}%`}
                title={book.title}
                onClick={() => {
                  setSelectedBookByArea((current) => ({ ...current, [activeArea]: book.id }));
                  setExpandedChapters([]);
                  setCatalogFilter("all");
                }}
              >
                <span>{book.shortTitle}</span>
                <strong><em>{shortPhaseLabel}</em><small>{stage.percentage}%</small></strong>
                <i><b style={{ width: `${stage.percentage}%` }} /></i>
              </button>
            );
          })}
        </nav>}

        <div className="sidebar-footer">
          <button className={`settings-navigation${activePage === "settings" ? " active" : ""}`} type="button" onClick={() => setActivePage("settings")}><i aria-hidden="true" />设置</button>
          <p className="storage-note"><i className={syncStatus === "saved" ? "synced" : ""} />{syncStatus === "saved" ? "进度已同步" : syncStatus === "saving" ? "正在同步…" : "等待同步"}</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <span />
          <div className="topbar-actions">
            {activePage !== "today" && <div className="area-switcher" role="group" aria-label="切换学习领域">
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
            </div>}
            <span className={`sync-label ${syncStatus}`}>{syncStatus === "saved" ? "已同步" : syncStatus === "saving" ? "同步中" : syncStatus === "offline" ? "待重试" : ""}</span>
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
                  {isReviewPhase ? (reviewedCount === selectedSections.length ? "全部完成" : "复习中") : "进行中"}
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
                  学完 <strong>{learnedCount}/{selectedSections.length}</strong> 小节，复习 <strong>{reviewedCount}/{selectedSections.length}</strong> 小节
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

              <div className="rhythm-metrics" aria-label={`本周连续学习 ${streakDays} 天，完成 ${weeklySectionCount} 小节`}>
                <div className="rhythm-metric">
                  <strong>{streakDays}</strong><span>天连续</span>
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
                    ["unlearned", "未学完"],
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
                const plannedDates = chapter.sections.map((section) => progress[section.id]?.plannedAt ?? "").filter(Boolean).sort();
                const learnedCompletedAt = chapterCompletionDate(chapter.sections, progress, "learned");
                const reviewedCompletedAt = chapterCompletionDate(chapter.sections, progress, "reviewed");
                const range = chapterRanges[chapter.id] ?? {
                  start: plannedDates[0] ?? "",
                  end: plannedDates[plannedDates.length - 1] ?? plannedDates[0] ?? "",
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
                          <em>{formatPlanRange(chapter.sections.map((section) => progress[section.id]?.plannedAt ?? ""))}</em>
                          {(learnedCompletedAt || reviewedCompletedAt) && (
                            <span className="chapter-completion-dates">
                              {learnedCompletedAt && <span className="chapter-completion-date learned">第一轮 {formatDateChinese(learnedCompletedAt)}</span>}
                              {reviewedCompletedAt && <span className="chapter-completion-date reviewed">复习 {formatDateChinese(reviewedCompletedAt)}</span>}
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
                          <span>计划区间</span>
                          <input type="date" value={range.start} aria-label={`${chapter.title}计划开始日期`} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, start: event.target.value } }))} />
                          <b>—</b>
                          <input type="date" value={range.end} aria-label={`${chapter.title}计划结束日期`} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, end: event.target.value } }))} />
                          <label><input type="checkbox" checked={range.includeCompleted} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, includeCompleted: event.target.checked } }))} />包含已完成项</label>
                          <button type="button" onClick={() => setChapterPlan(chapter.sections, range, "uniform")}>统一日期</button>
                          <button type="button" onClick={() => setChapterPlan(chapter.sections, range, "spread")}>按天均分</button>
                        </div>
                      )}
                      <div className={`section-table${planEditMode ? " editing" : ""}`}>
                        <div className="section-head" aria-hidden="true">
                          <span>小节</span><span>计划</span><span>学完</span><span>复习</span>
                        </div>
                        {visibleSections.map((section) => {
                          const state = progress[section.id];
                          const status = studyPlanStatus(state);
                          const isCurrent = currentSection?.id === section.id;
                          return (
                            <div
                              className={`section-row ${status}${isCurrent ? " is-current" : ""}`}
                              id={`section-${section.id}`}
                              aria-current={isCurrent ? "step" : undefined}
                              key={section.id}
                            >
                              <div className="section-name">
                                <span>{section.number}</span><strong>{section.title}</strong>
                                {isCurrent && <i title="当前学习" />}
                                {!state?.learned && !isCurrent && <button type="button" onClick={() => setCurrentSection(section.id)}>设为当前</button>}
                              </div>
                              {planEditMode ? (
                                <input className="inline-plan-input" type="date" value={state?.plannedAt ?? ""} aria-label={`${section.number} 计划日期`} onChange={(event) => updatePlannedAt(section.id, event.target.value)} />
                              ) : (
                                <EditableDate
                                  value={state?.plannedAt ?? ""}
                                  emptyLabel="未设置"
                                  tone={planTone(status)}
                                  ariaLabel={`${section.number} 计划日期`}
                                  onChange={(value) => updatePlannedAt(section.id, value)}
                                />
                              )}
                              <div className="check-with-date">
                                <label aria-label={`${section.number} 学完`}><input type="checkbox" checked={state?.learned ?? false} onChange={(event) => toggleLearned(section.id, event.target.checked)} /><span /></label>
                                {state?.learned && <EditableDate value={state.learnedAt} emptyLabel="未记录" ariaLabel={`${section.number} 学完日期`} validate={(value) => state.reviewedAt && value > state.reviewedAt ? "学完日期不能晚于复习日期" : null} onError={setFeedbackMessage} onChange={(value) => updateProgress(section.id, { learnedAt: value })} />}
                              </div>
                              <div className="check-with-date">
                                <label aria-label={`${section.number} 复习`} title={!state?.learned ? "学完后可标记复习" : undefined}><input type="checkbox" checked={state?.reviewed ?? false} disabled={!state?.learned} onChange={(event) => toggleReviewed(section.id, event.target.checked)} /><span /></label>
                                {state?.reviewed && <EditableDate value={state.reviewedAt} emptyLabel="未记录" ariaLabel={`${section.number} 复习日期`} validate={(value) => state.learnedAt && value < state.learnedAt ? "复习日期不能早于学完日期" : null} onError={setFeedbackMessage} onChange={(value) => updateProgress(section.id, { reviewedAt: value })} />}
                              </div>
                              {planEditMode && (
                                <div className="shift-anchor">
                                  <button type="button" onClick={() => setShiftSectionId(shiftSectionId === section.id ? null : section.id)}>移动</button>
                                  {shiftSectionId === section.id && (
                                    <div className="shift-popover">
                                      <select value={shiftScope} onChange={(event) => setShiftScope(event.target.value as ShiftScope)} aria-label="移动范围"><option value="chapter">本章后续</option><option value="subject">本科目后续</option></select>
                                      {[-3, -2, -1, 1, 2, 3].map((days) => <button type="button" key={days} onClick={() => shiftPlans(section.id, shiftScope, days)}>{days > 0 ? "+" : ""}{days}天</button>)}
                                      <input type="number" value={shiftDays} onChange={(event) => setShiftDays(Number(event.target.value))} aria-label="自定义移动天数" />
                                      <button type="button" disabled={!Number.isInteger(shiftDays) || shiftDays === 0} onClick={() => shiftPlans(section.id, shiftScope, shiftDays)}>确定</button>
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
              <header className="page-heading">
                <div><span className="page-kicker">TODAY</span><h1 id="today-title">今日</h1></div>
                <p>{formatDateChinese(today)}</p>
              </header>

              <div className="summary-strip" aria-label="今日任务概览">
                <article><span>今日计划</span><strong>{todayPlan.length}</strong><small>{todayCompleted} 项已完成</small></article>
                <article><span>逾期未学</span><strong>{overdueTasks.length}</strong><small>按原计划日期排序</small></article>
              </div>

              <div className="today-sections">
                <section className="task-panel task-panel--today" aria-labelledby="today-plan-title">
                  <header><div><span>01</span><h2 id="today-plan-title">今日计划</h2></div><strong>{todayCompleted}/{todayPlan.length}</strong></header>
                  {renderTaskList(todayPlan, "today", "今天没有安排小节，完成的今日任务也会保留在这里。")}
                </section>
                <section className="task-panel task-panel--overdue" aria-labelledby="overdue-title">
                  <header><div><span>02</span><h2 id="overdue-title">逾期</h2></div><strong>{overdueTasks.length}</strong></header>
                  {renderTaskList(overdueTasks, "overdue", "没有逾期任务，节奏保持得很好。")}
                </section>
                {allFirstRoundComplete && <section className="task-panel task-panel--review" aria-labelledby="unreviewed-title">
                  <header><div><span>03</span><h2 id="unreviewed-title">未复习</h2></div><strong>{unreviewedTasks.length}</strong></header>
                  {renderTaskList(unreviewedTasks, "unreviewed", "没有积压的复习任务。")}
                </section>}
              </div>
            </section>
          ) : activePage === "analytics" ? (
            <section className="page-view placeholder-page" aria-labelledby="analytics-title">
              <header className="page-heading"><div><h1 id="analytics-title">数据分析</h1></div><p>当前项目：{activeArea === "408" ? "408" : "数学"}</p></header>
              <article className="placeholder-card">
                <span aria-hidden="true">↗</span>
                <div><h2>分析视图正在整理</h2><p>这里会承接长期趋势与阶段复盘。本版本先保留入口，不用不可靠的预测填满页面。</p></div>
              </article>
            </section>
          ) : (
            <section className="page-view settings-page" aria-labelledby="settings-title">
              <header className="page-heading">
                <div><h1 id="settings-title">设置</h1></div>
                <p>当前项目：{activeArea === "408" ? "408" : "数学"}</p>
              </header>

              <div className="settings-grid">
                <section className="settings-card settings-card--project">
                  <header><span>项目</span><h2>{activeArea === "408" ? "408" : "数学"} 考试日期</h2></header>
                  <p>倒计时和左侧时间进度会随当前项目独立计算。</p>
                  <label className="settings-date"><span>考试日期</span><input type="date" value={examDate} onChange={(event) => updateExamDate(event.target.value)} /></label>
                  <dl><div><dt>包含科目</dt><dd>{books.filter((book) => book.area === activeArea).length} 门</dd></div><div><dt>距离考试</dt><dd>{daysUntilExam} 天</dd></div><div><dt>时间进度</dt><dd>{timeProgressPercent}%</dd></div></dl>
                </section>

                <section className="settings-card">
                  <header><span>数据</span><h2>导出与导入</h2></header>
                  <p>JSON 包含两个项目的学习记录、计划、设置与操作历史。</p>
                  <div className="settings-actions"><button type="button" onClick={downloadExport}>导出全部数据</button><button type="button" onClick={() => importInputRef.current?.click()}>导入 JSON</button></div>
                  {storageLoadIssue && <button className="recovery-export" type="button" onClick={downloadRecoveryData}>导出无法迁移的原始数据</button>}
                  <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={readImportFile} />
                </section>

                <section className="settings-card settings-card--backups">
                  <header><span>恢复</span><h2>本地备份</h2></header>
                  <p>最多保留 15 份；导入、恢复和旧数据迁移前会自动创建。本地备份用于防误操作，清除浏览器站点数据时也会丢失；请用 JSON 导出做外部备份。</p>
                  <button className="backup-create" type="button" onClick={createManualBackup}>立即创建备份</button>
                  <div className="backup-list">
                    {backups.length ? backups.map((backup) => (
                      <article key={backup.id}><div><strong>{backupKindLabel(backup.kind)}</strong><span>{formatLocalDateTime(backup.createdAt)}</span></div><button type="button" onClick={() => setPendingRestore(backup)}>恢复</button></article>
                    )) : <p>还没有本地备份。</p>}
                  </div>
                </section>

                <section className="settings-card settings-card--about">
                  <header><span>关于</span><h2>Study Dashboard</h2></header>
                  <dl><div><dt>应用版本</dt><dd>{APP_VERSION}</dd></div><div><dt>数据结构</dt><dd>Schema v{SCHEMA_VERSION}</dd></div><div><dt>计划历史</dt><dd>{planHistory.length} 条</dd></div></dl>
                </section>
              </div>
            </section>
          )}
        </div>
      </main>
      {planPreview && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="plan-preview-title">
            <span className="dialog-kicker">变更预览</span><h2 id="plan-preview-title">确认调整学习计划？</h2>
            <p>{planPreview.message}，共影响 {Object.keys(planPreview.values).length} 个未完成小节。</p>
            <div className="plan-preview-list">
              {Object.entries(planPreview.values).map(([sectionId, nextDate]) => {
                const task = projectTasks.find(({ section }) => section.id === sectionId) ?? projectTaskEntries(activeArea === "408" ? "math" : "408").find(({ section }) => section.id === sectionId);
                return <article key={sectionId}><div><strong>{task ? `${task.book.shortTitle} · ${task.section.number} ${task.section.title}` : sectionId}</strong><span>{task?.chapterTitle ?? ""}</span></div><p><del>{progress[sectionId]?.plannedAt ? formatDateShort(progress[sectionId].plannedAt) : "未设置"}</del><i>→</i><b>{nextDate ? formatDateShort(nextDate) : "未设置"}</b></p></article>;
              })}
            </div>
            <div><button type="button" onClick={() => setPlanPreview(null)}>取消</button><button className="primary" type="button" onClick={() => { applyPlanChanges(planPreview.values, planPreview.message, planPreview.source); setPlanPreview(null); setShiftSectionId(null); }}>确认应用</button></div>
          </div>
        </div>
      )}
      {pendingImport && pendingImportSummary && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <span className="dialog-kicker">导入检查通过</span><h2 id="import-title">用文件数据替换当前数据？</h2>
            <p>导入前会自动保留一份本地备份。云端与本机数据都会更新。</p>
            <dl className="import-summary"><div><dt>项目</dt><dd>{pendingImportSummary.projects}</dd></div><div><dt>科目</dt><dd>{pendingImportSummary.subjects}</dd></div><div><dt>小节</dt><dd>{pendingImportSummary.sections}</dd></div><div><dt>计划历史</dt><dd>{pendingImportSummary.planHistory}</dd></div></dl>
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
            <p>该小节已经记录过复习。取消“学完”会同时清除复习记录。</p>
            <div><button type="button" onClick={() => setPendingClearSectionId(null)}>取消操作</button><button className="danger" type="button" onClick={() => { clearLearned(pendingClearSectionId); setPendingClearSectionId(null); }}>确认清除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
