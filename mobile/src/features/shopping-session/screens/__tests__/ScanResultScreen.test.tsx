import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../../../../app/theme/tamagui.config';
import { ScanResultScreen } from '../ScanResultScreen';

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('../../../shopping-lists/hooks/useShoppingLists', () => ({
  useShoppingListsQuery: () => ({ data: [] }),
}));
jest.mock('../../../shopping-lists/utils/selectActiveShoppingList', () => ({
  selectActiveShoppingList: () => null,
}));
jest.mock('../../../pricing/hooks/usePricingMutations', () => ({
  useConfirmMatchMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateStoreProductPriceMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useUpdatePriceMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('../../../catalog/hooks/useCatalogMutations', () => ({
  useReportIncorrectBarcodeMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
};
const product = {
  id: 22,
  canonical_name: 'Leche Estrella 1L',
  brand_name: 'Estrella',
  presentation: '1 L',
  image_url: null,
  status: 'approved' as const,
};

function render(params: Record<string, unknown>) {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <ScanResultScreen
          navigation={navigation as never}
          route={{ params } as never}
        />
      </TamaguiProvider>,
    );
  });
  return renderer!;
}

test('uses only the active purchase branch price and treats another branch as missing', () => {
  const renderer = render({
    storeBranchId: 7,
    scanFlow: 'purchase',
    barcodeId: 99,
    product,
    storeProduct: {
      id: 50,
      store_branch_id: 8,
      product_id: product.id,
      current_price: 1.85,
      currency: 'PAB',
      version: 1,
      availability: 'in_stock',
      last_verified_at: null,
      last_verified_by: null,
    },
  });
  const content = JSON.stringify(renderer.toJSON());

  expect(content).toContain('Aún no tenemos precio para este producto');
  expect(content).toContain('Ayuda a mantener Prezio actualizado en esta sucursal.');
  expect(content).not.toContain('1.85');
});

test('captures a missing price as integer cents', () => {
  const renderer = render({
    storeBranchId: 7,
    scanFlow: 'purchase',
    barcodeId: 99,
    product,
  });
  const getPriceInput = () =>
    renderer.root.findByProps({
      accessibilityLabel: 'Precio actual en balboas',
    });

  expect(getPriceInput().props.value).toBe('0.00');

  ReactTestRenderer.act(() => {
    getPriceInput().props.onChangeText('0.002');
  });
  expect(getPriceInput().props.value).toBe('0.02');

  ReactTestRenderer.act(() => {
    getPriceInput().props.onChangeText('0.025');
  });
  expect(getPriceInput().props.value).toBe('0.25');
});

test('shows the price-verification decision for a price at the active branch', () => {
  const renderer = render({
    storeBranchId: 7,
    scanFlow: 'purchase',
    barcodeId: 99,
    product,
    storeProduct: {
      id: 50,
      store_branch_id: 7,
      product_id: product.id,
      current_price: 1.85,
      currency: 'PAB',
      version: 1,
      availability: 'in_stock',
      last_verified_at: null,
      last_verified_by: null,
    },
  });
  const content = JSON.stringify(renderer.toJSON());

  expect(content).toContain('¿El precio coincide con el que ves?');
  expect(content).toContain('Sí, coincide');
  expect(content).toContain('Cambió el precio');
  expect(content).toContain('Producto incorrecto');
});
