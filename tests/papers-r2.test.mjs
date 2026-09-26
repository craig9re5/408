import assert from "node:assert/strict";
import test from "node:test";

import { handlePapersApi } from "../worker/papers.ts";
import { DEFAULT_USER_QUOTA_BYTES } from "../shared/constants.ts";

function makeEnvironment() {
  const rows = new Map();
  const objects = new Map();
  const quotas = new Map();
  const pending = new Map();
  const flags = { failInsert: false, failDelete: false, failBatch: false };
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM pending_paper_deletions")) {
                return [...pending.values()].find((row) => row.workspace_id === args[0]) ?? null;
              }
              if (sql.includes("FROM paper_quota")) {
                return { used_bytes: quotas.get(args[0]) ?? 0 };
              }
              if (sql.includes("id = ?")) {
                const row = rows.get(args[1]);
                return row?.workspace_id === args[0] ? row : null;
              }
              throw new Error(`Unexpected first query: ${sql}`);
            },
            async all() {
              if (sql.includes("FROM pending_paper_deletions")) {
                return { results: [...pending.values()].filter((row) => row.workspace_id === args[0]).slice(0, args[1]) };
              }
              if (sql.includes("SELECT storage_key")) {
                return { results: [...rows.values()].filter((row) => row.workspace_id === args[0] && args.slice(1).includes(row.id)) };
              }
              return { results: [...rows.values()].filter((row) => row.workspace_id === args[0]) };
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO paper_quota")) {
                if (!quotas.has(args[0])) quotas.set(args[0], 0);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE paper_quota") && sql.includes("used_bytes +")) {
                const used = quotas.get(args[1]) ?? 0;
                if (used + args[0] > args[3]) return { meta: { changes: 0 } };
                quotas.set(args[1], used + args[0]);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE paper_quota")) {
                if (sql.includes("EXISTS") && !pending.has(args[2])) return { meta: { changes: 0 } };
                quotas.set(args[1], Math.max(0, (quotas.get(args[1]) ?? 0) - args[0]));
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT OR IGNORE INTO pending_paper_deletions")) {
                for (const row of rows.values()) {
                  if (row.workspace_id === args[1] && args.slice(2).includes(row.id) && !pending.has(row.storage_key)) {
                    pending.set(row.storage_key, { storage_key: row.storage_key, workspace_id: row.workspace_id, file_size: row.file_size });
                  }
                }
                return { meta: { changes: 1 } };
              }
              if (sql.includes("DELETE FROM pending_paper_deletions")) {
                pending.delete(args[0]);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO exam_papers")) {
                if (flags.failInsert) throw new Error("D1 unavailable");
                const [id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at] = args;
                rows.set(id, { id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at });
              } else if (sql.includes("DELETE FROM exam_papers")) {
                for (const id of args.slice(1)) rows.delete(id);
              } else {
                throw new Error(`Unexpected run query: ${sql}`);
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements) {
      if (flags.failBatch) throw new Error("D1 unavailable");
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  const PAPERS_BUCKET = {
    async put(key, stream) {
      objects.set(key, new Uint8Array(await new Response(stream).arrayBuffer()));
    },
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        body: new Blob([bytes]).stream(),
        httpEtag: '"test"',
        writeHttpMetadata() {},
      };
    },
    async delete(key) {
      if (flags.failDelete) throw new Error("R2 unavailable");
      objects.delete(key);
    },
  };
  return { env: { DB, PAPERS_BUCKET }, rows, objects, quotas, pending, flags };
}

function uploadRequest(name = "sample.pdf", content = "%PDF-1.4\nhello", declaredSize) {
  const file = new File([content], name, { type: "application/pdf" });
  return new Request("https://example.test/api/papers/upload", {
    method: "POST",
    headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(name), "x-file-size": String(declaredSize ?? file.size), "x-paper-subject": "math" },
    body: file,
  });
}

