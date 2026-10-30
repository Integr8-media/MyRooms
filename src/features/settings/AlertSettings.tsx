import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getAlertPermission,
  requestAlertPermission,
  type AlertPermission,
} from '@/lib/notifications/alerts';
import { useSettingsStore } from '@/lib/settings/settings-store';
import { Button, Card, Notice, SwitchRow, Text } from '@/ui';

/** Per-device switch for "session ending" alerts, and the system permission they need. */
export function AlertSettings() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.sessionAlerts);
  const setEnabled = useSettingsStore((s) => s.setSessionAlerts);
  const [permission, setPermission] = useState<AlertPermission | null>(null);

  useEffect(() => {
    getAlertPermission()
      .then(setPermission)
      .catch(() => setPermission('unsupported'));
  }, []);

  const ask = async () => {
    await requestAlertPermission().catch(() => false);
    setPermission(await getAlertPermission().catch(() => 'unsupported' as const));
  };

  const toggle = async (on: boolean) => {
    setEnabled(on);
    if (on && permission === 'undetermined') await ask();
  };

  return (
    <Card>
      <Text variant="heading">{t('alerts.settingsTitle')}</Text>
      <SwitchRow
        label={t('alerts.settingsSwitch')}
        description={t('alerts.settingsHint')}
        value={enabled}
        onValueChange={(on) => void toggle(on)}
        testID="session-alerts-switch"
      />
      {enabled && permission === 'undetermined' ? (
        <Button
          label={t('alerts.allow')}
          variant="secondary"
          className="self-start"
          onPress={() => void ask()}
        />
      ) : null}
      {enabled && permission === 'denied' ? (
        <Notice tone="warning" message={t('alerts.denied')} />
      ) : null}
      {enabled && permission === 'unsupported' ? (
        <Notice tone="info" message={t('alerts.unsupported')} />
      ) : null}
    </Card>
  );
}
