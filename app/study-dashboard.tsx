"use client";

import { useEffect, useState } from "react";

type Chapter = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  summary: string;
  memory: number;
  understanding: number;
  importance: number;
  hours: string;
  sections: string[];
  exam: string;
  color: string;
};

const chapters: Chapter[] = [
  {
    id: "overview", number: "01", title: "操作系统概述", subtitle: "先认识管理者",
    summary: "从硬件裸机走到用户程序：操作系统向下管理资源，向上提供接口。中断、异常与系统调用，是用户态进入内核态的三扇门。",
    memory: 4, understanding: 2, importance: 3, hours: "3h", color: "blue",
    sections: ["1.1 操作系统的基本概念", "1.2 操作系统发展历程", "1.3 操作系统的运行环境", "1.4 操作系统结构", "1.5 操作系统引导", "1.6 虚拟机"],
    exam: "常考概念辨析，重点区分中断、异常和系统调用。",
  },
  {
    id: "process", number: "02", title: "进程与线程", subtitle: "并发世界的交通规则",
    summary: "进程让程序并发运行，调度决定谁先获得 CPU，同步与互斥约束执行顺序，死锁则是资源竞争失控后的僵局。",
    memory: 2, understanding: 5, importance: 5, hours: "10h", color: "coral",
    sections: ["2.1 进程与线程简介", "2.2 CPU 调度", "2.3 同步与互斥", "2.4 死锁"],
    exam: "全书第一核心：PV 操作、调度算法和银行家算法必须会做题。",
  },
  {
    id: "memory", number: "03", title: "内存管理", subtitle: "地址如何抵达数据",
    summary: "程序看到的是逻辑地址，硬件使用的是物理地址。页表完成映射，虚拟内存把暂时不用的页面留在外存，用时间换空间。",
    memory: 2, understanding: 5, importance: 5, hours: "9h", color: "yellow",
    sections: ["3.1 内存管理概念", "3.2 虚拟内存管理"],
    exam: "地址转换与页面置换是计算题高频区，过程必须写得清楚。",
  },
  {
    id: "file", number: "04", title: "文件管理", subtitle: "把字节组织成秩序",
    summary: "文件系统把逻辑文件映射到磁盘块：目录负责找到它，分配方式决定如何存，空闲空间管理决定新数据放在哪里。",
    memory: 3, understanding: 3, importance: 4, hours: "5h", color: "green",
    sections: ["4.1 文件系统基础", "4.2 目录与文件", "4.3 文件系统", "4.4 本章难点"],
    exam: "索引分配与目录检索常和计算结合，结构图要能自己画。",
  },
  {
    id: "io", number: "05", title: "I/O 管理", subtitle: "让快慢设备协同",
    summary: "I/O 控制方式逐步减少 CPU 介入，缓冲解决速度不匹配，磁盘调度则重新安排请求顺序，缩短磁头移动。",
    memory: 3, understanding: 4, importance: 4, hours: "5h", color: "violet",
    sections: ["5.1 I/O 管理概述", "5.2 设备独立性软件", "5.3 磁盘和固态硬盘"],
    exam: "磁盘调度计算稳定得分，DMA、中断和通道注意比较。",
  },
];

const days = [
  { id: 1, date: "8/01", weekday: "周六", chapter: "第 1 章", focus: "系统概述与运行环境", time: "3h", output: "串起 1.1—1.6 的概念框架", chapterId: "overview" },
  { id: 2, date: "8/02", weekday: "周日", chapter: "第 2 章", focus: "进程与 CPU 调度", time: "4h", output: "整理 2.1—2.2 的状态与调度", chapterId: "process" },
  { id: 3, date: "8/03", weekday: "周一", chapter: "第 2 章", focus: "同步、互斥与死锁", time: "5h", output: "独立写出 2.3—2.4 典型题", chapterId: "process" },
  { id: 4, date: "8/04", weekday: "周二", chapter: "第 3 章", focus: "内存管理概念", time: "4.5h", output: "完成 3.1 的地址与分配主线", chapterId: "memory" },
  { id: 5, date: "8/05", weekday: "周三", chapter: "第 3 章", focus: "虚拟内存管理", time: "4.5h", output: "吃透 3.2 的页面置换过程", chapterId: "memory" },
  { id: 6, date: "8/06", weekday: "周四", chapter: "第 4 章", focus: "文件系统与目录", time: "4h", output: "整理 4.1—4.4 的结构对比", chapterId: "file" },
  { id: 7, date: "8/07", weekday: "周五", chapter: "第 5 章", focus: "I/O 管理收束", time: "5h", output: "完成 5.1—5.3 与一轮复盘", chapterId: "io" },
];

