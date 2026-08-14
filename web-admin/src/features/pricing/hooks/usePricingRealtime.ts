import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { pricingWsClient } from '@/shared/services/ws/pricingWsClient';

/**
 * Subscribes to live price/availability updates for every currently visible
 * store_product_id so the pricing list reflects edits made by other admins
 * or the mobile community without a manual refresh.
 *
 * Invalidates (rather than patches) the matching query cache entries on each
 * event -- the WS payload only carries price/version/availability/source,
 * not the full row shape (branch_name, last_updated_by, etc.), so a refetch
 * is the only way to keep every displayed field accurate.
 */
export function usePricingRealtime(storeId: number | null, storeProductIds: number[]) {
  const queryClient = useQueryClient();
  const idsKey = storeProductIds
    .slice()
    .sort((a, b) => a - b)
    .join(',');

  useEffect(() => {
    if (storeId === null || !idsKey) return;

    const ids = idsKey.split(',').map(Number);
    const unsubscribes = ids.map((storeProductId) =>
      pricingWsClient.subscribe(storeProductId, () => {
        queryClient.invalidateQueries({
          queryKey: ['b2b', 'organizations', storeId, 'pricing', 'store-products'],
        });
      }),
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [storeId, idsKey, queryClient]);
}
