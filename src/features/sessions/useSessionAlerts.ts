import { useQuery } from '@powersync/react';
import { useEffect, useEffectEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { dueAlerts, parseTimestamp, upcomingAlerts, type SessionAlert } from '@/domain/sessions';
import { formatClock, toLocal } from '@/domain/zoned-time';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import {
  alertMode,
  scheduleAlerts,
  showAlert,
  type AlertMessage,
} from '@/lib/notifications/alerts';
import { useSettingsStore } from '@/lib/settings/settings-store';

type Row = { id: string; scheduled_end: string | null; station_name: string | null };

const POLL_MS = 5000;

/**
 * Alerts for fixed sessions in the current branch: 5 minutes before the end, at the end, and
 * 15 minutes over time. Phones schedule them with the OS; web and Windows check every few
 * seconds while the app is open. Mounted once, in the signed-in layout.
 */
export function useSessionAlerts() {
  const { t } = useTranslation();
  const { branch, org } = useWorkspace();
  const enabled = useSettingsStore((s) => s.sessionAlerts);
  const timeZone = org?.timezone ?? 'Africa/Cairo';

  const { data } = useQuery<Row>(
    `SELECT x.id, x.scheduled_end, s.name AS station_name
       FROM sessions x LEFT JOIN stations s ON s.id = x.station_id
      WHERE x.branch_id = ? AND x.status = 'active' AND x.scheduled_end IS NOT NULL`,
    [branch?.id ?? null],
  );
  const sessions = enabled
    ? data.map((r) => ({
        id: r.id,
        scheduledEnd: parseTimestamp(r.scheduled_end),
        name: r.station_name ?? '',
      }))
    : [];

  const message = (alert: SessionAlert): AlertMessage => {
    const s = sessions.find((x) => x.id === alert.sessionId);
    const end = s?.scheduledEnd != null ? toLocal(s.scheduledEnd, timeZone) : null;
    return {
      key: alert.key,
      at: alert.at,
      title: t(`alerts.${alert.kind}`, { station: s?.name ?? '' }),
      body: end ? t('alerts.body', { time: formatClock(end.hour * 60 + end.minute) }) : '',
    };
  };

  // Phones: keep the OS schedule in step whenever sessions change.
  const scheduleKey = JSON.stringify(sessions.map((s) => [s.id, s.scheduledEnd, s.name]));
  const reschedule = useEffectEvent(() => {
    scheduleAlerts(upcomingAlerts(sessions, Date.now()).map(message)).catch((e) =>
      console.warn('Could not schedule session alerts', e),
    );
  });
  useEffect(() => {
    if (alertMode === 'schedule') reschedule();
  }, [scheduleKey]);

  // Web / Windows: check on a timer.
  const fired = useRef(new Set<string>());
  const check = useEffectEvent(() => {
    for (const alert of dueAlerts(sessions, Date.now(), fired.current)) {
      fired.current.add(alert.key);
      void showAlert(message(alert));
    }
  });
  useEffect(() => {
    if (alertMode !== 'poll') return;
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, []);
}
