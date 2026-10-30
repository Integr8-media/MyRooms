import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toPoundsInput } from '@/domain/money';
import { productSchema, stockSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { localDateTime } from '@/features/income/format';
import { BranchSwitcher } from '@/features/workspace/BranchSwitcher';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Button,
  Card,
  ListRow,
  Notice,
  Screen,
  ScreenHeader,
  SegmentedControl,
  SwitchRow,
  Text,
  TextField,
} from '@/ui';

import { countStock, restock, saveProduct, setProductActive } from './api';
import { useProducts, useStockMovements, type ProductWithStock } from './data';
import { StockBadge } from './ProductsScreen';

/** `/products/new` or `/products/<id>`: the product (owners edit) and its stock in the branch. */
export function ProductScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, branch } = useWorkspace();
  const isNew = id === 'new';
  const product = useProducts(org?.id, branch?.id).find((p) => p.id === id) ?? null;

  if (!isNew && !product) {
    return (
      <Screen>
        <ScreenHeader title={t('snacks.title')} />
        <Notice tone="warning" message={t('snacks.notFound')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={product?.name ?? t('snacks.addProduct')} />
      <ProductForm key={product?.id ?? 'new'} product={product} />
      {product ? <StockCard product={product} /> : null}
    </Screen>
  );
}

type Fields = {
  name: string;
  category: string;
  price: string;
  trackStock: boolean;
  lowStockAt: string;
};

function ProductForm({ product }: { product: ProductWithStock | null }) {
  const { t } = useTranslation();
  const { org, can } = useWorkspace();
  const editable = can('products.edit');
  const { busy, error, run } = useAsyncAction();
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<Fields>({
    name: product?.name ?? '',
    category: product?.category ?? '',
    price: product ? toPoundsInput(product.price ?? 0) : '',
    trackStock: product ? !!product.track_stock : true,
    lowStockAt: product?.low_stock_at != null ? String(product.low_stock_at) : '',
  });
  const [errors, setErrors] = useState<FieldErrors<Fields>>({});
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const err = (key: keyof Fields) => errors[key] && t(`validation.${errors[key]}`);

  const save = async () => {
    const result = validate(productSchema, values);
    setErrors(result.errors);
    setSaved(false);
    if (!result.ok || !org) return;
    let newId: string | null = null;
    const ok = await run(async () => {
      newId = await saveProduct(org.id, product?.id ?? null, result.data);
    });
    if (!ok) return;
    if (product) setSaved(true);
    else if (newId) router.replace({ pathname: '/products/[id]', params: { id: newId } });
  };

  return (
    <Card className="gap-4">
      <TextField
        label={t('snacks.name')}
        placeholder={t('snacks.namePlaceholder')}
        value={values.name}
        onChangeText={set('name')}
        editable={editable}
        error={err('name')}
        testID="product-name"
      />
      <TextField
        label={t('snacks.category')}
        placeholder={t('snacks.categoryPlaceholder')}
        value={values.category}
        onChangeText={set('category')}
        editable={editable}
        error={err('category')}
        testID="product-category"
      />
      <TextField
        label={t('snacks.price')}
        value={values.price}
        onChangeText={set('price')}
        keyboardType="decimal-pad"
        inputMode="decimal"
        editable={editable}
        error={err('price')}
        testID="product-price"
      />
      <SwitchRow
        label={t('snacks.trackStock')}
        description={t('snacks.trackStockHint')}
        value={values.trackStock}
        onValueChange={(on) => editable && setValues((v) => ({ ...v, trackStock: on }))}
        testID="product-track-stock"
      />
      {values.trackStock ? (
        <TextField
          label={t('snacks.lowStockAt')}
          hint={t('snacks.lowStockAtHint')}
          value={values.lowStockAt}
          onChangeText={set('lowStockAt')}
          keyboardType="number-pad"
          inputMode="numeric"
          editable={editable}
          error={err('lowStockAt')}
          testID="product-low-stock"
        />
      ) : null}
      {saved ? <Notice tone="success" message={t('common.saved')} /> : null}
      <ErrorNotice error={error} />
      {editable ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t('common.save')}
            onPress={() => void save()}
            disabled={busy}
            testID="product-save"
          />
          {product ? (
            <Button
              label={product.is_active ? t('snacks.hide') : t('snacks.show')}
              variant="secondary"
              disabled={busy}
              onPress={() => void run(() => setProductActive(product.id, !product.is_active))}
              testID="product-active"
            />
          ) : null}
        </View>
      ) : null}
      {editable && product ? <Text variant="muted">{t('snacks.hideHint')}</Text> : null}
    </Card>
  );
}

