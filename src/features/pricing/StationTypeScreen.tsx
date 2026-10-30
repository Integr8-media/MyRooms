import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '@/domain/money';
import {
  stationTypeSchema,
  STATION_KINDS,
  validate,
  type FieldErrors,
  type StationKind,
} from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { StationTypeRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Badge,
  Button,
  Card,
  ListRow,
  Notice,
  Screen,
  ScreenHeader,
  SegmentedControl,
  SwitchRow,
  Text,
  TextField,
} from '@/ui';

import { createStationType, setStationTypeActive, updateStationType } from './api';
import { toRateRule, usePackages, useRateRules, useStationType } from './data';
import { formatDuration, formatPerHour, ruleConditions } from './format';
import { ColorPicker, STATION_COLORS } from './pickers';

/** Create (`/settings/station-types/new`) or edit a station type with its prices and packages. */
export function StationTypeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const type = useStationType(isNew ? null : id);
  if (!isNew && !type) return null;
  return <StationTypeForm key={id} type={type ?? null} />;
}

type Fields = { name: string; kind: StationKind; maxPlayers: string; color: string | null };

function StationTypeForm({ type }: { type: StationTypeRow | null }) {
  const { t } = useTranslation();
  const { org, can } = useWorkspace();
  const editable = can('prices.edit');
  const [values, setValues] = useState<Fields>({
    name: type?.name ?? '',
    kind: type?.kind === 'pc_desk' ? 'pc_desk' : 'ps_room',
    maxPlayers: String(type?.max_players ?? 4),
    color: type?.color ?? STATION_COLORS[0],
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsyncAction();

  const save = async () => {
    const result = validate(stationTypeSchema, values);
    setFieldErrors(result.errors);
    setSaved(false);
    if (!result.ok || !org) return;
    let newId: string | null = null;
    const ok = await run(async () => {
      if (type) await updateStationType(type.id, result.data);
      else newId = await createStationType(org.id, result.data);
    });
    if (!ok) return;
    if (newId) {
      // Stay on the new type so its prices can be added right away.
      router.replace({ pathname: '/settings/station-types/[id]', params: { id: newId } });
    } else {
      setSaved(true);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={type ? (type.name ?? '') : t('stationTypes.add')} />
      <Card className="gap-4">
        <TextField
          label={t('stationTypes.name')}
          placeholder={t('stationTypes.namePlaceholder')}
          value={values.name}
          onChangeText={(name) => setValues((v) => ({ ...v, name }))}
          editable={editable}
          error={fieldErrors.name && t(`validation.${fieldErrors.name}`)}
          testID="station-type-name"
        />
        <Text className="text-sm font-medium">{t('stationTypes.kind')}</Text>
        <SegmentedControl<StationKind>
          value={values.kind}
          onChange={(kind) =>
            editable &&
            setValues((v) => ({ ...v, kind, maxPlayers: kind === 'pc_desk' ? '1' : v.maxPlayers }))
          }
          options={STATION_KINDS.map((k) => ({
            value: k,
            label: k === 'ps_room' ? t('stationTypes.kindPs') : t('stationTypes.kindPc'),
          }))}
        />
        <TextField
          label={t('stationTypes.maxPlayers')}
          value={values.maxPlayers}
          onChangeText={(maxPlayers) => setValues((v) => ({ ...v, maxPlayers }))}
          editable={editable}
          keyboardType="number-pad"
          inputMode="numeric"
          hint={t('stationTypes.maxPlayersHint')}
          error={fieldErrors.maxPlayers && t(`validation.${fieldErrors.maxPlayers}`)}
          testID="station-type-max-players"
        />
        <ColorPicker
          value={values.color}
          onChange={(color) => setValues((v) => ({ ...v, color }))}
          disabled={!editable}
        />
        {saved ? <Notice tone="success" message={t('common.saved')} /> : null}
        <ErrorNotice error={error} />
        {editable ? (
          <Button
            label={type ? t('common.save') : t('stationTypes.create')}
            onPress={save}
            disabled={busy}
            className="self-start"
            testID="station-type-save"
          />
        ) : null}
      </Card>

      {type ? (
        <>
          <RulesCard type={type} editable={editable} />
          <PackagesCard type={type} editable={editable} />
          {editable ? (
            <Card>
              <SwitchRow
                label={t('stationTypes.active')}
                description={t('stationTypes.activeHint')}
                value={!!type.is_active}
                onValueChange={(active) => void run(() => setStationTypeActive(type.id, active))}
                testID="station-type-active"
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function RulesCard({ type, editable }: { type: StationTypeRow; editable: boolean }) {
  const { t, i18n } = useTranslation();
  const rules = useRateRules(type.id).map(toRateRule);
  const open = (id: string) =>
    router.push({ pathname: '/settings/rate-rules/[id]', params: { id, typeId: type.id } });

  return (
    <Card className="gap-1">
      <Text variant="heading">{t('pricing.rulesTitle')}</Text>
      <Text variant="muted">{t('pricing.rulesIntro')}</Text>
      {rules.length === 0 ? <Notice tone="warning" message={t('pricing.noRules')} /> : null}
      {rules.map((rule) => (
        <ListRow
          key={rule.id}
          title={`${rule.name || t('pricing.unnamedRule')} · ${formatPerHour(rule.pricePerHour, i18n.language, t)}`}
          subtitle={ruleConditions(rule, i18n.language, t)}
          trailing={<Badge label={t('pricing.priorityShort', { n: rule.priority })} />}
          onPress={editable ? () => open(rule.id) : undefined}
          testID={`rule-${rule.id}`}
        />
      ))}
      {editable ? (
        <Button
          label={t('pricing.addRule')}
          variant="secondary"
          onPress={() => open('new')}
          className="mt-2 self-start"
          testID="add-rule"
        />
      ) : null}
    </Card>
  );
}

function PackagesCard({ type, editable }: { type: StationTypeRow; editable: boolean }) {
  const { t, i18n } = useTranslation();
  const packages = usePackages(type.id);
  const open = (id: string) =>
    router.push({ pathname: '/settings/packages/[id]', params: { id, typeId: type.id } });

  return (
    <Card className="gap-1">
      <Text variant="heading">{t('packages.title')}</Text>
      <Text variant="muted">{t('packages.intro')}</Text>
      {packages.length === 0 ? <Text variant="muted">{t('packages.empty')}</Text> : null}
      {packages.map((pkg) => (
        <ListRow
          key={pkg.id}
          title={pkg.name ?? ''}
          subtitle={`${formatDuration(pkg.minutes ?? 0, t)} · ${formatMoney(pkg.price ?? 0, i18n.language)}`}
          trailing={pkg.is_active ? null : <Badge label={t('common.off')} tone="warning" />}
          onPress={editable ? () => open(pkg.id) : undefined}
          testID={`package-${pkg.id}`}
        />
      ))}
      {editable ? (
        <Button
          label={t('packages.add')}
          variant="secondary"
          onPress={() => open('new')}
          className="mt-2 self-start"
          testID="add-package"
        />
      ) : null}
    </Card>
  );
}
