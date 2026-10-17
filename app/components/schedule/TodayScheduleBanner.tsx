"use client";

import { Icon } from "../common/Icon";
import type { ActiveScheduleInfo, ScheduleAppData, ScheduleEvent } from "../../study-data";

interface TodayScheduleBannerProps {
  schedule: ScheduleAppData;
  activeInfo: ActiveScheduleInfo;
  onOpenSchedule: () => void;
  onWriteJournal?: (event: ScheduleEvent) => void;
}

export function TodayScheduleBanner({
  schedule,
  activeInfo,
  onOpenSchedule,
  onWriteJournal,
}: TodayScheduleBannerProps) {
  const { status, activeEvent, restBreak, intermissionNextEvent, remainingMinutes, startsInMinutes, elapsedPercent } = activeInfo;

  return (
    <section className="today-schedule-banner" aria-label="今日实时作息状态">
      <div className="today-schedule-banner__content">
        <div className="today-schedule-banner__header">
          <div className="status-indicator-group">
            {status === "in_progress" && activeEvent && (
              <>
                <span className="live-pulsing-badge">
                  <span className="pulse-dot" />
                  上课中
                </span>
                <span className="time-countdown">剩 {remainingMinutes} 分钟</span>
              </>
            )}

            {status === "rest_break" && restBreak && (
              <>
                <span className="rest-badge">
                  <span className="rest-icon"><Icon name="coffee" /></span>
                  {restBreak.label}中
                </span>
                <span className="time-countdown">距结束 {remainingMinutes} 分钟</span>
              </>
            )}

            {status === "intermission" && intermissionNextEvent && (
              <>
                <span className="intermission-badge">
                  <span className="intermission-icon"><Icon name="hourglass" /></span>
                  课间休整
                </span>
                <span className="time-countdown">{startsInMinutes} 分钟后开始</span>
              </>
            )}

            {status === "idle" && (
              <>
                <span className="rest-badge rest-badge--idle">
                  <span className="rest-icon"><Icon name="coffee" /></span>
                  休息中
                </span>
                <span className="time-countdown">
                  {intermissionNextEvent ? `${startsInMinutes} 分钟后上课 (${intermissionNextEvent.title})` : "当前为空隙自由时段"}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            className="banner-nav-btn"
            onClick={onOpenSchedule}
          >
            <span>全周课表</span>
            <span className="arrow"><Icon name="arrow-right" /></span>
          </button>
        </div>

        <div className="today-schedule-banner__body">
          {status === "in_progress" && activeEvent && (
            <div className="current-event-info">
              <div className="event-title-row">
                <strong className={`event-title-text event-title-text--${activeEvent.theme}`}>
                  {activeEvent.title}
                </strong>
                <span className="event-periods-label">
                  第 {activeEvent.startPeriod}~{activeEvent.endPeriod} 节
                </span>
              </div>

              <div className="event-progress-track">
                <div
                  className={`event-progress-bar event-progress-bar--${activeEvent.theme}`}
                  style={{ width: `${elapsedPercent}%` }}
                />
              </div>
            </div>
          )}

          {status === "rest_break" && restBreak && (
            <div className="rest-info-text">
              <strong>放松身心，休整蓄能</strong>
              <span>({restBreak.startTime} - {restBreak.endTime}) 劳逸结合，保持高强度复习续航。</span>
            </div>
          )}

          {status === "intermission" && intermissionNextEvent && (
            <div className="intermission-info-text">
              <span>下一节课程预告：</span>
              <strong>{intermissionNextEvent.title}</strong>
              <span>(第 {intermissionNextEvent.startPeriod}~{intermissionNextEvent.endPeriod} 节) 准备就绪，即将开练。</span>
            </div>
          )}

          {status === "idle" && (
            <div className="idle-info-text">
              <span>当前无固定集中授课/大块排课，可结合下方「今日计划」与「逾期追赶」稳步攻克章节知识点。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
