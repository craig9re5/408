import { Icon } from "../common/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "../../data/books";
import type {
  JournalContext,
  JournalPaperContext,
  JournalSectionItem,
} from "../../../shared/types.ts";
import { MarkdownRenderer } from "../markdown-renderer";
import {
  applyCode,
  applyHeading,
  applyLink,
  applyMath,
  applyTableTemplate,
  applyTextResultToTextarea,
  handleAutoPair,
  handleSmartEnter,
  handleTabKey,
  toggleLinePrefix,
  wrapSelection,
} from "../../lib/markdown-editor-utils";
import { useImeGuard } from "../../lib/ime";
import { useFocusTrap } from "../../lib/use-focus-trap";

export type JournalSavePayload = {
  id: string | null;
  title: string | null;
  content: string;
  important: boolean;
  context: JournalContext | null;
};

export type JournalEditorModalProps = {
  editingJournalId: string | null;
  initialTitle: string;
  initialContent: string;
  initialImportant: boolean;
  initialPaper: JournalPaperContext | null;
  initialSections: JournalSectionItem[];
  books: Book[];
  /** 学习空间标识，用于按空间隔离本机草稿 */
  draftScope: string;
  onClose: () => void;
  onSave: (payload: JournalSavePayload) => boolean | Promise<boolean>;
};

type JournalDraft = {
  title: string;
  content: string;
  important: boolean;
  paper: JournalPaperContext | null;
  sections: JournalSectionItem[];
  savedAt: string;
};

function readJournalDraft(key: string): JournalDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JournalDraft>;
    if (typeof parsed.content !== "string") return null;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      content: parsed.content,
      important: Boolean(parsed.important),
      paper: parsed.paper ?? null,
      sections: Array.isArray(parsed.sections) ? (parsed.sections as JournalSectionItem[]) : [],
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

