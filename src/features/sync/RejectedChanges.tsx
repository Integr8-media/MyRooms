import { useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { rangeToForm } from '@/domain/reservations';
import { parseTimestamp } from '@/domain/sessions';
import { formatDay, timeRange } from '@/features/reservations/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { ERROR_KEYS, type ErrorKey } from '@/lib/errors';
import { powersync } from '@/lib/powersync/database';
import type { UploadRejectionRow } from '@/lib/powersync/schema';
import { Button, Card, Text } from '@/ui';

type Row = UploadRejectionRow & { station_name: string | null };

type Parsed = {
  row: Row;
  data: Record<string, unknown>;
  kind:
    | 'reservation_new'
    | 'reservation_change'
    | 'walk_in'
    | 'session_change'
    | 'item'
    | 'customer'
    | 'stock'
    | 'expense'
    | 'other';
};

const errorKeyOf = (value: string | null): ErrorKey =>
  ERROR_KEYS.find((k) => k === value) ?? 'unknown';

const str = (v: unknown) => (typeof v === 'string' ? v : null);

function parse(row: Row): Parsed {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(row.data ?? '{}') as Record<string, unknown>;
  } catch {
    // Unreadable: shown as a general change.
  }
  const isNew = row.op === 'PUT';
  let kind: Parsed['kind'] = 'other';
  if (row.table_name === 'sessions') {
    if (data.kind === 'reservation') kind = isNew ? 'reservation_new' : 'reservation_change';
    else kind = isNew ? 'walk_in' : 'session_change';
  } else if (row.table_name === 'session_items') kind = 'item';
  else if (row.table_name === 'customers') kind = 'customer';
  else if (row.table_name === 'stock_movements') kind = 'stock';
  else if (row.table_name === 'expenses') kind = 'expense';
  return { row, data, kind };
}

/**
 * Changes the server refused for good while this device was offline (most often a reservation
 * that another device booked first, or a walk-in on a station another device had started).
 * The server's version has replaced them; this list says what was lost so staff can redo it.
 */
export function RejectedChanges() {
  const { t, i18n } = useTranslation();
  const { org, can } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const { data } = useQuery<Row>(
    `SELECT r.*, s.name AS station_name
       FROM upload_rejections r
       LEFT JOIN stations s ON s.id = json_extract(r.data, '$.station_id')
      ORDER BY r.created_at DESC`,
  );
  if (!data.length) return null;

  const dismiss = (id?: string) =>
    id
      ? powersync.execute('DELETE FROM upload_rejections WHERE id = ?', [id])
      : powersync.execute('DELETE FROM upload_rejections');

  const bookAgain = (p: Parsed) => {
    const start = parseTimestamp(str(p.data.scheduled_start));
    const end = parseTimestamp(str(p.data.scheduled_end));
    const form = start != null && end != null ? rangeToForm(start, end, timeZone) : null;
    router.push({
      pathname: '/reservations/new',
      params: {
        stationId: str(p.data.station_id) ?? '',
        ...(form ? { date: form.date, time: form.time, minutes: String(form.minutes) } : {}),
        players: String(p.data.players ?? 1),
        name: str(p.data.customer_name) ?? '',
        phone: str(p.data.customer_phone) ?? '',
        note: str(p.data.note) ?? '',
        rejected: p.row.id,
      },
    });
  };

  return (
    <Card className="gap-3 border-danger" testID="rejected-changes">
      <View className="gap-1">
        <Text variant="heading">{t('conflicts.title', { count: data.length })}</Text>
        <Text variant="muted">{t('conflicts.hint')}</Text>
      </View>
      {data.map((row) => {
        const p = parse(row);
        const start =
          parseTimestamp(str(p.data.scheduled_start)) ?? parseTimestamp(str(p.data.actual_start));
        const end = parseTimestamp(str(p.data.scheduled_end));
        const when =
          start != null
            ? `${formatDay(rangeToForm(start, start, timeZone).date, i18n.language)} ${timeRange(start, end, timeZone)}`
            : null;
        // Items, customers and products have a name; reservations a customer name.
        const details = [row.station_name, when, str(p.data.customer_name), str(p.data.name)]
          .filter(Boolean)
          .join(' · ');
        return (
          <View
            key={row.id}
            className="gap-2 border-t border-border pt-2"
            testID={`rejected-${row.id}`}
          >
            <Text className="font-medium">{t(`conflicts.kind.${p.kind}`)}</Text>
            {details ? <Text>{details}</Text> : null}
            <Text variant="muted">
              {t('conflicts.reason', { reason: t(`errors.${errorKeyOf(row.error)}`) })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {p.kind === 'reservation_new' && can('reservations.manage') ? (
                <Button
                  label={t('conflicts.bookAgain')}
                  onPress={() => bookAgain(p)}
                  testID={`book-again-${row.id}`}
                />
              ) : null}
              <Button
                label={t('conflicts.dismiss')}
                variant="secondary"
                onPress={() => void dismiss(row.id)}
                testID={`dismiss-${row.id}`}
              />
            </View>
          </View>
        );
      })}
      {data.length > 1 ? (
        <Button
          label={t('conflicts.dismissAll')}
          variant="secondary"
          className="self-start"
          onPress={() => void dismiss()}
        />
      ) : null}
    </Card>
  );
}
