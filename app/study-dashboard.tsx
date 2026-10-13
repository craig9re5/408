"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { books, type Book, type Chapter, type Section, type StudyArea } from "./data/books";
import { SHOW_DATA_ANALYSIS } from "./feature-flags";
import { JournalActions } from "./components/journal/JournalActions";
import {
  buildChapterReviewAnalyticsProgress,
  cancelChapterReview,
  chapterReviewPlanStatus,
  completeChapterReview,
  migrateLegacyChapterReviews,
  setChapterReviewPlan,
  summarizeChapterReview,
} from "./chapter-review";
import { MarkdownRenderer, getMarkdownSummary } from "./components/markdown-renderer";
import { PaperCard } from "./components/sprint/PaperCard";
import { AnalyticsActivity } from "./components/AnalyticsActivity";
import { EditableDate } from "./components/common/EditableDate";
import { ScheduleView } from "./components/schedule/ScheduleView";
import { TodayScheduleBanner } from "./components/schedule/TodayScheduleBanner";
import { useScheduleTicker } from "./components/schedule/useScheduleTicker";
import { TimetableGrid } from "./components/schedule/TimetableGrid";
import { TodayDaySchedule } from "./components/schedule/TodayDaySchedule";
const AnswerSheetModal = lazy(() => import("./components/sprint/AnswerSheetModal").then((module) => ({ default: module.AnswerSheetModal })));
const JournalEditorModal = lazy(() => import("./components/journal/JournalEditorModal").then((module) => ({ default: module.JournalEditorModal })));
const PaperNetdiskModal = lazy(() => import("./components/papers/PaperNetdiskModal").then((module) => ({ default: module.PaperNetdiskModal })));
import {
  APP_VERSION,
  StorageRepository,
  addCalendarDays,
  buildChapterPlanChanges,
  calculateActivityHeatmap,
  calculateMaxStreak,
  calculateVelocityAndForecast,
  calculateWeekNumber,
  calculateWeeklyTrends,
  createAppData,
  createAppDataPatch,
  createBlankProgress,
  dateToday,
  buildDefaultProgress,
  defaultProjectSettings,
  extractJournalSections,
  generateUniqueJournalId,
  mergeJournals,
  isOverdueBaseTask,
  isTodayBasePlan,
  normalizeAppData,
  rebaseAppData,
  resolveRecentBookByArea,
  resolveGlobalRecentTarget,
  loadLastViewedStudyState,
  saveLastViewedStudyState,
  normalizeSectionProgress,
  summarizeImport,
  defaultPastPapers,
  normalizePapers,
  mergePapers,
  buildDefaultSchedule,
  normalizeSchedule,
  maxPaperScore,
  clampPaperScore,
  answerSheetScore,
  syncAnswerSheetScore,
  parseQuestionRanges,
  paperTotalQuestions,
  paperMaxChoiceNum,
  choiceQuestionWeight,
  choiceFullScore,
  bentoChoiceGroups,
  modalChoiceGroups,
  MOCK_MILESTONE_TARGET,
  MOCK_MILESTONES,
  MATH_PAPER_STRUCTURE,
  CS408_PAPER_STRUCTURE,
  ENGLISH_PAPER_STRUCTURE,
  type ForecastHealth,
  type JournalContext,
  type JournalEntry,
  type JournalPaperContext,
  type JournalPublish,
  type JournalSectionItem,
  type LocalBackup,
  type PaperKind,
  type PaperRecord,
  type QuestionState,
  type QuestionGroupDef,
  type PlanChangeSource,
  type PlanHistoryEntry,
  type ProgressMap,
  type ProjectSettings,
  type SectionProgress,
  type StorageLoadIssue,
  type StudyAppData,
  type ScheduleAppData,
  type ScheduleEvent,
  type VelocityForecast,
} from "./study-data";

type AuthState = "locked" | "authenticated";
type SyncStatus = "loading" | "saving" | "saved" | "offline" | "error";
type StudyPlanStatus = "completed" | "overdue" | "due_today" | "upcoming" | "unscheduled";
type CatalogFilter = "all" | "unlearned" | "unreviewed" | "overdue";
type ShiftScope = "chapter" | "subject";
type AppPage = "progress" | "sprint" | "today" | "schedule" | "analytics" | "settings";
type NavigationIcon = "progress" | "sprint" | "today" | "schedule" | "analytics" | "settings";
type JournalFilter = "all" | "important" | "unlinked" | "linked" | "408" | "math" | "published";

const pageNavigation: { page: AppPage; icon: NavigationIcon; label: string }[] = [
  { page: "progress", icon: "progress", label: "学习进度" },
  { page: "sprint", icon: "sprint", label: "套卷冲刺" },
  { page: "today", icon: "today", label: "今日" },
  { page: "schedule", icon: "schedule", label: "复习课表" },
];

const pageTitles: Record<AppPage, string> = {
  progress: "学习进度",
  sprint: "套卷冲刺",
  today: "今日",
  schedule: "复习课表",
  analytics: "数据分析",
  settings: "设置",
};

const mobileNavigation: { page: AppPage; label: string }[] = [
  { page: "progress", label: "进度" },
  { page: "sprint", label: "冲刺" },
  { page: "today", label: "今日" },
  { page: "schedule", label: "课表" },
];

const sprintAreaLabels: Record<StudyArea, string> = {
  "408": "408",
  math: "数学",
  english: "英语",
  politics: "政治",
};

function MobileNavIcon({ page }: { page: AppPage }) {
  const paths: Record<AppPage, React.ReactNode> = {
    progress: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="m15 18 2 2 4-5" /></>,
    sprint: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    today: <><path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></>,
    schedule: <><path d="M3 5h18v15H3zM3 9h18M9 9v11M15 9v11" /></>,
    analytics: <><path d="M4 20h16M7 17v-5M12 17V7M17 17v-9" /></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
  };

  return <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[page]}</svg>;
}

function SubjectPicker({ selectedBook, onChange, className = "" }: { selectedBook: Book; onChange: (bookId: string) => void; className?: string }) {
  return (
    <label className={`book-select${className ? ` ${className}` : ""}`}>
      <span className="visually-hidden">切换学科</span>
      <span className="book-select__surface" aria-hidden="true">
        <strong>{selectedBook.title}</strong>
        <svg viewBox="0 0 16 16" fill="none"><path d="m4.5 6 3.5 3.5L11.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <select value={selectedBook.id} onChange={(event) => onChange(event.target.value)}>
        <optgroup label="408">
          {books.filter((book) => book.area === "408").map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}
        </optgroup>
        <optgroup label="数学">
          {books.filter((book) => book.area === "math").map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}
        </optgroup>
      </select>
    </label>
  );
}

function SprintAreaPicker({ activeArea, onChange }: { activeArea: StudyArea; onChange: (area: StudyArea) => void }) {
  return (
    <div className="area-switcher" role="group" aria-label="切换冲刺科目">
      {(["408", "math", "english", "politics"] as StudyArea[]).map((area) => (
        <button
          className={activeArea === area ? "active" : ""}
          type="button"
          key={area}
          aria-pressed={activeArea === area}
          onClick={() => onChange(area)}
        >
          {area === "408" ? "408" : area === "math" ? "数学" : area === "english" ? "英语" : "政治"}
        </button>
      ))}
    </div>
  );
}

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

function visiblePlanPreviewEntries(values: Record<string, string>, field: PlanPreview["field"]): [string, string][] {
  const entries = Object.entries(values);
  if (field !== "reviewedPlannedAt") return entries;
  const seen = new Set<string>();
  return entries.filter(([sectionId]) => {
    const chapterId = findSectionById(sectionId)?.chapter.id ?? sectionId;
    if (seen.has(chapterId)) return false;
    seen.add(chapterId);
    return true;
  });
}

function defaultProgress(isMain = false): ProgressMap {
  return buildDefaultProgress(books, isMain);
}

function allSections(book: Book): Section[] {
  return book.chapters.flatMap((chapter) => chapter.sections);
}

