import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { share, type IncomeSummary } from '@/domain/income';
import { Card, Text } from '@/ui';

export function TotalCard({
  title,
  summary,
  money,
  testID,
  children,
}: {
  title: string;
  summary: IncomeSummary;
  money: (n: number) => string;
  testID: string;
  /** Extra lines under the counts (e.g. the change against the previous period). */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text variant="muted">{title}</Text>
      <Text variant="title" testID={testID}>
        {money(summary.net)}
      </Text>
      <Text variant="muted" testID="income-counts">
        {t('income.counts', { count: summary.payments, received: money(summary.received) })}
        {summary.refunds
          ? ` · ${t('income.refunds', { count: summary.refunds, amount: money(summary.refunded) })}`
          : ''}
      </Text>
      {children}
    </Card>
  );
}

export type BarItem = {
  key: string;
  label: string;
  amount: number;
  /** Shown instead of the formatted amount. */
  value?: string;
  /** Extra line under the label. */
  detail?: string;
  /** Bar width in percent (instead of the share of the total). */
  pct?: number;
};

/**
 * Labeled amounts with a bar each. Bars show the share of `total` (or, with relativeToMax,
 * the size compared with the largest item, or each item's own `pct`). Bars start at the
 * reading direction's start.
 */
export function AmountBars({
  items,
  total,
  relativeToMax,
  money,
  empty,
  testPrefix,
}: {
  items: BarItem[];
  total: number;
  relativeToMax?: boolean;
  money: (n: number) => string;
  empty?: string;
  testPrefix: string;
}) {
  if (!items.length && empty) return <Text variant="muted">{empty}</Text>;
  return (
    <View className="gap-3">
      {items.map((item) => {
        const pct = item.pct ?? share(item.amount, total);
        const showShare = item.pct == null && !relativeToMax && total > 0;
        return (
          <View key={item.key} className="gap-1" testID={`${testPrefix}-${item.key}`}>
            <View className="flex-row items-baseline gap-2">
              <View className="flex-1">
                <Text>{item.label}</Text>
                {item.detail ? <Text variant="muted">{item.detail}</Text> : null}
              </View>
              {showShare ? <Text variant="muted">{`${pct}%`}</Text> : null}
              <Text
                className={item.amount < 0 ? 'font-semibold text-danger' : 'font-semibold'}
                testID={`${testPrefix}-${item.key}-amount`}
              >
                {item.value ?? money(item.amount)}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-border/60">
              <View
                className="h-2 rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
