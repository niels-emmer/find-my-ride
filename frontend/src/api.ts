import type { ParkingRecord, SystemStatus, TokenResponse, User } from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

type RequestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RequestOptions = {
  method?: RequestMethod;
  token?: string;
  body?: unknown;
};
type AuthSessionHandlers = {
  getAccessToken: () => string;
  setAccessToken: (token: string) => void;
  clearAccessToken: () => void;
};

const NO_REFRESH_PATHS = new Set(['/auth/bootstrap', '/auth/register', '/auth/login', '/auth/refresh', '/auth/logout']);

let authSessionHandlers: AuthSessionHandlers | null = null;
let refreshInFlight: Promise<string> | null = null;

function isFormData(payload: unknown): payload is FormData {
  return typeof FormData !== 'undefined' && payload instanceof FormData;
}

export function toAbsoluteApiPath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('/')) {
    if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
      const origin = API_BASE.replace(/\/api\/?$/, '');
      return `${origin}${path}`;
    }
    return path;
  }

  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function buildHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function buildBody(options: RequestOptions): BodyInit | undefined {
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (isFormData(options.body)) {
      body = options.body;
    } else {
      body = JSON.stringify(options.body);
    }
  }
  return body;
}

async function buildError(response: Response): Promise<Error> {
  let detail = `Request failed (${response.status})`;
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      detail = payload.detail;
    }
  } catch {
    // ignore parse failures
  }
  return new Error(detail);
}

function canAttemptRefresh(path: string, token: string | undefined): boolean {
  return Boolean(token) && !NO_REFRESH_PATHS.has(path);
}

async function request<T>(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const token = options.token ?? authSessionHandlers?.getAccessToken();
  const headers = buildHeaders(token);
  const body = buildBody(options);

  if (options.body !== undefined && !isFormData(options.body)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body
  });

  if (response.status === 401 && allowRefresh && canAttemptRefresh(path, token)) {
    try {
      const refreshedToken = await refreshAccessToken();
      return request<T>(path, { ...options, token: refreshedToken }, false);
    } catch {
      authSessionHandlers?.clearAccessToken();
      throw await buildError(response);
    }
  }

  if (!response.ok) {
    throw await buildError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  configureAuthSession(handlers: AuthSessionHandlers | null): void {
    authSessionHandlers = handlers;
  },
  systemStatus(): Promise<SystemStatus> {
    return request<SystemStatus>('/system/status');
  },
  bootstrapAdmin(username: string, password: string): Promise<TokenResponse> {
    return request<TokenResponse>('/auth/bootstrap', {
      method: 'POST',
      body: { username, password }
    });
  },
  register(username: string, password: string): Promise<TokenResponse> {
    return request<TokenResponse>('/auth/register', {
      method: 'POST',
      body: { username, password }
    });
  },
  login(username: string, password: string, otpCode?: string): Promise<TokenResponse> {
    return request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: { username, password, otp_code: otpCode || null }
    });
  },
  refresh(): Promise<TokenResponse> {
    return request<TokenResponse>('/auth/refresh', { method: 'POST' });
  },
  logout(): Promise<{ message: string }> {
    return request<{ message: string }>('/auth/logout', { method: 'POST' });
  },
  me(token: string): Promise<User> {
    return request<User>('/auth/me', { token });
  },
  changePassword(token: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      token,
      body: {
        current_password: currentPassword,
        new_password: newPassword
      }
    });
  },
  setupMfa(token: string): Promise<{ secret: string; otpauth_url: string }> {
    return request<{ secret: string; otpauth_url: string }>('/auth/mfa/setup', {
      method: 'POST',
      token
    });
  },
  verifyMfa(token: string, code: string): Promise<{ mfa_enabled: boolean }> {
    return request<{ mfa_enabled: boolean }>('/auth/mfa/verify', {
      method: 'POST',
      token,
      body: { code }
    });
  },
  disableMfa(token: string, code: string): Promise<{ mfa_enabled: boolean }> {
    return request<{ mfa_enabled: boolean }>('/auth/mfa/disable', {
      method: 'POST',
      token,
      body: { code }
    });
  },
  listRecords(token: string, ownerId?: string): Promise<ParkingRecord[]> {
    const search = ownerId ? `?owner_id=${encodeURIComponent(ownerId)}` : '';
    return request<ParkingRecord[]>(`/parking/records${search}`, { token });
  },
  latestRecord(token: string, ownerId?: string): Promise<ParkingRecord | null> {
    const search = ownerId ? `?owner_id=${encodeURIComponent(ownerId)}` : '';
    return request<ParkingRecord | null>(`/parking/records/latest${search}`, { token });
  },
  createRecord(token: string, formData: FormData): Promise<ParkingRecord> {
    return request<ParkingRecord>('/parking/records', { method: 'POST', token, body: formData });
  },
  updateRecord(
    token: string,
    recordId: string,
    payload: Partial<Pick<ParkingRecord, 'latitude' | 'longitude' | 'location_label' | 'note' | 'parked_at'>>
  ): Promise<ParkingRecord> {
    return request<ParkingRecord>(`/parking/records/${recordId}`, {
      method: 'PATCH',
      token,
      body: payload
    });
  },
  addPhotos(token: string, recordId: string, files: File[]): Promise<ParkingRecord> {
    const formData = new FormData();
    files.forEach((file) => formData.append('photos', file));
    return request<ParkingRecord>(`/parking/records/${recordId}/photos`, {
      method: 'POST',
      token,
      body: formData
    });
  },
  deletePhoto(token: string, photoId: string): Promise<void> {
    return request<void>(`/parking/photos/${photoId}`, { method: 'DELETE', token });
  },
  deleteRecord(token: string, recordId: string): Promise<void> {
    return request<void>(`/parking/records/${recordId}`, { method: 'DELETE', token });
  },
  listUsers(token: string): Promise<User[]> {
    return request<User[]>('/users', { token });
  },
  createUser(token: string, username: string, password: string, isAdmin: boolean): Promise<User> {
    return request<User>('/users', {
      method: 'POST',
      token,
      body: { username, password, is_admin: isAdmin }
    });
  },
  updateUser(token: string, userId: string, payload: { password?: string; is_admin?: boolean }): Promise<User> {
    return request<User>(`/users/${userId}`, {
      method: 'PATCH',
      token,
      body: payload
    });
  },
  deleteUser(token: string, userId: string): Promise<void> {
    return request<void>(`/users/${userId}`, {
      method: 'DELETE',
      token
    });
  }
};

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshed = await request<TokenResponse>('/auth/refresh', { method: 'POST' }, false);
    authSessionHandlers?.setAccessToken(refreshed.access_token);
    return refreshed.access_token;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
