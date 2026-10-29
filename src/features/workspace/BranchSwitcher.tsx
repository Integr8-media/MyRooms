import { useTranslation } from 'react-i18next';

import { useWorkspaceStore } from '@/lib/settings/workspace-store';
import { Card, SegmentedControl, Text } from '@/ui';

import { useWorkspace } from './WorkspaceProvider';

/** Pick the branch this device works in. Hidden when there is only one. */
export function BranchSwitcher() {
  const { t } = useTranslation();
  const { branches, branch } = useWorkspace();
  const setBranch = useWorkspaceStore((s) => s.setBranch);
  const active = branches.filter((b) => b.is_active);

  if (active.length < 2 || !branch) return null;

  return (
    <Card>
      <Text variant="heading">{t('home.branch')}</Text>
      <SegmentedControl
        value={branch.id}
        onChange={setBranch}
        options={active.map((b) => ({ value: b.id, label: b.name ?? '' }))}
      />
    </Card>
  );
}
