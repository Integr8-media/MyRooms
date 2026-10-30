import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '@/domain/money';
import { parseTimestamp } from '@/domain/sessions';
import { formatClock, toLocal } from '@/domain/zoned-time';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Card, ListRow, Text } from '@/ui';

import { useUnpaid } from './data';

/** Floor section: ended sessions that still need to be paid, newest first. */
export function UnpaidList({ branchId }: { branchId: string | null | undefined }) {
  const { t, i18n } = useTranslation();
  const { org } = useWorkspace();
  const rows = useUnpaid(branchId);
  if (!rows.length) return null;

  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const clock = (value: string | null) => {
    const instant = parseTimestamp(value);
    if (instant == null) return '—';
    const l = toLocal(instant, timeZone);
    return formatClock(l.hour * 60 + l.minute);
  };

  return (
    <Card className="gap-1" testID="unpaid-list">
      <Text variant="heading">{t('checkout.unpaidTitle', { count: rows.length })}</Text>
      {rows.map((row) => (
        <ListRow
          key={row.session_id}
          title={row.station_name ?? ''}
          subtitle={t('checkout.endedAt', { time: clock(row.actual_end) })}
          trailing={
            <Badge
              tone="warning"
              label={
                row.bill_id == null
                  ? t('checkout.noBillShort')
                  : formatMoney(Math.max(0, (row.total ?? 0) - row.paid), i18n.language)
              }
            />
          }
          onPress={() =>
            router.push({ pathname: '/checkout/[id]', params: { id: row.session_id } })
          }
          testID={`unpaid-${row.session_id}`}
        />
      ))}
    </Card>
  );
}
