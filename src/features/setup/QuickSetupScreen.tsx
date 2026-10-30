import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '@/domain/money';
import { starterTypes, type StarterGroup } from '@/domain/setup';
import {
  MAX_PLAYERS,
  MAX_STARTER_STATIONS,
  quickSetupSchema,
  validate,
  type FieldErrors,
} from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { STATION_COLORS } from '@/features/pricing/pickers';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Notice, Screen, ScreenHeader, Stepper, Text, TextField } from '@/ui';

import { runQuickSetup } from './api';

type Fields = {
  psCount: string;
  psPrice: string;
  psPlayers: string;
  pcCount: string;
  pcPrice: string;
};

/**
 * First-time setup for owners: how many PlayStation rooms and PC desks, and the hourly price of
 * each. Makes the station types, a base price and the stations of the current branch.
 */
export function QuickSetupScreen() {
  const { t, i18n } = useTranslation();
  const { org, branch, can } = useWorkspace();
  const [psCount, setPsCount] = useState(0);
  const [pcCount, setPcCount] = useState(0);
  const [psPlayers, setPsPlayers] = useState(4);
  const [psPrice, setPsPrice] = useState('');
  const [pcPrice, setPcPrice] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Fields>>({});
  const { busy, error, run } = useAsyncAction();

  if (!can('prices.edit')) {
    return (
      <Screen>
        <ScreenHeader title={t('setup.title')} />
        <Notice tone="info" message={t('setup.ownerOnly')} />
      </Screen>
    );
  }

  const values: Fields = {
    psCount: String(psCount),
    psPrice,
    psPlayers: String(psPlayers),
    pcCount: String(pcCount),
    pcPrice,
  };
  const parsed = validate(quickSetupSchema, values);

  const groups = (data: NonNullable<typeof parsed.data>): StarterGroup[] => [
    {
      kind: 'ps_room',
      typeName: t('setup.psTypeName'),
      stationPrefix: t('setup.psPrefix'),
      count: data.psCount,
      pricePerHour: data.psPrice,
      maxPlayers: data.psPlayers,
      color: STATION_COLORS[0]!,
    },
    {
      kind: 'pc_desk',
      typeName: t('setup.pcTypeName'),
      stationPrefix: t('setup.pcPrefix'),
      count: data.pcCount,
      pricePerHour: data.pcPrice,
      maxPlayers: 1,
      color: STATION_COLORS[1]!,
    },
  ];
  const preview = parsed.ok ? starterTypes(groups(parsed.data)) : [];

  const submit = async () => {
    setErrors(parsed.errors);
    if (!parsed.ok || !org || !branch) return;
    const types = starterTypes(groups(parsed.data));
    if (await run(() => runQuickSetup(org.id, branch.id, types))) router.replace('/');
  };

  const fieldError = (key: keyof Fields) => errors[key] && t(`validation.${errors[key]}`);

  return (
    <Screen>
      <ScreenHeader title={t('setup.title')} />
      <Text variant="muted">{t('setup.intro', { branch: branch?.name ?? '' })}</Text>

      <Card className="gap-4">
        <Text variant="heading">{t('setup.psTitle')}</Text>
        <Stepper
          label={t('setup.psCount')}
          value={psCount}
          onChange={setPsCount}
          min={0}
          max={MAX_STARTER_STATIONS}
          decreaseLabel={t('setup.fewer')}
          increaseLabel={t('setup.more')}
          testID="setup-ps-count"
        />
        {psCount > 0 ? (
          <>
            <TextField
              label={t('setup.pricePerHour')}
              value={psPrice}
              onChangeText={setPsPrice}
              keyboardType="decimal-pad"
              placeholder="60"
              error={fieldError('psPrice')}
              testID="setup-ps-price"
            />
            <Stepper
              label={t('stationTypes.maxPlayers')}
              value={psPlayers}
              onChange={setPsPlayers}
              min={1}
              max={MAX_PLAYERS}
              decreaseLabel={t('sessions.fewerPlayers')}
              increaseLabel={t('sessions.morePlayers')}
              testID="setup-ps-players"
            />
          </>
        ) : null}
        {fieldError('psCount') ? (
          <Text className="text-sm text-danger" accessibilityRole="alert">
            {fieldError('psCount')}
          </Text>
        ) : null}
      </Card>

      <Card className="gap-4">
        <Text variant="heading">{t('setup.pcTitle')}</Text>
        <Stepper
          label={t('setup.pcCount')}
          value={pcCount}
          onChange={setPcCount}
          min={0}
          max={MAX_STARTER_STATIONS}
          decreaseLabel={t('setup.fewer')}
          increaseLabel={t('setup.more')}
          testID="setup-pc-count"
        />
        {pcCount > 0 ? (
          <TextField
            label={t('setup.pricePerHour')}
            value={pcPrice}
            onChangeText={setPcPrice}
            keyboardType="decimal-pad"
            placeholder="20"
            error={fieldError('pcPrice')}
            testID="setup-pc-price"
          />
        ) : null}
      </Card>

      {preview.length ? (
        <Card className="gap-2" testID="setup-preview">
          <Text variant="heading">{t('setup.previewTitle')}</Text>
          {preview.map((type) => (
            <Text key={type.kind}>
              {t('setup.previewLine', {
                type: type.name,
                count: type.stationNames.length,
                first: type.stationNames[0],
                last: type.stationNames[type.stationNames.length - 1],
                price: formatMoney(type.pricePerHour, i18n.language),
              })}
            </Text>
          ))}
          <Text variant="muted">{t('setup.laterHint')}</Text>
        </Card>
      ) : null}

      <ErrorNotice error={error} />
      <Button
        label={busy ? t('common.working') : t('setup.create')}
        onPress={() => void submit()}
        disabled={busy || !branch}
        className="self-start"
        testID="setup-create"
      />
      <Button
        label={t('setup.skip')}
        variant="secondary"
        onPress={() => router.replace('/')}
        className="self-start"
      />
    </Screen>
  );
}
