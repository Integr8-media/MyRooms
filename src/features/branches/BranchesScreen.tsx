import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Button, Card, ListRow, Screen, ScreenHeader, Text } from '@/ui';

export function BranchesScreen() {
  const { t } = useTranslation();
  const { branches, can } = useWorkspace();

  const open = (id: string) => router.push({ pathname: '/settings/branches/[id]', params: { id } });

  return (
    <Screen>
      <ScreenHeader
        title={t('branches.title')}
        actions={
          can('branches.create') ? (
            <Button label={t('branches.add')} onPress={() => open('new')} testID="add-branch" />
          ) : null
        }
      />
      <Card className="gap-1">
        {branches.length === 0 ? <Text variant="muted">{t('branches.empty')}</Text> : null}
        {branches.map((branch) => (
          <ListRow
            key={branch.id}
            title={branch.name ?? ''}
            subtitle={branch.address}
            trailing={
              branch.is_active ? null : <Badge label={t('branches.inactive')} tone="warning" />
            }
            onPress={() => open(branch.id)}
            testID={`branch-${branch.id}`}
          />
        ))}
      </Card>
    </Screen>
  );
}
