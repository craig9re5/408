import { marked } from "marked";
import katex from "katex";

/**
 * Custom Markdown + KaTeX rendering function:
 * Shields LaTeX equations ($...$ and $$...$$) from Markdown parser collisions,
 * executes marked for GFM elements (tables, checkboxes, etc.),
 * and hydrates KaTeX tokens into rendered HTML.
 */
export function renderMarkdownWithKaTeX(markdown: string): string {
  if (!markdown) return "";

  const mathBlocks: string[] = [];
  const mathInlines: string[] = [];

  // Step 1: Shield Block Math $$...$$
  let processed = markdown.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math: string) => {
    const placeholder = `%%KATEX_BLOCK_${mathBlocks.length}%%`;
    mathBlocks.push(math.trim());
    return placeholder;
  });

  // Step 2: Shield Inline Math $...$ (ensure not preceded/followed by other $)
  processed = processed.replace(/(^|[^\$])\$([^\$\n]+?)\$(?!\$)/g, (_match, prefix: string, math: string) => {
    const placeholder = `%%KATEX_INLINE_${mathInlines.length}%%`;
    mathInlines.push(math.trim());
    return `${prefix}${placeholder}`;
  });

  // Step 3: Parse Markdown with GFM enabled
  let html = marked.parse(processed, {
    gfm: true,
    breaks: true,
  }) as string;

  // Step 4: Restore Block Math
  mathBlocks.forEach((math, index) => {
    let rendered = "";
    try {
      rendered = katex.renderToString(math, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      rendered = `<pre class="katex-error">${escapeHtml(math)}</pre>`;
    }
    const token = new RegExp(`<p>\\s*%%KATEX_BLOCK_${index}%%\\s*<\\/p>|%%KATEX_BLOCK_${index}%%`, "g");
    html = html.replace(token, rendered);
  });

  // Step 5: Restore Inline Math
  mathInlines.forEach((math, index) => {
    let rendered = "";
    try {
      rendered = katex.renderToString(math, {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      rendered = `<code class="katex-error">${escapeHtml(math)}</code>`;
    }
    const token = new RegExp(`%%KATEX_INLINE_${index}%%`, "g");
    html = html.replace(token, rendered);
  });

  return html;
}

/**
 * Truncates markdown content to a plain-text summary suitable for preview cards.
 */
export function getMarkdownSummary(markdown: string, maxLength = 260): string {
  if (!markdown) return "";
  const plain = markdown
    .replace(/\$\$[\s\S]+?\$\$/g, " [公式] ")
    .replace(/\$[^\$\n]+?\$/g, " [公式] ")
    .replace(/```[\s\S]*?```/g, " [代码块] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_~>]/g, "")
    .replace(/\n+/g, " ")
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength)}…`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
