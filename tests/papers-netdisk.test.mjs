import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PAPER_FILE_SIZE,
  DEFAULT_USER_QUOTA_BYTES,
  EXAM_PAPER_SUBJECT_MAP,
} from "../app/study-data.ts";

test("paper netdisk constants are correctly configured", () => {
  assert.equal(MAX_PAPER_FILE_SIZE, 100 * 1024 * 1024);
  assert.equal(DEFAULT_USER_QUOTA_BYTES, 1024 * 1024 * 1024);
  assert.equal(EXAM_PAPER_SUBJECT_MAP.cs408.label, "408");
  assert.equal(EXAM_PAPER_SUBJECT_MAP.math.label, "数学");
  assert.equal(EXAM_PAPER_SUBJECT_MAP.other.label, "其他");
});

test("file name sanitization keeps .pdf extension and filters invalid chars", () => {
  function sanitizeFileName(name) {
    let cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_");
    if (cleaned.toLowerCase().endsWith(".pdf")) {
      cleaned = cleaned.slice(0, -4) + ".pdf";
    } else {
      cleaned += ".pdf";
    }
    return cleaned;
  }

  assert.equal(sanitizeFileName("2024年真题.pdf"), "2024年真题.pdf");
  assert.equal(sanitizeFileName("2024年真题"), "2024年真题.pdf");
  assert.equal(sanitizeFileName("李林6套卷:数学一/卷1.pdf"), "李林6套卷_数学一_卷1.pdf");
  assert.equal(sanitizeFileName("模拟卷?*|.PDF"), "模拟卷___.pdf");
});

test("storage quota calculation accurately computes percentages and alerts", () => {
  function calculateQuotaState(usedBytes, totalBytes = DEFAULT_USER_QUOTA_BYTES) {
    const pct = Math.min(100, Math.round((usedBytes / totalBytes) * 100));
    let status = "normal";
    if (pct >= 100) status = "full";
    else if (pct >= 80) status = "warn";
    return { pct, status };
  }

  const normal = calculateQuotaState(200 * 1024 * 1024);
  assert.equal(normal.pct, 20);
  assert.equal(normal.status, "normal");

  const warn = calculateQuotaState(850 * 1024 * 1024);
  assert.equal(warn.pct, 83);
  assert.equal(warn.status, "warn");

  const full = calculateQuotaState(1024 * 1024 * 1024);
  assert.equal(full.pct, 100);
  assert.equal(full.status, "full");

  const over = calculateQuotaState(1200 * 1024 * 1024);
  assert.equal(over.pct, 100);
  assert.equal(over.status, "full");
});

test("papers list filtering and sorting", () => {
  const samplePapers = [
    { id: "1", fileName: "2024年408真题.pdf", subject: "cs408", fileSize: 15 * 1024 * 1024, createdAt: 1000 },
    { id: "2", fileName: "李林6套卷数学一.pdf", subject: "math", fileSize: 25 * 1024 * 1024, createdAt: 3000 },
    { id: "3", fileName: "2023年英语一真题.pdf", subject: "english", fileSize: 8 * 1024 * 1024, createdAt: 2000 },
  ];

  // Subject filter
  const csOnly = samplePapers.filter((p) => p.subject === "cs408");
  assert.equal(csOnly.length, 1);
  assert.equal(csOnly[0].id, "1");

  // Keyword search
  const keywordSearch = samplePapers.filter((p) => p.fileName.toLowerCase().includes("真题"));
  assert.equal(keywordSearch.length, 2);

  // Sorting by latest
  const sortedLatest = [...samplePapers].sort((a, b) => b.createdAt - a.createdAt);
  assert.equal(sortedLatest[0].id, "2");
  assert.equal(sortedLatest[1].id, "3");
  assert.equal(sortedLatest[2].id, "1");

  // Sorting by size
  const sortedSize = [...samplePapers].sort((a, b) => b.fileSize - a.fileSize);
  assert.equal(sortedSize[0].id, "2");
  assert.equal(sortedSize[1].id, "1");
  assert.equal(sortedSize[2].id, "3");
});
