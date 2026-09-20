"use client";

import { useState } from "react";
import type { ExamPaperItem, ExamPaperSubject } from "../../study-data";
import { EXAM_PAPER_SUBJECT_MAP } from "../../study-data";

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
    <div className="confirm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-dialog netdisk-modal" role="dialog" aria-modal="true">
        <h2>重命名试卷</h2>
        <form onSubmit={handleSubmit}>
          <div className="paper-form-field">
            <label className="field-label">试卷名称</label>
            <div className="netdisk-input-with-ext">
              <input
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
            {error && <p className="netdisk-field-error">{error}</p>}
          </div>
          <div className="confirm-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>取消</button>
            <button type="submit" className="btn-confirm" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const parsedYear = yearStr.trim() && !isNaN(parseInt(yearStr, 10)) ? parseInt(yearStr, 10) : null;
    try {
      await onConfirm(targetIds, subject, parsedYear);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="confirm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-dialog netdisk-modal" role="dialog" aria-modal="true">
        <h2>{targetIds.length > 1 ? `批量修改分类 (${targetIds.length} 份试卷)` : "修改试卷分类"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="paper-form-field">
            <label className="field-label">所属学科</label>
            <div className="netdisk-subject-picker-grid">
              {Object.entries(EXAM_PAPER_SUBJECT_MAP).map(([key, meta]) => (
                <button
                  type="button"
                  key={key}
                  className={`netdisk-subject-chip ${subject === key ? "netdisk-subject-chip--active" : ""}`}
                  onClick={() => setSubject(key as ExamPaperSubject)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div className="paper-form-field" style={{ marginTop: "1rem" }}>
            <label className="field-label">归属年份 / 考届（可选）</label>
            <input
              type="number"
              placeholder="如：2024 / 2025"
              value={yearStr}
              onChange={(e) => setYearStr(e.target.value)}
              min="2000"
              max="2035"
            />
          </div>

          <div className="confirm-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>取消</button>
            <button type="submit" className="btn-confirm" disabled={isSubmitting}>
              {isSubmitting ? "更新中..." : "确认移动"}
            </button>
          </div>
        </form>
      </div>
    </div>
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

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  const isBatch = !paper && Boolean(batchCount);

  return (
    <div className="confirm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-dialog confirm-dialog--danger netdisk-modal" role="dialog" aria-modal="true">
        <h2>{isBatch ? `确认批量删除选中的 ${batchCount} 份试卷？` : "确认删除该试卷？"}</h2>
        <p>
          {isBatch
            ? `删除后将永久从云盘中抹除这 ${batchCount} 份试卷并释放对应云存储配额。此操作不可撤销。`
            : `确定要删除「${paper?.fileName}」吗？删除后将永久抹除并释放对应空间。`}
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={isDeleting}>取消</button>
          <button
            type="button"
            className="btn-confirm btn-confirm--danger"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "正在删除..." : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
