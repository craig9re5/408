"use client";

import { useEffect, useState } from "react";

type Chapter = {
  id: string;
  number: string;
  title: string;
  sections: string[];
  difficulty: number;
  importance: number;
  type: string;
};

const chapters: Chapter[] = [
  {
    id: "overview",
    number: "1",
    title: "计算机系统概述",
    sections: ["1.1 操作系统的基本概念", "1.2 操作系统发展历程", "1.3 操作系统的运行环境", "1.4 操作系统结构", "1.5 操作系统引导", "1.6 虚拟机"],
    difficulty: 2,
    importance: 3,
    type: "识记为主",
  },
  {
    id: "process",
    number: "2",
    title: "进程与线程",
    sections: ["2.1 进程与线程简介", "2.2 CPU 调度", "2.3 同步与互斥", "2.4 死锁"],
    difficulty: 5,
    importance: 5,
    type: "重点理解",
  },
  {
    id: "memory",
    number: "3",
    title: "内存管理",
    sections: ["3.1 内存管理概念", "3.2 虚拟内存管理"],
    difficulty: 5,
    importance: 5,
    type: "重点理解",
  },
  {
    id: "file",
    number: "4",
    title: "文件管理",
    sections: ["4.1 文件系统基础", "4.2 目录与文件", "4.3 文件系统", "4.4 本章难点"],
    difficulty: 3,
    importance: 4,
    type: "理解与识记",
  },
  {
    id: "io",
    number: "5",
    title: "输入/输出管理",
    sections: ["5.1 I/O 管理概述", "5.2 设备独立性软件", "5.3 磁盘和固态硬盘"],
    difficulty: 4,
    importance: 4,
    type: "理解为主",
  },
];

const days = [
  { id: 1, date: "8月1日", chapter: "第1章", content: "1.1—1.6 计算机系统概述", time: "3小时" },
  { id: 2, date: "8月2日", chapter: "第2章", content: "2.1 进程与线程、2.2 CPU调度", time: "4小时" },
  { id: 3, date: "8月3日", chapter: "第2章", content: "2.3 同步与互斥、2.4 死锁", time: "5小时" },
  { id: 4, date: "8月4日", chapter: "第3章", content: "3.1 内存管理概念", time: "4.5小时" },
  { id: 5, date: "8月5日", chapter: "第3章", content: "3.2 虚拟内存管理", time: "4.5小时" },
  { id: 6, date: "8月6日", chapter: "第4章", content: "4.1—4.4 文件管理", time: "4小时" },
  { id: 7, date: "8月7日", chapter: "第5章", content: "5.1—5.3 I/O管理及一轮复盘", time: "5小时" },
];

const courses = [
  { name: "数据结构", status: "已完成" },
  { name: "计算机组成原理", status: "已完成" },
  { name: "操作系统", status: "进行中" },
  { name: "计算机网络", status: "未开始" },
];

function Level({ value }: { value: number }) {
  return <span className="level" aria-label={`${value}/5`}>{[1, 2, 3, 4, 5].map((item) => <i key={item} className={item <= value ? "on" : ""} />)}</span>;
}

