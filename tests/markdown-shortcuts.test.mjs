import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCode,
  applyHeading,
  applyLink,
  applyMath,
  applyTableTemplate,
  handleAutoPair,
  handleSmartEnter,
  handleTabKey,
  toggleLinePrefix,
  wrapSelection,
} from "../app/lib/markdown-editor-utils.ts";

test("Markdown Shortcuts: wrapSelection 加粗与斜体包裹及 Toggle 反包裹与光标落点", () => {
  const text = "Hello world";
  // 1. 选中 "world" 加粗
  const start = 6;
  const end = 11;
  const boldRes = wrapSelection(text, start, end, "**", "**", "加粗文本");
  assert.equal(boldRes.newText, "Hello **world**");
  assert.equal(boldRes.selectionStart, 8);
  assert.equal(boldRes.selectionEnd, 13);

  // 2. 选中 "**world**" 再次按加粗 -> 取消加粗 (Toggle)
  const wrappedText = "Hello **world**";
  const unwrapRes1 = wrapSelection(wrappedText, 6, 15, "**", "**");
  assert.equal(unwrapRes1.newText, "Hello world");
  assert.equal(unwrapRes1.selectionStart, 6);
  assert.equal(unwrapRes1.selectionEnd, 11);

  // 3. 光标在 "**world**" 内部选中 "world"，前后包含 "**" -> 取消加粗
  const unwrapRes2 = wrapSelection(wrappedText, 8, 13, "**", "**");
  assert.equal(unwrapRes2.newText, "Hello world");
  assert.equal(unwrapRes2.selectionStart, 6);
  assert.equal(unwrapRes2.selectionEnd, 11);

  // 4. 无选中文字时插入占位符，光标高亮占位文字
  const emptyRes = wrapSelection("Hello ", 6, 6, "**", "**", "加粗");
  assert.equal(emptyRes.newText, "Hello **加粗**");
  assert.equal(emptyRes.selectionStart, 8);
  assert.equal(emptyRes.selectionEnd, 10);
});

test("Markdown Shortcuts: applyLink 链接处理与 URL 自动识别及光标精准聚焦", () => {
  // 1. 选中文本 -> 插入链接模板，光标高亮 URL 部分便于立即输入网址
  const res1 = applyLink("访问王道论坛获取资料", 2, 6);
  assert.equal(res1.newText, "访问[王道论坛](https://)获取资料");
  assert.equal(res1.selectionStart, 9); // "访问[王道论坛](".length = 2 + 1 + 4 + 2 = 9
  assert.equal(res1.selectionEnd, 17); // 9 + "https://".length = 17

  // 2. 选中 URL -> 插入链接模板，光标高亮 [链接文本] 便于修改说明
  const res2 = applyLink("官网 https://example.com 在此", 3, 22);
  assert.equal(res2.newText, "官网 [链接文本](https://example.com) 在此");
  assert.equal(res2.selectionStart, 4); // "官网 [".length
  assert.equal(res2.selectionEnd, 8); // "官网 [链接文本".length

  // 3. 无选区插入
  const res3 = applyLink("", 0, 0);
  assert.equal(res3.newText, "[链接文本](https://)");
  assert.equal(res3.selectionStart, 1);
  assert.equal(res3.selectionEnd, 5);
});

test("Markdown Shortcuts: applyMath 与 applyCode 单行与多行格式及光标区间", () => {
  // 1. 单行数学公式
  const mathInline = applyMath("定理 O(n log n) 复杂度", 3, 13);
  assert.equal(mathInline.newText, "定理 $O(n log n)$ 复杂度");
  assert.equal(mathInline.selectionStart, 4);
  assert.equal(mathInline.selectionEnd, 14);

  // 2. 多行公式块
  const mathBlock = applyMath("x + y = 1\nx - y = 0", 0, 19);
  assert.equal(mathBlock.newText, "$$\nx + y = 1\nx - y = 0\n$$");
  assert.equal(mathBlock.selectionStart, 3);
  assert.equal(mathBlock.selectionEnd, 22);

  // 3. 单行代码
  const codeInline = applyCode("const a = 1;", 0, 12);
  assert.equal(codeInline.newText, "`const a = 1;`");
  assert.equal(codeInline.selectionStart, 1);
  assert.equal(codeInline.selectionEnd, 13);

  // 4. 多行代码块
  const codeText = "int main() {\n  return 0;\n}";
  const codeBlock = applyCode(codeText, 0, codeText.length);
  assert.equal(codeBlock.newText, "```cpp\nint main() {\n  return 0;\n}\n```");
});

test("Markdown Shortcuts: applyHeading 标题级别切换、清除及光标位置调整", () => {
  const text = "段落标题内容";
  // 1. 设置为 1 级标题
  const h1 = applyHeading(text, 2, 4, 1);
  assert.equal(h1.newText, "# 段落标题内容");
  assert.equal(h1.selectionStart, 4); // 原光标 2 向后顺延 2 个字符 ("# ")
  assert.equal(h1.selectionEnd, 6);

  // 2. 将 1 级标题切换为 2 级标题
  const h2 = applyHeading(h1.newText, 4, 6, 2);
  assert.equal(h2.newText, "## 段落标题内容");
  assert.equal(h2.selectionStart, 5);
  assert.equal(h2.selectionEnd, 7);

  // 3. 清除标题格式 (level 0)
  const h0 = applyHeading(h2.newText, 5, 7, 0);
  assert.equal(h0.newText, "段落标题内容");
  assert.equal(h0.selectionStart, 2);
  assert.equal(h0.selectionEnd, 4);
});

