import type { ExamPaperItem, ExamPaperSubject } from "../shared/types.ts";
import { DEFAULT_USER_QUOTA_BYTES, MAX_PAPER_FILE_SIZE } from "../shared/constants.ts";
import { readJsonBody } from "./request.ts";

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

type ExamPaperRow = {
  id: string;
  workspace_id: string;
  file_name: string;
  original_name: string;
  file_size: number;
  storage_key: string;
  subject: string;
  year: number | null;
  created_at: number;
  updated_at: number;
};

function rowToItem(row: ExamPaperRow): ExamPaperItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fileName: row.file_name,
    originalName: row.original_name,
    fileSize: row.file_size,
    storageKey: row.storage_key,
    subject: (row.subject as ExamPaperSubject) || "other",
    year: row.year ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeFileName(name: string): string {
  let cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (cleaned.toLowerCase().endsWith(".pdf")) {
    cleaned = cleaned.slice(0, -4) + ".pdf";
  } else {
    cleaned += ".pdf";
  }
  return cleaned;
}

class UploadValidationError extends Error {}

async function reserveQuota(env: Env, workspaceId: string, bytes: number): Promise<boolean> {
  await env.DB.prepare("INSERT OR IGNORE INTO paper_quota (workspace_id, used_bytes) VALUES (?, 0)").bind(workspaceId).run();
  const result = await env.DB.prepare(
    "UPDATE paper_quota SET used_bytes = used_bytes + ? WHERE workspace_id = ? AND used_bytes + ? <= ?",
  ).bind(bytes, workspaceId, bytes, DEFAULT_USER_QUOTA_BYTES).run();
  return result.meta.changes === 1;
}

async function releaseQuota(env: Env, workspaceId: string, bytes: number): Promise<void> {
  await env.DB.prepare("UPDATE paper_quota SET used_bytes = MAX(0, used_bytes - ?) WHERE workspace_id = ?")
    .bind(bytes, workspaceId).run();
}

type PendingDeletion = { storage_key: string; file_size: number };

async function cleanPendingDeletions(env: Env, workspaceId: string, limit = 25): Promise<number> {
  if (!env.PAPERS_BUCKET) return 0;
  const pending = await env.DB.prepare(
    "SELECT storage_key, file_size FROM pending_paper_deletions WHERE workspace_id = ? ORDER BY created_at LIMIT ?",
  ).bind(workspaceId, limit).all<PendingDeletion>();
  for (const row of pending.results) {
    try {
      await env.PAPERS_BUCKET.delete(row.storage_key);
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE paper_quota SET used_bytes = MAX(0, used_bytes - ?) WHERE workspace_id = ? AND EXISTS (SELECT 1 FROM pending_paper_deletions WHERE storage_key = ?)",
        ).bind(row.file_size, workspaceId, row.storage_key),
        env.DB.prepare("DELETE FROM pending_paper_deletions WHERE storage_key = ?").bind(row.storage_key),
      ]);
    } catch (error) {
      console.error("Pending paper cleanup failed:", error);
    }
  }
  const next = await env.DB.prepare("SELECT storage_key FROM pending_paper_deletions WHERE workspace_id = ? LIMIT 1")
    .bind(workspaceId).first<{ storage_key: string }>();
  return next ? 1 : 0;
}

