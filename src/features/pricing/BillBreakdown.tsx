import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { parseCustomerDiscount, type ItemLine } from '@/domain/items';
import { formatMoney } from '@/domain/money';
import type { Bill } from '@/domain/pricing';
import { formatClock, toLocal } from '@/domain/zoned-time';
import { Card, Notice, Text } from '@/ui';

import { formatDuration } from './format';

/**
 * Line-by-line bill: package, each priced time piece, snacks and drinks, discount, total, and a
 * warning for unpriced time.
 */
export function BillBreakdown({
  bill,
  timeZone,
  title,
  items = [],
  discountReason,
  testID = 'bill',
}: {
  bill: Bill;
  timeZone: string;
  title?: string;
  /** Snacks and drinks (already counted in bill.itemsAmount). */
  items?: readonly ItemLine[];
  /** bills.discount_reason: a customer's default discount is labelled as such. */
  discountReason?: string | null;
  testID?: string;
}) {
  const { t, i18n } = useTranslation();
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const clock = (instant: number) => {
    const l = toLocal(instant, timeZone);
    return formatClock(l.hour * 60 + l.minute);
  };

  return (
    <Card className="gap-2" testID={`${testID}-bill`}>
      <Text variant="heading">{title ?? t('pricing.breakdown')}</Text>
      {bill.package ? (
        <Row
          label={t('pricing.packageLine', { name: bill.package.name })}
          detail={formatDuration(bill.package.minutes, t)}
          amount={money(bill.package.price)}
        />
      ) : null}
      {bill.lines.map((line) => (
        <Row
          key={`${line.start}`}
          label={
            line.coveredByPackage
              ? t('pricing.coveredByPackage')
              : line.ruleId
                ? line.ruleName || t('pricing.unnamedRule')
                : t('pricing.noRate')
          }
          detail={`${clock(line.start)}–${clock(line.end)} · ${formatDuration(line.minutes, t)}${
            line.ruleId ? ` · ${t('pricing.perHour', { price: money(line.pricePerHour) })}` : ''
          }`}
          amount={line.coveredByPackage ? '—' : money(line.amount)}
          danger={!line.coveredByPackage && !line.ruleId}
        />
      ))}
      {items.map((item) => (
        <Row
          key={`item-${item.productId}-${item.unitPrice}`}
          label={t('snacks.itemLine', { name: item.name, count: item.quantity })}
          detail={t('snacks.each', { price: money(item.unitPrice) })}
          amount={money(item.amount)}
        />
      ))}
      {bill.discountAmount > 0 ? (
        <Row
          label={
            parseCustomerDiscount(discountReason) != null
              ? t('checkout.customerDiscount', { percent: parseCustomerDiscount(discountReason) })
              : t('checkout.discount')
          }
          detail={t('checkout.beforeDiscount', { amount: money(bill.total + bill.discountAmount) })}
          amount={`−${money(bill.discountAmount)}`}
        />
      ) : null}
      <View className="mt-2 flex-row items-center border-t border-border pt-2">
        <Text variant="heading" className="flex-1">
          {t('pricing.total', { duration: formatDuration(bill.totalMinutes, t) })}
        </Text>
        <Text variant="heading" testID={`${testID}-total`}>
          {money(bill.total)}
        </Text>
      </View>
      {bill.uncovered.length ? (
        <Notice
          tone="warning"
          message={t('pricing.uncoveredWarning')}
          testID={`${testID}-uncovered`}
        />
      ) : null}
    </Card>
  );
}

function Row({
  label,
  detail,
  amount,
  danger,
}: {
  label: string;
  detail: string;
  amount: string;
  danger?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 gap-0.5">
        <Text className={danger ? 'font-medium text-danger' : 'font-medium'}>{label}</Text>
        <Text variant="muted">{detail}</Text>
      </View>
      <Text>{amount}</Text>
    </View>
  );
}
