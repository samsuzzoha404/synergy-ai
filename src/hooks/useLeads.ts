/**
 * useLeads.ts — TanStack Query hooks for Lead & Conflict data
 * ============================================================
 * Provides React hooks that encapsulate all data-fetching logic.
 * Components stay clean — they call a hook and get data + loading/error states.
 *
 * Hybrid Data Strategy:
 *   useLeads() merges static mockLeads (always visible, great demo UX) with any
 *   real leads returned by the backend. If the backend is unavailable, it falls
 *   back to mock data gracefully so the UI never breaks.
 *
 * Hooks exported:
 *   useLeads()        — fetch all leads (GET /api/leads), merged with mockData
 *   useCreateLead()   — create a new lead (POST /api/leads)
 *   useConflicts()    — fetch conflict queue (GET /api/conflicts)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type AuditLog, type BulkIngestResponse, type Conflict, type ConflictResolvePayload, type Lead as APILead, type LeadActivity, type LeadActivityCreate, type LeadCreate, type LeadUpdate } from '@/lib/api';
import { leads as mockLeads, type Lead } from '@/data/mockData';

// ---------------------------------------------------------------------------
// Query Key Constants
// Centralised so invalidation and cache lookups are always consistent.
// ---------------------------------------------------------------------------
export const QUERY_KEYS = {
  leads: ['leads'] as const,
  conflicts: ['conflicts'] as const,
  activities: (leadId: string) => ['activities', leadId] as const,
  auditLogs: (leadId: string) => ['auditLogs', leadId] as const,
} as const;

// ---------------------------------------------------------------------------
// Adapter — converts a backend APILead into the frontend mock Lead shape.
// This lets every UI component work with a single, consistent Lead type.
// ---------------------------------------------------------------------------

/**
 * Maps the backend status string (from Cosmos DB) to a frontend LeadStatus.
 * Backend produces: "New" | "Under Review" | "Assigned" | "Closed"
 * Frontend expects: "New" | "In Review" | "Under Review" | "Assigned" | "Won" | "Lost" | ...
 */
function mapApiStatus(status: string): Lead['status'] {
  const statusMap: Record<string, Lead['status']> = {
    'New': 'New',
    'Under Review': 'Under Review',
    'Assigned': 'Assigned',
    'Closed': 'Won',          // "Closed" from backend = "Won" on the frontend
    'Duplicate Alert': 'Duplicate Alert',
    'Won': 'Won',
    'Lost': 'Lost',
    'In Review': 'In Review',
  };
  return statusMap[status] ?? 'New';
}

function adaptAPILead(apiLead: APILead): Lead {
  const analysis = apiLead.ai_analysis;
  return {
    id: apiLead.id,
    projectName: apiLead.project_name,
    location: apiLead.location,
    value: apiLead.value_rm,
    stage: (apiLead.stage as Lead['stage']) ?? 'Planning',
    type: (apiLead.project_type as Lead['type']) ?? 'Commercial',
    status: mapApiStatus(apiLead.status),
    isDuplicate: apiLead.is_duplicate,
    developer: 'New Lead (via API)',
    createdDate: new Date().toISOString().split('T')[0],
    matches: analysis
      ? [{ bu: analysis.top_match_bu, score: analysis.match_score, color: 'hsl(217, 91%, 50%)' }]
      : [],
    crossSell: analysis?.synergy_bundle.map((bu) => ({ product: bu, bu })) ?? [],
    aiRationale: analysis?.rationale ?? 'AI analysis pending.',
  };
}

// ===========================================================================
// HOOK 1: useLeads — Fetch all leads for Lead Workbench / Dashboard
// ===========================================================================

/**
 * Returns a merged array of mock leads (static, always shown) and any real
 * leads returned by the backend (GET /api/leads).
 *
 * Falls back to mockLeads only if the backend is unreachable, so the UI is
 * never blank — perfect for a hackathon demo.
 *
 * @example
 *   const { data: leads = mockLeads, isLoading } = useLeads();
 */
