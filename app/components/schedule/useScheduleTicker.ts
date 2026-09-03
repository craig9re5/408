"use client";

import { useEffect, useState } from "react";
import {
  calculateScheduleStatus,
  type ActiveScheduleInfo,
  type ScheduleAppData,
  type WeekdayNumber,
} from "../../study-data";

export function useScheduleTicker(schedule: ScheduleAppData) {
  const [tickTime, setTickTime] = useState<Date>(() => new Date());

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      setTickTime(new Date());
    };

    // 立即校准一次
    tick();

    // 10秒为周期执行一次时间校准，兼顾实时性与低功耗
    timerId = setInterval(tick, 10000);

    // 页面可见性监听：前台唤醒时立即强制校准
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerId) clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const jsDay = tickTime.getDay();
  const currentWeekday = (jsDay === 0 ? 7 : jsDay) as WeekdayNumber;
  const currentHours = String(tickTime.getHours()).padStart(2, "0");
  const currentMinutes = String(tickTime.getMinutes()).padStart(2, "0");
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  const activeInfo: ActiveScheduleInfo = calculateScheduleStatus(schedule, tickTime);

  return {
    tickTime,
    currentWeekday,
    currentTimeStr,
    activeInfo,
  };
}