function progressStage(book: Book, progress: ProgressMap) {
  const sections = allSections(book);
  const learned = sections.filter((section) => progress[section.id]?.learned).length;
  const phase = sections.length > 0 && learned === sections.length ? "reviewed" : "learned";
  const completed = phase === "reviewed"
    ? book.chapters.filter((chapter) => summarizeChapterReview(chapter, progress).reviewed).length
    : learned;
  const total = phase === "reviewed" ? book.chapters.length : sections.length;

  return {
    phase,
    completed,
    percentage: total ? Math.round((completed / total) * 100) : 0,
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
  chapter: Chapter;
  chapterTitle: string;
  section: Section;
  phase?: "base" | "review";
};

function projectTaskEntries(area: StudyArea): TaskEntry[] {
  return books
    .filter((book) => book.area === area)
    .flatMap((book) => book.chapters.flatMap((chapter) => chapter.sections.map((section) => ({
      book,
      chapter,
      chapterTitle: chapter.title,
      section,
    }))));
}

function projectReviewTaskEntries(area: StudyArea): TaskEntry[] {
  return books
    .filter((book) => book.area === area)
    .flatMap((book) => book.chapters.flatMap((chapter) => chapter.sections[0] ? [{
      book,
      chapter,
      chapterTitle: chapter.title,
      section: chapter.sections[0],
      phase: "review" as const,
    }] : []));
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

function mergeRemoteProgress(remote: Record<string, SectionProgress>, base = defaultProgress(false)): ProgressMap {
  const merged = { ...base };
  Object.keys(remote ?? {}).forEach((sectionId) => {
    const value = (remote as Record<string, unknown>)[sectionId];
    if (!value || typeof value !== "object") return;
    if (sectionId in merged) {
      merged[sectionId] = normalizeSectionProgress(value, merged[sectionId]);
    } else {
      merged[sectionId] = normalizeSectionProgress(value);
    }
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

export function StudyDashboard() {
  const [activePage, setActivePage] = useState<AppPage>("progress");
  const [topbarMoreOpen, setTopbarMoreOpen] = useState(false);
  const [catalogMoreOpen, setCatalogMoreOpen] = useState(false);
  const [activeArea, setActiveArea] = useState<StudyArea>(() => {
    const saved = loadLastViewedStudyState();
    return (saved?.activeArea === "408" || saved?.activeArea === "math") ? saved.activeArea : "408";
  });
  const [selectedBookByArea, setSelectedBookByArea] = useState<Record<StudyArea, string>>(() => {
    const saved = loadLastViewedStudyState();
    return {
      "408": saved?.selectedBookByArea?.["408"] || "computer-network",
      math: saved?.selectedBookByArea?.math || "probability",
      english: "",
      politics: "",
    };
  });
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);
  const [collapsedCurrentChapterId, setCollapsedCurrentChapterId] = useState<string | null>(null);
  const [expandedSectionRows, setExpandedSectionRows] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressMap>(() => defaultProgress(false));
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
  const [editorSections, setEditorSections] = useState<JournalSectionItem[]>([]);
  const [editorPaper, setEditorPaper] = useState<JournalPaperContext | null>(null);
  const [editorImportant, setEditorImportant] = useState(false);
  const [pendingDeleteJournal, setPendingDeleteJournal] = useState<JournalEntry | null>(null);
  const [blogPublishJournal, setBlogPublishJournal] = useState<JournalEntry | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishSlug, setPublishSlug] = useState("");
  const [publishContent, setPublishContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [isPaperNetdiskOpen, setIsPaperNetdiskOpen] = useState(false);

  const [loaded, setLoaded] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("locked");
  const [workspaceId, setWorkspaceId] = useState("");
  const workspaceUserLabel = useMemo(() => {
    const raw = (workspaceId || "main").trim();
    return raw.toLowerCase() === "main" || raw === "261219" ? "Main" : raw;
  }, [workspaceId]);
  const [inviteCode, setInviteCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const syncMeta = useMemo(() => {
    switch (syncStatus) {
      case "saved":
        return { cls: "saved", label: "已同步", desc: "数据已同步到云端" };
      case "saving":
        return { cls: "saving", label: "同步中…", desc: "正在同步到云端" };
      case "offline":
        return { cls: "offline", label: "离线待同步", desc: "网络不可用：数据已保存在本机，恢复网络后自动同步" };
      case "error":
        return { cls: "error", label: "同步失败", desc: "同步失败：数据仍保留在本机，将自动重试" };
      default:
        return { cls: "loading", label: "连接中…", desc: "正在连接云端" };
    }
  }, [syncStatus]);
  const [syncTick, setSyncTick] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const [filterChaptersCollapsed, setFilterChaptersCollapsed] = useState(true);
  const [filteredChapterOverrides, setFilteredChapterOverrides] = useState<Record<string, boolean>>({});
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
  const [pendingDeleteBackup, setPendingDeleteBackup] = useState<LocalBackup | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [storageLoadIssue, setStorageLoadIssue] = useState<StorageLoadIssue | null>(null);
  const [scrollTargetSectionId, setScrollTargetSectionId] = useState<string | null>(null);
  const [analyticsScope, setAnalyticsScope] = useState<"all" | StudyArea>("all");
  const [papers, setPapers] = useState<PaperRecord[]>(defaultPastPapers);
  const [schedule, setSchedule] = useState<ScheduleAppData>(buildDefaultSchedule);
  const { activeInfo: activeScheduleInfo } = useScheduleTicker(schedule);
  const [cockpitFocusedEvent, setCockpitFocusedEvent] = useState<ScheduleEvent | null>(null);
  const [todayScheduleExpanded, setTodayScheduleExpanded] = useState(false);
  const [settingsScheduleExpanded, setSettingsScheduleExpanded] = useState(false);
  const [sprintTab, setSprintTab] = useState<"all" | "past" | "mock">("all");
  const effectiveSprintTab = (activeArea === "english" || activeArea === "politics") && sprintTab === "mock" ? "all" : sprintTab;
  const [sprintStatusFilter, setSprintStatusFilter] = useState<"all" | "uncompleted" | "completed">("all");
  const [pastPaperSortOrder, setPastPaperSortOrder] = useState<"desc" | "asc">("desc");
  const [isAddMockModalOpen, setIsAddMockModalOpen] = useState(false);
  const [newMockTitle, setNewMockTitle] = useState("");
  const [newMockGroup, setNewMockGroup] = useState("");
  const [editingScorePaper, setEditingScorePaper] = useState<{ id: string; score: string } | null>(null);
  const [activePaperQuestionModalId, setActivePaperQuestionModalId] = useState<string | null>(null);
  const [pendingDeletePaperId, setPendingDeletePaperId] = useState<string | null>(null);
  const [pendingClearAllPapers, setPendingClearAllPapers] = useState(false);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const topbarMoreRef = useRef<HTMLDivElement>(null);
  const topbarMoreButtonRef = useRef<HTMLButtonElement>(null);
  const catalogMoreRef = useRef<HTMLDivElement>(null);
  const catalogMoreButtonRef = useRef<HTMLButtonElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const repositoryRef = useRef<StorageRepository | null>(null);
  const repositoryWorkspaceRef = useRef<string>("");
  const deletedJournalIdsRef = useRef<string[]>([]);
  const deletedPaperIdsRef = useRef<string[]>([]);
  const lastSavedPayloadRef = useRef<string>("");
  const syncBaseRef = useRef<StudyAppData | null>(null);
  const remoteRevisionRef = useRef(0);
  const workingDataRef = useRef<StudyAppData | null>(null);
  const hasLoadedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const syncBlockedRef = useRef(false);
  const workspaceEpochRef = useRef(0);
  const hasUserExplicitlyNavigatedRef = useRef(false);

  useEffect(() => {
    if (!topbarMoreOpen && !catalogMoreOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (topbarMoreOpen && !topbarMoreRef.current?.contains(event.target as Node)) setTopbarMoreOpen(false);
      if (catalogMoreOpen && !catalogMoreRef.current?.contains(event.target as Node)) setCatalogMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (topbarMoreOpen) {
        setTopbarMoreOpen(false);
        topbarMoreButtonRef.current?.focus();
      }
      if (catalogMoreOpen) {
        setCatalogMoreOpen(false);
        catalogMoreButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [topbarMoreOpen, catalogMoreOpen]);

  useEffect(() => {
    if (hasLoadedRef.current) {
      workingDataRef.current = createAppData(progress, projectSettings, planHistory, journals, papers, schedule);
    }
  }, [progress, projectSettings, planHistory, journals, papers, schedule]);

  const repository = useCallback((targetNamespace?: string): StorageRepository => {
    const namespace = targetNamespace ?? (repositoryWorkspaceRef.current || workspaceId || "");
    if (!repositoryRef.current || repositoryWorkspaceRef.current !== namespace) {
      repositoryRef.current = new StorageRepository(window.localStorage, namespace);
      repositoryWorkspaceRef.current = namespace;
    }
    return repositoryRef.current;
  }, [workspaceId]);

  const resetSpaceState = useCallback((namespace: string) => {
    workspaceEpochRef.current += 1;
    saveInFlightRef.current = false;
    syncBlockedRef.current = false;
    setWorkspaceId(namespace);
    repositoryRef.current = new StorageRepository(window.localStorage, namespace);
    repositoryWorkspaceRef.current = namespace;
    deletedJournalIdsRef.current = [];
    deletedPaperIdsRef.current = [];
    lastSavedPayloadRef.current = "";
    syncBaseRef.current = null;
    remoteRevisionRef.current = 0;
    workingDataRef.current = null;
    hasLoadedRef.current = false;
  }, []);

  const applyRemoteData = useCallback((body: Partial<StudyAppData> & { revision?: number }, includeLocal: boolean, explicitWorkspaceId?: string) => {
    const currentNamespace = explicitWorkspaceId ?? repositoryWorkspaceRef.current ?? workspaceId ?? "";
    const isMain = currentNamespace === "main" || currentNamespace === "261219";
    const fallback = defaultProgress(isMain);
    const repo = repository(currentNamespace);
    const remoteProgress = body.progress ?? {};
    const remote = createAppData(
      mergeRemoteProgress(remoteProgress, fallback),
      body.projectSettings ?? defaultProjectSettings(),
      body.planHistory ?? [],
      body.journals ?? [],
      body.papers ?? defaultPastPapers(),
      normalizeSchedule(body.schedule),
    );
    const base = syncBaseRef.current ?? repo.loadSyncBase(fallback);
    const local = includeLocal ? repo.load(fallback) : (hasLoadedRef.current ? workingDataRef.current : null);
    const localIssue = repo.takeLoadIssue();
    if (localIssue) {
      setStorageLoadIssue(localIssue);
      setFeedbackMessage(localIssue.message);
    }
    // A local copy without a known sync base cannot be safely merged into an
    // existing cloud workspace. Preserve it as a backup before trusting cloud.
    if (includeLocal && local && !base && Object.keys(remoteProgress).length > 0
      && JSON.stringify(local) !== JSON.stringify(remote)) {
      const previousIds = new Set(repo.backups().map((backup) => backup.id));
      const backupsAfter = repo.createBackup(local, "before-migration");
      if (backupsAfter.some((backup) => !previousIds.has(backup.id))) {
        setFeedbackMessage("已保留旧本地记录为备份，当前显示云端数据");
      } else {
        syncBlockedRef.current = true;
        setStorageLoadIssue({ message: "旧本地记录无法备份，请先导出原始数据并清理浏览器存储", raw: JSON.stringify(local) });
      }
    }
    const canMigrateEmptyMain = includeLocal && isMain && Object.keys(remoteProgress).length === 0;
    const merged = local && base
      ? rebaseAppData(base, local, remote)
      : local && canMigrateEmptyMain ? rebaseAppData(remote, local, remote) : remote;
    const reviewMigration = migrateLegacyChapterReviews(books, merged.progress);
    let visibleData = merged;
    if (reviewMigration.changedSectionIds.length > 0) {
      const previousIds = new Set(repo.backups().map((backup) => backup.id));
      const backupsAfter = repo.createBackup(merged, "before-migration");
      if (backupsAfter.some((backup) => !previousIds.has(backup.id))) {
        visibleData = { ...merged, progress: reviewMigration.progress };
      } else {
        syncBlockedRef.current = true;
        setStorageLoadIssue({ message: "章节复习旧记录无法备份，请先导出原始数据并清理浏览器存储", raw: JSON.stringify(merged) });
      }
    }

    workingDataRef.current = visibleData;
    hasLoadedRef.current = true;
    syncBaseRef.current = remote;
    remoteRevisionRef.current = Number.isSafeInteger(body.revision) ? body.revision! : 0;
    repo.saveSyncBase(remote);
    setProgress(visibleData.progress);
    setProjectSettings(visibleData.projectSettings);
    setPlanHistory(visibleData.planHistory);
    setJournals(visibleData.journals);
    setPapers(visibleData.papers);
    setSchedule(normalizeSchedule(visibleData.schedule));
    setBackups(repo.backups());

    const savedNav = loadLastViewedStudyState();
    const smartTarget = resolveGlobalRecentTarget(books, visibleData.progress);
    const smartBooksByArea = resolveRecentBookByArea(books, visibleData.progress);

    if (!savedNav && !hasUserExplicitlyNavigatedRef.current) {
      if (smartTarget) {
        setActiveArea(smartTarget.area);
        setSelectedBookByArea((prev) => ({
          ...prev,
          ...smartBooksByArea,
          [smartTarget.area]: smartTarget.bookId,
        }));
        setExpandedChapters((prev) =>
          prev.includes(smartTarget.chapterId) ? prev : [...prev, smartTarget.chapterId]
        );
      }
    } else {
      setSelectedBookByArea((prev) => ({
        ...smartBooksByArea,
        ...prev,
        ...(savedNav?.selectedBookByArea ?? {}),
      }));

      if (!hasUserExplicitlyNavigatedRef.current) {
        const curArea = savedNav?.activeArea ?? "408";
        const curBookId = savedNav?.selectedBookByArea?.[curArea] ?? smartBooksByArea[curArea];
        const curBook = books.find((b) => b.id === curBookId);
        if (curBook) {
          const sections = curBook.chapters.flatMap((c) => c.sections);
          const learnedCount = sections.filter((s) => visibleData.progress[s.id]?.learned).length;
          const isRev = sections.length > 0 && learnedCount === sections.length;
          const curSec = isRev
            ? curBook.chapters.find((chapter) => !summarizeChapterReview(chapter, visibleData.progress).reviewed)?.sections[0]
            : sections.find((s) => visibleData.progress[s.id]?.isCurrent && !visibleData.progress[s.id]?.learned)
              ?? sections.find((s) => !visibleData.progress[s.id]?.learned);
          const curChap = curSec
            ? curBook.chapters.find((c) => c.sections.some((s) => s.id === curSec.id))
            : undefined;
          if (curChap) {
            setExpandedChapters((prev) =>
              prev.includes(curChap.id) ? prev : [...prev, curChap.id]
            );
          }
        }
      }
    }

    // The server snapshot is the sync base. Rebased local edits must still save.
    lastSavedPayloadRef.current = JSON.stringify({
      ...remote,
      baseRevision: remoteRevisionRef.current,
      changedProgressIds: [],
      deletedJournalIds: [],
      deletedPaperIds: [],
    });
  }, [repository, workspaceId]);

  const loadRemoteData = useCallback(async (includeLocal: boolean) => {
    const epoch = workspaceEpochRef.current;
    const wid = repositoryWorkspaceRef.current || workspaceId || "main";
    const response = await fetch("/api/app-data", { cache: "no-store" });
    if (epoch !== workspaceEpochRef.current) return;
    if (response.status === 401) {
      setAuthState("locked");
      setLoaded(false);
      return;
    }
    if (!response.ok) throw new Error("app-data-load-failed");

    const body = await response.json() as Partial<StudyAppData>;
    if (epoch !== workspaceEpochRef.current) return;
    applyRemoteData(body, includeLocal, wid);
    setLoaded(true);
    setSyncStatus("saved");
  }, [applyRemoteData, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const body = await response.json() as { authenticated?: boolean; workspaceId?: string } & Partial<StudyAppData>;
        if (cancelled) return;
        if (!body.authenticated) return;
        const wid = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : "main";
        resetSpaceState(wid);
        setAuthState("authenticated");
        applyRemoteData(body, true, wid);
        setLoaded(true);
        setSyncStatus("saved");
      } catch {
        // Keep the invite form visible so a transient session-check failure
        // does not block the user from trying to log in.
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [applyRemoteData, resetSpaceState]);

  useEffect(() => {
    if (!loaded || authState !== "authenticated") return;
    if (syncBlockedRef.current) return;
    const appData = createAppData(progress, projectSettings, planHistory, journals, papers, schedule);
    repository().save(appData);

    const payloadString = JSON.stringify({
      ...appData,
      baseRevision: remoteRevisionRef.current,
      changedProgressIds: Object.keys(appData.progress).filter((id) =>
        JSON.stringify(appData.progress[id]) !== JSON.stringify(syncBaseRef.current?.progress[id])),
      deletedJournalIds: deletedJournalIdsRef.current,
      deletedPaperIds: deletedPaperIdsRef.current,
    });

    // If nothing changed from last saved payload, do not trigger a network PUT
    if (payloadString === lastSavedPayloadRef.current) {
      return;
    }

    const patch = syncBaseRef.current ? createAppDataPatch(syncBaseRef.current, appData) : null;
    const patchString = patch ? JSON.stringify({
      ...patch,
      baseRevision: remoteRevisionRef.current,
      deletedJournalIds: [...new Set([...patch.deletedJournalIds, ...deletedJournalIdsRef.current])],
      deletedPaperIds: [...new Set([...patch.deletedPaperIds, ...deletedPaperIdsRef.current])],
    }) : "";
    const usePatch = Boolean(patch && patchString.length < payloadString.length
      && new TextEncoder().encode(patchString).byteLength <= 2 * 1024 * 1024);

    const timer = window.setTimeout(async () => {
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;
      const epoch = workspaceEpochRef.current;
      setSyncStatus("saving");
      let recheckPending = false;
      const sentDeletedJournalIds = [...deletedJournalIdsRef.current];
      const sentDeletedPaperIds = [...deletedPaperIdsRef.current];
      try {
        const response = await fetch("/api/app-data", {
          method: usePatch ? "PATCH" : "PUT",
          headers: { "content-type": "application/json" },
          body: usePatch ? patchString : payloadString,
        });
        if (epoch !== workspaceEpochRef.current) return;
        if (response.status === 401) {
          setAuthState("locked");
          setLoaded(false);
          return;
        }
        if (response.status === 409) {
          const latest = await response.json() as Partial<StudyAppData> & { revision: number };
          applyRemoteData(latest, false);
          setSyncStatus("saving");
          recheckPending = true;
          return;
        }
        if (!response.ok) throw new Error("progress-save-failed");
        const resData = await response.json() as { revision?: number };
        if (!Number.isSafeInteger(resData.revision)) throw new Error("missing-revision");
        remoteRevisionRef.current = resData.revision!;
        syncBaseRef.current = appData;
        repository().saveSyncBase(appData);
        lastSavedPayloadRef.current = JSON.stringify({
          ...appData,
          baseRevision: resData.revision,
          changedProgressIds: [],
          deletedJournalIds: [],
          deletedPaperIds: [],
        });
        deletedJournalIdsRef.current = deletedJournalIdsRef.current.filter((id) => !sentDeletedJournalIds.includes(id));
        deletedPaperIdsRef.current = deletedPaperIdsRef.current.filter((id) => !sentDeletedPaperIds.includes(id));
        setSyncStatus("saved");
        recheckPending = true;
      } catch {
        if (epoch === workspaceEpochRef.current) setSyncStatus("offline");
      } finally {
        if (epoch === workspaceEpochRef.current) {
          saveInFlightRef.current = false;
          if (recheckPending) setSyncTick((current) => current + 1);
        }
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [authState, loaded, planHistory, progress, projectSettings, journals, papers, schedule, repository, applyRemoteData, syncTick]);

  useEffect(() => {
    if (authState !== "authenticated") return;

    const refresh = async () => {
      if (saveInFlightRef.current || document.hidden) return;
      try {
        const response = await fetch("/api/app-data/revision", { cache: "no-store" });
        if (response.status === 401) {
          setAuthState("locked");
          setLoaded(false);
          return;
        }
        if (!response.ok) throw new Error("revision-load-failed");
        const body = await response.json() as { revision: number };
        if (body.revision !== remoteRevisionRef.current) await loadRemoteData(false);
        else setSyncTick((current) => current + 1);
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

  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = window.setTimeout(() => {
      setFeedbackMessage("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

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
      const body = await response.json() as { error?: string; workspaceId?: string } & Partial<StudyAppData>;
      if (!response.ok) {
        setAuthError(body.error ?? "邀请码不正确");
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        setIsSubmitting(false);
        return;
      }
      const wid = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : "main";
      resetSpaceState(wid);
      setAuthState("authenticated");
      applyRemoteData(body, true, wid);
      setLoaded(true);
      setSyncStatus("saved");
    } catch {
      setAuthError("暂时无法连接同步服务，请稍后重试");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setIsSubmitting(false);
    }
  }, [applyRemoteData, isSubmitting, resetSpaceState]);

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
    workspaceEpochRef.current += 1;
    saveInFlightRef.current = false;
    syncBlockedRef.current = false;
    setAuthState("locked");
    setLoaded(false);
    setWorkspaceId("");
    setInviteCode("");
    setAuthError("");
    setIsSubmitting(false);
    repositoryRef.current = new StorageRepository(window.localStorage, "");
    repositoryWorkspaceRef.current = "";
    deletedJournalIdsRef.current = [];
    deletedPaperIdsRef.current = [];
    lastSavedPayloadRef.current = "";
    syncBaseRef.current = null;
    remoteRevisionRef.current = 0;
    workingDataRef.current = null;
    hasLoadedRef.current = false;
    setProgress(defaultProgress(false));
    setProjectSettings(defaultProjectSettings());
    setPlanHistory([]);
    setJournals([]);
    setPapers(defaultPastPapers());
    setSchedule(buildDefaultSchedule());
    setBackups([]);
  }

  const areaBooks = useMemo(() => books.filter((book) => book.area === (activeArea === "english" || activeArea === "politics" ? "408" : activeArea)), [activeArea]);
  const selectedBookId = selectedBookByArea[activeArea];
  const selectedBook = areaBooks.find((book) => book.id === selectedBookId) ?? areaBooks[0] ?? books[0];
  const selectedSections = useMemo(() => allSections(selectedBook), [selectedBook]);
  const learnedCount = selectedSections.filter((section) => progress[section.id]?.learned).length;
  const reviewedCount = selectedBook.chapters.filter((chapter) => summarizeChapterReview(chapter, progress).reviewed).length;
  const selectedProgressStage = progressStage(selectedBook, progress);
  const isReviewPhase = selectedProgressStage.phase === "reviewed";
  const activeProgressPercent = selectedProgressStage.percentage;
  const activeProgressLabel = isReviewPhase ? "强化阶段" : "基础阶段";
  const manualCurrentSection = selectedSections.find((section) => progress[section.id]?.isCurrent && !progress[section.id]?.learned);
  const currentReviewChapter = selectedBook.chapters.find((chapter) => !summarizeChapterReview(chapter, progress).reviewed);
  const currentSection = isReviewPhase
    ? currentReviewChapter?.sections[0]
    : manualCurrentSection ?? selectedSections.find((section) => !progress[section.id]?.learned);
  const currentSectionLabel = isReviewPhase ? "当前复习章节" : "当前新学";
  const phaseCompleteLabel = isReviewPhase ? "强化阶段已完成" : "基础阶段已完成";
  const currentChapterId = currentSection
    ? selectedBook.chapters.find((chapter) => chapter.sections.some((section) => section.id === currentSection.id))?.id
    : undefined;

  useEffect(() => {
    if (!scrollTargetSectionId || catalogFilter !== "all") return;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(scrollTargetSectionId.startsWith("chapter:")
        ? `chapter-${scrollTargetSectionId.slice(8)}`
        : `section-${scrollTargetSectionId}`);
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
    setCollapsedCurrentChapterId(null);
    setScrollTargetSectionId(isReviewPhase && currentChapterId ? `chapter:${currentChapterId}` : currentSection.id);
  }

  const globalRecent = useMemo(() => resolveGlobalRecentTarget(books, progress), [progress]);
  const hasDifferentGlobalRecent = Boolean(
    globalRecent && (globalRecent.bookId !== selectedBook.id || globalRecent.area !== activeArea)
  );
  const globalRecentBook = useMemo(
    () => (globalRecent ? books.find((b) => b.id === globalRecent.bookId) : null),
    [globalRecent]
  );
  const globalRecentSection = useMemo(() => {
    if (!globalRecent || !globalRecentBook) return null;
    return globalRecentBook.chapters.flatMap((c) => c.sections).find((s) => s.id === globalRecent.sectionId) ?? null;
  }, [globalRecent, globalRecentBook]);

  function jumpToGlobalRecent() {
    if (!globalRecent) return;
    hasUserExplicitlyNavigatedRef.current = true;
    setActiveArea(globalRecent.area);
    setSelectedBookByArea((current) => {
      const next = { ...current, [globalRecent.area]: globalRecent.bookId };
      saveLastViewedStudyState({ activeArea: globalRecent.area, selectedBookByArea: next });
      return next;
    });
    setCatalogFilter("all");
    setExpandedChapters((current) =>
      current.includes(globalRecent.chapterId) ? current : [...current, globalRecent.chapterId]
    );
    setScrollTargetSectionId(globalRecent.isReview ? `chapter:${globalRecent.chapterId}` : globalRecent.sectionId);
  }

  const filteredChapters = selectedBook.chapters
    .map((chapter) => {
      const review = summarizeChapterReview(chapter, progress);
      const overdueReview = chapterReviewPlanStatus(chapter, progress, dateToday()) === "overdue";
      const visibleSections = chapter.sections.filter((section) => {
        const state = progress[section.id];
        if (catalogFilter === "unlearned") return !state?.learned;
        if (catalogFilter === "unreviewed") return review.canReview && !review.reviewed;
        if (catalogFilter === "overdue") return overdueReview || basePlanStatus(state) === "overdue";
        return true;
      });
      return { chapter, visibleSections };
    })
    .filter(({ visibleSections }) => visibleSections.length > 0);
  const filteredSectionCount = filteredChapters.reduce((count, { visibleSections }) => count + visibleSections.length, 0);
  const allExpanded = selectedBook.chapters.every((chapter) =>
    expandedChapters.includes(chapter.id) || (chapter.id === currentChapterId && collapsedCurrentChapterId !== chapter.id));
  const effectiveAllExpanded = catalogFilter === "all"
    ? allExpanded
    : filteredChapters.every(({ chapter }) => filteredChapterOverrides[chapter.id] ?? !filterChaptersCollapsed);

  const projectTasks = useMemo(() => projectTaskEntries(activeArea), [activeArea]);
  const todayTasks = useMemo(() => [
    ...projectTaskEntries("408"),
    ...projectTaskEntries("math"),
  ], []);
  const reviewChapterTasks = useMemo(() => [
    ...projectReviewTaskEntries("408"),
    ...projectReviewTaskEntries("math"),
  ], []);
  const today = dateToday();
  const todayBasePlan: TaskEntry[] = useMemo(() => {
    return todayTasks
      .filter(({ section }) => isTodayBasePlan(progress[section.id], today))
      .map((task) => ({ ...task, phase: "base" as const }));
  }, [todayTasks, progress, today]);

  const todayReviewPlan: TaskEntry[] = useMemo(() => {
    return reviewChapterTasks
      .filter(({ chapter }) => summarizeChapterReview(chapter, progress).reviewedPlannedAt === today);
  }, [reviewChapterTasks, progress, today]);

  const todayPlan = useMemo(() => [...todayBasePlan, ...todayReviewPlan], [todayBasePlan, todayReviewPlan]);

  const overdueBaseTasks: TaskEntry[] = useMemo(() => {
    return todayTasks
      .filter(({ section }) => isOverdueBaseTask(progress[section.id], today))
      .map((task) => ({ ...task, phase: "base" as const }))
      .sort((left, right) => (progress[left.section.id]?.plannedAt ?? "").localeCompare(progress[right.section.id]?.plannedAt ?? ""));
  }, [todayTasks, progress, today]);

  const overdueReviewTasks: TaskEntry[] = useMemo(() => {
    return reviewChapterTasks
      .filter(({ chapter }) => chapterReviewPlanStatus(chapter, progress, today) === "overdue")
      .sort((left, right) => summarizeChapterReview(left.chapter, progress).reviewedPlannedAt.localeCompare(
        summarizeChapterReview(right.chapter, progress).reviewedPlannedAt));
  }, [reviewChapterTasks, progress, today]);

  const overdueTasks = useMemo(() => [...overdueBaseTasks, ...overdueReviewTasks], [overdueBaseTasks, overdueReviewTasks]);
  const rescheduleToToday = (sectionId: string, phase: "base" | "review") => {
    const todayStr = dateToday();
    if (phase === "review") {
      const target = findSectionById(sectionId);
      if (target) updateChapterReviewedPlannedAt(target.chapter, todayStr);
      setFeedbackMessage("已将本章复习任务改排至今日");
      return;
    }
    const field = "plannedAt";
    setProgress((prev) => {
      const existing = prev[sectionId] ?? {
        learned: false,
        learnedAt: "",
        reviewed: false,
        reviewedAt: "",
        plannedAt: "",
        reviewedPlannedAt: "",
        isCurrent: false,
      };
      return {
        ...prev,
        [sectionId]: {
          ...existing,
          [field]: todayStr,
        },
      };
    });
    setFeedbackMessage("已成功将逾期任务改排至今日执行！");
  };

  const cockpitWeek = useMemo(() => {
    return calculateWeekNumber(schedule.semesterStartDate, today);
  }, [schedule.semesterStartDate, today]);

  const activeSlotArea = cockpitFocusedEvent?.linkedArea ?? (activeScheduleInfo.status === "in_progress" ? activeScheduleInfo.activeEvent?.linkedArea : null);

  const displayedTodayPlan = useMemo(() => {
    let list = todayPlan;
    if (cockpitFocusedEvent?.linkedArea) {
      list = list.filter((t) => t.book.area === cockpitFocusedEvent.linkedArea);
    }
    if (activeSlotArea) {
      return [...list].sort((a, b) => {
        const aDone = Boolean(a.phase === "review" ? summarizeChapterReview(a.chapter, progress).reviewed : progress[a.section.id]?.learned);
        const bDone = Boolean(b.phase === "review" ? summarizeChapterReview(b.chapter, progress).reviewed : progress[b.section.id]?.learned);
        const aMatch = a.book.area === activeSlotArea && !aDone;
        const bMatch = b.book.area === activeSlotArea && !bDone;
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }
    return list;
  }, [todayPlan, cockpitFocusedEvent, activeSlotArea, progress]);
  const displayedTodayCompleted = displayedTodayPlan.filter(({ section, chapter, phase }) => phase === "review"
    ? summarizeChapterReview(chapter, progress).reviewed
    : progress[section.id]?.learned).length;

  const displayedOverdueTasks = useMemo(() => {
    if (!cockpitFocusedEvent?.linkedArea) return overdueTasks;
    return overdueTasks.filter((t) => t.book.area === cockpitFocusedEvent.linkedArea);
  }, [overdueTasks, cockpitFocusedEvent]);

  const nearestExamDate = [projectSettings["408"].examDate, projectSettings.math.examDate, projectSettings.english?.examDate ?? "2026-12-19", projectSettings.politics?.examDate ?? "2026-12-19"].sort()[0];
  const examDate = (activePage === "progress" || activePage === "sprint") ? (projectSettings[activeArea]?.examDate ?? nearestExamDate) : nearestExamDate;
  const daysUntilExam = useMemo(() => calculateDaysUntilExam(examDate), [examDate]);
  const timeProgressPercent = useMemo(() => calculateTimeProgress(examDate), [examDate]);
  const activityProgress = useMemo(() => buildChapterReviewAnalyticsProgress(books, progress), [progress]);
  const weekDots = useMemo(() => getWeekDaysActivity(activityProgress), [activityProgress]);
  const weeklyDaysCount = useMemo(() => weekDots.filter((day) => day.isDone).length, [weekDots]);
  const weeklySectionCount = useMemo(() => calculateWeeklySectionCount(activityProgress), [activityProgress]);
  const analyticsBooks = useMemo(() => analyticsScope === "all"
    ? books
    : books.filter((book) => book.area === analyticsScope), [analyticsScope]);
  const analyticsSections = useMemo(() => {
    return analyticsBooks.flatMap(allSections);
  }, [analyticsBooks]);
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
  const analyticsChapterCount = analyticsBooks.reduce((count, book) => count + book.chapters.length, 0);
  const analyticsReviewedChapters = analyticsBooks.reduce((count, book) =>
    count + book.chapters.filter((chapter) => summarizeChapterReview(chapter, progress).reviewed).length, 0);
  const analyticsReviewedPercent = analyticsChapterCount > 0
    ? Math.round((analyticsReviewedChapters / analyticsChapterCount) * 100)
    : 0;
  const heatmapDays = useMemo(() => {
    return calculateActivityHeatmap(activityProgress, dateToday(), 13);
  }, [activityProgress]);
  const weeklyTrends = useMemo(() => {
    return calculateWeeklyTrends(activityProgress, dateToday(), 8);
  }, [activityProgress]);
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

  const sprintAreaPapers = useMemo(() => papers.filter((p) => p.area === activeArea), [papers, activeArea]);
  const pastPapers = useMemo(() => sprintAreaPapers.filter((p) => p.kind === "past").sort((a, b) => (b.year ?? 0) - (a.year ?? 0)), [sprintAreaPapers]);
  const mockPapers = useMemo(() => sprintAreaPapers.filter((p) => p.kind === "mock"), [sprintAreaPapers]);

  const sprintPastCompleted = useMemo(() => pastPapers.filter((p) => p.completed).length, [pastPapers]);
  const sprintPastTotal = pastPapers.length;
  const sprintPastPercent = sprintPastTotal ? Math.round((sprintPastCompleted / sprintPastTotal) * 100) : 0;
  const sprintPastYearRange = useMemo(() => {
    const years = pastPapers
      .map((p) => p.year)
      .filter((year): year is number => typeof year === "number");
    if (!years.length) return "";
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? `${min}` : `${min}–${max}`;
  }, [pastPapers]);

  const sprintMockCompleted = useMemo(() => mockPapers.filter((p) => p.completed).length, [mockPapers]);
  const sprintMockTotal = mockPapers.length;
  const scoredPastPapers = useMemo(() => pastPapers.filter((p) => typeof p.score === "number" && p.score !== null), [pastPapers]);
  const sprintPastAvgScore = useMemo(() => {
    if (!scoredPastPapers.length) return "--";
    const sum = scoredPastPapers.reduce((acc, p) => acc + (p.score ?? 0), 0);
    return (sum / scoredPastPapers.length).toFixed(1);
  }, [scoredPastPapers]);

  const scoredMockPapers = useMemo(() => mockPapers.filter((p) => typeof p.score === "number" && p.score !== null), [mockPapers]);
  const sprintMockAvgScore = useMemo(() => {
    if (!scoredMockPapers.length) return "--";
    const sum = scoredMockPapers.reduce((acc, p) => acc + (p.score ?? 0), 0);
    return (sum / scoredMockPapers.length).toFixed(1);
  }, [scoredMockPapers]);

  const choiceOnlyStats = useMemo(() => {
    if (activeArea !== "english" && activeArea !== "politics") return null;
    let totalRecordedScore = 0;
    let totalEarnedScore = 0;
    let papersWithChoice = 0;
    for (const p of pastPapers) {
      if (!p.questions) continue;
      let pEarned = 0;
      let pRecorded = 0;
      const maxChoice = paperMaxChoiceNum(p.area);
      for (let i = 1; i <= maxChoice; i++) {
        const st = p.questions[i];
        const weight = choiceQuestionWeight(p.area, i);
        if (st === "correct") {
          pEarned += weight;
          pRecorded += weight;
        } else if (st === "wrong") {
          pRecorded += weight;
        }
      }
      if (pRecorded > 0) {
        totalEarnedScore += pEarned;
        totalRecordedScore += pRecorded;
        papersWithChoice++;
      }
    }
    const avgChoiceScore = papersWithChoice > 0 ? (totalEarnedScore / papersWithChoice).toFixed(1) : "--";
    const avgChoiceRate = totalRecordedScore > 0 ? Math.round((totalEarnedScore / totalRecordedScore) * 100) : null;
    return { avgChoiceScore, avgChoiceRate, count: papersWithChoice };
  }, [activeArea, pastPapers]);

  const journalsByPaper = useMemo(() => {
    const map: Record<string, JournalEntry[]> = {};
    journals.forEach((entry) => {
      if (entry.context?.type === "paper" && entry.context.paperId) {
        if (!map[entry.context.paperId]) map[entry.context.paperId] = [];
        map[entry.context.paperId].push(entry);
      }
    });
    return map;
  }, [journals]);

  const visiblePastPapers = useMemo(() => {
    const list = pastPapers.filter((p) => {
      if (sprintStatusFilter === "uncompleted") return !p.completed;
      if (sprintStatusFilter === "completed") return p.completed;
      return true;
    });
    return [...list].sort((a, b) => {
      const yearA = a.year ?? 0;
      const yearB = b.year ?? 0;
      return pastPaperSortOrder === "asc" ? yearA - yearB : yearB - yearA;
    });
  }, [pastPapers, sprintStatusFilter, pastPaperSortOrder]);

  const visibleMockPapers = useMemo(() => {
    return mockPapers.filter((p) => {
      if (sprintStatusFilter === "uncompleted") return !p.completed;
      if (sprintStatusFilter === "completed") return p.completed;
      return true;
    });
  }, [mockPapers, sprintStatusFilter]);
  const activeQuestionPaper = useMemo(() => {
    if (!activePaperQuestionModalId) return null;
    return papers.find((p) => p.id === activePaperQuestionModalId) ?? null;
  }, [activePaperQuestionModalId, papers]);

  function updatePaper(id: string, patch: Partial<PaperRecord>) {
    let clampNotice = "";
    setPapers((current) => current.map((p) => {
      if (p.id !== id) return p;
      const nextPatch = { ...patch };
      if (typeof nextPatch.score === "number" && !Number.isNaN(nextPatch.score)) {
        const maxScore = maxPaperScore(p.area);
        const origScore = nextPatch.score;
        const clamped = clampPaperScore(origScore, p.area) ?? 0;
        if (origScore > maxScore) {
          clampNotice = `已按满分 ${maxScore} 分修正`;
        } else if (origScore < 0) {
          clampNotice = "得分不能低于 0 分，已修正为 0 分";
        }
        nextPatch.score = clamped;
      }
      return { ...p, ...nextPatch };
    }));
    if (clampNotice) {
      setFeedbackMessage(clampNotice);
    }
  }

  function togglePaperCompleted(id: string, completed: boolean) {
    const todayStr = dateToday();
    let hadSecondRound = false;
    setPapers((current) => current.map((p) => {
      if (p.id !== id) return p;
      if (!completed && p.secondRound) {
        hadSecondRound = true;
      }
      return {
        ...p,
        completed,
        completedAt: completed ? (p.completedAt || todayStr) : "",
        secondRound: completed ? p.secondRound : false,
        secondRoundAt: completed ? p.secondRoundAt : "",
      };
    }));
    if (!completed && hadSecondRound) {
      setFeedbackMessage("已取消做题完成记录（二刷记录已同步重置）");
    }
  }

  function togglePaperSecondRound(id: string, secondRound: boolean) {
    const todayStr = dateToday();
    let autoCompletedFirstRound = false;
    setPapers((current) => current.map((p) => {
      if (p.id !== id) return p;
      const nextCompleted = secondRound ? true : p.completed;
      if (secondRound && !p.completed) {
        autoCompletedFirstRound = true;
      }
      return {
        ...p,
        completed: nextCompleted,
        completedAt: nextCompleted ? (p.completedAt || todayStr) : "",
        secondRound,
        secondRoundAt: secondRound ? (p.secondRoundAt || todayStr) : "",
      };
    }));
    if (secondRound) {
      setFeedbackMessage(autoCompletedFirstRound ? "已标记二刷（已同步完成一刷）" : "已标记二刷完成");
    } else {
      setFeedbackMessage("已取消二刷");
    }
  }

  function handleAddMockPaper() {
    if (!newMockTitle.trim()) return;
    const newId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newRecord: PaperRecord = {
      id: newId,
      kind: "mock",
      area: activeArea,
      title: newMockTitle.trim(),
      groupName: newMockGroup.trim() || undefined,
      completed: false,
      completedAt: "",
      score: null,
      durationMinutes: null,
      secondRound: false,
      secondRoundAt: "",
    };
    setPapers((current) => [...current, newRecord]);
    setNewMockTitle("");
    setNewMockGroup("");
    setIsAddMockModalOpen(false);
    setFeedbackMessage("已添加模拟试卷");
  }

  function handleDeleteMockPaper(id: string) {
    // Record a tombstone: mergePapers is a union-only merge, so a deletion would
    // otherwise be re-inserted from D1 on the next poll unless the server is told
    // to drop this id explicitly.
    if (!deletedPaperIdsRef.current.includes(id)) {
      deletedPaperIdsRef.current.push(id);
    }
    setPapers((current) => current.filter((p) => p.id !== id));
    setPendingDeletePaperId(null);
    setFeedbackMessage("已删除模拟试卷");
  }

  function getPaperQuestionSummary(paper: PaperRecord) {
    const totalQuestions = paperTotalQuestions(paper.area);
    const maxChoiceNum = paperMaxChoiceNum(paper.area);
    if (!paper.questions || Object.keys(paper.questions).length === 0) {
      return null;
    }
    let correctCount = 0;
    let partialCount = 0;
    let wrongCount = 0;
    let choiceCorrectCount = 0;
    let choiceWrongCount = 0;
    let choiceRecordedWeight = 0;
    let choiceCorrectWeight = 0;
    let subjectiveTotal = 0;
    let subjectiveRecorded = 0;
    let subjectivePerfectCount = 0;
    let subjectivePartialCount = 0;
    let subjectiveWrongCount = 0;

    for (let i = 1; i <= totalQuestions; i++) {
      const qState = paper.questions[i];
      const isChoice = i <= maxChoiceNum;
      const weight = isChoice ? choiceQuestionWeight(paper.area, i) : 1.0;

      if (qState === "correct") {
        correctCount++;
        if (isChoice) {
          choiceCorrectCount++;
          choiceCorrectWeight += weight;
          choiceRecordedWeight += weight;
        } else {
          subjectiveRecorded++;
          subjectivePerfectCount++;
        }
      } else if (qState === "partial") {
        partialCount++;
        if (!isChoice) {
          subjectiveRecorded++;
          subjectivePartialCount++;
        }
      } else if (qState === "wrong") {
        wrongCount++;
        if (isChoice) {
          choiceWrongCount++;
          choiceRecordedWeight += weight;
        } else {
          subjectiveRecorded++;
          subjectiveWrongCount++;
        }
      }
      if (!isChoice) {
        subjectiveTotal++;
      }
    }
    const totalRecorded = correctCount + partialCount + wrongCount;
    const accuracyPercent = totalRecorded > 0 ? Math.round((correctCount / totalRecorded) * 100) : 0;
    const choiceRecorded = choiceCorrectCount + choiceWrongCount;
    const choiceAccuracyPercent = choiceRecordedWeight > 0 ? Math.round((choiceCorrectWeight / choiceRecordedWeight) * 100) : null;
    return {
      totalRecorded,
      correctCount,
      partialCount,
      wrongCount,
      accuracyPercent,
      choiceCorrectCount,
      choiceWrongCount,
      choiceRecorded,
      choiceAccuracyPercent,
      choiceCorrectWeight,
      choiceRecordedWeight,
      subjectiveTotal,
      subjectiveRecorded,
      subjectivePerfectCount,
      subjectivePartialCount,
      subjectiveWrongCount,
      maxChoiceNum,
      totalQuestions,
    };
  }

  function togglePaperQuestion(paperId: string, qNum: number, isChoice: boolean) {
    setPapers((current) => current.map((p) => {
      if (p.id !== paperId) return p;
      const currentMap = p.questions ?? {};
      const currentState = currentMap[qNum];
      let nextState: QuestionState | undefined;

      if (isChoice) {
        // Choice questions 3-step cycle: unset (⚪) -> correct (🟢) -> wrong (🔴) -> unset (⚪)
        if (!currentState) {
          nextState = "correct";
        } else if (currentState === "correct") {
          nextState = "wrong";
        } else {
          nextState = undefined;
        }
      } else {
        // Subjective cycle: unset -> partial -> correct -> wrong -> unset
        if (!currentState) {
          nextState = "partial";
        } else if (currentState === "partial") {
          nextState = "correct";
        } else if (currentState === "correct") {
          nextState = "wrong";
        } else {
          nextState = undefined;
        }
      }

      const nextMap = { ...currentMap };
      if (nextState) {
        nextMap[qNum] = nextState;
      } else {
        delete nextMap[qNum];
      }

      // 空对象表示“已清空”，与“未触碰 undefined”区分，避免被 merge 复活
      return syncAnswerSheetScore({
        ...p,
        questions: nextMap,
      });
    }));
  }

  function handleSubjectiveRating(paperId: string, qNum: number, targetState: QuestionState, maxScore: number) {
    setPapers((current) => current.map((p) => {
      if (p.id !== paperId) return p;
      const currentMap = p.questions ?? {};
      const currentScores = p.questionScores ?? {};
      const currentState = currentMap[qNum];

      const nextMap = { ...currentMap };
      const nextScores = { ...currentScores };

      if (currentState === targetState) {
        // Toggle off
        delete nextMap[qNum];
        delete nextScores[qNum];
      } else {
        nextMap[qNum] = targetState;
        if (targetState === "correct") {
          nextScores[qNum] = maxScore;
        } else if (targetState === "partial") {
          nextScores[qNum] = Math.round(maxScore * 0.6);
        } else if (targetState === "wrong") {
          nextScores[qNum] = 0;
        }
      }

      return syncAnswerSheetScore({
        ...p,
        questions: nextMap,
        questionScores: nextScores,
      });
    }));
  }

  function handleSubjectiveScoreInput(paperId: string, qNum: number, rawVal: string, maxScore: number) {
    setPapers((current) => current.map((p) => {
      if (p.id !== paperId) return p;
      const currentMap = p.questions ?? {};
      const currentScores = p.questionScores ?? {};

      const nextMap = { ...currentMap };
      const nextScores = { ...currentScores };

      if (rawVal.trim() === "") {
        delete nextMap[qNum];
        delete nextScores[qNum];
      } else {
        const scoreNum = parseFloat(rawVal);
        if (Number.isNaN(scoreNum) || scoreNum < 0) return p;
        const boundedScore = Math.min(scoreNum, maxScore);
        nextScores[qNum] = boundedScore;

        if (boundedScore >= maxScore) {
          nextMap[qNum] = "correct";
        } else if (boundedScore <= 0) {
          nextMap[qNum] = "wrong";
        } else {
          nextMap[qNum] = "partial";
        }
      }

      return syncAnswerSheetScore({
        ...p,
        questions: nextMap,
        questionScores: nextScores,
      });
    }));
  }



  function markAllPaperQuestions(paperId: string, state: "correct" | "wrong") {
    setPapers((current) => current.map((p) => {
      if (p.id !== paperId) return p;
      const maxChoice = paperMaxChoiceNum(p.area);
      const nextMap: Record<number, QuestionState> = { ...(p.questions ?? {}) };
      for (let i = 1; i <= maxChoice; i++) {
        nextMap[i] = state;
      }
      return syncAnswerSheetScore({
        ...p,
        questions: nextMap,
      });
    }));
    setFeedbackMessage(state === "correct" ? "已将选择题设为全部正确 🟢" : "已将选择题设为全部错误 🔴");
  }

  function batchSetWrongQuestions(paperId: string, rawInput: string) {
    setPapers((current) => current.map((p) => {
      if (p.id !== paperId) return p;
      const maxChoice = paperMaxChoiceNum(p.area);
      const total = paperTotalQuestions(p.area);
      const tokens = parseQuestionRanges(rawInput, total);
      const wrongSet = new Set(tokens);
      const nextMap: Record<number, QuestionState> = { ...(p.questions ?? {}) };
      const nextScores = { ...(p.questionScores ?? {}) };
      for (let i = 1; i <= maxChoice; i++) {
        nextMap[i] = wrongSet.has(i) ? "wrong" : "correct";
      }
      for (let i = maxChoice + 1; i <= total; i++) {
        if (wrongSet.has(i)) {
          nextMap[i] = "wrong";
          nextScores[i] = 0;
        }
      }
      return syncAnswerSheetScore({
        ...p,
        questions: nextMap,
        questionScores: nextScores,
      });
    }));
    setFeedbackMessage("已更新错题与正确题标记");
  }

  function clearPaperQuestions(paperId: string) {
    setPapers((current) => current.map((p) => {
      if (p.id !== paperId) return p;
      return {
        ...p,
        completed: false,
        completedAt: "",
        score: null,
        durationMinutes: null,
        secondRound: false,
        secondRoundAt: "",
        questions: {},
        questionScores: {},
      };
    }));
    setFeedbackMessage("已清空本卷所有做题记录与得分");
  }

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

  function updateChapterReviewedPlannedAt(chapter: Chapter, reviewedPlannedAt: string) {
    const change = setChapterReviewPlan(chapter, progress, reviewedPlannedAt);
    if (change.error) {
      setFeedbackMessage("复习计划日期无效");
      return;
    }
    if (!change.changedSectionIds.length) return;
    const previous = Object.fromEntries(change.changedSectionIds.map((sectionId) =>
      [sectionId, progress[sectionId]?.reviewedPlannedAt ?? ""]));
    setProgress(change.progress);
    setPlanHistory((current) => [...current, ...change.changedSectionIds.map((sectionId) => ({
      id: crypto.randomUUID(),
      sectionId,
      from: previous[sectionId],
      to: reviewedPlannedAt,
      changedAt: new Date().toISOString(),
      source: "manual" as const,
    }))].slice(-1000));
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
    hasUserExplicitlyNavigatedRef.current = true;
    setSelectedBookByArea((current) => {
      const next = { ...current, [activeArea]: bookId };
      saveLastViewedStudyState({ activeArea, selectedBookByArea: next });
      return next;
    });
    setExpandedChapters([]);
    setCollapsedCurrentChapterId(null);
    setCatalogFilter("all");
  }

  function selectBookAcrossAreas(bookId: string) {
    const book = books.find((candidate) => candidate.id === bookId);
    if (!book) return;
    hasUserExplicitlyNavigatedRef.current = true;
    setActiveArea(book.area);
    setSelectedBookByArea((current) => {
      const next = { ...current, [book.area]: book.id };
      saveLastViewedStudyState({ activeArea: book.area, selectedBookByArea: next });
      return next;
    });
    setExpandedChapters([]);
    setCollapsedCurrentChapterId(null);
    setCatalogFilter("all");
  }

  function selectSprintArea(area: StudyArea) {
    setActiveArea(area);
    if ((area === "english" || area === "politics") && sprintTab === "mock") setSprintTab("all");
  }

  function navigateMobile(page: AppPage) {
    if (page === "analytics" && !SHOW_DATA_ANALYSIS) return;
    setActivePage(page);
    setTopbarMoreOpen(false);
    setCatalogMoreOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => document.getElementById(`${page}-title`)?.focus({ preventScroll: true }));
  }

  function toggleCatalogExpansion() {
    if (catalogFilter === "all") {
      setExpandedChapters(allExpanded ? [] : selectedBook.chapters.map((chapter) => chapter.id));
      setCollapsedCurrentChapterId(allExpanded ? currentChapterId ?? null : null);
    } else {
      setFilterChaptersCollapsed(effectiveAllExpanded);
      setFilteredChapterOverrides({});
    }
  }

  function toggleChapterExpansion(chapterId: string, open: boolean) {
    if (catalogFilter !== "all") {
      setFilteredChapterOverrides((current) => ({ ...current, [chapterId]: !open }));
      return;
    }
    if (chapterId === currentChapterId) {
      setExpandedChapters((current) => current.filter((id) => id !== chapterId));
      setCollapsedCurrentChapterId(open ? chapterId : null);
      return;
    }
    setExpandedChapters((current) => current.includes(chapterId)
      ? current.filter((id) => id !== chapterId)
      : [...current, chapterId]);
  }

  function clearLearned(sectionId: string) {
    const target = findSectionById(sectionId);
    setProgress((current) => {
      const reviewCleared = target ? cancelChapterReview(target.chapter, current).progress : current;
      const previous = reviewCleared[sectionId];
      return {
        ...reviewCleared,
        [sectionId]: normalizeSectionProgress({ ...previous, learned: false, learnedAt: "", reviewed: false, reviewedAt: "", isCurrent: false }, previous),
      };
    });
  }

  function toggleLearned(sectionId: string, checked: boolean) {
    if (checked) {
      updateProgress(sectionId, { learned: true, learnedAt: dateToday(), isCurrent: false });
      return;
    }
    const target = findSectionById(sectionId);
    if (target && summarizeChapterReview(target.chapter, progress).reviewed) {
      setPendingClearSectionId(sectionId);
      return;
    }
    clearLearned(sectionId);
  }

  function toggleChapterReviewed(chapter: Chapter, checked: boolean, completedAt = dateToday()) {
    const change = checked
      ? completeChapterReview(chapter, progress, completedAt)
      : cancelChapterReview(chapter, progress);
    if (change.error === "not-ready") {
      setFeedbackMessage("请先完成本章全部小节的新学，再标记复习");
      return;
    }
    if (change.error === "date-before-learned") {
      setFeedbackMessage("复习完成日期不能早于本章小节的新学完成日期");
      return;
    }
    if (change.error) {
      setFeedbackMessage("复习完成日期无效");
      return;
    }
    if (change.changedSectionIds.length) setProgress(change.progress);
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
      let next = { ...current };
      if (field === "reviewedPlannedAt") {
        const handledChapters = new Set<string>();
        ids.forEach((sectionId) => {
          const target = findSectionById(sectionId);
          if (!target || handledChapters.has(target.chapter.id)) return;
          handledChapters.add(target.chapter.id);
          next = setChapterReviewPlan(target.chapter, next, values[sectionId]).progress;
        });
      } else {
        ids.forEach((sectionId) => {
          next[sectionId] = { ...next[sectionId], [field]: values[sectionId] };
        });
      }
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
      let next = { ...current };
      if (field === "reviewedPlannedAt") {
        const handledChapters = new Set<string>();
        Object.entries(planUndo.values).forEach(([sectionId, dateVal]) => {
          const target = findSectionById(sectionId);
          if (!target || handledChapters.has(target.chapter.id)) return;
          handledChapters.add(target.chapter.id);
          next = setChapterReviewPlan(target.chapter, next, dateVal).progress;
        });
      } else {
        Object.entries(planUndo.values).forEach(([sectionId, dateVal]) => {
          next[sectionId] = { ...next[sectionId], [field]: dateVal };
        });
      }
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
  ) {
    if (!range.start || (mode === "spread" && !range.end)) {
      setFeedbackMessage("请先设置完整的计划日期或区间");
      return;
    }
    if (mode === "spread" && range.end < range.start) {
      setFeedbackMessage("计划结束日期不能早于开始日期");
      return;
    }
    const values = buildChapterPlanChanges(
      sections.map((section) => ({
        id: section.id,
        learned: Boolean(progress[section.id]?.learned),
        plannedAt: progress[section.id]?.plannedAt ?? "",
        reviewed: Boolean(progress[section.id]?.reviewed),
      })),
      range,
      mode,
      "base",
    );
    previewPlanChanges(
      values,
      mode === "uniform" ? "已统一设置基础阶段章节计划" : "已按天均分基础阶段章节计划",
      "batchSchedule",
      "plannedAt",
    );
  }

  function shiftPlans(startSectionId: string, scope: ShiftScope, days: number, targetPhase: "base" | "review" = "base") {
    if (!Number.isInteger(days) || days === 0) {
      setFeedbackMessage("移动天数必须是非零整数");
      return;
    }
    const chapter = selectedBook.chapters.find((item) => item.sections.some((section) => section.id === startSectionId));
    if (targetPhase === "review") {
      if (!chapter) return;
      const sourceChapters = scope === "chapter"
        ? [chapter]
        : selectedBook.chapters.slice(selectedBook.chapters.findIndex((item) => item.id === chapter.id));
      const values: Record<string, string> = {};
      sourceChapters.forEach((item) => {
        const summary = summarizeChapterReview(item, progress);
        if (!summary.reviewed && summary.reviewedPlannedAt) {
          const date = addCalendarDays(summary.reviewedPlannedAt, days);
          item.sections.forEach((section) => { values[section.id] = date; });
        }
      });
      previewPlanChanges(values, `已将后续章节复习计划${days > 0 ? "后移" : "前移"} ${Math.abs(days)} 天`, "shift", "reviewedPlannedAt");
      setShiftSectionId(null);
      return;
    }
    const source = scope === "chapter" ? chapter?.sections ?? [] : selectedSections;
    const startIndex = source.findIndex((section) => section.id === startSectionId);
    const field = "plannedAt";
    const values: Record<string, string> = {};
    source.slice(Math.max(startIndex, 0)).forEach((section) => {
      const state = progress[section.id];
      const dateVal = state?.[field];
      const isDone = state?.learned;
      if (dateVal && !isDone) values[section.id] = addCalendarDays(dateVal, days);
    });
    const phaseLabel = "基础新学";
    previewPlanChanges(values, `已将后续${phaseLabel}计划${days > 0 ? "后移" : "前移"} ${Math.abs(days)} 天`, "shift", field);
    setShiftSectionId(null);
  }

  function currentAppData(): StudyAppData {
    return createAppData(progress, projectSettings, planHistory, journals, papers, schedule);
  }

  async function replaceCloudData(data: StudyAppData): Promise<boolean> {
    setSyncStatus("saving");
    try {
      const response = await fetch("/api/app-data", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, replace: true, baseRevision: remoteRevisionRef.current }),
      });
      if (!response.ok) throw new Error("app-data-replace-failed");
      const result = await response.json() as { revision?: number };
      if (!Number.isSafeInteger(result.revision)) throw new Error("missing-revision");
      remoteRevisionRef.current = result.revision!;
      syncBaseRef.current = data;
      repository().saveSyncBase(data);
      lastSavedPayloadRef.current = JSON.stringify({ ...data, baseRevision: result.revision, changedProgressIds: [], deletedJournalIds: [], deletedPaperIds: [] });
      deletedJournalIdsRef.current = [];
      deletedPaperIdsRef.current = [];
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
    const areaNames: Record<StudyArea, string> = { "408": "408", math: "数学", english: "英语", politics: "政治" };
    const payload = {
      ...data,
      exportedAt: new Date().toISOString(),
      projects: (["408", "math", "english", "politics"] as StudyArea[]).map((area) => ({
        id: area,
        name: areaNames[area],
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
    setFeedbackMessage("已导出全部学习数据（包含学习日志、小节新学与整章复习进度）");
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
      const isMain = workspaceId === "main" || workspaceId === "261219";
      const normalized = normalizeAppData(parsed, defaultProgress(isMain));
      if (!normalized) throw new Error("invalid-schema");
      setPendingImport({ ...normalized, appVersion: APP_VERSION });
      setFeedbackMessage("");
    } catch {
      setFeedbackMessage("导入失败：文件不是受支持的学习数据 JSON");
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const isMain = workspaceId === "main" || workspaceId === "261219";
    const repo = repository();
    const previousIds = new Set(repo.backups().map((backup) => backup.id));
    const backupsAfter = repo.createBackup(currentAppData(), "before-import");
    if (!backupsAfter.some((backup) => !previousIds.has(backup.id))) {
      setFeedbackMessage("导入前备份失败，请先导出当前数据后再重试");
      return;
    }
    const importedProgress = mergeRemoteProgress(pendingImport.progress, defaultProgress(isMain));
    const reviewMigration = migrateLegacyChapterReviews(books, importedProgress);
    if (reviewMigration.changedSectionIds.length > 0) {
      const importBackupIds = new Set(backupsAfter.map((backup) => backup.id));
      const migrationBackups = repo.createBackup(pendingImport, "before-migration");
      if (!migrationBackups.some((backup) => !importBackupIds.has(backup.id))) {
        setFeedbackMessage("导入文件中的旧复习记录无法备份，请先保留原始文件后重试");
        return;
      }
    }
    const imported = { ...pendingImport, progress: reviewMigration.progress };
    setBackups(repo.backups());
    if (!await replaceCloudData(imported)) return;
    setProgress(imported.progress);
    setProjectSettings(imported.projectSettings);
    setPlanHistory(imported.planHistory);
    setJournals(imported.journals);
    setPapers(imported.papers ?? defaultPastPapers());
    if (imported.schedule) {
      setSchedule(normalizeSchedule(imported.schedule));
    }
    repo.save(imported);
    setPendingImport(null);
    setFeedbackMessage("数据导入完成，已自动保留导入前备份");
  }

  function createManualBackup() {
    setBackups(repository().createBackup(currentAppData(), "manual"));
    setFeedbackMessage("已创建本地备份");
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    const isMain = workspaceId === "main" || workspaceId === "261219";
    const repo = repository();
    const previousIds = new Set(repo.backups().map((backup) => backup.id));
    const backupsAfter = repo.createBackup(currentAppData(), "before-restore");
    if (!backupsAfter.some((backup) => !previousIds.has(backup.id))) {
      setFeedbackMessage("恢复前备份失败，请先导出当前数据后再重试");
      return;
    }
    const source = normalizeAppData(pendingRestore.data, defaultProgress(isMain));
    if (!source) return;
    const reviewMigration = migrateLegacyChapterReviews(books, mergeRemoteProgress(source.progress, defaultProgress(isMain)));
    const restored = { ...source, progress: reviewMigration.progress };
    if (!await replaceCloudData(restored)) return;
    setProgress(restored.progress);
    setProjectSettings(restored.projectSettings);
    setPlanHistory(restored.planHistory);
    setJournals(restored.journals);
    setPapers(restored.papers ?? defaultPastPapers());
    if (restored.schedule) {
      setSchedule(normalizeSchedule(restored.schedule));
    }
    repo.save(restored);
    setBackups(repo.backups());
    setPendingRestore(null);
    setFeedbackMessage("备份恢复完成，已保留恢复前备份");
  }

  function handleDeleteBackup(id: string) {
    setBackups(repository().deleteBackup(id));
    setPendingDeleteBackup(null);
    setFeedbackMessage("已删除本地快照");
  }

  async function clearAllPaperRecords() {
    const cleanPapers = defaultPastPapers();
    setPapers(cleanPapers);
    const cleanAppData = createAppData(progress, projectSettings, planHistory, journals, cleanPapers, schedule);
    repository().save(cleanAppData);
    await replaceCloudData(cleanAppData);
    setPendingClearAllPapers(false);
    setFeedbackMessage("已成功清空全部套卷与题目的做题记录");
  }

  function updateExamStartDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setFeedbackMessage("日期格式无效：请使用 年-月-日 选择有效日期");
      return;
    }
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      setFeedbackMessage("日期无效：该日期不存在，请重新选择");
      return;
    }
    setProjectSettings((prev) => ({
      ...prev,
      "408": { ...prev["408"], examDate: value },
      math: { ...prev.math, examDate: value },
      english: { ...prev.english, examDate: value },
      ...(prev.politics ? { politics: { ...prev.politics, examDate: value } } : {}),
    }));
    setFeedbackMessage(`初试日期已更新为 ${value}`);
  }

  function renderTaskList(
    tasks: TaskEntry[],
    kind: "today" | "overdue",
    emptyMessage: string,
    onReschedule?: (sectionId: string, phase: "base" | "review") => void,
    slotArea?: string | null,
  ) {
    if (!tasks.length) return <p className="task-empty">{emptyMessage}</p>;
    return (
      <div className="task-list">
        {tasks.map(({ book, chapter, chapterTitle, section, phase }) => {
          const state = progress[section.id];
          const review = summarizeChapterReview(chapter, progress);
          const isReviewAction = phase === "review";
          const checked = isReviewAction ? review.reviewed : state?.learned;
          const isCurrentSlot = kind === "today" && Boolean(slotArea && book.area === slotArea && !checked);
          return (
            <article className={`task-row${checked ? " completed" : ""}${isCurrentSlot ? " task-row--current-slot" : ""}`} key={`${kind}-${phase ?? "task"}-${isReviewAction ? chapter.id : section.id}`}>
              <div className="task-main">
                <div className="task-title">
                  {isCurrentSlot && <span className="task-slot-tag" aria-label="当前时段课程">🎯 正在进行</span>}
                  <span>{isReviewAction ? `第${chapter.number}章` : section.number}</span><strong>{isReviewAction ? chapter.title : section.title}</strong>
                </div>
                <div className="task-context"><strong>{book.shortTitle}</strong><span>{isReviewAction ? `${review.learnedCount}/${review.sectionCount} 小节已新学` : chapterTitle}</span></div>
              </div>
              <div className="task-row-right">
                <span className={`task-date ${isReviewAction ? "unreviewed" : kind === "today" ? "today" : "overdue"}`}>
                  {kind === "today"
                    ? isReviewAction
                      ? review.reviewed ? `复习 ${formatDateShort(review.reviewedAt)}` : "计划今日复习"
                      : state?.learned ? `新学 ${formatDateShort(state.learnedAt)}` : "计划今日新学"
                    : isReviewAction
                      ? `复习逾期 ${formatDateShort(review.reviewedPlannedAt)}`
                      : `新学逾期 ${formatDateShort(state?.plannedAt ?? "")}`}
                </span>
                {kind === "overdue" && onReschedule && (
                  <button
                    type="button"
                    className="task-reschedule-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReschedule(section.id, isReviewAction ? "review" : "base");
                    }}
                    title="一键排到今日执行"
                    aria-label={`将 ${isReviewAction ? `第${chapter.number}章 ${chapter.title}` : `${section.number} ${section.title}`} 的${isReviewAction ? "复习" : "新学"}任务排到今日`}
                  >
                    + 今日
                  </button>
                )}
                <label className="task-check" title={isReviewAction && !review.canReview && !review.reviewed ? "请先完成本章全部小节的新学" : undefined}>
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    disabled={isReviewAction && !review.canReview && !review.reviewed}
                    aria-label={`${isReviewAction ? `第${chapter.number}章 ${chapter.title}` : `${section.number} ${section.title}`}，${isReviewAction ? "复习" : "新学"}完成`}
                    onChange={(event) => isReviewAction
                      ? toggleChapterReviewed(chapter, event.target.checked)
                      : toggleLearned(section.id, event.target.checked)}
                  />
                  <span />
                  <em>{isReviewAction ? "复习" : "新学"}</em>
                </label>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  const journalsBySection = useMemo(() => {
    const map: Record<string, JournalEntry[]> = {};
    journals.forEach((entry) => {
      const sections = extractJournalSections(entry.context);
      sections.forEach((sec) => {
        if (sec.sectionId) {
          if (!map[sec.sectionId]) map[sec.sectionId] = [];
          map[sec.sectionId].push(entry);
        }
      });
    });
    Object.values(map).forEach((list) => {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    return map;
  }, [journals]);

  const filteredJournals = useMemo(() => {
    return journals.filter((entry) => {
      const sections = extractJournalSections(entry.context);
      const isUnlinked = entry.context === null || (entry.context.type === "sections" && entry.context.sections.length === 0);

      if (journalFilter === "important" && !entry.important) return false;
      if (journalFilter === "unlinked" && !isUnlinked) return false;
      if (journalFilter === "linked" && isUnlinked) return false;
      if (journalFilter === "408") {
        if (entry.context?.type === "project" || entry.context?.type === "subject" || entry.context?.type === "section" || entry.context?.type === "paper") {
          if (entry.context.area !== "408") return false;
        } else if (entry.context?.type === "sections") {
          if (!entry.context.sections.some((s) => s.area === "408")) return false;
        } else {
          return false;
        }
      }
      if (journalFilter === "math") {
        if (entry.context?.type === "project" || entry.context?.type === "subject" || entry.context?.type === "section" || entry.context?.type === "paper") {
          if (entry.context.area !== "math") return false;
        } else if (entry.context?.type === "sections") {
          if (!entry.context.sections.some((s) => s.area === "math")) return false;
        } else {
          return false;
        }
      }
      if (journalFilter === "published" && entry.publish?.status !== "published") return false;

      if (journalSearchQuery.trim()) {
        const q = journalSearchQuery.trim().toLowerCase();
        const titleMatch = entry.title?.toLowerCase().includes(q) ?? false;
        const contentMatch = entry.content.toLowerCase().includes(q);
        let contextMatch = false;
        if (entry.context) {
          if (entry.context.type === "sections") {
            contextMatch = entry.context.sections.some((s) =>
              s.sectionTitle?.toLowerCase().includes(q)
              || s.bookTitle?.toLowerCase().includes(q)
              || s.sectionNumber?.toLowerCase().includes(q),
            );
          } else if (entry.context.type === "section") {
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
          } else if (entry.context.type === "paper") {
            contextMatch = Boolean(
              entry.context.paperTitle?.toLowerCase().includes(q)
              || entry.context.paperId.toLowerCase().includes(q),
            );
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
    setEditorImportant(false);
    if (context?.type === "paper") {
      setEditorPaper(context);
      setEditorSections([]);
      const paperRecord = papers.find((p) => p.id === context.paperId);
      const cleanTitle = (context.paperTitle || paperRecord?.title || "").replace(/^(\d{4}年)\s+/, "$1");
      const scoreStr = typeof paperRecord?.score === "number" ? `${paperRecord.score}` : "--";
      setEditorTitle(`【模考复盘】${cleanTitle}`);
      setEditorContent(`## 整体情况\n- **模考得分**：${scoreStr} 分\n\n## 做后感悟\n`);
    } else {
      setEditorPaper(null);
      setEditorSections(extractJournalSections(context ?? null));
    }
    setIsEditorOpen(true);
  }, [papers]);

  const openEditJournal = useCallback((journal: JournalEntry) => {
    setEditingJournalId(journal.id);
    setEditorTitle(journal.title ?? "");
    setEditorContent(journal.content);
    setEditorImportant(Boolean(journal.important));
    if (journal.context?.type === "paper") {
      setEditorPaper(journal.context);
      setEditorSections([]);
    } else {
      setEditorPaper(null);
      setEditorSections(extractJournalSections(journal.context));
    }
    setIsEditorOpen(true);
  }, []);

  const toggleJournalImportant = useCallback((id: string) => {
    setJournals((prev) => {
      const target = prev.find((entry) => entry.id === id);
      const nextImportant = !target?.important;
      setFeedbackMessage(nextImportant ? "⭐ 已标为重点日志" : "已取消重点标记");
      return prev.map((entry) => {
        if (entry.id !== id) return entry;
        return {
          ...entry,
          important: nextImportant,
          updatedAt: new Date().toISOString(),
        };
      });
    });
  }, []);

  const handleSaveJournalPayload = useCallback((payload: {
    id: string | null;
    title: string | null;
    content: string;
    important: boolean;
    context: JournalContext | null;
  }) => {
    const now = new Date().toISOString();
    const currentData = workingDataRef.current;
    if (!currentData || syncBlockedRef.current) return false;
    const currentJournals = currentData.journals;
    let nextJournals: JournalEntry[];
    if (payload.id) {
      if (!currentJournals.some((entry) => entry.id === payload.id)) return false;
      nextJournals = currentJournals.map((entry) => {
        if (entry.id !== payload.id) return entry;
        return {
          ...entry,
          title: payload.title,
          content: payload.content,
          context: payload.context,
          important: payload.important,
          updatedAt: now,
        };
      });
    } else {
      const newId = generateUniqueJournalId(currentJournals, dateToday());
      const newEntry: JournalEntry = {
        id: newId,
        createdAt: now,
        updatedAt: now,
        title: payload.title,
        content: payload.content,
        context: payload.context,
        important: payload.important,
        publish: {
          status: "local",
          publishedAt: null,
          blogUrl: null,
          blogPostId: null,
        },
      };
      nextJournals = [newEntry, ...currentJournals];
    }

    const nextData = { ...currentData, journals: nextJournals };
    if (!repository().save(nextData)) return false;
    workingDataRef.current = nextData;
    setJournals(nextJournals);
    setFeedbackMessage(payload.id ? "日志已更新到本机，正在同步云端" : "日志已保存到本机，正在同步云端");

    setIsEditorOpen(false);
    setEditingJournalId(null);
    setEditorTitle("");
    setEditorContent("");
    setEditorImportant(false);
    setEditorSections([]);
    setEditorPaper(null);
    return true;
  }, [repository]);

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
    const sections = extractJournalSections(journal.context);
    const sectionTitleFallback = sections.length > 0
      ? `${sections.map((s) => `${s.bookTitle ?? ""} ${s.sectionNumber ?? ""} ${s.sectionTitle ?? ""}`.trim()).join(" / ")} 学习记录`
      : "";
    setPublishTitle(journal.title ?? sectionTitleFallback);
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
    return <main className="auth-shell"><div className="auth-card"><strong>正在连接学习空间</strong><p>正在读取云端进度…</p></div></main>;
  }

  if (authState === "locked") {
    return (
      <main className="auth-shell">
        <form className={`auth-card ${isShaking ? "shaking" : ""}`} onSubmit={login}>
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
          <p
            className={`sync-note sync-note--${syncMeta.cls}`}
            role="status"
            aria-live="polite"
            title={`同步状态: ${syncMeta.desc} · 用户: ${workspaceUserLabel}`}
          >
            <i className={syncStatus === "saved" ? "synced" : ""} />
            <span>{syncMeta.label}</span>
            <em>{workspaceUserLabel}</em>
          </p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar" aria-label="全局操作">
          <h1 className="topbar-title" id={`${activePage}-title`} tabIndex={-1}>{pageTitles[activePage]}</h1>
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
              <SubjectPicker selectedBook={selectedBook} onChange={selectBookAcrossAreas} />
              <div className="area-switcher" role="group" aria-label="切换学习领域">
                {(["408", "math"] as StudyArea[]).map((area) => (
                  <button
                    className={activeArea === area ? "active" : ""}
                    type="button"
                    key={area}
                    aria-pressed={activeArea === area}
                    onClick={() => {
                      hasUserExplicitlyNavigatedRef.current = true;
                      setActiveArea(area);
                      saveLastViewedStudyState({ activeArea: area });
                      setExpandedChapters([]);
                      setCatalogFilter("all");
                    }}
                  >
                    {area === "408" ? "408" : "数学"}
                  </button>
                ))}
              </div>
            </div>}
            {activePage === "sprint" && <div className="study-switchers sprint-top-switchers">
              <SprintAreaPicker activeArea={activeArea} onChange={selectSprintArea} />
            </div>}
            <span
              className={`topbar-sync topbar-sync--${syncMeta.cls}`}
              role="status"
              title={`同步状态: ${syncMeta.desc}`}
            >
              <i aria-hidden="true" />
              <span>{syncMeta.label}</span>
            </span>
            <div className="topbar-more-wrap" ref={topbarMoreRef}>
              <button
                className={`topbar-more${activePage === "schedule" || activePage === "settings" ? " active" : ""}`}
                type="button"
                ref={topbarMoreButtonRef}
                aria-label={`更多页面，同步状态：${syncMeta.label}`}
                aria-expanded={topbarMoreOpen}
                aria-controls="mobile-more-pages"
                onClick={() => { setTopbarMoreOpen((open) => !open); setCatalogMoreOpen(false); }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                <i className={`topbar-more-dot topbar-more-dot--${syncMeta.cls}`} aria-hidden="true" />
              </button>
              <div className="topbar-more-panel" id="mobile-more-pages" role="group" aria-label="更多页面" hidden={!topbarMoreOpen}>
                {(["settings"] as AppPage[]).map((page) => (
                  <button type="button" key={page} aria-current={activePage === page ? "page" : undefined} onClick={() => navigateMobile(page)}>
                    <MobileNavIcon page={page} />
                    <span>{pageTitles[page]}</span>
                  </button>
                ))}
                <span className={`topbar-more-status topbar-more-status--${syncMeta.cls}`} role="status"><i aria-hidden="true" />{syncMeta.label}</span>
              </div>
            </div>
            <button className="logout-button" type="button" onClick={logout}>退出</button>
          </div>
          <nav className="mobile-navigation" aria-label="移动端页面导航">
            {mobileNavigation.map(({ page, label }) => (
              <button
                className={activePage === page ? "active" : ""}
                type="button"
                key={page}
                aria-current={activePage === page ? "page" : undefined}
                onClick={() => navigateMobile(page)}
                data-page={page}
              >
                <span className="mobile-nav-symbol"><MobileNavIcon page={page} /></span>
                <strong>{label}</strong>
              </button>
            ))}
          </nav>
        </header>

        <div className={`page-content page-content--${activePage}`}>
          {feedbackMessage && <div className="feedback-notice feedback-notice--global" role="status"><span>{feedbackMessage}</span><button type="button" aria-label="关闭提示" onClick={() => setFeedbackMessage("")}>×</button></div>}
          {(activePage === "analytics" || activePage === "settings") && <h2 className="mobile-secondary-heading" aria-hidden="true">{pageTitles[activePage]}</h2>}
          {activePage === "progress" ? <>
          <section className="mobile-progress-overview" aria-label="学习概览与本周节奏">
            <div className="mobile-progress-overview-head">
              <SubjectPicker selectedBook={selectedBook} onChange={selectBookAcrossAreas} className="book-select--mobile-overview" />
              <span className={`mobile-progress-percent${activeProgressPercent === 100 ? " complete" : ""}`}>{activeProgressPercent}%</span>
            </div>
            <details className="mobile-week-disclosure">
              <summary>本周 {weeklyDaysCount} 天学习 · {weeklySectionCount} 项完成<span>查看节奏</span></summary>
              <div className="mobile-week-content">
                <p>新学 {learnedCount}/{selectedSections.length} 小节 · 复习 {reviewedCount}/{selectedBook.chapters.length} 章</p>
                <div className="week-dots" aria-label="本周打卡记录">
                  {weekDots.map((day) => (
                    <div key={day.dateStr}>
                      <span className={`dot ${day.isDone ? "dot--done" : ""} ${day.isToday ? "dot--today" : ""}`} title={`${day.dateStr} ${day.isDone ? "已打卡" : "未打卡"}`} />
                      <small>{day.label}</small>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </section>
          <section className="hero-grid" aria-label="学习概览与节奏">
            <article className="hero-card progress-card">
              <div className="card-heading">
                <div>
                  <h2 className="progress-card-title">{selectedBook.title}</h2>
                  <SubjectPicker selectedBook={selectedBook} onChange={selectBookAcrossAreas} className="book-select--hero" />
                </div>
                <span className="status-pill status-pill--calm">
                  {isReviewPhase ? (reviewedCount === selectedBook.chapters.length ? "全部完成" : "强化阶段") : "基础阶段"}
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
                  新学 <strong>{learnedCount}/{selectedSections.length}</strong> 小节，复习 <strong>{reviewedCount}/{selectedBook.chapters.length}</strong> 章
                </p>
                {currentSection ? (
                  <button
                    className="current-learning-link"
                    type="button"
                    aria-label={`跳转到${currentSectionLabel}：${isReviewPhase && currentReviewChapter ? `第${currentReviewChapter.number}章 ${currentReviewChapter.title}` : `${currentSection.number} ${currentSection.title}`}`}
                    onClick={jumpToCurrentSection}
                  >
                    {currentSectionLabel}：<strong>{isReviewPhase && currentReviewChapter ? `第${currentReviewChapter.number}章 ${currentReviewChapter.title}` : `${currentSection.number} ${currentSection.title}`}</strong>
                  </button>
                ) : (
                  <p>{currentSectionLabel}：<strong>{phaseCompleteLabel}</strong></p>
                )}
                {!currentSection && hasDifferentGlobalRecent && globalRecentBook && globalRecentSection && (
                  <button
                    className="current-learning-link"
                    type="button"
                    style={{ marginTop: "0.4rem", opacity: 0.9 }}
                    aria-label={`回到最近学习科目：${globalRecentBook.shortTitle} ${globalRecentSection.number} ${globalRecentSection.title}`}
                    onClick={jumpToGlobalRecent}
                  >
                    📍 最近学习：<strong>{globalRecentBook.shortTitle} · {globalRecentSection.number} {globalRecentSection.title}</strong>
                  </button>
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

              <div className="rhythm-metrics" aria-label={`本周学习 ${weeklyDaysCount} 天，完成 ${weeklySectionCount} 项新学或复习动作`}>
                <div className="rhythm-metric">
                  <strong>{weeklyDaysCount}</strong><span>天已学</span>
                </div>
                <i aria-hidden="true" />
                <div className="rhythm-metric">
                  <strong>{weeklySectionCount}</strong><span>项完成</span>
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
              <div><h2>目录</h2><span>{catalogFilter === "unreviewed" ? `${filteredChapters.length} 章待复习` : `${filteredChapters.length} 章 · ${filteredSectionCount} 小节`}{planEditMode ? " · 编辑中" : ""}</span></div>
              <div className="catalog-tools">
                <label className="catalog-filter-mobile">
                  <span className="visually-hidden">筛选目录</span>
                  <select value={catalogFilter} onChange={(event) => { setCatalogFilter(event.target.value as CatalogFilter); setFilterChaptersCollapsed(true); setFilteredChapterOverrides({}); }}>
                    <option value="all">全部</option>
                    <option value="unlearned">未新学</option>
                    <option value="unreviewed">未复习</option>
                    <option value="overdue">逾期</option>
                  </select>
                </label>
                <div className="catalog-filters" aria-label="目录筛选">
                  {([
                    ["all", "全部"],
                    ["unlearned", "未新学"],
                    ["unreviewed", "未复习"],
                    ["overdue", "逾期"],
                  ] as [CatalogFilter, string][]).map(([value, label]) => (
                    <button className={catalogFilter === value ? "active" : ""} type="button" key={value} aria-pressed={catalogFilter === value} onClick={() => { setCatalogFilter(value); setFilterChaptersCollapsed(true); setFilteredChapterOverrides({}); }}><span>{label}</span></button>
                  ))}
                </div>
                <button className={`catalog-action catalog-action--desktop${planEditMode ? " active" : ""}`} type="button" onClick={() => setPlanEditMode((value) => !value)}>{planEditMode ? "完成编辑" : "编辑计划"}</button>
                <button
                  className="catalog-action catalog-action--desktop"
                  type="button"
                  disabled={filteredChapters.length === 0}
                  onClick={toggleCatalogExpansion}
                >
                  {effectiveAllExpanded ? "全部折叠" : "全部展开"}
                </button>
                <div className="catalog-more" ref={catalogMoreRef}>
                  <button
                    className={`catalog-more-trigger${planEditMode ? " active" : ""}`}
                    type="button"
                    ref={catalogMoreButtonRef}
                    aria-label={planEditMode ? "目录操作，正在编辑计划" : "目录操作"}
                    aria-expanded={catalogMoreOpen}
                    aria-controls="catalog-more-options"
                    onClick={() => { setCatalogMoreOpen((open) => !open); setTopbarMoreOpen(false); }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                  </button>
                  <div className="catalog-more-list" id="catalog-more-options" role="group" aria-label="目录操作" hidden={!catalogMoreOpen}>
                    <button type="button" onClick={() => { setPlanEditMode((value) => !value); setCatalogMoreOpen(false); catalogMoreButtonRef.current?.focus(); }}>{planEditMode ? "完成编辑" : "编辑计划"}</button>
                    <button type="button" disabled={filteredChapters.length === 0} onClick={() => { toggleCatalogExpansion(); setCatalogMoreOpen(false); catalogMoreButtonRef.current?.focus(); }}>{effectiveAllExpanded ? "全部折叠" : "全部展开"}</button>
                  </div>
                </div>
              </div>
            </div>

            {planUndo && <div className="plan-notice"><span>{planUndo.message}</span><button type="button" onClick={undoPlanChange}>撤销</button></div>}
            {filteredChapters.length === 0 && (
              <div className="catalog-empty" role="status">
                <strong>当前筛选没有匹配的{catalogFilter === "unreviewed" ? "章节" : "小节"}</strong>
                <p>可以切换筛选条件，或查看本学科的全部目录。</p>
                <button type="button" onClick={() => setCatalogFilter("all")}>查看全部</button>
              </div>
            )}
            <div className="chapter-grid">
              {filteredChapters.map(({ chapter, visibleSections }) => {
                const chapterIndex = selectedBook.chapters.findIndex((item) => item.id === chapter.id);
                const open = catalogFilter !== "all"
                  ? filteredChapterOverrides[chapter.id] ?? !filterChaptersCollapsed
                  : expandedChapters.includes(chapter.id) || (chapter.id === currentChapterId && collapsedCurrentChapterId !== chapter.id);
                const review = summarizeChapterReview(chapter, progress);
                const reviewScheduleStatus = chapterReviewPlanStatus(chapter, progress, dateToday());
                const chapterComplete = review.allLearned && review.reviewed;
                const chapterOverdue = chapter.sections.some((section) => basePlanStatus(progress[section.id]) === "overdue")
                  || reviewScheduleStatus === "overdue";
                const baseDates = chapter.sections.map((section) => progress[section.id]?.plannedAt ?? "").filter(Boolean).sort();
                const overdueBaseDate = chapter.sections
                  .filter((section) => basePlanStatus(progress[section.id]) === "overdue")
                  .map((section) => progress[section.id]?.plannedAt ?? "")
                  .filter(Boolean).sort()[0];
                const nextBaseDate = chapter.sections
                  .filter((section) => !progress[section.id]?.learned)
                  .map((section) => progress[section.id]?.plannedAt ?? "")
                  .filter(Boolean).sort()[0];
                const learnedCompletedAt = chapterCompletionDate(chapter.sections, progress, "learned");
                const baseDateLabel = learnedCompletedAt
                  ? `完成 ${formatDateShort(learnedCompletedAt)}`
                  : overdueBaseDate
                    ? `逾期 ${formatDateShort(overdueBaseDate)}`
                    : nextBaseDate
                      ? `计划 ${formatDateShort(nextBaseDate)}`
                      : "";
                const reviewDateLabel = review.reviewedAt
                  ? `完成 ${formatDateShort(review.reviewedAt)}`
                  : review.reviewedPlannedAt
                    ? `${reviewScheduleStatus === "overdue" ? "逾期" : "计划"} ${formatDateShort(review.reviewedPlannedAt)}`
                    : "";
                const range = chapterRanges[chapter.id] ?? {
                  start: baseDates[0] ?? "",
                  end: baseDates[baseDates.length - 1] ?? baseDates[0] ?? "",
                  includeCompleted: false,
                };

                return (
                  <article className={`chapter-card${chapter.id === currentChapterId ? " current" : ""}${chapterOverdue ? " overdue" : ""}${chapterComplete ? " completed" : ""}${open ? " open" : ""}`} id={`chapter-${chapter.id}`} key={chapter.id}>
                    <div className="chapter-header">
                      <button
                        className="chapter-button"
                        type="button"
                        onClick={() => toggleChapterExpansion(chapter.id, open)}
                        aria-expanded={open}
                      >
                        <span className="chapter-index" aria-hidden="true">{String(chapterIndex + 1).padStart(2, "0")}</span>
                        <span className="chapter-name">
                          <small>第{chapter.number}章</small>
                          <strong>{chapter.title}</strong>
                          <span className="chapter-meta">
                            {chapter.id === currentChapterId && <span className="chapter-state-marker current">当前章</span>}
                            {chapterOverdue && <span className="chapter-state-marker overdue">逾期</span>}
                            {!review.allLearned && baseDates.length > 0 && <em>{formatPlanRange(baseDates, "基础")}</em>}
                          </span>
                          <span className="chapter-mobile-meta">
                            新学 {review.learnedCount}/{review.sectionCount}{open ? "" : ` · ${review.reviewed ? `已复习${review.reviewedAt ? ` ${formatDateShort(review.reviewedAt)}` : ""}` : review.canReview ? "待复习" : "未复习"}`}
                          </span>
                        </span>
                      </button>

                      <div className="chapter-progress">
                        <span className="chapter-count-group" aria-label={`本章新学 ${review.learnedCount}/${review.sectionCount} 小节${baseDateLabel ? `，${baseDateLabel}` : ""}`}>
                          <span className="chapter-count-learned">新学 {review.learnedCount}/{review.sectionCount}</span>
                          {baseDateLabel && <span className={`chapter-count-date${overdueBaseDate && !learnedCompletedAt ? " overdue" : ""}`}>{baseDateLabel}</span>}
                        </span>
                        {open ? <div className="chapter-review-inline">
                          <div className="chapter-review-plan">
                            <span className="chapter-review-plan-desktop-label">计划</span>
                            <span className="chapter-review-plan-mobile-label">计划</span>
                            <EditableDate
                              value={review.reviewedPlannedAt}
                              emptyLabel="未安排"
                              tone={planTone(reviewScheduleStatus === "today" ? "due_today" : reviewScheduleStatus)}
                              ariaLabel={`第${chapter.number}章 ${chapter.title} 复习计划日期`}
                              onChange={(value) => updateChapterReviewedPlannedAt(chapter, value)}
                            />
                          </div>
                          <label className="chapter-review-check" title={!review.canReview && !review.reviewed ? "请先完成本章全部小节的新学" : undefined}>
                            <input type="checkbox" checked={review.reviewed} disabled={!review.canReview && !review.reviewed}
                              aria-label={`第${chapter.number}章 ${chapter.title} 复习完成`}
                              onChange={(event) => toggleChapterReviewed(chapter, event.target.checked)} />
                            <span /><b>{review.reviewed ? "已复习" : "标记复习"}</b>
                          </label>
                          {review.reviewed && (
                            <div className="chapter-review-date">
                              <span>完成</span>
                              {review.canReview ? (
                                <EditableDate value={review.reviewedAt} emptyLabel="未记录"
                                  ariaLabel={`第${chapter.number}章 ${chapter.title} 复习完成日期`}
                                  validate={(value) => !value ? "复习日期不能为空；如需取消，请取消勾选" : null}
                                  onError={setFeedbackMessage}
                                  onChange={(value) => toggleChapterReviewed(chapter, true, value)} />
                              ) : (
                                <span title="补齐本章全部小节的新学记录后可修改复习日期">{review.reviewedAt ? formatDateChinese(review.reviewedAt) : "未记录"}</span>
                              )}
                            </div>
                          )}
                          {planEditMode && chapter.sections[0] && (
                            <div className="shift-anchor chapter-review-shift">
                              <button type="button" onClick={() => setShiftSectionId(shiftSectionId === chapter.id ? null : chapter.id)}>移动复习计划</button>
                              {shiftSectionId === chapter.id && (
                                <div className="shift-popover">
                                  <select value={shiftScope} onChange={(event) => setShiftScope(event.target.value as ShiftScope)} aria-label="复习计划移动范围"><option value="chapter">本章</option><option value="subject">本章及后续章节</option></select>
                                  {[-3, -2, -1, 1, 2, 3].map((days) => <button type="button" key={days} onClick={() => shiftPlans(chapter.sections[0].id, shiftScope, days, "review")}>{days > 0 ? "+" : ""}{days}天</button>)}
                                  <input type="number" value={shiftDays} onChange={(event) => setShiftDays(Number(event.target.value))} aria-label="自定义移动天数" />
                                  <button type="button" disabled={!Number.isInteger(shiftDays) || shiftDays === 0} onClick={() => shiftPlans(chapter.sections[0].id, shiftScope, shiftDays, "review")}>确定</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div> : (
                          <span className={`chapter-count-group chapter-review-summary${chapterComplete ? " complete" : ""}`} aria-label={`${review.reviewed ? "已复习" : "未复习"}${reviewDateLabel ? `，${reviewDateLabel}` : ""}`}>
                            <span className="chapter-count-review">{review.reviewed ? "已复习" : review.canReview ? "待复习" : "未复习"}</span>
                            {reviewDateLabel && <span className={`chapter-count-date${reviewScheduleStatus === "overdue" ? " overdue" : ""}`}>{reviewDateLabel}</span>}
                          </span>
                        )}
                      </div>

                      <button
                        className="chapter-expand-button"
                        type="button"
                        onClick={() => toggleChapterExpansion(chapter.id, open)}
                        aria-label={`${open ? "收起" : "展开"}第${chapter.number}章 ${chapter.title}`}
                        aria-expanded={open}
                      ><span className="chevron" aria-hidden="true" /></button>
                    </div>

                    {open && (
                      <>

                      {planEditMode && (
                        <div className="chapter-plan-editor">
                          <span>新学计划区间</span>
                          <input type="date" value={range.start} aria-label={`${chapter.title}基础新学计划开始日期`} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, start: event.target.value } }))} />
                          <b>—</b>
                          <input type="date" value={range.end} aria-label={`${chapter.title}基础新学计划结束日期`} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, end: event.target.value } }))} />
                          <label><input type="checkbox" checked={range.includeCompleted} onChange={(event) => setChapterRanges((current) => ({ ...current, [chapter.id]: { ...range, includeCompleted: event.target.checked } }))} />包含已完成项</label>
                          <button type="button" onClick={() => setChapterPlan(chapter.sections, range, "uniform")}>统一日期</button>
                          <button type="button" onClick={() => setChapterPlan(chapter.sections, range, "spread")}>按天均分</button>
                        </div>
                      )}
                      <div className={`section-table${planEditMode ? " editing" : ""}`}>
                        <div className="section-head" aria-hidden="true">
                          <span>小节</span><span>新学计划</span><span>新学</span>
                        </div>
                        {visibleSections.map((section) => {
                          const state = progress[section.id];
                          const baseStatus = basePlanStatus(state);
                          const rowStatus = baseStatus;
                          const isCurrent = !isReviewPhase && currentSection?.id === section.id;
                          const sectionJournals = journalsBySection[section.id] ?? [];
                          const detailsOpen = expandedSectionRows.includes(section.id);
                          const nextPlanLabel = state?.learned
                            ? `新学于 ${formatDateChinese(state.learnedAt)}`
                            : `新学计划${state?.plannedAt ? ` ${formatDateChinese(state.plannedAt)}` : "未设置"}`;
                          return (
                            <div
                              className={`section-row ${rowStatus}${isCurrent ? " is-current" : ""}${detailsOpen && !planEditMode ? " is-detail-open" : ""}`}
                              id={`section-${section.id}`}
                              aria-current={isCurrent ? "step" : undefined}
                              key={section.id}
                            >
                              <div className="section-mobile-summary">
                                <button
                                  type="button"
                                  className="section-mobile-disclosure"
                                  aria-expanded={detailsOpen}
                                  aria-label={`${section.number} ${section.title}，${state?.learned ? "已新学" : "待新学"}，${nextPlanLabel}，${detailsOpen ? "收起详情" : "展开详情"}`}
                                  onClick={() => setExpandedSectionRows((current) => current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id])}
                                >
                                  <span className="section-mobile-number">{section.number}</span>
                                  <span className="section-mobile-copy">
                                    <strong>{section.title}</strong>
                                    <span className="section-mobile-meta">
                                      {isCurrent && <em>当前</em>}
                                      <span>{state?.learned ? "已新学" : "待新学"}</span>
                                      <span aria-hidden="true">·</span>
                                      <span>{nextPlanLabel}</span>
                                      {sectionJournals.length > 0 && <span>· 日志 {sectionJournals.length}</span>}
                                    </span>
                                  </span>
                                  <span className="section-mobile-chevron" aria-hidden="true" />
                                </button>
                                <div className="section-mobile-primary">
                                  {state?.learned ? (
                                    <span className="section-mobile-complete">已新学</span>
                                  ) : (
                                    <button
                                      type="button"
                                      aria-label={`标记 ${section.number} ${section.title} 新学完成`}
                                      onClick={() => toggleLearned(section.id, true)}
                                    >
                                      <b>完成新学</b>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="section-name">
                                <span className="section-num">{section.number}</span>
                                <strong title={`${section.number} ${section.title}`}>{section.title}</strong>
                                {isCurrent && <i title={currentSectionLabel} />}
                                <div className="section-actions">
                                  {!state?.learned && !isCurrent && (
                                    <button
                                      type="button"
                                      className="section-set-current-btn"
                                      title="设为当前学习小节"
                                      onClick={() => setCurrentSection(section.id)}
                                    >
                                      设为当前
                                    </button>
                                  )}
                                  {sectionJournals.length > 0 && (
                                    <button
                                      type="button"
                                      className="section-journal-badge"
                                      title={`查看此小节的 ${sectionJournals.length} 条学习日志`}
                                      aria-label={`查看此小节的 ${sectionJournals.length} 条学习日志`}
                                      onClick={() => setActiveDrawerSectionId(section.id)}
                                    >
                                      📝 <span>{sectionJournals.length}</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="section-record-btn"
                                    title="写一条关于该小节的学习日志"
                                    aria-label={`写一条关于 ${section.number} 的学习日志`}
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
                                    <span className="record-plus">+</span>
                                    <span className="record-label">记</span>
                                    <span className="record-label-mobile">写日志</span>
                                  </button>
                                </div>
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
                                {state?.learned && <EditableDate value={state.learnedAt} emptyLabel="未记录" ariaLabel={`${section.number} 新学完成日期`} validate={(value) => !value ? "新学日期不能为空；如需取消，请取消勾选" : review.reviewedAt && value > review.reviewedAt ? "新学日期不能晚于本章复习日期" : null} onError={setFeedbackMessage} onChange={(value) => updateProgress(section.id, { learnedAt: value })} />}
                              </div>

                              {planEditMode && (
                                <div className="shift-anchor">
                                  <button type="button" onClick={() => setShiftSectionId(shiftSectionId === section.id ? null : section.id)}>移动</button>
                                  {shiftSectionId === section.id && (
                                    <div className="shift-popover">
                                      <select value={shiftScope} onChange={(event) => setShiftScope(event.target.value as ShiftScope)} aria-label="移动范围"><option value="chapter">本章后续</option><option value="subject">本科目后续</option></select>
                                      {[-3, -2, -1, 1, 2, 3].map((days) => <button type="button" key={days} onClick={() => shiftPlans(section.id, shiftScope, days, "base")}>{days > 0 ? "+" : ""}{days}天</button>)}
                                      <input type="number" value={shiftDays} onChange={(event) => setShiftDays(Number(event.target.value))} aria-label="自定义移动天数" />
                                      <button type="button" disabled={!Number.isInteger(shiftDays) || shiftDays === 0} onClick={() => shiftPlans(section.id, shiftScope, shiftDays, "base")}>确定</button>
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
                    <span className="desktop-density-copy">✍ 写今日记录</span><span className="mobile-density-copy">写记录</span>
                  </button>
                  <button
                    type="button"
                    className="journal-action-btn journal-action-btn--ghost"
                    onClick={() => {
                      const el = document.getElementById("journal-timeline-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <span className="desktop-density-copy">↓ 学习日志 ({journals.length})</span><span className="mobile-density-copy">日志 {journals.length} ↓</span>
                  </button>
                </div>
              </div>

              <div className="today-cockpit-workbench">
                {/* ── 左侧：复习课表 (紧凑自适应，约占 69%) ── */}
                <div className="cockpit-left-schedule">
                  <div className="cockpit-schedule-topbar">
                    <div className="cockpit-schedule-title-group">
                      <span className="cockpit-badge">作息</span>
                      <h3>复习课表</h3>
                      <span className="cockpit-week-indicator">第 {cockpitWeek} 周</span>
                    </div>

                    <div className="cockpit-schedule-controls">
                      {activeScheduleInfo.status === "in_progress" && activeScheduleInfo.activeEvent ? (
                        <div className="cockpit-live-indicator" title="当前时段正在进行">
                          <span className="cockpit-live-dot" />
                          <span>进行中: {activeScheduleInfo.activeEvent.title}</span>
                        </div>
                      ) : (
                        <div className="cockpit-rest-indicator" title="当前为空隙休息时段">
                          <span className="cockpit-rest-dot" />
                          <span>
                            ☕ 休息中
                            {activeScheduleInfo.status === "rest_break" && activeScheduleInfo.restBreak
                              ? ` (${activeScheduleInfo.restBreak.label} · 剩 ${activeScheduleInfo.remainingMinutes}m)`
                              : activeScheduleInfo.intermissionNextEvent && activeScheduleInfo.startsInMinutes <= 60
                              ? ` · 距下节 ${activeScheduleInfo.intermissionNextEvent.title} 剩 ${activeScheduleInfo.startsInMinutes}m`
                              : ""}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        className="cockpit-action-btn"
                        onClick={() => navigateMobile("schedule")}
                        title="查看/编辑全屏课表"
                      >
                        ⤢ 全屏/设置
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="today-schedule-toggle"
                    aria-controls="today-schedule-detail"
                    aria-expanded={todayScheduleExpanded}
                    onClick={() => setTodayScheduleExpanded((current) => !current)}
                  >
                    {todayScheduleExpanded ? "收起今日课程" : "查看今日全部课程"}
                    <span aria-hidden="true">{todayScheduleExpanded ? "⌃" : "⌄"}</span>
                  </button>
                  <div id="today-schedule-detail" className={`today-schedule-detail${todayScheduleExpanded ? " is-open" : ""}`}>
                  <TimetableGrid
                    schedule={schedule}
                    activeInfo={activeScheduleInfo}
                    todayStr={today}
                    activeWeek={cockpitWeek}
                    onSelectEvent={(evt) => {
                      setCockpitFocusedEvent((prev) => (prev?.id === evt.id ? null : evt));
                    }}
                    isCompact={true}
                    focusedEventId={cockpitFocusedEvent?.id ?? null}
                  />
                  <TodayDaySchedule
                    schedule={schedule}
                    todayStr={today}
                    activeInfo={activeScheduleInfo}
                    focusedEventId={cockpitFocusedEvent?.id ?? null}
                    onSelectEvent={(event) => setCockpitFocusedEvent((previous) => previous?.id === event.id ? null : event)}
                  />
                  </div>
                </div>

                {/* ── 右侧：今日任务 (右上) + 逾期任务 (右下)，不超过左侧一半宽 ── */}
                <div className="cockpit-right-tasks">
                  {cockpitFocusedEvent && (
                    <div className="cockpit-focus-bar">
                      <div className="cockpit-focus-info">
                        <span className="focus-icon">🎯</span>
                        <span className="focus-label">
                          已聚焦: <strong>{cockpitFocusedEvent.title}</strong>
                          {cockpitFocusedEvent.linkedArea ? ` (${cockpitFocusedEvent.linkedArea})` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="cockpit-clear-focus-btn"
                        onClick={() => setCockpitFocusedEvent(null)}
                      >
                        显示全部 ×
                      </button>
                    </div>
                  )}

                  {/* ── 右上：今日任务 ── */}
                  <section className="task-panel task-panel--today task-panel--cockpit" aria-labelledby="today-plan-title">
                    <header>
                      <div className="task-panel-heading">
                        <span className="task-panel-badge">01</span>
                        <div className="task-panel-title-group">
                          <h2 id="today-plan-title">今日任务</h2>
                          <span className="task-panel-subtitle">
                            {displayedTodayCompleted} / {displayedTodayPlan.length} 项完成
                          </span>
                        </div>
                      </div>
                      <div className="task-panel-stat">
                        <strong className="stat-num">{displayedTodayPlan.length}</strong>
                        <span className="stat-unit">项</span>
                      </div>
                    </header>
                    {renderTaskList(
                      displayedTodayPlan,
                      "today",
                      cockpitFocusedEvent
                        ? `今天没有安排【${cockpitFocusedEvent.title}】的任务。`
                        : "今天没有安排小节，完成的任务会保留在这里。",
                      undefined,
                      activeSlotArea,
                    )}
                  </section>

                  {/* ── 右下：逾期任务 ── */}
                  <section className="task-panel task-panel--overdue task-panel--cockpit" aria-labelledby="overdue-title">
                    <header>
                      <div className="task-panel-heading">
                        <span className="task-panel-badge">02</span>
                        <div className="task-panel-title-group">
                          <h2 id="overdue-title">逾期任务</h2>
                          <span className="task-panel-subtitle">
                            新学 {displayedOverdueTasks.filter((t) => t.phase === "base").length} · 复习 {displayedOverdueTasks.filter((t) => t.phase === "review").length}
                          </span>
                        </div>
                      </div>
                      <div className={`task-panel-stat ${displayedOverdueTasks.length > 0 ? "stat--overdue" : ""}`}>
                        <strong className="stat-num">{displayedOverdueTasks.length}</strong>
                        <span className="stat-unit">项</span>
                      </div>
                    </header>
                    {renderTaskList(
                      displayedOverdueTasks,
                      "overdue",
                      cockpitFocusedEvent
                        ? `暂无【${cockpitFocusedEvent.title}】相关的逾期任务。`
                        : "没有逾期任务，节奏保持得很好。",
                      rescheduleToToday,
                      null,
                    )}
                  </section>
                </div>
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

                  <div className="journal-filter-pills" role="group" aria-label="日志筛选">
                    {([
                      ["all", "全部"],
                      ["important", "⭐ 重点"],
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
                        aria-pressed={journalFilter === key}
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
                      {journalSearchQuery || journalFilter !== "all" ? (
                        <button
                          type="button"
                          className="journal-action-btn journal-action-btn--secondary"
                          onClick={() => { setJournalSearchQuery(""); setJournalFilter("all"); }}
                        >
                          清除搜索和筛选
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="journal-action-btn journal-action-btn--secondary"
                          onClick={() => openCreateJournal(null)}
                        >
                          ✍ 立即记录第一条
                        </button>
                      )}
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
                              <article className={`journal-card ${entry.important ? "journal-card--important" : ""}`} key={entry.id}>
                                <div className="journal-card-meta">
                                  <div className="journal-card-badges">
                                    {entry.important && (
                                      <span className="journal-important-badge" title="重点日志，需经常复盘">
                                        ⭐ 重点
                                      </span>
                                    )}
                                    <span className="journal-time-tag">{formatTimeShort(entry.createdAt)}</span>
                                    {entry.context && (() => {
                                      const sections = extractJournalSections(entry.context);
                                      if (sections.length > 0) {
                                        return sections.map((sec) => (
                                          <button
                                            key={sec.sectionId}
                                            type="button"
                                            className={`journal-context-badge area-${sec.area}`}
                                            title={`${sec.bookTitle ?? ""} ${sec.sectionNumber ?? ""} ${sec.sectionTitle ?? ""}`.trim()}
                                            onClick={() => setActiveDrawerSectionId(sec.sectionId)}
                                          >
                                            📖 {sec.bookTitle} · {sec.sectionNumber} {sec.sectionTitle}
                                          </button>
                                        ));
                                      }
                                      if (entry.context.type === "subject") {
                                        return (
                                          <button
                                            type="button"
                                            className={`journal-context-badge area-${entry.context.area}`}
                                            title={entry.context.bookTitle ?? entry.context.bookId}
                                          >
                                            📚 {entry.context.bookTitle ?? entry.context.bookId}
                                          </button>
                                        );
                                      }
                                      if (entry.context.type === "project") {
                                        return (
                                          <button
                                            type="button"
                                            className={`journal-context-badge area-${entry.context.area}`}
                                            title={entry.context.area === "408" ? "408" : "数学"}
                                          >
                                            🎯 {entry.context.area === "408" ? "408" : "数学"}
                                          </button>
                                        );
                                      }
                                      if (entry.context?.type === "paper") {
                                        const paperCtx = entry.context;
                                        return (
                                          <button
                                            type="button"
                                            className={`journal-context-badge area-${paperCtx.area}`}
                                            title={paperCtx.paperTitle}
                                            onClick={() => {
                                              setActiveArea(paperCtx.area);
                                              setActivePage("sprint");
                                            }}
                                          >
                                            🎯 {paperCtx.paperTitle}
                                          </button>
                                        );
                                      }
                                      return null;
                                    })()}
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

                                  <JournalActions label={`${formatTimeShort(entry.createdAt)} 日志操作`}>
                                    <button
                                      type="button"
                                      className={`journal-btn-tool journal-btn-tool--star ${entry.important ? "is-active" : ""}`}
                                      onClick={() => toggleJournalImportant(entry.id)}
                                      title={entry.important ? "取消重点标记" : "标记为重点日志"}
                                    >
                                      {entry.important ? "★ 重点" : "☆ 设为重点"}
                                    </button>
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
                                  </JournalActions>
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
          ) : activePage === "sprint" ? (
            <section className="page-view sprint-page" aria-labelledby="sprint-title">
              <div className="sprint-mobile-intro">
                <div className="sprint-mobile-heading">
                  <h2>套卷冲刺</h2>
                  <label className="sprint-mobile-subject">
                    <span className="visually-hidden">选择冲刺科目</span>
                    <span aria-hidden="true">{sprintAreaLabels[activeArea]} <svg viewBox="0 0 16 16" fill="none"><path d="m4.5 6 3.5 3.5L11.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                    <select value={activeArea} onChange={(event) => selectSprintArea(event.target.value as StudyArea)}>
                      {(["408", "math", "english", "politics"] as StudyArea[]).map((area) => <option key={area} value={area}>{sprintAreaLabels[area]}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="sprint-macro-grid">
                {/* Card 1: 历年统考真题 */}
                <article className="sprint-stat-card sprint-stat-card--dual">
                  <div className="stat-card-main">
                    <div className="stat-card-head">
                      <span>历年统考真题</span>
                      <strong>{sprintPastCompleted} <small className="stat-unit">套</small></strong>
                    </div>
                    <div className="stat-card-body">
                      <div className="stat-card-progress-bar">
                        <div className="stat-card-progress-fill" style={{ width: `${sprintPastPercent}%` }} />
                      </div>
                      {sprintPastYearRange && (
                        <span className="stat-card-sub">{sprintPastYearRange} 年真题 · 共 {sprintPastTotal} 套</span>
                      )}
                    </div>
                  </div>

                  <div className="stat-card-score-box">
                    <span className="score-box-label">真题平均分</span>
                    <div className="score-box-num">
                      <strong>{sprintPastAvgScore}</strong>
                      {sprintPastAvgScore !== "--" && (
                        <small className="stat-unit">/ {maxPaperScore(activeArea)} 分</small>
                      )}
                    </div>
                  </div>
                </article>

                {/* Card 2: 模拟试题 (408 / 数学) 或 客观选择题专项 (英语 / 政治) */}
                {(activeArea === "english" || activeArea === "politics") ? (
                  <article className="sprint-stat-card sprint-stat-card--dual">
                    <div className="stat-card-main">
                      <div className="stat-card-head">
                        <span>{activeArea === "politics" ? "政治选择题 (客观题)" : "英语选择题 (客观题)"}</span>
                        <strong>{choiceOnlyStats?.count ?? 0} <small className="stat-unit">套</small></strong>
                      </div>
                      <div className="stat-card-body">
                        <div className="stat-card-progress-bar">
                          <div
                            className="stat-card-progress-fill"
                            style={{
                              width: `${sprintPastTotal ? Math.round(((choiceOnlyStats?.count ?? 0) / sprintPastTotal) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span className="stat-card-sub">按答题卡选择作答统计</span>
                      </div>
                    </div>

                    <div className="stat-card-score-box">
                      <span className="score-box-label">{activeArea === "politics" ? "选择题均分" : "选择题加权均分"}</span>
                      <div className="score-box-num">
                        <strong>{choiceOnlyStats?.avgChoiceScore ?? "--"}</strong>
                        {Boolean(choiceOnlyStats?.avgChoiceScore) && (
                          <small className="stat-unit">/ {choiceFullScore(activeArea)} 分</small>
                        )}
                      </div>
                    </div>
                  </article>
                ) : (
                  <article className="sprint-stat-card sprint-stat-card--dual">
                    <div className="stat-card-main">
                      <div className="stat-card-head">
                        <span>模拟试题</span>
                        <strong>{sprintMockCompleted} <small className="stat-unit">套</small></strong>
                      </div>
                      <div className="stat-card-body">
                        <div className="sprint-endless-track">
                          <div className="endless-bar">
                            <div
                              className="endless-fill"
                              style={{ width: `${Math.min(100, Math.round((sprintMockCompleted / MOCK_MILESTONE_TARGET) * 100))}%` }}
                            />
                          </div>
                          <div className="endless-ticks">
                            {MOCK_MILESTONES.map((step) => {
                              const isReached = sprintMockCompleted >= step;
                              return (
                                <span
                                  key={step}
                                  className={`endless-tick ${isReached ? "is-reached" : ""}`}
                                >
                                  {step}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="stat-card-score-box">
                      <span className="score-box-label">模拟卷平均分</span>
                      <div className="score-box-num">
                        <strong>{sprintMockAvgScore}</strong>
                        {sprintMockAvgScore !== "--" && (
                          <small className="stat-unit">/ {maxPaperScore(activeArea)} 分</small>
                        )}
                      </div>
                    </div>
                  </article>
                )}
              </div>

              <button
                type="button"
                className="sprint-library-entry"
                onClick={() => setIsPaperNetdiskOpen(true)}
                aria-label="打开试卷云盘"
              >
                <span className="sprint-library-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7.5h5.2l2.1 2.2H21v9.1a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.8V7.5Z" />
                    <path d="M3 7.5V5.2A1.7 1.7 0 0 1 4.7 3.5h4.1l2 2.1h8.5A1.7 1.7 0 0 1 21 7.3v2.4" />
                    <path d="M8.1 14.9h7.8M8.1 17.5h5.1" />
                  </svg>
                </span>
                <span className="sprint-library-copy">
                  <strong>试卷云盘</strong>
                  <span className="sprint-library-mobile-copy">查看试卷文件</span>
                </span>
                <span className="sprint-library-action" aria-hidden="true">
                  <span>打开云盘</span>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10h11m-4-4 4 4-4 4" />
                  </svg>
                </span>
              </button>

              <div className="sprint-toolbar">
                <div className="sprint-filter-section">
                  <span className="sprint-filter-label">类型</span>
                  <div className="sprint-tab-group" role="tablist" aria-label="试卷类型筛选">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveSprintTab === "all"}
                      className={effectiveSprintTab === "all" ? "active" : ""}
                      onClick={() => setSprintTab("all")}
                    >
                      全部 ({sprintAreaPapers.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveSprintTab === "past"}
                      className={effectiveSprintTab === "past" ? "active" : ""}
                      onClick={() => setSprintTab("past")}
                    >
                      历年真题 ({sprintPastTotal})
                    </button>
                    {activeArea !== "english" && activeArea !== "politics" && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={effectiveSprintTab === "mock"}
                        className={effectiveSprintTab === "mock" ? "active" : ""}
                        onClick={() => setSprintTab("mock")}
                      >
                        模拟试题 ({sprintMockTotal})
                      </button>
                    )}
                  </div>
                </div>

                <div className="sprint-toolbar-right">
                  <div className="sprint-filter-section">
                    <span className="sprint-filter-label">状态</span>
                    <div className="sprint-status-filters" role="group" aria-label="完成状态筛选">
                      <button
                        type="button"
                        className={sprintStatusFilter === "all" ? "active" : ""}
                        onClick={() => setSprintStatusFilter("all")}
                      >
                        全部
                      </button>
                      <button
                        type="button"
                        className={sprintStatusFilter === "uncompleted" ? "active" : ""}
                        onClick={() => setSprintStatusFilter("uncompleted")}
                      >
                        未完成
                      </button>
                      <button
                        type="button"
                        className={sprintStatusFilter === "completed" ? "active" : ""}
                        onClick={() => setSprintStatusFilter("completed")}
                      >
                        已完成
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sprint-mobile-controls">
                <label className="sprint-mobile-type">
                    <span className="visually-hidden">试卷类型</span>
                    <select value={effectiveSprintTab} onChange={(event) => {
                      const value = event.target.value;
                      if (value === "all" || value === "past" || value === "mock") setSprintTab(value);
                    }}>
                      <option value="all">全部试卷</option>
                      <option value="past">历年真题</option>
                      {(activeArea === "408" || activeArea === "math") && <option value="mock">模拟试题</option>}
                    </select>
                </label>
                <details className="sprint-mobile-filter">
                  <summary>筛选{(sprintStatusFilter !== "all" || pastPaperSortOrder !== "desc") && <span className="sprint-mobile-filter-dot"> · 已调整</span>}</summary>
                  <div className="sprint-mobile-filter-panel">
                    <label>完成状态
                      <select value={sprintStatusFilter} onChange={(event) => {
                        const value = event.target.value;
                        if (value === "all" || value === "uncompleted" || value === "completed") setSprintStatusFilter(value);
                      }}>
                        <option value="all">全部</option>
                        <option value="uncompleted">未完成</option>
                        <option value="completed">已完成</option>
                      </select>
                    </label>
                    <label>真题排序
                      <select value={pastPaperSortOrder} onChange={(event) => setPastPaperSortOrder(event.target.value === "asc" ? "asc" : "desc")}>
                        <option value="desc">最新优先</option>
                        <option value="asc">最早优先</option>
                      </select>
                    </label>
                    {(activeArea === "408" || activeArea === "math") && <button type="button" className="sprint-mobile-add-mock" onClick={() => setIsAddMockModalOpen(true)}>+ 添加模拟卷</button>}
                  </div>
                </details>
              </div>

              <div className="sprint-bento-container">
                {(effectiveSprintTab === "all" || effectiveSprintTab === "past") && (
                  <section className="sprint-section" aria-labelledby="past-bento-heading">
                    <div className={`sprint-section-header${sprintMockTotal === 0 ? " sprint-section-header--mobile-collapsed" : ""}`}>
                      <div className="sprint-header-title-group">
                        <h3 id="past-bento-heading">真题</h3>
                        <span className="sprint-count-badge">{visiblePastPapers.length} 套</span>
                      </div>
                      <div className="sprint-sort-filters" role="group" aria-label="真题年份排序">
                        <button
                          type="button"
                          className={`sprint-sort-btn ${pastPaperSortOrder === "desc" ? "active" : ""}`}
                          onClick={() => setPastPaperSortOrder("desc")}
                          title="按年份倒序排列 (2026 ➔ 2010)"
                        >
                          倒序 ↓
                        </button>
                        <button
                          type="button"
                          className={`sprint-sort-btn ${pastPaperSortOrder === "asc" ? "active" : ""}`}
                          onClick={() => setPastPaperSortOrder("asc")}
                          title="按年份正序排列 (2010 ➔ 2026)"
                        >
                          正序 ↑
                        </button>
                      </div>
                    </div>
                    {visiblePastPapers.length === 0 ? (
                      <div className="sprint-empty-card">
                        <p>
                          {sprintStatusFilter === "completed"
                            ? "当前科目暂无已完成的真题记录"
                            : sprintStatusFilter === "uncompleted"
                            ? "当前科目的真题已全部完成"
                            : "暂无历年真题"}
                        </p>
                      </div>
                    ) : (
                      <div className="sprint-bento-grid">
                        {visiblePastPapers.map((paper) => (
                          <PaperCard
                            key={paper.id}
                            paper={paper}
                            activeArea={activeArea}
                            paperJournals={journalsByPaper[paper.id] ?? []}
                            maxScore={maxPaperScore(activeArea)}
                            onUpdateScore={(id, score) => updatePaper(id, { score })}
                            onToggleCompleted={(id, completed) => togglePaperCompleted(id, completed)}
                            onToggleSecondRound={(id, secondRound) => togglePaperSecondRound(id, secondRound)}
                            onOpenAnswerSheet={(id) => setActivePaperQuestionModalId(id)}
                            onOpenCreateJournal={(p) => openCreateJournal({
                              type: "paper",
                              area: activeArea,
                              paperId: p.id,
                              paperTitle: p.title,
                            })}
                            onViewJournals={(p) => {
                              setJournalSearchQuery(p.title);
                              setActivePage("today");
                            }}
                            onChangeCompletedAt={(id, completedAt) => updatePaper(id, { completedAt })}
                            qSummary={getPaperQuestionSummary(paper)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )}

                  {(effectiveSprintTab === "all" || effectiveSprintTab === "mock") && activeArea !== "english" && activeArea !== "politics" && (
                    <section className="sprint-section" aria-labelledby="mock-bento-heading">
                      <div className="sprint-section-header">
                        <h3 id="mock-bento-heading">模拟题</h3>
                        <button
                          type="button"
                          className="btn-add-mock-paper"
                          onClick={() => setIsAddMockModalOpen(true)}
                        >
                          + 添加模拟卷
                        </button>
                      </div>

                      {visibleMockPapers.length === 0 ? (
                        <div className="sprint-empty-card">
                          <p>
                            {sprintStatusFilter === "completed"
                              ? "当前科目暂无已完成的模拟卷记录"
                              : sprintStatusFilter === "uncompleted"
                              ? (mockPapers.length === 0 ? "暂无模拟试卷，点击右上角添加" : "当前科目的模拟卷已全部完成")
                              : "暂无模拟试卷，点击右上角添加"}
                          </p>
                        </div>
                      ) : (
                        <div className="sprint-bento-grid">
                          {visibleMockPapers.map((paper) => (
                            <PaperCard
                              key={paper.id}
                              paper={paper}
                              activeArea={activeArea}
                              paperJournals={journalsByPaper[paper.id] ?? []}
                              maxScore={maxPaperScore(activeArea)}
                              onUpdateScore={(id, score) => updatePaper(id, { score })}
                              onToggleCompleted={(id, completed) => togglePaperCompleted(id, completed)}
                              onToggleSecondRound={(id, secondRound) => togglePaperSecondRound(id, secondRound)}
                              onOpenAnswerSheet={(id) => setActivePaperQuestionModalId(id)}
                              onOpenCreateJournal={(p) => openCreateJournal({
                                type: "paper",
                                area: activeArea,
                                paperId: p.id,
                                paperTitle: p.title,
                              })}
                              onViewJournals={(p) => {
                                setJournalSearchQuery(p.title);
                                setActivePage("today");
                              }}
                              onDelete={(id) => setPendingDeletePaperId(id)}
                              onChangeCompletedAt={(id, completedAt) => updatePaper(id, { completedAt })}
                              qSummary={getPaperQuestionSummary(paper)}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </div>
            </section>
          ) : activePage === "schedule" ? (
            <section className="page-view schedule-page" aria-labelledby="schedule-title">
              <button className="schedule-mobile-back" type="button" onClick={() => navigateMobile("today")}>‹ 返回今日</button>
              <ScheduleView
                schedule={schedule}
                todayStr={dateToday()}
                onUpdateSchedule={setSchedule}
                onWriteJournal={() => {
                  openCreateJournal(null);
                }}
                onJumpToTasks={(area) => {
                  if (area === "408" || area === "math") {
                    setActiveArea(area);
                    setActivePage("progress");
                  }
                }}
                onBackToToday={() => setActivePage("today")}
              />
            </section>
          ) : SHOW_DATA_ANALYSIS && activePage === "analytics" ? (
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
                <h2>备考进度概览</h2>
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
                      <span>已复习 {analyticsReviewedChapters}/{analyticsChapterCount} 章</span>
                    </div>
                  </div>
                </article>
              </div>

              <div className="analytics-section-title">
                <div className="section-dot" />
                <h2>打卡记录与周度趋势</h2>
              </div>

              <AnalyticsActivity heatmapDays={heatmapDays} weeklyTrends={weeklyTrends} currentWeekTrend={currentWeekTrend} weeklyAverage={weeklyAverage} peakWeekActions={peakWeekActions} maxWeeklyAction={maxWeeklyAction} formatDateChinese={formatDateChinese} />

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

                  <button
                    type="button"
                    className="settings-schedule-toggle"
                    aria-controls="settings-exam-schedule"
                    aria-expanded={settingsScheduleExpanded}
                    onClick={() => setSettingsScheduleExpanded((current) => !current)}
                  >
                    {settingsScheduleExpanded ? "收起考试科目安排" : "查看考试科目安排"}
                    <span aria-hidden="true">{settingsScheduleExpanded ? "⌃" : "⌄"}</span>
                  </button>
                  <div id="settings-exam-schedule" className={`schedule-board-grid${settingsScheduleExpanded ? " is-open" : ""}`}>
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
                          <span className="desktop-density-copy">导出全部数据</span><span className="mobile-density-copy">导出数据</span>
                        </button>
                        <button type="button" className="settings-btn settings-btn--secondary" onClick={() => importInputRef.current?.click()}>
                          <span className="desktop-density-copy">导入 JSON</span><span className="mobile-density-copy">导入</span>
                        </button>
                        <button type="button" className="settings-btn settings-btn--danger" onClick={() => setPendingClearAllPapers(true)} title="清空全部学科历年真题与模拟卷的做题与打分记录">
                          <span className="desktop-density-copy">清空套卷完成记录 ⚠️</span><span className="mobile-density-copy">清空套卷</span>
                        </button>
                      </div>
                      {storageLoadIssue && (
                        <button className="recovery-export" type="button" onClick={downloadRecoveryData}>
                          导出无法迁移的原始数据
                        </button>
                      )}
                      <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" tabIndex={-1} aria-hidden="true" onChange={readImportFile} />
                    </div>

                    <div className="data-management-panel data-management-panel--backups">
                      <div className="data-management-heading">
                        <div className="backup-title-wrap">
                          <h3>本地快照</h3>
                          <span className="backup-count-badge">{backups.length} / 15</span>
                        </div>
                        <button className="backup-create" type="button" onClick={createManualBackup}>
                          <span className="desktop-density-copy">立即创建备份</span><span className="mobile-density-copy">创建备份</span>
                        </button>
                      </div>
                      <p><span className="desktop-density-copy">导入、恢复和旧数据迁移前会自动生成快照，最多保留 15 份。</span><span className="mobile-density-copy">导入、恢复前自动备份，保留 15 份。</span></p>
                      <div className="backup-list" role={backups.length ? "region" : undefined} aria-label={backups.length ? "本地备份快照列表" : undefined} tabIndex={backups.length ? 0 : undefined}>
                        {backups.length ? (
                          backups.map((backup) => (
                            <article className="backup-item" key={backup.id}>
                              <div className="backup-item__info">
                                <span className={`backup-tag backup-tag--${backup.kind}`}>
                                  {backupKindLabel(backup.kind)}
                                </span>
                                <span className="backup-item__time">{formatLocalDateTime(backup.createdAt)}</span>
                                <span className="backup-item__meta">
                                  {Object.keys(backup.data?.progress ?? {}).length}节 · {backup.data?.journals?.length ?? 0}日志 · {backup.data?.papers?.length ?? 0}试卷
                                </span>
                              </div>
                              <div className="backup-item__actions">
                                <button className="backup-item__restore" type="button" onClick={() => setPendingRestore(backup)}>
                                  恢复
                                </button>
                                <button
                                  className="backup-item__delete"
                                  type="button"
                                  title="删除该快照"
                                  onClick={() => setPendingDeleteBackup(backup)}
                                >
                                  删除
                                </button>
                              </div>
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

                <section className="settings-card settings-card--account">
                  <header className="settings-card__header">
                    <div>
                      <h2>账号与登录</h2>
                      <p>当前空间：{workspaceUserLabel}<span className="desktop-density-copy">。可在此退出登录。</span></p>
                    </div>
                  </header>
                  <div className="settings-actions">
                    <button type="button" className="settings-btn settings-btn--danger" onClick={logout}>
                      退出登录
                    </button>
                  </div>
                </section>

                <section className="settings-card settings-card--blog">
                  <header className="settings-card__header">
                    <div>
                      <h2>关于</h2>
                    </div>
                  </header>
                  <div className="blog-settings-content">
                    <div className="blog-info-item">
                      <span>版本号</span>
                      <strong>V2.0</strong>
                    </div>
                    <div className="blog-info-item">
                      <span>个人博客站点</span>
                      <a href="https://craig9re5.github.io/" target="_blank" rel="noreferrer">
                        https://craig9re5.github.io/ ↗
                      </a>
                    </div>
                  </div>
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
            <p>{planPreview.message}，共影响 {visiblePlanPreviewEntries(planPreview.values, planPreview.field).length} 个未完成{planPreview.field === "reviewedPlannedAt" ? "章节" : "小节"}。</p>
            <div className="plan-preview-list">
              {visiblePlanPreviewEntries(planPreview.values, planPreview.field).map(([sectionId, nextDate]) => {
                const task = projectTasks.find(({ section }) => section.id === sectionId) ?? projectTaskEntries(activeArea === "408" ? "math" : "408").find(({ section }) => section.id === sectionId);
                const isReviewPlan = planPreview.field === "reviewedPlannedAt";
                const currentVal = isReviewPlan && task
                  ? summarizeChapterReview(task.chapter, progress).reviewedPlannedAt
                  : progress[sectionId]?.[planPreview.field || "plannedAt"];
                const title = task
                  ? isReviewPlan
                    ? `${task.book.shortTitle} · 第${task.chapter.number}章 ${task.chapter.title}`
                    : `${task.book.shortTitle} · ${task.section.number} ${task.section.title}`
                  : sectionId;
                return <article key={sectionId}><div><strong>{title}</strong><span>{isReviewPlan ? "整章复习计划" : task?.chapterTitle ?? ""}</span></div><p><del>{currentVal ? formatDateShort(currentVal) : "未设置"}</del><i>→</i><b>{nextDate ? formatDateShort(nextDate) : "未设置"}</b></p></article>;
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
      {pendingDeleteBackup && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog confirm-dialog--danger" role="dialog" aria-modal="true" aria-labelledby="delete-backup-dialog-title">
            <span className="dialog-kicker">{backupKindLabel(pendingDeleteBackup.kind)} · {formatLocalDateTime(pendingDeleteBackup.createdAt)}</span>
            <h2 id="delete-backup-dialog-title">确认删除该本地快照？</h2>
            <p>删除后此份历史快照将无法再用于恢复，当前数据不受影响。</p>
            <div className="confirm-actions">
              <button type="button" className="btn-cancel" onClick={() => setPendingDeleteBackup(null)}>取消</button>
              <button type="button" className="btn-confirm btn-confirm--danger" onClick={() => handleDeleteBackup(pendingDeleteBackup.id)}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingClearAllPapers && (
        <div className="confirm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setPendingClearAllPapers(false); }}>
          <div className="confirm-dialog confirm-dialog--danger" role="dialog" aria-modal="true" aria-labelledby="clear-papers-dialog-title">
            <span className="dialog-kicker">危险操作 · 数据重置</span>
            <h2 id="clear-papers-dialog-title">确认清空全部套卷完成记录？</h2>
            <p>确定要清空全部套卷和题目的完成记录与打分吗？此操作将重置 408、数学、英语所有历年真题与模拟卷的做题状态、得分与错题点阵，并在云端和本地同步生效。</p>
            <div className="confirm-actions">
              <button type="button" className="btn-cancel" onClick={() => setPendingClearAllPapers(false)}>取消</button>
              <button type="button" className="btn-confirm btn-confirm--danger" onClick={() => void clearAllPaperRecords()}>
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingClearSectionId && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-progress-title">
            <h2 id="clear-progress-title">取消本章复习记录？</h2>
            <p>取消此小节的新学会同时取消本章复习并清除本章复习完成日期；其他小节的新学记录保留。</p>
            <div><button type="button" onClick={() => setPendingClearSectionId(null)}>取消操作</button><button className="danger" type="button" onClick={() => { clearLearned(pendingClearSectionId); setPendingClearSectionId(null); }}>确认清除</button></div>
          </div>
        </div>
      )}

      {/* Journal Editor Modal */}
      {isEditorOpen && (
        <Suspense fallback={null}>
        <JournalEditorModal
          editingJournalId={editingJournalId}
          initialTitle={editorTitle}
          initialContent={editorContent}
          initialImportant={editorImportant}
          initialPaper={editorPaper}
          initialSections={editorSections}
          books={books}
          draftScope={workspaceId || "main"}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingJournalId(null);
          }}
          onSave={handleSaveJournalPayload}
        />
        </Suspense>
      )}

      {/* Blog Publish Modal */}
      {blogPublishJournal && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-dialog confirm-dialog--wide blog-publish-dialog" role="dialog" aria-modal="true" aria-labelledby="blog-publish-title">
            <span className="dialog-kicker">GitHub Blog 一键发布</span>
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
                    <article className={`drawer-journal-card ${entry.important ? "drawer-journal-card--important" : ""}`} key={entry.id}>
                      <div className="drawer-card-meta">
                        <div className="drawer-meta-left">
                          {entry.important && (
                            <span className="journal-important-badge" title="重点日志">
                              ⭐ 重点
                            </span>
                          )}
                          <span className="drawer-date-tag">{formatDateChinese(entry.createdAt.slice(0, 10))} {formatTimeShort(entry.createdAt)}</span>
                        </div>
                        <div className="drawer-card-tools">
                          <button
                            type="button"
                            className={entry.important ? "drawer-tool--starred" : ""}
                            onClick={() => toggleJournalImportant(entry.id)}
                            title={entry.important ? "取消重点标记" : "标为重点"}
                          >
                            {entry.important ? "★ 重点" : "☆ 设为重点"}
                          </button>
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

      {/* Paper Score Modal */}
      {editingScorePaper && (() => {
        const currentPaper = papers.find((p) => p.id === editingScorePaper.id);
        const maxScoreLimit = currentPaper?.area === "politics" ? 50 : currentPaper?.area === "english" ? 100 : 150;
        return (
          <div className="confirm-overlay" role="presentation">
            <div className="confirm-dialog paper-score-dialog" role="dialog" aria-modal="true" aria-labelledby="paper-score-dialog-title">
              <span className="dialog-kicker">全真模拟考记录</span>
              <h2 id="paper-score-dialog-title">模考成绩录入</h2>
              <p className="paper-score-sub">记录本套试卷的真实得分（0~{maxScoreLimit} 分）</p>
              <div className="paper-modal-form">
                <label className="publish-form-field">
                  <span className="field-label">得分 (0~{maxScoreLimit} 分)</span>
                  <input
                    type="number"
                    min={0}
                    max={maxScoreLimit}
                    step={0.5}
                    placeholder="如：78.5"
                    value={editingScorePaper.score}
                    onChange={(e) => setEditingScorePaper({ ...editingScorePaper, score: e.target.value })}
                    autoFocus
                  />
                </label>
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn-cancel" onClick={() => setEditingScorePaper(null)}>取消</button>
                <button
                  type="button"
                  className="btn-confirm"
                  onClick={() => {
                    const scoreVal = editingScorePaper.score.trim() === "" ? null : parseFloat(editingScorePaper.score);
                    updatePaper(editingScorePaper.id, {
                      score: Number.isNaN(scoreVal) ? null : scoreVal,
                    });
                    setEditingScorePaper(null);
                    setFeedbackMessage("已保存模考成绩");
                  }}
                >
                  保存成绩
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Mock Paper Modal */}
      {isAddMockModalOpen && (
        <div className="confirm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setIsAddMockModalOpen(false); }}>
          <div className="confirm-dialog paper-mock-dialog" role="dialog" aria-modal="true" aria-labelledby="add-mock-dialog-title">
            <h2 id="add-mock-dialog-title">添加 {activeArea === "408" ? "408" : "数学"} 模拟试卷</h2>
            <div className="paper-modal-form">
              <label className="paper-form-field">
                <span className="field-label">试卷名称 <strong>*</strong></span>
                <input
                  type="text"
                  placeholder={activeArea === "408" ? "如：王道 8 套卷 · 卷一 / 王道 4 套卷 · 卷二" : "如：李林 6 套卷 · 卷一 / 合工大超越 · 卷二"}
                  value={newMockTitle}
                  onChange={(e) => setNewMockTitle(e.target.value)}
                  autoFocus
                />
              </label>
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn-cancel" onClick={() => setIsAddMockModalOpen(false)}>取消</button>
              <button
                type="button"
                className="btn-confirm"
                disabled={!newMockTitle.trim()}
                onClick={handleAddMockPaper}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Mock Paper Modal */}
      {pendingDeletePaperId && (
        <div className="confirm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setPendingDeletePaperId(null); }}>
          <div className="confirm-dialog confirm-dialog--danger" role="dialog" aria-modal="true" aria-labelledby="delete-mock-dialog-title">
            <h2 id="delete-mock-dialog-title">确认删除该模拟试卷？</h2>
            <p>删除后将清除此模拟试卷的做题记录与得分，关联的错题复盘日志仍将保留。</p>
            <div className="confirm-actions">
              <button type="button" className="btn-cancel" onClick={() => setPendingDeletePaperId(null)}>取消</button>
              <button type="button" className="btn-confirm btn-confirm--danger" onClick={() => handleDeleteMockPaper(pendingDeletePaperId)}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Question Board Modal */}
      {activeQuestionPaper && (
        <Suspense fallback={null}>
        <AnswerSheetModal
          paper={activeQuestionPaper}
          onClose={() => {
            const summary = answerSheetScore(activeQuestionPaper);
            const synced = syncAnswerSheetScore(activeQuestionPaper);
            if (summary.total !== null || synced.completed !== activeQuestionPaper.completed) {
              updatePaper(activeQuestionPaper.id, {
                score: synced.score,
                completed: synced.completed,
                completedAt: synced.completedAt,
              });
            }
            setActivePaperQuestionModalId(null);
          }}
          onToggleQuestion={(num, isSingleChoice) => togglePaperQuestion(activeQuestionPaper.id, num, isSingleChoice)}
          onMarkAllQuestions={(state) => markAllPaperQuestions(activeQuestionPaper.id, state)}
          onSubjectiveRating={(qNum, rating, maxScore) => handleSubjectiveRating(activeQuestionPaper.id, qNum, rating, maxScore)}
          onSubjectiveScoreInput={(qNum, rawVal, maxScore) => handleSubjectiveScoreInput(activeQuestionPaper.id, qNum, rawVal, maxScore)}
          onBatchSetWrong={(wrongStr) => batchSetWrongQuestions(activeQuestionPaper.id, wrongStr)}
          onClearQuestions={() => clearPaperQuestions(activeQuestionPaper.id)}
          onCreateWrongJournal={(paper) => {
            const cleanTitle = paper.title.replace(/^(\d{4}年)\s+/, "$1");
            const scoreStr = typeof paper.score === "number" ? `${paper.score}` : "--";
            const title = `【模考复盘】${cleanTitle}`;
            const template = `## 整体情况\n- **模考得分**：\${scoreStr} 分\n\n## 做后感悟\n`;
            openCreateJournal({
              type: "paper",
              area: paper.area,
              paperId: paper.id,
              paperTitle: cleanTitle,
            });
            setEditorTitle(title);
            setEditorContent(template);
            setActivePaperQuestionModalId(null);
          }}
          getPaperQuestionSummary={getPaperQuestionSummary}
        />
        </Suspense>
      )}

      {/* Paper Netdisk Modal */}
      {isPaperNetdiskOpen && (
        <Suspense fallback={null}>
          <PaperNetdiskModal
            isOpen={isPaperNetdiskOpen}
            onClose={() => setIsPaperNetdiskOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );

}