export function useLeads() {
  return useQuery<Lead[], Error>({
    queryKey: QUERY_KEYS.leads,

    queryFn: async (): Promise<Lead[]> => {
      try {
        const response = await apiClient.get<APILead[]>('/api/leads');
        const apiLeads: Lead[] = response.data.map(adaptAPILead);
        // Merge: mock leads first (stable order), real API leads appended.
        return [...mockLeads, ...apiLeads];
      } catch {
        // Backend unavailable — degrade gracefully to mock data.
        return [...mockLeads];
      }
    },

    // Always show stale mock data immediately; refresh against API every 60s.
    refetchInterval: 60_000,
    staleTime: 30_000,

    // Seed the cache with mock data so the UI renders instantly on first load.
    placeholderData: [...mockLeads],
  });
}

// ===========================================================================
// HOOK 2: useCreateLead — Submit a new lead for AI processing
// ===========================================================================

/**
 * Mutation hook to POST a new lead to the AI ingestion pipeline.
 *
 * On success:
 *   - Invalidates the 'leads' query so useLeads() re-fetches and the new
 *     API lead appears appended after the mock leads.
 *   - The `onSuccess` callback receives the raw APILead returned by the server.
 *
 * @example
 *   const { mutateAsync: createLead, isPending } = useCreateLead({
 *     onSuccess: (lead) => toast.success(`Routed to ${lead.ai_analysis?.top_match_bu}`),
 *     onError:   (err)  => toast.error(err.message),
 *   });
 */
