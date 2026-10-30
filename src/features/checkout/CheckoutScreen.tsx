import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isPaymentMethod, type BillStatus } from '@/domain/billing';
import { formatMoney } from '@/domain/money';
import { parseCustomerDiscount } from '@/domain/items';
import { parseTimestamp } from '@/domain/sessions';
import { formatClock, toLocal } from '@/domain/zoned-time';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { BillBreakdown } from '@/features/pricing/BillBreakdown';
import { formatDuration } from '@/features/pricing/format';
import { useSession } from '@/features/sessions/data';
import { useSessionItems } from '@/features/snacks/data';
import { ItemsCard } from '@/features/snacks/ItemsCard';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Badge,
  Button,
  Card,
  ListRow,
  LoadingView,
  Notice,
  Screen,
  ScreenHeader,
  Text,
} from '@/ui';

import { addPayment, applyDiscount, createBill, refund, voidBill } from './api';
import { summarizeBill, useBill, usePayments } from './data';
import { DiscountForm, PaymentForm, RefundForm, VoidForm } from './forms';
import { receiptHtml } from './receipt';
import { shareReceipt } from './shareReceipt';

const STATUS_TONE: Record<BillStatus, 'warning' | 'primary' | 'success' | 'neutral'> = {
  open: 'warning',
  partially_paid: 'primary',
  paid: 'success',
  void: 'neutral',
};

type Panel = 'refund' | 'void' | null;

