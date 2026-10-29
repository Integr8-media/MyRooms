import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toPoundsInput } from '@/domain/money';
import { ALL_DAYS, maskToDays } from '@/domain/pricing';
import { rateRuleSchema, validate, type FieldErrors } from '@/domain/validation';
import { formatClock } from '@/domain/zoned-time';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { RateRuleRow, StationTypeRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Notice, Screen, ScreenHeader, SwitchRow, Text, TextField } from '@/ui';

import { createRateRule, deleteRateRule, updateRateRule } from './api';
import { useRateRules, useStationType } from './data';
import { DayPicker } from './pickers';

/** `/settings/rate-rules/new?typeId=…` or `/settings/rate-rules/<id>?typeId=…` */
export function RateRuleScreen() {
  const { id, typeId } = useLocalSearchParams<{ id: string; typeId: string }>();
  const isNew = id === 'new';
  const { data: rows } = useQuery<RateRuleRow>('SELECT * FROM rate_rules WHERE id = ?', [
    isNew ? null : id,
  ]);
  const rule = rows[0];
  const type = useStationType(rule?.station_type_id ?? typeId);
  const siblings = useRateRules(type?.id);
  if (!type || (!isNew && !rule)) return null;
  return <RuleForm key={id} type={type} rule={rule ?? null} isFirst={siblings.length === 0} />;
}

type Fields = {
  name: string;
  price: string;
  playersMin: string;
  playersMax: string;
  days: number[];
  allDay: boolean;
  from: string;
  to: string;
  priority: string;
  validFrom: string;
  validTo: string;
};

function initialValues(rule: RateRuleRow | null, isFirst: boolean, base: string): Fields {
  const str = (n: number | null | undefined) => (n == null ? '' : String(n));
  const hasWindow = rule?.from_minute != null && rule?.to_minute != null;
  return {
    name: rule?.name ?? (isFirst ? base : ''),
    price: rule?.price_per_hour != null ? toPoundsInput(rule.price_per_hour) : '',
    playersMin: str(rule?.players_min),
    playersMax: str(rule?.players_max),
    days: maskToDays(rule?.days_of_week ?? ALL_DAYS),
    allDay: !hasWindow,
    from: hasWindow ? formatClock(rule!.from_minute!) : '18:00',
    to: hasWindow ? formatClock(rule!.to_minute!) : '24:00',
    // The first rule is the base price; later ones are usually exceptions that should win.
    priority: rule ? str(rule.priority) : isFirst ? '0' : '10',
    validFrom: rule?.valid_from?.slice(0, 10) ?? '',
    validTo: rule?.valid_to?.slice(0, 10) ?? '',
  };
}

