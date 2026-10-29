import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { canAssignBranch, isRole, needsBranches, ROLES, type Role } from '@/domain/permissions';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { MemberBranchRow, MembershipRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Badge, Button, Card, Notice, Screen, ScreenHeader, SegmentedControl, Text } from '@/ui';

import { assignBranch, removeMember, setMemberRole, unassignBranch } from './api';
import { BranchPicker } from './BranchPicker';

export function MemberScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role: myRole, userId, branches, can } = useWorkspace();
  const { error, run } = useAsyncAction();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data: rows } = useQuery<MembershipRow>('SELECT * FROM memberships WHERE id = ?', [id]);
  const { data: assignments } = useQuery<MemberBranchRow>(
    'SELECT * FROM member_branches WHERE membership_id = ?',
    [id],
  );
  const member = rows[0];
  if (!member || !isRole(member.role)) return null;
  const memberRole: Role = member.role;

  const isSelf = member.user_id === userId;
  const canChangeRole = can('staff.changeRole') && !isSelf;
  const assigned = new Map(assignments.map((a) => [a.branch_id ?? '', a.id]));
  // Owners manage every branch; managers only those on their device (= their branches).
  const managesBranch = (branchId: string) =>
    myRole === 'owner' || (myRole === 'manager' && branches.some((b) => b.id === branchId));

  const toggleBranch = (branchId: string, on: boolean) =>
    void run(async () => {
      const existing = assigned.get(branchId);
      if (on && !existing) await assignBranch(member, branchId);
      if (!on && existing) await unassignBranch(existing);
    });

  return (
    <Screen>
      <ScreenHeader title={member.display_name || member.email || ''} />
      <Card>
        <Text>{member.email}</Text>
        <Badge label={t(`roles.${memberRole}`)} tone="primary" />
      </Card>

      {canChangeRole ? (
        <Card>
          <Text variant="heading">{t('staff.role')}</Text>
          <SegmentedControl<Role>
            value={memberRole}
            onChange={(next) => void run(() => setMemberRole(member.id, next))}
            options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
          />
          <Text variant="muted">{t(`roleDescriptions.${memberRole}`)}</Text>
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">{t('staff.branches')}</Text>
        {needsBranches(memberRole) ? (
          <>
            <BranchPicker
              branches={branches.filter((b) => b.is_active || assigned.has(b.id))}
              selected={new Set(assigned.keys())}
              onToggle={toggleBranch}
              isDisabled={(branchId) =>
                !canAssignBranch(myRole, memberRole, managesBranch(branchId))
              }
            />
            {assigned.size === 0 ? <Notice tone="warning" message={t('staff.noBranches')} /> : null}
          </>
        ) : (
          <Text variant="muted">{t('staff.allBranches')}</Text>
        )}
      </Card>

      {can('staff.remove') && !isSelf ? (
        <Card>
          {confirmRemove ? <Notice tone="warning" message={t('staff.removeConfirm')} /> : null}
          <Button
            label={confirmRemove ? t('staff.removeConfirmButton') : t('staff.remove')}
            variant="danger"
            className="self-start"
            testID="remove-member"
            onPress={() => {
              if (!confirmRemove) {
                setConfirmRemove(true);
                return;
              }
              void run(async () => {
                await removeMember(member.id);
                router.back();
              });
            }}
          />
        </Card>
      ) : null}
      <ErrorNotice error={error} />
    </Screen>
  );
}
