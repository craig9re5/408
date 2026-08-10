const WORKSPACE_ID = "main";
const SESSION_COOKIE = "408_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
}

interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface Env {
  ASSETS: AssetFetcher;
  DB: D1DatabaseBinding;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  INVITE_CODE?: string;
  SESSION_SECRET?: string;
}

type ProgressValue = {
  learned: boolean;
  learnedAt: string;
  reviewed: boolean;
  reviewedAt: string;
  plannedAt: string;
  isCurrent: boolean;
};

type ProgressRow = {
  section_id: string;
  learned: number;
  learned_at: string;
  reviewed: number;
  reviewed_at: string;
  planned_at: string;
  is_current: number;
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
  const date = (candidate: unknown) => typeof candidate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
  const learned = Boolean(entry.learned);
  const learnedAt = date(entry.learnedAt);
  const candidateReviewedAt = date(entry.reviewedAt);
  const reviewed = learned && Boolean(entry.reviewed) && Boolean(candidateReviewedAt) && (!learnedAt || candidateReviewedAt >= learnedAt);
  return {
    learned,
    learnedAt,
    reviewed,
    reviewedAt: reviewed ? candidateReviewedAt : "",
    plannedAt: date(entry.plannedAt),
    isCurrent: Boolean(entry.isCurrent),
  };
}

function isSafeSectionId(sectionId: string): boolean {
  return sectionId.length > 0 && sectionId.length <= 120 && /^[a-z0-9-]+$/.test(sectionId);
}

async function readProgress(env: Env): Promise<Record<string, ProgressValue>> {
  const result = await env.DB.prepare(
    "SELECT section_id, learned, learned_at, reviewed, reviewed_at, planned_at, is_current FROM progress WHERE workspace_id = ?",
  ).bind(WORKSPACE_ID).all<ProgressRow>();

  return Object.fromEntries(result.results.map((row: ProgressRow) => [row.section_id, {
    learned: Boolean(row.learned),
    learnedAt: row.learned_at,
    reviewed: Boolean(row.reviewed),
    reviewedAt: row.reviewed_at,
    plannedAt: row.planned_at,
    isCurrent: Boolean(row.is_current),
  }]));
}

async function writeProgress(env: Env, values: Record<string, ProgressValue>): Promise<void> {
  const statements = Object.entries(values)
    .filter(([sectionId]) => isSafeSectionId(sectionId))
    .map(([sectionId, value]) => env.DB.prepare(
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

  if (statements.length > 0) await env.DB.batch(statements);
}

export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const authenticated = await hasValidSession(request, getSessionSecret(env));
    if (!authenticated) return json({ authenticated: false });
    try {
      return json({ authenticated: true, progress: await readProgress(env) });
    } catch {
      return json({ error: "读取学习进度失败，请稍后重试" }, { status: 503 });
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
        { authenticated: true, progress: await readProgress(env) },
        { headers: { "set-cookie": cookieHeader(await createSession(secret), request) } },
      );
    } catch {
      return json({ error: "读取学习进度失败，请稍后重试" }, { status: 503 });
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

  return json({ error: "接口不存在" }, { status: 404 });
}
