/**
 * Session alerts on Android / iOS: local notifications scheduled with the OS, so they
 * arrive even when the app is in the background. The web/Windows version is alerts.web.ts.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type AlertMessage = { key: string; at: number; title: string; body: string };
export type AlertPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Phones schedule ahead; web and Windows check on a timer while the app is open. */
export const alertMode: 'schedule' | 'poll' = 'schedule';

const CHANNEL = 'session-alerts';
const PREFIX = 'session-alert:';

let ready: Promise<void> | null = null;
function setup() {
  ready ??= (async () => {
    // Show alerts while the app is open too.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Session alerts',
        // Re-exported through a type module the import plugin can't follow; tsc checks it.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
  })();
  return ready;
}

export async function getAlertPermission(): Promise<AlertPermission> {
  await setup();
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function requestAlertPermission(): Promise<boolean> {
  await setup();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Make the OS schedule match `alerts` exactly: cancel ours that are no longer wanted
 * (session ended or extended), add the missing ones. Other notifications are left alone.
 */
export async function scheduleAlerts(alerts: readonly AlertMessage[]): Promise<void> {
  await setup();
  const wanted = new Map(alerts.map((a) => [PREFIX + a.key, a]));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const have = new Set<string>();
  for (const request of scheduled) {
    if (!request.identifier.startsWith(PREFIX)) continue;
    if (wanted.has(request.identifier)) have.add(request.identifier);
    else await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  if (alerts.length && (await getAlertPermission()) !== 'granted') return;
  for (const [identifier, alert] of wanted) {
    if (have.has(identifier) || alert.at <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: alert.title, body: alert.body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alert.at,
        channelId: CHANNEL,
      },
    });
  }
}

/** Not used on phones (the OS shows scheduled alerts). */
export async function showAlert(_alert: AlertMessage): Promise<void> {}
