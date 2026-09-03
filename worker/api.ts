import type {
  JournalProjectContext,
  JournalSubjectContext,
  JournalSectionItem,
  JournalSectionContext,
  JournalSectionsContext,
  JournalPaperContext,
  JournalContext,
  JournalPublish,
  JournalEntry,
  PaperKind,
  QuestionState,
  PaperRecord,
  ProgressValue,
  PlanChangeSource,
  PlanHistoryEntry,
  ProjectSettings,
} from "../shared/types.ts";
import { DEFAULT_PROJECT_SETTINGS } from "../shared/constants.ts";
import {
  isDate,
  normalizeProjectSettings,
  normalizePlanHistory as normalizePlanHistoryShared,
  normalizeJournalContext,
  normalizeJournalPublish,
  normalizeJournalEntry,
  normalizeJournals,
  defaultPastPapers,
  normalizePaperRecord,
  normalizePapers,
  mergePapers,
  mergeJournals,
} from "../shared/merge.ts";

export type {
  JournalProjectContext,
  JournalSubjectContext,
  JournalSectionItem,
  JournalSectionContext,
  JournalSectionsContext,
  JournalPaperContext,
  JournalContext,
  JournalPublish,
  JournalEntry,
  PaperKind,
  QuestionState,
  PaperRecord,
};

const DEFAULT_WORKSPACE_ID = "main";
const SESSION_COOKIE = "408_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function isSafeWorkspaceId(workspaceId: string): boolean {
  return workspaceId.length > 0 && workspaceId.length <= 64 && /^[a-z0-9-]+$/.test(workspaceId);
}

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

type AppStateRow = {
  schema_version: number;
  project_settings: string;
  plan_history: string;
  journals?: string;
  papers?: string;
  schedule?: string;
};

type AppData = {
  schemaVersion: number;
  progress: Record<string, ProgressValue>;
  projectSettings: ProjectSettings;
  planHistory: PlanHistoryEntry[];
  journals: JournalEntry[];
  papers: PaperRecord[];
  schedule?: unknown;
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

async function createSession(secret: string, workspaceId: string): Promise<string> {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    wid: workspaceId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  })));
  return `${payload}.${await signature(payload, secret)}`;
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

async function getSessionWorkspaceId(request: Request, secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;

  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { exp?: number; wid?: unknown };
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    // 升级前签发的老 session 没有 wid，验签通过后归入默认空间；
    // wid 存在但格式非法则直接拒绝，防止伪造空间。
    if (typeof decoded.wid !== "undefined"
      && (typeof decoded.wid !== "string" || !isSafeWorkspaceId(decoded.wid))) return null;
    const workspaceId = typeof decoded.wid === "string" ? decoded.wid : DEFAULT_WORKSPACE_ID;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify("HMAC", key, asArrayBuffer(decodeBase64Url(providedSignature)), new TextEncoder().encode(payload));
    return valid ? workspaceId : null;
  } catch {
    return null;
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
  const secret = env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("CRITICAL: SESSION_SECRET is not configured.");
  }
  return secret;
}

function getWorkspaceMap(env: Env): Map<string, string> {
  const map = new Map<string, string>();
  const raw = (env as unknown as Record<string, string | undefined>).INVITE_CODES?.trim();
  if (raw) {
    raw.split(",").forEach((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return;
      const separator = trimmed.indexOf(":");
      if (separator < 0) {
        // 允许裸码写法，默认归入 main，方便少量码快速配置。
        if (isSafeWorkspaceId(DEFAULT_WORKSPACE_ID)) map.set(trimmed, DEFAULT_WORKSPACE_ID);
        return;
      }
      const code = trimmed.slice(0, separator).trim();
      const workspaceId = trimmed.slice(separator + 1).trim();
      if (code && isSafeWorkspaceId(workspaceId)) map.set(code, workspaceId);
    });
  }
  if (map.size === 0) {
    const legacy = (env as unknown as Record<string, string | undefined>).INVITE_CODE?.trim();
    if (legacy) {
      map.set(legacy, DEFAULT_WORKSPACE_ID);
    }
  }
  return map;
}

