import { requireMobileEnvironment } from '@/lib/env';

export class MobileApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'MobileApiError';
  }
}

export function friendlyMobileError(error: unknown, fallback = 'That action could not be completed.') {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  if (normalized.includes('abort') || normalized.includes('timeout')) {
    return 'This is taking longer than expected. Check your connection and try again.';
  }
  if (normalized.includes('network') || normalized.includes('failed to fetch')) {
    return 'Could not reach the service. Check your internet connection and try again.';
  }
  if (normalized.includes('jwt') || normalized.includes('session') && normalized.includes('expired')) {
    return 'Your secure session has expired. Log in again to continue.';
  }
  if (normalized.includes('not authenticated')) {
    return 'Log in again to continue.';
  }
  if (normalized.includes('permission denied') || normalized.includes('row-level security') || normalized.includes('admin access required')) {
    return 'You do not have permission to perform this action.';
  }
  if (normalized.includes('duplicate key') || normalized.includes('unique constraint')) {
    return 'That entry already exists.';
  }
  if (normalized.includes('archived league') || normalized.includes('league is archived')) {
    return 'This league is archived and can no longer be changed.';
  }
  const technical = ['schema cache', 'could not find the function', 'does not exist', 'pgrst', 'postgres', 'relation "', 'column "', 'invalid input syntax', 'violates constraint', 'syntax error', 'json'];
  if (technical.some(marker => normalized.includes(marker))) {
    return 'The service is being updated. Wait a moment and try again.';
  }
  if (message) return message;
  return fallback;
}

export async function apiRequest<T>({
  path,
  body,
  token,
  method = 'POST',
  timeoutMs = 15000,
}: {
  path: string;
  body?: Record<string, unknown>;
  token?: string;
  method?: 'POST' | 'DELETE';
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { apiUrl } = requireMobileEnvironment();
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok) throw new MobileApiError(payload?.error || 'That action could not be completed.', response.status);
    if (!payload) throw new MobileApiError('The service returned an empty response.', response.status);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
