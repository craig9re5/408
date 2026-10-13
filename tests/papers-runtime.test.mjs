import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test("real Cloudflare R2 accepts validated PDF streams and downloads identical bytes", async () => {
  const bundled = await build({
    stdin: { contents: 'import { handlePapersApi } from "./worker/papers.ts"; export default { fetch(request, env) { return handlePapersApi(request, env, "runtime-test"); } };', resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "browser", target: "es2022",
  });
  const mf = new Miniflare({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: "2026-05-22",
    d1Databases: ["DB"], r2Buckets: ["PAPERS_BUCKET"],
  });
  try {
    const db = await mf.getD1Database("DB");
    for (const file of readdirSync(new URL("../migrations/", import.meta.url)).sort()) {
      const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
      // D1 exec executes one statement per line; the migration source spans lines.
      for (const statement of sql.split(";").filter((value) => value.trim())) {
        await db.prepare(statement).run();
      }
    }
    const bytes = new TextEncoder().encode("%PDF-1.4\n" + "中文文件名和分块上传验证\n".repeat(15000));
    const upload = await mf.dispatchFetch("http://test/api/papers/upload", {
      method: "POST", headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent("数学一·测试试卷.pdf"), "x-file-size": String(bytes.byteLength), "x-paper-subject": "math" }, body: bytes,
    });
    assert.equal(upload.status, 200, await upload.clone().text());
    const { item } = await upload.json();
    const list = await (await mf.dispatchFetch("http://test/api/papers")).json();
    assert.equal(list.items[0].fileName, "数学一·测试试卷.pdf");
    assert.equal(list.quota.usedBytes, bytes.byteLength);
    const download = await mf.dispatchFetch(`http://test/api/papers/${item.id}/download`);
    assert.equal(download.status, 200);
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
    const remove = await mf.dispatchFetch(`http://test/api/papers/${item.id}`, {method: "DELETE"});
    assert.equal(remove.status, 200);
    const cleaned = await (await mf.dispatchFetch("http://test/api/papers")).json();
    assert.equal(cleaned.items.length, 0);
    assert.equal(cleaned.quota.usedBytes, 0);
  } finally { await mf.dispose(); }
});
