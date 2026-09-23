import type { ExamPaperItem, ExamPaperSubject } from "../shared/types.ts";
import { DEFAULT_USER_QUOTA_BYTES, MAX_PAPER_FILE_SIZE } from "../shared/constants.ts";

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

export async function handlePapersApi(request: Request, env: Env, workspaceId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. GET /api/papers - List papers & get quota
  if (path === "/api/papers" && request.method === "GET") {
    const subject = url.searchParams.get("subject")?.trim();
    const keyword = url.searchParams.get("keyword")?.trim().toLowerCase();

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
      const [listResult, quotaResult] = await Promise.all([
        env.DB.prepare(query).bind(...bindings).all<ExamPaperRow>(),
        env.DB.prepare("SELECT COALESCE(SUM(file_size), 0) as used_bytes FROM exam_papers WHERE workspace_id = ?").bind(workspaceId).first<{ used_bytes: number }>(),
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
      return json({ error: "获取试卷列表失败", details: String(err) }, { status: 500 });
    }
  }

  // 2. POST /api/papers/upload - Upload single PDF
  if (path === "/api/papers/upload" && request.method === "POST") {
    try {
      if (!env.PAPERS_BUCKET) {
        return json({ error: "云端对象存储桶未就绪，请检查 PAPERS_BUCKET 绑定" }, { status: 503 });
      }
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const rawSubject = (formData.get("subject") as string)?.trim() || "other";
      const yearRaw = formData.get("year") as string | null;
      const year = yearRaw && !isNaN(parseInt(yearRaw, 10)) ? parseInt(yearRaw, 10) : null;

      if (!file || typeof file === "string") {
        return json({ error: "未找到待上传的 PDF 文件" }, { status: 400 });
      }

      // Format validation
      const fileNameLower = file.name.toLowerCase();
      if (!fileNameLower.endsWith(".pdf") && file.type !== "application/pdf") {
        return json({ error: "仅支持上传 PDF 格式的试卷文件" }, { status: 400 });
      }

      // Size limit validation (100MB)
      if (file.size > MAX_PAPER_FILE_SIZE) {
        return json({ error: "文件体积超过 100MB 上限，请压缩后再试" }, { status: 400 });
      }

      // Check storage quota
      const quotaRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(file_size), 0) as used_bytes FROM exam_papers WHERE workspace_id = ?",
      ).bind(workspaceId).first<{ used_bytes: number }>();

      const currentUsed = quotaRow?.used_bytes ?? 0;
      if (currentUsed + file.size > DEFAULT_USER_QUOTA_BYTES) {
        return json({ error: "云盘存储容量已满（最大 1GB），请清理不需要的试卷后再上传" }, { status: 400 });
      }

      const paperId = crypto.randomUUID();
      const storageKey = `papers/${workspaceId}/${paperId}.pdf`;
      const cleanName = sanitizeFileName(file.name);

      await env.PAPERS_BUCKET.put(storageKey, file.stream(), {
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: `attachment; filename="${encodeURIComponent(cleanName)}"`,
        },
        customMetadata: {
          originalName: file.name,
          workspaceId,
        },
      });

      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO exam_papers (id, workspace_id, file_name, original_name, file_size, storage_key, subject, year, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          paperId,
          workspaceId,
          cleanName,
          file.name,
          file.size,
          storageKey,
          rawSubject,
          year,
          now,
          now,
        ).run();
      } catch (err) {
        await env.PAPERS_BUCKET.delete(storageKey).catch((cleanupError: unknown) =>
          console.error("Failed to clean up orphaned paper:", cleanupError));
        throw err;
      }

      const newItem: ExamPaperItem = {
        id: paperId,
        workspaceId,
        fileName: cleanName,
        originalName: file.name,
        fileSize: file.size,
        storageKey,
        subject: (rawSubject as ExamPaperSubject) || "other",
        year: year ?? undefined,
        createdAt: now,
        updatedAt: now,
      };

      return json({ success: true, item: newItem });
    } catch (err) {
      console.error("Upload paper error:", err);
      return json({ error: "上传试卷失败", details: String(err) }, { status: 500 });
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
      return json({ error: "下载试卷失败", details: String(err) }, { status: 500 });
    }
  }

  // 4. PATCH /api/papers/:id - Rename or update subject
  const updateMatch = path.match(/^\/api\/papers\/([a-zA-Z0-9_-]+)$/);
  if (updateMatch && request.method === "PATCH") {
    const paperId = updateMatch[1];
    try {
      const body = await request.json().catch(() => null) as {
        fileName?: string;
        subject?: string;
        year?: number | null;
      } | null;

      if (!body) {
        return json({ error: "无效的修改请求" }, { status: 400 });
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
      return json({ error: "修改试卷信息失败", details: String(err) }, { status: 500 });
    }
  }

  // 5. DELETE /api/papers/:id - Delete single paper
  if (updateMatch && request.method === "DELETE") {
    const paperId = updateMatch[1];
    try {
      const row = await env.DB.prepare(
        "SELECT storage_key FROM exam_papers WHERE workspace_id = ? AND id = ?",
      ).bind(workspaceId, paperId).first<{ storage_key: string }>();

      if (row) {
        if (!env.PAPERS_BUCKET) return json({ error: "云端对象存储桶未就绪" }, { status: 503 });
        await env.PAPERS_BUCKET.delete(row.storage_key);
        await env.DB.prepare("DELETE FROM exam_papers WHERE workspace_id = ? AND id = ?").bind(workspaceId, paperId).run();
      }

      return json({ success: true, id: paperId });
    } catch (err) {
      console.error("Delete paper error:", err);
      return json({ error: "删除试卷失败", details: String(err) }, { status: 500 });
    }
  }

  // 6. POST /api/papers/batch-delete - Delete multiple papers
  if (path === "/api/papers/batch-delete" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => null) as { ids?: string[] } | null;
      const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((id) => typeof id === "string" && id.length > 0))] : [];

      if (ids.length === 0) {
        return json({ error: "请选择要删除的试卷" }, { status: 400 });
      }

      // Fetch storage keys for R2 deletion
      const placeholders = ids.map(() => "?").join(",");
      const rows = await env.DB.prepare(
        `SELECT storage_key FROM exam_papers WHERE workspace_id = ? AND id IN (${placeholders})`,
      ).bind(workspaceId, ...ids).all<{ storage_key: string }>();

      if (rows.results.length > 0) {
        if (!env.PAPERS_BUCKET) return json({ error: "云端对象存储桶未就绪" }, { status: 503 });
        const keys = rows.results.map((r: { storage_key: string }) => r.storage_key).filter(Boolean);
        await Promise.all(keys.map((k: string) => env.PAPERS_BUCKET!.delete(k)));
      }

      await env.DB.prepare(
        `DELETE FROM exam_papers WHERE workspace_id = ? AND id IN (${placeholders})`,
      ).bind(workspaceId, ...ids).run();

      return json({ success: true, deletedCount: rows.results.length });
    } catch (err) {
      console.error("Batch delete error:", err);
      return json({ error: "批量删除失败", details: String(err) }, { status: 500 });
    }
  }

  return null;
}
