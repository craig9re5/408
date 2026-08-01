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
          reviewed: book.initiallyComplete,
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="date-editor"
        type="date"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <button className={`date-text ${tone}`} type="button" onClick={() => setEditing(true)} aria-label={`${ariaLabel}，点击编辑`}>
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
      defaults[sectionId] = {
        learned: Boolean(value.learned),
        learnedAt: typeof value.learnedAt === "string" ? value.learnedAt : "",
        reviewed: Boolean(value.reviewed),
        reviewedAt: typeof value.reviewedAt === "string" ? value.reviewedAt : "",
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
    merged[sectionId] = {
      ...merged[sectionId],
      learned: Boolean(value.learned),
      learnedAt: typeof value.learnedAt === "string" ? value.learnedAt : "",
      reviewed: Boolean(value.reviewed),
      reviewedAt: typeof value.reviewedAt === "string" ? value.reviewedAt : "",
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
    <div className="university-logo" role="img" aria-label="大学徽标">
      <svg viewBox="0 0 88 88" aria-hidden="true">
        <path d="M44 7 73 18v21c0 19-12 33-29 42C27 72 15 58 15 39V18L44 7Z" fill="currentColor" />
        <path d="m23 34 21-12 21 12-21 12-21-12Z" fill="var(--coral)" />
        <path d="M30 38v16h28V38L44 46 30 38Z" fill="var(--paper)" />
        <path d="M25 57h38M36 48v6M44 48v6M52 48v6" fill="none" stroke="var(--paper)" strokeLinecap="round" strokeWidth="2.5" />
        <circle cx="44" cy="64" r="2.5" fill="var(--coral)" />
      </svg>
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

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      });
      const body = await response.json() as { error?: string; progress?: Record<string, SectionProgress> };
      if (!response.ok) {
        setAuthError(body.error ?? "邀请码不正确");
        return;
      }
      setAuthState("authenticated");
      setProgress(mergeRemoteProgress(body.progress ?? {}, true));
      setLoaded(true);
      setSyncStatus("saved");
    } catch {
      setAuthError("暂时无法连接同步服务，请稍后重试");
    }
  }

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
        <form className="auth-card" onSubmit={login}>
          <UniversityLogo />
          <h1>学习目录</h1>
          <label className="invite-label" htmlFor="invite-code">访问码</label>
          <input
            id="invite-code"
            className="invite-input"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            aria-label="访问码"
            autoFocus
          />
          <button className="invite-button" type="submit">进入空间</button>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>408</span><strong>学习目录</strong></div>

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
          <span>408 学习进度</span>
          <div className="topbar-actions">
            <span className={`sync-label ${syncStatus}`}>{syncStatus === "saved" ? "已同步" : syncStatus === "saving" ? "同步中" : syncStatus === "offline" ? "待重试" : ""}</span>
            <button className="logout-button" type="button" onClick={logout}>退出</button>
          </div>
        </header>

        <div className="page-content">
          <section className="summary" aria-label="当前进度">
            <article className="book-summary">
              <ProgressRing value={progressPercent} />
              <div>
                <span>学习进度</span>
                <h1>{selectedBook.title}</h1>
                <p>学完 {learnedCount}/{selectedSections.length} 小节，复习 {reviewedCount}/{selectedSections.length} 小节</p>
              </div>
            </article>

            <article className="current-task">
              <span>当前学习</span>
              {currentSection ? (
                <>
                  <strong>{currentSection.number} {currentSection.title}</strong>
                </>
              ) : (
                <>
                  <strong>全部小节已学完</strong>
                </>
              )}
            </article>
          </section>

          <section className="catalog">
            <div className="catalog-heading">
              <div><h2>目录</h2><span>{selectedBook.chapters.length} 章 · {selectedSections.length} 小节</span></div>
              <p>点击章节展开小节</p>
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
                                emptyLabel="计划未设置"
                                prefix="计划 "
                                tone={planTone(state?.plannedAt ?? "", state?.learned ?? false)}
                                ariaLabel={`${section.number} 计划日期`}
                                onChange={(value) => updateProgress(section.id, { plannedAt: value })}
                              />
                              <div className="check-with-date">
                                <label><input type="checkbox" checked={state?.learned ?? false} onChange={(event) => toggleLearned(section.id, event.target.checked)} /><span /><em>学完</em></label>
                                {state?.learned && <EditableDate value={state.learnedAt} emptyLabel="未记录" ariaLabel={`${section.number} 学完日期`} onChange={(value) => updateProgress(section.id, { learnedAt: value })} />}
                              </div>
                              <div className="check-with-date">
                                <label><input type="checkbox" checked={state?.reviewed ?? false} disabled={!state?.learned} onChange={(event) => toggleReviewed(section.id, event.target.checked)} /><span /><em>复习</em></label>
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
