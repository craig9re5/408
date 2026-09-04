"use client";

import { useMemo, useRef, useEffect } from "react";
import {
  getWeekDaysInfo,
  type ActiveScheduleInfo,
  type ScheduleAppData,
  type ScheduleEvent,
  type CustomPeriodConfig,
} from "../../study-data";

interface TransposedTimetableGridProps {
  schedule: ScheduleAppData;
  activeInfo: ActiveScheduleInfo;
  todayStr: string;
  activeWeek: number;
  onSelectEvent: (event: ScheduleEvent) => void;
  focusedEventId?: string | null;
}

// 节次到横向网格列索引的映射 (共 16 列)
// 列 1: 星期日期标尺
// 列 2~5: 上午 1~4 节
// 列 6: 午休 (贯穿垂直分隔带)
// 列 7~10: 下午 5~8 节
// 列 11: 晚休 (贯穿垂直分隔带)
// 列 12~16: 晚上 9~13 节
function periodToCol(p: number): number {
  if (p <= 4) return p + 1;
  if (p <= 8) return p + 2;
  return p + 3;
}

export function TransposedTimetableGrid({
  schedule,
  activeInfo,
  todayStr,
  activeWeek,
  onSelectEvent,
  focusedEventId = null,
}: TransposedTimetableGridProps) {
  const activeCardRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  // 如果有进行中的卡片且存在溢出，自动微调居中
  useEffect(() => {
    if (activeCardRef.current && containerRef.current) {
      if (containerRef.current.scrollWidth > containerRef.current.clientWidth) {
        const cardLeft = activeCardRef.current.offsetLeft;
        containerRef.current.scrollTo({
          left: Math.max(0, cardLeft - 180),
          behavior: "smooth",
        });
      }
    }
  }, [activeInfo.activeEvent?.id]);

  const isLunchActive = activeInfo.status === "rest_break" && activeInfo.restBreak?.id === "lunch";
  const isDinnerActive = activeInfo.status === "rest_break" && activeInfo.restBreak?.id === "dinner";

  return (
    <div className="timetable-transposed-container" ref={containerRef}>
      <div className="timetable-transposed-grid">
        {/* ── 表头左上角：星期/时段 ── */}
        <div className="timetable-transposed-header-corner">
          <span className="corner-week-tag">第 {activeWeek} 周</span>
        </div>

        {/* ── 表头列：1~4节 (时间分两行，如 18:30~ \n 19:20 居中) ── */}
        {schedule.periods.slice(0, 4).map((p) => {
          const col = periodToCol(p.period);
          return (
            <div
              key={`th-p-${p.period}`}
              className="timetable-transposed-th"
              style={{ gridColumn: col, gridRow: 1 }}
            >
              <span className="p-badge">{p.period}节</span>
              <div className="p-time-stacked">
                <span className="time-line">{p.start}~</span>
                <span className="time-line">{p.end}</span>
              </div>
            </div>
          );
        })}

        {/* ── 表头列：午休 (列 6) ── */}
        <div
          className={`timetable-transposed-th timetable-transposed-th--break ${isLunchActive ? "active" : ""}`}
          style={{ gridColumn: 6, gridRow: 1 }}
        >
          <span className="break-title">午休</span>
          <div className="p-time-stacked break-time">
            <span className="time-line">12:00~</span>
            <span className="time-line">14:00</span>
          </div>
        </div>

        {/* ── 表头列：5~8节 ── */}
        {schedule.periods.slice(4, 8).map((p) => {
          const col = periodToCol(p.period);
          return (
            <div
              key={`th-p-${p.period}`}
              className="timetable-transposed-th"
              style={{ gridColumn: col, gridRow: 1 }}
            >
              <span className="p-badge">{p.period}节</span>
              <div className="p-time-stacked">
                <span className="time-line">{p.start}~</span>
                <span className="time-line">{p.end}</span>
              </div>
            </div>
          );
        })}

        {/* ── 表头列：晚休 (列 11) ── */}
        <div
          className={`timetable-transposed-th timetable-transposed-th--break ${isDinnerActive ? "active" : ""}`}
          style={{ gridColumn: 11, gridRow: 1 }}
        >
          <span className="break-title">晚休</span>
          <div className="p-time-stacked break-time">
            <span className="time-line">18:00~</span>
            <span className="time-line">18:30</span>
          </div>
        </div>

        {/* ── 表头列：9~13节 ── */}
        {schedule.periods.slice(8).map((p) => {
          const col = periodToCol(p.period);
          return (
            <div
              key={`th-p-${p.period}`}
              className="timetable-transposed-th"
              style={{ gridColumn: col, gridRow: 1 }}
            >
              <span className="p-badge">{p.period}节</span>
              <div className="p-time-stacked">
                <span className="time-line">{p.start}~</span>
                <span className="time-line">{p.end}</span>
              </div>
            </div>
          );
        })}

        {/* ── 纵向左侧：周一至周日 7 天标尺 (居中) ── */}
        {weekDays.map((day) => {
          const row = day.dayOfWeek + 1;
          return (
            <div
              key={`row-header-${day.dayOfWeek}`}
              className={`timetable-transposed-row-header ${day.isToday ? "today" : ""}`}
              style={{ gridColumn: 1, gridRow: row }}
            >
              <div className="row-header__inner">
                <span className="row-day-name">{day.label}</span>
                <span className="row-day-date">{day.monthDay}</span>
                {day.isToday && <span className="row-today-pill">今天</span>}
              </div>
            </div>
          );
        })}

        {/* ── 背景占位格子 (7行 x 各时段) ── */}
        {weekDays.map((day) => {
          const row = day.dayOfWeek + 1;
          return schedule.periods.map((p) => {
            const col = periodToCol(p.period);
            return (
              <div
                key={`bg-${day.dayOfWeek}-${p.period}`}
                className={`timetable-transposed-bg-cell ${day.isToday ? "today-row" : ""}`}
                style={{ gridColumn: col, gridRow: row }}
              />
            );
          });
        })}

        {/* ── 垂直贯穿休息条：午休 (列 6，行 2~8) ── */}
        <div
          className={`timetable-transposed-vbreak ${isLunchActive ? "active" : ""}`}
          style={{ gridColumn: 6, gridRow: "2 / span 7" }}
        >
          <div className="vbreak-text">
            <span>午休</span>
            {isLunchActive && <span className="vbreak-sub">剩{activeInfo.remainingMinutes}m</span>}
          </div>
        </div>

        {/* ── 垂直贯穿休息条：晚休 (列 11，行 2~8) ── */}
        <div
          className={`timetable-transposed-vbreak ${isDinnerActive ? "active" : ""}`}
          style={{ gridColumn: 11, gridRow: "2 / span 7" }}
        >
          <div className="vbreak-text">
            <span>晚休</span>
            {isDinnerActive && <span className="vbreak-sub">剩{activeInfo.remainingMinutes}m</span>}
          </div>
        </div>

        {/* ── 课程横向长卡片 (支持多节跨列合并，全居中对齐) ── */}
        {schedule.events.map((evt) => {
          const row = evt.dayOfWeek + 1;
          const startCol = periodToCol(evt.startPeriod);
          const endCol = periodToCol(evt.endPeriod);
          const colSpan = endCol - startCol + 1;

          const isActive =
            activeInfo.status === "in_progress" &&
            activeInfo.activeEvent?.id === evt.id;

          const isFocused = focusedEventId === evt.id;

          const startP = periodMap.get(evt.startPeriod);
          const endP = periodMap.get(evt.endPeriod);
          const timeRangeTooltip = `${startP?.start ?? ""} ~ ${endP?.end ?? ""}`;

          return (
            <button
              key={`transposed-${evt.id}`}
              ref={isActive ? activeCardRef : null}
              type="button"
              className={`timetable-card timetable-transposed-card timetable-card--${evt.theme} ${
                isActive ? "timetable-card--active" : ""
              } ${isFocused ? "timetable-card--focused" : ""}`}
              style={{
                gridRow: row,
                gridColumn: `${startCol} / span ${colSpan}`,
              }}
              onClick={() => onSelectEvent(evt)}
              title={`${evt.title} (${timeRangeTooltip})`}
              aria-label={`${evt.title}，第 ${evt.startPeriod} 至 ${evt.endPeriod} 节，${timeRangeTooltip}`}
            >
              {/* 正在进行中右上角微光角标（绝对定位，绝不挤压或偏移居中标题） */}
              {isActive && (
                <div
                  className={`card-live-corner-badge ${colSpan === 1 ? "dot-only" : ""}`}
                  aria-label="正在进行中"
                  title="当前正在上课中"
                >
                  <span className="live-dot" />
                  {colSpan > 1 && <span className="live-text">上课中</span>}
                </div>
              )}

              <div className="timetable-transposed-card__inner">
                <span className="card-title-text">{evt.title}</span>
                <span className="card-time-sub">{timeRangeTooltip}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
