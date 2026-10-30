/**
 * Session alerts on the web and in the Windows app (Tauri). The app checks on a timer while
 * it is open and shows a system notification plus a short beep. In Tauri the notification
 * plugin is used; in a browser, the Web Notifications API.
 */
export type AlertMessage = { key: string; at: number; title: string; body: string };
export type AlertPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export const alertMode: 'schedule' | 'poll' = 'poll';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const tauri = () => import('@tauri-apps/plugin-notification');
const hasWebNotifications = () => typeof window !== 'undefined' && 'Notification' in window;

export async function getAlertPermission(): Promise<AlertPermission> {
  if (isTauri())
    return (await tauri()).isPermissionGranted().then((ok) => (ok ? 'granted' : 'undetermined'));
  if (!hasWebNotifications()) return 'unsupported';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function requestAlertPermission(): Promise<boolean> {
  if (isTauri()) return (await (await tauri()).requestPermission()) === 'granted';
  if (!hasWebNotifications()) return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Nothing to schedule on the web: see showAlert. */
export async function scheduleAlerts(_alerts: readonly AlertMessage[]): Promise<void> {}

let audio: AudioContext | null = null;
/** Two short tones, so the alert is noticed even if notifications are blocked. */
function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const start = audio.currentTime;
    for (const [offset, freq] of [
      [0, 880],
      [0.25, 660],
    ] as const) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.2);
    }
  } catch {
    // Audio blocked until the user interacts with the page: the notification still shows.
  }
}

export async function showAlert(alert: AlertMessage): Promise<void> {
  beep();
  try {
    if (isTauri()) {
      const plugin = await tauri();
      if (await plugin.isPermissionGranted())
        plugin.sendNotification({ title: alert.title, body: alert.body });
      return;
    }
    if (hasWebNotifications() && Notification.permission === 'granted') {
      new Notification(alert.title, { body: alert.body, tag: alert.key });
    }
  } catch (e) {
    console.warn('Could not show a notification', e);
  }
}