type StockMode = 'restock' | 'count';

function StockCard({ product }: { product: ProductWithStock }) {
  const { t, i18n } = useTranslation();
  const { org, branch, can } = useWorkspace();
  const movements = useStockMovements(product.id, branch?.id);
  const { busy, error, run } = useAsyncAction();
  const [mode, setMode] = useState<StockMode>('restock');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors<{ quantity: string; note: string }>>({});
  const [saved, setSaved] = useState<string | null>(null);

  if (!product.track_stock || !branch) return null;

  const submit = async () => {
    const result = validate(stockSchema, { quantity, note });
    setErrors(result.errors);
    setSaved(null);
    if (!result.ok || !org) return;
    const target = { orgId: org.id, branchId: branch.id, productId: product.id };
    const { quantity: n, note: why } = result.data;
    if (mode === 'restock' && n < 1) {
      setErrors({ quantity: 'outOfRange' });
      return;
    }
    await run(async () => {
      if (mode === 'restock') {
        await restock(target, n, why);
        setSaved(t('snacks.restocked', { count: n }));
      } else {
        const difference = await countStock(target, n, why);
        setSaved(
          difference === 0
            ? t('snacks.countMatches')
            : t('snacks.counted', { difference: difference > 0 ? `+${difference}` : difference }),
        );
      }
      setQuantity('');
      setNote('');
    });
  };

  const when = (value: string | null) =>
    localDateTime(value, org?.timezone ?? 'Africa/Cairo', i18n.language);

  return (
    <>
      <BranchSwitcher />
      <Card className="gap-3" testID="stock-card">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="heading" className="flex-1">
            {t('snacks.stockIn', { name: branch.name })}
          </Text>
          <StockBadge product={product} />
        </View>
        <Text className="text-3xl font-bold tabular-nums" testID="stock-level">
          {product.stock}
        </Text>
        <Text variant="muted">{t('snacks.stockHint')}</Text>

        {can('stock.manage') ? (
          <View className="gap-3 border-t border-border pt-3">
            <SegmentedControl<StockMode>
              value={mode}
              onChange={(m) => {
                setMode(m);
                setErrors({});
              }}
              options={[
                { value: 'restock', label: t('snacks.restock') },
                { value: 'count', label: t('snacks.count') },
              ]}
            />
            <TextField
              label={mode === 'restock' ? t('snacks.bought') : t('snacks.countedNow')}
              hint={mode === 'count' ? t('snacks.countHint') : undefined}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              inputMode="numeric"
              error={errors.quantity && t(`validation.${errors.quantity}`)}
              testID="stock-quantity"
            />
            <TextField
              label={t('snacks.stockNote')}
              value={note}
              onChangeText={setNote}
              error={errors.note && t(`validation.${errors.note}`)}
              testID="stock-note"
            />
            {saved ? <Notice tone="success" message={saved} testID="stock-saved" /> : null}
            <ErrorNotice error={error} />
            <Button
              label={mode === 'restock' ? t('snacks.saveRestock') : t('snacks.saveCount')}
              className="self-start"
              disabled={busy}
              onPress={() => void submit()}
              testID="stock-save"
            />
          </View>
        ) : null}

        {movements.length ? (
          <View className="gap-1 border-t border-border pt-3">
            <Text className="font-medium">{t('snacks.history')}</Text>
            {movements.map((m) => (
              <ListRow
                key={m.id}
                title={`${t(m.reason === 'purchase' ? 'snacks.reason.purchase' : 'snacks.reason.adjustment')} · ${
                  (m.quantity ?? 0) > 0 ? `+${m.quantity}` : m.quantity
                }`}
                subtitle={[when(m.created_at), m.person, m.note].filter(Boolean).join(' · ')}
              />
            ))}
          </View>
        ) : null}
      </Card>
    </>
  );
}
