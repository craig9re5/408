import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import "./helpers/fixed-length-stream.mjs";

import { handleApi } from "../worker/api.ts";
import { handlePapersApi } from "../worker/papers.ts";
import { DEFAULT_USER_QUOTA_BYTES } from "../shared/constants.ts";

function makeEnv() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).sort()) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          const statement = sqlite.prepare(sql);
          return {
            all: async () => ({ results: statement.all(...args) }),
            first: async () => statement.get(...args) ?? null,
            run: async () => ({ meta: { changes: statement.run(...args).changes } }),
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, env: { DB, INVITE_CODES: "123456:main,654321:guest", SESSION_SECRET: "test-session-secret", GITHUB_TOKEN: "test-token" } };
}

async function login(env, code, ip = "192.0.2.1") {
  return handleApi(new Request("https://example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ code }),
  }), env);
}

function dataRequest(cookie, revision, progress) {
  return new Request("https://example.test/api/app-data", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: 2,
      baseRevision: revision,
      changedProgressIds: Object.keys(progress),
      progress,
      projectSettings: {},
      planHistory: [],
      journals: [],
      papers: [],
      schedule: null,
    }),
  });
}

test("cloud journal patches retain independent offline IDs and legacy IDs", async () => {
  const { sqlite, env } = makeEnv();
  try {
    const response = await login(env, "123456");
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const ids = ["20261012001", `20261013001-${crypto.randomUUID()}`, `20261013001-${crypto.randomUUID()}`];
    for (let i = 0; i < ids.length; i++) {
      const saved = await handleApi(new Request("https://example.test/api/app-data", {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: i, progressChanges: {}, journalChanges: [{
          id: ids[i], content: `日志 ${i}`, createdAt: "2026-10-13T10:00:00Z", updatedAt: "2026-10-13T10:00:00Z",
        }], deletedJournalIds: [], paperChanges: [], deletedPaperIds: [] }),
      }), env);
      assert.equal(saved.status, 200);
    }
    const loaded = await handleApi(new Request("https://example.test/api/app-data", { headers: { cookie } }), env);
    const data = await loaded.json();
    assert.deepEqual(new Set(data.journals.map((j) => j.id)), new Set(ids));
  } finally { sqlite.close(); }
});

test("versioned writes reject stale clients without overwriting progress", async () => {
  const { sqlite, env } = makeEnv();
  try {
    const response = await login(env, "123456");
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const progress = { "test-section": { learned: true, learnedAt: "2026-09-23", reviewed: false, reviewedAt: "", plannedAt: "", reviewedPlannedAt: "", isCurrent: false } };
    const saved = await handleApi(dataRequest(cookie, 0, progress), env);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).revision, 1);

    const patched = await handleApi(new Request("https://example.test/api/app-data", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        baseRevision: 1,
        progressChanges: { "another-section": { ...progress["test-section"], plannedAt: "2026-09-24" } },
        journalChanges: [],
        deletedJournalIds: [],
        paperChanges: [],
        deletedPaperIds: [],
      }),
    }), env);
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).revision, 2);

    const stale = await handleApi(dataRequest(cookie, 0, {}), env);
    assert.equal(stale.status, 409);
    const latest = await stale.json();
    assert.equal(latest.revision, 2);
    assert.equal(latest.progress["test-section"].learned, true);
    assert.equal(latest.progress["another-section"].plannedAt, "2026-09-24");
    const row = sqlite.prepare("SELECT learned FROM progress WHERE section_id = 'test-section'").get();
    assert.equal(row.learned, 1);
  } finally {
    sqlite.close();
  }
});

test("server retains chapter reviews for historically learned sections without dates", async () => {
  const { sqlite, env } = makeEnv();
  try {
    const response = await login(env, "123456");
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const progress = { "legacy-section": {
      learned: true, learnedAt: "", reviewed: true, reviewedAt: "2026-09-28",
      plannedAt: "", reviewedPlannedAt: "", isCurrent: false,
    } };
    const saved = await handleApi(dataRequest(cookie, 0, progress), env);
    assert.equal(saved.status, 200);
    const loaded = await handleApi(new Request("https://example.test/api/app-data", { headers: { cookie } }), env);
    assert.equal(loaded.status, 200);
    assert.deepEqual((await loaded.json()).progress["legacy-section"], progress["legacy-section"]);
  } finally {
    sqlite.close();
  }
});

