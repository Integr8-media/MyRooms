import { useQuery } from '@powersync/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { accountDeletionPlan } from '@/domain/account';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { usePendingUploads } from '@/features/sync/usePendingUploads';
import { deleteAccount } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Notice, Text, TextField } from '@/ui';

type Row = { org_id: string; user_id: string; role: string; org_name: string };

/**
 * "Delete my account" (required by Google Play and the App Store). Shown in Account settings
 * and on the onboarding screen. Explains what happens to each organization first, then asks
 * the person to type a confirmation word.
 */
export function DeleteAccountCard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const pending = usePendingUploads();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const { busy, error, run } = useAsyncAction();

  // Every member of the person's organizations (owners sync them all).
  const { data: rows } = useQuery<Row>(
    `SELECT m.org_id, m.user_id, m.role, o.name AS org_name
       FROM memberships m JOIN organizations o ON o.id = m.org_id
      WHERE m.org_id IN (SELECT org_id FROM memberships WHERE user_id = ?)`,
    [userId],
  );
  const plan = accountDeletionPlan(userId, rows);
  const names = (ids: string[]) =>
    ids
      .map((id) => rows.find((r) => r.org_id === id)?.org_name ?? '')
      .join(t('common.listSeparator'));

  const word = t('account.deleteWord');
  const confirmed = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase();

  if (!open) {
    return (
      <Card className="gap-3">
        <Text variant="heading">{t('account.deleteTitle')}</Text>
        <Text variant="muted">{t('account.deleteIntro')}</Text>
        <Button
          label={t('account.deleteTitle')}
          variant="secondary"
          onPress={() => setOpen(true)}
          className="self-start"
          testID="delete-account"
        />
      </Card>
    );
  }

  const blocked = plan.blocked.length > 0;
  return (
    <Card className="gap-3">
      <Text variant="heading">{t('account.deleteTitle')}</Text>
      {blocked ? (
        <Notice
          tone="danger"
          message={t('account.deleteBlocked', { orgs: names(plan.blocked) })}
          testID="delete-blocked"
        />
      ) : (
        <>
          <Notice tone="warning" message={t('account.deleteWarning')} />
          {plan.deleted.length > 0 ? (
            <Notice
              tone="danger"
              message={t('account.deleteOrgs', { orgs: names(plan.deleted) })}
              testID="delete-orgs"
            />
          ) : null}
          {plan.left.length > 0 ? (
            <Text variant="muted">{t('account.deleteLeaves', { orgs: names(plan.left) })}</Text>
          ) : null}
          {pending > 0 ? (
            <Notice tone="warning" message={t('account.deletePending', { count: pending })} />
          ) : null}
          <TextField
            label={t('account.deleteType', { word })}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="delete-confirm-word"
          />
        </>
      )}
      <ErrorNotice error={error} />
      <Button
        label={busy ? t('common.working') : t('account.deleteForever')}
        variant="danger"
        onPress={() => void run(deleteAccount)}
        disabled={blocked || !confirmed || busy}
        className="self-start"
        testID="delete-account-confirm"
      />
      <Button
        label={t('common.cancel')}
        variant="secondary"
        onPress={() => {
          setOpen(false);
          setTyped('');
        }}
        disabled={busy}
        className="self-start"
      />
    </Card>
  );
}
