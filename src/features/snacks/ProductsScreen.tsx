import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '@/domain/money';
import { BranchSwitcher } from '@/features/workspace/BranchSwitcher';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Button, Card, ListRow, Notice, Screen, ScreenHeader, Text } from '@/ui';

import { lowStock, useProducts, type ProductWithStock } from './data';

/** Products of the organization with their stock in the current branch. */
export function ProductsScreen() {
  const { t, i18n } = useTranslation();
  const { org, branch, can, features } = useWorkspace();
  const products = useProducts(org?.id, branch?.id);
  const low = lowStock(products);
  const open = (id: string) => router.push({ pathname: '/products/[id]', params: { id } });

  if (!features.snacks) {
    return (
      <Screen>
        <ScreenHeader title={t('snacks.title')} />
        <Notice tone="info" message={t('modules.off')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t('snacks.title')}
        actions={
          can('products.edit') ? (
            <Button
              label={t('snacks.addProduct')}
              onPress={() => open('new')}
              testID="add-product"
            />
          ) : null
        }
      />
      <BranchSwitcher />
      {low.length ? (
        <Notice
          tone="warning"
          message={t('snacks.lowNotice', {
            count: low.length,
            names: low.map((p) => p.name).join(', '),
          })}
          testID="low-stock-notice"
        />
      ) : null}
      <Card className="gap-1">
        {products.length === 0 ? (
          <Text variant="muted">
            {can('products.edit') ? t('snacks.emptyOwner') : t('snacks.empty')}
          </Text>
        ) : null}
        {products.map((p) => (
          <ListRow
            key={p.id}
            title={p.name ?? ''}
            subtitle={[p.category, formatMoney(p.price ?? 0, i18n.language)]
              .filter(Boolean)
              .join(' · ')}
            trailing={<StockBadge product={p} />}
            onPress={() => open(p.id)}
            testID={`product-row-${p.id}`}
          />
        ))}
      </Card>
    </Screen>
  );
}

export function StockBadge({ product }: { product: ProductWithStock }) {
  const { t } = useTranslation();
  if (!product.is_active) return <Badge label={t('snacks.hidden')} />;
  switch (product.state) {
    case 'untracked':
      return null;
    case 'out':
      return <Badge label={t('snacks.inStock', { count: product.stock })} tone="danger" />;
    case 'low':
      return <Badge label={t('snacks.inStock', { count: product.stock })} tone="warning" />;
    default:
      return <Badge label={t('snacks.inStock', { count: product.stock })} tone="success" />;
  }
}
