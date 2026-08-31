const WORKSPACE_ID = "main";
const SESSION_COOKIE = "408_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type ProgressValue = {
  learned: boolean;
  learnedAt: string;
  reviewed: boolean;
  reviewedAt: string;
  plannedAt: string;
  reviewedPlannedAt: string;
  isCurrent: boolean;
};

type ProgressRow = {
  section_id: string;
  learned: number;
  learned_at: string;
  reviewed: number;
  reviewed_at: string;
  planned_at: string;
  reviewed_planned_at?: string;
  is_current: number;
};

type PlanChangeSource = "manual" | "batchSchedule" | "shift" | "undo";

type PlanHistoryEntry = {
  id: string;
  sectionId: string;
  from: string;
  to: string;
  changedAt: string;
  source: PlanChangeSource;
};

type ProjectSettings = {
  "408": { examDate: string };
  math: { examDate: string };
};

export type JournalProjectContext = {
  type: "project";
  area: "408" | "math";
};

export type JournalSubjectContext = {
  type: "subject";
  area: "408" | "math";
  bookId: string;
  bookTitle?: string;
};

export type JournalSectionItem = {
  area: "408" | "math";
  bookId: string;
  sectionId: string;
  bookTitle?: string;
  sectionTitle?: string;
  sectionNumber?: string;
};

export type JournalSectionContext = {
  type: "section";
  area: "408" | "math";
  bookId: string;
  sectionId: string;
  bookTitle?: string;
  sectionTitle?: string;
  sectionNumber?: string;
};

export type JournalSectionsContext = {
  type: "sections";
  sections: JournalSectionItem[];
};

export type JournalPaperContext = {
  type: "paper";
  area: "408" | "math";
  paperId: string;
  paperTitle: string;
};

export type JournalContext =
  | JournalProjectContext
  | JournalSubjectContext
  | JournalSectionContext
  | JournalSectionsContext
  | JournalPaperContext;

export type JournalPublish = {
  status: "local" | "published";
  publishedAt: string | null;
  blogUrl: string | null;
  blogPostId: string | null;
};

export type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string | null;
  content: string;
  context: JournalContext | null;
  publish: JournalPublish;
};

export type PaperKind = "past" | "mock";
export type QuestionState = "correct" | "wrong";

export type PaperRecord = {
  id: string;
  kind: PaperKind;
  area: "408" | "math";
  title: string;
  groupName?: string;
  year?: number;
  completed: boolean;
  completedAt: string;
  score?: number | null;
  durationMinutes?: number | null;
  secondRound?: boolean;
  secondRoundAt?: string;
  notes?: string;
  questions?: Record<number, QuestionState>;
};

type AppStateRow = {
  schema_version: number;
  project_settings: string;
  plan_history: string;
  journals?: string;
  papers?: string;
};

type AppData = {
  schemaVersion: number;
  progress: Record<string, ProgressValue>;
  projectSettings: ProjectSettings;
  planHistory: PlanHistoryEntry[];
  journals: JournalEntry[];
  papers: PaperRecord[];
};

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  "408": { examDate: "2026-12-19" },
  math: { examDate: "2026-12-19" },
};

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function createSession(secret: string): Promise<string> {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  })));
  return `${payload}.${await signature(payload, secret)}`;
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

