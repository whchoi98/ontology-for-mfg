'use client';

// Shared markdown renderer used by chat / insights / eight-d / compliance.
// react-markdown v10 + remark-gfm covers tables, task lists, strikethrough,
// autolinks, plus the standard inline + block grammar. Styles live in
// globals.css under `.chat-markdown` so every consumer gets the same look
// without re-importing a CSS module.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownView({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`chat-markdown ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