/** Bill of one ended session: breakdown, discount, payments (split allowed), refund, void, receipt. */
export function CheckoutScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, branch, can, features } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const { busy, error, run } = useAsyncAction();
  const [panel, setPanel] = useState<Panel>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { session, isLoading } = useSession(id);
  const { bill, isLoading: billLoading } = useBill(id);
  const payments = usePayments(id);
  const items = useSessionItems(id);
  const { data: stationRows } = useQuery<{ name: string | null }>(
    'SELECT name FROM stations WHERE id = ?',
    [session?.station_id ?? null],
  );
  const stationName = stationRows[0]?.name ?? '';
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const clock = (instant: number | null) => {
    if (instant == null) return '—';
    const l = toLocal(instant, timeZone);
    return formatClock(l.hour * 60 + l.minute);
  };

  if (!session || (!bill && billLoading)) {
    return isLoading || billLoading ? (
      <LoadingView />
    ) : (
      <Screen>
        <ScreenHeader title={t('checkout.title')} />
        <Notice tone="warning" message={t('sessions.notFound')} />
      </Screen>
    );
  }

  const act = (action: () => Promise<unknown>, message?: string) =>
    run(async () => {
      setSaved(null);
      await action();
      setPanel(null);
      if (message) setSaved(message);
    });

  const start = parseTimestamp(session.actual_start);
  const end = parseTimestamp(session.actual_end);
  const header = (
    <>
      <ScreenHeader title={t('checkout.title')} />
      <Card className="gap-1">
        <Text variant="heading">{stationName}</Text>
        <Text variant="muted">
          {t('checkout.played', {
            from: clock(start),
            to: clock(end),
            duration:
              start != null && end != null ? formatDuration((end - start) / 60_000, t) : '—',
          })}
        </Text>
        {session.customer_name ? (
          <Text testID="checkout-customer">
            {session.customer_name}
            {session.customer_phone ? ` · ${session.customer_phone}` : ''}
          </Text>
        ) : null}
        {session.note ? <Text variant="muted">{session.note}</Text> : null}
      </Card>
    </>
  );

  if (session.status !== 'completed') {
    return (
      <Screen>
        {header}
        <Notice
          tone="warning"
          message={
            session.status === 'cancelled' ? t('sessions.cancelledNotice') : t('checkout.notEnded')
          }
        />
      </Screen>
    );
  }

  if (!bill) {
    return (
      <Screen>
        {header}
        <ErrorNotice error={error} />
        <Notice tone="info" message={t('checkout.noBill')} />
        {can('bills.pay') ? (
          <Button
            label={t('checkout.createBill')}
            disabled={busy}
            onPress={() => act(() => createBill(session.id))}
            testID="create-bill"
          />
        ) : null}
      </Screen>
    );
  }

  const summary = summarizeBill(bill, payments, items);
  const customerPercent = parseCustomerDiscount(bill.discount_reason);
  const isVoid = summary.status === 'void';
  const synced = bill.number != null;

  const onReceipt = () =>
    run(async () => {
      const html = receiptHtml({
        orgName: org?.name ?? '',
        branchName: branch?.name ?? '',
        stationName,
        number: bill.number,
        start,
        end,
        summary,
        discountReason: bill.discount_reason,
        customerName: session.customer_name,
        payments,
        timeZone,
        language: i18n.language,
        t,
      });
      await shareReceipt(html, t('checkout.receipt'));
    });

  return (
    <Screen>
      {header}

      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={t(`checkout.status.${summary.status}`)} tone={STATUS_TONE[summary.status]} />
        <Text variant="muted" testID="bill-number">
          {synced ? t('checkout.receiptNumber', { number: bill.number }) : t('checkout.notSynced')}
        </Text>
      </View>

      <ErrorNotice error={error} />
      {saved ? <Notice tone="success" message={saved} testID="checkout-saved" /> : null}

      {summary.breakdown ? (
        <BillBreakdown
          bill={summary.breakdown}
          timeZone={timeZone}
          title={t('checkout.bill')}
          items={summary.items}
          discountReason={bill.discount_reason}
          testID="checkout"
        />
      ) : (
        <Notice tone="warning" message={t('checkout.notPriced')} />
      )}
      {summary.details && summary.details.gapMinutes >= 1 ? (
        <Notice
          tone="warning"
          message={t('checkout.gapWarning', {
            duration: formatDuration(Math.round(summary.details.gapMinutes), t),
          })}
        />
      ) : null}
      {!synced ? <Text variant="muted">{t('checkout.estimateHint')}</Text> : null}

      {isVoid ? (
        <Notice
          tone="warning"
          message={t('checkout.voidedNotice', { reason: bill.void_reason ?? '' })}
          testID="void-notice"
        />
      ) : null}

      <Card className="gap-1" testID="money-summary">
        <MoneyRow label={t('checkout.total')} value={money(summary.total)} strong />
        <MoneyRow label={t('checkout.paid')} value={money(summary.paid)} />
        {summary.overpaid > 0 ? (
          <MoneyRow
            label={t('checkout.overpaid')}
            value={money(summary.overpaid)}
            testID="overpaid"
          />
        ) : (
          <MoneyRow
            label={t('checkout.due')}
            value={money(summary.due)}
            strong
            testID="amount-due"
          />
        )}
      </Card>

      {payments.length ? (
        <Card className="gap-1">
          <Text variant="heading">{t('checkout.payments')}</Text>
          {payments.map((p) => {
            const method = t(`checkout.method.${isPaymentMethod(p.method) ? p.method : 'cash'}`);
            const refunded = p.kind === 'refund';
            return (
              <ListRow
                key={p.id}
                title={
                  refunded
                    ? `${t('checkout.refunded')} · ${method} · −${money(p.amount ?? 0)}`
                    : `${method} · ${money(p.amount ?? 0)}`
                }
                subtitle={[
                  clock(parseTimestamp(p.paid_at)),
                  p.person,
                  p.reference ? t('checkout.refShort', { reference: p.reference }) : null,
                  p.reason,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                testID={`payment-${p.id}`}
              />
            );
          })}
        </Card>
      ) : null}

      {features.snacks && !isVoid ? (
        <ItemsCard
          sessionId={session.id}
          items={items}
          canAdd={can('items.sell')}
          canRemove={can('items.removeAfterEnd') && summary.paid === 0}
        />
      ) : null}

      {!isVoid && summary.due > 0 && can('bills.pay') ? (
        <PaymentForm
          due={summary.due}
          busy={busy}
          onSubmit={(input) =>
            act(
              () => addPayment({ billId: bill.id, ...input }),
              t('checkout.paymentSaved', { amount: money(input.amount) }),
            )
          }
        />
      ) : null}

      {!isVoid && summary.due === 0 ? (
        <Notice tone="success" message={t('checkout.paidNotice')} testID="paid-notice" />
      ) : null}

      {!isVoid && summary.paid === 0 && can('bills.discount') ? (
        <DiscountForm
          subtotal={summary.subtotal}
          current={summary.discount}
          currentReason={customerPercent != null ? null : bill.discount_reason}
          busy={busy}
          onApply={(amount, reason) =>
            act(() => applyDiscount(bill.id, amount, reason), t('checkout.discountSaved'))
          }
        />
      ) : null}
      {bill.discount_reason && summary.discount > 0 && customerPercent == null ? (
        <Text variant="muted">{t('checkout.discountWhy', { reason: bill.discount_reason })}</Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t('checkout.printReceipt')}
          variant="secondary"
          disabled={busy}
          onPress={onReceipt}
          testID="receipt"
        />
        {!isVoid && summary.paid > 0 && can('bills.refund') && panel !== 'refund' ? (
          <Button
            label={t('checkout.refund')}
            variant="secondary"
            onPress={() => setPanel('refund')}
            testID="open-refund"
          />
        ) : null}
        {!isVoid && can('bills.void') && panel !== 'void' ? (
          <Button
            label={t('checkout.void')}
            variant="secondary"
            onPress={() => setPanel('void')}
            testID="open-void"
          />
        ) : null}
      </View>

      {panel === 'refund' ? (
        <RefundForm
          paid={summary.paid}
          busy={busy}
          onClose={() => setPanel(null)}
          onSubmit={(input) =>
            act(
              () => refund({ billId: bill.id, ...input }),
              t('checkout.refundSaved', { amount: money(input.amount) }),
            )
          }
        />
      ) : null}
      {panel === 'void' ? (
        <VoidForm
          busy={busy}
          onClose={() => setPanel(null)}
          onSubmit={(reason) => act(() => voidBill(bill.id, reason))}
        />
      ) : null}

      <Button
        label={t('sessions.backToFloor')}
        variant="secondary"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}

function MoneyRow({
  label,
  value,
  strong,
  testID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testID?: string;
}) {
  return (
    <View className="flex-row items-center">
      <Text className={strong ? 'flex-1 font-semibold' : 'flex-1'}>{label}</Text>
      <Text className={strong ? 'font-semibold' : undefined} testID={testID}>
        {value}
      </Text>
    </View>
  );
}
