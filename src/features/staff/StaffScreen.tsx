import { useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isRole } from '@/domain/permissions';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { InvitationRow, MembershipRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Badge, Button, Card, ListRow, Screen, ScreenHeader, Text } from '@/ui';

import { revokeInvitation } from './api';

type MemberListRow = MembershipRow & { branch_names: string | null };

export function StaffScreen() {
  const { t, i18n } = useTranslation();
  const { org, can, userId } = useWorkspace();
  const { error, run } = useAsyncAction();

  // Managers only have their branches' staff on the device (see sync-config.yaml).
  const { data: members } = useQuery<MemberListRow>(
    `SELECT m.*, (SELECT group_concat(b.name, ', ') FROM member_branches mb
                    JOIN branches b ON b.id = mb.branch_id
                   WHERE mb.membership_id = m.id) AS branch_names
       FROM memberships m WHERE m.org_id = ?
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
               m.display_name, m.email`,
    [org?.id ?? null],
  );
  const { data: invitations } = useQuery<InvitationRow>(
    `SELECT * FROM invitations WHERE org_id = ? AND accepted_at IS NULL ORDER BY created_at DESC`,
    [org?.id ?? null],
  );
  const now = new Date().toISOString();

  return (
    <Screen>
      <ScreenHeader
        title={t('staff.title')}
        actions={
          can('staff.invite') ? (
            <Button
              label={t('staff.invite')}
              onPress={() => router.push('/settings/staff/invite')}
              testID="invite-staff"
            />
          ) : null
        }
      />

      <Card className="gap-1">
        {members.map((member) => (
          <ListRow
            key={member.id}
            title={member.display_name || member.email || ''}
            subtitle={[
              member.display_name ? member.email : null,
              member.role === 'owner' ? t('staff.allBranches') : member.branch_names,
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={
              <View className="flex-row gap-1">
                {member.user_id === userId ? <Badge label={t('staff.you')} /> : null}
                {isRole(member.role) ? (
                  <Badge label={t(`roles.${member.role}`)} tone="primary" />
                ) : null}
              </View>
            }
            onPress={() =>
              router.push({ pathname: '/settings/staff/[id]', params: { id: member.id } })
            }
            testID={`member-${member.id}`}
          />
        ))}
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <Text variant="heading">{t('staff.pendingInvitations')}</Text>
          {invitations.map((invitation) => {
            const expired = (invitation.expires_at ?? '') < now;
            return (
              <View
                key={invitation.id}
                className="flex-row flex-wrap items-center gap-2 border-b border-border pb-2"
              >
                <View className="flex-1 gap-1">
                  <Text>{invitation.email}</Text>
                  <Text variant="muted">
                    {expired
                      ? t('staff.invitationExpired')
                      : t('staff.invitationExpires', {
                          date: new Date(invitation.expires_at ?? '').toLocaleDateString(
                            i18n.language,
                          ),
                        })}
                  </Text>
                </View>
                {isRole(invitation.role) ? (
                  <Badge
                    label={t(`roles.${invitation.role}`)}
                    tone={expired ? 'warning' : 'neutral'}
                  />
                ) : null}
                <Button
                  label={t('staff.revoke')}
                  variant="secondary"
                  onPress={() => void run(() => revokeInvitation(invitation.id))}
                />
              </View>
            );
          })}
        </Card>
      ) : null}
      <ErrorNotice error={error} />
    </Screen>
  );
}
