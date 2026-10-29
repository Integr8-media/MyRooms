import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspaceStore } from '@/lib/settings/workspace-store';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Badge, Button, Card, Text } from '@/ui';

import {
  acceptInvitation,
  declineInvitation,
  fetchMyInvitations,
  type PendingInvitation,
} from './api';

/**
 * Invitations waiting for the signed-in user (needs internet). Renders nothing
 * when there are none, or when offline.
 */
export function InvitationsList({ onAccepted }: { onAccepted?: () => void }) {
  const { t } = useTranslation();
  const setOrg = useWorkspaceStore((s) => s.setOrg);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    let active = true;
    fetchMyInvitations()
      .then((list) => active && setInvitations(list))
      .catch(() => {
        // Offline or backend not configured: nothing to show.
      });
    return () => {
      active = false;
    };
  }, []);

  if (invitations.length === 0) return null;

  const remove = (id: string) => setInvitations((list) => list.filter((i) => i.id !== id));

  return (
    <Card>
      <Text variant="heading">{t('invitations.title')}</Text>
      {invitations.map((invitation) => (
        <View key={invitation.id} className="gap-2 border-b border-border pb-3">
          <Text className="font-medium">{invitation.org_name}</Text>
          <Badge label={t(`roles.${invitation.role}`)} tone="primary" />
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={t('invitations.accept')}
              disabled={busy}
              testID={`accept-${invitation.id}`}
              onPress={() =>
                void run(async () => {
                  const orgId = await acceptInvitation(invitation.id);
                  setOrg(orgId);
                  remove(invitation.id);
                  onAccepted?.();
                })
              }
            />
            <Button
              label={t('invitations.decline')}
              variant="secondary"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await declineInvitation(invitation.id);
                  remove(invitation.id);
                })
              }
            />
          </View>
        </View>
      ))}
      <ErrorNotice error={error} />
    </Card>
  );
}
