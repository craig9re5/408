"use client";

import { useState, useEffect, useRef } from "react";

export interface UploadTask {
  id: string;
  name: string;
  progress: number; // 0 - 100
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

interface PaperUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  uploadTasks: UploadTask[];
  onDismissTask: (id: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function PaperUploadZone({
  onFilesSelected,
  uploadTasks,
  onDismissTask,
  inputRef,
}: PaperUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounter.current += 1;
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        setIsDragging(true);
      }
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setIsDragging(false);
        dragCounter.current = 0;
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesSelected(Array.from(e.dataTransfer.files));
      }
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFilesSelected]);

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="visually-hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />

      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="netdisk-drag-overlay" aria-hidden="true">
          <div className="netdisk-drag-box">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <h3>释放以导入试卷 PDF</h3>
            <p>支持批量拖入，单文件最大 100 MB</p>
          </div>
        </div>
      )}

      {/* Floating Upload Tasks Drawer */}
      {uploadTasks.length > 0 && (
        <div className="netdisk-upload-drawer" role="region" aria-label="上传任务列表">
          <div className="netdisk-upload-drawer-header">
            <h4>正在上传 ({uploadTasks.filter((t) => t.status === "uploading").length}/{uploadTasks.length})</h4>
          </div>
          <div className="netdisk-upload-task-list">
            {uploadTasks.map((task) => (
              <div key={task.id} className={`netdisk-upload-task netdisk-upload-task--${task.status}`}>
                <div className="netdisk-upload-task-info">
                  <span className="netdisk-task-name" title={task.name}>{task.name}</span>
                  <span className="netdisk-task-status">
                    {task.status === "uploading" && `${task.progress}%`}
                    {task.status === "success" && "✓ 完成"}
                    {task.status === "error" && "✕ 失败"}
                  </span>
                </div>
                {task.status === "uploading" && (
                  <div className="netdisk-task-progress-track">
                    <div className="netdisk-task-progress-bar" style={{ width: `${task.progress}%` }} />
                  </div>
                )}
                {task.error && (
                  <p className="netdisk-task-error-msg">{task.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
