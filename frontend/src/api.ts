import type { ParkingRecord, SystemStatus, TokenResponse, User } from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    token?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (isFormData(options.body)) {
      body = options.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = payload.detail;
      }
    } catch {
      // ignore parse failures
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
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
  me(token: string): Promise<User> {
    return request<User>('/auth/me', { token });
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
    payload: Partial<Pick<ParkingRecord, 'latitude' | 'longitude' | 'note' | 'parked_at'>>
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
  }
};
