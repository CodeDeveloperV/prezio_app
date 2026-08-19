import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../../../../app/theme/tamagui.config';
import { ProductCreatedSuccessScreen } from '../ProductCreatedSuccessScreen';
import { addShoppingListItem } from '../../../shopping-lists/api/shoppingListsApi';

const mockRetryMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockPullShoppingLists = jest.fn();
const mockPullShoppingListItems = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(() => ({ mutate: mockRetryMutate, isPending: false, isError: false })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));
jest.mock('../../../shopping-lists/api/shoppingListsApi', () => ({ addShoppingListItem: jest.fn() }));
jest.mock('../../../shopping-lists/services/offline/shoppingListPull', () => ({
  pullShoppingLists: (...args: unknown[]) => mockPullShoppingLists(...args),
  pullShoppingListItems: (...args: unknown[]) => mockPullShoppingListItems(...args),
}));
jest.mock('../../../../shared/services/db/database', () => ({
  database: { get: jest.fn() },
}));

const parentNavigation = { navigate: jest.fn() };
const navigation = {
  reset: jest.fn(),
  replace: jest.fn(),
  getParent: jest.fn(() => parentNavigation),
};

const completeRoute = {
  params: {
    storeBranchId: 7,
    scanFlow: 'purchase' as const,
    barcode: '7501234567897',
    shoppingListId: 11,
    shoppingListName: 'Compra semanal',
    addRequestId: 'created-product-test',
    shoppingListItemId: 22,
    price: 2.15,
    product: {
      id: 80,
      canonical_name: 'Galletas Oreo Original',
      brand_name: 'Mondelez',
      presentation: '300 g',
      image_url: null,
      status: 'pending' as const,
    },
  },
};

function renderScreen(route = completeRoute) {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <ProductCreatedSuccessScreen navigation={navigation as never} route={route as never} />
      </TamaguiProvider>,
    );
  });
  return renderer!;
}

function pressButton(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const button = renderer.root.find((node) => {
    const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
    return node.props.onPress && (node.props.accessibilityLabel === label || children.some((child) => child === label));
  });
  ReactTestRenderer.act(() => button.props.onPress());
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders the canonical product details and registered price after a complete creation', () => {
  const renderer = renderScreen();
  const content = JSON.stringify(renderer.toJSON());

  expect(content).toContain('¡Producto creado!');
  expect(content).toContain('Se agregó a tu lista de compra');
  expect(content).toContain('Galletas Oreo Original');
  expect(content).toContain('300 g · Mondelez');
  expect(content).toContain('2.15');
  expect(content).toContain('Agregado a tu compra');
});

test('returns to the same purchase scanner and suppresses the just-created barcode', () => {
  const renderer = renderScreen();

  pressButton(renderer, 'Escanear siguiente producto');

  expect(navigation.reset).toHaveBeenCalledWith({
    index: 0,
    routes: [{ name: 'Scan', params: { storeBranchId: 7, scanFlow: 'purchase', suppressedBarcode: '7501234567897' } }],
  });
});

test('does not present a false complete success when adding to the purchase failed', () => {
  const renderer = renderScreen({
    params: {
      storeBranchId: 7,
      scanFlow: 'purchase',
      barcode: '7501234567897',
      shoppingListId: 11,
      shoppingListName: 'Compra semanal',
      addRequestId: 'created-product-test',
      price: 2.15,
      product: completeRoute.params.product,
      addErrorMessage: 'Producto creado, pero no pudimos agregarlo a tu compra.',
    },
  } as never);
  const content = JSON.stringify(renderer.toJSON());

  expect(content).toContain('Intentar agregar nuevamente');
  expect(content).toContain('Producto creado, pero no pudimos agregarlo a tu compra.');
  expect(content).not.toContain('Agregado a tu compra');

  pressButton(renderer, 'Intentar agregar nuevamente');
  expect(mockRetryMutate).toHaveBeenCalledTimes(1);
  expect(addShoppingListItem).not.toHaveBeenCalled();
});
