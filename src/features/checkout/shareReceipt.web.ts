/**
 * Web and Windows (Tauri): print the receipt from a hidden frame. The print dialog also
 * offers "Save as PDF". (expo-print on web prints the whole app page, not our HTML.)
 */
export async function shareReceipt(html: string, _title: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } finally {
    // Some browsers return from print() before the dialog closes; remove the frame later.
    setTimeout(() => frame.remove(), 60_000);
  }
}
