/**
 * api.ts — Axios HTTP Client Configuration
 * ==========================================
 * Central Axios instance for all backend communication.
 * Every API call in the app goes through this instance so that:
 *   • The base URL is configured in ONE place.
 *   • Auth headers (future: Azure AD tokens) are injected globally.
 *   • Response errors are intercepted and formatted consistently.
 *
 * Usage:
 *   import { apiClient } from '@/lib/api';
 *   const res = await apiClient.get('/api/leads');
 */

import axios, { AxiosError, AxiosResponse } from 'axios';

// ---------------------------------------------------------------------------
// Types — mirror the Pydantic models from the FastAPI backend
// ---------------------------------------------------------------------------

/** The minimal payload sent when creating a new lead (mirrors LeadCreate). */
export interface LeadCreate {
  project_name: string;
  location: string;
  value_rm: number;
  project_type: string;
  stage: string;
}

/** AI analysis result returned by GPT-4o (mirrors AIAnalysis). */
export interface AIAnalysis {
  top_match_bu: string;
  match_score: number;   // 0–100
  rationale: string;
  synergy_bundle: string[];
}

/**
 * Full enriched lead returned by the API (mirrors LeadResponse).
 * Note: The raw embedding vector is excluded from API responses.
 */
export interface Lead {
  id: string;
  project_name: string;
  location: string;
  value_rm: number;
  project_type: string;
  stage: string;
  status: string;
  is_duplicate: boolean;
  ai_analysis: AIAnalysis | null;
}

/** Conflict document returned by GET /api/conflicts. */
export interface Conflict {
  id: string;
  lead_id: string;
  matched_lead_id: string;
  similarity_score: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Axios Instance — configure base URL and default headers here
// ---------------------------------------------------------------------------

/**
 * Singleton Axios instance.
 * Change VITE_API_BASE_URL in your .env.local to point at a staging/prod server.
 * Default: http://localhost:8000 (local FastAPI dev server).
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  // Timeout after 30s — AI analysis can take a few seconds; be generous.
  timeout: 30_000,
});

// ---------------------------------------------------------------------------
// Request Interceptor — inject auth tokens here when Azure AD is added
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(
  (config) => {
    /**
     * FUTURE: Inject Azure AD Bearer token for production auth.
     *   const token = await getAzureADToken();
     *   config.headers.Authorization = `Bearer ${token}`;
     */
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response Interceptor — normalise errors across the entire app
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ detail: string }>) => {
    // Extract the FastAPI detail message if available
    const serverMessage = error.response?.data?.detail;
    const statusCode = error.response?.status;

    console.error(
      `[Synergy API Error] ${statusCode ?? 'Network'}: ${serverMessage ?? error.message}`,
    );

    // Re-throw with an enriched message so React Query's error state is descriptive
    const enrichedError = new Error(
      serverMessage ?? `Request failed with status ${statusCode}`,
    );
    return Promise.reject(enrichedError);
  },
);
