import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  changeDue,
  discountError,
  PAYMENT_METHODS,
  paymentError,
  percentDiscount,
  refundError,
  type PaymentMethod,
} from '@/domain/billing';
import { formatMoney, parsePounds, toPoundsInput, type Piasters } from '@/domain/money';
import { Button, Card, SegmentedControl, Text, TextField } from '@/ui';

/** Pounds typed by the user -> piasters, or null if it isn't a valid amount. */
function readAmount(text: string): Piasters | null {
  try {
    return parsePounds(text);
  } catch {
    return null;
  }
}

function useMethodOptions() {
  const { t } = useTranslation();
  return PAYMENT_METHODS.map((m) => ({ value: m, label: t(`checkout.method.${m}`) }));
}

/** Take a payment: method, amount (defaults to what is due), reference, change for cash. */
export function PaymentForm({
  due,
  busy,
  onSubmit,
}: {
  due: Piasters;
  busy: boolean;
  onSubmit: (input: { method: PaymentMethod; amount: Piasters; reference: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const methods = useMethodOptions();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountText, setAmountText] = useState(() => toPoundsInput(due));
  const [reference, setReference] = useState('');
  const [tenderedText, setTenderedText] = useState('');
  const [touched, setTouched] = useState(false);
  const [lastDue, setLastDue] = useState(due);

  // After a part payment the remaining amount becomes the new default.
  if (due !== lastDue) {
    setLastDue(due);
    setAmountText(toPoundsInput(due));
    setTouched(false);
  }

  const amount = readAmount(amountText);
  const error = amount == null ? 'invalid_amount' : paymentError(amount, due);
  const tendered = readAmount(tenderedText);
  const money = (n: number) => formatMoney(n, i18n.language);

  return (
    <Card className="gap-3" testID="payment-form">
      <Text variant="heading">{t('checkout.takePayment')}</Text>
      <SegmentedControl options={methods} value={method} onChange={setMethod} />
      <TextField
        label={t('checkout.amount')}
        value={amountText}
        onChangeText={(text) => {
          setAmountText(text);
          setTouched(true);
        }}
        keyboardType="decimal-pad"
        error={touched && error ? t(`errors.${error}`) : null}
        hint={t('checkout.amountHint', { due: money(due) })}
        testID="payment-amount"
      />
      {method === 'cash' ? (
        <TextField
          label={t('checkout.cashReceived')}
          value={tenderedText}
          onChangeText={setTenderedText}
          keyboardType="decimal-pad"
          placeholder={amountText}
          hint={
            tendered != null && amount != null && tendered > amount
              ? t('checkout.change', { amount: money(changeDue(tendered, amount)) })
              : t('checkout.cashReceivedHint')
          }
          testID="payment-tendered"
        />
      ) : (
        <TextField
          label={t('checkout.reference')}
          value={reference}
          onChangeText={setReference}
          maxLength={100}
          hint={t('checkout.referenceHint')}
          testID="payment-reference"
        />
      )}
      <Button
        label={
          amount != null && !error
            ? t('checkout.recordPayment', {
                amount: money(amount),
                method: t(`checkout.method.${method}`),
              })
            : t('checkout.recordPaymentPlain')
        }
        disabled={busy || !!error}
        onPress={() => amount != null && onSubmit({ method, amount, reference })}
        testID="record-payment"
      />
      {amount != null && amount < due && !error ? (
        <Text variant="muted">{t('checkout.splitHint')}</Text>
      ) : null}
    </Card>
  );
}

type DiscountMode = 'amount' | 'percent';

/** Owners and managers, before any payment. */
export function DiscountForm({
  subtotal,
  current,
  currentReason,
  busy,
  onApply,
}: {
  subtotal: Piasters;
  current: Piasters;
  currentReason: string | null;
  busy: boolean;
  onApply: (amount: Piasters, reason: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiscountMode>('amount');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState(currentReason ?? '');

  const percent = Number(value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
  const amount =
    mode === 'amount'
      ? readAmount(value)
      : value.trim() && Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? percentDiscount(subtotal, percent)
        : null;
  const error = amount == null ? 'invalid_discount' : discountError(amount, subtotal);
  const money = (n: number) => formatMoney(n, i18n.language);

  if (!open) {
    return (
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={current > 0 ? t('checkout.changeDiscount') : t('checkout.giveDiscount')}
          variant="secondary"
          onPress={() => setOpen(true)}
          testID="open-discount"
        />
        {current > 0 ? (
          <Button
            label={t('checkout.removeDiscount')}
            variant="secondary"
            disabled={busy}
            onPress={() => onApply(0, '')}
            testID="remove-discount"
          />
        ) : null}
      </View>
    );
  }

  return (
    <Card className="gap-3" testID="discount-form">
      <Text variant="heading">{t('checkout.giveDiscount')}</Text>
      <SegmentedControl
        options={[
          { value: 'amount', label: t('checkout.discountAmount') },
          { value: 'percent', label: t('checkout.discountPercent') },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setValue('');
        }}
      />
      <TextField
        label={mode === 'amount' ? t('checkout.amount') : t('checkout.percent')}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        hint={
          amount != null && !error
            ? t('checkout.discountResult', {
                amount: money(amount),
                total: money(subtotal - amount),
              })
            : undefined
        }
        error={value.trim() && error ? t(`errors.${error}`) : null}
        testID="discount-value"
      />
      <TextField
        label={t('checkout.discountReason')}
        value={reason}
        onChangeText={setReason}
        maxLength={200}
        testID="discount-reason"
      />
      <Text variant="muted">{t('checkout.auditHint')}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t('checkout.applyDiscount')}
          disabled={busy || !!error}
          onPress={() => {
            if (amount == null) return;
            onApply(amount, reason);
            setOpen(false);
          }}
          testID="apply-discount"
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}

/** Owners and managers: give money back, with a reason, confirmed inline. */
export function RefundForm({
  paid,
  busy,
  onSubmit,
  onClose,
}: {
  paid: Piasters;
  busy: boolean;
  onSubmit: (input: { method: PaymentMethod; amount: Piasters; reason: string }) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const methods = useMethodOptions();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountText, setAmountText] = useState(() => toPoundsInput(paid));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const amount = readAmount(amountText);
  const error = amount == null ? 'invalid_amount' : refundError(amount, paid, reason);
  const money = (n: number) => formatMoney(n, i18n.language);

  return (
    <Card className="gap-3" testID="refund-form">
      <Text variant="heading">{t('checkout.refund')}</Text>
      <SegmentedControl options={methods} value={method} onChange={setMethod} />
      <TextField
        label={t('checkout.amount')}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        hint={t('checkout.refundHint', { paid: money(paid) })}
        testID="refund-amount"
      />
      <TextField
        label={t('checkout.reason')}
        value={reason}
        onChangeText={setReason}
        maxLength={200}
        testID="refund-reason"
      />
      {confirming && amount != null ? (
        <>
          <Text variant="heading">
            {t('checkout.confirmRefund', {
              amount: money(amount),
              method: t(`checkout.method.${method}`),
            })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={t('checkout.refundNow')}
              variant="danger"
              disabled={busy || !!error}
              onPress={() => onSubmit({ method, amount, reason })}
              testID="confirm-refund"
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => setConfirming(false)}
            />
          </View>
        </>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t('checkout.refund')}
            variant="danger"
            disabled={!!error}
            onPress={() => setConfirming(true)}
            testID="start-refund"
          />
          <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
        </View>
      )}
      {error === 'reason_required' ? (
        <Text variant="muted">{t('checkout.reasonNeeded')}</Text>
      ) : null}
    </Card>
  );
}

/** Owners and managers: void the bill (it no longer counts), with a reason. */
export function VoidForm({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Card className="gap-3" testID="void-form">
      <Text variant="heading">{t('checkout.confirmVoid')}</Text>
      <Text variant="muted">{t('checkout.voidHint')}</Text>
      <TextField
        label={t('checkout.reason')}
        value={reason}
        onChangeText={setReason}
        maxLength={200}
        testID="void-reason"
      />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t('checkout.voidNow')}
          variant="danger"
          disabled={busy || !reason.trim()}
          onPress={() => onSubmit(reason)}
          testID="confirm-void"
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
      </View>
    </Card>
  );
}
