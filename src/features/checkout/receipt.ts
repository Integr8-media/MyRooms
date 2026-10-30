import type { TFunction } from 'i18next';

import { parseCustomerDiscount } from '@/domain/items';
import { formatMoney } from '@/domain/money';
import { formatClock, toLocal } from '@/domain/zoned-time';
import { formatDuration } from '@/features/pricing/format';

import type { BillSummary } from './data';

export type ReceiptInput = {
  orgName: string;
  branchName: string;
  stationName: string;
  /** Null until the bill has synced and the server gave it a number. */
  number: number | null;
  start: number | null;
  end: number | null;
  summary: BillSummary;
  /** bills.discount_reason (a customer's default discount gets its own label). */
  discountReason?: string | null;
  /** Shown under the title when the session has a customer. */
  customerName?: string | null;
  payments: readonly { kind: string | null; method: string | null; amount: number | null }[];
  timeZone: string;
  language: string;
  t: TFunction;
};

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** A small printable receipt (58/80 mm paper or A4), as a standalone HTML page. */
export function receiptHtml(r: ReceiptInput): string {
  const { t, summary } = r;
  const money = (amount: number) => escape(formatMoney(amount, r.language));
  const when = (instant: number | null) => {
    if (instant == null) return '—';
    const l = toLocal(instant, r.timeZone);
    const date = `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
    return `${date} ${formatClock(l.hour * 60 + l.minute)}`;
  };
  const clock = (instant: number) => {
    const l = toLocal(instant, r.timeZone);
    return formatClock(l.hour * 60 + l.minute);
  };
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${label}</td><td class="amount">${value}</td></tr>`;

  const lines: string[] = [];
  const breakdown = summary.breakdown;
  if (breakdown?.package) {
    lines.push(
      row(
        `${escape(t('pricing.packageLine', { name: breakdown.package.name }))}<br><small>${escape(
          formatDuration(breakdown.package.minutes, t),
        )}</small>`,
        money(breakdown.package.price),
      ),
    );
  }
  for (const line of breakdown?.lines ?? []) {
    if (line.coveredByPackage) continue;
    const label = line.ruleName || t('pricing.unnamedRule');
    lines.push(
      row(
        `${escape(label)}<br><small>${clock(line.start)}–${clock(line.end)} · ${escape(
          formatDuration(line.minutes, t),
        )}</small>`,
        money(line.amount),
      ),
    );
  }
  for (const item of summary.items) {
    lines.push(
      row(
        `${escape(t('snacks.itemLine', { name: item.name, count: item.quantity }))}<br><small>${escape(
          t('snacks.each', { price: formatMoney(item.unitPrice, r.language) }),
        )}</small>`,
        money(item.amount),
      ),
    );
  }
  if (summary.discount > 0) {
    const percent = parseCustomerDiscount(r.discountReason);
    lines.push(row(escape(t('checkout.subtotal')), money(summary.subtotal)));
    lines.push(
      row(
        escape(
          percent != null ? t('checkout.customerDiscount', { percent }) : t('checkout.discount'),
        ),
        `−${money(summary.discount)}`,
      ),
    );
  }
  lines.push(row(escape(t('checkout.total')), money(summary.total), true));
  for (const p of r.payments) {
    const method = escape(
      t(`checkout.method.${p.method === 'visa' || p.method === 'instapay' ? p.method : 'cash'}`),
    );
    lines.push(
      p.kind === 'refund'
        ? row(`${escape(t('checkout.refunded'))} · ${method}`, `−${money(p.amount ?? 0)}`)
        : row(`${escape(t('checkout.paidBy'))} ${method}`, money(p.amount ?? 0)),
    );
  }
  if (summary.due > 0) lines.push(row(escape(t('checkout.due')), money(summary.due), true));

  const rtl = r.language.startsWith('ar');
  const title =
    r.number != null ? t('checkout.receiptNumber', { number: r.number }) : t('checkout.receipt');
  return `<!doctype html>
<html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  @page { margin: 8mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #111;
         max-width: 360px; margin: 0 auto; font-size: 14px; }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; }
  .center { text-align: center; }
  .muted { color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  td { padding: 4px 0; vertical-align: top; }
  td.amount { text-align: end; white-space: nowrap; padding-inline-start: 12px; }
  tr.strong td { font-weight: 700; border-top: 1px solid #111; padding-top: 6px; }
  small { color: #555; }
  .status { margin-top: 12px; text-align: center; font-weight: 700; }
</style>
</head>
<body>
  <h1>${escape(r.orgName)}</h1>
  <div class="center muted">${escape(r.branchName)}</div>
  <div class="center" style="margin-top:8px">${escape(title)}</div>
  <div class="center muted">${escape(r.stationName)} · ${when(r.start)} → ${when(r.end)}</div>
  ${r.customerName ? `<div class="center muted">${escape(r.customerName)}</div>` : ''}
  <table>${lines.join('\n')}</table>
  <div class="status">${escape(t(`checkout.status.${summary.status}`))}</div>
  <div class="center muted" style="margin-top:12px">${escape(t('checkout.thanks'))}</div>
</body>
</html>`;
}
