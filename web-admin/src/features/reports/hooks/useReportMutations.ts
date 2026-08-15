import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  assignReport,
  dismissReport,
  markReportInReview,
  resolveReport,
  takeReport,
  updateReportPriority,
} from '../api/reportsApi';

import type { ReportAssignRequest, ReportDismissRequest, ReportPriorityUpdate, ReportResolveRequest } from '@prezio/shared-types';

const LIST_KEY_PREFIX = (storeId: number | null) => ['b2b', 'organizations', storeId, 'reports'];

export function useTakeReport(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: number) => takeReport(storeId as number, reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useMarkReportInReview(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: number) => markReportInReview(storeId as number, reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useAssignReport(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }: { reportId: number; payload: ReportAssignRequest }) =>
      assignReport(storeId as number, reportId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useUpdateReportPriority(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }: { reportId: number; payload: ReportPriorityUpdate }) =>
      updateReportPriority(storeId as number, reportId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useResolveReport(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }: { reportId: number; payload: ReportResolveRequest }) =>
      resolveReport(storeId as number, reportId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useDismissReport(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }: { reportId: number; payload: ReportDismissRequest }) =>
      dismissReport(storeId as number, reportId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}
