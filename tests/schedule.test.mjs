import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDefaultSchedule,
  calculateScheduleStatus,
  calculateWeekNumber,
  getWeekDaysInfo,
  normalizeSchedule,
  timeToMinutes,
  minutesToTime,
  formatMonthDay,
} from "../app/study-data.ts";

test("Schedule 时间工具与周次推算", () => {
  assert.equal(timeToMinutes("20:43"), 1243);
  assert.equal(timeToMinutes("invalid"), 0);
  assert.equal(minutesToTime(1243), "20:43");
  assert.equal(formatMonthDay("2026-09-03"), "9/3");

  // 8/24 开学，9/3 为第 2 周周四
  assert.equal(calculateWeekNumber("2026-08-24", "2026-09-03"), 2);
  const days = getWeekDaysInfo("2026-08-24", 2, "2026-09-03");
  assert.equal(days.length, 7);
  assert.equal(days[0].monthDay, "8/31");
  assert.equal(days[3].monthDay, "9/3");
  assert.equal(days[3].isToday, true);
  assert.equal(days[4].isToday, false);
});

test("Schedule 进行中状态机与默认数据清洗", () => {
  const schedule = buildDefaultSchedule();

  // 周四 19:00 正在上数学（18:30–20:20）
  const active = calculateScheduleStatus(schedule, new Date(), 4, "19:00");
  assert.equal(active.status, "in_progress");
  assert.equal(active.activeEvent?.title, "数学");
  assert.equal(active.remainingMinutes, 80);

  // 午休与课间是两个不同分支
  const rest = calculateScheduleStatus(schedule, new Date(), 1, "12:45");
  assert.equal(rest.status, "rest_break");
  assert.equal(rest.restBreak?.label, "午休");

  const intermission = calculateScheduleStatus(schedule, new Date(), 1, "09:05");
  assert.equal(intermission.status, "intermission");
  assert.equal(intermission.intermissionNextEvent?.title, "数学");

  const idle = calculateScheduleStatus(schedule, new Date(), 3, "06:30");
  assert.equal(idle.status, "idle");
  assert.equal(idle.activeEvent, null);

  // 空数据回退到默认预设（周日 5~7 节总结复习）
  const empty = normalizeSchedule(null);
  assert.ok(empty.events.length > 0);
  assert.ok(empty.events.some((e) => e.dayOfWeek === 7 && e.startPeriod === 5 && e.endPeriod === 7 && e.title === "总结复习"));

  // 旧版默认模板存档（v1）升级到当前模板，周日晚间英政落到 9~10 节
  const upgraded = normalizeSchedule({ version: 1, activeWeek: 3, events: [
    { id: "sched_sun_ep_night", title: "英政", theme: "english_pol", dayOfWeek: 7, startPeriod: 12, endPeriod: 13 },
  ]});
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.activeWeek, 3);
  assert.ok(upgraded.events.some((e) => e.dayOfWeek === 7 && e.startPeriod === 9 && e.endPeriod === 10 && e.title === "英政"));

  // 非法节次被滤除，数学强化统一归入 math_intense，含自定义条目的课表不按模板覆盖
  const cleaned = normalizeSchedule({
    version: 1,
    activeWeek: 3,
    events: [
      { id: "e1", title: "英语模考", theme: "english_pol", dayOfWeek: 7, startPeriod: 1, endPeriod: 4 },
      { id: "e2", title: "数学强化", theme: "math_regular", dayOfWeek: 1, startPeriod: 2, endPeriod: 4 },
      { id: "bad", title: "错误节次", theme: "cs408", dayOfWeek: 1, startPeriod: 8, endPeriod: 2 },
    ],
  });
  assert.equal(cleaned.activeWeek, 3);
  assert.equal(cleaned.events.length, 2);
  assert.equal(cleaned.events[1].title, "数学");
  assert.equal(cleaned.events[1].theme, "math_intense");
});