test("R2 upload, workspace-scoped list, download, and delete", async () => {
  const { env, rows, objects, quotas } = makeEnvironment();
  const upload = await handlePapersApi(uploadRequest(), env, "main");
  assert.equal(upload.status, 200);
  const { item } = await upload.json();
  assert.equal(item.subject, "math");
  assert.equal(rows.size, 1);
  assert.equal(objects.size, 1);
  assert.equal(quotas.get("main"), item.fileSize);

  const list = await handlePapersApi(new Request("https://example.test/api/papers"), env, "main");
  const listed = await list.json();
  assert.equal(listed.workspaceId, "main");
  assert.equal(listed.items.length, 1);
  assert.equal(listed.quota.usedBytes, item.fileSize);

  const otherList = await handlePapersApi(new Request("https://example.test/api/papers"), env, "other");
  assert.equal((await otherList.json()).items.length, 0);

  const download = await handlePapersApi(new Request(`https://example.test/api/papers/${item.id}/download`), env, "main");
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "%PDF-1.4\nhello");

  const otherDownload = await handlePapersApi(new Request(`https://example.test/api/papers/${item.id}/download`), env, "other");
  assert.equal(otherDownload.status, 404);

  const deletion = await handlePapersApi(new Request(`https://example.test/api/papers/${item.id}`, { method: "DELETE" }), env, "main");
  assert.equal(deletion.status, 200);
  assert.equal(rows.size, 0);
  assert.equal(objects.size, 0);
  assert.equal(quotas.get("main"), 0);
});

test("missing R2 binding rejects upload and D1 failure cleans uploaded object", async () => {
  const { env, objects, quotas, flags } = makeEnvironment();
  const missing = await handlePapersApi(uploadRequest(), { DB: env.DB }, "main");
  assert.equal(missing.status, 503);

  flags.failInsert = true;
  const failed = await handlePapersApi(uploadRequest(), env, "main");
  assert.equal(failed.status, 500);
  assert.equal(objects.size, 0);
  assert.equal(quotas.get("main"), 0);
});

test("R2 deletion failure keeps a retryable queue and reserved quota", async () => {
  const { env, rows, objects, quotas, pending, flags } = makeEnvironment();
  const upload = await handlePapersApi(uploadRequest(), env, "main");
  const { item } = await upload.json();
  flags.failDelete = true;
  const deletion = await handlePapersApi(new Request(`https://example.test/api/papers/${item.id}`, { method: "DELETE" }), env, "main");
  assert.equal(deletion.status, 200);
  assert.equal((await deletion.json()).cleanupPending, true);
  assert.equal(rows.size, 0);
  assert.equal(objects.size, 1);
  assert.equal(pending.size, 1);
  assert.equal(quotas.get("main"), item.fileSize);

  flags.failDelete = false;
  await handlePapersApi(new Request("https://example.test/api/papers"), env, "main");
  assert.equal(objects.size, 0);
  assert.equal(pending.size, 0);
  assert.equal(quotas.get("main"), 0);
});

test("D1 deletion failure leaves the R2 object available", async () => {
  const { env, rows, objects, flags } = makeEnvironment();
  const upload = await handlePapersApi(uploadRequest(), env, "main");
  const { item } = await upload.json();
  flags.failBatch = true;
  const deletion = await handlePapersApi(new Request(`https://example.test/api/papers/${item.id}`, { method: "DELETE" }), env, "main");
  assert.equal(deletion.status, 500);
  assert.equal(rows.size, 1);
  assert.equal(objects.size, 1);
});

test("stream validation rejects disguised and mis-sized files and releases quota", async () => {
  const { env, objects, quotas } = makeEnvironment();
  assert.equal((await handlePapersApi(uploadRequest("fake.pdf", "<html>bad</html>"), env, "main")).status, 400);
  assert.equal((await handlePapersApi(uploadRequest("short.pdf", "%PDF-1.4", 6), env, "main")).status, 400);
  assert.equal(objects.size, 0);
  assert.equal(quotas.get("main"), 0);
});

test("quota reservation rejects an upload that would exceed the workspace limit", async () => {
  const { env, objects, quotas } = makeEnvironment();
  quotas.set("main", DEFAULT_USER_QUOTA_BYTES - 1);
  const response = await handlePapersApi(uploadRequest(), env, "main");
  assert.equal(response.status, 400);
  assert.equal(objects.size, 0);
  assert.equal(quotas.get("main"), DEFAULT_USER_QUOTA_BYTES - 1);
});
