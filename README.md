# 408 学习进度看板

一个面向计算机考研 408 复习的轻量学习看板。它把数据结构、计算机组成原理、操作系统和计算机网络整理成可展开的章节目录，用来记录每个小节的学习与复习进度。

## 功能

- 在不同科目之间快速切换，按章节展开或收起目录。
- 为每个小节分别记录“学完”和“复习一遍”两种状态。
- 勾选状态时自动填入当天日期，也支持手动调整日期。
- 为小节设置可编辑的计划日期，并在临近或逾期时显示提示色；章节标题自动汇总计划区间。
- 显示当前科目的总体进度，并自动定位到第一个尚未完成的小节。
- 数据结构、计算机组成原理默认已完成；操作系统和计算机网络作为未开始科目记录。
- 学习进度保存到 Cloudflare D1，可在手机和电脑之间同步。
- 使用六位邀请码进入共享学习空间；会话通过 HttpOnly Cookie 保存。
- 页面保留 `localStorage` 作为本地缓存，短暂断网时仍可查看最近一次进度。

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

项目使用 Cloudflare Workers 承载页面和 API，使用 D1 保存共享进度，不需要自建服务器。

首次部署时：

1. 创建 D1 数据库，并将返回的 `database_id` 写入 [`wrangler.jsonc`](wrangler.jsonc)；文件中的全零 ID 只是本地占位符。

   ```powershell
   npx wrangler d1 create 408-progress
   ```

2. 应用数据库迁移：

   ```powershell
   npm run db:migrate:remote
   ```

3. 设置邀请码和会话密钥。邀请码默认约定为 `666666`，输入命令后按提示填写：

   ```powershell
   npx wrangler secret put INVITE_CODE
   npx wrangler secret put SESSION_SECRET
   ```

4. 构建并部署：

   ```powershell
   npm run deploy
   ```

本地开发使用被 Git 忽略的 `.dev.vars`，当前已配置邀请码 `666666` 和本地会话密钥。部署到 Cloudflare 时应使用 `wrangler secret put` 设置生产环境 Secret，不要把密钥写入代码或提交到仓库。

## 项目结构

```text
app/
├─ data/books.ts       # 科目、章节和小节数据
├─ page.tsx            # 首页入口
├─ layout.tsx          # 全局布局
└─ study-dashboard.tsx # 学习看板交互逻辑
content/目录.md        # 目录原始资料
public/                # 静态资源
worker/                # 部署相关 Worker 入口
```

## 数据与维护

科目目录维护在 [`app/data/books.ts`](app/data/books.ts)，原始目录资料见 [`content/目录.md`](content/目录.md)。本轮目录紧凑化与计划日期的工程说明见 [`docs/页面紧凑化与计划日期工程方案.md`](docs/页面紧凑化与计划日期工程方案.md)。清除浏览器站点数据只会清除本地缓存，云端 D1 中的共享进度不会因此删除。

项目中的 `.openai/`、`.codex/`、`.dev.vars` 和本地预览日志属于开发环境文件，已加入 Git 忽略规则，不应提交到仓库。
