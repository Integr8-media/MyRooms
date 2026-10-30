import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { formatMoney } from '@/domain/money';
import { ModuleLinks } from '@/features/sessions/ModuleLinks';

import { ItemsCard } from './ItemsCard';
import { ProductScreen } from './ProductScreen';
import { ProductsScreen } from './ProductsScreen';

// Products with their stock in branch A (as returned by useProducts' query).
const mockProducts = [
  {
    id: 'cola',
    org_id: 'org',
    name: 'Cola',
    category: 'Drinks',
    price: 1500,
    track_stock: 1,
    low_stock_at: 5,
    is_active: 1,
    stock: 3,
  },
  {
    id: 'chips',
    org_id: 'org',
    name: 'Chips',
    category: null,
    price: 1000,
    track_stock: 1,
    low_stock_at: null,
    is_active: 1,
    stock: 0,
  },
  {
    id: 'tea',
    org_id: 'org',
    name: 'Tea',
    category: 'Drinks',
    price: 500,
    track_stock: 0,
    low_stock_at: null,
    is_active: 1,
    stock: -4,
  },
];
let mockRole: 'owner' | 'manager' | 'cashier' = 'cashier';
let mockFeatures = { customers: true, snacks: true, expenses: true };
let mockParams: Record<string, string> = {};

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string, params: unknown[]) => {
    if (sql.includes('FROM products p')) {
      // useProducts with no org (module off) gets nothing.
      return { data: params[2] ? mockProducts : [], isLoading: false };
    }
    if (sql.includes('FROM stock_movements m')) {
      return {
        data: [
          {
            id: 'm1',
            reason: 'purchase',
            quantity: 24,
            note: 'crate',
            person: 'Mina',
            created_at: '2026-10-30T10:00:00.000Z',
          },
        ],
        isLoading: false,
      };
    }
    return { data: [], isLoading: false };
  },
}));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    branch: { id: 'A', name: 'Branch A' },
    branches: [{ id: 'A', name: 'Branch A', is_active: 1 }],
    role: mockRole,
    features: mockFeatures,
    can: (p: string) =>
      mockRole === 'owner' ||
      (mockRole === 'manager' && p !== 'products.edit') ||
      ['items.sell', 'customers.manage'].includes(p),
  }),
}));
jest.mock('@/features/workspace/BranchSwitcher', () => ({ BranchSwitcher: () => null }));
jest.mock('@/lib/powersync/database', () => ({ powersync: {} }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
const mockAddItem = jest.fn(async (..._a: unknown[]) => 'item-new');
const mockRemoveItem = jest.fn(async (..._a: unknown[]) => {});
const mockCount = jest.fn(async (..._a: unknown[]) => -1);
const mockRestock = jest.fn(async (..._a: unknown[]) => {});
const mockSaveProduct = jest.fn(async (..._a: unknown[]) => 'p-new');
jest.mock('./api', () => ({
  addItem: (...a: unknown[]) => mockAddItem(...a),
  removeItem: (...a: unknown[]) => mockRemoveItem(...a),
  countStock: (...a: unknown[]) => mockCount(...a),
  restock: (...a: unknown[]) => mockRestock(...a),
  saveProduct: (...a: unknown[]) => mockSaveProduct(...a),
  setProductActive: jest.fn(),
}));

const money = (piasters: number) => formatMoney(piasters, 'en');
const items = [
  { id: 'i1', session_id: 's1', product_id: 'cola', name: 'Cola', quantity: 2, unit_price: 1500 },
];

beforeEach(() => {
  mockRole = 'cashier';
  mockFeatures = { customers: true, snacks: true, expenses: true };
  mockParams = {};
  jest.clearAllMocks();
});

describe('ItemsCard', () => {
  it('lists what was sold and adds more of a product', async () => {
    await render(<ItemsCard sessionId="s1" items={items as never} canAdd canRemove />);
    expect(screen.getByText('Cola × 2')).toBeTruthy();
    expect(screen.getByTestId('items-total')).toHaveTextContent(money(3000));
    // Stock hints on the product buttons.
    expect(screen.getByTestId('product-cola')).toHaveTextContent(/low/);
    expect(screen.getByTestId('product-chips')).toHaveTextContent(/out/);

    await fireEvent.press(screen.getByTestId('product-cola'));
    await fireEvent.press(screen.getByTestId('item-quantity-increase'));
    await fireEvent.press(screen.getByTestId('item-quantity-increase'));
    expect(screen.getByTestId('add-item')).toHaveTextContent(`Add 3 × Cola (${money(4500)})`);
    await fireEvent.press(screen.getByTestId('add-item'));
    expect(mockAddItem).toHaveBeenCalledWith('s1', 'cola', 3);
  });

  it('removes an item only after confirming', async () => {
    await render(<ItemsCard sessionId="s1" items={items as never} canAdd canRemove />);
    await fireEvent.press(screen.getByTestId('remove-item-i1'));
    expect(mockRemoveItem).not.toHaveBeenCalled();
    expect(screen.getByText(/goes back into stock/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-remove-i1'));
    expect(mockRemoveItem).toHaveBeenCalledWith('i1');
  });

  it('shows the items read-only when nothing may be added or removed', async () => {
    await render(
      <ItemsCard sessionId="s1" items={items as never} canAdd={false} canRemove={false} />,
    );
    expect(screen.getByText('Cola × 2')).toBeTruthy();
    expect(screen.queryByTestId('remove-item-i1')).toBeNull();
    expect(screen.queryByTestId('product-cola')).toBeNull();
  });
});

describe('ProductsScreen', () => {
  it('shows stock in the branch and warns about products running low', async () => {
    await render(<ProductsScreen />);
    expect(screen.getByTestId('low-stock-notice')).toHaveTextContent(
      'Running low (2): Cola, Chips',
    );
    expect(screen.getByTestId('product-row-cola')).toHaveTextContent(/In stock: 3/);
    // Tea isn't counted, so it has no stock badge.
    expect(screen.getByTestId('product-row-tea')).not.toHaveTextContent(/In stock/);
    // Only owners add products.
    expect(screen.queryByTestId('add-product')).toBeNull();
  });

  it('says the module is off instead of showing products', async () => {
    mockFeatures = { ...mockFeatures, snacks: false };
    await render(<ProductsScreen />);
    expect(screen.getByText(/switched off/)).toBeTruthy();
    expect(screen.queryByTestId('product-row-cola')).toBeNull();
  });
});

describe('ProductScreen', () => {
  it('lets a manager count the stock and saves the difference', async () => {
    mockRole = 'manager';
    mockParams = { id: 'cola' };
    await render(<ProductScreen />);
    expect(screen.getByTestId('stock-level')).toHaveTextContent('3');
    // Managers can't change the price.
    expect(screen.queryByTestId('product-save')).toBeNull();

    await fireEvent.press(screen.getByText('Count'));
    await fireEvent.changeText(screen.getByTestId('stock-quantity'), '2');
    await fireEvent.press(screen.getByTestId('stock-save'));
    expect(mockCount).toHaveBeenCalledWith(
      { orgId: 'org', branchId: 'A', productId: 'cola' },
      2,
      null,
    );
    expect(screen.getByTestId('stock-saved')).toHaveTextContent('Stock corrected by -1.');
  });

  it('a restock must add at least one', async () => {
    mockRole = 'manager';
    mockParams = { id: 'cola' };
    await render(<ProductScreen />);
    await fireEvent.changeText(screen.getByTestId('stock-quantity'), '0');
    await fireEvent.press(screen.getByTestId('stock-save'));
    expect(mockRestock).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('stock-quantity'), '24');
    await fireEvent.press(screen.getByTestId('stock-save'));
    expect(mockRestock).toHaveBeenCalledWith(
      { orgId: 'org', branchId: 'A', productId: 'cola' },
      24,
      null,
    );
  });

  it('cashiers see the stock but cannot change it', async () => {
    mockParams = { id: 'cola' };
    await render(<ProductScreen />);
    expect(screen.getByTestId('stock-level')).toHaveTextContent('3');
    expect(screen.queryByTestId('stock-save')).toBeNull();
  });

  it('owners add a product with a validated price', async () => {
    mockRole = 'owner';
    mockParams = { id: 'new' };
    await render(<ProductScreen />);
    await fireEvent.changeText(screen.getByTestId('product-name'), 'Water');
    await fireEvent.changeText(screen.getByTestId('product-price'), '7.5');
    await fireEvent.changeText(screen.getByTestId('product-low-stock'), '10');
    await fireEvent.press(screen.getByTestId('product-save'));
    expect(mockSaveProduct).toHaveBeenCalledWith('org', null, {
      name: 'Water',
      category: null,
      price: 750,
      trackStock: true,
      lowStockAt: 10,
    });
  });
});

describe('ModuleLinks (floor)', () => {
  it('links to each module that is on, with the low-stock count', async () => {
    mockRole = 'manager';
    await render(<ModuleLinks />);
    expect(screen.getByTestId('open-customers')).toBeTruthy();
    expect(screen.getByTestId('open-products')).toHaveTextContent('Snacks & stock (2 low)');
    expect(screen.getByTestId('open-expenses')).toBeTruthy();
  });

  it('hides modules that are off, and expenses from cashiers', async () => {
    mockFeatures = { customers: false, snacks: true, expenses: true };
    await render(<ModuleLinks />);
    expect(screen.queryByTestId('open-customers')).toBeNull();
    expect(screen.getByTestId('open-products')).toBeTruthy();
    expect(screen.queryByTestId('open-expenses')).toBeNull();
  });

  it('shows nothing when every module is off', async () => {
    mockRole = 'owner';
    mockFeatures = { customers: false, snacks: false, expenses: false };
    await render(<ModuleLinks />);
    expect(screen.queryByTestId('module-links')).toBeNull();
  });
});
