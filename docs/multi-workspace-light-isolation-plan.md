# 多空间轻量隔离方案（多邀请码 / 数据隔离）

> 状态：已按此实施（typecheck / build / 39 项测试通过）。
> 线上还需配 `INVITE_CODES` Secret 并用两个码走一遍登录验证。
> 适用：Cloudflare 免费套餐（Workers + D1），不引入付费服务，不做密码体系。

## 1. 现状（已重查当前代码）

- 后端只有单空间：`worker/api.ts:1` 写死 `WORKSPACE_ID = "main"`，
  `readProgress`、`writeProgress`、`readAppData`、`writeAppData` 里所有
  `workspace_id` 绑定都是它（`worker/api.ts:285`、`worker/api.ts:316`、
  `worker/api.ts:726`、`worker/api.ts:763`、`worker/api.ts:826` 附近）。
- 登录只是单码门禁：`getInviteCode` 取单个 `INVITE_CODE`
 （`worker/api.ts:249`），session payload 只存 `exp`
 （`worker/api.ts:195-200`），不区分人。谁登录看到的都是同一份
  `app_state + progress`。
- 登录里还有硬编码兜底 `code !== "261219"`（`worker/api.ts:875` 附近），
  做隔离时必须删掉，否则等于给 `main` 留了万能钥匙。
- 前端本地缓存是全局单 key：`APP_DATA_KEY`、`BACKUPS_KEY`
 （`app/study-data.ts:7-9`），`StorageRepository`
  （`app/study-data.ts:1336-1450`）不区分空间。同一浏览器切号会互相覆盖。
- 前端仓库单例 + 自动保存：`repositoryRef`
  （`app/study-dashboard.tsx:594`）、`applyRemoteData`
 （`app/study-dashboard.tsx:598`）、`performLogin`
  （`app/study-dashboard.tsx:762`）、`logout`
  （`app/study-dashboard.tsx:847`）。切号时残留引用和
  `deletedJournalIdsRef / deletedPaperIdsRef`、`lastSavedPayloadRef`
  若不清，会把 A 的数据写到 B 的空间。

## 2. 并发检查结论

- `git status` 里 `worker/`、`app/study-dashboard.tsx`、
  `app/study-data.ts`、`migrations/`、`wrangler.jsonc` 相对 HEAD 无待提交改动；
  仅 `build/sites-vite-plugin.ts`、`postcss.config.mjs`、
  `public/pku-logo.svg`、`tsconfig.json`、`vite.config.ts` 有换行符层面的差异，
  与登录同步无关。
- 另一进程已落库的改动主要是 sprint 打磨和备份容灾强化
  （`StorageRepository.save / createBackup / deleteBackup` 的配额 try-catch，
  `app/study-data.ts:1390-1449`），方案里会原样保留这套逻辑，
  只给它加空间后缀，不改行为。
- 结论：登录同步这条线可以动，不会覆盖他人改动。动手前仍以当前文件为准，
  行号以本次重查为准。

## 3. 目标

- 一个邀请码对应一个独立空间（`workspace_id`），数据完全隔离：
  进度、设置、计划历史、日志、试卷互不可见。
- 不做用户名密码、不做注册找回，码即身份。码表由维护者在
  Cloudflare Secrets 里配置。
- 免费额度内：每个空间只是 `app_state` 多一行、`progress` 多若干行，
  不新增表，不需要 D1 迁移 SQL。

## 4. 改动清单

### 4.1 Worker：`worker/api.ts`

1. 删 `const WORKSPACE_ID = "main"`，所有读写函数加 `workspaceId` 参数：
   `readProgress(env, workspaceId)`、`writeProgress(env, workspaceId, ...)`、
   `readAppData(env, workspaceId)`、`writeAppData(env, workspaceId, ...)`。
2. 加 `workspaceId` 格式校验，只允许长度 1-64 的
   `[a-z0-9-]`，非法直接 401，不进 D1。
3. 码表解析：新增 `getWorkspaceMap(env)`，读 `INVITE_CODES`。
   格式用逗号分隔的 `码:空间`，例如：
   `261219:main,482910:li,773451:chen`。
   兼容旧单码 `INVITE_CODE`（视为 `main`），但线上配好新变量后以新变量为准。
4. session 载荷从 `{ exp }` 改成 `{ wid, exp }`：
   - `createSession(secret, workspaceId)`
   - `hasValidSession` 改成返回 `workspaceId | null`（验签 + 过期 + `wid` 格式三道检查）
   - `requireSession` 返回 `{ workspaceId }` 或 401，所有 `/api/*` 用它取空间。
