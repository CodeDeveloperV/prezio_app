import { httpClient } from '../../../shared/services/api/httpClient';

import type {
  AttachBarcodeRequest,
  Category,
  CreateProductRequest,
  Product,
  ProductBarcode,
  ScanBarcodeRequest,
  ScanResult,
} from '@prezio/shared-types';

export function listCategories(): Promise<Category[]> {
  return httpClient.get('catalog/categories').json<Category[]>();
}

export function scanBarcode(request: ScanBarcodeRequest): Promise<ScanResult> {
  return httpClient.post('catalog/scan', { json: request }).json<ScanResult>();
}

export function attachBarcodeToProduct(
  productId: number,
  request: AttachBarcodeRequest,
): Promise<ProductBarcode> {
  return httpClient
    .post(`catalog/products/${productId}/barcodes`, { json: request })
    .json<ProductBarcode>();
}

export function createProductFromScan(request: CreateProductRequest): Promise<Product> {
  return httpClient.post('catalog/products', { json: request }).json<Product>();
}

// "Producto incorrecto" -- any authenticated user, no request body. Marks the barcode
// REJECTED so the next scan of the same code falls through to disambiguation again.
export function reportIncorrectBarcode(barcodeId: number): Promise<ProductBarcode> {
  return httpClient.post(`catalog/barcodes/${barcodeId}/report`).json<ProductBarcode>();
}