const navItems = [
  { id: "overview", label: "总览", icon: "◈" },
  { id: "os", label: "操作系统计划", icon: "⌁" },
  { id: "today", label: "今日任务", icon: "✦" },
  { id: "review", label: "复习队列", icon: "↻" },
];

const completedCourses = ["数据结构", "计算机组成原理"];

function Meter({ value, tone = "dark" }: { value: number; tone?: string }) {
  return <span className={`meter meter--${tone}`} aria-label={`${value}/5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= value ? "is-on" : ""} />)}</span>;
}

export function StudyDashboard() {
  const [view, setView] = useState("os");
  const [expanded, setExpanded] = useState("process");
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("408-atlas-os-week") || "[]");
      if (Array.isArray(saved)) setCompletedDays(saved);
    } finally { setReady(true); }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("408-atlas-os-week", JSON.stringify(completedDays));
  }, [completedDays, ready]);

  const totalProgress = Math.round((completedDays.length / 7) * 100);
  const activeDay = Math.min(completedDays.length + 1, 7);
  const currentDay = days[activeDay - 1];
  function toggleDay(id: number) {
    setCompletedDays((previous) => previous.includes(id) ? previous.filter((day) => day !== id) : [...previous, id].sort());
  }

  return (
    <div className="site-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("os")} aria-label="返回操作系统计划">
          <span className="brand-mark">408</span><span><small>LEARNING ATLAS</small><strong>Study Control</strong></span>
        </button>
        <div className="countdown-card"><div><span>2026 备考周期</span><i /></div><p>距离初试还有 <strong>148</strong> 天</p><div className="thin-progress"><b style={{ width: "31%" }} /></div><small><span>总计划 31%</span><span>目标 12.28</span></small></div>
        <nav aria-label="主要导航"><p className="nav-title">WORKSPACE</p>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span>{item.id === "today" && <b>{Math.max(0, 3 - completedDays.length)}</b>}</button>)}</nav>
        <div className="side-note"><span>WEEK 01</span><p>一周主线</p><strong>操作系统</strong><small>{completedDays.length}/7 天完成</small><em>已完成：数据结构 · 计组</em></div>
        <footer><span className="avatar">C</span><span><strong>Craig</strong><small>今天只做最重要的事</small></span></footer>
      </aside>

      <main>
        <header className="topbar"><div><span>408 ATLAS</span><i>/</i><strong>{navItems.find((item) => item.id === view)?.label}</strong></div><div className="sync"><i />进度保存在本机</div></header>

        {view === "os" && <div className="page page--os">
          <section className="os-hero appear">
            <div className="hero-copy"><p className="eyebrow">7-DAY OPERATING SYSTEM PLAN</p><h1>一周，建立<br /><em>操作系统</em>的主线。</h1><p>不要把五章看成孤立知识点。沿着「资源是谁 → 如何竞争 → 放在哪里 → 怎样保存 → 如何输入输出」一路走完。</p><div className="hero-actions"><button className="primary" onClick={() => document.querySelector("#week-plan")?.scrollIntoView({ behavior: "smooth" })}>查看七天安排 <span>↓</span></button><span><b>32h</b> 建议投入</span></div></div>
            <div className="orbit-map" aria-label="操作系统知识主线"><div className="orbit-center"><small>KERNEL</small><strong>OS</strong></div><span className="orbit orbit--one" /><span className="orbit orbit--two" />{chapters.map((chapter, index) => <button key={chapter.id} className={`orbit-node node-${index + 1}`} onClick={() => { setExpanded(chapter.id); document.querySelector("#chapters")?.scrollIntoView({ behavior: "smooth" }); }}><small>{chapter.number}</small><strong>{chapter.title.replace("管理", "")}</strong></button>)}</div>
          </section>

          <div className="finished-line appear appear--2"><span>已完成课程</span>{completedCourses.map((course) => <strong key={course}><i>✓</i>{course}</strong>)}<small>当前聚焦：操作系统</small></div>
          <section className="strategy-strip appear appear--2"><div><span>学习策略</span><strong>理解优先，识记收口</strong></div><p><b>进程 + 内存</b> 占一周约 70% 的理解成本，也是最值得投入的两章。概述快速搭框架，文件与 I/O 用对比表和题型收束。</p><div className="strategy-key"><span><i className="key-dot key-dot--coral" />核心攻坚</span><span><i className="key-dot key-dot--blue" />框架建立</span></div></section>

          <section className="chapter-section appear appear--3" id="chapters">
            <div className="section-heading"><div><p className="eyebrow">THE MAIN THREAD</p><h2>五章，不是五座孤岛</h2></div><p>点击章节展开目录与考试提醒</p></div>
            <div className="chapter-list">{chapters.map((chapter, index) => {
              const isOpen = expanded === chapter.id;
              return <article key={chapter.id} className={`chapter chapter--${chapter.color} ${isOpen ? "is-open" : ""}`}>
                <button className="chapter-summary" onClick={() => setExpanded(isOpen ? "" : chapter.id)} aria-expanded={isOpen}>
                  <span className="chapter-number">{chapter.number}</span><span className="chapter-name"><small>{chapter.subtitle}</small><strong>{chapter.title}</strong></span><span className="chapter-metrics"><span><small>难度</small><Meter value={chapter.understanding} /></span><span><small>重要度</small><Meter value={chapter.importance} tone="warm" /></span></span><span className="chapter-hours">{chapter.hours}</span><span className="chapter-toggle">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && <div className="chapter-detail"><div className="thread-copy"><span>这章在主线里</span><p>{chapter.summary}</p><div className="balance"><span>识记 <Meter value={chapter.memory} tone="blue" /></span><span>理解 <Meter value={chapter.understanding} tone="coral" /></span></div></div><div className="directory"><span>目录</span><ol>{chapter.sections.map((section) => <li key={section}>{section}</li>)}</ol></div><div className="exam-note"><span>考试提醒</span><p>{chapter.exam}</p></div></div>}
                {index < chapters.length - 1 && <span className="chapter-connector">↓</span>}
              </article>;
            })}</div>
          </section>

          <section className="week-section" id="week-plan">
            <div className="section-heading"><div><p className="eyebrow">AUG 01 — AUG 07</p><h2>七天推进表</h2></div><div className="week-progress"><span>{completedDays.length}/7 DAYS</span><div><i style={{ width: `${totalProgress}%` }} /></div></div></div>
            <div className="week-grid">{days.map((day) => { const done = completedDays.includes(day.id); const active = day.id === activeDay && !done; return <article key={day.id} className={`${done ? "is-done" : ""} ${active ? "is-today" : ""}`}><div className="day-top"><span>DAY {String(day.id).padStart(2, "0")}</span><button onClick={() => toggleDay(day.id)} aria-label={`${done ? "取消完成" : "标记完成"}第 ${day.id} 天`}>{done ? "✓" : ""}</button></div><div className="day-date"><strong>{day.date}</strong><small>{day.weekday}</small></div><span className="day-chapter">{day.chapter}</span><h3>{day.focus}</h3><p>{day.output}</p><footer><span>{day.time}</span>{active && <b>今天</b>}{done && <b>完成</b>}</footer></article>; })}</div>
            <div className="week-advice"><span>✦</span><p><strong>每天结束前留 20 分钟。</strong>不追求把题目刷满，只回答三件事：今天的主线是什么、哪个步骤还讲不清、明天开头要先复习什么。</p></div>
          </section>
        </div>}

          {view === "overview" && <div className="page simple-page"><p className="eyebrow">OVERVIEW</p><h1>你的学习控制台</h1><div className="overview-grid"><article className="dark-stat"><span>OS WEEK</span><strong>{totalProgress}<small>%</small></strong><p>操作系统本周进度</p><div><i style={{ width: `${totalProgress}%` }} /></div></article><article><span>408 科目完成</span><strong>2<small>/ 4</small></strong><p>数据结构 · 计算机组成原理</p></article><article><span>当前推进</span><strong>Day {activeDay}</strong><p>{currentDay.focus}</p></article></div><button className="primary" onClick={() => setView("os")}>继续操作系统计划 <span>→</span></button></div>}

        {view === "today" && <div className="page simple-page"><p className="eyebrow">TODAY · DAY {String(activeDay).padStart(2, "0")}</p><h1>{currentDay.focus}</h1><p className="page-lede">今天的任务来自「{currentDay.chapter}」，建议投入 {currentDay.time}。</p><div className="today-focus"><div><span>今日产出</span><h2>{currentDay.output}</h2><p>先看懂主线，再做针对性题目，最后用自己的话复述一遍。</p></div><button className={completedDays.includes(currentDay.id) ? "done-button" : "primary"} onClick={() => toggleDay(currentDay.id)}>{completedDays.includes(currentDay.id) ? "✓ 已完成" : "完成今日学习"}</button></div></div>}

        {view === "review" && <div className="page simple-page"><p className="eyebrow">REVIEW QUEUE</p><h1>把薄弱点重新唤醒</h1><p className="page-lede">第一轮先不堆满复习任务。完成对应天数后，再按 1 天、3 天、7 天的间隔回看。</p><div className="review-list">{completedDays.length ? completedDays.map((id) => <article key={id}><span>Day {id}</span><strong>{days[id - 1].focus}</strong><p>{days[id - 1].output}</p><button>待复述</button></article>) : <div className="empty-state">完成第一天学习后，复习卡片会出现在这里。</div>}</div></div>}
      </main>
    </div>
  );
}
