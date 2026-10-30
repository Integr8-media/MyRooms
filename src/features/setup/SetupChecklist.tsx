import { useQuery } from '@powersync/react';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SETUP_STEPS, setupProgress, type SetupFacts, type SetupStep } from '@/domain/setup';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useSettingsStore } from '@/lib/settings/settings-store';
import { Button, Card, ListRow, Text } from '@/ui';

const LINKS: Record<SetupStep, Href> = {
  prices: '/settings/station-types',
  stations: '/settings/stations',
  staff: '/settings/staff',
};

/**
 * Owners of a new organization: what is left to set up (prices, stations, staff), with links.
 * Disappears once everything is done or when hidden on this device.
 */
export function SetupChecklist() {
  const { t } = useTranslation();
  const { org, userId, can } = useWorkspace();
  const hidden = useSettingsStore((s) => (org ? s.setupHidden.includes(org.id) : true));
  const hideSetup = useSettingsStore((s) => s.hideSetup);
  const show = !!org && can('prices.edit') && !hidden;
  const orgId = show ? org.id : null;

  const { data } = useQuery<SetupFacts>(
    `SELECT
       (SELECT count(*) FROM station_types t WHERE t.org_id = ?1 AND t.is_active = 1
          AND EXISTS (SELECT 1 FROM rate_rules r WHERE r.station_type_id = t.id)) AS pricedTypes,
       (SELECT count(*) FROM stations s WHERE s.org_id = ?1 AND s.is_active = 1) AS stations,
       (SELECT count(*) FROM memberships m WHERE m.org_id = ?1 AND m.user_id <> ?2)
         + (SELECT count(*) FROM invitations i WHERE i.org_id = ?1 AND i.accepted_at IS NULL)
         AS staff`,
    [orgId, userId],
  );
  const facts = data[0];
  if (!show || !facts) return null;
  const { done, remaining } = setupProgress(facts);
  if (remaining === 0) return null;
  const fresh = !done.prices && !done.stations;

  return (
    <Card className="gap-2" testID="setup-checklist">
      <Text variant="heading">{t('setup.checklistTitle')}</Text>
      <Text variant="muted">{t('setup.checklistIntro', { count: remaining })}</Text>
      {fresh ? (
        <Button
          label={t('setup.title')}
          onPress={() => router.push('/setup')}
          className="self-start"
          testID="open-quick-setup"
        />
      ) : null}
      <View>
        {SETUP_STEPS.map((step) => (
          <ListRow
            key={step}
            title={`${done[step] ? '✓' : '○'}  ${t(`setup.step.${step}`)}`}
            subtitle={done[step] ? null : t(`setup.stepHint.${step}`)}
            onPress={() => router.push(LINKS[step])}
            testID={`setup-step-${step}${done[step] ? '-done' : ''}`}
          />
        ))}
        <ListRow
          title={`•  ${t('setup.step.modules')}`}
          subtitle={t('setup.stepHint.modules')}
          onPress={() => router.push('/settings/organization')}
          testID="setup-step-modules"
        />
      </View>
      <Button
        label={t('setup.hide')}
        variant="secondary"
        onPress={() => hideSetup(org.id)}
        className="self-start"
        testID="setup-hide"
      />
    </Card>
  );
}
