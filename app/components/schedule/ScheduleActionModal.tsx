"use client";

import { Icon } from "../common/Icon";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ScheduleEvent, CustomPeriodConfig, ActiveScheduleInfo } from "../../study-data";

interface ScheduleActionModalProps {
  event: ScheduleEvent | null;
  periods: CustomPeriodConfig[];
  activeInfo: ActiveScheduleInfo;
  onClose: () => void;
  onWriteJournal?: (event: ScheduleEvent) => void;
  onJumpToTasks?: (area?: "408" | "math" | "english" | "politics") => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ScheduleActionModal({
  event,
  periods,
  activeInfo,
  onClose,
  onWriteJournal,
  onJumpToTasks,
}: ScheduleActionModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // 打开时：记录触发焦点、隔离背景（inert）、锁定滚动、初始聚焦；
  // 关闭时：恢复背景与焦点。
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    // 背景隔离：弹窗通过 Portal 挂在 body 下，其余 body 直系子节点全部 inert
    const siblings = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== overlay
    );
    siblings.forEach((el) => {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";

    const getFocusables = () =>
      Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // 初始焦点：优先主操作按钮，其次关闭按钮，最后弹窗容器
    const focusables = getFocusables();
    const initialTarget =
      overlay.querySelector<HTMLElement>(".schedule-action-btn--primary") ??
      focusables[0] ??
      overlay;
    initialTarget.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // Tab 循环：焦点只在弹窗内部移动，不穿透到背景
      const items = getFocusables();
      if (items.length === 0) {
        e.preventDefault();
        overlay.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const focusInside = active !== null && overlay.contains(active);

      if (e.shiftKey) {
        if (!focusInside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!focusInside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      siblings.forEach((el) => {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      });
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
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

  return createPortal(
    <div
      ref={overlayRef}
      className="schedule-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="schedule-modal-content">
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
            <Icon name="x" />
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
                <Icon name="pen" /> 记录本节复盘心得
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
                <Icon name="target" /> 查看对应知识点打卡
              </button>
            )}
          </div>
        </main>
      </div>
    </div>,
    document.body
  );
}
