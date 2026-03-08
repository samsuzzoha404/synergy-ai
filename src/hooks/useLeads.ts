/**
 * useLeads.ts — TanStack Query hooks for Lead & Conflict data
 * ============================================================
 * Provides React hooks that encapsulate all data-fetching logic.
 * Components stay clean — they call a hook and get data + loading/error states.
 *
 * 100% Real Database Strategy:
 *   All data is fetched exclusively from the FastAPI/Cosmos DB backend.
 *   Mock data has been migrated to Cosmos DB via seed_master.py.
 *   RBAC filtering is handled server-side based on the JWT token.
 *
 * Hooks exported:
 *   useLeads()        — fetch all leads (GET /api/leads)
 *   useCreateLead()   — create a new lead (POST /api/leads)
 *   useConflicts()    — fetch conflict queue (GET /api/conflicts)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type AuditLog, type BUContact, type BulkIngestResponse, type Conflict, type ConflictResolvePayload, type Lead as APILead, type LeadActivity, type LeadActivityCreate, type LeadCreate, type LeadUpdate, type UserCreate, type UserProfile, type UserUpdate } from '@/lib/api';
import { type Lead } from '@/data/mockData';
import { toast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of leads fetched per page. Matches the backend default limit. */
export const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Query Key Constants
// Centralised so invalidation and cache lookups are always consistent.
// ---------------------------------------------------------------------------
export const QUERY_KEYS = {
  leads: (page: number) => ['leads', page] as const,
  allLeads: ['leads'] as const,       // for invalidation (prefix match)
  conflicts: ['conflicts'] as const,
  activities: (leadId: string) => ['activities', leadId] as const,
  auditLogs: (leadId: string) => ['auditLogs', leadId] as const,
  buContacts: ['buContacts'] as const,
  adminUsers: ['adminUsers'] as const,
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
    'Merged': 'Merged',       // conflict resolved — leads merged into one record
    'Discarded': 'Discarded', // conflict resolved — duplicate lead discarded
  };
  return statusMap[status] ?? 'New';
}

/** Map BU names to distinct chart colours for the SmartDrawer match badges.
 * Keys must match the exact strings returned by the AI engine (as seen in
 * ai_analysis.top_match_bu). Verified against live DB output 2026-03-08.
 * GPT-4o returns all-uppercase BU names as defined in the system prompt.
 */
const BU_COLORS: Record<string, string> = {
  'STUCKEN AAC':            'hsl(217, 91%, 50%)',  // blue
  'AJIYA METAL / GLASS':    'hsl(32,  95%, 50%)',  // amber
  'SIGNATURE ALLIANCE':     'hsl(280, 70%, 55%)',  // violet
  'SIGNATURE KITCHEN':      'hsl(320, 75%, 55%)',  // pink
  'G-CAST':                 'hsl(142, 71%, 45%)',  // green
  'PPG HING':               'hsl(0,   72%, 51%)',  // red
  'FIAMMA HOLDING':         'hsl(24,  95%, 50%)',  // orange
};
const DEFAULT_BU_COLOR = 'hsl(217, 91%, 50%)';

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
    developer: apiLead.developer ?? 'Unknown Developer',
    createdDate: apiLead.created_date ?? new Date().toISOString().split('T')[0],
    matches: analysis
      ? [{
          bu: analysis.top_match_bu,
          score: analysis.match_score,
          color: BU_COLORS[analysis.top_match_bu] ?? DEFAULT_BU_COLOR,
        }]
      : [],
    crossSell: analysis?.synergy_bundle.map((bu) => ({ product: bu, bu })) ?? [],
    aiRationale: analysis?.rationale ?? 'AI analysis pending.',
  };
}

// ===========================================================================
// HOOK 1: useLeads — Fetch all leads for Lead Workbench / Dashboard
// ===========================================================================

/**
 * Returns a page of leads from the backend (GET /api/leads?skip=N&limit=100).
 * RBAC filtering (Admin vs Sales_Rep BU) is applied server-side via the JWT.
 *
 * @param page  0-based page number (default 0)
 *
 * @example
 *   const { data: leads = [], isLoading, total } = useLeads();
 *   const { data: leads } = useLeads(2); // page 3
 */
export function useLeads(page = 0) {
  return useQuery({
    queryKey: QUERY_KEYS.leads(page),

    queryFn: async (): Promise<{ leads: Lead[]; total: number }> => {
      const skip = page * PAGE_SIZE;
      const response = await apiClient.get<APILead[]>('/api/leads', {
        params: { skip, limit: PAGE_SIZE },
      });
      const total = parseInt(response.headers['x-total-count'] ?? '0', 10);
      return { leads: response.data.map(adaptAPILead), total };
    },

    refetchInterval: 60_000,
    staleTime: 30_000,
    select: (data) => data,   // keep full object so callers access .leads and .total
  });
}

