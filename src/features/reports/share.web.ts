import { shareReceipt } from '@/features/checkout/shareReceipt.web';

/** Web and Windows (Tauri): download the CSV file. */
export async function shareCsv(csv: string, fileName: string, _title: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Web and Windows: open the print dialog for the report page ("Save as PDF" is offered there). */
export async function sharePdf(html: string, fileName: string, _title: string): Promise<void> {
  await shareReceipt(html, fileName);
}
