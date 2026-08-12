import { useMutation } from '@tanstack/react-query';

import {
  attachBarcodeToProduct,
  createProductFromScan,
  reportIncorrectBarcode,
  scanBarcode,
} from '../api/catalogApi';

import type {
  AttachBarcodeRequest,
  CreateProductRequest,
  Product,
  ProductBarcode,
  ScanBarcodeRequest,
  ScanResult,
} from '@prezio/shared-types';

export function useScanBarcodeMutation() {
  return useMutation<ScanResult, Error, ScanBarcodeRequest>({
    mutationFn: scanBarcode,
  });
}

export function useAttachBarcodeMutation() {
  return useMutation<ProductBarcode, Error, { productId: number; request: AttachBarcodeRequest }>({
    mutationFn: ({ productId, request }) => attachBarcodeToProduct(productId, request),
  });
}

export function useCreateProductMutation() {
  return useMutation<Product, Error, CreateProductRequest>({
    mutationFn: createProductFromScan,
  });
}

export function useReportIncorrectBarcodeMutation() {
  return useMutation<ProductBarcode, Error, number>({
    mutationFn: reportIncorrectBarcode,
  });
}
