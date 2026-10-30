import { percentDiscount } from './billing';
import {
  adjustmentFor,
  customerDiscount,
  customerDiscountReason,
  groupItems,
  itemsTotal,
  normalizePhone,
  parseCustomerDiscount,
  samePhone,
  searchCustomers,
  stockState,
} from './items';

describe('items on a bill', () => {
  const items = [
    { product_id: 'cola', name: 'Cola', quantity: 2, unit_price: 1500 },
    { product_id: 'chips', name: 'Chips', quantity: 1, unit_price: 1000 },
    { product_id: 'cola', name: 'Cola', quantity: 1, unit_price: 1500 },
    // The price changed between two sales: a separate line.
    { product_id: 'cola', name: 'Cola', quantity: 1, unit_price: 2000 },
  ];

  it('adds up quantity × unit price', () => {
    expect(itemsTotal(items)).toBe(2 * 1500 + 1000 + 1500 + 2000);
    expect(itemsTotal([])).toBe(0);
    expect(itemsTotal([{ quantity: null, unit_price: 500 }])).toBe(0);
  });

  it('groups the same product and price into one line, in the order first sold', () => {
    expect(groupItems(items)).toEqual([
      { productId: 'cola', name: 'Cola', quantity: 3, unitPrice: 1500, amount: 4500 },
      { productId: 'chips', name: 'Chips', quantity: 1, unitPrice: 1000, amount: 1000 },
      { productId: 'cola', name: 'Cola', quantity: 1, unitPrice: 2000, amount: 2000 },
    ]);
  });
});

describe('stock', () => {
  const tracked = { track_stock: 1, low_stock_at: 5 };

  it('is out at 0 or below, low at or below the warning level, ok above it', () => {
    expect(stockState(tracked, -2)).toBe('out');
    expect(stockState(tracked, 0)).toBe('out');
    expect(stockState(tracked, 5)).toBe('low');
    expect(stockState(tracked, 6)).toBe('ok');
    expect(stockState({ track_stock: 1, low_stock_at: null }, 1)).toBe('ok');
  });

  it('is not tracked for products without stock counting', () => {
    expect(stockState({ track_stock: 0, low_stock_at: 5 }, 0)).toBe('untracked');
  });

  it('a count saves the difference', () => {
    expect(adjustmentFor(20, 18)).toBe(-2);
    expect(adjustmentFor(-3, 0)).toBe(3);
    expect(adjustmentFor(7, 7)).toBe(0);
  });
});

describe('customer discount', () => {
  it('is the percent of the subtotal, rounded like a manual percent discount', () => {
    expect(customerDiscount(12_000, 10)).toBe(1200);
    expect(customerDiscount(9_995, 15)).toBe(percentDiscount(9_995, 15));
    expect(customerDiscount(9_995, 15)).toBe(1499);
    expect(customerDiscount(5000, 0)).toBe(0);
    expect(customerDiscount(5000, null)).toBe(0);
  });

  it('is marked on the bill so it can be told apart from a manual discount', () => {
    expect(customerDiscountReason(10)).toBe('customer:10');
    expect(parseCustomerDiscount('customer:10')).toBe(10);
    expect(parseCustomerDiscount('Birthday')).toBeNull();
    expect(parseCustomerDiscount('customer:ten')).toBeNull();
    expect(parseCustomerDiscount(null)).toBeNull();
  });
});

describe('customer search', () => {
  const customers = [
    { id: '1', name: 'Omar Hassan', phone: '01001234567', is_active: 1 },
    { id: '2', name: 'Sara', phone: '+20 112 555 0000', is_active: 1 },
    { id: '3', name: 'Omar Ali', phone: '01229998888', is_active: 1 },
    { id: '4', name: 'Old Omar', phone: '01001234567', is_active: 0 },
  ];

  it('normalizes phone numbers: spaces, Arabic digits and the +20 country code', () => {
    expect(normalizePhone('+20 112 555 0000')).toBe('01125550000');
    expect(normalizePhone('0020 112 555 0000')).toBe('01125550000');
    expect(normalizePhone('٠١٠٠١٢٣٤٥٦٧')).toBe('01001234567');
    expect(normalizePhone('۰۱۰۰')).toBe('0100');
    expect(normalizePhone(null)).toBe('');
  });

  it('finds by phone (any part, Arabic digits too), exact match first', () => {
    expect(searchCustomers(customers, '0100123').map((c) => c.id)).toEqual(['1']);
    expect(searchCustomers(customers, '٠١١٢٥٥٥').map((c) => c.id)).toEqual(['2']);
    expect(searchCustomers(customers, '8888').map((c) => c.id)).toEqual(['3']);
  });

  it('finds by name, names starting with the search first, and skips hidden customers', () => {
    expect(searchCustomers(customers, 'omar').map((c) => c.id)).toEqual(['3', '1']);
    expect(searchCustomers(customers, 'hassan').map((c) => c.id)).toEqual(['1']);
    expect(searchCustomers(customers, '  ')).toEqual([]);
  });

  it('spots another customer with the same phone', () => {
    expect(samePhone(customers, '0112 555 0000')?.id).toBe('2');
    expect(samePhone(customers, '01125550000', '2')).toBeNull();
    // The hidden "Old Omar" doesn't count; Omar Hassan does.
    expect(samePhone(customers, '01001234567')?.id).toBe('1');
    expect(samePhone(customers, '')).toBeNull();
  });
});