export async function handlePapersApi(request: Request, env: Env, workspaceId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. GET /api/papers - List papers & get quota
  if (path === "/api/papers" && request.method === "GET") {
    const subject = url.searchParams.get("subject")?.trim();
    const keyword = url.searchParams.get("keyword")?.trim().toLowerCase().slice(0, 100);

    let query = "SELECT id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at FROM exam_papers WHERE workspace_id = ?";
    const bindings: (string | number)[] = [workspaceId];

    if (subject && subject !== "all") {
      query += " AND subject = ?";
      bindings.push(subject);
    }
    if (keyword) {
      query += " AND LOWER(file_name) LIKE ?";
      bindings.push(`%${keyword}%`);
    }
    query += " ORDER BY created_at DESC";

    try {
      await cleanPendingDeletions(env, workspaceId).catch((error: unknown) =>
        console.error("Pending paper cleanup query failed:", error));
      const [listResult, quotaResult] = await Promise.all([
        env.DB.prepare(query).bind(...bindings).all<ExamPaperRow>(),
        env.DB.prepare("SELECT used_bytes FROM paper_quota WHERE workspace_id = ?").bind(workspaceId).first<{ used_bytes: number }>(),
      ]);

      const items = (listResult.results ?? []).map(rowToItem);
      const usedBytes = quotaResult?.used_bytes ?? 0;

      return json({
        items,
        workspaceId,
        quota: {
          usedBytes,
          totalBytes: DEFAULT_USER_QUOTA_BYTES,
        },
        cloudStorageReady: Boolean(env.PAPERS_BUCKET),
      });
    } catch (err) {
      console.error("List papers error:", err);
      return json({ error: "获取试卷列表失败" }, { status: 500 });
    }
  }

  // 2. POST /api/papers/upload - Upload single PDF
  if (path === "/api/papers/upload" && request.method === "POST") {
    let reservedBytes = 0;
    let storageKey = "";
    try {
      if (!env.PAPERS_BUCKET) {
        return json({ error: "云端对象存储桶未就绪，请检查 PAPERS_BUCKET 绑定" }, { status: 503 });
      }
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf" || !request.body) {
        throw new UploadValidationError("仅支持直接上传 PDF 文件");
      }
      let originalName = "";
      try { originalName = decodeURIComponent(request.headers.get("x-file-name") ?? ""); }
      catch { throw new UploadValidationError("文件名编码无效"); }
      if (!originalName.toLowerCase().endsWith(".pdf") || originalName.length > 255) {
        throw new UploadValidationError("文件名必须以 .pdf 结尾且不超过 255 字符");
      }
      const fileSize = Number(request.headers.get("x-file-size"));
      const contentLength = request.headers.get("content-length");
      if (!Number.isSafeInteger(fileSize) || fileSize < 5 || fileSize > MAX_PAPER_FILE_SIZE
        || (contentLength !== null && Number(contentLength) !== fileSize)) {
        throw new UploadValidationError("文件大小无效或超过 100MB 上限");
      }
      const rawSubject = request.headers.get("x-paper-subject") ?? "other";
      if (!["cs408", "math", "english", "politics", "other"].includes(rawSubject)) {
        throw new UploadValidationError("试卷科目无效");
      }
      const yearHeader = request.headers.get("x-paper-year");
      const year = yearHeader === null ? null : Number(yearHeader);
      if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
        throw new UploadValidationError("试卷年份无效");
      }

      if (!await reserveQuota(env, workspaceId, fileSize)) {
        return json({ error: "云盘存储容量已满（最大 1GB），请清理不需要的试卷后再上传" }, { status: 400 });
      }
      reservedBytes = fileSize;

      const paperId = crypto.randomUUID();
      storageKey = `papers/${workspaceId}/${paperId}.pdf`;
      const cleanName = sanitizeFileName(originalName);

      let receivedBytes = 0;
      const signature: number[] = [];
      const boundedStream = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          receivedBytes += chunk.byteLength;
          if (receivedBytes > fileSize || receivedBytes > MAX_PAPER_FILE_SIZE) {
            throw new UploadValidationError("实际文件大小与声明不符");
          }
          for (const byte of chunk) {
            if (signature.length < 5) signature.push(byte);
            else break;
          }
          if (signature.length === 5 && String.fromCharCode(...signature) !== "%PDF-") {
            throw new UploadValidationError("文件内容不是 PDF");
          }
          controller.enqueue(chunk);
        },
      }));

      await env.PAPERS_BUCKET.put(storageKey, boundedStream, {
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: `attachment; filename="${encodeURIComponent(cleanName)}"`,
        },
        customMetadata: {
          originalName,
          workspaceId,
        },
      });
      if (receivedBytes !== fileSize || signature.length !== 5) {
        throw new UploadValidationError("实际文件大小与声明不符");
      }

      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO exam_papers (id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(paperId, workspaceId, cleanName, originalName, fileSize, storageKey, rawSubject, year, now, now).run();
      reservedBytes = 0;

      const newItem: ExamPaperItem = {
        id: paperId,
        workspaceId,
        fileName: cleanName,
        originalName,
        fileSize,
        storageKey,
        subject: (rawSubject as ExamPaperSubject) || "other",
        year: year ?? undefined,
        createdAt: now,
        updatedAt: now,
      };

      return json({ success: true, item: newItem });
    } catch (err) {
      if (storageKey && env.PAPERS_BUCKET) {
        await env.PAPERS_BUCKET.delete(storageKey).catch((cleanupError: unknown) =>
          console.error("Failed to clean up uploaded paper:", cleanupError));
      }
      if (reservedBytes) await releaseQuota(env, workspaceId, reservedBytes).catch((cleanupError: unknown) =>
        console.error("Failed to release reserved quota:", cleanupError));
      console.error("Upload paper error:", err);
      return json({ error: err instanceof UploadValidationError ? err.message : "上传试卷失败" }, { status: err instanceof UploadValidationError ? 400 : 500 });
    }
  }

  // 3. GET /api/papers/:id/download - Stream / Download PDF
  const downloadMatch = path.match(/^\/api\/papers\/([a-zA-Z0-9_-]+)\/download$/);
  if (downloadMatch && request.method === "GET") {
    const paperId = downloadMatch[1];
    try {
      const row = await env.DB.prepare(
        "SELECT id, file_name, file_size, storage_key FROM exam_papers WHERE workspace_id = ? AND id = ?",
      ).bind(workspaceId, paperId).first<ExamPaperRow>();

      if (!row) {
        return json({ error: "试卷不存在或已被删除" }, { status: 404 });
      }

      if (!env.PAPERS_BUCKET) {
        return json({ error: "未配置云存储桶 (PAPERS_BUCKET)" }, { status: 500 });
      }

      const object = await env.PAPERS_BUCKET.get(row.storage_key);
      if (!object) {
        return json({ error: "云端未找到对应试卷文件" }, { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("content-type", "application/pdf");

      const encoded = encodeURIComponent(row.file_name);
      headers.set("content-disposition", `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);

      return new Response(object.body, { headers });
    } catch (err) {
      console.error("Download paper error:", err);
      return json({ error: "下载试卷失败" }, { status: 500 });
    }
  }

  // 4. PATCH /api/papers/:id - Rename or update subject
  const updateMatch = path.match(/^\/api\/papers\/([a-zA-Z0-9_-]+)$/);
  if (updateMatch && request.method === "PATCH") {
    const paperId = updateMatch[1];
    try {
      const body = await readJsonBody(request, 4096).catch(() => null) as {
        fileName?: string;
        subject?: string;
        year?: number | null;
      } | null;

      if (!body) {
        return json({ error: "无效的修改请求" }, { status: 400 });
      }
      if (body.fileName !== undefined && (typeof body.fileName !== "string" || !body.fileName.trim() || body.fileName.length > 255)) {
        return json({ error: "文件名无效" }, { status: 400 });
      }
      if (body.subject !== undefined && !["cs408", "math", "english", "politics", "other"].includes(body.subject)) {
        return json({ error: "试卷科目无效" }, { status: 400 });
      }
      if (body.year !== undefined && body.year !== null
        && (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100)) {
        return json({ error: "试卷年份无效" }, { status: 400 });
      }

      const existing = await env.DB.prepare(
        "SELECT id, file_name, subject, year FROM exam_papers WHERE workspace_id = ? AND id = ?",
      ).bind(workspaceId, paperId).first<ExamPaperRow>();

      if (!existing) {
        return json({ error: "试卷不存在" }, { status: 404 });
      }

      const newFileName = typeof body.fileName === "string" ? sanitizeFileName(body.fileName) : existing.file_name;
      const newSubject = typeof body.subject === "string" ? body.subject : existing.subject;
      const newYear = typeof body.year !== "undefined" ? body.year : existing.year;
      const now = Date.now();

      await env.DB.prepare(
        `UPDATE exam_papers
         SET file_name = ?, subject = ?, year = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?`,
      ).bind(newFileName, newSubject, newYear, now, workspaceId, paperId).run();

      return json({
        success: true,
        item: {
          id: paperId,
          fileName: newFileName,
          subject: newSubject,
          year: newYear,
          updatedAt: now,
        },
      });
    } catch (err) {
      console.error("Update paper error:", err);
      return json({ error: "修改试卷信息失败" }, { status: 500 });
    }
  }

  // 5. DELETE /api/papers/:id - Delete single paper
  if (updateMatch && request.method === "DELETE") {
    const paperId = updateMatch[1];
    try {
      const row = await env.DB.prepare(
        "SELECT storage_key, file_size FROM exam_papers WHERE workspace_id = ? AND id = ?",
      ).bind(workspaceId, paperId).first<PendingDeletion>();

      if (row) {
        if (!env.PAPERS_BUCKET) return json({ error: "云端对象存储桶未就绪" }, { status: 503 });
        await env.DB.batch([
          env.DB.prepare(
            "INSERT OR IGNORE INTO pending_paper_deletions (storage_key, workspace_id, file_size, created_at) SELECT storage_key, workspace_id, file_size, ? FROM exam_papers WHERE workspace_id = ? AND id = ?",
          ).bind(Date.now(), workspaceId, paperId),
          env.DB.prepare("DELETE FROM exam_papers WHERE workspace_id = ? AND id = ?").bind(workspaceId, paperId),
        ]);
      }

      const cleanupPending = await cleanPendingDeletions(env, workspaceId).then((count) => count > 0).catch((error: unknown) => {
        console.error("Pending paper cleanup query failed:", error);
        return true;
      });
      return json({ success: true, id: paperId, cleanupPending });
    } catch (err) {
      console.error("Delete paper error:", err);
      return json({ error: "删除试卷失败" }, { status: 500 });
    }
  }

  // 6. POST /api/papers/batch-delete - Delete multiple papers
  if (path === "/api/papers/batch-delete" && request.method === "POST") {
    try {
      const body = await readJsonBody(request, 32 * 1024).catch(() => null) as { ids?: string[] } | null;
      const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id)))] : [];

      if (ids.length === 0) {
        return json({ error: "请选择要删除的试卷" }, { status: 400 });
      }
      if (ids.length > 100) return json({ error: "单次最多删除 100 份试卷" }, { status: 400 });

      // Fetch storage keys for R2 deletion
      const placeholders = ids.map(() => "?").join(",");
      const rows = await env.DB.prepare(
        `SELECT storage_key, file_size FROM exam_papers WHERE workspace_id = ? AND id IN (${placeholders})`,
      ).bind(workspaceId, ...ids).all<PendingDeletion>();

      if (rows.results.length > 0) {
        if (!env.PAPERS_BUCKET) return json({ error: "云端对象存储桶未就绪" }, { status: 503 });
        await env.DB.batch([
          env.DB.prepare(
            `INSERT OR IGNORE INTO pending_paper_deletions (storage_key, workspace_id, file_size, created_at) SELECT storage_key, workspace_id, file_size, ? FROM exam_papers WHERE workspace_id = ? AND id IN (${placeholders})`,
          ).bind(Date.now(), workspaceId, ...ids),
          env.DB.prepare(`DELETE FROM exam_papers WHERE workspace_id = ? AND id IN (${placeholders})`)
            .bind(workspaceId, ...ids),
        ]);
      }

      const cleanupPending = await cleanPendingDeletions(env, workspaceId).then((count) => count > 0).catch((error: unknown) => {
        console.error("Pending paper cleanup query failed:", error);
        return true;
      });
      return json({ success: true, deletedCount: rows.results.length, cleanupPending });
    } catch (err) {
      console.error("Batch delete error:", err);
      return json({ error: "批量删除失败" }, { status: 500 });
    }
  }

  return null;
}
