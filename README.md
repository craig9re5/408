# 学习进度看板

一个面向考研数学与计算机 408 复习的轻量学习看板。它把高等数学、线性代数和 408 四门科目整理成可展开的章节目录，用来记录每个小节的学习、复习与计划进度。

## 功能

- 在顶部切换“408 / 数学”，并在当前领域内快速切换科目。
- 通过“学习进度 / 今日 / 数据分析 / 设置”四个一级页面分离规划、执行、分析入口和数据管理。
- “今日”直接汇总当前项目的今日计划、逾期未学和此前未复习小节，并与目录共用同一份勾选状态。
- 为每个小节分别记录“学完”和“复习一遍”两种状态。
- 勾选状态时自动填入当天日期，也支持手动调整日期。
- 为小节设置可编辑的计划日期，并在临近或逾期时显示提示色；章节标题自动汇总计划区间。
- 第一轮与复习进度分开统计，并可手动指定当前学习小节。
- 章节完成后分别显示第一轮与复习完成日期，以该阶段最后完成的小节日期为准。
- 支持目录筛选、全部展开/折叠、章节批量排期、后续计划前移/后移、变更预览和一次撤销，并保存计划修改历史。
- 复习日期不能早于学完日期；取消已有复习记录的小节会要求确认。
- 显示当前科目的总体进度，并自动定位到第一个尚未完成的小节。
- 数据结构、计算机组成原理默认已完成；操作系统和计算机网络作为未开始科目记录。
- 高等数学按 8 章、23 个小节展示；线性代数按 4 章、10 个小节展示，每章末尾均包含“题目练习”。
- 学习进度保存到 Cloudflare D1，可在手机和电脑之间同步。
- 使用六位邀请码进入共享学习空间；会话通过 HttpOnly Cookie 保存。
- 页面保留 `localStorage` 作为本地缓存，短暂断网时仍可查看最近一次进度。
- 设置页支持按项目修改考试日期、导出/导入完整 JSON，以及最多 15 份本地备份和恢复前保护快照。

## 技术栈

- Next.js App Router + React
- TypeScript
- Tailwind CSS
- Vinext / Vite 开发与构建工具链

## 快速开始

环境要求：Node.js `22.13.0` 或更高版本。

```powershell
npm install
npm run dev
```

启动后打开终端输出的本地地址即可使用。生产构建与本地验证：

```powershell
npm run build
npm run start
```

## Cloudflare 部署

项目使用 Cloudflare Workers 承载页面和 API，使用 D1 保存共享进度，不需要自建服务器。项目已配置 GitHub Actions 自动化工作流，每次推送代码到 `main` 分支时会自动触发 Cloudflare 构建与部署。

生产环境 Worker 名称为 `study`，默认访问地址为 <https://study.craig9re5.workers.dev>。D1 数据库继续沿用内部名称 `408-progress`，以保留已有的数学与 408 学习进度。

首次部署时：

1. 创建 D1 数据库，并将返回的 `database_id` 写入 [`wrangler.jsonc`](wrangler.jsonc)；文件中的全零 ID 只是本地占位符。

   ```powershell
   npx wrangler d1 create 408-progress
   ```

2. 应用数据库迁移（推送到 `main` 时部署工作流也会自动执行）：

   ```powershell
   npm run db:migrate:remote
   ```

3. 设置邀请码和会话密钥。邀请码默认约定为 `261219`，输入命令后按提示填写：

   ```powershell
   npx wrangler secret put INVITE_CODE
   npx wrangler secret put SESSION_SECRET
   ```

4. 使用 GitHub Actions 自动部署时，还需要在仓库的 Actions Secrets 中配置同名的 `INVITE_CODE` 和 `SESSION_SECRET`。工作流会在部署时自动将它们同步到 `study` Worker。

5. 构建并部署：

   ```powershell
   npm run deploy
   ```

本地开发使用被 Git 忽略的 `.dev.vars`，当前已配置邀请码 `261219` 和本地会话密钥。部署到 Cloudflare 时应使用 `wrangler secret put` 设置生产环境 Secret，不要把密钥写入代码或提交到仓库。

## 项目结构

```text
app/
├─ data/books.ts       # 科目、章节和小节数据
├─ page.tsx            # 首页入口
├─ layout.tsx          # 全局布局
├─ study-data.ts       # 数据校验、迁移与本地存储访问层
└─ study-dashboard.tsx # 多页面学习看板交互逻辑
content/content.md     # 数学与 408 的统一目录原稿
public/                # 静态资源
worker/                # 部署相关 Worker 入口
```

## 数据与维护

科目目录维护在 [`app/data/books.ts`](app/data/books.ts)，原始目录资料见 [`content/content.md`](content/content.md)。数学模块方案见 [`docs/数学模块工程方案.md`](docs/数学模块工程方案.md)，目录紧凑化与计划日期方案见 [`docs/页面紧凑化与计划日期工程方案.md`](docs/页面紧凑化与计划日期工程方案.md)。清除浏览器站点数据只会清除本地缓存，云端 D1 中的共享进度不会因此删除。

项目中的 `.openai/`、`.codex/`、`.dev.vars` 和本地预览日志属于开发环境文件，已加入 Git 忽略规则，不应提交到仓库。
