import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toPoundsInput } from '@/domain/money';
import { packageSchema, validate, type FieldErrors } from '@/domain/validation';
import { formatClock } from '@/domain/zoned-time';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { PackageRow, StationTypeRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Screen, ScreenHeader, SwitchRow, Text, TextField } from '@/ui';

import { createPackage, setPackageActive, updatePackage } from './api';
import { useStationType } from './data';

/** `/settings/packages/new?typeId=…` or `/settings/packages/<id>` */
export function PackageScreen() {
  const { id, typeId } = useLocalSearchParams<{ id: string; typeId: string }>();
  const isNew = id === 'new';
  const { data: rows } = useQuery<PackageRow>('SELECT * FROM packages WHERE id = ?', [
    isNew ? null : id,
  ]);
  const pkg = rows[0];
  const type = useStationType(pkg?.station_type_id ?? typeId);
  if (!type || (!isNew && !pkg)) return null;
  return <PackageForm key={id} type={type} pkg={pkg ?? null} />;
}

type Fields = { name: string; duration: string; price: string };

function PackageForm({ type, pkg }: { type: StationTypeRow; pkg: PackageRow | null }) {
  const { t } = useTranslation();
  const { org, can } = useWorkspace();
  const editable = can('prices.edit');
  const [values, setValues] = useState<Fields>({
    name: pkg?.name ?? '',
    duration: pkg?.minutes ? formatClock(pkg.minutes) : '3:00',
    price: pkg?.price != null ? toPoundsInput(pkg.price) : '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const { busy, error, run } = useAsyncAction();
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const err = (key: keyof Fields) => fieldErrors[key] && t(`validation.${fieldErrors[key]}`);

  const save = async () => {
    const result = validate(packageSchema, values);
    setFieldErrors(result.errors);
    if (!result.ok || !org) return;
    const input = {
      name: result.data.name,
      minutes: result.data.duration,
      price: result.data.price,
    };
    const ok = await run(async () => {
      if (pkg) await updatePackage(pkg.id, input);
      else await createPackage(org.id, type.id, input);
    });
    if (ok) router.back();
  };

  return (
    <Screen>
      <ScreenHeader title={pkg ? (pkg.name ?? '') : t('packages.add')} />
      <Text variant="muted">{t('pricing.ruleFor', { type: type.name })}</Text>
      <Card className="gap-4">
        <TextField
          label={t('packages.name')}
          placeholder={t('packages.namePlaceholder')}
          value={values.name}
          onChangeText={set('name')}
          editable={editable}
          error={err('name')}
          testID="package-name"
        />
        <TextField
          label={t('packages.duration')}
          value={values.duration}
          onChangeText={set('duration')}
          editable={editable}
          placeholder="3:00"
          hint={t('packages.durationHint')}
          error={err('duration')}
          testID="package-duration"
        />
        <TextField
          label={t('packages.price')}
          value={values.price}
          onChangeText={set('price')}
          editable={editable}
          keyboardType="decimal-pad"
          inputMode="decimal"
          hint={t('packages.priceHint')}
          error={err('price')}
          testID="package-price"
        />
        <ErrorNotice error={error} />
        {editable ? (
          <Button
            label={t('common.save')}
            onPress={save}
            disabled={busy}
            className="self-start"
            testID="package-save"
          />
        ) : null}
      </Card>
      {pkg && editable ? (
        <Card>
          <SwitchRow
            label={t('packages.active')}
            description={t('packages.activeHint')}
            value={!!pkg.is_active}
            onValueChange={(active) => void run(() => setPackageActive(pkg.id, active))}
            testID="package-active"
          />
        </Card>
      ) : null}
    </Screen>
  );
}
