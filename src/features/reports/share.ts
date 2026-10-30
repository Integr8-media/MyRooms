import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Phones: write the CSV to the cache folder and open the share sheet (Drive, email, WhatsApp…). */
export async function shareCsv(csv: string, fileName: string, title: string): Promise<void> {
  const file = new File(Paths.cache, `${fileName}.csv`);
  file.create({ overwrite: true });
  await file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: title,
  });
}

/** Phones: turn the report page into an A4 PDF and open the share sheet. */
export async function sharePdf(html: string, _fileName: string, title: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: title,
    });
  } else {
    await Print.printAsync({ uri });
  }
}
