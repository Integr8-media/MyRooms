import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorNotice } from '@/features/common/ErrorNotice';
import { checkForUpdate, type AvailableUpdate } from '@/lib/updates/updates';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Text } from '@/ui';

/** How often a running Windows app asks for a new version. */
export const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Windows app: "Version x is available" with Install and restart. Nothing elsewhere.
 * Staff choose when to restart, so a running checkout is never cut off.
 */
export function UpdateNotice() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    let active = true;
    const look = () =>
      void checkForUpdate().then((found) => {
        if (active && found) setUpdate(found);
      });
    look();
    const timer = setInterval(look, UPDATE_CHECK_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!update) return null;
  const percent = progress === null ? null : Math.round(progress * 100);
  return (
    <Card className="gap-2" testID="update-notice">
      <Text variant="heading">{t('updates.available', { version: update.version })}</Text>
      <Text variant="muted">{t('updates.hint')}</Text>
      {update.notes ? <Text variant="muted">{update.notes}</Text> : null}
      <ErrorNotice error={error} />
      <Button
        label={
          busy
            ? percent === null
              ? t('updates.downloading')
              : t('updates.downloadingPercent', { percent })
            : t('updates.install')
        }
        onPress={() => void run(() => update.install(setProgress))}
        disabled={busy}
        className="self-start"
        testID="update-install"
      />
    </Card>
  );
}
