import type {
  JournalContext,
  JournalEntry,
  JournalPublish,
  JournalSectionItem,
  PaperKind,
  PaperRecord,
  PlanChangeSource,
  PlanHistoryEntry,
  ProjectSettings,
  QuestionState,
  StudyArea,
} from "./types.ts";
import {
  DEFAULT_PROJECT_SETTINGS,
  PAST_PAPER_YEARS,
  POLITICS_PAST_PAPER_YEARS,
  maxPaperScore,
} from "./constants.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addCalendarDays(value: string, days: number): string {
  if (!isDate(value) || !Number.isInteger(days)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function clampPaperScore(score: unknown, area: StudyArea): number | null {
  if (score === null || score === undefined) return null;
  const num = typeof score === "number" ? score : parseFloat(String(score));
  if (Number.isNaN(num)) return null;
  const maxScore = maxPaperScore(area);
  return Math.max(0, Math.min(maxScore, Math.round(num * 10) / 10));
}

export function parseQuestionRanges(rawInput: string, total: number): number[] {
  if (typeof rawInput !== "string" || !rawInput.trim() || total <= 0) return [];
  const tokens: number[] = [];
  rawInput.split(/[,，\s、;；]+/).forEach((chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    const rangeMatch = trimmed.match(/^(\d+)[-~至到\.]+(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let n = min; n <= max; n++) {
          if (n >= 1 && n <= total) tokens.push(n);
        }
        return;
      }
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= total) {
      tokens.push(n);
    }
  });
  return Array.from(new Set(tokens)).sort((a, b) => a - b);
}

export function normalizeProjectSettings(value: unknown): ProjectSettings {
  const normalized = structuredClone(DEFAULT_PROJECT_SETTINGS);
  if (!isRecord(value)) return normalized;
  (["408", "math", "english", "politics"] as const).forEach((area) => {
    const candidate = value[area];
    if (isRecord(candidate) && isDate(candidate.examDate)) {
      normalized[area] = { examDate: candidate.examDate };
    }
  });
  return normalized;
}

export function normalizePlanHistory(value: unknown, isSafeSectionId?: (id: string) => boolean): PlanHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const sources: PlanChangeSource[] = ["manual", "batchSchedule", "shift", "undo"];
  return value.flatMap((entry): PlanHistoryEntry[] => {
    if (!isRecord(entry)) return [];
    if (
      typeof entry.id !== "string" ||
      typeof entry.sectionId !== "string" ||
      (isSafeSectionId && !isSafeSectionId(entry.sectionId)) ||
      typeof entry.changedAt !== "string" ||
      typeof entry.source !== "string" ||
      !sources.includes(entry.source as PlanChangeSource)
    ) {
      return [];
    }
    const from = entry.from === "" || isDate(entry.from) ? entry.from : "";
    const to = entry.to === "" || isDate(entry.to) ? entry.to : "";
    return [
      {
        id: entry.id.slice(0, 120),
        sectionId: entry.sectionId,
        from,
        to,
        changedAt: entry.changedAt.slice(0, 64),
        source: entry.source as PlanChangeSource,
      },
    ];
  }).slice(-1000);
}

export function normalizeJournalContext(value: unknown): JournalContext | null {
  if (!isRecord(value)) return null;

  if (value.type === "sections" && Array.isArray(value.sections)) {
    const validSections: JournalSectionItem[] = [];
    const seenSectionIds = new Set<string>();

    value.sections.forEach((item) => {
      if (!isRecord(item)) return;
      const area =
        item.area === "math" || item.area === "408" || item.area === "english" || item.area === "politics"
          ? (item.area as StudyArea)
          : null;
      if (!area) return;
      if (typeof item.bookId !== "string" || !item.bookId.trim()) return;
      if (typeof item.sectionId !== "string" || !item.sectionId.trim()) return;
      const secId = item.sectionId.trim().slice(0, 120);
      if (seenSectionIds.has(secId)) return;
      seenSectionIds.add(secId);

      validSections.push({
        area,
        bookId: item.bookId.trim().slice(0, 80),
        sectionId: secId,
        bookTitle: typeof item.bookTitle === "string" && item.bookTitle.trim() ? item.bookTitle.trim().slice(0, 100) : undefined,
        sectionTitle: typeof item.sectionTitle === "string" && item.sectionTitle.trim() ? item.sectionTitle.trim().slice(0, 100) : undefined,
        sectionNumber: typeof item.sectionNumber === "string" && item.sectionNumber.trim() ? item.sectionNumber.trim().slice(0, 30) : undefined,
      });
    });

    if (validSections.length === 0) return null;
    return {
      type: "sections",
      sections: validSections.slice(0, 50),
    };
  }

  const area =
    value.area === "math" || value.area === "408" || value.area === "english" || value.area === "politics"
      ? (value.area as StudyArea)
      : null;
  if (!area) return null;

  if (value.type === "project") {
    return {
      type: "project",
      area,
    };
  }

  if (value.type === "subject") {
    if (typeof value.bookId !== "string" || !value.bookId.trim()) return null;
    return {
      type: "subject",
      area,
      bookId: value.bookId.trim().slice(0, 80),
      bookTitle: typeof value.bookTitle === "string" && value.bookTitle.trim() ? value.bookTitle.trim().slice(0, 100) : undefined,
    };
  }

  if (value.type === "section") {
    if (typeof value.bookId !== "string" || !value.bookId.trim()) return null;
    if (typeof value.sectionId !== "string" || !value.sectionId.trim()) return null;
    return {
      type: "section",
      area,
      bookId: value.bookId.trim().slice(0, 80),
      sectionId: value.sectionId.trim().slice(0, 120),
      bookTitle: typeof value.bookTitle === "string" && value.bookTitle.trim() ? value.bookTitle.trim().slice(0, 100) : undefined,
      sectionTitle: typeof value.sectionTitle === "string" && value.sectionTitle.trim() ? value.sectionTitle.trim().slice(0, 100) : undefined,
      sectionNumber: typeof value.sectionNumber === "string" && value.sectionNumber.trim() ? value.sectionNumber.trim().slice(0, 30) : undefined,
    };
  }

  if (value.type === "paper") {
    if (typeof value.paperId !== "string" || !value.paperId.trim()) return null;
    return {
      type: "paper",
      area,
      paperId: value.paperId.trim().slice(0, 100),
      paperTitle: typeof value.paperTitle === "string" && value.paperTitle.trim() ? value.paperTitle.trim().slice(0, 150) : "真题/模拟卷",
    };
  }

  return null;
}

