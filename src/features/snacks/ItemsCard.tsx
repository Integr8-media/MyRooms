import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { itemsTotal, MAX_ITEM_QUANTITY, type StockState } from '@/domain/items';
import { formatMoney } from '@/domain/money';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { SessionItemRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Stepper, Text } from '@/ui';

import { addItem, removeItem } from './api';
import { useProducts } from './data';

const STATE_KEY: Partial<Record<StockState, 'snacks.low' | 'snacks.out'>> = {
  low: 'snacks.low',
  out: 'snacks.out',
};

/**
 * Snacks and drinks of a session (session sheet and checkout): what was sold, adding more,
 * and taking an item off. Only shown when the snacks module is on.
 */
export function ItemsCard({
  sessionId,
  items,
  canAdd,
  canRemove,
}: {
  sessionId: string;
  items: readonly SessionItemRow[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { org, branch } = useWorkspace();
  const products = useProducts(org?.id, branch?.id).filter((p) => p.is_active);
  const { busy, error, run } = useAsyncAction();
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const selected = products.find((p) => p.id === productId) ?? null;

  if (!items.length && !canAdd) return null;

  const add = () =>
    run(async () => {
      if (!selected) return;
      await addItem(sessionId, selected.id, quantity);
      setProductId(null);
      setQuantity(1);
    });

  return (
    <Card className="gap-2" testID="items-card">
      <Text variant="heading">{t('snacks.sessionTitle')}</Text>

      {items.map((item) => (
        <View key={item.id} className="gap-1" testID={`item-${item.id}`}>
          <View className="flex-row items-center gap-3">
            <Text className="flex-1">
              {t('snacks.itemLine', { name: item.name ?? '', count: item.quantity ?? 0 })}
            </Text>
            <Text>{money((item.quantity ?? 0) * (item.unit_price ?? 0))}</Text>
            {canRemove && confirmRemove !== item.id ? (
              <Button
                label={t('snacks.remove')}
                variant="secondary"
                disabled={busy}
                onPress={() => setConfirmRemove(item.id)}
                testID={`remove-item-${item.id}`}
              />
            ) : null}
          </View>
          {confirmRemove === item.id ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <Text variant="muted" className="flex-1">
                {t('snacks.confirmRemove', { name: item.name ?? '' })}
              </Text>
              <Button
                label={t('snacks.removeNow')}
                variant="danger"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await removeItem(item.id);
                    setConfirmRemove(null);
                  })
                }
                testID={`confirm-remove-${item.id}`}
              />
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setConfirmRemove(null)}
              />
            </View>
          ) : null}
        </View>
      ))}
      {items.length ? (
        <View className="flex-row border-t border-border pt-2">
          <Text className="flex-1 font-semibold">{t('snacks.itemsTotal')}</Text>
          <Text className="font-semibold" testID="items-total">
            {money(itemsTotal(items))}
          </Text>
        </View>
      ) : (
        <Text variant="muted">{t('snacks.noItems')}</Text>
      )}

      {canAdd ? (
        products.length ? (
          <View className="gap-2 border-t border-border pt-2">
            <Text className="text-sm font-medium">{t('snacks.add')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {products.map((p) => {
                const hint = STATE_KEY[p.state];
                return (
                  <Button
                    key={p.id}
                    label={`${p.name ?? ''} · ${money(p.price ?? 0)}${hint ? ` · ${t(hint)}` : ''}`}
                    variant="secondary"
                    selected={p.id === productId}
                    onPress={() => setProductId(p.id === productId ? null : p.id)}
                    testID={`product-${p.id}`}
                  />
                );
              })}
            </View>
            {selected ? (
              <View className="gap-2">
                <Stepper
                  label={t('snacks.quantity')}
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={MAX_ITEM_QUANTITY}
                  decreaseLabel={t('snacks.fewer')}
                  increaseLabel={t('snacks.more')}
                  disabled={busy}
                  testID="item-quantity"
                />
                {selected.state === 'out' ? (
                  <Text variant="muted">{t('snacks.outHint')}</Text>
                ) : null}
                <Button
                  label={t('snacks.addFor', {
                    name: selected.name ?? '',
                    count: quantity,
                    price: money(quantity * (selected.price ?? 0)),
                  })}
                  className="self-start"
                  disabled={busy}
                  onPress={() => void add()}
                  testID="add-item"
                />
              </View>
            ) : null}
          </View>
        ) : (
          <Text variant="muted">{t('snacks.noProducts')}</Text>
        )
      ) : null}
      <ErrorNotice error={error} />
    </Card>
  );
}