async function requireWorkspace(request: Request, env: Env): Promise<string | Response> {
  let secret = "";
  try {
    secret = getSessionSecret(env);
  } catch {
    return json({ error: "服务器会话密钥未配置 (SESSION_SECRET)" }, { status: 500 });
  }
  const workspaceId = await getSessionWorkspaceId(request, secret);
  if (!workspaceId) {
    return json({ error: "请先输入邀请码" }, { status: 401 });
  }
  return workspaceId;
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

async function readProgress(env: Env, workspaceId: string): Promise<Record<string, ProgressValue>> {
  const result = await env.DB.prepare(
    "SELECT section_id, learned, learned_at, reviewed, reviewed_at, planned_at, COALESCE(reviewed_planned_at, '') as reviewed_planned_at, is_current FROM progress WHERE workspace_id = ?",
  ).bind(workspaceId).all<ProgressRow>().catch(() => {
    return env.DB.prepare(
      "SELECT section_id, learned, learned_at, reviewed, reviewed_at, planned_at, '' as reviewed_planned_at, is_current FROM progress WHERE workspace_id = ?",
    ).bind(workspaceId).all<ProgressRow>().catch(() => {
      return { results: [] as ProgressRow[] };
    });
  });

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

async function writeProgress(env: Env, workspaceId: string, values: Record<string, ProgressValue>): Promise<void> {
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
    ).bind(workspaceId, sectionId, value.learned ? 1 : 0, value.learnedAt, value.reviewed ? 1 : 0, value.reviewedAt, value.plannedAt, value.reviewedPlannedAt || "", value.isCurrent ? 1 : 0));

  if (statements.length > 0) await env.DB.batch(statements);
}

function normalizePlanHistory(value: unknown): PlanHistoryEntry[] {
  return normalizePlanHistoryShared(value, isSafeSectionId);
}

async function readAppData(env: Env, workspaceId: string): Promise<AppData> {
  const [progress, stateResult] = await Promise.all([
    readProgress(env, workspaceId),
    env.DB.prepare(
      "SELECT schema_version, project_settings, plan_history, journals, papers, schedule FROM app_state WHERE workspace_id = ?",
    ).bind(workspaceId).all<AppStateRow>().catch(() => {
      return env.DB.prepare(
        "SELECT schema_version, project_settings, plan_history, journals, papers FROM app_state WHERE workspace_id = ?",
      ).bind(workspaceId).all<AppStateRow>().catch(() => {
        return env.DB.prepare(
          "SELECT schema_version, project_settings, plan_history, journals FROM app_state WHERE workspace_id = ?",
        ).bind(workspaceId).all<AppStateRow>().catch(() => {
          return env.DB.prepare(
            "SELECT schema_version, project_settings, plan_history FROM app_state WHERE workspace_id = ?",
          ).bind(workspaceId).all<AppStateRow>();
        });
      });
    }),
  ]);
  const state = stateResult.results[0];
  let parsedSettings: unknown = null;
  let parsedHistory: unknown = null;
  let parsedJournals: unknown = null;
  let parsedPapers: unknown = null;
  let parsedSchedule: unknown = null;
  try { parsedSettings = state ? JSON.parse(state.project_settings) : null; } catch { parsedSettings = null; }
  try { parsedHistory = state ? JSON.parse(state.plan_history) : null; } catch { parsedHistory = null; }
  try { parsedJournals = state?.journals ? JSON.parse(state.journals) : null; } catch { parsedJournals = null; }
  try { parsedPapers = state?.papers ? JSON.parse(state.papers) : null; } catch { parsedPapers = null; }
  try { parsedSchedule = state?.schedule ? JSON.parse(state.schedule) : null; } catch { parsedSchedule = null; }
  return {
    schemaVersion: 2,
    progress,
    projectSettings: normalizeProjectSettings(parsedSettings),
    planHistory: normalizePlanHistory(parsedHistory),
    journals: normalizeJournals(parsedJournals),
    papers: normalizePapers(parsedPapers),
    schedule: parsedSchedule,
  };
}

