/**
 * Report export: the same tables as CSV (for Excel / Google Sheets) or as a printable HTML
 * page (saved as PDF by the share sheet or the print dialog). Pure: no React.
 */

/** A cell: text as is, numbers written plainly (amounts are already in pounds). */
export type Cell = string | number;

export type ReportTable = { title: string; headers: string[]; rows: Cell[][] };

export type ReportDocument = {
  title: string;
  /** Lines under the title: organization, period, branch, when it was made. */
  subtitle: string[];
  tables: ReportTable[];
  /** Footnotes (how things are counted). */
  notes?: string[];
};

/** Piasters as a plain pounds number for spreadsheets: 12345 -> "123.45". */
export function poundsCell(piasters: number): string {
  const sign = piasters < 0 ? '-' : '';
  const abs = Math.abs(piasters);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function csvCell(value: Cell): string {
  const text = String(value);
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV with a UTF-8 byte order mark (so Excel reads Arabic correctly) and CRLF line ends.
 * Each table is preceded by its title and followed by an empty line.
 */
export function reportCsv(doc: ReportDocument): string {
  const lines: string[] = [csvCell(doc.title), ...doc.subtitle.map(csvCell), ''];
  for (const table of doc.tables) {
    lines.push(csvCell(table.title));
    lines.push(table.headers.map(csvCell).join(','));
    for (const row of table.rows) lines.push(row.map(csvCell).join(','));
    lines.push('');
  }
  for (const note of doc.notes ?? []) lines.push(csvCell(note));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** A standalone A4 page with every table. Right to left in Arabic. */
export function reportHtml(doc: ReportDocument, language: string): string {
  const rtl = language.startsWith('ar');
  const tables = doc.tables
    .map((table) => {
      const head = table.headers.map((h) => `<th>${escape(h)}</th>`).join('');
      const body = table.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, i) => `<td${i > 0 ? ' class="num"' : ''}>${escape(String(cell))}</td>`)
              .join('')}</tr>`,
        )
        .join('');
      return `<section><h2>${escape(table.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
    })
    .join('');
  const notes = (doc.notes ?? []).map((n) => `<p class="note">${escape(n)}</p>`).join('');
  return `<!doctype html>
<html lang="${escape(language)}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(doc.title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0; }
  section { margin-top: 18px; break-inside: avoid; }
  h2 { font-size: 14px; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: start; }
  th { background: #f3f3f3; font-weight: 600; }
  td.num, th:not(:first-child) { text-align: end; font-variant-numeric: tabular-nums; }
  .note { color: #555; margin-top: 14px; }
</style>
</head>
<body>
<h1>${escape(doc.title)}</h1>
${doc.subtitle.map((s) => `<p class="sub">${escape(s)}</p>`).join('')}
${tables}
${notes}
</body>
</html>`;
}

/** A safe file name: "myrooms-report-2026-01-01_2026-01-31". */
export function reportFileName(fromDate: string, toDate: string): string {
  return fromDate === toDate
    ? `myrooms-report-${fromDate}`
    : `myrooms-report-${fromDate}_${toDate}`;
}
