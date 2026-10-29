import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { profileSchema, validate, type ValidationKey } from '@/domain/validation';
import { SetPasswordForm } from '@/features/auth/SetPasswordForm';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { InvitationsList } from '@/features/onboarding/InvitationsList';
import { AppearanceSettings } from '@/features/settings/AppearanceSettings';
import { usePendingUploads } from '@/features/sync/usePendingUploads';
import { signOut, updateDisplayName } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Notice, Screen, ScreenHeader, Text, TextField } from '@/ui';

export function AccountScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const pending = usePendingUploads();
  const user = session?.user;
  const [fullName, setFullName] = useState<string>(user?.user_metadata?.full_name ?? '');
  const [nameError, setNameError] = useState<ValidationKey | undefined>();
  const [saved, setSaved] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const { busy, error, run } = useAsyncAction();

  const saveName = async () => {
    const result = validate(profileSchema, { fullName });
    setNameError(result.errors.fullName);
    setSaved(false);
    if (!result.ok) return;
    if (await run(() => updateDisplayName(result.data.fullName))) setSaved(true);
  };

  const doSignOut = async () => {
    // Unsent changes would be wiped with the local data: ask once more first.
    if (pending > 0 && !confirmSignOut) {
      setConfirmSignOut(true);
      return;
    }
    await run(signOut);
  };

  return (
    <Screen>
      <ScreenHeader title={t('account.title')} />

      <Card className="gap-4">
        <Text variant="muted">{t('account.signedInAs', { email: user?.email ?? '' })}</Text>
        <TextField
          label={t('auth.fullName')}
          value={fullName}
          onChangeText={setFullName}
          error={nameError && t(`validation.${nameError}`)}
          testID="account-name"
        />
        {saved ? <Notice tone="success" message={t('common.saved')} /> : null}
        <Button
          label={t('common.save')}
          onPress={saveName}
          disabled={busy}
          className="self-start"
          testID="account-save-name"
        />
      </Card>

      <Card className="gap-4">
        <Text variant="heading">{t('account.changePassword')}</Text>
        <SetPasswordForm />
      </Card>

      <InvitationsList />
      <AppearanceSettings />

      <Card>
        {confirmSignOut ? (
          <Notice tone="warning" message={t('account.unsyncedWarning', { count: pending })} />
        ) : null}
        <ErrorNotice error={error} />
        <Button
          label={confirmSignOut ? t('account.signOutAnyway') : t('auth.signOut')}
          variant="danger"
          onPress={doSignOut}
          disabled={busy}
          className="self-start"
          testID="sign-out"
        />
      </Card>
    </Screen>
  );
}
