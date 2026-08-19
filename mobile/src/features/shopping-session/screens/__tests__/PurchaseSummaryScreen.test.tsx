import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../../../../app/theme/tamagui.config';
import { PurchaseSummaryScreen } from '../PurchaseSummaryScreen';

const mockInvalidateQueries = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
let mockQueryState: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => effect(),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => mockQueryState),
  useMutation: jest.fn(() => ({ mutate: mockMutate, isPending: false })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));
jest.mock('../../../shopping-lists/api/shoppingListsApi', () => ({
  getShoppingListSummary: jest.fn(),
  updateShoppingListItem: jest.fn(),
}));
jest.mock('../../purchaseSummaryToast', () => ({ showPurchaseSummaryError: jest.fn() }));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const completeSummary = {
  shopping_list_id: 11,
  active_store_branch_id: 7,
  store_name: 'Super 99',
  branch_name: 'Vía España',
  distinct_products_count: 1,
  total_units_count: 2,
  priced_subtotal: '7.90',
  currency: 'USD',
  unpriced_items_count: 0,
  pricing_status: 'complete' as const,
  items: [{
    shopping_list_item_id: 21,
    product_id: 8,
    quantity: 2,
    version: 3,
    name: 'Nutella',
    brand: null,
    presentation: '350 g',
    image_url: null,
    store_product_id: 40,
    current_price: '3.95',
    currency: 'USD',
    availability: 'in_stock' as const,
    pricing_status: 'available' as const,
    unit_price: '3.95',
    subtotal: '7.90',
  }],
};

function renderScreen() {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <PurchaseSummaryScreen navigation={navigation as never} route={{ params: { shoppingListId: 11 } } as never} />
      </TamaguiProvider>,
    );
  });
  return renderer!;
}

function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const button = renderer.root.find((node) => node.props.onPress && node.props.children === label);
  ReactTestRenderer.act(() => button.props.onPress());
}

function renderedText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children)
    .join(' ');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryState = { data: completeSummary, isPending: false, isError: false, refetch: mockRefetch };
});

test('renders an authoritative complete purchase summary with branch-scoped total', () => {
  const renderer = renderScreen();
  const content = renderedText(renderer);

  expect(content).toContain('Mi compra');
  expect(content).toContain('Super 99 · Vía España');
  expect(content).toContain('Total estimado');
  expect(content).toContain('$7.90');
  expect(content).toContain('Nutella');
  expect(content).toContain('$7.90');
});

test('renders the empty state and opens the immersive scanner on demand', () => {
  mockQueryState = { ...mockQueryState, data: { ...completeSummary, total_units_count: 0, distinct_products_count: 0, priced_subtotal: null, items: [] } };
  const renderer = renderScreen();
  const content = renderedText(renderer);

  expect(content).toContain('Tu compra está vacía');
  expect(content).toContain('Escanea tu primer producto para comenzar.');
  press(renderer, 'Escanear producto');
  expect(navigation.navigate).toHaveBeenCalledWith('Scan', { storeBranchId: 7, scanFlow: 'purchase' });
});

test('labels partial totals honestly and keeps products without a price visible', () => {
  mockQueryState = {
    ...mockQueryState,
    data: {
      ...completeSummary,
      pricing_status: 'partial',
      unpriced_items_count: 1,
      items: [{ ...completeSummary.items[0], pricing_status: 'missing_product', unit_price: null, subtotal: null }],
    },
  };
  const renderer = renderScreen();
  const content = renderedText(renderer);

  expect(content).toContain('Subtotal conocido');
  expect(content).toContain('Precio no disponible');
  expect(content).not.toContain('$0.00');
});

test('changes quantities with the server item version and refetches on focus', () => {
  const renderer = renderScreen();
  const increment = renderer.root.findByProps({ accessibilityLabel: 'Aumentar Nutella' });

  ReactTestRenderer.act(() => increment.props.onPress());

  expect(mockMutate).toHaveBeenCalledWith({ item: completeSummary.items[0], quantity: 3 });
  expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['shoppingLists', 11, 'summary'] });
});

test('renders a recoverable error state', () => {
  mockQueryState = { data: undefined, isPending: false, isError: true, refetch: mockRefetch };
  const renderer = renderScreen();
  expect(renderedText(renderer)).toContain('No pudimos cargar tu compra');
  press(renderer, 'Reintentar');
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
