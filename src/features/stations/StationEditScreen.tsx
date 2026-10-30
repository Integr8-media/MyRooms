import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { stationSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useStationTypes } from '@/features/pricing/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { StationRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Button,
  Card,
  Notice,
  Screen,
  ScreenHeader,
  SegmentedControl,
  SwitchRow,
  Text,
  TextField,
} from '@/ui';

import { createStations, setStationActive, setStationMaintenance, updateStation } from './api';

/** `/settings/stations/new` (in the current branch) or `/settings/stations/<id>`. */
export function StationEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: rows } = useQuery<StationRow>('SELECT * FROM stations WHERE id = ?', [
    isNew ? null : id,
  ]);
  const station = rows[0];
  if (!isNew && !station) return null;
  return <StationForm key={id} station={station ?? null} />;
}

type Fields = { name: string; stationTypeId: string; notes: string; count: string };

function StationForm({ station }: { station: StationRow | null }) {
  const { t } = useTranslation();
  const { org, branch, branches, can } = useWorkspace();
  const editable = can('stations.edit');
  const types = useStationTypes(org?.id).filter(
    (type) => type.is_active || type.id === station?.station_type_id,
  );
  const [values, setValues] = useState<Fields>({
    name: station?.name ?? '',
    stationTypeId: station?.station_type_id ?? '',
    notes: station?.notes ?? '',
    count: '1',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Fields>>({});
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const err = (key: keyof Fields) => fieldErrors[key] && t(`validation.${fieldErrors[key]}`);
  const typeId = values.stationTypeId || types[0]?.id || '';
  const branchName = branches.find((b) => b.id === (station?.branch_id ?? branch?.id))?.name;

  const save = async () => {
    const result = validate(stationSchema, { ...values, stationTypeId: typeId });
    setFieldErrors(result.errors);
    setSaved(false);
    if (!result.ok || !org || (!station && !branch)) return;
    const { count, ...input } = result.data;
    const ok = await run(async () => {
      if (station) await updateStation(station.id, input);
      else await createStations(org.id, branch!.id, input, count);
    });
    if (!ok) return;
    if (station) setSaved(true);
    else router.back();
  };

  const count = Number(values.count) || 1;

  return (
    <Screen>
      <ScreenHeader title={station ? (station.name ?? '') : t('stations.add')} />
      {branchName ? (
        <Text variant="muted">{t('stations.inBranch', { name: branchName })}</Text>
      ) : null}
      <Card className="gap-4">
        <TextField
          label={t('stations.name')}
          placeholder={t('stations.namePlaceholder')}
          value={values.name}
          onChangeText={set('name')}
          editable={editable}
          error={err('name')}
          testID="station-name"
        />
        {!station ? (
          <TextField
            label={t('stations.count')}
            value={values.count}
            onChangeText={set('count')}
            keyboardType="number-pad"
            inputMode="numeric"
            hint={
              count > 1 && values.name.trim()
                ? t('stations.countPreview', {
                    first: `${values.name.trim()} 1`,
                    last: `${values.name.trim()} ${count}`,
                  })
                : t('stations.countHint')
            }
            error={err('count')}
            testID="station-count"
          />
        ) : null}
        <Text className="text-sm font-medium">{t('pricing.stationType')}</Text>
        <SegmentedControl
          value={typeId}
          onChange={(id) => editable && setValues((v) => ({ ...v, stationTypeId: id }))}
          options={types.map((type) => ({ value: type.id, label: type.name ?? '' }))}
        />
        {err('stationTypeId') ? <Notice tone="danger" message={err('stationTypeId')!} /> : null}
        <TextField
          label={t('stations.notes')}
          value={values.notes}
          onChangeText={set('notes')}
          editable={editable}
          multiline
          error={err('notes')}
          testID="station-notes"
        />
        {saved ? <Notice tone="success" message={t('common.saved')} /> : null}
        <ErrorNotice error={error} />
        {editable ? (
          <Button
            label={t('common.save')}
            onPress={save}
            disabled={busy}
            className="self-start"
            testID="station-save"
          />
        ) : null}
      </Card>

      {station && editable ? (
        <Card>
          <SwitchRow
            label={t('stations.maintenance')}
            description={t('stations.maintenanceHint')}
            value={station.status === 'maintenance'}
            onValueChange={(on) => void run(() => setStationMaintenance(station.id, on))}
            testID="station-maintenance"
          />
          <SwitchRow
            label={t('stations.inUse')}
            description={t('stations.inUseHint')}
            value={!!station.is_active}
            onValueChange={(on) => void run(() => setStationActive(station.id, on))}
            testID="station-active"
          />
        </Card>
      ) : null}
    </Screen>
  );
}
