import { httpClient } from '../../../shared/services/api/httpClient';

import type { TaxRate } from '@prezio/shared-types';

export function listTaxRates(country: string): Promise<TaxRate[]> {
  return httpClient.get('pricing/tax-rates', { searchParams: { country } }).json<TaxRate[]>();
}
