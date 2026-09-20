"use client";

import { useState, useRef, useEffect } from "react";
import type { ExamPaperItem } from "../../study-data";
import { EXAM_PAPER_SUBJECT_MAP } from "../../study-data";

interface PaperListRowProps {
  paper: ExamPaperItem;
  isBatchMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onDownload: (paper: ExamPaperItem) => void;
  onRename: (paper: ExamPaperItem) => void;
  onMove: (paper: ExamPaperItem) => void;
  onDelete: (paper: ExamPaperItem) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

export function PaperListRow({
  paper,
  isBatchMode,
  isSelected,
  onToggleSelect,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: PaperListRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  const subjectMeta = EXAM_PAPER_SUBJECT_MAP[paper.subject] || { label: "其他", badgeClass: "badge-other" };

  return (
    <div
      className={`netdisk-file-row ${isSelected ? "netdisk-file-row--selected" : ""}`}
      onClick={(e) => {
        if (isBatchMode) {
          onToggleSelect(paper.id);
        }
      }}
    >
      {/* Batch Checkbox */}
      {isBatchMode && (
        <div className="netdisk-file-col netdisk-file-col--select" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(paper.id)}
            aria-label={`选择 ${paper.fileName}`}
          />
        </div>
      )}

      {/* PDF Icon & Title */}
      <div className="netdisk-file-col netdisk-file-col--main">
        <span className="netdisk-pdf-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="13" y2="17" />
          </svg>
        </span>
        <div className="netdisk-file-name-wrap">
          <span className="netdisk-file-name" title={paper.fileName}>
            {paper.fileName}
          </span>
          <span className={`netdisk-subject-tag ${subjectMeta.badgeClass}`}>
            {subjectMeta.label}
          </span>
          {paper.year && (
            <span className="netdisk-year-tag">{paper.year}年</span>
          )}
        </div>
      </div>

      {/* File Size */}
      <div className="netdisk-file-col netdisk-file-col--size">
        {formatFileSize(paper.fileSize)}
      </div>

      {/* Upload Date */}
      <div className="netdisk-file-col netdisk-file-col--date">
        {formatDate(paper.createdAt)}
      </div>

      {/* Actions */}
      <div className="netdisk-file-col netdisk-file-col--actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="netdisk-btn-icon netdisk-btn-download"
          title="下载试卷原件"
          onClick={() => onDownload(paper)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className="netdisk-action-label">下载</span>
        </button>

        <div className="netdisk-more-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="netdisk-btn-icon"
            title="更多操作"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>

          {isMenuOpen && (
            <div className="netdisk-dropdown-menu">
              <button
                type="button"
                className="netdisk-dropdown-item"
                onClick={() => {
                  setIsMenuOpen(false);
                  onRename(paper);
                }}
              >
                重命名
              </button>
              <button
                type="button"
                className="netdisk-dropdown-item"
                onClick={() => {
                  setIsMenuOpen(false);
                  onMove(paper);
                }}
              >
                修改分类
              </button>
              <div className="netdisk-dropdown-divider" />
              <button
                type="button"
                className="netdisk-dropdown-item netdisk-dropdown-item--danger"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDelete(paper);
                }}
              >
                删除试卷
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
