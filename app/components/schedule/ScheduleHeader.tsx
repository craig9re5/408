"use client";

import type { ActiveScheduleInfo } from "../../study-data";

interface ScheduleHeaderProps {
  activeWeek: number;
  currentCalculatedWeek: number;
  onSelectWeek: (week: number) => void;
  onResetDefault: () => void;
  layoutMode?: "transposed" | "portrait";
  onChangeLayoutMode?: (mode: "transposed" | "portrait") => void;
  activeInfo?: ActiveScheduleInfo;
}

export function ScheduleHeader({
  activeWeek,
  currentCalculatedWeek,
  onSelectWeek,
  onResetDefault,
  layoutMode = "transposed",
  onChangeLayoutMode,
  activeInfo,
}: ScheduleHeaderProps) {
  const isDifferentWeek = activeWeek !== currentCalculatedWeek;

  return (
    <header className="schedule-unified-header">
      {/* ── 左侧：单一周次控制器 (整合下拉与步进箭头，无重复元素) ── */}
      <div className="schedule-unified-week-nav">
        <button
          type="button"
          className="schedule-week-arrow-btn"
          disabled={activeWeek <= 1}
          onClick={() => onSelectWeek(Math.max(1, activeWeek - 1))}
          title="上一周"
          aria-label="上一周"
        >
          ‹
        </button>

        <div className="schedule-week-dropdown-wrap">
          <label htmlFor="schedule-week-select-unified" className="visually-hidden">选择周次</label>
          <select
            id="schedule-week-select-unified"
            value={activeWeek}
            onChange={(e) => onSelectWeek(parseInt(e.target.value, 10))}
            className="schedule-week-native-select"
          >
            {Array.from({ length: 25 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                第 {w} 周 {w === currentCalculatedWeek ? "(当前周)" : ""}
              </option>
            ))}
          </select>
          <div className="schedule-week-display-badge">
            <span>第 {activeWeek} 周</span>
            <span className="caret">▾</span>
          </div>
        </div>

        <button
          type="button"
          className="schedule-week-arrow-btn"
          disabled={activeWeek >= 25}
          onClick={() => onSelectWeek(Math.min(25, activeWeek + 1))}
          title="下一周"
          aria-label="下一周"
        >
          ›
        </button>

        {isDifferentWeek && (
          <button
            type="button"
            className="schedule-today-week-pill"
            onClick={() => onSelectWeek(currentCalculatedWeek)}
            title="一键回到当前周"
          >
            本周
          </button>
        )}
      </div>

      {/* ── 实时作息状态提示（进行中 / 休息中） ── */}
      {activeInfo && (
        <div className="schedule-header-status-indicator">
          {activeInfo.status === "in_progress" && activeInfo.activeEvent ? (
            <div className="header-status-pill in-progress" title="当前时段正在上课">
              <span className="live-dot" />
              <span>进行中: {activeInfo.activeEvent.title}</span>
            </div>
          ) : (
            <div className="header-status-pill resting" title="当前为空隙休息时段">
              <span className="rest-dot" />
              <span>
                ☕ 休息中
                {activeInfo.status === "rest_break" && activeInfo.restBreak
                  ? ` · ${activeInfo.restBreak.label} (剩 ${activeInfo.remainingMinutes}m)`
                  : activeInfo.intermissionNextEvent && activeInfo.startsInMinutes <= 60
                  ? ` · 距下节 ${activeInfo.intermissionNextEvent.title} 剩 ${activeInfo.startsInMinutes}m`
                  : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── 中间：横纵转置 / 竖版周课表 视图自由切换 ── */}
      {onChangeLayoutMode && (
        <div className="schedule-layout-mode-switch" role="tablist" aria-label="课表视图模式切换">
          <button
            type="button"
            role="tab"
            aria-selected={layoutMode === "transposed"}
            className={`layout-switch-btn ${layoutMode === "transposed" ? "active" : ""}`}
            onClick={() => onChangeLayoutMode("transposed")}
            title="电脑宽屏推荐：横向时间轴甘特视图"
          >
            <span className="layout-switch-full">💻 横向时间轴</span><span className="layout-switch-short">时间轴</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={layoutMode === "portrait"}
            className={`layout-switch-btn ${layoutMode === "portrait" ? "active" : ""}`}
            onClick={() => onChangeLayoutMode("portrait")}
            title="传统 7 列竖向课表视图"
          >
            <span className="layout-switch-full">📱 竖向周课表</span><span className="layout-switch-short">周课表</span>
          </button>
        </div>
      )}

      {/* ── 右侧：重置默认排课 ── */}
      <div className="schedule-unified-actions">
        <button
          type="button"
          className="schedule-reset-btn"
          onClick={onResetDefault}
          title="恢复考研强化默认排课"
        >
          重置默认课表
        </button>
      </div>
    </header>
  );
}
