const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && token) {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('access_token')}`;
      const retry = await fetch(`${API_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ message: 'Request failed' }));
        throw new ApiError(retry.status, err.message);
      }
      return retry.json();
    } else {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new ApiError(401, 'Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(res.status, err.message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('access_token', data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(url: string, body?: unknown) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(url: string, body?: unknown) => request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),

  /** Multipart upload (do not set Content-Type — browser sets boundary) */
  upload: async <T>(endpoint: string, file: File, fieldName = 'file'): Promise<T> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const form = new FormData();
    form.append(fieldName, file);

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Upload failed' }));
      throw new ApiError(res.status, err.message);
    }
    return res.json();
  },
};

/** Origin for legacy relative upload paths; data URLs / absolute URLs are used as-is. */
export const UPLOADS_BASE = (() => {
  const api = process.env.NEXT_PUBLIC_API_URL || '/api';
  if (api.startsWith('http')) return api.replace(/\/api\/?$/, '') || '';
  return '';
})();

export function resolveUploadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `${UPLOADS_BASE}${url}`;
}

