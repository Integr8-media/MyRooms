import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useWorkspaceStore } from '@/lib/settings/workspace-store';
import { Card, ListRow, Screen, ScreenHeader, SegmentedControl, Text } from '@/ui';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { can, memberships, membership } = useWorkspace();
  const setOrg = useWorkspaceStore((s) => s.setOrg);

  return (
    <Screen>
      <ScreenHeader title={t('settings.title')} />

      {memberships.length > 1 && membership ? (
        <Card>
          <Text variant="heading">{t('settings.organization')}</Text>
          <SegmentedControl
            value={membership.org_id ?? ''}
            onChange={setOrg}
            options={memberships.map((m) => ({ value: m.org_id ?? '', label: m.org_name }))}
          />
        </Card>
      ) : null}

      <Card className="gap-1">
        <ListRow
          title={t('settings.organization')}
          subtitle={t('settings.organizationHint')}
          onPress={() => router.push('/settings/organization')}
          testID="settings-organization"
        />
        {can('branches.edit') ? (
          <ListRow
            title={t('branches.title')}
            subtitle={t('settings.branchesHint')}
            onPress={() => router.push('/settings/branches')}
            testID="settings-branches"
          />
        ) : null}
        {can('stations.edit') ? (
          <ListRow
            title={t('stations.title')}
            subtitle={t('settings.stationsHint')}
            onPress={() => router.push('/settings/stations')}
            testID="settings-stations"
          />
        ) : null}
        <ListRow
          title={t('stationTypes.title')}
          subtitle={t('settings.stationTypesHint')}
          onPress={() => router.push('/settings/station-types')}
          testID="settings-station-types"
        />
        <ListRow
          title={t('pricing.previewTitle')}
          subtitle={t('settings.pricePreviewHint')}
          onPress={() => router.push('/settings/price-preview')}
          testID="settings-price-preview"
        />
        {can('staff.view') ? (
          <ListRow
            title={t('staff.title')}
            subtitle={t('settings.staffHint')}
            onPress={() => router.push('/settings/staff')}
            testID="settings-staff"
          />
        ) : null}
        <ListRow
          title={t('account.title')}
          subtitle={t('settings.accountHint')}
          onPress={() => router.push('/settings/account')}
          testID="settings-account"
        />
      </Card>
    </Screen>
  );
}
