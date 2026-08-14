"use client";

import { useMemo } from "react";
import { renderMarkdownWithKaTeX, getMarkdownSummary } from "../lib/markdown.ts";

export { renderMarkdownWithKaTeX, getMarkdownSummary };

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdownWithKaTeX(content), [content]);

  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