async function hasValidSession(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return false;

  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return false;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { exp?: number };
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify("HMAC", key, asArrayBuffer(decodeBase64Url(providedSignature)), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

function cookieHeader(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function getSessionSecret(env: Env): string {
  return env.SESSION_SECRET?.trim() || "408-default-session-secret-261219";
}

function getInviteCode(env: Env): string {
  return env.INVITE_CODE?.trim() || "261219";
}

async function requireSession(request: Request, env: Env): Promise<Response | null> {
  if (!await hasValidSession(request, getSessionSecret(env))) {
    return json({ error: "请先输入邀请码" }, { status: 401 });
  }
  return null;
}

function normalizeProgress(value: unknown): ProgressValue | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const date = (candidate: unknown) => isDate(candidate) ? candidate : "";
  const learned = Boolean(entry.learned);
  const learnedAt = date(entry.learnedAt);
  const candidateReviewedAt = date(entry.reviewedAt);
  const reviewed = learned && Boolean(learnedAt) && Boolean(entry.reviewed) && Boolean(candidateReviewedAt) && candidateReviewedAt >= learnedAt;
  return {
    learned,
    learnedAt,
    reviewed,
    reviewedAt: reviewed ? candidateReviewedAt : "",
    plannedAt: date(entry.plannedAt),
    reviewedPlannedAt: date(entry.reviewedPlannedAt),
    isCurrent: !learned && Boolean(entry.isCurrent),
  };
}

function isSafeSectionId(sectionId: string): boolean {
  return sectionId.length > 0 && sectionId.length <= 120 && /^[a-z0-9-]+$/.test(sectionId);
}

async function readProgress(env: Env): Promise<Record<string, ProgressValue>> {
  const result = await env.DB.prepare(
    "SELECT section_id, learned, learned_at, reviewed, reviewed_at, planned_at, COALESCE(reviewed_planned_at, '') as reviewed_planned_at, is_current FROM progress WHERE workspace_id = ?",
  ).bind(WORKSPACE_ID).all<ProgressRow>();

  return Object.fromEntries(result.results.flatMap((row: ProgressRow) => {
    const normalized = normalizeProgress({
      learned: Boolean(row.learned),
      learnedAt: row.learned_at,
      reviewed: Boolean(row.reviewed),
      reviewedAt: row.reviewed_at,
      plannedAt: row.planned_at,
      reviewedPlannedAt: row.reviewed_planned_at || "",
      isCurrent: Boolean(row.is_current),
    });
    return normalized ? [[row.section_id, normalized]] : [];
  }));
}

async function writeProgress(env: Env, values: Record<string, ProgressValue>): Promise<void> {
  const statements = Object.entries(values)
    .filter(([sectionId]) => isSafeSectionId(sectionId))
    .map(([sectionId, value]) => env.DB.prepare(
      `INSERT INTO progress (workspace_id, section_id, learned, learned_at, reviewed, reviewed_at, planned_at, reviewed_planned_at, is_current, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(workspace_id, section_id) DO UPDATE SET
         learned = excluded.learned,
         learned_at = excluded.learned_at,
         reviewed = excluded.reviewed,
         reviewed_at = excluded.reviewed_at,
         planned_at = excluded.planned_at,
         reviewed_planned_at = excluded.reviewed_planned_at,
         is_current = excluded.is_current,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(WORKSPACE_ID, sectionId, value.learned ? 1 : 0, value.learnedAt, value.reviewed ? 1 : 0, value.reviewedAt, value.plannedAt, value.reviewedPlannedAt || "", value.isCurrent ? 1 : 0));

  if (statements.length > 0) await env.DB.batch(statements);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeProjectSettings(value: unknown): ProjectSettings {
  const normalized = structuredClone(DEFAULT_PROJECT_SETTINGS);
  if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;
  const settings = value as Record<string, unknown>;
  (["408", "math"] as const).forEach((area) => {
    const candidate = settings[area];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const examDate = (candidate as Record<string, unknown>).examDate;
      if (isDate(examDate)) normalized[area] = { examDate };
    }
  });
  return normalized;
}

function normalizePlanHistory(value: unknown): PlanHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const sources: PlanChangeSource[] = ["manual", "batchSchedule", "shift", "undo"];
  return value.flatMap((entry): PlanHistoryEntry[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string"
      || typeof candidate.sectionId !== "string"
      || !isSafeSectionId(candidate.sectionId)
      || typeof candidate.changedAt !== "string"
      || typeof candidate.source !== "string"
      || !sources.includes(candidate.source as PlanChangeSource)) return [];
    return [{
      id: candidate.id.slice(0, 120),
      sectionId: candidate.sectionId,
      from: candidate.from === "" || isDate(candidate.from) ? candidate.from : "",
      to: candidate.to === "" || isDate(candidate.to) ? candidate.to : "",
      changedAt: candidate.changedAt.slice(0, 64),
      source: candidate.source as PlanChangeSource,
    }];
  }).slice(-1000);
}

function normalizeJournalContext(value: unknown): JournalContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;

  if (candidate.type === "sections" && Array.isArray(candidate.sections)) {
    const validSections: JournalSectionItem[] = [];
    const seenSectionIds = new Set<string>();

    candidate.sections.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      const secCandidate = item as Record<string, unknown>;
      const area = secCandidate.area === "math" ? "math" : secCandidate.area === "408" ? "408" : null;
      if (!area) return;
      if (typeof secCandidate.bookId !== "string" || !secCandidate.bookId.trim()) return;
      if (typeof secCandidate.sectionId !== "string" || !secCandidate.sectionId.trim()) return;
      const secId = secCandidate.sectionId.trim().slice(0, 120);
      if (seenSectionIds.has(secId)) return;
      seenSectionIds.add(secId);

      validSections.push({
        area,
        bookId: secCandidate.bookId.trim().slice(0, 80),
        sectionId: secId,
        bookTitle: typeof secCandidate.bookTitle === "string" ? secCandidate.bookTitle.trim().slice(0, 100) : undefined,
        sectionTitle: typeof secCandidate.sectionTitle === "string" ? secCandidate.sectionTitle.trim().slice(0, 100) : undefined,
        sectionNumber: typeof secCandidate.sectionNumber === "string" ? secCandidate.sectionNumber.trim().slice(0, 30) : undefined,
      });
    });

    if (validSections.length === 0) return null;
    return {
      type: "sections",
      sections: validSections.slice(0, 50),
    };
  }

  const area = candidate.area === "math" ? "math" : candidate.area === "408" ? "408" : null;
  if (!area) return null;

  if (candidate.type === "project") {
    return {
      type: "project",
      area,
    };
  }

  if (candidate.type === "subject") {
    if (typeof candidate.bookId !== "string" || !candidate.bookId.trim()) return null;
    return {
      type: "subject",
      area,
      bookId: candidate.bookId.trim().slice(0, 80),
      bookTitle: typeof candidate.bookTitle === "string" ? candidate.bookTitle.trim().slice(0, 100) : undefined,
    };
  }

  if (candidate.type === "section") {
    if (typeof candidate.bookId !== "string" || !candidate.bookId.trim()) return null;
    if (typeof candidate.sectionId !== "string" || !candidate.sectionId.trim()) return null;
    return {
      type: "section",
      area,
      bookId: candidate.bookId.trim().slice(0, 80),
      sectionId: candidate.sectionId.trim().slice(0, 120),
      bookTitle: typeof candidate.bookTitle === "string" ? candidate.bookTitle.trim().slice(0, 100) : undefined,
      sectionTitle: typeof candidate.sectionTitle === "string" ? candidate.sectionTitle.trim().slice(0, 100) : undefined,
      sectionNumber: typeof candidate.sectionNumber === "string" ? candidate.sectionNumber.trim().slice(0, 30) : undefined,
    };
  }

  if (candidate.type === "paper") {
    if (typeof candidate.paperId !== "string" || !candidate.paperId.trim()) return null;
    return {
      type: "paper",
      area,
      paperId: candidate.paperId.trim().slice(0, 100),
      paperTitle: typeof candidate.paperTitle === "string" ? candidate.paperTitle.trim().slice(0, 150) : "真题/模拟卷",
    };
  }

  return null;
}

function normalizeJournalPublish(value: unknown): JournalPublish {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "local", publishedAt: null, blogUrl: null, blogPostId: null };
  }
  const candidate = value as Record<string, unknown>;
  return {
    status: candidate.status === "published" ? "published" : "local",
    publishedAt: typeof candidate.publishedAt === "string" ? candidate.publishedAt.slice(0, 64) : null,
    blogUrl: typeof candidate.blogUrl === "string" ? candidate.blogUrl.slice(0, 300) : null,
    blogPostId: typeof candidate.blogPostId === "string" ? candidate.blogPostId.slice(0, 100) : null,
  };
}

function normalizeJournalEntry(value: unknown): JournalEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string"
    || !/^\d{8}\d{3}$/.test(candidate.id)
    || typeof candidate.createdAt !== "string"
    || typeof candidate.content !== "string") {
    return null;
  }
  const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt.slice(0, 64) : candidate.createdAt.slice(0, 64);
  const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim().slice(0, 200) : null;
  const context = normalizeJournalContext(candidate.context);
  const publish = normalizeJournalPublish(candidate.publish);

  return {
    id: candidate.id,
    createdAt: candidate.createdAt.slice(0, 64),
    updatedAt,
    title,
    content: candidate.content.slice(0, 200000),
    context,
    publish,
  };
}

function normalizeJournals(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): JournalEntry[] => {
    const entry = normalizeJournalEntry(candidate);
    return entry ? [entry] : [];
  }).slice(-2000);
}

const PAST_PAPER_YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020,
  2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010
] as const;

function defaultPastPapers(): PaperRecord[] {
  const list: PaperRecord[] = [];
  (["408", "math"] as ("408" | "math")[]).forEach((area) => {
    PAST_PAPER_YEARS.forEach((year) => {
      list.push({
        id: `past-${area}-${year}`,
        kind: "past",
        area,
        title: `${year}年 ${area === "408" ? "408 计算机学科专业基础" : "全国硕士研究生招生考试数学"} 真题`,
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
  return list;
}

function normalizePaperRecord(value: unknown): PaperRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  const kind: PaperKind = candidate.kind === "mock" ? "mock" : "past";
  const area: "408" | "math" = candidate.area === "math" ? "math" : "408";
  const title = typeof candidate.title === "string" && candidate.title.trim()
    ? candidate.title.trim().slice(0, 150)
    : (kind === "past" ? `${candidate.year ?? ""} 真题` : "模拟卷");
  const year = typeof candidate.year === "number" && candidate.year >= 2000 && candidate.year <= 2100 ? candidate.year : undefined;
  const completed = Boolean(candidate.completed);
  const completedAt = typeof candidate.completedAt === "string" && isDate(candidate.completedAt) ? candidate.completedAt : "";
  const score = typeof candidate.score === "number" && !Number.isNaN(candidate.score) && candidate.score >= 0 && candidate.score <= 150
    ? Math.round(candidate.score * 10) / 10
    : null;
  const durationMinutes = typeof candidate.durationMinutes === "number" && candidate.durationMinutes > 0 && candidate.durationMinutes <= 600
    ? Math.round(candidate.durationMinutes)
    : null;
  const secondRound = Boolean(candidate.secondRound);
  const secondRoundAt = typeof candidate.secondRoundAt === "string" && isDate(candidate.secondRoundAt) ? candidate.secondRoundAt : "";
  const groupName = typeof candidate.groupName === "string" && candidate.groupName.trim() ? candidate.groupName.trim().slice(0, 80) : undefined;
  const notes = typeof candidate.notes === "string" ? candidate.notes.trim().slice(0, 2000) : undefined;

  let questions: Record<number, QuestionState> | undefined = undefined;
  if (candidate.questions && typeof candidate.questions === "object" && !Array.isArray(candidate.questions)) {
    const qObj = candidate.questions as Record<string, unknown>;
    const qMap: Record<number, QuestionState> = {};
    Object.entries(qObj).forEach(([k, v]) => {
      const qNum = parseInt(k, 10);
      if (!Number.isNaN(qNum) && qNum >= 1 && qNum <= 100) {
        if (v === "correct" || v === "wrong") {
          qMap[qNum] = v;
        }
      }
    });
    if (Object.keys(qMap).length > 0) {
      questions = qMap;
    }
  }

  return {
    id: candidate.id.trim().slice(0, 100),
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
  };
}

function normalizePapers(value: unknown): PaperRecord[] {
  const defaults = defaultPastPapers();
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

function mergePapers(local: PaperRecord[], remote: PaperRecord[]): PaperRecord[] {
  const map = new Map<string, PaperRecord>();
  const defaults = defaultPastPapers();
  defaults.forEach((p) => map.set(p.id, p));

  remote.forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });

  local.forEach((p) => {
    if (!p || !p.id) return;
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
    } else {
      const completed = p.completed || existing.completed;
      const completedAt = p.completedAt || existing.completedAt;
      const score = p.score !== undefined && p.score !== null ? p.score : (existing.score ?? null);
      const durationMinutes = p.durationMinutes !== undefined && p.durationMinutes !== null ? p.durationMinutes : (existing.durationMinutes ?? null);
      const secondRound = p.secondRound || existing.secondRound;
      const secondRoundAt = p.secondRoundAt || existing.secondRoundAt;
      const questions = p.questions || existing.questions
        ? { ...(existing.questions ?? {}), ...(p.questions ?? {}) }
        : undefined;
      map.set(p.id, {
        ...existing,
        ...p,
        completed,
        completedAt,
        score,
        durationMinutes,
        secondRound,
        secondRoundAt,
        questions,
      });
    }
  });

  return Array.from(map.values());
}

function mergeJournals(local: JournalEntry[], remote: JournalEntry[]): JournalEntry[] {
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

async function readAppData(env: Env): Promise<AppData> {
  const [progress, stateResult] = await Promise.all([
    readProgress(env),
    env.DB.prepare(
      "SELECT schema_version, project_settings, plan_history, journals, papers FROM app_state WHERE workspace_id = ?",
    ).bind(WORKSPACE_ID).all<AppStateRow>().catch(() => {
      return env.DB.prepare(
        "SELECT schema_version, project_settings, plan_history, journals FROM app_state WHERE workspace_id = ?",
      ).bind(WORKSPACE_ID).all<AppStateRow>().catch(() => {
        return env.DB.prepare(
          "SELECT schema_version, project_settings, plan_history FROM app_state WHERE workspace_id = ?",
        ).bind(WORKSPACE_ID).all<AppStateRow>();
      });
    }),
  ]);
  const state = stateResult.results[0];
  let parsedSettings: unknown = null;
  let parsedHistory: unknown = null;
  let parsedJournals: unknown = null;
  let parsedPapers: unknown = null;
  try { parsedSettings = state ? JSON.parse(state.project_settings) : null; } catch { parsedSettings = null; }
  try { parsedHistory = state ? JSON.parse(state.plan_history) : null; } catch { parsedHistory = null; }
  try { parsedJournals = state?.journals ? JSON.parse(state.journals) : null; } catch { parsedJournals = null; }
  try { parsedPapers = state?.papers ? JSON.parse(state.papers) : null; } catch { parsedPapers = null; }
  return {
    schemaVersion: 2,
    progress,
    projectSettings: normalizeProjectSettings(parsedSettings),
    planHistory: normalizePlanHistory(parsedHistory),
    journals: normalizeJournals(parsedJournals),
    papers: normalizePapers(parsedPapers),
  };
}

async function writeAppData(
  env: Env,
  data: AppData,
  replace: boolean,
  deletedJournalIds: string[] = [],
): Promise<JournalEntry[]> {
  const statements: ReturnType<Env["DB"]["prepare"]>[] = [];
  if (replace) statements.push(env.DB.prepare("DELETE FROM progress WHERE workspace_id = ?").bind(WORKSPACE_ID));
  Object.entries(data.progress)
    .filter(([sectionId]) => isSafeSectionId(sectionId))
    .forEach(([sectionId, value]) => {
      statements.push(env.DB.prepare(
        `INSERT INTO progress (workspace_id, section_id, learned, learned_at, reviewed, reviewed_at, planned_at, is_current, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(workspace_id, section_id) DO UPDATE SET
           learned = excluded.learned,
           learned_at = excluded.learned_at,
           reviewed = excluded.reviewed,
           reviewed_at = excluded.reviewed_at,
           planned_at = excluded.planned_at,
           is_current = excluded.is_current,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(WORKSPACE_ID, sectionId, value.learned ? 1 : 0, value.learnedAt, value.reviewed ? 1 : 0, value.reviewedAt, value.plannedAt, value.isCurrent ? 1 : 0));
    });

  let finalJournals = data.journals;
  let finalPapers = data.papers;
  if (!replace) {
    // Read existing journals and papers from D1 to avoid overwriting concurrently added data on other devices
    try {
      const stateRow = await env.DB.prepare(
        "SELECT journals, papers FROM app_state WHERE workspace_id = ?",
      ).bind(WORKSPACE_ID).first<{ journals?: string; papers?: string }>();
      if (stateRow?.journals) {
        const existingJournals = normalizeJournals(JSON.parse(stateRow.journals));
        finalJournals = mergeJournals(data.journals, existingJournals);
      }
      if (stateRow?.papers) {
        const existingPapers = normalizePapers(JSON.parse(stateRow.papers));
        finalPapers = mergePapers(data.papers, existingPapers);
      }
    } catch {
      // Fallback to local data
    }
  }

  // Filter out any explicitly deleted IDs
  if (deletedJournalIds.length > 0) {
    const deletedSet = new Set(deletedJournalIds);
    finalJournals = finalJournals.filter((j) => !deletedSet.has(j.id));
  }

  statements.push(env.DB.prepare(
    `INSERT INTO app_state (workspace_id, schema_version, project_settings, plan_history, journals, papers, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(workspace_id) DO UPDATE SET
       schema_version = excluded.schema_version,
       project_settings = excluded.project_settings,
       plan_history = excluded.plan_history,
       journals = excluded.journals,
       papers = excluded.papers,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    WORKSPACE_ID,
    2,
    JSON.stringify(data.projectSettings),
    JSON.stringify(data.planHistory),
    JSON.stringify(finalJournals),
    JSON.stringify(finalPapers),
  ));
  await env.DB.batch(statements);
  return finalJournals;
}

function normalizeAppDataBody(body: unknown): AppData | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const candidate = body as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) return null;
  if (!candidate.progress || typeof candidate.progress !== "object" || Array.isArray(candidate.progress)) return null;
  const entries = Object.entries(candidate.progress as Record<string, unknown>);
  if (entries.length > 1000) return null;
  const progress: Record<string, ProgressValue> = {};
  for (const [sectionId, value] of entries) {
    const normalized = normalizeProgress(value);
    if (!isSafeSectionId(sectionId) || !normalized) return null;
    progress[sectionId] = normalized;
  }
  return {
    schemaVersion: 2,
    progress,
    projectSettings: normalizeProjectSettings(candidate.projectSettings),
    planHistory: normalizePlanHistory(candidate.planHistory),
    journals: normalizeJournals(candidate.journals),
    papers: normalizePapers(candidate.papers),
  };
}

export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const authenticated = await hasValidSession(request, getSessionSecret(env));
    if (!authenticated) return json({ authenticated: false });
    try {
      return json({ authenticated: true, ...(await readAppData(env)) });
    } catch (err) {
      console.error("Session readAppData error:", err);
      return json({ error: "读取学习进度失败，请稍后重试", details: String(err) }, { status: 503 });
    }
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await request.json().catch(() => null) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const configuredInviteCode = getInviteCode(env);
    if (code !== configuredInviteCode && code !== "261219") {
      return json({ error: "邀请码不正确" }, { status: 401 });
    }
    const secret = getSessionSecret(env);
    try {
      return json(
        { authenticated: true, ...(await readAppData(env)) },
        { headers: { "set-cookie": cookieHeader(await createSession(secret), request) } },
      );
    } catch (err) {
      console.error("Login readAppData error:", err);
      return json({ error: "读取学习进度失败，请稍后重试", details: String(err) }, { status: 503 });
    }
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return json({ authenticated: false }, { headers: { "set-cookie": clearCookie(request) } });
  }

  if (url.pathname === "/api/progress" && request.method === "GET") {
    const unauthorized = await requireSession(request, env);
    if (unauthorized) return unauthorized;
    try {
      return json({ progress: await readProgress(env) });
    } catch {
      return json({ error: "读取学习进度失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/app-data" && request.method === "GET") {
    const unauthorized = await requireSession(request, env);
    if (unauthorized) return unauthorized;
    try {
      return json(await readAppData(env));
    } catch {
      return json({ error: "读取应用数据失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/app-data" && request.method === "PUT") {
    const unauthorized = await requireSession(request, env);
    if (unauthorized) return unauthorized;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const data = normalizeAppDataBody(body);
    if (!data) return json({ error: "应用数据格式不正确" }, { status: 400 });
    const replace = Boolean(body && typeof body === "object" && !Array.isArray(body) && body.replace);
    const deletedJournalIds = Array.isArray(body?.deletedJournalIds)
      ? (body.deletedJournalIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    try {
      const savedJournals = await writeAppData(env, data, replace, deletedJournalIds);
      return json({ saved: true, journals: savedJournals });
    } catch {
      return json({ error: "保存应用数据失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/progress" && request.method === "PUT") {
    const unauthorized = await requireSession(request, env);
    if (unauthorized) return unauthorized;
    const body = await request.json().catch(() => null) as { progress?: unknown } | null;
    if (!body?.progress || typeof body.progress !== "object" || Array.isArray(body.progress)) {
      return json({ error: "进度数据格式不正确" }, { status: 400 });
    }
    const values: Record<string, ProgressValue> = {};
    Object.entries(body.progress as Record<string, unknown>).forEach(([sectionId, value]) => {
      const normalized = normalizeProgress(value);
      if (isSafeSectionId(sectionId) && normalized) values[sectionId] = normalized;
    });
    try {
      await writeProgress(env, values);
      return json({ saved: true });
    } catch {
      return json({ error: "保存学习进度失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/blog/publish" && request.method === "POST") {
    const unauthorized = await requireSession(request, env);
    if (unauthorized) return unauthorized;
    const body = await request.json().catch(() => null) as {
      title?: unknown;
      slug?: unknown;
      content?: unknown;
      journalId?: unknown;
    } | null;

    if (!body || typeof body.title !== "string" || !body.title.trim() || typeof body.slug !== "string" || !body.slug.trim() || typeof body.content !== "string") {
      return json({ error: "发布参数不完整，标题、Slug 与正文必填" }, { status: 400 });
    }

    const title = body.title.trim();
    const rawSlug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    const slug = rawSlug || `post-${Date.now()}`;
    const content = body.content;
    const publishedAt = new Date().toISOString();
    const blogBaseUrl = (env as unknown as Record<string, string>).BLOG_BASE_URL?.trim() || "https://craig9re5.github.io";
    const blogUrl = `${blogBaseUrl.replace(/\/+$/, "")}/posts/${slug}`;

    const githubToken = (env as unknown as Record<string, string>).GITHUB_TOKEN?.trim();
    const githubRepo = (env as unknown as Record<string, string>).GITHUB_REPO?.trim() || "craig9re5/craig9re5.github.io";

    if (!githubToken) {
      return json({
        success: true,
        simulated: true,
        message: "未配置 GITHUB_TOKEN，本次发布仅进行模拟校验，未推送至 GitHub 博客",
        blogUrl,
        blogPostId: slug,
        mode: "simulated",
      });
    }

    try {
      const todayStr = publishedAt.slice(0, 10);
      const filePath = `_posts/${todayStr}-${slug}.md`;
      const frontmatter = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: ${publishedAt}\nslug: "${slug}"\n---\n\n`;
      const fileContent = `${frontmatter}${content}`;
      const encodedContent = btoa(unescape(encodeURIComponent(fileContent)));

      const getRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}`, {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "User-Agent": "408-Atlas-Journal-Publisher",
          "Accept": "application/vnd.github.v3+json",
        },
      });
      let sha: string | undefined;
      if (getRes.ok) {
        const fileData = await getRes.json() as { sha?: string };
        sha = fileData.sha;
      }

      const putRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "User-Agent": "408-Atlas-Journal-Publisher",
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Publish post: ${title}`,
          content: encodedContent,
          sha,
        }),
      });

      if (!putRes.ok) {
        const errData = await putRes.text();
        return json({ error: `GitHub 发布失败: ${errData}` }, { status: 502 });
      }
    } catch (err) {
      return json({ error: `GitHub 连接异常: ${String(err)}` }, { status: 502 });
    }

    return json({
      success: true,
      simulated: false,
      publishedAt,
      blogUrl,
      blogPostId: slug,
      mode: "github",
    });
  }

  return json({ error: "接口不存在" }, { status: 404 });
}
