import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Button, Card, ListRow, Notice, Screen, ScreenHeader, Text } from '@/ui';

import { useStationTypes } from './data';
import { ColorDot } from './pickers';

export function StationTypesScreen() {
  const { t } = useTranslation();
  const { org, can } = useWorkspace();
  const types = useStationTypes(org?.id);
  const editable = can('prices.edit');

  const open = (id: string) =>
    router.push({ pathname: '/settings/station-types/[id]', params: { id } });

  return (
    <Screen>
      <ScreenHeader
        title={t('stationTypes.title')}
        actions={
          editable ? (
            <Button
              label={t('stationTypes.add')}
              onPress={() => open('new')}
              testID="add-station-type"
            />
          ) : null
        }
      />
      <Text variant="muted">{t('stationTypes.intro')}</Text>
      {!editable ? <Notice message={t('stationTypes.ownerOnly')} /> : null}
      <Card className="gap-1">
        {types.length === 0 ? <Text variant="muted">{t('stationTypes.empty')}</Text> : null}
        {types.map((type) => (
          <ListRow
            key={type.id}
            title={type.name ?? ''}
            subtitle={[
              type.kind === 'ps_room' ? t('stationTypes.kindPs') : t('stationTypes.kindPc'),
              t('stationTypes.upToPlayers', { count: type.max_players ?? 1 }),
            ].join(' · ')}
            trailing={
              <>
                {type.is_active ? null : <Badge label={t('common.off')} tone="warning" />}
                <ColorDot color={type.color} />
              </>
            }
            onPress={() => open(type.id)}
            testID={`station-type-${type.id}`}
          />
        ))}
      </Card>
    </Screen>
  );
}
