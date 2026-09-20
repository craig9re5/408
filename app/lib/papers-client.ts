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

async function saveLocalBlob(id: string, blob: Blob): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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

function getFilteredLocalItems(subject?: string, keyword?: string): ExamPaperItem[] {
  let items = getLocalMetaList();
  if (subject && subject !== "all") {
    items = items.filter((i) => i.subject === subject);
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    items = items.filter((i) => i.fileName.toLowerCase().includes(kw));
  }
  return items;
}

/**
 * Fetch paper list with filtering (unifies cloud and local offline items)
 */
export async function fetchPaperList(
  subject?: string,
  keyword?: string,
): Promise<{ items: ExamPaperItem[]; quota: PaperQuotaInfo; cloudStorageReady: boolean }> {
  let cloudItems: ExamPaperItem[] = [];
  let cloudQuota: PaperQuotaInfo = { usedBytes: 0, totalBytes: DEFAULT_USER_QUOTA_BYTES };
  let cloudStorageReady = false;
  let apiSucceeded = false;

  try {
    const params = new URLSearchParams();
    if (subject && subject !== "all") params.set("subject", subject);
    if (keyword) params.set("keyword", keyword);

    const res = await fetch(`/api/papers?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      cloudItems = data.items || [];
      cloudQuota = data.quota || cloudQuota;
      cloudStorageReady = Boolean(data.cloudStorageReady);
      apiSucceeded = true;
    }
  } catch {
    // Network / dev fallback
  }

  // Local storage items
  const localFiltered = getFilteredLocalItems(subject, keyword);

  if (!apiSucceeded) {
    const allLocal = getLocalMetaList();
    const usedBytes = allLocal.reduce((acc, curr) => acc + (curr.fileSize || 0), 0);
    return {
      items: localFiltered,
      quota: { usedBytes, totalBytes: DEFAULT_USER_QUOTA_BYTES },
      cloudStorageReady: false,
    };
  }

  // Combine cloud items with any local items
  const itemMap = new Map<string, ExamPaperItem>();
  cloudItems.forEach((it) => itemMap.set(it.id, it));
  localFiltered.forEach((it) => {
    if (!itemMap.has(it.id)) {
      itemMap.set(it.id, it);
    }
  });

  const merged = Array.from(itemMap.values());
  merged.sort((a, b) => b.createdAt - a.createdAt);

  const allLocal = getLocalMetaList();
  const localUniqueBytes = allLocal
    .filter((l) => !cloudItems.some((c) => c.id === l.id))
    .reduce((acc, curr) => acc + (curr.fileSize || 0), 0);

  return {
    items: merged,
    quota: {
      usedBytes: (cloudQuota.usedBytes || 0) + localUniqueBytes,
      totalBytes: cloudQuota.totalBytes || DEFAULT_USER_QUOTA_BYTES,
    },
    cloudStorageReady,
  };
}

/**
 * Upload single paper PDF
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

  let cleanName = file.name.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (cleanName.toLowerCase().endsWith(".pdf")) {
    cleanName = cleanName.slice(0, -4) + ".pdf";
  } else {
    cleanName += ".pdf";
  }

  // Try API upload first
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subject", subject);
    if (year) formData.append("year", String(year));

    const res = await fetch("/api/papers/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.item) return { item: data.item, isLocal: false };
    } else {
      const errJson = await res.json().catch(() => ({}));
      if (res.status === 400 && errJson.error) {
        throw new Error(errJson.error);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message && !err.message.includes("fetch")) {
      throw err;
    }
  }

  // Fallback: Save to local IndexedDB + LocalStorage
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `local-paper-${Date.now()}`;

  await saveLocalBlob(id, file);

  const now = Date.now();
  const newItem: ExamPaperItem = {
    id,
    workspaceId: "main",
    fileName: cleanName,
    originalName: file.name,
    fileSize: file.size,
    storageKey: `local://${id}`,
    subject,
    year,
    createdAt: now,
    updatedAt: now,
  };

  const list = getLocalMetaList();
  setLocalMetaList([newItem, ...list]);
  return { item: newItem, isLocal: true };
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
  const index = list.findIndex((i) => i.id === id);
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
  }

  try {
    await fetch(`/api/papers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fallback
  }
}

/**
 * Delete single paper
 */
export async function deletePaper(id: string): Promise<void> {
  await deleteLocalBlob(id).catch(() => null);
  const list = getLocalMetaList().filter((i) => i.id !== id);
  setLocalMetaList(list);

  try {
    await fetch(`/api/papers/${id}`, { method: "DELETE" });
  } catch {
    // Fallback
  }
}

/**
 * Batch delete papers
 */
export async function batchDeletePapers(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  await Promise.all(ids.map((id) => deleteLocalBlob(id).catch(() => null)));
  const list = getLocalMetaList().filter((i) => !idSet.has(i.id));
  setLocalMetaList(list);

  try {
    await fetch("/api/papers/batch-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  } catch {
    // Fallback
  }
}
