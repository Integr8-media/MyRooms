import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Phones: turn the receipt into a PDF and open the share sheet (WhatsApp, print, save...). */
export async function shareReceipt(html: string, title: string): Promise<void> {
  // A narrow page that suits receipt printers and phone screens.
  const { uri } = await Print.printToFileAsync({ html, width: 320, height: 640 });
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
