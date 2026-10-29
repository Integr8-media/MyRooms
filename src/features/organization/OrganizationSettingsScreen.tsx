import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { organizationSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Notice, Screen, ScreenHeader, SwitchRow, Text, TextField } from '@/ui';

import { setFeature, updateOrganization, type Feature } from './api';

type Fields = { name: string; timezone: string };

export function OrganizationSettingsScreen() {
  const { t } = useTranslation();
  const { org, features, can } = useWorkspace();
  const editable = can('org.settings');
  const [values, setValues] = useState<Fields>({
    name: org?.name ?? '',
    timezone: org?.timezone ?? 'Africa/Cairo',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsyncAction();

  if (!org) return null;

  const save = async () => {
    const result = validate(organizationSchema, values);
    setFieldErrors(result.errors);
    setSaved(false);
    if (!result.ok) return;
    if (await run(() => updateOrganization(org.id, result.data))) setSaved(true);
  };

  const toggle = (feature: Feature) => (enabled: boolean) =>
    void run(() => setFeature(org.id, feature, enabled));

  return (
    <Screen>
      <ScreenHeader title={t('settings.organization')} />
      {!editable ? <Notice message={t('organization.ownerOnly')} /> : null}

      <Card className="gap-4">
        <TextField
          label={t('organization.name')}
          value={values.name}
          onChangeText={(name) => setValues((v) => ({ ...v, name }))}
          editable={editable}
          error={fieldErrors.name && t(`validation.${fieldErrors.name}`)}
          testID="org-name"
        />
        <TextField
          label={t('organization.timezone')}
          value={values.timezone}
          onChangeText={(timezone) => setValues((v) => ({ ...v, timezone }))}
          editable={editable}
          autoCapitalize="none"
          hint={t('organization.timezoneHint')}
          error={fieldErrors.timezone && t(`validation.${fieldErrors.timezone}`)}
          testID="org-timezone"
        />
        <Text variant="muted">{t('organization.currency', { currency: org.currency })}</Text>
        {saved ? <Notice tone="success" message={t('common.saved')} /> : null}
        {editable ? (
          <Button
            label={t('common.save')}
            onPress={save}
            disabled={busy}
            className="self-start"
            testID="org-save"
          />
        ) : null}
      </Card>

      <Card>
        <Text variant="heading">{t('organization.featuresTitle')}</Text>
        <Text variant="muted">{t('organization.featuresIntro')}</Text>
        <SwitchRow
          label={t('organization.featureCustomers')}
          value={features.customers}
          onValueChange={toggle('customers')}
          disabled={!editable}
          testID="feature-customers"
        />
        <SwitchRow
          label={t('organization.featureSnacks')}
          value={features.snacks}
          onValueChange={toggle('snacks')}
          disabled={!editable}
          testID="feature-snacks"
        />
        <SwitchRow
          label={t('organization.featureExpenses')}
          value={features.expenses}
          onValueChange={toggle('expenses')}
          disabled={!editable}
          testID="feature-expenses"
        />
      </Card>
      <ErrorNotice error={error} />
    </Screen>
  );
}
