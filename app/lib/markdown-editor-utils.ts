/**
 * Markdown Editor Utilities
 * Handles text transformations, shortcuts, selection wrapping, smart list continuation, and indentation.
 */

export interface TextSelectionResult {
  newText: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wraps or unwraps selected text with prefix and suffix.
 * Supports toggle behavior (if text is already wrapped, removes wrapper).
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  defaultPlaceholder = ""
): TextSelectionResult {
  const selected = text.substring(start, end);

  // Check 1: Selection itself starts with prefix and ends with suffix (e.g. user selected "**bold**")
  if (
    selected.length >= prefix.length + suffix.length &&
    selected.startsWith(prefix) &&
    selected.endsWith(suffix)
  ) {
    const unwrapped = selected.substring(prefix.length, selected.length - suffix.length);
    const newText = text.substring(0, start) + unwrapped + text.substring(end);
    return {
      newText,
      selectionStart: start,
      selectionEnd: start + unwrapped.length,
    };
  }

  // Check 2: Text surrounding the selection has the prefix and suffix (e.g. "**|bold|**")
  const before = text.substring(Math.max(0, start - prefix.length), start);
  const after = text.substring(end, Math.min(text.length, end + suffix.length));
  if (before === prefix && after === suffix) {
    const newText =
      text.substring(0, start - prefix.length) + selected + text.substring(end + suffix.length);
    const newStart = start - prefix.length;
    return {
      newText,
      selectionStart: newStart,
      selectionEnd: newStart + selected.length,
    };
  }

  // Case 3: No text selected (collapsed cursor)
  if (start === end) {
    const placeholder = defaultPlaceholder;
    const newText = text.substring(0, start) + prefix + placeholder + suffix + text.substring(end);
    if (placeholder) {
      return {
        newText,
        selectionStart: start + prefix.length,
        selectionEnd: start + prefix.length + placeholder.length,
      };
    }
    const cursor = start + prefix.length;
    return {
      newText,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  // Case 4: Normal wrap of selected text
  const newText = text.substring(0, start) + prefix + selected + suffix + text.substring(end);
  return {
    newText,
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + selected.length,
  };
}

/**
 * Inserts a Markdown link or wraps selected text in a link structure.
 */
export function applyLink(text: string, start: number, end: number): TextSelectionResult {
  const selected = text.substring(start, end).trim();

  // If selected text looks like a URL
  if (/^https?:\/\//i.test(selected)) {
    const newText = text.substring(0, start) + `[链接文本](${selected})` + text.substring(end);
    return {
      newText,
      selectionStart: start + 1,
      selectionEnd: start + 1 + "链接文本".length,
    };
  }

  if (selected.length > 0) {
    const newText = text.substring(0, start) + `[${selected}](https://)` + text.substring(end);
    const urlStart = start + selected.length + 3;
    return {
      newText,
      selectionStart: urlStart,
      selectionEnd: urlStart + "https://".length,
    };
  }

  const newText = text.substring(0, start) + `[链接文本](https://)` + text.substring(end);
  return {
    newText,
    selectionStart: start + 1,
    selectionEnd: start + 1 + "链接文本".length,
  };
}

/**
 * Inserts or wraps LaTeX math formula ($...$ or $$...$$).
 */
export function applyMath(text: string, start: number, end: number): TextSelectionResult {
  const selected = text.substring(start, end);

  if (selected.includes("\n")) {
    // Multi-line block formula
    return wrapSelection(text, start, end, "$$\n", "\n$$", "E = mc^2");
  }

  return wrapSelection(text, start, end, "$", "$", "公式");
}

/**
 * Inserts or wraps code (`...` or ```cpp\n...\n```).
 */
export function applyCode(text: string, start: number, end: number): TextSelectionResult {
  const selected = text.substring(start, end);

  if (selected.includes("\n")) {
    return wrapSelection(text, start, end, "```cpp\n", "\n```", "// 代码");
  }

  return wrapSelection(text, start, end, "`", "`", "代码");
}

/**
 * Sets heading level (1 to 6, or 0 for normal text) on current line.
 */
export function applyHeading(
  text: string,
  start: number,
  end: number,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 0
): TextSelectionResult {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;

  const line = text.substring(lineStart, lineEnd);
  const cleanLine = line.replace(/^#{1,6}\s+/, "");

  let newLine = cleanLine;
  if (level > 0) {
    newLine = `${"#".repeat(level)} ${cleanLine}`;
  }

  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  const delta = newLine.length - line.length;

  return {
    newText,
    selectionStart: Math.max(lineStart, start + delta),
    selectionEnd: Math.max(lineStart, end + delta),
  };
}

/**
 * Toggles line prefix (such as "- ", "1. ", "- [ ] ", "> ") across selected lines.
 */
export function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  kind: "bullet" | "number" | "task" | "quote"
): TextSelectionResult {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;

  const block = text.substring(lineStart, lineEnd);
  const lines = block.split("\n");

  const bulletRegex = /^(\s*)(?:[-*+]|\d+\.|- \[(?: |x|X)\]|>)\s+/;

  // Determine if all lines currently have this specific prefix
  const isAllKind = lines.every((l) => {
    if (kind === "bullet") return /^\s*[-*+]\s+/.test(l);
    if (kind === "number") return /^\s*\d+\.\s+/.test(l);
    if (kind === "task") return /^\s*[-*+]\s+\[(?: |x|X)\]\s+/.test(l);
    if (kind === "quote") return /^\s*>\s+/.test(l);
    return false;
  });

  const newLines = lines.map((line, idx) => {
    if (isAllKind) {
      // Remove the prefix
      return line.replace(bulletRegex, "$1");
    }

    // Strip other list/quote prefixes first
    const clean = line.replace(bulletRegex, "$1");
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const content = clean.trimStart();

    if (kind === "bullet") return `${indent}- ${content}`;
    if (kind === "number") return `${indent}${idx + 1}. ${content}`;
    if (kind === "task") return `${indent}- [ ] ${content}`;
    if (kind === "quote") return `${indent}> ${content}`;
    return line;
  });

  const newBlock = newLines.join("\n");
  const newText = text.substring(0, lineStart) + newBlock + text.substring(lineEnd);

  return {
    newText,
    selectionStart: lineStart,
    selectionEnd: lineStart + newBlock.length,
  };
}

/**
 * Handles Tab (indent) and Shift+Tab (outdent) with 2 spaces.
 */
export function handleTabKey(
  text: string,
  start: number,
  end: number,
  isShift: boolean
): TextSelectionResult {
  // Case 1: Single line without selection, not shifting -> insert 2 spaces at cursor
  if (start === end && !isShift && !text.substring(start, end).includes("\n")) {
    const newText = text.substring(0, start) + "  " + text.substring(end);
    return {
      newText,
      selectionStart: start + 2,
      selectionEnd: start + 2,
    };
  }

  // Case 2: Multiline selection or Shift+Tab outdent
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;

  const block = text.substring(lineStart, lineEnd);
  const lines = block.split("\n");

  let totalDelta = 0;
  const newLines = lines.map((line) => {
    if (isShift) {
      if (line.startsWith("  ")) {
        totalDelta -= 2;
        return line.slice(2);
      }
      if (line.startsWith(" ") || line.startsWith("\t")) {
        totalDelta -= 1;
        return line.slice(1);
      }
      return line;
    } else {
      totalDelta += 2;
      return "  " + line;
    }
  });

  const newBlock = newLines.join("\n");
  const newText = text.substring(0, lineStart) + newBlock + text.substring(lineEnd);

  return {
    newText,
    selectionStart: lineStart,
    selectionEnd: lineStart + newBlock.length,
  };
}

/**
 * Handles Enter key for smart list / task / quote continuations.
 * Returns null if standard Enter behavior should occur.
 */
export function handleSmartEnter(text: string, start: number, end: number): TextSelectionResult | null {
  if (start !== end) return null; // Don't intercept when a range is selected

  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineBeforeCursor = text.substring(lineStart, start);
  const lineAfterCursorPos = text.indexOf("\n", start);
  const lineAfterCursor = text.substring(start, lineAfterCursorPos === -1 ? text.length : lineAfterCursorPos);

  // 1. Task List empty item: e.g. "- [ ] "
  const emptyTaskMatch = lineBeforeCursor.match(/^(\s*[-*+]\s+\[(?: |x|X)\])\s*$/);
  if (emptyTaskMatch && !lineAfterCursor.trim()) {
    // Clear the task bullet on current line and exit list
    const newText = text.substring(0, lineStart) + text.substring(start);
    return {
      newText,
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }

  // 2. Task List item with content: e.g. "- [ ] some task"
  const taskMatch = lineBeforeCursor.match(/^(\s*)([-*+])\s+\[(?: |x|X)\]\s+(.+)$/);
  if (taskMatch) {
    const indent = taskMatch[1];
    const bullet = taskMatch[2];
    const insertStr = `\n${indent}${bullet} [ ] `;
    const newText = text.substring(0, start) + insertStr + text.substring(start);
    const newPos = start + insertStr.length;
    return {
      newText,
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }

  // 3. Unordered List empty item: e.g. "- "
  const emptyBulletMatch = lineBeforeCursor.match(/^(\s*[-*+])\s*$/);
  if (emptyBulletMatch && !lineAfterCursor.trim()) {
    const newText = text.substring(0, lineStart) + text.substring(start);
    return {
      newText,
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }

  // 4. Unordered List item with content: e.g. "- item"
  const bulletMatch = lineBeforeCursor.match(/^(\s*)([-*+])\s+(.+)$/);
  if (bulletMatch) {
    const indent = bulletMatch[1];
    const bullet = bulletMatch[2];
    const insertStr = `\n${indent}${bullet} `;
    const newText = text.substring(0, start) + insertStr + text.substring(start);
    const newPos = start + insertStr.length;
    return {
      newText,
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }

  // 5. Ordered List empty item: e.g. "1. "
  const emptyNumMatch = lineBeforeCursor.match(/^(\s*\d+\.)\s*$/);
  if (emptyNumMatch && !lineAfterCursor.trim()) {
    const newText = text.substring(0, lineStart) + text.substring(start);
    return {
      newText,
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }

  // 6. Ordered List item with content: e.g. "1. item"
  const numMatch = lineBeforeCursor.match(/^(\s*)(\d+)\.\s+(.+)$/);
  if (numMatch) {
    const indent = numMatch[1];
    const nextNum = parseInt(numMatch[2], 10) + 1;
    const insertStr = `\n${indent}${nextNum}. `;
    const newText = text.substring(0, start) + insertStr + text.substring(start);
    const newPos = start + insertStr.length;
    return {
      newText,
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }

  // 7. Blockquote empty item: e.g. "> "
  const emptyQuoteMatch = lineBeforeCursor.match(/^(\s*>+)\s*$/);
  if (emptyQuoteMatch && !lineAfterCursor.trim()) {
    const newText = text.substring(0, lineStart) + text.substring(start);
    return {
      newText,
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }

  // 8. Blockquote with content: e.g. "> some quote"
  const quoteMatch = lineBeforeCursor.match(/^(\s*>+)\s*(.+)$/);
  if (quoteMatch) {
    const quotePrefix = quoteMatch[1];
    const insertStr = `\n${quotePrefix} `;
    const newText = text.substring(0, start) + insertStr + text.substring(start);
    const newPos = start + insertStr.length;
    return {
      newText,
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }

  return null;
}

/**
 * Handles bracket/quote auto-pairing when text is selected.
 */
export function handleAutoPair(
  text: string,
  start: number,
  end: number,
  char: string
): TextSelectionResult | null {
  if (start >= end) return null;

  const pairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
    '"': '"',
    "'": "'",
    "`": "`",
    $: "$",
    "《": "》",
    "（": "）",
    "【": "】",
    "“": "”",
  };

  const closeChar = pairs[char];
  if (!closeChar) return null;

  const selected = text.substring(start, end);
  const newText = text.substring(0, start) + char + selected + closeChar + text.substring(end);
  return {
    newText,
    selectionStart: start + char.length,
    selectionEnd: start + char.length + selected.length,
  };
}

/**
 * Inserts a sample Markdown table.
 */
export function applyTableTemplate(text: string, start: number, end: number): TextSelectionResult {
  const table =
    "\n| 序号 | 知识点 / 定理 | 掌握度 / 备注 |\n| :--- | :--- | :--- |\n| 1 | 核心概念 | 熟练掌握 |\n| 2 | 算法推导 | 待强化 |\n";
  const newText = text.substring(0, start) + table + text.substring(end);
  return {
    newText,
    selectionStart: start + table.length,
    selectionEnd: start + table.length,
  };
}

/**
 * Safely applies text changes to a textarea DOM element and updates React state.
 */
export function applyTextResultToTextarea(
  textarea: HTMLTextAreaElement,
  result: TextSelectionResult,
  onChange: (val: string) => void
) {
  textarea.value = result.newText;
  onChange(result.newText);
  textarea.focus();
  textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
}