function RuleForm({
  type,
  rule,
  isFirst,
}: {
  type: StationTypeRow;
  rule: RateRuleRow | null;
  isFirst: boolean;
}) {
  const { t } = useTranslation();
  const { org, can } = useWorkspace();
  const editable = can('prices.edit');
  const [values, setValues] = useState<Fields>(() =>
    initialValues(rule, isFirst, t('pricing.baseName')),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const err = (key: keyof Fields) => fieldErrors[key] && t(`validation.${fieldErrors[key]}`);
  const multiplayer = (type.max_players ?? 1) > 1;

  const save = async () => {
    const result = validate(rateRuleSchema, values);
    setFieldErrors(result.errors);
    if (!result.ok || !org) return;
    const ok = await run(async () => {
      if (rule) await updateRateRule(rule.id, result.data);
      else await createRateRule(org.id, type.id, result.data);
    });
    if (ok) router.back();
  };

  const remove = async () => {
    if (rule && (await run(() => deleteRateRule(rule.id)))) router.back();
  };

  return (
    <Screen>
      <ScreenHeader title={rule ? t('pricing.editRule') : t('pricing.addRule')} />
      <Text variant="muted">{t('pricing.ruleFor', { type: type.name })}</Text>

      <Card className="gap-4">
        <TextField
          label={t('pricing.ruleName')}
          placeholder={t('pricing.ruleNamePlaceholder')}
          value={values.name}
          onChangeText={set('name')}
          editable={editable}
          error={err('name')}
          testID="rule-name"
        />
        <TextField
          label={t('pricing.pricePerHour')}
          value={values.price}
          onChangeText={set('price')}
          editable={editable}
          keyboardType="decimal-pad"
          inputMode="decimal"
          hint={multiplayer ? t('pricing.pricePerHourRoomHint') : t('pricing.pricePerHourHint')}
          error={err('price')}
          testID="rule-price"
        />
      </Card>

      <Card className="gap-4">
        <Text variant="heading">{t('pricing.whenTitle')}</Text>
        <DayPicker
          value={values.days}
          onChange={(days) => setValues((v) => ({ ...v, days }))}
          disabled={!editable}
          error={err('days')}
        />
        <SwitchRow
          label={t('pricing.allDay')}
          value={values.allDay}
          onValueChange={(allDay) => setValues((v) => ({ ...v, allDay }))}
          disabled={!editable}
          testID="rule-all-day"
        />
        {!values.allDay ? (
          <>
            <View className="flex-row gap-3">
              <TextField
                className="flex-1"
                label={t('pricing.from')}
                value={values.from}
                onChangeText={set('from')}
                editable={editable}
                placeholder="18:00"
                error={err('from')}
                testID="rule-from"
              />
              <TextField
                className="flex-1"
                label={t('pricing.to')}
                value={values.to}
                onChangeText={set('to')}
                editable={editable}
                placeholder="24:00"
                error={err('to')}
                testID="rule-to"
              />
            </View>
            <Text variant="muted">{t('pricing.windowHint')}</Text>
          </>
        ) : null}
        {multiplayer ? (
          <>
            <View className="flex-row gap-3">
              <TextField
                className="flex-1"
                label={t('pricing.playersMin')}
                value={values.playersMin}
                onChangeText={set('playersMin')}
                editable={editable}
                keyboardType="number-pad"
                inputMode="numeric"
                error={err('playersMin')}
                testID="rule-players-min"
              />
              <TextField
                className="flex-1"
                label={t('pricing.playersMax')}
                value={values.playersMax}
                onChangeText={set('playersMax')}
                editable={editable}
                keyboardType="number-pad"
                inputMode="numeric"
                error={err('playersMax')}
                testID="rule-players-max"
              />
            </View>
            <Text variant="muted">{t('pricing.playersHint')}</Text>
          </>
        ) : null}
      </Card>

      <Card className="gap-4">
        <Text variant="heading">{t('pricing.advancedTitle')}</Text>
        <TextField
          label={t('pricing.priority')}
          value={values.priority}
          onChangeText={set('priority')}
          editable={editable}
          keyboardType="numbers-and-punctuation"
          hint={t('pricing.priorityHint')}
          error={err('priority')}
          testID="rule-priority"
        />
        <View className="flex-row gap-3">
          <TextField
            className="flex-1"
            label={t('pricing.validFrom')}
            value={values.validFrom}
            onChangeText={set('validFrom')}
            editable={editable}
            placeholder="YYYY-MM-DD"
            error={err('validFrom')}
            testID="rule-valid-from"
          />
          <TextField
            className="flex-1"
            label={t('pricing.validTo')}
            value={values.validTo}
            onChangeText={set('validTo')}
            editable={editable}
            placeholder="YYYY-MM-DD"
            error={err('validTo')}
            testID="rule-valid-to"
          />
        </View>
        <Text variant="muted">{t('pricing.validHint')}</Text>
      </Card>

      <ErrorNotice error={error} />
      {editable ? (
        <Button
          label={t('common.save')}
          onPress={save}
          disabled={busy}
          className="self-start"
          testID="rule-save"
        />
      ) : null}

      {rule && editable ? (
        <Card>
          {confirmDelete ? (
            <>
              <Notice tone="warning" message={t('pricing.deleteConfirm')} />
              <View className="flex-row flex-wrap gap-2">
                <Button
                  label={t('pricing.deleteConfirmButton')}
                  variant="danger"
                  onPress={remove}
                  disabled={busy}
                  testID="rule-delete-confirm"
                />
                <Button
                  label={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setConfirmDelete(false)}
                />
              </View>
            </>
          ) : (
            <Button
              label={t('pricing.deleteRule')}
              variant="secondary"
              onPress={() => setConfirmDelete(true)}
              className="self-start"
              testID="rule-delete"
            />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