export function useCreateLead(options?: {
  onSuccess?: (data: APILead) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation<APILead, Error, LeadCreate>({
    mutationFn: async (newLead: LeadCreate): Promise<APILead> => {
      // POST to the AI ingestion pipeline — may take 3–8 s (GPT-4o + Cosmos DB).
      const response = await apiClient.post<APILead>('/api/leads', newLead);
      return response.data;
    },

    onSuccess: (data: APILead) => {
      // Bust the leads cache so the new lead appears in the workbench instantly.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads });
      options?.onSuccess?.(data);
    },

    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

// ===========================================================================
// HOOK 3: useConflicts — Fetch duplicate conflict queue
// ===========================================================================

/**
 * Fetches all AI-flagged duplicate conflicts for the ConflictResolution page.
 *
 * @example
 *   const { data: conflicts = [], isLoading } = useConflicts();
 */
export function useConflicts() {
  return useQuery<Conflict[], Error>({
    queryKey: QUERY_KEYS.conflicts,

    queryFn: async (): Promise<Conflict[]> => {
      const response = await apiClient.get<Conflict[]>('/api/conflicts');
      return response.data;
    },

    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

// ===========================================================================
// HOOK 4: useUpdateLeadStage — PATCH a lead's pipeline stage (Kanban DnD)
// ===========================================================================

/**
 * Mutation hook to move a lead to a new pipeline stage via the Kanban board.
 * On success, invalidates the 'leads' query so all views stay in sync.
 *
 * @example
 *   const { mutate: moveStage } = useUpdateLeadStage();
 *   moveStage({ leadId: 'L001', stage: 'Tender' });
 */
export function useUpdateLeadStage() {
  const queryClient = useQueryClient();

  return useMutation<APILead, Error, { leadId: string; update: LeadUpdate }>({
    mutationFn: async ({ leadId, update }) => {
      const response = await apiClient.patch<APILead>(`/api/leads/${leadId}`, update);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads });
    },
  });
}

// ===========================================================================
// HOOK 5: useLeadActivities — Fetch the activity timeline for a single lead
// ===========================================================================

/**
 * Fetches all activities/notes logged against a specific lead.
 *
 * @example
 *   const { data: activities = [] } = useLeadActivities(lead.id);
 */
export function useLeadActivities(leadId: string | null) {
  return useQuery<LeadActivity[], Error>({
    queryKey: QUERY_KEYS.activities(leadId ?? ''),
    enabled: !!leadId,
    queryFn: async (): Promise<LeadActivity[]> => {
      const response = await apiClient.get<LeadActivity[]>(`/api/leads/${leadId}/activities`);
      return response.data;
    },
    staleTime: 15_000,
  });
}

// ===========================================================================
// HOOK 6: useCreateActivity — POST a new note/activity to a lead
// ===========================================================================

/**
 * Mutation hook to log a new activity against a lead.
 * Invalidates the activities query for that lead on success.
 *
 * @example
 *   const { mutateAsync: addNote } = useCreateActivity(lead.id);
 *   addNote({ user_name: 'Ahmad', activity_type: 'Note', content: 'Called client.' });
 */
export function useCreateActivity(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation<LeadActivity, Error, LeadActivityCreate>({
    mutationFn: async (payload) => {
      const response = await apiClient.post<LeadActivity>(
        `/api/leads/${leadId}/activities`,
        payload,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activities(leadId) });
    },
  });
}

// ===========================================================================
// HOOK 7: useAuditLogs — Fetch the immutable change history for a single lead
// ===========================================================================

/**
 * Fetches all audit log entries for a specific lead (GET /api/leads/{id}/audit-logs).
 * Used by the SmartDrawer "Audit History" tab to render a timeline of who
 * changed what and when.
 *
 * @example
 *   const { data: logs = [] } = useAuditLogs(lead.id);
 */
export function useAuditLogs(leadId: string | null) {
  return useQuery<AuditLog[], Error>({
    queryKey: QUERY_KEYS.auditLogs(leadId ?? ''),
    enabled: !!leadId,
    queryFn: async (): Promise<AuditLog[]> => {
      const response = await apiClient.get<AuditLog[]>(`/api/leads/${leadId}/audit-logs`);
      return response.data;
    },
    staleTime: 10_000,
  });
}

// ===========================================================================
// HOOK 8: useResolveConflict — PATCH /api/conflicts/{id}
// ===========================================================================

/**
 * Mutation hook to resolve a duplicate conflict (Merge, Discard, or Keep Both).
 * On success, removes the resolved conflict from the TanStack Query cache so
 * the sidebar badge drops and the queue advances without a full refetch.
 *
 * @example
 *   const { mutateAsync: resolve } = useResolveConflict();
 *   resolve({ conflictId: 'abc-123', status: 'Merged' });
 */
export function useResolveConflict() {
  const queryClient = useQueryClient();

  return useMutation<Conflict, Error, { conflictId: string; payload: ConflictResolvePayload }>({
    mutationFn: async ({ conflictId, payload }) => {
      const response = await apiClient.patch<Conflict>(
        `/api/conflicts/${conflictId}`,
        payload,
      );
      return response.data;
    },
    onSuccess: (_data, { conflictId }) => {
      // Optimistic cache pop: remove the just-resolved conflict immediately.
      queryClient.setQueryData<Conflict[]>(QUERY_KEYS.conflicts, (prev = []) =>
        prev.filter((c) => c.id !== conflictId),
      );
    },
  });
}

// ===========================================================================
// HOOK 9: useBulkUpload — POST /api/leads/bulk (CSV file upload)
// ===========================================================================

/**
 * Mutation hook to POST a CSV file to the bulk ingestion pipeline.
 * Sends as multipart/form-data. On success, invalidates the leads cache.
 *
 * @example
 *   const { mutateAsync: uploadCSV } = useBulkUpload();
 *   const result = await uploadCSV(file);
 *   console.log(`Imported: ${result.imported}, Flagged: ${result.flagged}`);
 */
export function useBulkUpload() {
  const queryClient = useQueryClient();

  return useMutation<BulkIngestResponse, Error, File>({
    mutationFn: async (file: File): Promise<BulkIngestResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post<BulkIngestResponse>(
        '/api/leads/bulk',
        formData,
        {
          // Let the browser set the multipart boundary automatically
          headers: { 'Content-Type': 'multipart/form-data' },
          // Generous timeout — large CSVs with many GPT-4o calls take time
          timeout: 300_000,
        },
      );
      return response.data;
    },
    onSuccess: () => {
      // Bust the leads cache so the workbench shows the newly imported leads
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conflicts });
    },
  });
}
