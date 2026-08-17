import { httpClient } from '../../../shared/services/api/httpClient';

import type {
  AttachBarcodeRequest,
  Category,
  CatalogSearchResult,
  CreateProductRequest,
  ImageUploadContentType,
  ImageUploadUrlResponse,
  Product,
  ProductBarcode,
  ScanBarcodeRequest,
  ScanResult,
} from '@prezio/shared-types';

export function listCategories(): Promise<Category[]> {
  return httpClient.get('catalog/categories').json<Category[]>();
}

export function searchCatalogProducts(query: string, storeBranchId?: number): Promise<CatalogSearchResult[]> {
  return httpClient
    .get('catalog/products/search', {
      searchParams: {
        q: query,
        ...(storeBranchId !== undefined ? { store_branch_id: storeBranchId } : {}),
      },
    })
    .json<CatalogSearchResult[]>();
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

// Presigned S3 PUT URL for a new product image. The mobile app never holds AWS credentials --
// it uploads directly to `upload_url` (see uploadProductImage) and only sends `image_url` back
// to the backend when creating the product.
function getImageUploadUrl(contentType: ImageUploadContentType): Promise<ImageUploadUrlResponse> {
  return httpClient
    .post('catalog/products/image-upload-url', { json: { content_type: contentType } })
    .json<ImageUploadUrlResponse>();
}

// Picks up a local file (from the image picker) and uploads it straight to S3 via a presigned
// URL, bypassing httpClient entirely -- this is a plain PUT of raw bytes to AWS, not our API.
export async function uploadProductImage(localUri: string, contentType: ImageUploadContentType): Promise<string> {
  const { upload_url, image_url } = await getImageUploadUrl(contentType);

  const fileResponse = await fetch(localUri);
  const fileBlob = await fileResponse.blob();

  const uploadResponse = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBlob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed with status ${uploadResponse.status}`);
  }

  return image_url;
}

// "Producto incorrecto" -- any authenticated user, no request body. Marks the barcode
// REJECTED so the next scan of the same code falls through to disambiguation again.
export function reportIncorrectBarcode(barcodeId: number): Promise<ProductBarcode> {
  return httpClient.post(`catalog/barcodes/${barcodeId}/report`).json<ProductBarcode>();
}