/**
 * Fetches ALL leads in a single request (limit=1000) for reporting purposes.
 * Not paginated — returns a flat array.
 *
 * LW-B5 fix: queryKey uses ['leads', 'all'] (under the 'leads' namespace) so
 * it is correctly invalidated by the prefix-match in all mutation onSuccess
 * callbacks (useCreateLead, useUpdateLeadStage, useResolveConflict, etc.).
 * The original key 'allLeadsFlat' was outside the namespace and never busted.
 */
export function useAllLeads() {
  return useQuery<Lead[]>({
    queryKey: ['leads', 'all'],
    queryFn: async () => {
      const response = await apiClient.get<APILead[]>('/api/leads', {
        params: { skip: 0, limit: 1000 },
      });
      return response.data.map(adaptAPILead);
    },
    staleTime: 60_000,
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allLeads });
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

  return useMutation<APILead | null, Error, { leadId: string; update: LeadUpdate }>({
    mutationFn: async ({ leadId, update }) => {
      const response = await apiClient.patch<APILead>(`/api/leads/${leadId}`, update);
      return response.data;
    },
    onSuccess: (_data, { leadId }) => {
      // Invalidate so all views (workbench + dashboard) refresh from the server.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allLeads });
      // Invalidate this lead's audit log so the SmartDrawer history tab updates instantly.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auditLogs(leadId) });
    },

    // Bug #5 fix: roll back the optimistic UI on PATCH failure and notify the user.
    onError: (_error, { leadId: _leadId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allLeads });
      toast({
        title: 'Failed to update stage',
        description: 'Could not move the lead. The board has been reverted to its last saved state.',
        variant: 'destructive',
      });
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
    onSuccess: () => {
      // Invalidate all conflict cache entries (prefix match handles role/bu variants).
      // This is more correct than setQueryData since the keyed cache includes role+bu.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conflicts });
      // Bug B6 fix: also invalidate the leads cache so isDuplicate / status flags
      // reflect the resolution action (e.g. Discarded lead no longer shows as a dup).
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allLeads });
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
          // Do NOT set Content-Type manually for multipart/form-data.
          // Axios/XHR must auto-generate it with the correct multipart boundary.
          // An explicit header without a boundary causes server-side parse failures.
          headers: { 'Content-Type': undefined },
          // Generous timeout — large CSVs with many GPT-4o calls take time
          timeout: 300_000,
        },
      );
      return response.data;
    },
    onSuccess: () => {
      // Bust the leads cache so the workbench shows the newly imported leads
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allLeads });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conflicts });
    },
  });
}

// ---------------------------------------------------------------------------
// useBUContacts — GET /api/bu-contacts
// ---------------------------------------------------------------------------

/**
 * Returns the BU sales manager directory fetched from the backend config file.
 * Cached for 10 minutes — contacts rarely change.
 */
export function useBUContacts() {
  return useQuery<BUContact[]>({
    queryKey: QUERY_KEYS.buContacts,
    queryFn: async () => {
      const res = await apiClient.get<BUContact[]>('/api/bu-contacts');
      return res.data;
    },
    staleTime: 10 * 60 * 1000,   // 10 minutes
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Admin User Management Hooks — GET/POST/PATCH/DELETE /api/admin/users
// ---------------------------------------------------------------------------

/** Fetch all user accounts. Only succeeds for Admin-role tokens. */
export function useAdminUsers() {
  return useQuery<UserProfile[]>({
    queryKey: QUERY_KEYS.adminUsers,
    queryFn: async () => {
      const res = await apiClient.get<UserProfile[]>('/api/admin/users');
      return res.data;
    },
  });
}

/** Create a new user account. */
export function useAdminCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<UserProfile, Error, UserCreate>({
    mutationFn: async (payload) => {
      const res = await apiClient.post<UserProfile>('/api/admin/users', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminUsers });
    },
  });
}

/** Update an existing user (partial). */
export function useAdminUpdateUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation<UserProfile, Error, UserUpdate>({
    mutationFn: async (payload) => {
      const res = await apiClient.patch<UserProfile>(`/api/admin/users/${userId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminUsers });
    },
  });
}

/** Hard-delete a user account. */
export function useAdminDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (userId) => {
      await apiClient.delete(`/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminUsers });
    },
  });
}