5. 登录 `POST /api/auth/login`：查码表得 `wid`，失败统一返回
   “邀请码不正确”，成功在 `set-cookie` 种下带 `wid` 的 session，
   响应里带上 `workspaceId` 给前端做本地缓存分区。
6. `GET /api/auth/session` 同样返回 `workspaceId`，供刷新后重建仓库。
7. 删掉登录里的 `|| code === "261219"` 硬编码兜底。
8. `writeAppData` 里 `DELETE FROM progress WHERE workspace_id = ?` 的
   `replace` 语义保持按空间生效，不能跨空间删。

### 4.2 配置与类型

- `wrangler.jsonc` 的 `secrets.required`：`INVITE_CODE` 改成 `INVITE_CODES`
 （保留 `SESSION_SECRET`）。
- `worker-configuration.d.ts`、`NodeJS.ProcessEnv` 同步改 key。
- `.dev.vars` 本地改成 `INVITE_CODES="261219:main,111111:demo"` 形式，
  线上在 Cloudflare Dashboard → Workers → Settings → Variables 里配同名 Secret。
- `SESSION_SECRET` 保持单密钥即可，多空间共用签名密钥，隔离靠 `wid`；
  若泄露则所有空间一起换 cookie。

### 4.3 前端：`app/study-data.ts`

- `StorageRepository` 构造加 `namespace`（即 `workspaceId`），
  `APP_DATA_KEY`、`BACKUPS_KEY`、legacy key 都拼后缀：
  `study-app-data-v1:{wid}`。`save/load/backups/createBackup/deleteBackup`
  保持现有配额容错逻辑不变（`app/study-data.ts:1390-1449`）。
- 读不到新 key 时，不自动沿用旧全局 key，避免 A 的旧缓存污染 B；
  `main` 空间的迁移由一次性导入完成，而不是代码里隐式混读。

### 4.4 前端：`app/study-dashboard.tsx`

- `repository()` 按当前 `workspaceId` 建实例，切号时重建
  （`repositoryRef` 不能再是全局单例常驻）。
- `performLogin`、`session` 初始化成功后先存 `workspaceId`，
  再 `applyRemoteData(body, true)`，`lastSavedPayloadRef`、
  `deletedJournalIdsRef`、`deletedPaperIdsRef` 按空间重置。
- `logout` 清掉 `workspaceId`、`inviteCode`、仓库引用、payload 指纹和删除队列，
  再回 `locked`；`loadRemoteData` 401 的处理保持不变。
- 界面上显示当前空间 id（设置页或顶栏小字即可），方便发现串号。

## 5. 数据兼容

- D1 不需要新迁移文件。新 `workspace_id` 第一笔 `PUT /api/app-data`
  会经 `ON CONFLICT(workspace_id)` 自动建行。
- 旧 `main` 数据原地保留，仍用 `261219:main` 进入。
- 新空间首次登录是空进度 + 默认设置 + 默认真题骨架，由现有
  `normalize*` 逻辑生成。
- 本地旧缓存不删除，只是不再被新空间读取；需要的话手动导出备份。

## 6. 安全与额度说明

- 6 位纯数字码强度一般，码要发得随机一点；这是“门禁”不是“账户”，
  别当密码用。真要防扫，后续再加登录限流（D1 记失败次数或接
  Rate Limiting）。
- `SESSION_SECRET` 线上必须用强随机值，默认兜底值只给本地开发用。
- 日志、试卷走现有 `normalize + merge + 墓碑队列` 逻辑，隔离后每空间独立合并，
  不会跨空间复活删除项。

## 7. 验证步骤

1. `npm run typecheck`、`npm run lint`
2. `npm run build`（含现有 `tests/*.test.mjs`）
3. 本地配两个码走一遍：A 登录打卡 → 退出 → B 登录确认看不到 A 数据 →
   刷新确认 session 恢复 → 同一浏览器 localStorage 出现两个带后缀的 key
4. `npm run db:migrate:local` 不需要新文件，但远端 `app_state` 应出现新
   `workspace_id` 行，抽查 `SELECT workspace_id FROM app_state`
5. `npm run deploy` 后配好线上 `INVITE_CODES` 再测一遍登录

## 8. 回滚

- 代码回滚到本方案实施前的 commit 即可；D1 里多出来的空间行不影响旧代码
  （旧代码只读 `main`）。
- 若线上配错码表，表现为全部 401，改回正确的 `INVITE_CODES` 即可恢复。
