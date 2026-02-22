export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentColor = 'evergreen' | 'cobalt' | 'cranberry' | 'amber' | 'graphite';

export interface User {
  id: string;
  username: string;
  is_admin: boolean;
  mfa_enabled: boolean;
  created_at: string;
}

export interface SystemStatus {
  has_users: boolean;
  allow_self_register: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface Photo {
  id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  created_at: string;
  download_url: string;
}

export interface ParkingRecord {
  id: string;
  owner_id: string;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  note: string | null;
  parked_at: string;
  created_at: string;
  updated_at: string;
  photos: Photo[];
}
