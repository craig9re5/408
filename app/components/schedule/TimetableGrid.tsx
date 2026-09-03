"use client";

import { useMemo, useRef, useEffect } from "react";
import {
  getWeekDaysInfo,
  type ActiveScheduleInfo,
  type ScheduleAppData,
  type ScheduleEvent,
  type CustomPeriodConfig,
} from "../../study-data";

interface TimetableGridProps {
  schedule: ScheduleAppData;
  activeInfo: ActiveScheduleInfo;
  todayStr: string;
  activeWeek: number;
  onSelectEvent: (event: ScheduleEvent) => void;
  isCompact?: boolean;
  focusedEventId?: string | null;
}

function periodToRow(p: number): number {
  if (p <= 4) return p + 1;
  if (p <= 8) return p + 2;
  return p + 3;
}

export function TimetableGrid({
  schedule,
  activeInfo,
  todayStr,
  activeWeek,
  onSelectEvent,
  isCompact = false,
  focusedEventId = null,
}: TimetableGridProps) {
  const activeCardRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 计算当前周的 7 天元数据 (周一至周日)
  const weekDays = useMemo(
    () => getWeekDaysInfo(schedule.semesterStartDate, activeWeek, todayStr),
    [schedule.semesterStartDate, activeWeek, todayStr]
  );

  const periodMap = useMemo(() => {
    const map = new Map<number, CustomPeriodConfig>();
    for (const p of schedule.periods) {
      map.set(p.period, p);
    }
    return map;
  }, [schedule.periods]);

  // 移动端首次加载时，若当前有进行中的课程，自动平滑居中滚动至该行
  useEffect(() => {
    if (!isCompact && activeCardRef.current && containerRef.current) {
      if (containerRef.current.scrollHeight > containerRef.current.clientHeight) {
        const cardTop = activeCardRef.current.offsetTop;
        containerRef.current.scrollTo({
          top: Math.max(0, cardTop - 140),
          behavior: "smooth",
        });
      }
    }
  }, [activeInfo.activeEvent?.id, isCompact]);

  const isLunchActive = activeInfo.status === "rest_break" && activeInfo.restBreak?.id === "lunch";
  const isDinnerActive = activeInfo.status === "rest_break" && activeInfo.restBreak?.id === "dinner";

  return (
    <div className={`timetable-container ${isCompact ? "timetable-container--compact" : ""}`} ref={containerRef}>
      <div className="timetable-grid">
        {/* ── 表头行：左上角时间角标 + 周一至周日 ── */}
        <div className="timetable-header-cell timetable-corner-cell">
          <span className="corner-week-badge">{activeWeek}周</span>
        </div>

        {weekDays.map((day) => (
          <div
            key={day.dayOfWeek}
            className={`timetable-header-cell ${day.isToday ? "timetable-header-cell--today" : ""}`}
            style={{ gridColumn: day.dayOfWeek + 1, gridRow: 1 }}
          >
            <span className="day-name">{day.label}</span>
            <span className="day-date">{day.monthDay}</span>
            {day.isToday && <span className="today-dot" aria-hidden="true" />}
          </div>
        ))}

        {/* ── 左侧时间轴标尺 (节次 + 起止时间) ── */}
        {schedule.periods.map((p) => {
          const row = periodToRow(p.period);
          const isPeriodActive = activeInfo.status === "in_progress" &&
            activeInfo.activeEvent &&
            p.period >= activeInfo.activeEvent.startPeriod &&
            p.period <= activeInfo.activeEvent.endPeriod;

          return (
            <div
              key={`ruler-${p.period}`}
              className={`timetable-ruler-cell ${isPeriodActive ? "timetable-ruler-cell--active" : ""}`}
              style={{ gridColumn: 1, gridRow: row }}
            >
              <span className="period-num">{p.period}</span>
              <span className="period-time">{p.start}</span>
              <span className="period-time">{p.end}</span>
            </div>
          );
        })}

        {/* ── 背景占位格子 (7天 x 13节) ── */}
        {weekDays.map((day) =>
          schedule.periods.map((p) => {
            const row = periodToRow(p.period);
            return (
              <div
                key={`cell-${day.dayOfWeek}-${p.period}`}
                className={`timetable-bg-cell ${day.isToday ? "timetable-bg-cell--today" : ""}`}
                style={{
                  gridColumn: day.dayOfWeek + 1,
                  gridRow: row,
                }}
              />
            );
          })
        )}

        {/* ── 午休横断分隔栏 (Row 6) ── */}
        <div
          className={`timetable-break-row ${isLunchActive ? "timetable-break-row--active" : ""}`}
          style={{ gridColumn: "1 / -1", gridRow: 6 }}
        >
          <span className="break-label">
            {isLunchActive ? `午休中 · 剩 ${activeInfo.remainingMinutes} 分钟` : "午休"}
          </span>
        </div>

        {/* ── 晚休横断分隔栏 (Row 11) ── */}
        <div
          className={`timetable-break-row ${isDinnerActive ? "timetable-break-row--active" : ""}`}
          style={{ gridColumn: "1 / -1", gridRow: 11 }}
        >
          <span className="break-label">
            {isDinnerActive ? `晚休中 · 剩 ${activeInfo.remainingMinutes} 分钟` : "晚休"}
          </span>
        </div>

        {/* ── 课程/复习卡片 (支持多节跨行合并) ── */}
        {schedule.events.map((evt) => {
          const startRow = periodToRow(evt.startPeriod);
          const endRow = periodToRow(evt.endPeriod);
          const rowSpan = endRow - startRow + 1;
          const col = evt.dayOfWeek + 1;

          const isActive =
            activeInfo.status === "in_progress" &&
            activeInfo.activeEvent?.id === evt.id;

          const isFocused = focusedEventId === evt.id;

          const startP = periodMap.get(evt.startPeriod);
          const endP = periodMap.get(evt.endPeriod);
          const timeRangeTooltip = `${startP?.start ?? ""} ~ ${endP?.end ?? ""}`;

          return (
            <button
              key={evt.id}
              ref={isActive ? activeCardRef : null}
              type="button"
              className={`timetable-card timetable-card--${evt.theme} ${
                isActive ? "timetable-card--active" : ""
              } ${isFocused ? "timetable-card--focused" : ""} ${rowSpan > 1 ? "timetable-card--merged" : ""}`}
              style={{
                gridColumn: col,
                gridRow: `${startRow} / span ${rowSpan}`,
              }}
              onClick={() => onSelectEvent(evt)}
              title={`${evt.title} (${timeRangeTooltip})`}
              aria-label={`${evt.title}，第 ${evt.startPeriod} 至 ${evt.endPeriod} 节，${timeRangeTooltip}`}
            >
              <div className="timetable-card__inner">
                <span className="timetable-card__title">{evt.title}</span>

                {/* 截图同款【上课中】蓝色胶囊徽标 */}
                {isActive && (
                  <div className="timetable-active-pill" aria-label="正在进行中">
                    <span className="timetable-active-pill__dot" />
                    <span>上课中</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
