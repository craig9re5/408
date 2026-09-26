import { Marked } from "marked";
import katex from "katex";

const markdownParser = new Marked({ gfm: true, breaks: true });
markdownParser.use({
  renderer: {
    link({ href, title, tokens }) {
      const safeHref = safeMarkdownUrl(href);
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(safeHref)}"${titleAttribute}>${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, title, text }) {
      const safeSrc = safeMarkdownUrl(href);
      if (safeSrc === "#") return escapeHtml(text);
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(text)}"${titleAttribute}>`;
    },
  },
});

/**
 * Custom Markdown + KaTeX rendering function:
 * 1. Shields code blocks and inline code from formula extraction
 * 2. Shields escaped \$
 * 3. Shields multiline $$...$$ and inline $...$ formulas
 * 4. Escapes raw HTML tags to prevent XSS injection
 * 5. Runs marked for GFM elements (tables, checkboxes, etc.)
 * 6. Sanitizes dangerous attributes (e.g. javascript: URLs, onerror handlers)
 * 7. Hydrates KaTeX tokens into rendered HTML.
 */
export function renderMarkdownWithKaTeX(markdown: string): string {
  if (!markdown || !markdown.trim()) return "";

  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];
  const escapedDollars: string[] = [];
  const mathBlocks: string[] = [];
  const mathInlines: string[] = [];

  let processed = markdown;

  // Step 1: Shield Fenced Code Blocks (```...``` or ~~~...~~~)
  processed = processed.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
    codeBlocks.push(match);
    return placeholder;
  });

  // Step 2: Shield Inline Code Spans (`...` or ``...``)
  processed = processed.replace(/(`+)([\s\S]*?)\1/g, (match) => {
    const placeholder = `%%INLINE_CODE_${inlineCodes.length}%%`;
    inlineCodes.push(match);
    return placeholder;
  });

  // Step 3: Shield Escaped Dollars (\$ -> placeholder)
  processed = processed.replace(/\\\$/g, () => {
    const placeholder = `%%ESCAPED_DOLLAR_${escapedDollars.length}%%`;
    escapedDollars.push("$");
    return placeholder;
  });

  // Step 4: Shield Multiline Block Math $$...$$
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math: string) => {
    const placeholder = `%%KATEX_BLOCK_${mathBlocks.length}%%`;
    mathBlocks.push(math.trim());
    return placeholder;
  });

  // Step 5: Shield Inline Math $...$ (must not be empty, not spanning newlines)
  processed = processed.replace(/(^|[^\$])\$([^\$\r\n]+?)\$(?!\$)/g, (_match, prefix: string, math: string) => {
    if (!math.trim()) return `${prefix}$${math}$`;
    const placeholder = `%%KATEX_INLINE_${mathInlines.length}%%`;
    mathInlines.push(math.trim());
    return `${prefix}${placeholder}`;
  });

  // Step 6: Escape raw HTML outside code & math to neutralize any injected HTML/scripts
  processed = processed.replace(/</g, "%%HTML_LT%%").replace(/>/g, "%%HTML_GT%%");

  // Step 7: Restore Escaped Dollars, Inline Code, and Code Blocks
  escapedDollars.forEach((val, idx) => {
    processed = processed.replaceAll(`%%ESCAPED_DOLLAR_${idx}%%`, () => val);
  });
  inlineCodes.forEach((val, idx) => {
    processed = processed.replaceAll(`%%INLINE_CODE_${idx}%%`, () => val);
  });
  codeBlocks.forEach((val, idx) => {
    processed = processed.replaceAll(`%%CODE_BLOCK_${idx}%%`, () => val);
  });

  // Step 8: Parse Markdown with GFM enabled
  let html = markdownParser.parse(processed) as string;

  // Restore escaped HTML entities
  html = html.replace(/%%HTML_LT%%/g, "&lt;").replace(/%%HTML_GT%%/g, "&gt;");

  // Step 9: Sanitize HTML against XSS vectors (e.g. javascript: links, onerror handlers)
  html = sanitizeHtml(html);

  // Step 10: Restore Block Math
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
    html = html.replace(token, () => rendered);
  });

  // Step 11: Restore Inline Math
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
    html = html.replace(token, () => rendered);
  });

  return html;
}

/**
 * Strict sanitizer for HTML strings to guarantee XSS immunity.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  let clean = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<object[\s\S]*?<\/object\s*>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed\s*>/gi, "")
    .replace(/<form[\s\S]*?<\/form\s*>/gi, "")
    .replace(/<base[\s\S]*?>/gi, "");

  // Remove event handlers like onerror=..., onclick=..., onload=... (supporting spaces and slash delimiters)
  clean = clean.replace(/[\s/]+on[a-zA-Z]+\s*=\s*(['"]).*?\1/gi, "");
  clean = clean.replace(/[\s/]+on[a-zA-Z]+\s*=\s*[^ >]+/gi, "");

  // Neutralize dangerous javascript:, vbscript:, data:text/html URIs in href and src
  clean = clean.replace(/(href|src)\s*=\s*(['"])\s*(?:javascript:|vbscript:|data:\s*(?:text\/html|text\/javascript|application\/javascript)).*?\2/gi, '$1="#"');
  clean = clean.replace(/(href|src)\s*=\s*(?:javascript:|vbscript:|data:\s*(?:text\/html|text\/javascript|application\/javascript))[^\s>]+/gi, '$1="#"');
  // Re-emit parser-owned URL attributes with HTML escaping. This prevents
  // entity references from becoming a protocol after the browser parses HTML.
  clean = clean.replace(/\b(href|src)\s*=\s*(['"])(.*?)\2/gi, (_match, attribute: string, _quote: string, value: string) =>
    `${attribute}="${escapeHtml(safeMarkdownUrl(value))}"`);

  return clean;
}

function safeMarkdownUrl(value: string): string {
  const url = value.trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return "#";
  const colon = url.indexOf(":");
  const firstPathDelimiter = url.search(/[/?#]/);
  if (colon >= 0 && url.slice(0, colon).includes("&")) return "#";
  if (colon >= 0 && (firstPathDelimiter < 0 || colon < firstPathDelimiter)
    && !/^[a-z][a-z0-9+.-]*:/i.test(url)) return "#";
  try {
    const parsed = new URL(url, "https://markdown.invalid/");
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : "#";
  } catch {
    return "#";
  }
}

/**
 * Truncates markdown content to a plain-text summary suitable for preview cards.
 */
export function getMarkdownSummary(markdown: string, maxLength = 260): string {
  if (!markdown) return "";
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " [代码块] ")
    .replace(/~~~[\s\S]*?~~~/g, " [代码块] ")
    .replace(/\$\$[\s\S]+?\$\$/g, " [公式] ")
    .replace(/\\?\$(?:[^\$\r\n]+?)\$/g, " [公式] ")
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