test("guest workspace cannot publish and repeated login attempts are throttled", async () => {
  const { sqlite, env } = makeEnv();
  try {
    const guest = await login(env, "654321", "192.0.2.2");
    assert.equal(guest.status, 200);
    const cookie = guest.headers.get("set-cookie").split(";")[0];
    const publish = await handleApi(new Request("https://example.test/api/blog/publish", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "title", slug: "slug", content: "body" }),
    }), env);
    assert.equal(publish.status, 403);

    for (let attempt = 0; attempt < 10; attempt++) {
      assert.equal((await login(env, "000000", "192.0.2.3")).status, 401);
    }
    assert.equal((await login(env, "123456", "192.0.2.3")).status, 429);
  } finally {
    sqlite.close();
  }
});

test("progress query failure returns an error instead of an empty workspace", async () => {
  const { sqlite, env } = makeEnv();
  try {
    const loginResponse = await login(env, "123456");
    const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
    const originalPrepare = env.DB.prepare;
    env.DB.prepare = (sql) => {
      if (sql.includes("FROM progress")) throw new Error("D1 unavailable");
      return originalPrepare(sql);
    };
    const response = await handleApi(new Request("https://example.test/api/app-data", { headers: { cookie } }), env);
    assert.equal(response.status, 503);
  } finally {
    sqlite.close();
  }
});

test("corrupt stored JSON fails closed instead of replacing journals with an empty list", async () => {
  const { sqlite, env } = makeEnv();
  try {
    sqlite.prepare("UPDATE app_state SET journals = '{broken' WHERE workspace_id = 'main'").run();
    const loginResponse = await login(env, "123456");
    assert.equal(loginResponse.status, 503);
  } finally {
    sqlite.close();
  }
});

test("cross-origin mutations are rejected before authentication or body parsing", async () => {
  const { sqlite, env } = makeEnv();
  try {
    const response = await handleApi(new Request("https://example.test/api/auth/login", {
      method: "POST",
      headers: { origin: "https://untrusted.example", "content-type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    }), env);
    assert.equal(response.status, 403);
  } finally {
    sqlite.close();
  }
});

test("concurrent paper uploads cannot exceed the workspace quota", async () => {
  const { sqlite, env } = makeEnv();
  const objects = new Map();
  env.PAPERS_BUCKET = {
    async put(key, stream) { objects.set(key, new Uint8Array(await new Response(stream).arrayBuffer())); },
    async delete(key) { objects.delete(key); },
  };
  try {
    const file = new File(["%PDF-1.4\nhello"], "paper.pdf", { type: "application/pdf" });
    sqlite.prepare("INSERT INTO paper_quota (workspace_id, used_bytes) VALUES ('main', ?)")
      .run(DEFAULT_USER_QUOTA_BYTES - file.size);
    const request = () => new Request("https://example.test/api/papers/upload", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-file-name": "paper.pdf", "x-file-size": String(file.size) },
      body: file,
    });
    const responses = await Promise.all([
      handlePapersApi(request(), env, "main"),
      handlePapersApi(request(), env, "main"),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    assert.equal(sqlite.prepare("SELECT used_bytes FROM paper_quota WHERE workspace_id = 'main'").get().used_bytes, DEFAULT_USER_QUOTA_BYTES);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM exam_papers WHERE workspace_id = 'main'").get().count, 1);
    assert.equal(objects.size, 1);
  } finally {
    sqlite.close();
  }
});

test("paper deletion survives R2 failure and releases quota on retry", async () => {
  const { sqlite, env } = makeEnv();
  const objects = new Set(["papers/main/a.pdf", "papers/main/b.pdf"]);
  let failDelete = true;
  env.PAPERS_BUCKET = {
    async delete(key) {
      if (failDelete) throw new Error("R2 unavailable");
      objects.delete(key);
    },
  };
  try {
    const insertPaper = sqlite.prepare(
      "INSERT INTO exam_papers (id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at) VALUES (?, 'main', 'paper.pdf', 'paper.pdf', ?, ?, 'math', NULL, 1, 1)",
    );
    insertPaper.run("a", 100, "papers/main/a.pdf");
    insertPaper.run("b", 200, "papers/main/b.pdf");
    sqlite.prepare("INSERT INTO paper_quota (workspace_id, used_bytes) VALUES ('main', 300)").run();

    const response = await handlePapersApi(new Request("https://example.test/api/papers/batch-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["a", "b"] }),
    }), env, "main");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).cleanupPending, true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM exam_papers").get().count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pending_paper_deletions").get().count, 2);
    assert.equal(sqlite.prepare("SELECT used_bytes FROM paper_quota WHERE workspace_id = 'main'").get().used_bytes, 300);

    failDelete = false;
    const listed = await handlePapersApi(new Request("https://example.test/api/papers"), env, "main");
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).quota.usedBytes, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pending_paper_deletions").get().count, 0);
    assert.equal(objects.size, 0);
  } finally {
    sqlite.close();
  }
});
