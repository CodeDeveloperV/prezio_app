import { useQuery } from '@tanstack/react-query';

import { listTaxRates } from '../api/taxRatesApi';

export function useTaxRatesQuery(country: string) {
  return useQuery({
    queryKey: ['tax-rates', country],
    queryFn: () => listTaxRates(country),
    staleTime: 1000 * 60 * 60,
  });
}
