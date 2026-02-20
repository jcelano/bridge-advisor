/**
 * Lightweight markdown-to-HTML converter.
 * Handles the subset Claude typically outputs: headings, bold, italic,
 * bullet lists, numbered lists, inline code, code blocks, and paragraphs.
 *
 * No dependencies — just string processing.
 */
export function renderMarkdown(text) {
  if (!text) return '';

  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-code-block"><code>${code.trimEnd()}</code></pre>`;
  });

  // Process line by line
  const lines = html.split('\n');
  const output = [];
  let inList = false;
  let listType = '';
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip lines inside code blocks (already processed)
    if (line.includes('<pre class="md-code-block">')) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
      // Collect until </pre>
      let block = line;
      while (!block.includes('</pre>') && i + 1 < lines.length) {
        i++;
        block += '\n' + lines[i];
      }
      output.push(block);
      continue;
    }

    // Apply inline formatting
    line = applyInline(line);

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
      const level = headingMatch[1].length;
      output.push(`<h${level} class="md-h${level}">${headingMatch[2]}</h${level}>`);
      continue;
    }

    // Bullet list items
    const bulletMatch = line.match(/^[\s]*[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
      if (!inList || listType !== 'ul') {
        if (inList) output.push('</ol>');
        output.push('<ul class="md-list">');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${bulletMatch[1]}</li>`);
      continue;
    }

    // Numbered list items
    const numMatch = line.match(/^[\s]*(\d+)[.)]\s+(.+)$/);
    if (numMatch) {
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
      if (!inList || listType !== 'ol') {
        if (inList) output.push('</ul>');
        output.push('<ol class="md-list">');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${numMatch[2]}</li>`);
      continue;
    }

    // Close list if we're no longer in one
    if (inList && !bulletMatch && !numMatch) {
      output.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
      output.push('<hr class="md-hr" />');
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
      continue;
    }

    // Regular text → paragraph
    if (!inParagraph) {
      output.push('<p class="md-p">');
      inParagraph = true;
    } else {
      output.push('<br/>');
    }
    output.push(line);
  }

  // Close any open tags
  if (inParagraph) output.push('</p>');
  if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');

  return output.join('\n');
}

function applyInline(line) {
  // Inline code (must come before bold/italic to avoid conflicts)
  line = line.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // Bold + italic
  line = line.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return line;
}
