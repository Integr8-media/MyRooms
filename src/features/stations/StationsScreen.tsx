import { useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorDot } from '@/features/pricing/pickers';
import { BranchSwitcher } from '@/features/workspace/BranchSwitcher';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Button, Card, ListRow, Notice, Screen, ScreenHeader, Text } from '@/ui';

export type StationListRow = {
  id: string;
  name: string | null;
  status: string | null;
  is_active: number | null;
  type_name: string | null;
  type_color: string | null;
};

/** Stations of the branch this device works in. */
export function StationsScreen() {
  const { t } = useTranslation();
  const { branch, org, can } = useWorkspace();
  const editable = can('stations.edit');

  const { data: stations } = useQuery<StationListRow>(
    `SELECT s.id, s.name, s.status, s.is_active, t.name AS type_name, t.color AS type_color
       FROM stations s LEFT JOIN station_types t ON t.id = s.station_type_id
      WHERE s.branch_id = ?
      ORDER BY s.is_active DESC, t.sort_order, s.sort_order, s.name`,
    [branch?.id ?? null],
  );
  const { data: typeCount } = useQuery<{ n: number }>(
    'SELECT COUNT(*) AS n FROM station_types WHERE org_id = ? AND is_active = 1',
    [org?.id ?? null],
  );
  const hasTypes = (typeCount[0]?.n ?? 0) > 0;

  const open = (id: string) => router.push({ pathname: '/settings/stations/[id]', params: { id } });

  return (
    <Screen>
      <ScreenHeader
        title={t('stations.title')}
        actions={
          editable && branch && hasTypes ? (
            <Button label={t('stations.add')} onPress={() => open('new')} testID="add-station" />
          ) : null
        }
      />
      <BranchSwitcher />
      {!branch ? <Notice tone="warning" message={t('home.noBranch')} /> : null}
      {branch && !hasTypes ? (
        <Notice
          tone="warning"
          message={can('prices.edit') ? t('stations.needTypesOwner') : t('stations.needTypes')}
        />
      ) : null}
      {branch ? (
        <Card className="gap-1">
          <Text variant="heading">{t('stations.inBranch', { name: branch.name })}</Text>
          {stations.length === 0 ? <Text variant="muted">{t('stations.empty')}</Text> : null}
          {stations.map((station) => (
            <ListRow
              key={station.id}
              title={station.name ?? ''}
              subtitle={station.type_name}
              trailing={
                <>
                  {!station.is_active ? (
                    <Badge label={t('stations.removed')} />
                  ) : station.status === 'maintenance' ? (
                    <Badge label={t('stations.maintenance')} tone="warning" />
                  ) : null}
                  <ColorDot color={station.type_color} />
                </>
              }
              onPress={editable ? () => open(station.id) : undefined}
              testID={`station-${station.id}`}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
