import { useCallback, useRef, useState } from "react";
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
  onClose: () => void;
  onSave: (payload: JournalSavePayload) => void;
};

export function JournalEditorModal({
  editingJournalId,
  initialTitle,
  initialContent,
  initialImportant,
  initialPaper,
  initialSections,
  books,
  onClose,
  onSave,
}: JournalEditorModalProps) {
  const [editorContent, setEditorContent] = useState(initialContent);
  const [editorTitle, setEditorTitle] = useState(initialTitle);
  const [editorImportant, setEditorImportant] = useState(initialImportant);
  const [editorPaper, setEditorPaper] = useState<JournalPaperContext | null>(initialPaper);
  const [editorSections, setEditorSections] = useState<JournalSectionItem[]>(initialSections);
  const [editorBookId, setEditorBookId] = useState<string>(() => books[0]?.id || "ds");
  const [showTitleInput, setShowTitleInput] = useState(Boolean(initialTitle));
  const [validationError, setValidationError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = useCallback(() => {
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

    onSave({
      id: editingJournalId,
      title: trimmedTitle,
      content: editorContent,
      important: editorImportant,
      context: contextToSave,
    });
  }, [editorContent, editorTitle, editorImportant, editorPaper, editorSections, editingJournalId, onSave]);

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

      // 15. Tab / Shift+Tab (Indent / Outdent)
      if (e.key === "Tab") {
        e.preventDefault();
        const res = handleTabKey(editorContent, start, end, e.shiftKey);
        applyTextResultToTextarea(textarea, res, setEditorContent);
        return;
      }

      // 16. Smart Enter
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const smartRes = handleSmartEnter(editorContent, start, end);
        if (smartRes) {
          e.preventDefault();
          applyTextResultToTextarea(textarea, smartRes, setEditorContent);
          return;
        }
      }

      // 17. Auto-pairing quotes and brackets on text selection
      if (start < end && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const autoRes = handleAutoPair(editorContent, start, end, e.key);
        if (autoRes) {
          e.preventDefault();
          applyTextResultToTextarea(textarea, autoRes, setEditorContent);
          return;
        }
      }
    },
    [editorContent, handleSave]
  );

  return (
    <div className="confirm-overlay journal-editor-overlay" role="presentation">
      <div className="journal-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-editor-title">
        <header className="journal-editor-header">
          <div className="journal-editor-title-wrap">
            <span className="dialog-kicker">{editingJournalId ? "编辑记录" : "新建记录"}</span>
            <h2 id="journal-editor-title">{editingJournalId ? "编辑学习日志" : "写一条学习日志"}</h2>
          </div>
          <button
            type="button"
            className="journal-modal-close"
            onClick={onClose}
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
                              {s.number} {s.title} {isSelected ? "✓ 已选" : ""}
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
                    🎯 模考复盘 · {editorPaper.paperTitle}
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
            <span>⭐ 标为重点复盘</span>
          </label>
        </div>

        {validationError && (
          <div className="journal-editor-error-banner" role="alert" style={{ margin: "0 24px", color: "var(--coral, #f43f5e)" }}>
            <span>⚠ {validationError}</span>
          </div>
        )}

        <div className="journal-editor-body">
          <div className="journal-editor-pane pane-input">
            {/* Markdown Toolbar */}
            <div className="journal-markdown-toolbar" role="toolbar" aria-label="Markdown 快捷工具栏">
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
                className="journal-tb-btn journal-tb-btn--bold"
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
                className="journal-tb-btn journal-tb-btn--math"
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
                className="journal-tb-btn"
                title="超链接 (Ctrl+K)"
                onClick={() => applyEditorFormat((t, s, e) => applyLink(t, s, e))}
              >
                🔗
              </button>
              <span className="journal-tb-divider" />
              <button
                type="button"
                className="journal-tb-btn"
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
                className="journal-tb-btn"
                title="待办清单 (Ctrl+Shift+T)"
                onClick={() => applyEditorFormat((t, s, e) => toggleLinePrefix(t, s, e, "task"))}
              >
                ☑ 待办
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="引用块 (Ctrl+Shift+Q)"
                onClick={() => applyEditorFormat((t, s, e) => toggleLinePrefix(t, s, e, "quote"))}
              >
                ❝ 引用
              </button>
              <button
                type="button"
                className="journal-tb-btn"
                title="插入表格模板"
                onClick={() => applyEditorFormat((t, s, e) => applyTableTemplate(t, s, e))}
              >
                ⊞ 表格
              </button>
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
              autoFocus
            />
            <div className="journal-editor-statusbar">
              <span>{editorContent.length} 字</span>
              <span className="math-hint">快捷键：Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+K 链接 · Ctrl+M 公式 · Tab 缩进</span>
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
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="journal-btn journal-btn--primary"
              onClick={handleSave}
            >
              {editingJournalId ? "保存修改" : "保存日志"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