async function writeAppData(
  env: Env,
  workspaceId: string,
  data: AppData,
  replace: boolean,
  deletedJournalIds: string[] = [],
  deletedPaperIds: string[] = [],
): Promise<JournalEntry[]> {
  const statements: ReturnType<Env["DB"]["prepare"]>[] = [];
  if (replace) statements.push(env.DB.prepare("DELETE FROM progress WHERE workspace_id = ?").bind(workspaceId));
  Object.entries(data.progress)
    .filter(([sectionId]) => isSafeSectionId(sectionId))
    .forEach(([sectionId, value]) => {
      statements.push(env.DB.prepare(
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
      ).bind(workspaceId, sectionId, value.learned ? 1 : 0, value.learnedAt, value.reviewed ? 1 : 0, value.reviewedAt, value.plannedAt, value.reviewedPlannedAt || "", value.isCurrent ? 1 : 0));
    });

  let finalJournals = data.journals;
  let finalPapers = data.papers;
  if (!replace) {
    // Read existing journals and papers from D1 to avoid overwriting concurrently added data on other devices
    try {
      const stateRow = await env.DB.prepare(
        "SELECT journals, papers FROM app_state WHERE workspace_id = ?",
      ).bind(workspaceId).first<{ journals?: string; papers?: string }>();
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
  // mergePapers is a union-only merge, so a paper removed on the client would be
  // re-inserted from D1 unless it is dropped by tombstone here.
  if (deletedPaperIds.length > 0) {
    const deletedSet = new Set(deletedPaperIds);
    finalPapers = finalPapers.filter((p) => !deletedSet.has(p.id));
  }

  try {
    const scheduleJson = data.schedule ? JSON.stringify(data.schedule) : null;
    statements.push(env.DB.prepare(
      `INSERT INTO app_state (workspace_id, schema_version, project_settings, plan_history, journals, papers, schedule, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(workspace_id) DO UPDATE SET
         schema_version = excluded.schema_version,
         project_settings = excluded.project_settings,
         plan_history = excluded.plan_history,
         journals = excluded.journals,
         papers = excluded.papers,
         schedule = excluded.schedule,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      workspaceId,
      2,
      JSON.stringify(data.projectSettings),
      JSON.stringify(data.planHistory),
      JSON.stringify(finalJournals),
      JSON.stringify(finalPapers),
      scheduleJson,
    ));
    await env.DB.batch(statements);
  } catch {
    // If schedule column does not exist yet in D1, fallback to previous schema
    statements.pop();
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
      workspaceId,
      2,
      JSON.stringify(data.projectSettings),
      JSON.stringify(data.planHistory),
      JSON.stringify(finalJournals),
      JSON.stringify(finalPapers),
    ));
    await env.DB.batch(statements);
  }
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
    schedule: candidate.schedule,
  };
}

export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    let secret = "";
    try {
      secret = getSessionSecret(env);
    } catch {
      return json({ authenticated: false });
    }
    const workspaceId = await getSessionWorkspaceId(request, secret);
    if (!workspaceId) return json({ authenticated: false });
    try {
      return json({ authenticated: true, workspaceId, ...(await readAppData(env, workspaceId)) });
    } catch (err) {
      console.error("Session readAppData error:", err);
      return json({ error: "读取学习进度失败，请稍后重试", details: String(err) }, { status: 503 });
    }
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await request.json().catch(() => null) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const workspaceId = getWorkspaceMap(env).get(code);
    if (!code || !workspaceId) {
      return json({ error: "邀请码不正确" }, { status: 401 });
    }
    let secret = "";
    try {
      secret = getSessionSecret(env);
    } catch {
      return json({ error: "服务器会话密钥未配置 (SESSION_SECRET)" }, { status: 500 });
    }
    try {
      return json(
        { authenticated: true, workspaceId, ...(await readAppData(env, workspaceId)) },
        { headers: { "set-cookie": cookieHeader(await createSession(secret, workspaceId), request) } },
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
    const workspace = await requireWorkspace(request, env);
    if (typeof workspace !== "string") return workspace;
    try {
      return json({ progress: await readProgress(env, workspace) });
    } catch {
      return json({ error: "读取学习进度失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/app-data" && request.method === "GET") {
    const workspace = await requireWorkspace(request, env);
    if (typeof workspace !== "string") return workspace;
    try {
      return json({ workspaceId: workspace, ...(await readAppData(env, workspace)) });
    } catch {
      return json({ error: "读取应用数据失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/app-data" && request.method === "PUT") {
    const workspace = await requireWorkspace(request, env);
    if (typeof workspace !== "string") return workspace;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const data = normalizeAppDataBody(body);
    if (!data) return json({ error: "应用数据格式不正确" }, { status: 400 });
    const replace = Boolean(body && typeof body === "object" && !Array.isArray(body) && body.replace);
    const deletedJournalIds = Array.isArray(body?.deletedJournalIds)
      ? (body.deletedJournalIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    const deletedPaperIds = Array.isArray(body?.deletedPaperIds)
      ? (body.deletedPaperIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    try {
      const savedJournals = await writeAppData(env, workspace, data, replace, deletedJournalIds, deletedPaperIds);
      return json({ saved: true, journals: savedJournals });
    } catch {
      return json({ error: "保存应用数据失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/progress" && request.method === "PUT") {
    const workspace = await requireWorkspace(request, env);
    if (typeof workspace !== "string") return workspace;
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
      await writeProgress(env, workspace, values);
      return json({ saved: true });
    } catch {
      return json({ error: "保存学习进度失败，请稍后重试" }, { status: 503 });
    }
  }

  if (url.pathname === "/api/blog/publish" && request.method === "POST") {
    const workspace = await requireWorkspace(request, env);
    if (typeof workspace !== "string") return workspace;
    void workspace;
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
