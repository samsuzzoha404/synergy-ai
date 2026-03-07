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
  developer?: string | null;
  floors?: number | null;
  gfa?: number | null;
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
  // Extra metadata fields — populated for seeded / bulk-imported leads
  developer?: string | null;
  floors?: number | null;
  gfa?: number | null;
  created_date?: string | null;
  assigned_to?: string | null;
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

/** A sales manager contact entry returned by GET /api/bu-contacts. */
export interface BUContact {
  bu: string;
  contact_name: string;
  contact_title: string;
  phone: string;
  email: string;
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

/** A user account returned by the admin endpoints. */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'Admin' | 'Sales_Rep';
  bu: string | null;
}

/** Payload for POST /api/admin/users. */
export interface UserCreate {
  email: string;
  name: string;
  role: 'Admin' | 'Sales_Rep';
  bu: string | null;
  password: string;
}

/** Payload for PATCH /api/admin/users/{user_id}. */
export interface UserUpdate {
  name?: string;
  role?: 'Admin' | 'Sales_Rep';
  bu?: string | null;
  password?: string;
}

/** Response from POST /api/auth/login. */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
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
// Silent Refresh — shared state for queuing concurrent requests during renewal
// ---------------------------------------------------------------------------

/** True while a /api/auth/refresh call is in-flight. */
let _isRefreshing = false;

type _QueueItem = { resolve: (token: string) => void; reject: (err: unknown) => void };

/** Pending requests that arrived while a refresh was already in-flight. */
let _failedQueue: _QueueItem[] = [];

/** Flush the queue after a refresh attempt completes. */
function _processQueue(error: unknown, token: string | null = null): void {
  _failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  _failedQueue = [];
}

/** Remove all auth-related keys from localStorage and redirect to /auth. */
function _clearSessionAndRedirect(): void {
  localStorage.removeItem('synergy_token');
  localStorage.removeItem('synergy_refresh_token');
  localStorage.removeItem('synergy_user');
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
    window.location.href = '/auth';
  }
}

// ---------------------------------------------------------------------------
// Response Interceptor — silent refresh on 401; redirect only when refresh fails
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ detail: string }>) => {
    const serverMessage = error.response?.data?.detail;
    const statusCode    = error.response?.status;
    const originalUrl   = error.config?.url ?? '';

    // ── 401 handling ───────────────────────────────────────────────────────
    // Skip for any /api/auth/ call to avoid infinite loops.
    if (statusCode === 401 && !originalUrl.includes('/api/auth/')) {
      const storedRefresh = localStorage.getItem('synergy_refresh_token');

      // No refresh token available → hard logout
      if (!storedRefresh) {
        _clearSessionAndRedirect();
        return Promise.reject(new Error(serverMessage ?? 'Session expired. Please log in.'));
      }

      // Another refresh is already in-flight → queue this request
      if (_isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          _failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          const retryConfig = { ...error.config! } as Parameters<typeof apiClient>[0];
          retryConfig.headers = { ...error.config!.headers, Authorization: `Bearer ${newToken}` };
          return apiClient(retryConfig);
        });
      }

      // We are the first to attempt a refresh
      _isRefreshing = true;
      const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

      return new Promise((resolve, reject) => {
        axios
          .post<{ access_token: string; refresh_token: string }>(
            `${baseURL}/api/auth/refresh`,
            { refresh_token: storedRefresh },
            { headers: { 'Content-Type': 'application/json' } },
          )
          .then(({ data }) => {
            const { access_token, refresh_token: newRefresh } = data;
            // Persist both new tokens
            localStorage.setItem('synergy_token', access_token);
            localStorage.setItem('synergy_refresh_token', newRefresh);
            // Update Axios default header so subsequent requests use the new token
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            // Flush queued requests
            _processQueue(null, access_token);
            // Retry the original failed request
            const retryConfig = { ...error.config! } as Parameters<typeof apiClient>[0];
            retryConfig.headers = { ...error.config!.headers, Authorization: `Bearer ${access_token}` };
            resolve(apiClient(retryConfig));
          })
          .catch((refreshErr) => {
            _processQueue(refreshErr, null);
            _clearSessionAndRedirect();
            reject(new Error('Session expired. Please log in.'));
          })
          .finally(() => {
            _isRefreshing = false;
          });
      });
    }
    // ── End 401 handling ───────────────────────────────────────────────────

    console.error(
      `[Synergy API Error] ${statusCode ?? 'Network'}: ${serverMessage ?? error.message}`,
    );

    const enrichedError = new Error(
      serverMessage ?? `Request failed with status ${statusCode}`,
    );
    return Promise.reject(enrichedError);
  },
);
