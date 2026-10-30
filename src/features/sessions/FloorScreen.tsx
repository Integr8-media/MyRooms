import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';

import { floorStatus, type FloorStatus } from '@/domain/sessions';
import { UnpaidList } from '@/features/checkout/UnpaidList';
import { SyncStatusCard } from '@/features/sync/SyncStatusCard';
import { BranchSwitcher } from '@/features/workspace/BranchSwitcher';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { SessionSegmentRow } from '@/lib/powersync/schema';
import { Badge, Button, Card, Notice, Screen, Text } from '@/ui';

import {
  estimateSession,
  sessionTiming,
  useActiveSegments,
  useFloor,
  useNow,
  useOrgPricing,
} from './data';
import { StationCard } from './StationCard';

const SUMMARY: FloorStatus[] = ['free', 'active', 'ending_soon', 'overtime', 'maintenance'];
const SUMMARY_TONE = {
  free: 'success',
  active: 'primary',
  ending_soon: 'warning',
  overtime: 'danger',
  maintenance: 'neutral',
} as const;

/** Home screen: every station of the branch with its live status, timer and running cost. */
export function FloorScreen() {
  const { t } = useTranslation();
  const { org, branch, role, membership, can } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(1000);
  const { width } = useWindowDimensions();

  const floor = useFloor(branch?.id);
  const segments = useActiveSegments(branch?.id);
  const { rules, packages } = useOrgPricing(org?.id);

  const bySession = new Map<string, SessionSegmentRow[]>();
  for (const g of segments) {
    if (!g.session_id) continue;
    bySession.set(g.session_id, [...(bySession.get(g.session_id) ?? []), g]);
  }

  const cards = floor.map((row) => {
    const timing = row.session_id ? sessionTiming(row) : null;
    const sessionSegments = row.session_id ? (bySession.get(row.session_id) ?? []) : [];
    const running = sessionSegments.find((g) => !g.ended_at);
    const pkg = row.package_id ? (packages.get(row.package_id) ?? null) : null;
    return {
      row,
      timing,
      status: floorStatus(row, timing, now),
      players: running?.players ?? null,
      estimate: timing
        ? (estimateSession(sessionSegments, rules, pkg, timeZone, now)?.total ?? null)
        : null,
    };
  });

  const counts = new Map<FloorStatus, number>();
  for (const c of cards) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);

  // Card columns: about 190 px each, at least 2.
  const columns = Math.max(2, Math.floor((Math.min(width, 1152) - 32) / 190));
  const rows: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));

  const open = (card: (typeof cards)[number]) => {
    if (card.row.session_id) {
      return () =>
        router.push({ pathname: '/sessions/[id]', params: { id: card.row.session_id! } });
    }
    if (card.status === 'free' && can('sessions.run')) {
      return () => router.push({ pathname: '/sessions/start', params: { stationId: card.row.id } });
    }
    return undefined;
  };

  return (
    <Screen wide>
      <View className="flex-row flex-wrap items-center gap-3">
        <View className="flex-1 gap-1">
          <Text variant="muted">
            {org?.name}
            {role ? ` · ${t(`roles.${role}`)}` : ''}
            {membership?.display_name ? ` · ${membership.display_name}` : ''}
          </Text>
          <Text variant="title" className="text-2xl" accessibilityRole="header">
            {branch ? branch.name : t('floor.title')}
          </Text>
        </View>
        <Button
          label={t('settings.title')}
          variant="secondary"
          onPress={() => router.push('/settings')}
          testID="open-settings"
        />
      </View>

      <BranchSwitcher />

      {!branch ? <Notice tone="warning" message={t('home.noBranch')} /> : null}

      {branch && cards.length === 0 ? (
        <Card>
          <Text variant="heading">{t('floor.title')}</Text>
          <Text variant="muted">
            {can('stations.edit') ? t('floor.emptyCanEdit') : t('floor.empty')}
          </Text>
          {can('stations.edit') ? (
            <Button
              label={t('stations.title')}
              variant="secondary"
              className="self-start"
              onPress={() => router.push('/settings/stations')}
            />
          ) : null}
        </Card>
      ) : null}

      {cards.length ? (
        <View className="flex-row flex-wrap gap-2" testID="floor-summary">
          {SUMMARY.filter((s) => counts.get(s)).map((s) => (
            <Badge
              key={s}
              tone={SUMMARY_TONE[s]}
              label={`${t(`floor.status.${s}`)}: ${counts.get(s)}`}
            />
          ))}
        </View>
      ) : null}

      <View className="gap-3">
        {rows.map((row, i) => (
          <View key={i} className="flex-row gap-3">
            {row.map((card) => (
              <StationCard
                key={card.row.id}
                name={card.row.name ?? ''}
                typeName={card.row.type_name}
                color={card.row.type_color}
                status={card.status}
                timing={card.timing}
                players={card.players}
                estimate={card.estimate}
                now={now}
                onPress={open(card)}
                testID={`station-card-${card.row.id}`}
              />
            ))}
            {Array.from({ length: columns - row.length }, (_, k) => (
              <View key={`pad-${k}`} className="flex-1" />
            ))}
          </View>
        ))}
      </View>

      <UnpaidList branchId={branch?.id} />

      <SyncStatusCard />
    </Screen>
  );
}
