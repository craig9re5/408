"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ExamPaperItem, ExamPaperSubject, PaperQuotaInfo } from "../../study-data";
import { DEFAULT_USER_QUOTA_BYTES, EXAM_PAPER_SUBJECT_MAP } from "../../study-data";
import {
  fetchPaperList,
  uploadPaper,
  downloadPaper,
  migrateLocalPaper,
  updatePaperMeta,
  deletePaper,
  batchDeletePapers,
} from "../../lib/papers-client";
import { PaperListRow } from "./PaperListRow";
import { RenameModal, MoveCategoryModal, DeleteConfirmModal } from "./PaperActionModals";
import { PaperUploadZone, type UploadTask } from "./PaperUploadZone";

interface PaperNetdiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuotaUpdated?: (quota: PaperQuotaInfo, count: number) => void;
}

type SortBy = "latest" | "size" | "name";

export function PaperNetdiskModal({ isOpen, onClose, onQuotaUpdated }: PaperNetdiskModalProps) {
  const [papers, setPapers] = useState<ExamPaperItem[]>([]);
  const [quota, setQuota] = useState<PaperQuotaInfo>({
    usedBytes: 0,
    totalBytes: DEFAULT_USER_QUOTA_BYTES,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cloudStorageReady, setCloudStorageReady] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("latest");

  // Batch Selection State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal Dialogs State
  const [editingPaper, setEditingPaper] = useState<ExamPaperItem | null>(null);
  const [movingPaper, setMovingPaper] = useState<ExamPaperItem | null>(null);
  const [isBatchMoving, setIsBatchMoving] = useState(false);
  const [deletingPaper, setDeletingPaper] = useState<ExamPaperItem | null>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Upload Management
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast/Feedback
  const [toastMessage, setToastMessage] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  }, []);

  // Stable callback ref to prevent infinite loop
  const onQuotaUpdatedRef = useRef(onQuotaUpdated);
  useEffect(() => {
    onQuotaUpdatedRef.current = onQuotaUpdated;
  });

  // Load papers
  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const data = await fetchPaperList(selectedSubject, searchKeyword);
      setPapers(data.items);
      setQuota(data.quota);
      setCloudStorageReady(data.cloudStorageReady);
      setLoadError("");
      onQuotaUpdatedRef.current?.(data.quota, data.items.length);
    } catch (err) {
      setCloudStorageReady(false);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedSubject, searchKeyword]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isOpen) {
        void loadData(true);
      } else {
        setIsBatchMode(false);
        setSelectedIds(new Set());
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadData]);

  // Quota calculation
  const quotaPercent = useMemo(() => {
    if (!quota.totalBytes) return 0;
    return Math.min(100, Math.round((quota.usedBytes / quota.totalBytes) * 100));
  }, [quota]);

  const quotaWarningClass = useMemo(() => {
    if (quotaPercent >= 100) return "quota-full";
    if (quotaPercent >= 80) return "quota-warn";
    return "";
  }, [quotaPercent]);

  // Sorting
  const sortedPapers = useMemo(() => {
    const list = [...papers];
    if (sortBy === "latest") {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortBy === "size") {
      list.sort((a, b) => b.fileSize - a.fileSize);
    } else if (sortBy === "name") {
      list.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
    }
    return list;
  }, [papers, sortBy]);

  // Upload handling
  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    if (!cloudStorageReady) {
      showToast("云端存储尚未就绪，请先完成 R2 存储桶部署");
      return;
    }
    if (quotaPercent >= 100) {
      showToast("云盘空间已满，请清理部分文件后再上传");
      return;
    }

    const defaultSubject = (selectedSubject !== "all" ? selectedSubject : "cs408") as ExamPaperSubject;

    for (const file of files) {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newTask: UploadTask = {
        id: taskId,
        name: file.name,
        progress: 30,
        status: "uploading",
      };

      setUploadTasks((prev) => [newTask, ...prev]);

      try {
        setUploadTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, progress: 65 } : t))
        );

        await uploadPaper(file, defaultSubject);

        setUploadTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, progress: 100, status: "success" } : t))
        );

        showToast(`已成功添加试卷「${file.name}」`);
        await loadData();

        setTimeout(() => {
          setUploadTasks((prev) => prev.filter((t) => t.id !== taskId));
        }, 2000);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setUploadTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: "error", error: errorMsg } : t))
        );
        showToast(errorMsg);
      }
    }
  };

  // Single Actions
  const handleDownload = async (paper: ExamPaperItem) => {
    try {
      showToast(`正在准备下载「${paper.fileName}」...`);
      await downloadPaper(paper);
    } catch (err) {
      showToast(`下载失败: ${String(err)}`);
    }
  };

  const handleSyncLocal = async (paper: ExamPaperItem) => {
    try {
      await migrateLocalPaper(paper);
      showToast(`已转存云端：「${paper.fileName}」`);
      await loadData();
    } catch (err) {
      showToast(`转存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRenameConfirm = async (id: string, newName: string) => {
    await updatePaperMeta(id, { fileName: newName });
    showToast("已重命名");
    loadData();
  };

  const handleMoveConfirm = async (ids: string[], newSubject: ExamPaperSubject, year?: number | null) => {
    for (const id of ids) {
      await updatePaperMeta(id, { subject: newSubject, year });
    }
    showToast("分类已更新");
    setIsBatchMode(false);
    setSelectedIds(new Set());
    loadData();
  };

  const handleDeleteConfirm = async () => {
    if (deletingPaper) {
      await deletePaper(deletingPaper.id);
      showToast("试卷已删除");
      setDeletingPaper(null);
      loadData();
    }
  };

  const handleBatchDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length > 0) {
      await batchDeletePapers(ids);
      showToast(`已成功删除 ${ids.length} 份试卷`);
      setIsBatchMode(false);
      setSelectedIds(new Set());
      loadData();
    }
  };

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sortedPapers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedPapers.map((p) => p.id)));
    }
  };

  if (!isOpen) return null;

  const usedMB = (quota.usedBytes / (1024 * 1024)).toFixed(1);
  const totalMB = (quota.totalBytes / (1024 * 1024)).toFixed(0);

  return (
    <div className="netdisk-overlay" role="dialog" aria-modal="true">
      <div className="netdisk-container">
        {/* Header */}
        <header className="netdisk-header">
          <div className="netdisk-header-left">
            <button
              type="button"
              className="netdisk-back-btn"
              onClick={onClose}
              title="返回设置"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span>返回</span>
            </button>
            <div className="netdisk-title-group">
              <h1 className="netdisk-title">试卷云盘</h1>
            </div>
          </div>

          <div className="netdisk-header-right">
            {/* Storage Quota Bar */}
            <div className={`netdisk-quota-box ${quotaWarningClass}`} title={`已使用 ${usedMB} MB / 共 ${totalMB} MB`}>
              <div className="netdisk-quota-labels">
                <span className="netdisk-quota-text">{usedMB} MB / {totalMB} MB</span>
                <span className="netdisk-quota-pct">{quotaPercent}%</span>
              </div>
              <div className="netdisk-quota-track">
                <div className="netdisk-quota-fill" style={{ width: `${quotaPercent}%` }} />
              </div>
            </div>

            {/* Upload Button */}
            <button
              type="button"
              className="netdisk-upload-btn"
              disabled={!cloudStorageReady || quotaPercent >= 100}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>上传 PDF</span>
            </button>

            {/* Close modal */}
            <button type="button" className="netdisk-close-btn" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
        </header>

        {/* Navigation & Filter Bar */}
        <div className="netdisk-toolbar">
          <div className="netdisk-tabs-scroll">
            <button
              type="button"
              className={`netdisk-tab ${selectedSubject === "all" ? "netdisk-tab--active" : ""}`}
              onClick={() => setSelectedSubject("all")}
            >
              全部
            </button>
            {Object.entries(EXAM_PAPER_SUBJECT_MAP).map(([key, meta]) => (
              <button
                type="button"
                key={key}
                className={`netdisk-tab ${selectedSubject === key ? "netdisk-tab--active" : ""}`}
                onClick={() => setSelectedSubject(key)}
              >
                {meta.label}
              </button>
            ))}
          </div>

          <div className="netdisk-controls">
            {/* Search */}
            <div className="netdisk-search-wrap">
              <svg className="netdisk-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="netdisk-search-input"
                placeholder="搜索试卷文件名..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
              {searchKeyword && (
                <button
                  type="button"
                  className="netdisk-search-clear"
                  onClick={() => setSearchKeyword("")}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Picker */}
            <select
              className="netdisk-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              aria-label="排序方式"
            >
              <option value="latest">最新上传</option>
              <option value="size">文件体积</option>
              <option value="name">试卷名称</option>
            </select>

            {/* Batch mode toggle */}
            <button
              type="button"
              className={`netdisk-btn-batch ${isBatchMode ? "netdisk-btn-batch--active" : ""}`}
              onClick={() => {
                setIsBatchMode((prev) => !prev);
                setSelectedIds(new Set());
              }}
            >
              {isBatchMode ? "退出多选" : "批量管理"}
            </button>
          </div>
        </div>

        {/* Content List Area */}
        <main className="netdisk-body">
          {loading ? (
            <div className="netdisk-loading-state">
              <div className="netdisk-spinner" />
              <p>正在读取试卷列表...</p>
            </div>
          ) : loadError ? (
            <div className="netdisk-empty-state" role="alert">
              <h3>读取云端试卷失败</h3>
              <p>{loadError}</p>
              <button type="button" className="netdisk-btn-primary" onClick={() => loadData(true)}>重试</button>
            </div>
          ) : !cloudStorageReady && sortedPapers.length === 0 ? (
            <div className="netdisk-empty-state" role="alert">
              <h3>云端存储尚未就绪</h3>
              <p>请先创建并绑定 R2 存储桶，再部署 Worker。</p>
            </div>
          ) : sortedPapers.length === 0 ? (
            <div className="netdisk-empty-state">
              <div className="netdisk-empty-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <h3>暂无试卷资料</h3>
              <p>
                {searchKeyword
                  ? "未搜索到匹配的试卷文件"
                  : selectedSubject !== "all"
                  ? "该学科暂无收录试卷，点击下方按钮开始添加"
                  : "集中收纳你的历年真题、全真模拟卷与复习资料，随时随地在线调取"}
              </p>
              {!searchKeyword && (
                <button
                  type="button"
                  className="netdisk-btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  ＋ 上传第一份试卷 PDF
                </button>
              )}
            </div>
          ) : (
            <div className="netdisk-list-wrap">
              <div className="netdisk-list-header">
                {isBatchMode && (
                  <div className="netdisk-file-col netdisk-file-col--select">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === sortedPapers.length}
                      onChange={handleSelectAll}
                      aria-label="全选"
                    />
                  </div>
                )}
                <div className="netdisk-file-col netdisk-file-col--main">试卷名称</div>
                <div className="netdisk-file-col netdisk-file-col--size">大小</div>
                <div className="netdisk-file-col netdisk-file-col--date">上传时间</div>
                <div className="netdisk-file-col netdisk-file-col--actions">操作</div>
              </div>

              <div className="netdisk-rows-scroll">
                {sortedPapers.map((paper) => (
                  <PaperListRow
                    key={paper.id}
                    paper={paper}
                    isBatchMode={isBatchMode}
                    isSelected={selectedIds.has(paper.id)}
                    onToggleSelect={handleToggleSelect}
                    onDownload={handleDownload}
                    onSyncLocal={handleSyncLocal}
                    onRename={(p) => setEditingPaper(p)}
                    onMove={(p) => setMovingPaper(p)}
                    onDelete={(p) => setDeletingPaper(p)}
                  />
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Batch Floating Action Bar */}
        {isBatchMode && (
          <footer className="netdisk-batch-bar" role="toolbar" aria-label="批量操作栏">
            <div className="netdisk-batch-summary">
              <span>已勾选 <strong>{selectedIds.size}</strong> 项</span>
              <button type="button" className="netdisk-batch-btn-link" onClick={handleSelectAll}>
                {selectedIds.size === sortedPapers.length ? "取消全选" : "全选全部"}
              </button>
            </div>
            <div className="netdisk-batch-actions">
              <button
                type="button"
                className="netdisk-batch-action-btn"
                disabled={selectedIds.size === 0}
                onClick={() => setIsBatchMoving(true)}
              >
                批量修改分类
              </button>
              <button
                type="button"
                className="netdisk-batch-action-btn netdisk-batch-action-btn--danger"
                disabled={selectedIds.size === 0}
                onClick={() => setIsBatchDeleting(true)}
              >
                批量删除
              </button>
            </div>
          </footer>
        )}

        {/* Upload Zone & Drag & Drop */}
        <PaperUploadZone
          inputRef={fileInputRef}
          onFilesSelected={handleFilesSelected}
          uploadTasks={uploadTasks}
          onDismissTask={(id) => setUploadTasks((prev) => prev.filter((t) => t.id !== id))}
        />

        {/* Action Modals */}
        {editingPaper && (
          <RenameModal
            paper={editingPaper}
            onClose={() => setEditingPaper(null)}
            onConfirm={handleRenameConfirm}
          />
        )}

        {movingPaper && (
          <MoveCategoryModal
            paper={movingPaper}
            onClose={() => setMovingPaper(null)}
            onConfirm={handleMoveConfirm}
          />
        )}

        {isBatchMoving && (
          <MoveCategoryModal
            batchIds={Array.from(selectedIds)}
            onClose={() => setIsBatchMoving(false)}
            onConfirm={handleMoveConfirm}
          />
        )}

        {deletingPaper && (
          <DeleteConfirmModal
            paper={deletingPaper}
            onClose={() => setDeletingPaper(null)}
            onConfirm={handleDeleteConfirm}
          />
        )}

        {isBatchDeleting && (
          <DeleteConfirmModal
            batchCount={selectedIds.size}
            onClose={() => setIsBatchDeleting(false)}
            onConfirm={handleBatchDeleteConfirm}
          />
        )}

        {/* Toast */}
        {toastMessage && (
          <div className="netdisk-toast" role="alert">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
}