export function normalizeJournalPublish(value: unknown): JournalPublish {
  if (!isRecord(value)) {
    return {
      status: "local",
      publishedAt: null,
      blogUrl: null,
      blogPostId: null,
    };
  }
  return {
    status: value.status === "published" ? "published" : "local",
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt.slice(0, 64) : null,
    blogUrl: typeof value.blogUrl === "string" ? value.blogUrl.slice(0, 300) : null,
    blogPostId: typeof value.blogPostId === "string" ? value.blogPostId.slice(0, 100) : null,
  };
}

export function normalizeJournalEntry(value: unknown): JournalEntry | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !/^\d{8}\d{3}$/.test(value.id) ||
    typeof value.createdAt !== "string" ||
    typeof value.content !== "string"
  ) {
    return null;
  }
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt.slice(0, 64) : value.createdAt.slice(0, 64);
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 200) : null;
  const context = normalizeJournalContext(value.context);
  const publish = normalizeJournalPublish(value.publish);
  const important = Boolean(value.important);

  return {
    id: value.id,
    createdAt: value.createdAt.slice(0, 64),
    updatedAt,
    title,
    content: value.content.slice(0, 200000),
    context,
    publish,
    important,
  };
}

export function normalizeJournals(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: JournalEntry[] = [];
  value.forEach((candidate) => {
    const entry = normalizeJournalEntry(candidate);
    if (entry) entries.push(entry);
  });
  return entries.slice(-2000);
}

export function defaultPastPapers(): PaperRecord[] {
  const list: PaperRecord[] = [];
  (["408", "math", "english"] as StudyArea[]).forEach((area) => {
    PAST_PAPER_YEARS.forEach((year) => {
      list.push({
        id: `past-${area}-${year}`,
        kind: "past",
        area,
        title: `${year}年${area === "408" ? "408真题" : area === "math" ? "数学真题" : "英语真题"}`,
        groupName: "历年真题",
        year,
        completed: false,
        completedAt: "",
        score: null,
        durationMinutes: null,
        secondRound: false,
        secondRoundAt: "",
      });
    });
  });
  POLITICS_PAST_PAPER_YEARS.forEach((year) => {
    list.push({
      id: `past-politics-${year}`,
      kind: "past",
      area: "politics",
      title: `${year}年政治真题`,
      groupName: "历年真题",
      year,
      completed: false,
      completedAt: "",
      score: null,
      durationMinutes: null,
      secondRound: false,
      secondRoundAt: "",
    });
  });
  return list;
}

