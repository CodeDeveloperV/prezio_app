import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import NetInfo from '@react-native-community/netinfo';

import { database } from '../../../shared/services/db/database';
import PendingAction from '../../../shared/services/db/models/PendingAction';

const pendingActions = () => database.get<PendingAction>('pending_actions');

export type SyncStatus = 'offline' | 'syncing' | 'error' | 'pending' | 'synced';

export interface SyncStatusInfo {
  status: SyncStatus;
  pendingCount: number;
  errorCount: number;
}

/**
 * Consolidated sync status (Epic 14 Task 9): one discrete state instead of a toast per
 * PendingAction. Backed by WatermelonDB's `.observe()` so it stays live as the SyncEngine works
 * through the queue, without polling. `offline` takes priority over everything else since it
 * explains why nothing is syncing right now; `error` (failed/conflict) takes priority over a
 * plain `pending` count since it's the state that needs the user's attention/retry.
 */
export function useSyncStatus(): SyncStatusInfo {
  const [isConnected, setIsConnected] = useState(true);
  const [actions, setActions] = useState<PendingAction[]>([]);

  useEffect(() => {
    const subscription = pendingActions()
      .query(Q.where('status', Q.notEq('synced')))
      .observe()
      .subscribe(setActions);
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const toConnected = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
      Boolean(state.isConnected && state.isInternetReachable !== false);

    NetInfo.fetch().then((state) => setIsConnected(toConnected(state)));
    return NetInfo.addEventListener((state) => setIsConnected(toConnected(state)));
  }, []);

  const syncingCount = actions.filter((action) => action.status === 'syncing').length;
  const errorCount = actions.filter((action) => action.status === 'failed' || action.status === 'conflict').length;
  const pendingCount = actions.filter((action) => action.status === 'pending').length;

  let status: SyncStatus = 'synced';
  if (!isConnected) {
    status = 'offline';
  } else if (syncingCount > 0) {
    status = 'syncing';
  } else if (errorCount > 0) {
    status = 'error';
  } else if (pendingCount > 0) {
    status = 'pending';
  }

  return { status, pendingCount, errorCount };
}
