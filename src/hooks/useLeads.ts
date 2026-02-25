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
import { apiClient, type Conflict, type Lead as APILead, type LeadCreate } from '@/lib/api';
import { leads as mockLeads, type Lead } from '@/data/mockData';

// ---------------------------------------------------------------------------
// Query Key Constants
// Centralised so invalidation and cache lookups are always consistent.
// ---------------------------------------------------------------------------
export const QUERY_KEYS = {
  leads: ['leads'] as const,
  conflicts: ['conflicts'] as const,
} as const;

// ---------------------------------------------------------------------------
// Adapter — converts a backend APILead into the frontend mock Lead shape.
// This lets every UI component work with a single, consistent Lead type.
// ---------------------------------------------------------------------------
function adaptAPILead(apiLead: APILead): Lead {
  const analysis = apiLead.ai_analysis;
  return {
    id: apiLead.id,
    projectName: apiLead.project_name,
    location: apiLead.location,
    value: apiLead.value_rm,
    stage: (apiLead.stage as Lead['stage']) ?? 'Planning',
    type: (apiLead.project_type as Lead['type']) ?? 'Commercial',
    status: (apiLead.status as Lead['status']) ?? 'New',
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
