"use client";

import type { ActiveScheduleInfo, ScheduleAppData, ScheduleEvent } from "../../study-data";

interface TodayDayScheduleProps {
  schedule: ScheduleAppData;
  todayStr: string;
  activeInfo: ActiveScheduleInfo;
  focusedEventId: string | null;
  onSelectEvent: (event: ScheduleEvent) => void;
}

export function TodayDaySchedule({ schedule, todayStr, activeInfo, focusedEventId, onSelectEvent }: TodayDayScheduleProps) {
  const day = new Date(`${todayStr}T00:00:00`);
  const weekday = day.getDay() || 7;
  const events = schedule.events.filter((event) => event.dayOfWeek === weekday).sort((a, b) => a.startPeriod - b.startPeriod);
  const periods = new Map(schedule.periods.map((period) => [period.period, period]));

  return (
    <section className="today-day-schedule" aria-label="今天的课程安排">
      {/* 日期和星期已在上方页头显示，这里只保留课程数与当前状态。 */}
      <div className="today-day-schedule__heading">
        <div><span>当天安排</span></div>
        <small>
          {activeInfo.status === "rest_break" && activeInfo.restBreak
            ? `${activeInfo.restBreak.label} · 剩 ${activeInfo.remainingMinutes} 分钟`
            : `${events.length} 段课程`}
        </small>
      </div>
      {events.length === 0 ? (
        <p className="today-day-schedule__empty">今天没有课程安排，可在课表页查看或调整计划。</p>
      ) : (
        <ol className="today-day-schedule__list">
          {events.map((event) => {
            const start = periods.get(event.startPeriod)?.start ?? "";
            const end = periods.get(event.endPeriod)?.end ?? "";
            const isActive = activeInfo.status === "in_progress" && activeInfo.activeEvent?.id === event.id;
            return (
              <li key={event.id}>
                <time className="today-day-schedule__time" dateTime={start}>{start}<span>{end}</span></time>
                <button
                  type="button"
                  className={`today-day-schedule__event today-day-schedule__event--${event.theme}${isActive ? " is-active" : ""}${focusedEventId === event.id ? " is-focused" : ""}`}
                  aria-pressed={focusedEventId === event.id}
                  aria-label={`${event.title}，${event.startPeriod === event.endPeriod ? `第 ${event.startPeriod} 节` : `第 ${event.startPeriod} 至 ${event.endPeriod} 节`}，${start} 至 ${end}`}
                  onClick={() => onSelectEvent(event)}
                >
                  <span><strong>{event.title}</strong><small>{event.startPeriod === event.endPeriod ? `第 ${event.startPeriod} 节` : `第 ${event.startPeriod}–${event.endPeriod} 节`}</small></span>
                  {isActive && <em>进行中</em>}
                  <span className="today-day-schedule__arrow" aria-hidden="true">›</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
