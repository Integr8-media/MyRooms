import { useQuery } from '@powersync/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { priceSession, type Bill } from '@/domain/pricing';
import { pricePreviewSchema, validate, type FieldErrors } from '@/domain/validation';
import { dateKey, formatClock, fromLocal, toLocal } from '@/domain/zoned-time';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { PackageRow, RateRuleRow } from '@/lib/powersync/schema';
import { Card, Notice, Screen, ScreenHeader, SegmentedControl, Text, TextField } from '@/ui';

import { BillBreakdown } from './BillBreakdown';
import { toPackage, toRateRule, useStationTypes } from './data';

type Fields = {
  stationTypeId: string;
  players: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  packageId: string | null;
};

const NO_PACKAGE = '';

function defaults(timeZone: string): Omit<Fields, 'stationTypeId'> {
  const now = Date.now();
  const start = toLocal(now, timeZone);
  const end = toLocal(now + 2 * 3600_000, timeZone);
  return {
    players: '2',
    startDate: dateKey(start),
    startTime: formatClock(start.hour * 60 + start.minute),
    endDate: dateKey(end),
    endTime: formatClock(end.hour * 60 + end.minute),
    packageId: null,
  };
}

/** Settings tool: pick a station type, players and a time range, and see what it would cost. */
export function PricePreviewScreen() {
  const { t } = useTranslation();
  const { org } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const types = useStationTypes(org?.id).filter((type) => type.is_active);
  const [values, setValues] = useState<Fields>(() => ({
    stationTypeId: '',
    ...defaults(timeZone),
  }));
  const typeId = values.stationTypeId || types[0]?.id || '';
  const type = types.find((x) => x.id === typeId);

  const { data: ruleRows } = useQuery<RateRuleRow>(
    'SELECT * FROM rate_rules WHERE station_type_id = ?',
    [typeId],
  );
  const { data: packageRows } = useQuery<PackageRow>(
    'SELECT * FROM packages WHERE station_type_id = ? AND is_active = 1 ORDER BY minutes',
    [typeId],
  );

  const set = (key: keyof Fields) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const result = validate(pricePreviewSchema, { ...values, stationTypeId: typeId });
  const errors: FieldErrors<Fields> = result.errors;
  const err = (key: keyof Fields) => errors[key] && t(`validation.${errors[key]}`);

  let bill: Bill | null = null;
  let rangeError: string | null = null;
  if (result.ok) {
    const d = result.data;
    const instant = (date: string, minutes: number) => {
      const [y, m, day] = date.split('-').map(Number);
      return fromLocal(timeZone, y!, m!, day!, 0, minutes);
    };
    const start = instant(d.startDate, d.startTime);
    const end = instant(d.endDate, d.endTime);
    const pkgRow = packageRows.find((p) => p.id === d.packageId);
    if (end <= start) rangeError = t('validation.endBeforeStart');
    else if (end - start > 7 * 24 * 3600_000) rangeError = t('pricing.previewTooLong');
    else {
      bill = priceSession({
        segments: [{ start, end, players: d.players, stationTypeId: typeId }],
        rules: ruleRows.map(toRateRule),
        timeZone,
        package: pkgRow ? toPackage(pkgRow) : null,
      });
    }
  }

  return (
    <Screen>
      <ScreenHeader title={t('pricing.previewTitle')} />
      <Text variant="muted">{t('pricing.previewIntro', { timeZone })}</Text>

      {types.length === 0 ? (
        <Notice tone="warning" message={t('stationTypes.empty')} />
      ) : (
        <Card className="gap-4">
          <Text className="text-sm font-medium">{t('pricing.stationType')}</Text>
          <SegmentedControl
            value={typeId}
            onChange={(id) => setValues((v) => ({ ...v, stationTypeId: id, packageId: null }))}
            options={types.map((x) => ({ value: x.id, label: x.name ?? '' }))}
          />
          {(type?.max_players ?? 1) > 1 ? (
            <TextField
              label={t('pricing.players')}
              value={values.players}
              onChangeText={set('players')}
              keyboardType="number-pad"
              inputMode="numeric"
              error={err('players')}
              testID="preview-players"
            />
          ) : null}
          <View className="flex-row gap-3">
            <TextField
              className="flex-1"
              label={t('pricing.startDate')}
              value={values.startDate}
              onChangeText={set('startDate')}
              placeholder="YYYY-MM-DD"
              error={err('startDate')}
              testID="preview-start-date"
            />
            <TextField
              className="flex-1"
              label={t('pricing.startTime')}
              value={values.startTime}
              onChangeText={set('startTime')}
              placeholder="18:00"
              error={err('startTime')}
              testID="preview-start-time"
            />
          </View>
          <View className="flex-row gap-3">
            <TextField
              className="flex-1"
              label={t('pricing.endDate')}
              value={values.endDate}
              onChangeText={set('endDate')}
              placeholder="YYYY-MM-DD"
              error={err('endDate')}
              testID="preview-end-date"
            />
            <TextField
              className="flex-1"
              label={t('pricing.endTime')}
              value={values.endTime}
              onChangeText={set('endTime')}
              placeholder="20:00"
              error={err('endTime')}
              testID="preview-end-time"
            />
          </View>
          {packageRows.length ? (
            <>
              <Text className="text-sm font-medium">{t('packages.title')}</Text>
              <SegmentedControl
                value={values.packageId ?? NO_PACKAGE}
                onChange={(id) => setValues((v) => ({ ...v, packageId: id || null }))}
                options={[
                  { value: NO_PACKAGE, label: t('packages.none') },
                  ...packageRows.map((p) => ({ value: p.id, label: p.name ?? '' })),
                ]}
              />
            </>
          ) : null}
        </Card>
      )}

      {rangeError ? <Notice tone="danger" message={rangeError} /> : null}
      {bill ? <BillBreakdown bill={bill} timeZone={timeZone} testID="preview" /> : null}
    </Screen>
  );
}