test("Markdown Shortcuts: toggleLinePrefix 列表、待办与引用批量处理及反切换", () => {
  const text = "第一点\n第二点\n第三点";
  // 1. 无序列表
  const bullet = toggleLinePrefix(text, 0, text.length, "bullet");
  assert.equal(bullet.newText, "- 第一点\n- 第二点\n- 第三点");

  // 2. 再次按无序列表 -> 取消列表
  const unbullet = toggleLinePrefix(bullet.newText, 0, bullet.newText.length, "bullet");
  assert.equal(unbullet.newText, "第一点\n第二点\n第三点");

  // 3. 有序列表（自动编号）
  const numbered = toggleLinePrefix(text, 0, text.length, "number");
  assert.equal(numbered.newText, "1. 第一点\n2. 第二点\n3. 第三点");

  // 4. 任务列表
  const task = toggleLinePrefix(text, 0, text.length, "task");
  assert.equal(task.newText, "- [ ] 第一点\n- [ ] 第二点\n- [ ] 第三点");

  // 5. 引用块
  const quote = toggleLinePrefix(text, 0, text.length, "quote");
  assert.equal(quote.newText, "> 第一点\n> 第二点\n> 第三点");
});

test("Markdown Shortcuts: handleTabKey 缩进与 Shift+Tab 反缩进", () => {
  // 1. 单光标未选中文本按 Tab -> 插入 2 空格
  const tabSingle = handleTabKey("console.log()", 0, 0, false);
  assert.equal(tabSingle.newText, "  console.log()");
  assert.equal(tabSingle.selectionStart, 2);

  // 2. 多行选区按 Tab -> 每行缩进 2 空格
  const multiline = "line1\nline2";
  const tabMulti = handleTabKey(multiline, 0, multiline.length, false);
  assert.equal(tabMulti.newText, "  line1\n  line2");

  // 3. 多行选区按 Shift+Tab -> 反缩进 2 空格
  const unTabMulti = handleTabKey(tabMulti.newText, 0, tabMulti.newText.length, true);
  assert.equal(unTabMulti.newText, "line1\nline2");
});

test("Markdown Shortcuts: handleSmartEnter 智能回车续行与空行退出", () => {
  // 1. 无序列表续行
  const bText = "- 第一项心得";
  const bEnter = handleSmartEnter(bText, bText.length, bText.length);
  assert.ok(bEnter);
  assert.equal(bEnter.newText, "- 第一项心得\n- ");

  // 2. 空无序列表按回车 -> 清除符号退出列表
  const emptyBText = "- ";
  const emptyBEnter = handleSmartEnter(emptyBText, emptyBText.length, emptyBText.length);
  assert.ok(emptyBEnter);
  assert.equal(emptyBEnter.newText, "");

  // 3. 有序列表续行（自动递增）
  const numText = "1. 第一条思路";
  const numEnter = handleSmartEnter(numText, numText.length, numText.length);
  assert.ok(numEnter);
  assert.equal(numEnter.newText, "1. 第一条思路\n2. ");

  // 4. 任务列表续行
  const taskText = "- [ ] 复习操作系统第2章";
  const taskEnter = handleSmartEnter(taskText, taskText.length, taskText.length);
  assert.ok(taskEnter);
  assert.equal(taskEnter.newText, "- [ ] 复习操作系统第2章\n- [ ] ");

  // 5. 引用块续行
  const quoteText = "> 摘录重要定理";
  const quoteEnter = handleSmartEnter(quoteText, quoteText.length, quoteText.length);
  assert.ok(quoteEnter);
  assert.equal(quoteEnter.newText, "> 摘录重要定理\n> ");
});

test("Markdown Shortcuts: handleAutoPair 选中文本自动配对符号及光标落点", () => {
  const text = "selected";
  // 1. 括号配对
  const paren = handleAutoPair(text, 0, text.length, "(");
  assert.equal(paren?.newText, "(selected)");
  assert.equal(paren?.selectionStart, 1);
  assert.equal(paren?.selectionEnd, 9);

  // 2. 中括号配对
  const bracket = handleAutoPair(text, 0, text.length, "[");
  assert.equal(bracket?.newText, "[selected]");
  assert.equal(bracket?.selectionStart, 1);
  assert.equal(bracket?.selectionEnd, 9);

  // 3. 双引号配对
  const quote = handleAutoPair(text, 0, text.length, '"');
  assert.equal(quote?.newText, '"selected"');

  // 4. 反引号配对
  const backtick = handleAutoPair(text, 0, text.length, "`");
  assert.equal(backtick?.newText, "`selected`");

  // 5. 美元符号公式配对
  const dollar = handleAutoPair(text, 0, text.length, "$");
  assert.equal(dollar?.newText, "$selected$");
});

test("Markdown Shortcuts: applyTableTemplate 表格模板插入及光标落点精准断言", () => {
  const res = applyTableTemplate("前置文本\n", 5, 5);
  const expectedTable = "\n| 序号 | 知识点 / 定理 | 掌握度 / 备注 |\n| :--- | :--- | :--- |\n| 1 | 核心概念 | 熟练掌握 |\n| 2 | 算法推导 | 待强化 |\n";
  assert.equal(res.newText, "前置文本\n" + expectedTable);
  assert.equal(res.selectionStart, 5 + expectedTable.length);
  assert.equal(res.selectionEnd, 5 + expectedTable.length);
});
