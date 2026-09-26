"use client";

import type { ExamPaperItem, ExamPaperSubject, PaperQuotaInfo } from "../study-data";
import { DEFAULT_USER_QUOTA_BYTES, MAX_PAPER_FILE_SIZE } from "../study-data";

// Fallback IndexedDB store for local testing when backend R2 is unavailable
const DB_NAME = "408_local_papers_db";
const STORE_NAME = "papers_blob_store";
const META_KEY = "408_local_papers_meta";

function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB 不可用"));
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getLocalBlob(id: string): Promise<Blob | null> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteLocalBlob(id: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getLocalMetaList(): ExamPaperItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "[]");
  } catch {
    return [];
  }
}

function setLocalMetaList(list: ExamPaperItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("Save local meta failed:", err);
  }
}

function getFilteredLocalItems(workspaceId: string, subject?: string, keyword?: string): ExamPaperItem[] {
  let items = getLocalMetaList().filter((item) => item.workspaceId === workspaceId && item.storageKey.startsWith("local://"));
  if (subject && subject !== "all") {
    items = items.filter((item) => item.subject === subject);
  }
  if (keyword) {
    const search = keyword.toLowerCase();
    items = items.filter((item) => item.fileName.toLowerCase().includes(search));
  }
  return items;
}

async function paperApiError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error || `云盘请求失败（HTTP ${response.status}）`);
}

/**
 * Fetch cloud papers and include legacy browser-only files from the current workspace.
 */
export async function fetchPaperList(
  subject?: string,
  keyword?: string,
): Promise<{ items: ExamPaperItem[]; quota: PaperQuotaInfo; cloudStorageReady: boolean }> {
  const params = new URLSearchParams();
  if (subject && subject !== "all") params.set("subject", subject);
  if (keyword) params.set("keyword", keyword);
  const response = await fetch(`/api/papers?${params.toString()}`);
  if (!response.ok) throw await paperApiError(response);

  const data = await response.json() as {
    items: ExamPaperItem[];
    quota: PaperQuotaInfo;
    workspaceId: string;
    cloudStorageReady: boolean;
  };
  const cloudItems = data.items ?? [];
  const workspaceId = data.workspaceId ?? "main";
  const localItems = getFilteredLocalItems(workspaceId, subject, keyword);
  const itemMap = new Map<string, ExamPaperItem>();
  cloudItems.forEach((item) => itemMap.set(item.id, item));
  localItems.forEach((item) => {
    if (!itemMap.has(item.id)) itemMap.set(item.id, item);
  });
  const items = [...itemMap.values()].sort((a, b) => b.createdAt - a.createdAt);
  const quota = data.quota ?? { usedBytes: 0, totalBytes: DEFAULT_USER_QUOTA_BYTES };
  return {
    items,
    quota,
    cloudStorageReady: Boolean(data.cloudStorageReady),
  };
}

/**
 * Upload a PDF to R2 through the authenticated Worker API.
 */
export async function uploadPaper(
  file: File,
  subject: ExamPaperSubject = "other",
  year?: number,
): Promise<{ item: ExamPaperItem; isLocal: boolean }> {
  if (file.size > MAX_PAPER_FILE_SIZE) {
    throw new Error("文件超过 100MB 上限，请压缩后再试");
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error("仅支持上传 PDF 格式的试卷文件");
  }

  const response = await fetch("/api/papers/upload", {
    method: "POST",
    headers: {
      "content-type": "application/pdf",
      "x-file-name": encodeURIComponent(file.name),
      "x-file-size": String(file.size),
      "x-paper-subject": subject,
      ...(year ? { "x-paper-year": String(year) } : {}),
    },
    body: file,
  });
  if (!response.ok) throw await paperApiError(response);
  const data = await response.json() as { item?: ExamPaperItem };
  if (!data.item) throw new Error("云端未返回已保存的试卷信息");
  return { item: data.item, isLocal: false };
}

/**
 * Copy a legacy browser-only PDF to R2 before removing its local copy.
 */
export async function migrateLocalPaper(paper: ExamPaperItem): Promise<void> {
  if (!paper.storageKey.startsWith("local://")) return;
  const blob = await getLocalBlob(paper.id);
  if (!blob) throw new Error("当前浏览器未找到这份试卷原件");
  const file = new File([blob], paper.fileName, { type: "application/pdf" });
  await uploadPaper(file, paper.subject, paper.year ?? undefined);
  await deleteLocalBlob(paper.id);
  setLocalMetaList(getLocalMetaList().filter((item) => item.id !== paper.id));
}

/**
 * Download paper PDF
 */
export async function downloadPaper(paper: ExamPaperItem): Promise<void> {
  // Try remote download first if it's not a local-only key
  if (!paper.storageKey.startsWith("local://")) {
    try {
      const res = await fetch(`/api/papers/${paper.id}/download`);
      if (res.ok) {
        const blob = await res.blob();
        triggerBrowserDownload(blob, paper.fileName);
        return;
      }
    } catch {
      // Fallback to local
    }
  }

  // Local fallback
  const localBlob = await getLocalBlob(paper.id);
  if (!localBlob) {
    throw new Error("本地或云端未找到试卷原件");
  }
  triggerBrowserDownload(localBlob, paper.fileName);
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Update paper metadata (rename, change subject/year)
 */
export async function updatePaperMeta(
  id: string,
  payload: { fileName?: string; subject?: string; year?: number | null },
): Promise<void> {
  const list = getLocalMetaList();
  const index = list.findIndex((item) => item.id === id && item.storageKey.startsWith("local://"));
  if (index !== -1) {
    let cleanName = payload.fileName ? payload.fileName.trim().replace(/[\\/:*?"<>|]/g, "_") : list[index].fileName;
    if (cleanName.toLowerCase().endsWith(".pdf")) {
      cleanName = cleanName.slice(0, -4) + ".pdf";
    } else {
      cleanName += ".pdf";
    }
    list[index] = {
      ...list[index],
      fileName: cleanName,
      subject: (payload.subject as ExamPaperSubject) || list[index].subject,
      year: typeof payload.year !== "undefined" ? (payload.year ?? undefined) : list[index].year,
      updatedAt: Date.now(),
    };
    setLocalMetaList(list);
    return;
  }

  const response = await fetch(`/api/papers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await paperApiError(response);
}

/** Delete one cloud or legacy browser-only paper. */
export async function deletePaper(id: string): Promise<void> {
  const list = getLocalMetaList();
  const localOnly = list.some((item) => item.id === id && item.storageKey.startsWith("local://"));
  if (!localOnly) {
    const response = await fetch(`/api/papers/${id}`, { method: "DELETE" });
    if (!response.ok) throw await paperApiError(response);
  }
  if (localOnly) await deleteLocalBlob(id);
  setLocalMetaList(list.filter((item) => item.id !== id));
}

/** Delete selected cloud and legacy browser-only papers. */
export async function batchDeletePapers(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  const localItems = getLocalMetaList();
  const localIds = new Set(localItems.filter((item) => idSet.has(item.id) && item.storageKey.startsWith("local://")).map((item) => item.id));
  const cloudIds = ids.filter((id) => !localIds.has(id));
  if (cloudIds.length > 0) {
    const response = await fetch("/api/papers/batch-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: cloudIds }),
    });
    if (!response.ok) throw await paperApiError(response);
  }
  await Promise.all([...localIds].map((id) => deleteLocalBlob(id)));
  setLocalMetaList(localItems.filter((item) => !idSet.has(item.id)));
}
