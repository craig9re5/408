"use client";

import { useState } from "react";
import type { ExamPaperItem, ExamPaperSubject } from "../../study-data";
import { EXAM_PAPER_SUBJECT_MAP } from "../../study-data";
import { ModalDialog } from "../common/ModalDialog";

interface RenameModalProps {
  paper: ExamPaperItem;
  onClose: () => void;
  onConfirm: (id: string, newName: string) => Promise<void>;
}

export function RenameModal({ paper, onClose, onConfirm }: RenameModalProps) {
  const initialBaseName = paper.fileName.replace(/\.pdf$/i, "");
  const [name, setName] = useState(initialBaseName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim().replace(/[\\/:*?"<>|]/g, "_");
    if (!clean) {
      setError("试卷名称不能为空");
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(paper.id, `${clean}.pdf`);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalDialog
      onClose={isSubmitting ? undefined : onClose}
      labelledBy="netdisk-rename-title"
      dialogClassName="confirm-dialog netdisk-modal"
    >
      <h2 id="netdisk-rename-title">重命名试卷</h2>
      <form onSubmit={handleSubmit}>
        <div className="paper-form-field">
          <label className="field-label" htmlFor="netdisk-rename-input">试卷名称</label>
          <div className="netdisk-input-with-ext">
            <input
              id="netdisk-rename-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              autoFocus
              placeholder="请输入试卷名称"
            />
            <span className="netdisk-ext-label">.pdf</span>
          </div>
          {error && <p className="netdisk-field-error" role="alert">{error}</p>}
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>取消</button>
          <button type="submit" className="btn-confirm" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

interface MoveCategoryModalProps {
  paper?: ExamPaperItem | null;
  batchIds?: string[];
  onClose: () => void;
  onConfirm: (ids: string[], newSubject: ExamPaperSubject, year?: number | null) => Promise<void>;
}

export function MoveCategoryModal({ paper, batchIds, onClose, onConfirm }: MoveCategoryModalProps) {
  const targetIds = paper ? [paper.id] : (batchIds || []);
  const [subject, setSubject] = useState<ExamPaperSubject>(paper?.subject || "cs408");
  const [yearStr, setYearStr] = useState<string>(paper?.year ? String(paper.year) : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const parsedYear = yearStr.trim() && !isNaN(parseInt(yearStr, 10)) ? parseInt(yearStr, 10) : null;
    try {
      await onConfirm(targetIds, subject, parsedYear);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalDialog
      onClose={isSubmitting ? undefined : onClose}
      labelledBy="netdisk-move-title"
      dialogClassName="confirm-dialog netdisk-modal"
    >
      <h2 id="netdisk-move-title">{targetIds.length > 1 ? `批量修改分类 (${targetIds.length} 份试卷)` : "修改试卷分类"}</h2>
      <form onSubmit={handleSubmit}>
        <div className="paper-form-field">
          <span className="field-label">所属学科</span>
          <div className="netdisk-subject-picker-grid" role="group" aria-label="所属学科">
            {Object.entries(EXAM_PAPER_SUBJECT_MAP).map(([key, meta]) => (
              <button
                type="button"
                key={key}
                className={`netdisk-subject-chip ${subject === key ? "netdisk-subject-chip--active" : ""}`}
                aria-pressed={subject === key}
                onClick={() => setSubject(key as ExamPaperSubject)}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        <div className="paper-form-field" style={{ marginTop: "1rem" }}>
          <label className="field-label" htmlFor="netdisk-year-input">归属年份 / 考届（可选）</label>
          <input
            id="netdisk-year-input"
            type="number"
            placeholder="如：2024 / 2025"
            value={yearStr}
            onChange={(e) => setYearStr(e.target.value)}
            min="2000"
            max="2035"
          />
        </div>

        {error && <p className="netdisk-field-error" role="alert">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>取消</button>
          <button type="submit" className="btn-confirm" disabled={isSubmitting}>
            {isSubmitting ? "更新中..." : "确认移动"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

interface DeleteConfirmModalProps {
  paper?: ExamPaperItem | null;
  batchCount?: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmModal({ paper, batchCount, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const isBatch = !paper && Boolean(batchCount);

  return (
    <ModalDialog
      onClose={isDeleting ? undefined : onClose}
      labelledBy="netdisk-delete-title"
      role="alertdialog"
      dialogClassName="confirm-dialog confirm-dialog--danger netdisk-modal"
      initialFocus="[data-safe-focus]"
    >
      <h2 id="netdisk-delete-title">{isBatch ? `确认批量删除选中的 ${batchCount} 份试卷？` : "确认删除该试卷？"}</h2>
      <p>
        {isBatch
          ? `删除后将永久从云盘中抹除这 ${batchCount} 份试卷并释放对应云存储配额。此操作不可撤销。`
          : `确定要删除「${paper?.fileName}」吗？删除后将永久抹除并释放对应空间。`}
      </p>
      {error && <p className="netdisk-field-error" role="alert">{error}</p>}
      <div className="confirm-actions">
        <button type="button" data-safe-focus className="btn-cancel" onClick={onClose} disabled={isDeleting}>取消</button>
        <button
          type="button"
          className="btn-confirm btn-confirm--danger"
          onClick={handleConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? "正在删除..." : "确认删除"}
        </button>
      </div>
    </ModalDialog>
  );
}
