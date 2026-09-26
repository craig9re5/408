"use client";

import { useState, useMemo, useEffect } from "react";
import {
  calculateWeekNumber,
  buildDefaultSchedule,
  type ScheduleAppData,
  type ScheduleEvent,
} from "../../study-data";
import { useScheduleTicker } from "./useScheduleTicker";
import { ScheduleHeader } from "./ScheduleHeader";
import { TimetableGrid } from "./TimetableGrid";
import { TransposedTimetableGrid } from "./TransposedTimetableGrid";
import { ScheduleActionModal } from "./ScheduleActionModal";

interface ScheduleViewProps {
  schedule: ScheduleAppData;
  todayStr: string;
  onUpdateSchedule: (updater: (prev: ScheduleAppData) => ScheduleAppData) => void;
  onWriteJournal?: (event: ScheduleEvent) => void;
  onJumpToTasks?: (area?: "408" | "math" | "english" | "politics") => void;
  onBackToToday?: () => void;
}

export function ScheduleView({
  schedule,
  todayStr,
  onUpdateSchedule,
  onWriteJournal,
  onJumpToTasks,
  onBackToToday,
}: ScheduleViewProps) {
  const currentCalculatedWeek = useMemo(
    () => calculateWeekNumber(schedule.semesterStartDate, todayStr),
    [schedule.semesterStartDate, todayStr]
  );

  const [activeWeek, setActiveWeek] = useState<number>(() => schedule.activeWeek || currentCalculatedWeek || 2);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  // 用户手动选择的视图模式；null 表示跟随内容区宽度自动决定
  const [viewModeOverride, setViewModeOverride] = useState<"transposed" | "portrait" | null>(null);
  const [isNarrowLayout, setIsNarrowLayout] = useState(false);

  // 平板竖屏 / 窄窗口（≤900px，此时侧栏已收起）默认使用竖版课表，避免横向课表列被压扁重叠
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsNarrowLayout(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const viewMode = viewModeOverride ?? (isNarrowLayout ? "portrait" : "transposed");

  const { activeInfo } = useScheduleTicker(schedule);

  const handleSelectWeek = (week: number) => {
    setActiveWeek(week);
    onUpdateSchedule((prev) => ({ ...prev, activeWeek: week }));
  };

  const handleResetDefault = () => {
    if (window.confirm("确定要恢复考研强化阶段默认作息课表吗？这将重置所有排课条目。")) {
      const def = buildDefaultSchedule();
      onUpdateSchedule(() => def);
      setActiveWeek(def.activeWeek);
    }
  };

  return (
    <div className="schedule-page-wrapper">
      <ScheduleHeader
        activeWeek={activeWeek}
        currentCalculatedWeek={currentCalculatedWeek}
        onSelectWeek={handleSelectWeek}
        onResetDefault={handleResetDefault}
        layoutMode={viewMode}
        onChangeLayoutMode={setViewModeOverride}
        activeInfo={activeInfo}
      />

      <main className="schedule-main-board">
        <p className="schedule-scroll-hint">左右滑动课表，查看完整一周 →</p>
        {viewMode === "transposed" ? (
          <TransposedTimetableGrid
            schedule={schedule}
            activeInfo={activeInfo}
            todayStr={todayStr}
            activeWeek={activeWeek}
            onSelectEvent={setSelectedEvent}
          />
        ) : (
          <TimetableGrid
            schedule={schedule}
            activeInfo={activeInfo}
            todayStr={todayStr}
            activeWeek={activeWeek}
            onSelectEvent={setSelectedEvent}
          />
        )}
      </main>

      {selectedEvent && (
        <ScheduleActionModal
          event={selectedEvent}
          periods={schedule.periods}
          activeInfo={activeInfo}
          onClose={() => setSelectedEvent(null)}
          onWriteJournal={onWriteJournal}
          onJumpToTasks={onJumpToTasks}
        />
      )}
    </div>
  );
}
