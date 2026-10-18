#!/usr/bin/env node
/**
 * 部署安全闸：挡住「改了代码但没提交就 wrangler deploy」这条路径。
 *
 * 背景：.github/workflows/deploy.yml 在每次 push 到 main 时都会从已提交的代码
 * 重新构建并部署。因此直接 `npm run deploy` 而未提交的改动，会在下一次 CI
 * push 时被静默回退（手机端课表入口的修复就这样丢过一次）。
 *
 * 规则：
 *   1. 源码 / 配置有未提交改动 → 拒绝部署。
 *   2. 本地分支领先 origin/<branch> → 拒绝部署（线上会先于仓库变成“孤儿版本”）。
 *   3. 当前分支不是 main → 只警告（CI 只跟 main，分支部署不会被覆盖）。
 *   4. 只有被 Git 忽略的产物（dist/ 等）有改动 → 放行。
 *
 * 唯一合法用法是推送前的本地验证：先 commit，CI 不可用时再 `npm run deploy`。
 * 应急放行：DEPLOY_ALLOW_DIRTY=1 npm run deploy（不要用于任何需要保留的改动）。
 */

import { execFileSync } from "node:child_process";

const ALLOW_DIRTY = process.env.DEPLOY_ALLOW_DIRTY === "1";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function fail(lines) {
  console.error("\n✖ 部署已阻止：改动尚未进入 Git，CI 会在下次 push 时覆盖线上。\n");
  for (const line of lines) console.error(`  ${line}`);
  console.error("\n  修复步骤：");
  console.error("    git add <本次相关文件> && git commit -m \"...\"");
  console.error("    git push origin main   # CI 会自动构建并部署");
  console.error("\n  仅当 CI 不可用、且你确认改动已提交时才使用：");
  console.error("    DEPLOY_ALLOW_DIRTY=1 npm run deploy\n");
  process.exit(1);
}

if (ALLOW_DIRTY) {
  console.warn("⚠ DEPLOY_ALLOW_DIRTY=1：已跳过未提交改动检查。请确认改动已 commit + push。\n");
  process.exit(0);
}

let dirty = "";
let branch = "";
let ahead = "";

try {
  // --porcelain 只列出被跟踪与未跟踪但未被忽略的文件；dist/ 等被忽略的产物不会出现。
  dirty = git("status", "--porcelain");
  branch = git("rev-parse", "--abbrev-ref", "HEAD");
} catch (error) {
  console.warn(`⚠ 无法读取 Git 状态（${error.message}），跳过部署安全闸。\n`);
  process.exit(0);
}

if (dirty) {
  const files = dirty
    .split("\n")
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => line.trim());
  const extra = dirty.split("\n").filter(Boolean).length > 20 ? ["… 以及更多文件"] : [];
  fail([...files, ...extra]);
}

try {
  ahead = git("rev-list", "--count", `origin/${branch}..HEAD`);
} catch {
  // 远程分支还不存在（首次推送），不算问题。
  ahead = "0";
}

if (ahead !== "0") {
  fail([`当前分支 ${branch} 领先 origin/${branch} ${ahead} 个提交，尚未推送。`]);
}

if (branch !== "main") {
  console.warn(`⚠ 当前分支是 ${branch} 而非 main；CI 只跟随 main，本次部署不会被自动覆盖。\n`);
}

console.log(`✔ 工作区干净且已推送（${branch}），允许部署。\n`);