export function StudyDashboard() {
  const [view, setView] = useState("os");
  const [expanded, setExpanded] = useState<string | null>("process");
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("408-atlas-os-week") || "[]");
      if (Array.isArray(saved)) setCompletedDays(saved);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("408-atlas-os-week", JSON.stringify(completedDays));
  }, [completedDays, loaded]);

  const progress = Math.round((completedDays.length / days.length) * 100);
  const currentDay = days[Math.min(completedDays.length, days.length - 1)];

  function toggleDay(id: number) {
    setCompletedDays((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].sort());
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <button className="logo" onClick={() => setView("os")}><span>408</span><strong>学习计划</strong></button>
        <nav aria-label="页面导航">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>总览</button>
          <button className={view === "os" ? "active" : ""} onClick={() => setView("os")}>操作系统</button>
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>今日任务</button>
          <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>复习记录</button>
        </nav>
        <div className="course-list">
          <h2>科目进度</h2>
          {courses.map((course) => <div key={course.name}><span>{course.name}</span><strong className={course.status === "已完成" ? "done" : course.status === "进行中" ? "doing" : ""}>{course.status}</strong></div>)}
        </div>
      </aside>

      <main>
        <header className="topbar"><strong>{view === "os" ? "操作系统学习计划" : view === "overview" ? "学习总览" : view === "today" ? "今日任务" : "复习记录"}</strong><span>已完成 2 / 4 科目</span></header>

        {view === "os" && <div className="page">
          <section className="page-heading">
            <div><h1>操作系统</h1><p>7天计划 · 5章 · 约30小时</p></div>
            <div className="progress-box"><span>{completedDays.length} / 7 天</span><div><i style={{ width: `${progress}%` }} /></div></div>
          </section>

          <section className="section">
            <h2>章节目录</h2>
            <div className="chapter-list">{chapters.map((chapter) => {
              const open = expanded === chapter.id;
              return <article key={chapter.id} className={open ? "open" : ""}>
                <button className="chapter-row" onClick={() => setExpanded(open ? null : chapter.id)} aria-expanded={open}>
                  <span className="chapter-number">{chapter.number}</span>
                  <strong>{chapter.title}</strong>
                  <span className="chapter-type">{chapter.type}</span>
                  <span className="metric"><small>难度</small><Level value={chapter.difficulty} /></span>
                  <span className="metric"><small>重要度</small><Level value={chapter.importance} /></span>
                  <span className="expand">{open ? "收起" : "展开"}</span>
                </button>
                {open && <ol>{chapter.sections.map((section) => <li key={section}>{section}</li>)}</ol>}
              </article>;
            })}</div>
          </section>

          <section className="section">
            <h2>学习时间表</h2>
            <div className="schedule">
              <div className="schedule-head"><span>日期</span><span>章节</span><span>学习内容</span><span>时长</span><span>完成</span></div>
              {days.map((day) => { const done = completedDays.includes(day.id); return <div className={done ? "schedule-row completed" : "schedule-row"} key={day.id}><span>{day.date}</span><strong>{day.chapter}</strong><span>{day.content}</span><span>{day.time}</span><button onClick={() => toggleDay(day.id)} aria-label={`${done ? "取消" : "标记"}${day.date}完成`}>{done ? "✓" : ""}</button></div>; })}
            </div>
          </section>
        </div>}

        {view === "overview" && <div className="page"><section className="page-heading"><div><h1>学习总览</h1><p>当前已完成数据结构和计算机组成原理</p></div></section><div className="course-grid">{courses.map((course) => <article key={course.name}><h2>{course.name}</h2><span className={course.status === "已完成" ? "done" : course.status === "进行中" ? "doing" : ""}>{course.status}</span>{course.name === "操作系统" && <p>{completedDays.length}/7 天完成</p>}</article>)}</div></div>}

        {view === "today" && <div className="page"><section className="page-heading"><div><h1>今日任务</h1><p>{currentDay.date}</p></div></section><article className="today-card"><span>{currentDay.chapter}</span><h2>{currentDay.content}</h2><p>计划时长：{currentDay.time}</p><button onClick={() => toggleDay(currentDay.id)}>{completedDays.includes(currentDay.id) ? "取消完成" : "标记为完成"}</button></article></div>}

        {view === "review" && <div className="page"><section className="page-heading"><div><h1>复习记录</h1><p>已完成的学习内容</p></div></section><div className="review-list">{completedDays.length === 0 ? <p className="empty">还没有完成记录。</p> : completedDays.map((id) => <article key={id}><strong>{days[id - 1].date} · {days[id - 1].chapter}</strong><span>{days[id - 1].content}</span></article>)}</div></div>}
      </main>
    </div>
  );
}
