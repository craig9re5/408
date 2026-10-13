# 本地待提交改动与清理记录

当前功能改动已按用户授权全量部署并纳入本次 Git 提交范围。下文待提交、未部署清单是此前的历史盘点；最新结果见文末“完整发布更新”。

## Git 状态

2026-10-13 已刷新 `origin`。本地 `main` 与 `origin/main` 均为 `5097d30`，领先/落后均为 0：没有“已提交但未推送”的提交，但下面这些工作区修改还没有提交。本轮未执行 commit 或 push，待用户选择提交范围。

## 已部署、尚未提交的内容

- `app/progress-mobile.css`、`app/sprint-mobile.css`：三轮移动端样式调整，以及隐藏本周节奏区、今日课表全屏/设置按钮、答题卡批量录入/应用/清零工具栏。
- `app/feature-flags.ts` 与 `app/study-dashboard.tsx` 的导航部分：数据分析全屏幕关闭，手机更多菜单只保留设置。注意 dashboard 同时包含下文未部署的日志和计分改动，不能把整份文件视为已部署。
- `docs/MOBILE_LAYOUT_FIX_2026-10-13.md` 与 `docs/mobile-layout-2026-10-13/`：移动端方案、完成状态截图及部署记录；文档不属于线上静态资源。

## 尚未纳入本轮部署的功能修改

| 分组 | 内容 | 涉及文件 |
| --- | --- | --- |
| 日志与本机存储 | 草稿立即缓存、切到后台时保存；缓存失败显示提示；保存过程防重复提交；持久化失败不关闭编辑器；日志 ID 增加 UUID，避免离线设备冲突；本机存储保存返回成功/失败。 | `app/components/journal/JournalEditorModal.tsx`、`app/study-dashboard.tsx` 的日志部分、`app/study-data.ts` 的日志/存储部分、`shared/merge.ts`、`tests/journal.test.mjs`、`tests/api-sync.test.mjs` |
| 试卷云盘 | 上传排队、失败重试、结果提示；“全部”分类上传默认归入其他；远程下载失败直接报错；R2 上传使用已知长度流，并核对实际大小和 PDF 签名。 | `app/components/papers/PaperNetdiskModal.tsx`、`PaperUploadZone.tsx`、`app/lib/papers-client.ts`、`app/paper-netdisk.css`、`worker/papers.ts`、`tests/papers-r2.test.mjs`、新增 `tests/papers-runtime.test.mjs` 和 `tests/helpers/fixed-length-stream.mjs` |
| 答题卡自动计分 | 根据客观题状态和主观题得分统计总分；更新题目或关闭答题卡时同步试卷分数和完成状态；底部显示客观/主观分与未录入题数；批量错题将主观错题计为 0 分。 | `app/components/sprint/AnswerSheetModal.tsx`、`app/study-dashboard.tsx` 的答题部分、`app/study-data.ts` 的计分部分、`app/sprint.css`、`tests/sprint-papers.test.mjs` |

以上是相对已部署隔离源码的本地差异，尚未作为一个完整功能包重新验收或发布。几组改动共享 `study-dashboard.tsx`、`study-data.ts`，分组提交需要按代码块整理，不能简单按文件全选。

## 其他未跟踪文件

- `AGENTS.md`：项目自动部署协作约定，建议随项目提交。
- `public/papers/math/`：七份数学 PDF（六套分卷和一份合订本）；保留，未放入本轮静态资源部署。这仅说明本轮发布包未包含它们，不判断是否曾通过其他流程上传到云盘。
- `test_save.pdf`：保留的本地 PDF，未发布；用途需要用户判断。
- 截图附件 `.codex-remote-attachments/`：全部保留，并加入 `.gitignore`，避免误提交。
- `.gitignore` 的附件忽略规则与这份清单也尚未提交；它们是本轮整理内容，不影响线上页面。

## 本轮清理

- 删除项目根目录本轮验收生成的 `math-answer-v2.png`、`math-subjective-v2.png`、`progress-completed-v2.png`，文档截图仍在 `docs/mobile-layout-2026-10-13/`。
- 删除可重建的 `tsconfig.tsbuildinfo`。
- 将 `remote_dump.sql`、`sync_main.sql` 移到 `outputs/local-backups/2026-10-13/`，保留备份，不读取或删除内容；`outputs/` 已被 Git 忽略。
- `work/draft-check/`、`work/papers-check/` 及上传/烟测脚本属于既有验证材料，保留。它们已在忽略目录内，不会随 Git 提交或静态资源发布。
- `node_modules/`、`.wrangler/`、凭据文件、用户表格、旧构建 `dist/` 和试卷资料均保留；其中本地数据库和凭据不能按缓存删除。
- 项目之外的 `D:/_Review/408/mobile-ui-stage-20261013/` 是本轮隔离发布快照，保留用于之后核对“已部署”和“尚未部署”的共享文件差异，不纳入 Git 提交。

## 本轮发布范围与验证

本轮继续使用隔离目录：Git HEAD + 两份移动样式 + 导航/分析开关的指定改动。未包含上述日志、云盘、计分改动，也没有混入本地 PDF。

70 项测试、类型检查、Lint 与生产构建通过；320/390/600px 检查手机隐藏项，768/1280px 检查全局分析入口不存在，并确认桌面课表入口仍可见。线上发布及资源核对结果见后续记录。

本轮已部署：https://study.craig9re5.workers.dev 。版本 07fde025-3d79-4cf5-b6e6-fbdf299ecd2b。首页及引用的 CSS/JavaScript 均返回 HTTP 200，线上 CSS 与隔离构建 SHA-256 一致；线上 320/390/1280px 再次验证隐藏项和导航（模拟 API，不修改用户数据）。

## 完整发布更新

用户已授权将剩余本地改动一起部署并提交推送。日志、云盘、自动计分及相关测试全部纳入；七份数学 PDF 纳入静态资源与 Git。test_save.pdf 已保留至 outputs/verification-inputs/test_save.pdf，作为本地验证输入，不发布或提交。原有待提交清单保留为历史记录。完整工作区 77 项测试及类型检查已通过。

完整发布版本：3efaeeca-694f-4860-ac03-18904c9b849c。77 项测试、类型检查、Lint、生产构建通过；线上首页、新静态资源及七份试卷可访问。320/390/1280px 验证分析隐藏规则和自动计分：121 分题目数据改动后统计为 111 分，关闭答题卡后试卷分数同步。
