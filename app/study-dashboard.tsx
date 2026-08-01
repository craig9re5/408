"use client";

import { useEffect, useMemo, useState } from "react";
import { books, type Book, type Section } from "./data/books";

type SectionProgress = {
  learned: boolean;
  learnedAt: string;
  reviewed: boolean;
  reviewedAt: string;
};

type ProgressMap = Record<string, SectionProgress>;

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

function ProgressRing({ value }: { value: number }) {
  return (
    <span className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}>
      <span>{value}%</span>
    </span>
  );
}

export function StudyDashboard() {
  const [selectedBookId, setSelectedBookId] = useState("operating-system");
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressMap>(defaultProgress);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const defaults = defaultProgress();

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        Object.keys(defaults).forEach((sectionId) => {
          const entry = saved[sectionId];
          if (!entry || typeof entry !== "object") return;
          defaults[sectionId] = {
            learned: Boolean(entry.learned),
            learnedAt: typeof entry.learnedAt === "string" ? entry.learnedAt : "",
            reviewed: Boolean(entry.reviewed),
            reviewedAt: typeof entry.reviewedAt === "string" ? entry.reviewedAt : "",
          };
        });
      }
    } catch {
      // Invalid local data falls back to the catalog defaults.
    }

    setProgress(defaults);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [loaded, progress]);

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? books[2];
  const selectedSections = useMemo(() => allSections(selectedBook), [selectedBook]);
  const learnedCount = selectedSections.filter((section) => progress[section.id]?.learned).length;
  const reviewedCount = selectedSections.filter((section) => progress[section.id]?.reviewed).length;
  const progressPercent = selectedSections.length ? Math.round((learnedCount / selectedSections.length) * 100) : 0;
  const currentSection = selectedSections.find((section) => !progress[section.id]?.learned);
  const currentChapter = currentSection
    ? selectedBook.chapters.find((chapter) => chapter.sections.some((section) => section.id === currentSection.id))
    : undefined;

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>408</span><strong>学习目录</strong></div>

        <div className="subject-progress">
          <h2>科目进度</h2>
          {books.map((book) => {
            const sections = allSections(book);
            const completed = sections.filter((section) => progress[section.id]?.learned).length;
            const percentage = Math.round((completed / sections.length) * 100);
            return (
              <div className={book.id === selectedBook.id ? "current" : ""} key={book.id}>
                <span>{book.shortTitle}</span>
                <strong>{percentage}%</strong>
                <i><b style={{ width: `${percentage}%` }} /></i>
              </div>
            );
          })}
        </div>

        <p className="storage-note"><i />进度保存在本机</p>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <span>408 学习进度</span>
          <label className="book-switcher">
            <span>当前书籍</span>
            <select
              value={selectedBook.id}
              onChange={(event) => {
                setSelectedBookId(event.target.value);
                setExpandedChapter(null);
              }}
              aria-label="切换当前书籍"
            >
              {books.map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}
            </select>
          </label>
        </header>

        <div className="page-content">
          <section className="summary" aria-label="当前进度">
            <article className="book-summary">
              <ProgressRing value={progressPercent} />
              <div>
                <span>学习进度</span>
                <h1>{selectedBook.title}</h1>
                <p>{learnedCount} / {selectedSections.length} 小节学完 · {reviewedCount} 小节复习</p>
              </div>
            </article>

            <article className="current-task">
              <span>当前学习</span>
              {currentSection ? (
                <>
                  <strong>{currentSection.number} {currentSection.title}</strong>
                  <p>第{currentChapter?.number}章　{currentChapter?.title}</p>
                </>
              ) : (
                <>
                  <strong>全部小节已学完</strong>
                  <p>可以继续完成尚未勾选的复习</p>
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
                      <span className="chapter-name"><small>第{chapter.number}章</small><strong>{chapter.title}</strong></span>
                      <span className={`chapter-count${chapterComplete ? " complete" : ""}`}>
                        {chapterComplete && <i>✓</i>}{chapterLearned} / {chapter.sections.length}
                      </span>
                      <span className="chevron" aria-hidden="true" />
                    </button>

                    {open && (
                      <div className="section-table">
                        <div className="section-head" aria-hidden="true">
                          <span>小节</span><span>学完</span><span>复习一遍</span>
                        </div>
                        {chapter.sections.map((section) => {
                          const state = progress[section.id];
                          return (
                            <div className="section-row" key={section.id}>
                              <div className="section-name"><span>{section.number}</span><strong>{section.title}</strong></div>
                              <div className="check-with-date">
                                <label><input type="checkbox" checked={state?.learned ?? false} onChange={(event) => toggleLearned(section.id, event.target.checked)} /><span /></label>
                                <input
                                  type="date"
                                  value={state?.learnedAt ?? ""}
                                  disabled={!state?.learned}
                                  onChange={(event) => updateProgress(section.id, { learnedAt: event.target.value })}
                                  aria-label={`${section.number} 学完日期`}
                                />
                              </div>
                              <div className="check-with-date">
                                <label><input type="checkbox" checked={state?.reviewed ?? false} disabled={!state?.learned} onChange={(event) => toggleReviewed(section.id, event.target.checked)} /><span /></label>
                                <input
                                  type="date"
                                  value={state?.reviewedAt ?? ""}
                                  disabled={!state?.reviewed}
                                  onChange={(event) => updateProgress(section.id, { reviewedAt: event.target.value })}
                                  aria-label={`${section.number} 复习日期`}
                                />
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
