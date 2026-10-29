import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { branchSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { BranchRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Notice, Screen, ScreenHeader, SwitchRow, TextField } from '@/ui';

import { createBranch, setBranchActive, updateBranch } from './api';

type Fields = { name: string; address: string; phone: string };

/** Create (`/settings/branches/new`) or edit a branch. */
export function BranchEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branches } = useWorkspace();
  const isNew = id === 'new';
  const branch = branches.find((b) => b.id === id);

  if (!isNew && !branch) return null;
  // Remount when switching branches so the form starts from that branch's values.
  return <BranchForm key={id} branch={branch ?? null} />;
}

function BranchForm({ branch }: { branch: BranchRow | null }) {
  const { t } = useTranslation();
  const { org, can } = useWorkspace();
  const canEdit = branch ? can('branches.edit') : can('branches.create');
  const [values, setValues] = useState<Fields>({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  const save = async () => {
    const result = validate(branchSchema, values);
    setFieldErrors(result.errors);
    setSaved(false);
    if (!result.ok || !org) return;
    const ok = await run(async () => {
      if (branch) await updateBranch(branch.id, result.data);
      else await createBranch(org.id, result.data);
    });
    if (!ok) return;
    if (branch) setSaved(true);
    else router.back();
  };

  return (
    <Screen>
      <ScreenHeader title={branch ? (branch.name ?? '') : t('branches.add')} />
      <Card className="gap-4">
        <TextField
          label={t('branches.name')}
          value={values.name}
          onChangeText={set('name')}
          editable={canEdit}
          error={fieldErrors.name && t(`validation.${fieldErrors.name}`)}
          testID="branch-name"
        />
        <TextField
          label={t('branches.address')}
          value={values.address}
          onChangeText={set('address')}
          editable={canEdit}
          error={fieldErrors.address && t(`validation.${fieldErrors.address}`)}
        />
        <TextField
          label={t('branches.phone')}
          value={values.phone}
          onChangeText={set('phone')}
          editable={canEdit}
          keyboardType="phone-pad"
          inputMode="tel"
          error={fieldErrors.phone && t(`validation.${fieldErrors.phone}`)}
        />
        {saved ? <Notice tone="success" message={t('common.saved')} /> : null}
        <ErrorNotice error={error} />
        {canEdit ? (
          <Button
            label={t('common.save')}
            onPress={save}
            disabled={busy}
            className="self-start"
            testID="branch-save"
          />
        ) : null}
      </Card>

      {branch && can('branches.create') ? (
        <Card>
          <SwitchRow
            label={t('branches.active')}
            description={t('branches.activeHint')}
            value={!!branch.is_active}
            onValueChange={(active) => void run(() => setBranchActive(branch.id, active))}
            testID="branch-active"
          />
        </Card>
      ) : null}
    </Screen>
  );
}
