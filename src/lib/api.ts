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
  resolved_by_email?: string;
  resolved_by_name?: string;
  resolved_at?: string;
}

/** Payload sent to PATCH /api/conflicts/{id} to record a resolution decision. */
export interface ConflictResolvePayload {
  /** 'Merged' | 'Discarded' | 'Kept Both' */
  status: string;
}

/** Summary returned by POST /api/leads/bulk after CSV processing. */
export interface BulkIngestResponse {
  imported: number;
  flagged: number;
  errors: string[];
}

/** Partial update payload for PATCH /api/leads/{lead_id}. */
export interface LeadUpdate {
  stage?: string;
  status?: string;
}

/** An activity/note entry returned by GET /api/leads/{lead_id}/activities. */
export interface LeadActivity {
  id: string;
  lead_id: string;
  user_name: string;
  activity_type: 'Note' | 'Call' | 'Email' | 'System';
  content: string;
  timestamp: string;
}

/** Inbound payload for POST /api/leads/{lead_id}/activities. */
export interface LeadActivityCreate {
  user_name: string;
  activity_type?: 'Note' | 'Call' | 'Email' | 'System';
  content: string;
}

/** An immutable audit log entry (mirrors AuditLog Pydantic model). */
export interface AuditLog {
  id: string;
  lead_id: string;
  user_name: string;
  user_email: string;
  action: string;          // e.g. "Stage Changed"
  field_name: string;      // e.g. "stage"
  previous_value: string;
  new_value: string;
  timestamp: string;       // ISO-8601 UTC
}

/** Login request payload for POST /api/auth/login. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Response from POST /api/auth/login. */
export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    email: string;
    name: string;
    role: 'Admin' | 'Sales_Rep';
    bu: string | null;
  };
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
// Request Interceptor — inject Bearer token from localStorage on every call
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('synergy_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response Interceptor — normalise errors; redirect to /auth on 401
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ detail: string }>) => {
    const serverMessage = error.response?.data?.detail;
    const statusCode = error.response?.status;

    // On 401, clear stale auth data and send the user to the login page.
    // Guard against redirect loops by skipping the auth endpoint itself.
    if (
      statusCode === 401 &&
      !error.config?.url?.includes('/api/auth/login')
    ) {
      localStorage.removeItem('synergy_token');
      localStorage.removeItem('synergy_user');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth';
      }
    }

    console.error(
      `[Synergy API Error] ${statusCode ?? 'Network'}: ${serverMessage ?? error.message}`,
    );

    const enrichedError = new Error(
      serverMessage ?? `Request failed with status ${statusCode}`,
    );
    return Promise.reject(enrichedError);
  },
);
