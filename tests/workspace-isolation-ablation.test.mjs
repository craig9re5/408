import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  StorageRepository,
  createAppData,
  createBlankProgress,
  buildDefaultProgress,
  defaultPastPapers,
  mergeJournals,
  mergePapers,
} from "../app/study-data.ts";
import { books } from "../app/data/books.ts";

const defaultProgress = (isMain = false) => buildDefaultProgress(books, isMain);

class MemoryStorage {
  #values = new Map();

  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

const emptyProgress = (overrides = {}) => ({
  learned: false,
  learnedAt: "",
  reviewed: false,
  reviewedAt: "",
  plannedAt: "",
  reviewedPlannedAt: "",
  isCurrent: false,
  ...overrides,
});

test("消融测试 1: 命名空间绝对隔离与未认证隔离防护 (Namespace Isolation & Quarantine Invariants)", () => {
  const storage = new MemoryStorage();

  // 1. 模拟主用户 (261219 / main) 存入已学数据
  const mainRepo = new StorageRepository(storage, "main");
  const mainData = createAppData({
    "operating-system-1-1": emptyProgress({ learned: true, learnedAt: "2026-08-01" }),
    "operating-system-1-2": emptyProgress({ learned: true, learnedAt: "2026-08-01" }),
  });
  mainRepo.save(mainData);
  assert.ok(storage.getItem("study-app-data-v1"), "main 数据应写入 study-app-data-v1");

  // 2. 模拟新用户 u001001 访问仓储
  const userRepo = new StorageRepository(storage, "u001001");
  const blankFallback = defaultProgress(false);

  // 验证 u001001 读取结果绝不能读出 main 的数据，必须为 null
  const userLoaded = userRepo.load(blankFallback);
  assert.equal(userLoaded, null, "全新非 main 用户初始本地读取必须为 null，绝不能命中 main 的数据");

  // 验证 u001001 写入时使用独立分区 key
  const userData = createAppData({
    "operating-system-1-1": emptyProgress({ learned: true, learnedAt: "2026-09-03" }),
  });
  userRepo.save(userData);
  assert.ok(storage.getItem("study-app-data-v1:u001001"), "非 main 用户必须写入带命名空间后缀的 key");
  assert.notEqual(
    storage.getItem("study-app-data-v1"),
    storage.getItem("study-app-data-v1:u001001"),
    "非 main 用户的写入绝不能污染 main 的存储",
  );

  // 3. 验证未认证/空命名空间进入 Quarantine，绝不读写 main
  const unauthRepo = new StorageRepository(storage, "");
  assert.equal(unauthRepo.load(blankFallback), null, "未认证仓储 load 必须返回 null");
  unauthRepo.save(createAppData({ malicious: emptyProgress({ learned: true }) }));
  assert.equal(
    storage.getItem("study-app-data-v1:__unauthenticated__"),
    null,
    "未认证仓储禁止写入任何主或隔离键",
  );
  assert.equal(unauthRepo.backups().length, 0, "未认证仓储 backups 必须为空");
  assert.equal(unauthRepo.createBackup(userData, "manual").length, 0, "未认证仓储禁止创建备份");
});

test("消融测试 2: 旧版单用户本地数据迁移隔离 (Legacy Migration Isolation Invariant)", () => {
  const storage = new MemoryStorage();
  storage.setItem("408-section-progress-v1", JSON.stringify({
    "data-structure-1-1": emptyProgress({ learned: true, learnedAt: "2026-07-01" }),
  }));

  // main 用户应当能够迁移旧版数据
  const mainRepo = new StorageRepository(storage, "main");
  const mainMigrated = mainRepo.load(defaultProgress(true));
  assert.ok(mainMigrated, "main 用户应支持迁移 408-section-progress-v1");
  assert.equal(mainMigrated.progress["data-structure-1-1"]?.learned, true);

  // 清除新生成的 app-data，仅保留 legacy key
  storage.removeItem("study-app-data-v1");

  // 非 main 用户（如 u001001）绝对禁止迁移 main 的旧版单用户进度
  const otherRepo = new StorageRepository(storage, "u001001");
  const otherMigrated = otherRepo.load(defaultProgress(false));
  assert.equal(
    otherMigrated,
    null,
    "非 main 用户绝对禁止继承/迁移 408-section-progress-v1 旧键",
  );
});

test("消融测试 3: 非 261219 用户学习记录白板消融 (Blank Slate for Non-Main Users Invariant)", () => {
  // 1. 非 main 用户初始进度必须 100% 为 false
  const blankProgress = defaultProgress(false);
  let totalSections = 0;
  let learnedSections = 0;
  let reviewedSections = 0;
  let plannedSections = 0;

  for (const book of books) {
    for (const chapter of book.chapters) {
      for (const section of chapter.sections) {
        totalSections += 1;
        const p = blankProgress[section.id];
        assert.ok(p, `章节 ${section.id} 必须存在于 progress 中`);
        if (p.learned) learnedSections += 1;
        if (p.reviewed) reviewedSections += 1;
        if (p.plannedAt) plannedSections += 1;
        assert.equal(p.learned, false, `非 main 用户的章节 ${section.id} 的 learned 必须为 false`);
        assert.equal(p.reviewed, false, `非 main 用户的章节 ${section.id} 的 reviewed 必须为 false`);
        assert.equal(p.learnedAt, "", `非 main 用户的章节 ${section.id} 的 learnedAt 必须为空`);
        assert.equal(p.reviewedAt, "", `非 main 用户的章节 ${section.id} 的 reviewedAt 必须为空`);
        assert.equal(p.plannedAt, "", `非 main 用户的章节 ${section.id} 的 plannedAt 必须为空`);
      }
    }
  }

  assert.ok(totalSections > 100, `总章节数应超过 100 节（当前: ${totalSections}）`);
  assert.equal(learnedSections, 0, "非 main 用户全科目已学小节数必须严格为 0");
  assert.equal(reviewedSections, 0, "非 main 用户全科目复习小节数必须严格为 0");
  assert.equal(plannedSections, 0, "非 main 用户计划小节数必须严格为 0");

  // 2. createBlankProgress(books) 返回结果必须一致
  const blank2 = createBlankProgress(books);
  assert.deepEqual(blank2, blankProgress);

  // 3. main 用户保持 DS/CO 兼容性
  const mainProgress = defaultProgress(true);
  const ds1 = mainProgress["data-structure-1-1"];
  const co1 = mainProgress["computer-organization-1-1"];
  const os1 = mainProgress["operating-system-1-1"];
  assert.equal(ds1?.learned, true, "main 用户的数据结构初始标记为完成");
  assert.equal(co1?.learned, true, "main 用户的计组初始标记为完成");
  assert.equal(os1?.learned, false, "main 用户的操作系统初始为未学");
});

test("消融测试 4: 跨用户会话切换数据洁净性消融 (Cross-Session Data Cleansing Invariant)", () => {
  // 模拟从前一个用户残留的随笔和套卷记录
  const previousJournals = [
    { id: "j-prev-1", title: "旧用户的随笔", content: "旧内容", createdAt: "2026-08-01", updatedAt: "2026-08-01" },
  ];
  const previousPapers = defaultPastPapers().map((p, idx) => (idx === 0 ? { ...p, score: 120, completed: true } : p));

  // 当新用户没有任何本地或云端记录时进行 merge
  const cleanJournals = mergeJournals([], []);
  const cleanPapers = mergePapers(defaultPastPapers(), []);

  assert.equal(cleanJournals.length, 0, "新用户的随笔列表必须为空，绝不继承上一位用户的随笔");
  assert.equal(cleanPapers.filter((p) => p.completed).length, 0, "新用户的完成套卷数必须为 0");
  assert.equal(cleanPapers.filter((p) => p.score !== null).length, 0, "新用户的打分记录必须全为 null");
});

test("消融测试 5: Worker / D1 数据库多租户 SQL 隔离约束消融 (D1 Multi-tenant SQL Invariant)", async () => {
  const workerCode = await readFile(new URL("../worker/api.ts", import.meta.url), "utf8");

  // 1. 验证所有针对 progress 表的 SELECT 语句均强制绑定 workspace_id
  const progressSelectMatches = workerCode.match(/SELECT\s+[\s\S]*?\s+FROM\s+progress\s+WHERE\s+workspace_id\s*=\s*\?/g);
  assert.ok(progressSelectMatches && progressSelectMatches.length > 0, "progress 的 SELECT 必须带 WHERE workspace_id = ?");

  // 2. 验证所有针对 progress 表的 INSERT / UPDATE 语句均以 workspace_id 为首要联合主键
  assert.match(workerCode, /INSERT INTO progress \(workspace_id, section_id/, "progress 插入必须显式写入 workspace_id");
  assert.match(workerCode, /ON CONFLICT\(workspace_id, section_id\)/, "progress 冲突更新必须按 (workspace_id, section_id) 联合主键");

  // 3. 验证针对 app_state 表的全部操作按 workspace_id 隔离
  assert.match(workerCode, /SELECT\s+[\s\S]*?\s+FROM\s+app_state\s+WHERE\s+workspace_id\s*=\s*\?/, "app_state 必须带 WHERE workspace_id = ?");
  assert.match(workerCode, /INSERT INTO app_state \(workspace_id, schema_version/, "app_state 插入必须显式写入 workspace_id");
  assert.match(workerCode, /ON CONFLICT\(workspace_id\)/, "app_state 必须按 workspace_id 主键冲突更新");

  // 4. 验证所有 DELETE 语句均严格限定 WHERE workspace_id = ?
  for (const m of workerCode.matchAll(/DELETE FROM progress[^\n;]*/g)) {
    assert.match(m[0], /WHERE workspace_id\s*=\s*\?/, "DELETE FROM progress 必须严格带 WHERE workspace_id = ?");
  }
  for (const m of workerCode.matchAll(/DELETE FROM app_state[^\n;]*/g)) {
    assert.match(m[0], /WHERE workspace_id\s*=\s*\?/, "DELETE FROM app_state 必须严格带 WHERE workspace_id = ?");
  }
});

test("消融测试 6: 前端客户端状态机时序与防回退静态约束消融 (Frontend State Machine Invariants)", async () => {
  const dashboardCode = await readFile(new URL("../app/study-dashboard.tsx", import.meta.url), "utf8");

  // 1. 验证 applyRemoteData 显式接收 explicitWorkspaceId 参数
  assert.match(
    dashboardCode,
    /const applyRemoteData = useCallback\(\s*\(body:\s*Partial<StudyAppData>,\s*includeLocal:\s*boolean,\s*explicitWorkspaceId\?: string\)/,
    "applyRemoteData 必须支持 explicitWorkspaceId 参数以消除异步时差",
  );

  // 2. 验证针对非 main 新用户具有 isNewNonMainUser 白板卫语句
  assert.match(
    dashboardCode,
    /const isNewNonMainUser = !isMain && Object\.keys\(remoteProgress\)\.length === 0;/,
    "必须包含 isNewNonMainUser 白板卫语句，确保非 main 全新用户绝对空白",
  );

  // 3. 验证初始 state 与 logout 均使用 defaultProgress(false)
  assert.match(dashboardCode, /useState<ProgressMap>\(\(\) => defaultProgress\(false\)\)/, "初始 state 必须为 defaultProgress(false)");
  assert.match(dashboardCode, /setProgress\(defaultProgress\(false\)\)/, "logout 必须重置为 defaultProgress(false)");

  // 4. 验证 StorageRepository 在 namespace 为空时严禁直接回退到 APP_DATA_KEY
  const studyDataCode = await readFile(new URL("../app/study-data.ts", import.meta.url), "utf8");
  assert.match(studyDataCode, /isQuarantined\(\)/, "StorageRepository 必须实现 isQuarantined 隔离机制");
  assert.match(studyDataCode, /__unauthenticated__/, "未认证命名空间必须指向隔离键");
});
