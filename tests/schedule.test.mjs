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

test("Schedule 时间转换工具与格式化: timeToMinutes 与 minutesToTime 双向互转及月日格式化", () => {
  assert.equal(timeToMinutes("08:10"), 490);
  assert.equal(timeToMinutes("14:00"), 840);
  assert.equal(timeToMinutes("20:43"), 1243);
  assert.equal(timeToMinutes("invalid"), 0);

  assert.equal(minutesToTime(490), "08:10");
  assert.equal(minutesToTime(840), "14:00");
  assert.equal(minutesToTime(1243), "20:43");

  assert.equal(formatMonthDay("2026-08-31"), "8/31");
  assert.equal(formatMonthDay("2026-09-01"), "9/1");
  assert.equal(formatMonthDay("2026-09-03"), "9/3");
});

test("Schedule 周次推算与7天日期序列: 严格对齐原型截图 (第2周 8/31 ~ 9/6, 周四 9/3 高亮)", () => {
  const semesterStart = "2026-08-24"; // 周一
  const today = "2026-09-03";         // 周四

  // 1. 周次推算：8月24日至9月3日跨度为第2周
  const weekNum = calculateWeekNumber(semesterStart, today);
  assert.equal(weekNum, 2);

  // 2. 第2周7天生成
  const days = getWeekDaysInfo(semesterStart, 2, today);
  assert.equal(days.length, 7);

  assert.equal(days[0].label, "周一");
  assert.equal(days[0].monthDay, "8/31");
  assert.equal(days[0].isToday, false);

  assert.equal(days[1].label, "周二");
  assert.equal(days[1].monthDay, "9/1");
  assert.equal(days[1].isToday, false);

  assert.equal(days[2].label, "周三");
  assert.equal(days[2].monthDay, "9/2");
  assert.equal(days[2].isToday, false);

  assert.equal(days[3].label, "周四");
  assert.equal(days[3].monthDay, "9/3");
  assert.equal(days[3].isToday, true); // 今天高亮！

  assert.equal(days[4].label, "周五");
  assert.equal(days[4].monthDay, "9/4");
  assert.equal(days[4].isToday, false);

  assert.equal(days[5].label, "周六");
  assert.equal(days[5].monthDay, "9/5");
  assert.equal(days[5].isToday, false);

  assert.equal(days[6].label, "周日");
  assert.equal(days[6].monthDay, "9/6");
  assert.equal(days[6].isToday, false);
});

test("Schedule 实时「进行中」状态机判定: 100%还原截图周四20:43正在进行【数学】(上课中)场景", () => {
  const schedule = buildDefaultSchedule();

  // 场景 A: 原型截图完全一致场景 —— 周四 20:43 (第10~11节 19:30-21:20 数学)
  const statusA = calculateScheduleStatus(schedule, new Date(), 4, "20:43");
  assert.equal(statusA.status, "in_progress");
  assert.ok(statusA.activeEvent);
  assert.equal(statusA.activeEvent.title, "数学");
  assert.equal(statusA.activeEvent.theme, "math_intense");
  assert.equal(statusA.remainingMinutes, 37); // 21:20 结束，当前 20:43，剩余 37 分钟
  assert.ok(statusA.elapsedPercent > 0);

  // 场景 B: 周五 15:30 (第5~8节 14:00-18:00 408 统考)
  const statusB = calculateScheduleStatus(schedule, new Date(), 5, "15:30");
  assert.equal(statusB.status, "in_progress");
  assert.ok(statusB.activeEvent);
  assert.equal(statusB.activeEvent.title, "408");
  assert.equal(statusB.activeEvent.theme, "cs408");
  assert.equal(statusB.remainingMinutes, 150); // 18:00 结束，当前 15:30，剩余 150 分钟

  // 场景 C: 午休中 (12:00 - 14:00)
  const statusC = calculateScheduleStatus(schedule, new Date(), 1, "12:45");
  assert.equal(statusC.status, "rest_break");
  assert.ok(statusC.restBreak);
  assert.equal(statusC.restBreak.label, "午休");
  assert.equal(statusC.remainingMinutes, 75); // 14:00 结束，剩余 75 分钟

  // 场景 D: 晚休中 (18:00 - 18:30)
  const statusD = calculateScheduleStatus(schedule, new Date(), 2, "18:10");
  assert.equal(statusD.status, "rest_break");
  assert.ok(statusD.restBreak);
  assert.equal(statusD.restBreak.label, "晚休");
  assert.equal(statusD.remainingMinutes, 20); // 18:30 结束，剩余 20 分钟

  // 场景 E: 课间休整与下一节预告 (如上午 09:05，即将进入 09:10 的数学)
  const statusE = calculateScheduleStatus(schedule, new Date(), 1, "09:05");
  assert.equal(statusE.status, "intermission");
  assert.ok(statusE.intermissionNextEvent);
  assert.equal(statusE.intermissionNextEvent.title, "数学");
  assert.equal(statusE.startsInMinutes, 5);

  // 场景 F: 清晨空闲自习 (06:30)
  const statusF = calculateScheduleStatus(schedule, new Date(), 3, "06:30");
  assert.equal(statusF.status, "idle");
  assert.equal(statusF.activeEvent, null);

  // 场景 G: 新增周日下午 5~8 节数学课 (周日 16:00 正在上第 5~8 节数学)
  const statusSun = calculateScheduleStatus(schedule, new Date(), 7, "16:00");
  assert.equal(statusSun.status, "in_progress");
  assert.ok(statusSun.activeEvent);
  assert.equal(statusSun.activeEvent.title, "数学");
  assert.equal(statusSun.activeEvent.startPeriod, 5);
  assert.equal(statusSun.activeEvent.endPeriod, 8);
});

test("Schedule 数据结构标准化与缺省容错: normalizeSchedule 自动补全默认排课与安全清洗", () => {
  // 1. null / 空对象回退至默认预设 (含周日 5~8 节数学，共 25 项排课)
  const emptyNorm = normalizeSchedule(null);
  assert.equal(emptyNorm.events.length, 25);
  assert.equal(emptyNorm.periods.length, 13);
  assert.equal(emptyNorm.lunchBreak.start, "12:00");
  const sunMath = emptyNorm.events.find((e) => e.dayOfWeek === 7 && e.startPeriod === 5);
  assert.ok(sunMath);
  assert.equal(sunMath.title, "数学");

  // 2. 部分字段清洗与非法节次过滤
  const custom = {
    version: 1,
    activeWeek: 3,
    events: [
      { id: "e1", title: "英语模考", theme: "english_pol", dayOfWeek: 7, startPeriod: 1, endPeriod: 4 },
      { id: "e2", title: "数学强化", theme: "math_regular", dayOfWeek: 1, startPeriod: 2, endPeriod: 4 },
      { id: "invalid_order", title: "错误节次", theme: "cs408", dayOfWeek: 1, startPeriod: 8, endPeriod: 2 }, // start > end 必须被滤除
    ],
  };
  const cleaned = normalizeSchedule(custom);
  assert.equal(cleaned.activeWeek, 3);
  assert.equal(cleaned.events.length, 2);
  assert.equal(cleaned.events[0].title, "英语模考");
  // 统一命名与主题规范：数学强化 -> 数学，统一 theme 为 math_intense
  assert.equal(cleaned.events[1].title, "数学");
  assert.equal(cleaned.events[1].theme, "math_intense");
});
