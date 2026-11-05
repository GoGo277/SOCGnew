import { jsPDF } from 'jspdf';

/** Render platform-generated Markdown to a paginated, text-based (copyable) PDF. */
const strip = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1$2').replace(/\\\|/g, '|');
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => strip(c.trim()));

export const markdownToPdf = (md: string, opts: { footer: string; pageNumbers?: boolean }): Blob => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 48, CW = W - 2 * M, BOTTOM = H - 56;
  let y = M;
  const ensure = (h: number) => { if (y + h > BOTTOM) { pdf.addPage(); y = M; } };
  const write = (text: string, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: [number, number, number] = [24, 24, 27], indent = 0) => {
    pdf.setFont('helvetica', style); pdf.setFontSize(size); pdf.setTextColor(...color);
    (pdf.splitTextToSize(text, CW - indent) as string[]).forEach(line => { ensure(size * 1.4); pdf.text(line, M + indent, y + size); y += size * 1.4; });
  };
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { y += 4; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const size = h[1].length === 1 ? 18 : h[1].length === 2 ? 13 : 11;
      ensure(size * 2.4); y += h[1].length === 1 ? 0 : 8;
      write(strip(h[2]), size, 'bold', [21, 40, 90]);
      if (h[1].length <= 2) { pdf.setDrawColor(220, 224, 232); pdf.line(M, y + 2, W - M, y + 2); y += 6; }
      continue;
    }
    if (/^---+\s*$/.test(line)) { ensure(12); pdf.setDrawColor(220, 224, 232); pdf.line(M, y + 4, W - M, y + 4); y += 12; continue; }
    if (line.startsWith('|') && lines[i + 1] && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
      i--;
      const colW = CW / head.length;
      const row = (vals: string[], bold: boolean) => {
        pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(8);
        const wrapped = vals.map(v => pdf.splitTextToSize(v || '—', colW - 6) as string[]);
        const rh = Math.max(...wrapped.map(w => w.length)) * 10 + 6;
        ensure(rh);
        if (bold) { pdf.setFillColor(240, 243, 248); pdf.rect(M, y, CW, rh, 'F'); }
        pdf.setTextColor(24, 24, 27);
        wrapped.forEach((ls, c) => ls.forEach((l, k) => pdf.text(l, M + c * colW + 3, y + 10 + k * 10)));
        pdf.setDrawColor(228, 231, 238); pdf.line(M, y + rh, W - M, y + rh);
        y += rh;
      };
      row(head, true);
      rows.forEach(r => row(r, false));
      y += 6;
      continue;
    }
    const li = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (li) { write(`${/\d/.test(li[1]) ? li[1] : '•'} ${strip(li[2])}`, 10, 'normal', [24, 24, 27], 10); continue; }
    if (line.startsWith('>')) { write(strip(line.replace(/^>\s?/, '')), 9.5, 'italic', [90, 96, 110], 10); continue; }
    write(strip(line), 10);
  }
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(228, 231, 238); pdf.line(M, H - 40, W - M, H - 40);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(113, 113, 122);
    pdf.text(opts.footer, M, H - 26);
    if (opts.pageNumbers !== false) pdf.text(`Page ${p} of ${pages}`, W - M, H - 26, { align: 'right' });
  }
  return pdf.output('blob');
};
