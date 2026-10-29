import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createOrganizationSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { signOut } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useWorkspaceStore } from '@/lib/settings/workspace-store';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, LoadingView, Screen, Text, TextField } from '@/ui';

import { createOrganization } from './api';
import { InvitationsList } from './InvitationsList';

type Fields = { name: string; branchName: string };

/** Signed in but not part of any organization yet: accept an invitation or create one. */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const setOrg = useWorkspaceStore((s) => s.setOrg);
  const [values, setValues] = useState<Fields>({ name: '', branchName: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  // After creating/joining, wait here until the new data has synced down.
  const [waiting, setWaiting] = useState(false);
  const { busy, error, run } = useAsyncAction();

  const submit = async () => {
    const result = validate(createOrganizationSchema, values);
    setFieldErrors(result.errors);
    if (!result.ok) return;
    await run(async () => {
      const orgId = await createOrganization(result.data.name, result.data.branchName);
      setOrg(orgId);
      setWaiting(true);
    });
  };

  if (waiting) return <LoadingView message={t('onboarding.settingUp')} />;

  return (
    <Screen>
      <Text variant="title">{t('onboarding.welcome')}</Text>
      <Text variant="muted">{t('onboarding.intro', { email: session?.user.email ?? '' })}</Text>

      <InvitationsList onAccepted={() => setWaiting(true)} />

      <Card className="gap-4">
        <Text variant="heading">{t('onboarding.createTitle')}</Text>
        <Text variant="muted">{t('onboarding.createIntro')}</Text>
        <TextField
          label={t('onboarding.orgName')}
          placeholder={t('onboarding.orgNamePlaceholder')}
          value={values.name}
          onChangeText={(name) => setValues((v) => ({ ...v, name }))}
          error={fieldErrors.name && t(`validation.${fieldErrors.name}`)}
          testID="org-name"
        />
        <TextField
          label={t('onboarding.branchName')}
          placeholder={t('onboarding.branchNamePlaceholder')}
          value={values.branchName}
          onChangeText={(branchName) => setValues((v) => ({ ...v, branchName }))}
          error={fieldErrors.branchName && t(`validation.${fieldErrors.branchName}`)}
          testID="branch-name"
        />
        <ErrorNotice error={error} />
        <Button
          label={busy ? t('common.working') : t('onboarding.create')}
          onPress={submit}
          disabled={busy}
          className="self-start"
          testID="create-org"
        />
      </Card>

      <Button label={t('auth.signOut')} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
