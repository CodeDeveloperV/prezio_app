import { useMutation } from '@tanstack/react-query';

import {
  attachBarcodeToProduct,
  createProductFromScan,
  reportIncorrectBarcode,
  scanBarcode,
  uploadProductImage,
} from '../api/catalogApi';

import type {
  AttachBarcodeRequest,
  CreateProductRequest,
  ImageUploadContentType,
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

export function useUploadProductImageMutation() {
  return useMutation<string, Error, { localUri: string; contentType: ImageUploadContentType }>({
    mutationFn: ({ localUri, contentType }) => uploadProductImage(localUri, contentType),
  });
}

export function useReportIncorrectBarcodeMutation() {
  return useMutation<ProductBarcode, Error, number>({
    mutationFn: reportIncorrectBarcode,
  });
}
