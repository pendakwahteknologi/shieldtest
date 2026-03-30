const API_BASE = '/shieldtest/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, String(value));
    }
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    // Redirect to login on 401
    if (response.status === 401 && !path.includes('/auth/login')) {
      window.location.href = '/shieldtest/login';
      throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired');
    }
    const errorBody = await response.json().catch(() => ({ error: { code: 'UNKNOWN', message: 'Request failed' } }));
    throw new ApiError(response.status, errorBody.error?.code || 'UNKNOWN', errorBody.error?.message || 'Request failed');
  }

  return response.json();
}
