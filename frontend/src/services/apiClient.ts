/**
 * API Client for communicating with the FastAPI backend
 * 
 * In production (single-container deployment), API is served at /api (same origin).
 * For local development, set VITE_API_BASE_URL=http://localhost:8000/api
 */

import type {
  DraftRequest,
  DraftResponse,
  ExtractPreferencesRequest,
  ExtractedPreferences,
  HolidayStatusRequest,
  HolidayStatusResponse,
  HolidayStatusBatchRequest,
  HolidayMapResponse,
} from '@/types';

// Default to same-origin /api for production; override with VITE_API_BASE_URL for dev
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * API Error class for handling backend errors
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

/**
 * Generate a communication draft using the backend API
 */
export async function generateDraft(request: DraftRequest): Promise<DraftResponse> {
  const response = await fetch(`${API_BASE_URL}/generate_draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, errorData.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Health check for the backend API
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Extract customer scheduling preferences from CRM notes using LLM
 */
export async function extractPreferences(
  request: ExtractPreferencesRequest
): Promise<ExtractedPreferences> {
  const response = await fetch(`${API_BASE_URL}/extract_preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, errorData.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if a date is a public holiday or weekend for a given country
 */
export async function getHolidayStatus(
  request: HolidayStatusRequest
): Promise<HolidayStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/holiday_status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, errorData.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Batch check if multiple dates are public holidays for a given country.
 * Returns only the dates that are holidays (date -> holiday_name mapping).
 * 
 * @param request - country_code and array of dates (YYYY-MM-DD format)
 * @returns HolidayMapResponse with holidays dict (only holiday dates included)
 */
export async function getHolidayMapBatch(
  request: HolidayStatusBatchRequest
): Promise<HolidayMapResponse> {
  const response = await fetch(`${API_BASE_URL}/holiday_status_batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, errorData.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