export function normalizePaperRecord(value: unknown): PaperRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  const kind: PaperKind = value.kind === "mock" ? "mock" : "past";
  const area: StudyArea =
    value.area === "math" ? "math" : value.area === "english" ? "english" : value.area === "politics" ? "politics" : "408";
  let title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim().slice(0, 150)
      : kind === "past"
      ? `${value.year ?? ""}年真题`
      : "模拟卷";
  title = title.replace(/^(\d{4}年)\s+/, "$1");
  const year = typeof value.year === "number" && value.year >= 2000 && value.year <= 2100 ? value.year : undefined;
  const completed = Boolean(value.completed);
  const completedAt = typeof value.completedAt === "string" && isDate(value.completedAt) ? value.completedAt : "";
  const maxScore = maxPaperScore(area);
  const score =
    typeof value.score === "number" && !Number.isNaN(value.score) && value.score >= 0 && value.score <= maxScore
      ? Math.round(value.score * 10) / 10
      : null;
  const durationMinutes =
    typeof value.durationMinutes === "number" && value.durationMinutes > 0 && value.durationMinutes <= 600
      ? Math.round(value.durationMinutes)
      : null;
  const secondRound = Boolean(value.secondRound);
  const secondRoundAt = typeof value.secondRoundAt === "string" && isDate(value.secondRoundAt) ? value.secondRoundAt : "";
  const groupName = typeof value.groupName === "string" && value.groupName.trim() ? value.groupName.trim().slice(0, 80) : undefined;
  const notes = typeof value.notes === "string" ? value.notes.trim().slice(0, 2000) : undefined;

  let questions: Record<number, QuestionState> | undefined = undefined;
  if (isRecord(value.questions)) {
    const qMap: Record<number, QuestionState> = {};
    Object.entries(value.questions).forEach(([k, v]) => {
      const qNum = parseInt(k, 10);
      if (!Number.isNaN(qNum) && qNum >= 1 && qNum <= 100) {
        if (v === "correct" || v === "partial" || v === "wrong") {
          qMap[qNum] = v;
        }
      }
    });
    questions = qMap;
  }

  let questionScores: Record<number, number> | undefined = undefined;
  if (isRecord(value.questionScores)) {
    const sMap: Record<number, number> = {};
    Object.entries(value.questionScores).forEach(([k, v]) => {
      const qNum = parseInt(k, 10);
      if (!Number.isNaN(qNum) && qNum >= 1 && qNum <= 100 && typeof v === "number" && !Number.isNaN(v) && v >= 0 && v <= 100) {
        sMap[qNum] = Math.round(v * 10) / 10;
      }
    });
    questionScores = sMap;
  }

  return {
    id: value.id.trim().slice(0, 100),
    kind,
    area,
    title,
    groupName,
    year,
    completed: completed && Boolean(completedAt),
    completedAt: completed ? completedAt : "",
    score,
    durationMinutes,
    secondRound: secondRound && Boolean(secondRoundAt),
    secondRoundAt: secondRound ? secondRoundAt : "",
    notes,
    questions,
    questionScores,
  };
}

export function normalizePapers(value: unknown, defaults = defaultPastPapers()): PaperRecord[] {
  const map = new Map<string, PaperRecord>();
  defaults.forEach((paper) => map.set(paper.id, paper));

  if (Array.isArray(value)) {
    value.forEach((candidate) => {
      const normalized = normalizePaperRecord(candidate);
      if (!normalized) return;
      map.set(normalized.id, normalized);
    });
  }

  return Array.from(map.values());
}

export function mergePapers(local: PaperRecord[], remote: PaperRecord[]): PaperRecord[] {
  const map = new Map<string, PaperRecord>();
  const defaults = defaultPastPapers();
  defaults.forEach((p) => map.set(p.id, p));

  remote.forEach((p) => {
    if (p && p.id) {
      const existing = map.get(p.id);
      map.set(p.id, existing ? { ...existing, ...p } : p);
    }
  });

  local.forEach((p) => {
    if (!p || !p.id) return;
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
    } else {
      const localExplicitClear =
        (p.questions !== undefined && Object.keys(p.questions).length === 0) ||
        (p.questionScores !== undefined && Object.keys(p.questionScores).length === 0);

      const localHasData = Boolean(
        p.completed ||
          p.score !== null ||
          p.durationMinutes !== null ||
          p.secondRound ||
          (p.questions && Object.keys(p.questions).length > 0) ||
          (p.questionScores && Object.keys(p.questionScores).length > 0),
      );
      const remoteHasData = Boolean(
        existing.completed ||
          existing.score !== null ||
          existing.durationMinutes !== null ||
          existing.secondRound ||
          (existing.questions && Object.keys(existing.questions).length > 0) ||
          (existing.questionScores && Object.keys(existing.questionScores).length > 0),
      );

      if (!localHasData && remoteHasData && !localExplicitClear) {
        return;
      }

      const questions = p.questions !== undefined ? p.questions : existing.questions;
      const questionScores = p.questionScores !== undefined ? p.questionScores : existing.questionScores;

      map.set(p.id, {
        ...existing,
        ...p,
        completed: p.completed,
        completedAt: p.completed ? p.completedAt || existing.completedAt : "",
        score: p.score ?? null,
        durationMinutes: p.durationMinutes ?? null,
        secondRound: p.secondRound ?? false,
        secondRoundAt: p.secondRound ? p.secondRoundAt || existing.secondRoundAt : "",
        questions,
        questionScores,
      });
    }
  });

  return Array.from(map.values());
}

export function mergeJournals(local: JournalEntry[], remote: JournalEntry[]): JournalEntry[] {
  const map = new Map<string, JournalEntry>();
  remote.forEach((entry) => {
    if (entry && entry.id) map.set(entry.id, entry);
  });
  local.forEach((entry) => {
    if (!entry || !entry.id) return;
    const existing = map.get(entry.id);
    if (!existing) {
      map.set(entry.id, entry);
    } else {
      const localTime = new Date(entry.updatedAt || entry.createdAt).getTime();
      const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
      if (Number.isNaN(localTime) || Number.isNaN(existingTime)) {
        map.set(entry.id, entry);
      } else if (localTime >= existingTime) {
        map.set(entry.id, entry);
      }
    }
  });
  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
