"use client";

import { Icon } from "./common/Icon";
import "../analytics.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HeatmapDay, WeeklyTrend } from "../study-data";

type Props = {
  heatmapDays: HeatmapDay[];
  weeklyTrends: WeeklyTrend[];
  currentWeekTrend?: WeeklyTrend;
  weeklyAverage: string;
  peakWeekActions: number;
  maxWeeklyAction: number;
  formatDateChinese: (date: string) => string;
};

function describeHeatmapDay(day: HeatmapDay): string {
  if (day.isFuture) return "未来日期";
  return day.totalActions > 0
    ? `学完 ${day.learnedCount} 节 · 复习 ${day.reviewedCount} 章 · 共 ${day.totalActions} 项动作`
    : "当日无打卡记录";
}

export const AnalyticsActivity = memo(function AnalyticsActivity({ heatmapDays, weeklyTrends, currentWeekTrend, weeklyAverage, peakWeekActions, maxWeeklyAction, formatDateChinese }: Props) {
  const [hoveredHeatmapDay, setHoveredHeatmapDay] = useState<HeatmapDay | null>(null);
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<HeatmapDay | null>(null);
  const [hoveredTrendWeek, setHoveredTrendWeek] = useState<WeeklyTrend | null>(null);
  const heatmapViewportRef = useRef<HTMLDivElement>(null);
  const heatmapInitiallyPositionedRef = useRef(false);
  const matrixRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = heatmapViewportRef.current;
    if (!viewport) return;
    const showLatestWeek = () => {
      if (heatmapInitiallyPositionedRef.current || getComputedStyle(viewport).overflowX !== "auto" || viewport.scrollWidth <= viewport.clientWidth) return;
      viewport.scrollLeft = viewport.scrollWidth;
      heatmapInitiallyPositionedRef.current = true;
    };
    showLatestWeek();
    const observer = new ResizeObserver(showLatestWeek);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [heatmapDays]);

  // 漫游 tabindex：整个热力图只有一个 Tab 停靠点，方向键在格子间移动
  const initialFocusDate = useMemo(() => {
    const today = heatmapDays.find((d) => d.isToday);
    if (today) return today.date;
    const pastDays = heatmapDays.filter((d) => !d.isFuture);
    return (pastDays[pastDays.length - 1] ?? heatmapDays[0])?.date ?? "";
  }, [heatmapDays]);
  const [focusDate, setFocusDate] = useState(initialFocusDate);

  const moveHeatmapFocus = useCallback(
    (currentDate: string, delta: number) => {
      const idx = heatmapDays.findIndex((d) => d.date === currentDate);
      if (idx === -1) return;
      const nextIdx = Math.min(heatmapDays.length - 1, Math.max(0, idx + delta));
      const nextDay = heatmapDays[nextIdx];
      if (!nextDay || nextDay.date === currentDate) return;
      setFocusDate(nextDay.date);
      setSelectedHeatmapDay(nextDay);
      requestAnimationFrame(() => {
        matrixRef.current
          ?.querySelector<HTMLElement>(`[data-date="${nextDay.date}"]`)
          ?.focus();
      });
    },
    [heatmapDays]
  );

  const handleHeatmapKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, day: HeatmapDay) => {
      // 布局为列优先（每列 7 天）：左右跨列 ±7，上下同列 ±1
      const deltaByKey: Record<string, number> = {
        ArrowLeft: -7,
        ArrowRight: 7,
        ArrowUp: -1,
        ArrowDown: 1,
      };
      const delta = deltaByKey[e.key];
      if (delta !== undefined) {
        e.preventDefault();
        moveHeatmapFocus(day.date, delta);
      } else if (e.key === "Home") {
        e.preventDefault();
        const first = heatmapDays[0];
        if (first) moveHeatmapFocus(day.date, -heatmapDays.length);
      } else if (e.key === "End") {
        e.preventDefault();
        moveHeatmapFocus(day.date, heatmapDays.length);
      }
    },
    [heatmapDays, moveHeatmapFocus]
  );

  const activeHeatmapDay = hoveredHeatmapDay ?? selectedHeatmapDay;
  const pastDaysDesc = useMemo(
    () => heatmapDays.filter((d) => !d.isFuture).slice().reverse(),
    [heatmapDays]
  );

  return (
              <div className="analytics-activity-grid">
                <article className="analytics-card heatmap-card">
                  <div className="card-header-row">
                    <div>
                      <h3>打卡轨迹</h3>
                    </div>
                    <div className="heatmap-legend" aria-hidden="true">
                      <span>少</span>
                      <i className="level-0" />
                      <i className="level-1" />
                      <i className="level-2" />
                      <i className="level-3" />
                      <span>多</span>
                    </div>
                  </div>

                  <div className="heatmap-viewport" ref={heatmapViewportRef}>
                    <div className="heatmap-labels-col" aria-hidden="true">
                      <span>一</span>
                      <span>二</span>
                      <span>三</span>
                      <span>四</span>
                      <span>五</span>
                      <span>六</span>
                      <span>日</span>
                    </div>
                    <div
                      className="heatmap-matrix"
                      ref={matrixRef}
                      role="group"
                      aria-label="近 13 周每日打卡热力图，使用方向键浏览每一天"
                    >
                      {Array.from({ length: 13 }).map((_, colIdx) => (
                        <div className="heatmap-col" key={colIdx}>
                          {heatmapDays.slice(colIdx * 7, (colIdx + 1) * 7).map((day) => (
                            <button
                              type="button"
                              key={day.date}
                              data-date={day.date}
                              className={`heatmap-cell level-${day.level} ${day.isToday ? "today-cell" : ""} ${day.isFuture ? "future-cell" : ""} ${selectedHeatmapDay?.date === day.date ? "is-selected" : ""}`}
                              tabIndex={day.date === focusDate ? 0 : -1}
                              aria-label={`${formatDateChinese(day.date)} (${day.date})：${describeHeatmapDay(day)}`}
                              aria-current={day.isToday ? "date" : undefined}
                              onMouseEnter={() => setHoveredHeatmapDay(day)}
                              onMouseLeave={() => setHoveredHeatmapDay((curr) => curr?.date === day.date ? null : curr)}
                              onFocus={() => {
                                setFocusDate(day.date);
                                setSelectedHeatmapDay(day);
                              }}
                              onClick={() => setSelectedHeatmapDay(day)}
                              onKeyDown={(e) => handleHeatmapKeyDown(e, day)}
                              title={`${day.date}: 学完 ${day.learnedCount} 节, 复习 ${day.reviewedCount} 章`}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="heatmap-scroll-hint">左右滑动查看近 13 周</p>

                  <div className="heatmap-hover-info" aria-live="polite">
                    {activeHeatmapDay ? (
                      <div className="hover-detail">
                        <strong>{formatDateChinese(activeHeatmapDay.date)} ({activeHeatmapDay.date})</strong>
                        <span>{describeHeatmapDay(activeHeatmapDay)}</span>
                      </div>
                    ) : (
                      <div className="hover-detail placeholder">
                        <span><Icon name="lightbulb" /> 悬停、点击或 Tab 聚焦方块（方向键移动），查看当日学完与复习详情</span>
                      </div>
                    )}
                  </div>

                  <details className="heatmap-data-details">
                    <summary>查看每日打卡数据列表</summary>
                    <ul className="heatmap-data-list">
                      {pastDaysDesc.map((day) => (
                        <li key={day.date} className={day.totalActions > 0 ? "" : "is-empty"}>
                          <span className="heatmap-data-list__date">
                            {formatDateChinese(day.date)}{day.isToday ? "（今天）" : ""}
                          </span>
                          <span className="heatmap-data-list__value">
                            {day.totalActions > 0
                              ? `学完 ${day.learnedCount} 节 · 复习 ${day.reviewedCount} 章`
                              : "无记录"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>

                <article className="analytics-card trend-card">
                  <div className="card-header-row">
                    <div>
                      <h3>周度产出趋势</h3>
                    </div>
                    <div className="trend-legend" aria-hidden="true">
                      <span className="legend-item learned"><i /> 新学</span>
                      <span className="legend-item reviewed"><i /> 复习</span>
                    </div>
                  </div>

                  <div className="trend-summary-strip">
                    <div className="trend-summary-item">
                      <small>本周打卡</small>
                      <strong>{currentWeekTrend?.totalActions ?? 0} <small>项</small></strong>
                    </div>
                    <div className="trend-summary-item">
                      <small>8周周均</small>
                      <strong>{weeklyAverage} <small>项/周</small></strong>
                    </div>
                    <div className="trend-summary-item">
                      <small>最高周产出</small>
                      <strong>{peakWeekActions} <small>项</small></strong>
                    </div>
                  </div>

                  <div className="trend-chart-wrap">
                    <div className="trend-grid-lines" aria-hidden="true">
                      <div className="trend-grid-line"><span className="trend-grid-val">{maxWeeklyAction}</span></div>
                      <div className="trend-grid-line"><span className="trend-grid-val">{Math.round(maxWeeklyAction / 2)}</span></div>
                      <div className="trend-grid-line"><span className="trend-grid-val">0</span></div>
                    </div>
                    <div className="trend-bars-container" role="group" aria-label="近 8 周打卡产出柱状图，Tab 逐周查看详情">
                      {weeklyTrends.map((week) => {
                        const totalHeightPercent = maxWeeklyAction > 0
                          ? Math.round((week.totalActions / maxWeeklyAction) * 100)
                          : 0;
                        const learnedPercent = week.totalActions > 0
                          ? (week.learnedCount / week.totalActions) * 100
                          : 0;
                        const reviewedPercent = week.totalActions > 0
                          ? (week.reviewedCount / week.totalActions) * 100
                          : 0;
                        const isHovered = hoveredTrendWeek?.startDate === week.startDate;
                        const weekDesc = week.totalActions > 0
                          ? `新学 ${week.learnedCount} 节, 复习 ${week.reviewedCount} 章, 共 ${week.totalActions} 项动作`
                          : "本周暂无打卡记录";
                        return (
                          <div
                            className={`trend-col ${week.isCurrentWeek ? "current-week" : ""} ${isHovered ? "is-hovered" : ""}`}
                            key={week.startDate}
                            role="button"
                            tabIndex={0}
                            aria-label={`${week.startDate} 至 ${week.endDate}${week.isCurrentWeek ? "（本周）" : ""}：${weekDesc}`}
                            onMouseEnter={() => setHoveredTrendWeek(week)}
                            onMouseLeave={() => setHoveredTrendWeek((curr) => curr?.startDate === week.startDate ? null : curr)}
                            onFocus={() => setHoveredTrendWeek(week)}
                            onClick={() => setHoveredTrendWeek(week)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setHoveredTrendWeek(week);
                              }
                            }}
                          >
                            <div className="trend-col-track" title={`${week.startDate} ~ ${week.endDate}: 新学 ${week.learnedCount} 节, 复习 ${week.reviewedCount} 章, 共 ${week.totalActions} 项动作`}>
                              <span className={`bar-total-num ${week.totalActions > 0 ? "visible" : ""}`}>
                                {week.totalActions > 0 ? week.totalActions : ""}
                              </span>
                              <div
                                className="trend-bar-stack"
                                style={{
                                  height: week.totalActions > 0 ? `${Math.max(totalHeightPercent, 8)}%` : "3px",
                                  opacity: week.totalActions > 0 ? 1 : 0.35,
                                }}
                              >
                                {week.reviewedCount > 0 && (
                                  <div className="bar-segment bar-reviewed" style={{ height: `${reviewedPercent}%` }} />
                                )}
                                {week.learnedCount > 0 && (
                                  <div className="bar-segment bar-learned" style={{ height: `${learnedPercent}%` }} />
                                )}
                              </div>
                            </div>
                            <span className="trend-col-label">{week.shortLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="trend-hover-info" aria-live="polite">
                    {hoveredTrendWeek ? (
                      <div className="hover-detail">
                        <strong>{hoveredTrendWeek.startDate} ~ {hoveredTrendWeek.endDate} {hoveredTrendWeek.isCurrentWeek ? "(本周)" : ""}</strong>
                        <span>
                          {hoveredTrendWeek.totalActions > 0
                            ? `新学 ${hoveredTrendWeek.learnedCount} 节 · 复习 ${hoveredTrendWeek.reviewedCount} 章 · 合计 ${hoveredTrendWeek.totalActions} 项动作`
                            : "本周暂无打卡记录"}
                        </span>
                      </div>
                    ) : (
                      <div className="hover-detail placeholder">
                        <span><Icon name="lightbulb" /> 悬停、点击或 Tab 聚焦柱状图，查看各周新学与复习打卡构成</span>
                      </div>
                    )}
                  </div>
                </article>
              </div>
  );
});
