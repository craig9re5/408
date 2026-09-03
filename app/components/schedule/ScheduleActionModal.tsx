"use client";

import { useEffect, useRef } from "react";
import type { ScheduleEvent, CustomPeriodConfig, ActiveScheduleInfo } from "../../study-data";

interface ScheduleActionModalProps {
  event: ScheduleEvent | null;
  periods: CustomPeriodConfig[];
  activeInfo: ActiveScheduleInfo;
  onClose: () => void;
  onWriteJournal?: (event: ScheduleEvent) => void;
  onJumpToTasks?: (area?: "408" | "math" | "english" | "politics") => void;
}

export function ScheduleActionModal({
  event,
  periods,
  activeInfo,
  onClose,
  onWriteJournal,
  onJumpToTasks,
}: ScheduleActionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!event) return null;

  const startP = periods.find((p) => p.period === event.startPeriod);
  const endP = periods.find((p) => p.period === event.endPeriod);
  const timeRangeStr = `${startP?.start ?? ""} - ${endP?.end ?? ""}`;
  const periodLabel = event.startPeriod === event.endPeriod
    ? `第 ${event.startPeriod} 节`
    : `第 ${event.startPeriod} ~ ${event.endPeriod} 节`;

  const weekdayNames = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const isCurrentActive = activeInfo.status === "in_progress" && activeInfo.activeEvent?.id === event.id;

  return (
    <div
      className="schedule-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="schedule-modal-content" ref={modalRef}>
        <header className="schedule-modal-header">
          <div className="schedule-modal-badge-row">
            <span className={`schedule-theme-tag schedule-theme-tag--${event.theme}`}>
              {event.linkedArea ? event.linkedArea.toUpperCase() : "备考"}
            </span>
            {isCurrentActive && (
              <span className="badge-in-progress">
                <span className="badge-in-progress__dot" />
                正在进行中 · 剩 {activeInfo.remainingMinutes} 分钟
              </span>
            )}
          </div>
          <button
            type="button"
            className="schedule-modal-close"
            onClick={onClose}
            aria-label="关闭详情弹窗"
          >
            ✕
          </button>
        </header>

        <main className="schedule-modal-body">
          <h2 id="schedule-modal-title" className="schedule-modal-title">
            {event.title}
          </h2>

          <div className="schedule-modal-meta">
            <div className="schedule-meta-item">
              <span className="meta-label">时段安排</span>
              <strong className="meta-value">
                {weekdayNames[event.dayOfWeek]} · {periodLabel} ({timeRangeStr})
              </strong>
            </div>

            {event.locationOrNotes && (
              <div className="schedule-meta-item">
                <span className="meta-label">备注/地点</span>
                <span className="meta-value">{event.locationOrNotes}</span>
              </div>
            )}
          </div>

          <div className="schedule-modal-actions">
            {onWriteJournal && (
              <button
                type="button"
                className="schedule-action-btn schedule-action-btn--primary"
                onClick={() => {
                  onWriteJournal(event);
                  onClose();
                }}
              >
                ✍ 记录本节复盘心得
              </button>
            )}

            {onJumpToTasks && event.linkedArea && (
              <button
                type="button"
                className="schedule-action-btn schedule-action-btn--secondary"
                onClick={() => {
                  onJumpToTasks(event.linkedArea);
                  onClose();
                }}
              >
                🎯 查看对应知识点打卡
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
