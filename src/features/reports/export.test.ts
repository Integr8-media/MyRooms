import { poundsCell, reportCsv, reportFileName, reportHtml, type ReportDocument } from './export';

const doc: ReportDocument = {
  title: 'Arena report',
  subtitle: ['Mon, 5 Jan 2026'],
  tables: [
    {
      title: 'By branch',
      headers: ['Branch', 'Amount (EGP)'],
      rows: [
        ['Nasr City, "main"', '100.00'],
        ['مدينة نصر', 5],
      ],
    },
  ],
  notes: ['Line one\nline two'],
};

describe('report export', () => {
  it('writes amounts as plain pounds', () => {
    expect(poundsCell(12345)).toBe('123.45');
    expect(poundsCell(5)).toBe('0.05');
    expect(poundsCell(-700)).toBe('-7.00');
  });

  it('CSV: BOM, CRLF, quoted cells, Arabic kept', () => {
    const csv = reportCsv(doc);
    expect(csv.startsWith('﻿Arena report\r\n')).toBe(true);
    expect(csv).toContain('By branch\r\nBranch,Amount (EGP)\r\n');
    expect(csv).toContain('"Nasr City, ""main""",100.00\r\n');
    expect(csv).toContain('مدينة نصر,5\r\n');
    expect(csv).toContain('"Line one\nline two"');
  });

  it('HTML: escaped, right to left in Arabic', () => {
    const html = reportHtml(doc, 'ar');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Nasr City, &quot;main&quot;');
    expect(reportHtml(doc, 'en')).toContain('dir="ltr"');
  });

  it('file names', () => {
    expect(reportFileName('2026-01-05', '2026-01-05')).toBe('myrooms-report-2026-01-05');
    expect(reportFileName('2026-01-01', '2026-01-31')).toBe('myrooms-report-2026-01-01_2026-01-31');
  });
});
