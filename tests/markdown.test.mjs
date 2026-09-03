import assert from "node:assert/strict";
import test from "node:test";

import { getMarkdownSummary, renderMarkdownWithKaTeX, sanitizeHtml } from "../app/lib/markdown.ts";

test("Markdown XSS 纵深防御: 严密阻断 script、大小写变形、事件监听、SVG及伪协议注入", () => {
  // 1. 标准 Script 标签转义为实体字符，杜绝执行
  const scriptInput = `Hello <script>alert('xss')</script> World`;
  const scriptHtml = renderMarkdownWithKaTeX(scriptInput);
  assert.ok(!scriptHtml.includes("<script>"));
  assert.ok(scriptHtml.includes("&lt;script&gt;"));

  // 2. 大小写混写与畸形 Script 标签
  const dirtyCase = `<sCrIpt src="evil.js">alert(1)</ScRiPt>`;
  const cleanCase = sanitizeHtml(dirtyCase);
  assert.ok(!cleanCase.toLowerCase().includes("<script"));

  // 3. Img 标签与 onerror 事件
  const imgInput = `<img src="x" onerror="alert(1)">`;
  const imgHtml = renderMarkdownWithKaTeX(imgInput);
  assert.ok(!imgHtml.includes("<img src"));
  assert.ok(imgHtml.includes("&lt;img src="));

  // 4. SVG 标签与 onload 监听
  const svgInput = `<svg/onload=alert(document.domain)>`;
  const cleanSvg = sanitizeHtml(svgInput);
  assert.ok(!cleanSvg.includes("onload"));

  // 5. Iframe / Object / Embed 危险嵌入标签
  const iframeInput = `<iframe src="javascript:alert(1)"></iframe><object data="test"></object>`;
  const cleanIframe = sanitizeHtml(iframeInput);
  assert.ok(!cleanIframe.includes("<iframe"));
  assert.ok(!cleanIframe.includes("<object"));

  // 6. Markdown 链接中的 javascript: 与 vbscript: 与 data: 伪协议阻断
  const linkInput = `[点击跳转](javascript:alert(document.cookie))`;
  const linkHtml = renderMarkdownWithKaTeX(linkInput);
  assert.ok(!linkHtml.includes('href="javascript:'));
  assert.ok(linkHtml.includes('href="#"'));

  const dataUri = `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Click</a>`;
  const cleanData = sanitizeHtml(dataUri);
  assert.ok(!cleanData.includes("data:text/html"));
  assert.ok(cleanData.includes('href="#"'));
});

test("Markdown + KaTeX 边界测试: 转义符保护、代码块隔离、连续公式与 Markdown 符号冲突防护", () => {
  // 1. 转义符 \\$ 绝不触发 KaTeX 解析
  const escapedInput = `苹果价格是 \\$5，西瓜价格是 \\$10。`;
  const escapedHtml = renderMarkdownWithKaTeX(escapedInput);
  assert.ok(!escapedHtml.includes("katex"));
  assert.ok(escapedHtml.includes("$5"));
  assert.ok(escapedHtml.includes("$10"));

  // 2. 行内代码与多行代码块中的 $ 不被 KaTeX 劫持
  const inlineCodeInput = `在 PHP 中使用 \`$variable = $foo + $bar;\` 声明变量。`;
  const inlineCodeHtml = renderMarkdownWithKaTeX(inlineCodeInput);
  assert.ok(inlineCodeHtml.includes("<code>$variable = $foo + $bar;</code>"));
  assert.ok(!inlineCodeHtml.includes("katex"));

  const blockCodeInput = `\`\`\`bash\n$ npm install\n$ echo $PATH\n\`\`\``;
  const blockCodeHtml = renderMarkdownWithKaTeX(blockCodeInput);
  assert.ok(blockCodeHtml.includes("$ npm install"));
  assert.ok(blockCodeHtml.includes("$ echo $PATH"));
  assert.ok(!blockCodeHtml.includes("katex"));

  // 3. 行内连续公式正常渲染
  const multiInlineInput = `设 $a=1$, $b=2$，且 $x=1$$y=2$。`;
  const multiInlineHtml = renderMarkdownWithKaTeX(multiInlineInput);
  assert.ok(multiInlineHtml.includes("katex"));

  // 4. 多行块级 $$...$$ 公式
  const multilineBlockInput = `$$
\\begin{cases}
x + y = 1 \\\\
x - y = 0
\\end{cases}
$$`;
  const multilineBlockHtml = renderMarkdownWithKaTeX(multilineBlockInput);
  assert.ok(multilineBlockHtml.includes("katex-display"));

  // 5. 孤立未配对的单个 $ 不导致解析崩溃
  const singleDollarInput = `普通文本中的单 $ 符号，以及单独的一句话。`;
  const singleDollarHtml = renderMarkdownWithKaTeX(singleDollarInput);
  assert.ok(singleDollarHtml.includes("$ 符号"));

  // 6. 公式内部包含 Markdown 冲突符号 (_, *, \\, |, ~) 时公式不被 Markdown 提前破坏
  const complexFormula = `计算期望 $\\sum_{i=1}^n x_i^* \\cdot \\tilde{y}_i$ 与行列式 $\\det |A|$。`;
  const complexHtml = renderMarkdownWithKaTeX(complexFormula);
  assert.ok(complexHtml.includes("katex"));
  // 确保公式里的 _ 和 * 不会被 marked 解析成 <em>
  assert.ok(!complexHtml.includes("<em>i=1"));
});

test("Markdown Summary 提取: 正确剥离标题、将公式与代码块置换为占位符并精准截断", () => {
  const content = `# 操作系统调度算法
所谓调度就是解决多个任务在有限资源下的分配次序。
\`\`\`c
void schedule() { ... }
\`\`\`
设进程集合为 $P = \\{p_1, p_2, \\dots, p_n\\}$，优先级为 $pri(p_i)$。
详细调度策略请参阅 [王道考研](https://example.com/os)。`;

  // 1. 验证关键占位符置换与符号过滤
  const fullSummary = getMarkdownSummary(content, 300);
  assert.ok(!fullSummary.startsWith("#"));
  assert.ok(fullSummary.includes("操作系统调度算法"));
  assert.ok(fullSummary.includes("[代码块]"));
  assert.ok(fullSummary.includes("[公式]"));
  assert.ok(fullSummary.includes("王道考研"));
  assert.ok(!fullSummary.includes("https://example.com"));

  // 2. 验证精确截断与省略号附加 (20 字符 + 1个字符的 Unicode 省略号 "…")
  const shortSummary = getMarkdownSummary(content, 20);
  assert.equal(shortSummary.length, 21);
  assert.ok(shortSummary.endsWith("…"));

  // 3. 空值兜底
  assert.equal(getMarkdownSummary("", 50), "");
});
