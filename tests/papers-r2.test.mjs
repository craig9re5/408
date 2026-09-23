import assert from "node:assert/strict";
import test from "node:test";

import { handlePapersApi } from "../worker/papers.ts";

function makeEnvironment() {
  const rows = new Map();
  const objects = new Map();
  const flags = { failInsert: false, failDelete: false };
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("SUM(file_size)")) {
                return { used_bytes: [...rows.values()].filter((row) => row.workspace_id === args[0]).reduce((sum, row) => sum + row.file_size, 0) };
              }
              if (sql.includes("id = ?")) {
                const row = rows.get(args[1]);
                return row?.workspace_id === args[0] ? row : null;
              }
              throw new Error(`Unexpected first query: ${sql}`);
            },
            async all() {
              if (sql.includes("SELECT storage_key")) {
                return { results: [...rows.values()].filter((row) => row.workspace_id === args[0] && args.slice(1).includes(row.id)) };
              }
              return { results: [...rows.values()].filter((row) => row.workspace_id === args[0]) };
            },
            async run() {
              if (sql.includes("INSERT INTO exam_papers")) {
                if (flags.failInsert) throw new Error("D1 unavailable");
                const [id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at] = args;
                rows.set(id, { id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at });
              } else if (sql.includes("DELETE FROM exam_papers")) {
                for (const id of args.slice(1)) rows.delete(id);
              } else {
                throw new Error(`Unexpected run query: ${sql}`);
              }
            },
          };
        },
      };
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
  return { env: { DB, PAPERS_BUCKET }, rows, objects, flags };
}

function uploadRequest(name = "sample.pdf") {
  const form = new FormData();
  form.append("file", new File(["%PDF-1.4\nhello"], name, { type: "application/pdf" }));
  form.append("subject", "math");
  return new Request("https://example.test/api/papers/upload", { method: "POST", body: form });
}

test("R2 upload, workspace-scoped list, download, and delete", async () => {
  const { env, rows, objects } = makeEnvironment();
  const upload = await handlePapersApi(uploadRequest(), env, "main");
  assert.equal(upload.status, 200);
  const { item } = await upload.json();
  assert.equal(item.subject, "math");
  assert.equal(rows.size, 1);
  assert.equal(objects.size, 1);

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
});

test("missing R2 binding rejects upload and D1 failure cleans uploaded object", async () => {
  const { env, objects, flags } = makeEnvironment();
  const missing = await handlePapersApi(uploadRequest(), { DB: env.DB }, "main");
  assert.equal(missing.status, 503);

  flags.failInsert = true;
  const failed = await handlePapersApi(uploadRequest(), env, "main");
  assert.equal(failed.status, 500);
  assert.equal(objects.size, 0);
});

test("R2 deletion failure keeps D1 metadata", async () => {
  const { env, rows, flags } = makeEnvironment();
  const upload = await handlePapersApi(uploadRequest(), env, "main");
  const { item } = await upload.json();
  flags.failDelete = true;
  const deletion = await handlePapersApi(new Request(`https://example.test/api/papers/${item.id}`, { method: "DELETE" }), env, "main");
  assert.equal(deletion.status, 500);
  assert.equal(rows.size, 1);
});