function writeJournalDraft(key: string, draft: JournalDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function clearJournalDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function formatDraftTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function JournalEditorModal({
  editingJournalId,
  initialTitle,
  initialContent,
  initialImportant,
  initialPaper,
  initialSections,
  books,
  draftScope,
  onClose,
  onSave,
}: JournalEditorModalProps) {
  // 草稿按「学习空间 + 日志」隔离：新建日志统一挂在 new 键下
  const draftStorageKey = `study-journal-draft:${draftScope || "main"}:${editingJournalId ?? "new"}`;
  // 挂载时读取一次本机草稿（编辑器每次打开都是重新挂载，不会过期）
  const [initialDraft] = useState<JournalDraft | null>(() => readJournalDraft(draftStorageKey));

  const [editorContent, setEditorContent] = useState(() => initialDraft?.content ?? initialContent);
  const [editorTitle, setEditorTitle] = useState(() => initialDraft?.title ?? initialTitle);
  const [editorImportant, setEditorImportant] = useState(() => initialDraft?.important ?? initialImportant);
  const [editorPaper, setEditorPaper] = useState<JournalPaperContext | null>(
    () => (initialDraft ? initialDraft.paper : initialPaper)
  );
  const [editorSections, setEditorSections] = useState<JournalSectionItem[]>(
    () => initialDraft?.sections ?? initialSections
  );
  const [editorBookId, setEditorBookId] = useState<string>(() => books[0]?.id || "ds");
  const [showTitleInput, setShowTitleInput] = useState(Boolean(initialTitle));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(() => initialDraft?.savedAt ?? null);
  const [draftCacheFailed, setDraftCacheFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const draftFinishedRef = useRef(false);
  const [draftRestored, setDraftRestored] = useState(
    () => Boolean(initialDraft && (initialDraft.content !== initialContent || initialDraft.title !== initialTitle
      || initialDraft.important !== initialImportant || JSON.stringify(initialDraft.paper) !== JSON.stringify(initialPaper)
      || JSON.stringify(initialDraft.sections) !== JSON.stringify(initialSections)))
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { isImeKey, markCompositionEnd } = useImeGuard();

  // 脏检查：与初始快照比对（草稿恢复后自然为脏，保证自动保存持续刷新草稿）
  const [initialFingerprint] = useState(() =>
    JSON.stringify({
      title: initialTitle,
      content: initialContent,
      important: initialImportant,
      paper: initialPaper,
      sections: initialSections,
    })
  );
  const isDirty =
    JSON.stringify({
      title: editorTitle,
      content: editorContent,
      important: editorImportant,
      paper: editorPaper,
      sections: editorSections,
    }) !== initialFingerprint;

  const flushDraft = useCallback(() => {
    if (draftFinishedRef.current) return true;
    const savedAt = new Date().toISOString();
    const saved = writeJournalDraft(draftStorageKey, {
      title: editorTitle,
      content: editorContent,
      important: editorImportant,
      paper: editorPaper,
      sections: editorSections,
      savedAt,
    });
    // Storage is synchronous; update the status after the persistence effect finishes.
    queueMicrotask(() => {
      setDraftCacheFailed(!saved);
      if (saved) setDraftSavedAt(savedAt);
    });
    return saved;
  }, [draftStorageKey, editorTitle, editorContent, editorImportant, editorPaper, editorSections]);

  // Persist each edit immediately so fast refreshes do not lose the last keystrokes.
  useEffect(() => {
    if (!isDirty) {
      clearJournalDraft(draftStorageKey);
      queueMicrotask(() => setDraftSavedAt(null));
      return;
    }
    draftFinishedRef.current = false;
    flushDraft();
  }, [isDirty, draftStorageKey, flushDraft]);

  useEffect(() => {
    const preserveDraft = () => {
      if (isDirty && !draftFinishedRef.current) flushDraft();
    };
    const onVisibilityChange = () => {
      if (document.hidden) preserveDraft();
    };
    window.addEventListener("pagehide", preserveDraft);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", preserveDraft);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isDirty, flushDraft]);

  const discardDraft = useCallback(() => {
    draftFinishedRef.current = true;
    clearJournalDraft(draftStorageKey);
    setEditorTitle(initialTitle);
    setEditorContent(initialContent);
    setEditorImportant(initialImportant);
    setEditorPaper(initialPaper);
    setEditorSections(initialSections);
    setDraftRestored(false);
    setDraftSavedAt(null);
    setDraftCacheFailed(false);
  }, [draftStorageKey, initialTitle, initialContent, initialImportant, initialPaper, initialSections]);

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) return;
    const trimmedContent = editorContent.trim();
    if (!trimmedContent) {
      setValidationError("日志内容不能为空");
      return;
    }

    const trimmedTitle = editorTitle.trim() ? editorTitle.trim() : null;
    const contextToSave: JournalContext | null = editorPaper
      ? editorPaper
      : editorSections.length > 0
        ? { type: "sections", sections: editorSections }
        : null;

    flushDraft();
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const saved = await onSave({
        id: editingJournalId,
        title: trimmedTitle,
        content: editorContent,
        important: editorImportant,
        context: contextToSave,
      });
      if (!saved) {
        setValidationError("日志尚未保存成功，请检查本机存储空间或同步状态；编辑内容仍保留在这里。");
        return;
      }
      draftFinishedRef.current = true;
      clearJournalDraft(draftStorageKey);
    } catch {
      setValidationError("保存失败，请重试；草稿未被删除。");
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [editorContent, editorTitle, editorImportant, editorPaper, editorSections, editingJournalId, draftStorageKey, onSave, flushDraft]);

  // 关闭前保护：有未保存修改时弹出三选一确认
  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const dismissCloseConfirm = useCallback(() => {
    setShowCloseConfirm(false);
    textareaRef.current?.focus();
  }, []);

  useFocusTrap(dialogRef, {
    initialFocus: ".journal-textarea",
    onEscape: () => {
      if (showCloseConfirm) dismissCloseConfirm();
      else requestClose();
    },
  });

  const applyEditorFormat = useCallback(
    (
      formatter: (
        text: string,
        start: number,
        end: number
      ) => { newText: string; selectionStart: number; selectionEnd: number }
    ) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const result = formatter(editorContent, start, end);
      applyTextResultToTextarea(textarea, result, setEditorContent);
    },
    [editorContent]
  );

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      // 选词阶段的回车属于输入法；WebKit 合成结束后补送的 Enter 也只吞一次。
      if (isImeKey(e)) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // 1. Quick Save (Ctrl+S / Cmd+S)
      if (isCtrlOrCmd && e.key.toLowerCase() === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      // 2. Bold (Ctrl+B / Cmd+B)
      if (isCtrlOrCmd && e.key.toLowerCase() === "b" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const res = wrapSelection(editorContent, start, end, "**", "**", "加粗文本");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 3. Italic (Ctrl+I / Cmd+I)
      if (isCtrlOrCmd && e.key.toLowerCase() === "i" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const res = wrapSelection(editorContent, start, end, "*", "*", "斜体文本");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 4. Underline (Ctrl+U / Cmd+U)
      if (isCtrlOrCmd && e.key.toLowerCase() === "u" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const res = wrapSelection(editorContent, start, end, "<u>", "</u>", "下划线");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 5. Strikethrough (Ctrl+Shift+X or Ctrl+Shift+S or Alt+Shift+5)
      if (
        (isCtrlOrCmd && e.shiftKey && (e.key.toLowerCase() === "x" || e.key.toLowerCase() === "s")) ||
        (e.altKey && e.shiftKey && e.key === "5")
      ) {
        e.preventDefault();
        const res = wrapSelection(editorContent, start, end, "~~", "~~", "删除线文本");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 6. Link (Ctrl+K / Cmd+K)
      if (isCtrlOrCmd && e.key.toLowerCase() === "k" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const res = applyLink(editorContent, start, end);
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 7. Math LaTeX (Ctrl+M or Ctrl+Shift+K or Ctrl+Alt+M)
      if (
        (isCtrlOrCmd && e.key.toLowerCase() === "m" && !e.shiftKey && !e.altKey) ||
        (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === "k") ||
        (isCtrlOrCmd && e.altKey && e.key.toLowerCase() === "m")
      ) {
        e.preventDefault();
        const res = applyMath(editorContent, start, end);
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 8. Code / Code block (Ctrl+` or Ctrl+E or Ctrl+Shift+C)
      if (
        (isCtrlOrCmd && e.key === "`" && !e.shiftKey && !e.altKey) ||
        (isCtrlOrCmd && e.key.toLowerCase() === "e" && !e.shiftKey && !e.altKey) ||
        (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === "c")
      ) {
        e.preventDefault();
        const res = applyCode(editorContent, start, end);
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 9. Headings 1~4 (Ctrl+1~4 or Ctrl+Alt+1~4)
      if (
        (isCtrlOrCmd && !e.shiftKey && e.key >= "1" && e.key <= "4") ||
        (isCtrlOrCmd && e.altKey && e.key >= "1" && e.key <= "4")
      ) {
        e.preventDefault();
        const level = parseInt(e.key, 10) as 1 | 2 | 3 | 4;
        const res = applyHeading(editorContent, start, end, level);
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 10. Clear Heading (Ctrl+0)
      if (isCtrlOrCmd && e.key === "0" && !e.shiftKey) {
        e.preventDefault();
        const res = applyHeading(editorContent, start, end, 0);
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 11. Bullet List (Ctrl+Shift+U or Ctrl+Alt+U)
      if (isCtrlOrCmd && (e.shiftKey || e.altKey) && e.key.toLowerCase() === "u") {
        e.preventDefault();
        const res = toggleLinePrefix(editorContent, start, end, "bullet");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 12. Numbered List (Ctrl+Shift+O or Ctrl+Alt+O)
      if (isCtrlOrCmd && (e.shiftKey || e.altKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        const res = toggleLinePrefix(editorContent, start, end, "number");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 13. Task List (Ctrl+Shift+T or Ctrl+Alt+T)
      if (isCtrlOrCmd && (e.shiftKey || e.altKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const res = toggleLinePrefix(editorContent, start, end, "task");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 14. Blockquote (Ctrl+Shift+Q or Ctrl+Alt+Q)
      if (isCtrlOrCmd && (e.shiftKey || e.altKey) && e.key.toLowerCase() === "q") {
        e.preventDefault();
        const res = toggleLinePrefix(editorContent, start, end, "quote");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 15. Indent / Outdent（Ctrl+] / Ctrl+[，单行也可显式缩进）
      if (isCtrlOrCmd && !e.shiftKey && !e.altKey && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        const res = handleTabKey(editorContent, start, end, e.key === "[");
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 16. Tab / Shift+Tab：默认让焦点正常移出编辑器（避免键盘陷阱），
      // 仅在选中了多行文本时执行缩进 / 反缩进。
      if (e.key === "Tab") {
        if (start !== end && editorContent.substring(start, end).includes("\n")) {
          e.preventDefault();
          const res = handleTabKey(editorContent, start, end, e.shiftKey);
          applyTextResultToTextarea(textarea, res, setEditorContent);
        }
        // 否则不拦截，浏览器将焦点移到下一个控件（保存 / 取消 / 关闭）
        return;
      }

      // 17. Smart Enter
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const smartRes = handleSmartEnter(editorContent, start, end);
        if (smartRes) {
          e.preventDefault();
          applyTextResultToTextarea(textarea, smartRes, setEditorContent);
          return;
        }
      }

      // 18. Auto-pairing quotes and brackets on text selection
      if (start < end && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const autoRes = handleAutoPair(editorContent, start, end, e.key);
        if (autoRes) {
          e.preventDefault();
          applyTextResultToTextarea(textarea, autoRes, setEditorContent);
          return;
        }
      }
    },
    [editorContent, handleSave, isImeKey]
  );

  return (
    <div className="confirm-overlay journal-editor-overlay" role="presentation">
      <div ref={dialogRef} className="journal-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-editor-title">
        <header className="journal-editor-header">
          <div className="journal-editor-title-wrap">
            <span className="dialog-kicker">{editingJournalId ? "编辑记录" : "新建记录"}</span>
            <h2 id="journal-editor-title">{editingJournalId ? "编辑学习日志" : "写一条学习日志"}</h2>
          </div>
          <button
            type="button"
            className="journal-modal-close"
            onClick={requestClose}
            aria-label="关闭编辑器"
          >
            ×
          </button>
        </header>

        <div className="journal-editor-meta-bar">
          <div className="journal-context-selector-wrap">
            <div className="journal-context-selector">
              <span className="meta-label">关联小节:</span>
              <div className="journal-cascading-selects">
                <select
                  className="journal-book-select"
                  value={editorBookId}
                  onChange={(e) => setEditorBookId(e.target.value)}
                  aria-label="第一列：选择科目与书籍"
                >
                  <optgroup label="408 考研科目">
                    {books.filter((b) => b.area === "408").map((b) => (
                      <option key={b.id} value={b.id}>
                        408 · {b.shortTitle} ({b.title})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="数学科目">
                    {books.filter((b) => b.area === "math").map((b) => (
                      <option key={b.id} value={b.id}>
                        数学 · {b.shortTitle} ({b.title})
                      </option>
                    ))}
                  </optgroup>
                </select>

                <select
                  className="journal-section-select"
                  value=""
                  onChange={(e) => {
                    const secId = e.target.value;
                    if (!secId) return;
                    const currentBook = books.find((b) => b.id === editorBookId);
                    if (!currentBook) return;
                    const found = currentBook.chapters
                      .flatMap((c) => c.sections.map((s) => ({ book: currentBook, chapter: c, section: s })))
                      .find((item) => item.section.id === secId);
                    if (found) {
                      setEditorSections((prev) => {
                        if (prev.some((s) => s.sectionId === found.section.id)) return prev;
                        return [
                          ...prev,
                          {
                            area: found.book.area,
                            bookId: found.book.id,
                            sectionId: found.section.id,
                            bookTitle: found.book.shortTitle,
                            sectionTitle: found.section.title,
                            sectionNumber: found.section.number,
                          },
                        ];
                      });
                    }
                  }}
                  aria-label="第二列：选择该科目具体小节"
                >
                  <option value="">+ 添加对应小节 (支持多选)...</option>
                  {(() => {
                    const activeBook = books.find((b) => b.id === editorBookId);
                    if (!activeBook) return null;
                    return activeBook.chapters.map((chap) => (
                      <optgroup key={chap.id} label={`第 ${chap.number} 章 ${chap.title}`}>
                        {chap.sections.map((s) => {
                          const isSelected = editorSections.some((es) => es.sectionId === s.id);
                          return (
                            <option key={s.id} value={s.id} disabled={isSelected}>
                              {s.number} {s.title} {isSelected ? <><Icon name="check" /> 已选</> : ""}
                            </option>
                          );
                        })}
                      </optgroup>
                    ));
                  })()}
                </select>
              </div>
              {editorSections.length > 0 && (
                <button
                  type="button"
                  className="journal-clear-sections-btn"
                  onClick={() => setEditorSections([])}
                  title="清空所有关联小节，转为纯时间流随笔"
                >
                  清空关联
                </button>
              )}
            </div>

            {editorPaper && (
              <div className="journal-selected-sections-list">
                <span className={`journal-section-chip area-${editorPaper.area}`}>
                  <span className="chip-text">
                    <Icon name="target" /> 模考复盘 · {editorPaper.paperTitle}
                  </span>
                  <button
                    type="button"
                    className="chip-remove-btn"
                    onClick={() => setEditorPaper(null)}
                    aria-label="移除试卷关联"
                    title="移除试卷关联"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}

            {editorSections.length > 0 && (
              <div className="journal-selected-sections-list">
                {editorSections.map((sec) => (
                  <span key={sec.sectionId} className={`journal-section-chip area-${sec.area}`}>
                    <span className="chip-text">
                      {sec.bookTitle} · {sec.sectionNumber} {sec.sectionTitle}
                    </span>
                    <button
                      type="button"
                      className="chip-remove-btn"
                      onClick={() => setEditorSections((prev) => prev.filter((item) => item.sectionId !== sec.sectionId))}
                      aria-label={`移除 ${sec.sectionTitle} 关联`}
                      title="移除关联"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="journal-title-field">
            {showTitleInput || editorTitle ? (
              <div className="journal-title-input-wrap">
                <input
                  type="text"
                  className="journal-title-input"
                  placeholder="给这篇日志起个标题（选填，留空则自动提取首句）"
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  maxLength={100}
                />
                <button
                  type="button"
                  className="journal-title-remove-btn"
                  onClick={() => {
                    setEditorTitle("");
                    setShowTitleInput(false);
                  }}
                  title="收起标题"
                >
                  收起标题
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="journal-add-title-btn"
                onClick={() => setShowTitleInput(true)}
              >
                + 添加标题（选填）
              </button>
            )}
          </div>

          <label className="journal-important-checkbox">
            <input
              type="checkbox"
              checked={editorImportant}
              onChange={(e) => setEditorImportant(e.target.checked)}
            />
            <span><Icon name="star" /> 标为重点复盘</span>
          </label>
        </div>

        {validationError && (
          <div className="journal-editor-error-banner" role="alert" style={{ margin: "0 24px", color: "var(--coral, #f43f5e)" }}>
            <span><Icon name="alert" /> {validationError}</span>
          </div>
        )}

        {draftRestored && (
          <div className="journal-draft-banner" role="status">
            <span>
              已恢复本机未保存的草稿{draftSavedAt ? `（${formatDraftTime(draftSavedAt)}）` : ""}，可继续编辑，或丢弃后重写。
            </span>
            <div className="journal-draft-banner__actions">
              <button type="button" className="journal-draft-banner__btn journal-draft-banner__btn--danger" onClick={discardDraft}>
                丢弃草稿
              </button>
              <button type="button" className="journal-draft-banner__btn" onClick={() => setDraftRestored(false)}>
                继续编辑
              </button>
            </div>
          </div>
        )}

        <div className="journal-mobile-view-switch" aria-label="日志编辑视图">
          <button type="button" aria-pressed={mobileView === "edit"} className={mobileView === "edit" ? "active" : ""} onClick={() => setMobileView("edit")}>编辑</button>
          <button type="button" aria-pressed={mobileView === "preview"} className={mobileView === "preview" ? "active" : ""} onClick={() => setMobileView("preview")}>预览</button>
        </div>
        <div className={`journal-editor-body journal-editor-body--${mobileView}`}>
          <div className="journal-editor-pane pane-input">
            {/* Markdown Toolbar */}
            <div className={`journal-markdown-toolbar${showMoreTools ? " journal-markdown-toolbar--expanded" : ""}`} role="toolbar" aria-label="Markdown 快捷工具栏">
              <button
                type="button"
                className="journal-tb-btn"
                title="一级标题 (Ctrl+1)"
                onClick={() => applyEditorFormat((t, s, e) => applyHeading(t, s, e, 1))}
              >
                H1
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="二级标题 (Ctrl+2)"
                onClick={() => applyEditorFormat((t, s, e) => applyHeading(t, s, e, 2))}
              >
                H2
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="三级标题 (Ctrl+3)"
                onClick={() => applyEditorFormat((t, s, e) => applyHeading(t, s, e, 3))}
              >
                H3
              </button>
              <span className="journal-tb-divider" />
              <button
                type="button"
                className="journal-tb-btn journal-tb-btn--bold journal-tb-btn--mobile-primary"
                title="加粗 (Ctrl+B)"
                onClick={() => applyEditorFormat((t, s, e) => wrapSelection(t, s, e, "**", "**", "加粗文本"))}
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                className="journal-tb-btn journal-tb-btn--italic"
                title="斜体 (Ctrl+I)"
                onClick={() => applyEditorFormat((t, s, e) => wrapSelection(t, s, e, "*", "*", "斜体文本"))}
              >
                <em>I</em>
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="下划线 (Ctrl+U)"
                onClick={() => applyEditorFormat((t, s, e) => wrapSelection(t, s, e, "<u>", "</u>", "下划线"))}
              >
                <u>U</u>
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="删除线 (Ctrl+Shift+X)"
                onClick={() => applyEditorFormat((t, s, e) => wrapSelection(t, s, e, "~~", "~~", "删除线"))}
              >
                <s>S</s>
              </button>
              <span className="journal-tb-divider" />
              <button
                type="button"
                className="journal-tb-btn journal-tb-btn--math journal-tb-btn--mobile-primary"
                title="数学公式 LaTeX (Ctrl+M)"
                onClick={() => applyEditorFormat((t, s, e) => applyMath(t, s, e))}
              >
                $fx$
              </button>
              <button
                type="button"
                className="journal-tb-btn journal-tb-btn--mono"
                title="代码块 (Ctrl+`)"
                onClick={() => applyEditorFormat((t, s, e) => applyCode(t, s, e))}
              >
                &lt;/&gt;
              </button>
              <button
                type="button"
                className="journal-tb-btn journal-tb-btn--mobile-primary"
                title="超链接 (Ctrl+K)"
                aria-label="插入超链接"
                onClick={() => applyEditorFormat((t, s, e) => applyLink(t, s, e))}
              >
                <Icon name="link" />
              </button>
              <span className="journal-tb-divider" />
              <button
                type="button"
                className="journal-tb-btn journal-tb-btn--mobile-primary"
                title="无序列表 (Ctrl+Shift+U)"
                onClick={() => applyEditorFormat((t, s, e) => toggleLinePrefix(t, s, e, "bullet"))}
              >
                • 列表
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="有序列表 (Ctrl+Shift+O)"
                onClick={() => applyEditorFormat((t, s, e) => toggleLinePrefix(t, s, e, "number"))}
              >
                1. 列表
              </button>
              <button
                type="button"
                className="journal-tb-btn journal-tb-btn--mobile-primary"
                title="待办清单 (Ctrl+Shift+T)"
                onClick={() => applyEditorFormat((t, s, e) => toggleLinePrefix(t, s, e, "task"))}
              >
                <Icon name="square-check" /> 待办
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="引用块 (Ctrl+Shift+Q)"
                onClick={() => applyEditorFormat((t, s, e) => toggleLinePrefix(t, s, e, "quote"))}
              >
                <Icon name="quote" /> 引用
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="插入表格模板"
                onClick={() => applyEditorFormat((t, s, e) => applyTableTemplate(t, s, e))}
              >
                <Icon name="table" /> 表格
              </button>
              <button type="button" className="journal-toolbar-more" aria-expanded={showMoreTools} onClick={() => setShowMoreTools((value) => !value)}>{showMoreTools ? "收起" : "更多格式"}</button>
            </div>

            <textarea
              ref={textareaRef}
              className="journal-textarea"
              placeholder="写下今天的学习心得、对定理/算法的理解或复盘体会...&#10;&#10;支持 Markdown 语法与 LaTeX 数学公式：&#10;- 行内公式：$O(n \log n)$ 或 $e^{i\pi} + 1 = 0$&#10;- 块级公式：$$\int_0^1 f(x)dx$$&#10;- 代码块：```cpp ... ```&#10;- 任务列表：- [ ] 待复习"
              value={editorContent}
              onChange={(e) => {
                setEditorContent(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onKeyDown={handleEditorKeyDown}
              onCompositionEnd={markCompositionEnd}
              autoFocus
            />
            <div className="journal-editor-statusbar">
              <span>{editorContent.length} 字</span>
              <span role="status">{draftCacheFailed ? "本机草稿缓存失败，请勿关闭页面" : draftSavedAt ? `草稿已缓存到本机 · ${formatDraftTime(draftSavedAt)}` : "输入后自动缓存草稿到本机"}</span>
              <span className="math-hint">快捷键：Ctrl+B 加粗 · Ctrl+K 链接 · Ctrl+M 公式 · Tab 切换焦点 · 多行选中 Tab 缩进 · Ctrl+]/[ 缩进</span>
            </div>
          </div>

          <div className="journal-editor-pane pane-preview">
            <div className="preview-header">
              <span className="preview-label">实时渲染预览</span>
            </div>
            <div className="preview-content-scroll">
              <MarkdownRenderer content={editorContent} />
            </div>
          </div>
        </div>

        <footer className="journal-editor-footer">
          <div className="editor-footer-left">
            <span className="editor-shortcut-hint">支持 GFM 表格、Task List 与 KaTeX 公式 · 按 Ctrl+S 保存</span>
          </div>
          <div className="editor-footer-actions">
            <button
              type="button"
              className="journal-btn journal-btn--ghost"
              onClick={requestClose}
            >
              取消
            </button>
            <button
              type="button"
              className="journal-btn journal-btn--primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "正在保存…" : editingJournalId ? "保存修改" : "保存日志"}
            </button>
          </div>
        </footer>
      </div>

      {showCloseConfirm && (
        <div
          className="journal-close-confirm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissCloseConfirm();
          }}
        >
          <div
            className="journal-close-confirm__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="journal-close-confirm-title"
            aria-describedby="journal-close-confirm-desc"
          >
            <h3 id="journal-close-confirm-title">当前日志有未保存的修改</h3>
            <p id="journal-close-confirm-desc">
              草稿会在本机自动保留。你可以立即保存、保留草稿稍后继续，或放弃本次全部修改。
            </p>
            <div className="journal-close-confirm__actions">
              <button
                type="button"
                className="journal-btn journal-btn--ghost"
                onClick={dismissCloseConfirm}
                autoFocus
              >
                继续编辑
              </button>
              <button
                type="button"
                className="journal-btn journal-btn--danger-ghost"
                onClick={() => {
                  draftFinishedRef.current = true;
                  clearJournalDraft(draftStorageKey);
                  onClose();
                }}
              >
                放弃修改
              </button>
              <button
                type="button"
                className="journal-btn journal-btn--ghost"
                onClick={() => {
                  if (flushDraft()) onClose();
                  else {
                    dismissCloseConfirm();
                    setValidationError("无法缓存到本机，请先保存日志或导出内容后再关闭。");
                  }
                }}
              >
                保留草稿退出
              </button>
              <button
                type="button"
                className="journal-btn journal-btn--primary"
                onClick={() => {
                  setShowCloseConfirm(false);
                  handleSave();
                }}
              >
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
