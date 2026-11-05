/**
 * Minimal, safe Markdown → HTML renderer for platform-generated documents
 * (headings, paragraphs, lists, tables, rules, quotes, bold/italic/code).
 * All input is HTML-escaped first; no raw HTML passes through.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>');

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

export const markdownToHtml = (md: string): string => {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }
    if (line.startsWith('|') && lines[i + 1] && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
      out.push(`<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(it => `<li>${inline(it)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (line.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|---+\s*$|\||>|\s*([-*]|\d+\.)\s)/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${para.map(inline).join('<br/>')}</p>`);
  }
  return out.join('\n');
};

export const MARKDOWN_CSS = `
.md{font-size:13px;line-height:1.6;color:inherit}.md h1{font-size:20px;margin:0 0 8px}.md h2{font-size:15px;margin:20px 0 8px;border-bottom:1px solid rgba(127,127,127,.3);padding-bottom:4px}
.md h3{font-size:13px;margin:14px 0 6px}.md table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12px}.md th,.md td{border:1px solid rgba(127,127,127,.3);padding:4px 8px;text-align:left}
.md code{font-family:ui-monospace,monospace;background:rgba(127,127,127,.15);padding:0 4px;border-radius:4px}.md hr{border:0;border-top:1px solid rgba(127,127,127,.3);margin:16px 0}
.md blockquote{border-left:3px solid #6366f1;margin:8px 0;padding:4px 12px;opacity:.85}.md ul,.md ol{padding-left:20px}
`;
