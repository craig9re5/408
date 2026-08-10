"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { books, type Book, type Section } from "./data/books";

type SectionProgress = {
  learned: boolean;
  learnedAt: string;
  reviewed: boolean;
  reviewedAt: string;
  plannedAt: string;
};

type ProgressMap = Record<string, SectionProgress>;
type AuthState = "locked" | "authenticated";
type SyncStatus = "loading" | "saving" | "saved" | "offline" | "error";

const STORAGE_KEY = "408-section-progress-v1";

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
        };
      });
    });
  });

  return progress;
}

function allSections(book: Book): Section[] {
  return book.chapters.flatMap((chapter) => chapter.sections);
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

function planTone(plannedAt: string, learned: boolean): "late" | "soon" | "normal" | "empty" {
  if (!plannedAt) return "empty";
  if (learned) return "normal";
  const today = dateToday();
  if (plannedAt < today) return "late";
  const due = new Date(`${today}T00:00:00`);
  const planned = new Date(`${plannedAt}T00:00:00`);
  const days = Math.round((planned.getTime() - due.getTime()) / 86_400_000);
  return days <= 2 ? "soon" : "normal";
}

function calculateDaysUntilExam(): number {
  const today = new Date();
  const target = new Date("2026-12-19T00:00:00");
  const diffTime = target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
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

function calculateStreak(progress: ProgressMap): number {
  const activeDates = new Set<string>();
  Object.values(progress).forEach((entry) => {
    if (entry.learnedAt) activeDates.add(entry.learnedAt);
    if (entry.reviewedAt) activeDates.add(entry.reviewedAt);
  });

  const todayStr = dateToday();
  let streak = 0;
  const checkDate = new Date();

  if (!activeDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = new Date(checkDate.getTime() - checkDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    if (activeDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
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
  onChange,
}: {
  value: string;
  emptyLabel: string;
  ariaLabel: string;
  prefix?: string;
  tone?: "late" | "soon" | "normal" | "empty";
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

function readLocalProgress(): ProgressMap | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;

    const defaults = defaultProgress();
    Object.keys(defaults).forEach((sectionId) => {
      const entry = (saved as Record<string, unknown>)[sectionId];
      if (!entry || typeof entry !== "object") return;
      const value = entry as Record<string, unknown>;
      const reviewedAt = typeof value.reviewedAt === "string" ? value.reviewedAt : "";
      defaults[sectionId] = {
        learned: Boolean(value.learned),
        learnedAt: typeof value.learnedAt === "string" ? value.learnedAt : "",
        reviewed: Boolean(value.reviewed) && Boolean(reviewedAt),
        reviewedAt,
        plannedAt: typeof value.plannedAt === "string" ? value.plannedAt : defaults[sectionId].plannedAt,
      };
    });
    return defaults;
  } catch {
    return null;
  }
}

function mergeRemoteProgress(remote: Record<string, SectionProgress>, includeLocal: boolean): ProgressMap {
  const local = includeLocal ? readLocalProgress() : null;
  const merged = local ?? defaultProgress();
  Object.keys(merged).forEach((sectionId) => {
    const value = remote[sectionId];
    if (!value || typeof value !== "object") return;
    const reviewedAt = typeof value.reviewedAt === "string" ? value.reviewedAt : "";
    merged[sectionId] = {
      ...merged[sectionId],
      learned: Boolean(value.learned),
      learnedAt: typeof value.learnedAt === "string" ? value.learnedAt : "",
      reviewed: Boolean(value.reviewed) && Boolean(reviewedAt),
      reviewedAt,
      plannedAt: typeof value.plannedAt === "string" ? value.plannedAt : merged[sectionId].plannedAt,
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
  const [selectedBookId, setSelectedBookId] = useState("operating-system");
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressMap>(defaultProgress);
  const [loaded, setLoaded] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("locked");
  const [inviteCode, setInviteCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const loadRemoteProgress = useCallback(async (includeLocal: boolean) => {
    const response = await fetch("/api/progress", { cache: "no-store" });
    if (response.status === 401) {
      setAuthState("locked");
      setLoaded(false);
      return;
    }
    if (!response.ok) throw new Error("progress-load-failed");

    const body = await response.json() as { progress?: Record<string, SectionProgress> };
    const remote = body.progress ?? {};
    setProgress(mergeRemoteProgress(remote, includeLocal && Object.keys(remote).length === 0));
    setLoaded(true);
    setSyncStatus("saved");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const body = await response.json() as { authenticated?: boolean; progress?: Record<string, SectionProgress> };
        if (cancelled) return;
        if (!body.authenticated) return;
        setAuthState("authenticated");
        setProgress(mergeRemoteProgress(body.progress ?? {}, true));
        setLoaded(true);
        setSyncStatus("saved");
      } catch {
        // Keep the invite form visible so a transient session-check failure
        // does not block the user from trying to log in.
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [loadRemoteProgress]);

  useEffect(() => {
    if (!loaded || authState !== "authenticated") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));

    const timer = window.setTimeout(async () => {
      setSyncStatus("saving");
      try {
        const response = await fetch("/api/progress", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ progress }),
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
  }, [authState, loaded, progress]);

  useEffect(() => {
    if (authState !== "authenticated") return;

    const refresh = async () => {
      try {
        await loadRemoteProgress(false);
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
  }, [authState, loadRemoteProgress]);

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
      const body = await response.json() as { error?: string; progress?: Record<string, SectionProgress> };
      if (!response.ok) {
        setAuthError(body.error ?? "邀请码不正确");
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        setIsSubmitting(false);
        return;
      }
      setAuthState("authenticated");
      setProgress(mergeRemoteProgress(body.progress ?? {}, true));
      setLoaded(true);
      setSyncStatus("saved");
    } catch {
      setAuthError("暂时无法连接同步服务，请稍后重试");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setIsSubmitting(false);
    }
  }, [isSubmitting]);

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
  }

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? books[2];
  const selectedSections = useMemo(() => allSections(selectedBook), [selectedBook]);
  const learnedCount = selectedSections.filter((section) => progress[section.id]?.learned).length;
  const reviewedCount = selectedSections.filter((section) => progress[section.id]?.reviewed).length;
  const progressPercent = selectedSections.length ? Math.round((learnedCount / selectedSections.length) * 100) : 0;
  const currentSection = selectedSections.find((section) => !progress[section.id]?.learned);

  const allBooksSections = useMemo(() => books.flatMap((b) => allSections(b)), []);
  const totalLearnedAllBooks = useMemo(() => {
    return allBooksSections.filter((s) => progress[s.id]?.learned).length;
  }, [allBooksSections, progress]);

  const overallProgressPercent = allBooksSections.length
    ? Math.round((totalLearnedAllBooks / allBooksSections.length) * 100)
    : 0;

  const daysUntilExam = useMemo(() => calculateDaysUntilExam(), []);
  const streakDays = useMemo(() => calculateStreak(progress), [progress]);
  const weekDots = useMemo(() => getWeekDaysActivity(progress), [progress]);

  function updateProgress(sectionId: string, next: Partial<SectionProgress>) {
    setProgress((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], ...next },
    }));
  }

  function toggleLearned(sectionId: string, checked: boolean) {
    if (checked) {
      updateProgress(sectionId, { learned: true, learnedAt: dateToday() });
      return;
    }

    updateProgress(sectionId, {
      learned: false,
      learnedAt: "",
      reviewed: false,
      reviewedAt: "",
    });
  }

  function toggleReviewed(sectionId: string, checked: boolean) {
    updateProgress(sectionId, {
      reviewed: checked,
      reviewedAt: checked ? dateToday() : "",
    });
  }

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
            <span style={{ width: `${overallProgressPercent}%` }} />
          </div>
          <div className="semester-card__meta">
            <span>总进度 {overallProgressPercent}%</span>
            <span>12.19</span>
          </div>
        </div>

        <nav className="subject-progress" aria-label="切换学习科目">
          <h2>科目进度</h2>
          {books.map((book) => {
            const sections = allSections(book);
            const completed = sections.filter((section) => progress[section.id]?.learned).length;
            const percentage = Math.round((completed / sections.length) * 100);
            return (
              <button
                className={book.id === selectedBook.id ? "current" : ""}
                type="button"
                key={book.id}
                aria-current={book.id === selectedBook.id ? "page" : undefined}
                aria-label={`切换到${book.title}，当前进度 ${percentage}%`}
                title={book.title}
                onClick={() => {
                  setSelectedBookId(book.id);
                  setExpandedChapter(null);
                }}
              >
                <span>{book.shortTitle}</span>
                <strong>{percentage}%</strong>
                <i><b style={{ width: `${percentage}%` }} /></i>
              </button>
            );
          })}
        </nav>

        <p className="storage-note"><i className={syncStatus === "saved" ? "synced" : ""} />{syncStatus === "saved" ? "进度已同步" : syncStatus === "saving" ? "正在同步…" : "等待同步"}</p>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <span />
          <div className="topbar-actions">
            <span className={`sync-label ${syncStatus}`}>{syncStatus === "saved" ? "已同步" : syncStatus === "saving" ? "同步中" : syncStatus === "offline" ? "待重试" : ""}</span>
            <button className="logout-button" type="button" onClick={logout}>退出</button>
          </div>
        </header>

        <div className="page-content">
          <section className="hero-grid" aria-label="学习概览与节奏">
            <article className="hero-card progress-card">
              <div className="card-heading">
                <div>
                  <h2>{selectedBook.title}</h2>
                </div>
                <span className="status-pill status-pill--calm">
                  {progressPercent === 100 ? "已完成" : "进行中"}
                </span>
              </div>

              <div className="progress-number">
                {progressPercent}<small>%</small>
              </div>

              <div className="big-track">
                <span style={{ width: `${progressPercent}%` }} />
                <i style={{ left: `${progressPercent}%` }} />
              </div>

              <div className="progress-note">
                <p>
                  学完 <strong>{learnedCount}/{selectedSections.length}</strong> 小节，复习 <strong>{reviewedCount}/{selectedSections.length}</strong> 小节
                </p>
                <p>
                  当前学习：<strong>{currentSection ? `${currentSection.number} ${currentSection.title}` : "全部小节已学完"}</strong>
                </p>
              </div>
            </article>

            <article className="hero-card streak-card">
              <div className="card-heading">
                <div>
                  <h2>本周节奏</h2>
                </div>
                <span className="streak-flame">✹</span>
              </div>

              <div className="streak-number">
                {streakDays} <span>天连续</span>
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
            </div>

            <div className="chapter-grid">
              {selectedBook.chapters.map((chapter, chapterIndex) => {
                const open = expandedChapter === chapter.id;
                const chapterLearned = chapter.sections.filter((section) => progress[section.id]?.learned).length;
                const chapterComplete = chapterLearned === chapter.sections.length;

                return (
                  <article className={`chapter-card${open ? " open" : ""}`} key={chapter.id}>
                    <button
                      className="chapter-button"
                      onClick={() => setExpandedChapter(open ? null : chapter.id)}
                      aria-expanded={open}
                    >
                      <span className="chapter-index">{String(chapterIndex + 1).padStart(2, "0")}</span>
                      <span className="chapter-name"><small>第{chapter.number}章</small><strong>{chapter.title}</strong><em>{formatPlanRange(chapter.sections.map((section) => progress[section.id]?.plannedAt ?? ""))}</em></span>
                      <span className={`chapter-count${chapterComplete ? " complete" : ""}`}>
                        {chapterComplete && <i>✓</i>}{chapterLearned} / {chapter.sections.length}
                      </span>
                      <span className="chevron" aria-hidden="true" />
                    </button>

                    {open && (
                      <div className="section-table">
                        <div className="section-head" aria-hidden="true">
                          <span>小节</span><span>计划</span><span>学完</span><span>复习</span>
                        </div>
                        {chapter.sections.map((section) => {
                          const state = progress[section.id];
                          return (
                            <div className="section-row" key={section.id}>
                              <div className="section-name"><span>{section.number}</span><strong>{section.title}</strong></div>
                              <EditableDate
                                value={state?.plannedAt ?? ""}
                                emptyLabel="未设置"
                                tone={planTone(state?.plannedAt ?? "", state?.learned ?? false)}
                                ariaLabel={`${section.number} 计划日期`}
                                onChange={(value) => updateProgress(section.id, { plannedAt: value })}
                              />
                              <div className="check-with-date">
                                <label aria-label={`${section.number} 学完`}><input type="checkbox" checked={state?.learned ?? false} onChange={(event) => toggleLearned(section.id, event.target.checked)} /><span /></label>
                                {state?.learned && <EditableDate value={state.learnedAt} emptyLabel="未记录" ariaLabel={`${section.number} 学完日期`} onChange={(value) => updateProgress(section.id, { learnedAt: value })} />}
                              </div>
                              <div className="check-with-date">
                                <label aria-label={`${section.number} 复习`}><input type="checkbox" checked={state?.reviewed ?? false} disabled={!state?.learned} onChange={(event) => toggleReviewed(section.id, event.target.checked)} /><span /></label>
                                {state?.reviewed && <EditableDate value={state.reviewedAt} emptyLabel="未记录" ariaLabel={`${section.number} 复习日期`} onChange={(value) => updateProgress(section.id, { reviewedAt: value })} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
