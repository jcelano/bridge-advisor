import React, { useMemo } from 'react';
import { renderMarkdown } from '../markdown.js';

const styles = `
  .md-response h1, .md-response h2, .md-response h3, .md-response h4 {
    color: #d4af37;
    margin: 16px 0 8px 0;
    font-weight: 700;
  }
  .md-response h1 { font-size: 18px; }
  .md-response h2 { font-size: 16px; }
  .md-response h3 { font-size: 14px; color: #b8d4b0; }
  .md-response h4 { font-size: 13px; color: #8aaa82; }

  .md-response p {
    color: #b0d0b0;
    font-size: 14px;
    line-height: 1.8;
    margin: 0 0 10px 0;
  }

  .md-response strong { color: #d0e8c8; font-weight: 700; }
  .md-response em { color: #a0c898; font-style: italic; }

  .md-response ul, .md-response ol {
    margin: 8px 0 12px 0;
    padding-left: 24px;
  }

  .md-response li {
    color: #b0d0b0;
    font-size: 14px;
    line-height: 1.7;
    margin-bottom: 4px;
  }

  .md-response li::marker {
    color: #4a8a4a;
  }

  .md-response code {
    background: #0d1a0d;
    color: #8bdb6a;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
  }

  .md-response pre {
    background: #060d06;
    border: 1px solid #1a2a1a;
    border-radius: 6px;
    padding: 12px;
    margin: 10px 0;
    overflow-x: auto;
  }

  .md-response pre code {
    background: none;
    padding: 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .md-response hr {
    border: none;
    border-top: 1px solid #1a2a1a;
    margin: 16px 0;
  }
`;

export default function MarkdownResponse({ text }) {
  const html = useMemo(() => renderMarkdown(text), [text]);

  return (
    <>
      <style>{styles}</style>
      <div className="md-response" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
