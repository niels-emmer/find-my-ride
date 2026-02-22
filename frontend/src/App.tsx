import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

import { api } from './api';
import { ProtectedImage } from './ProtectedImage';
import type { AccentColor, ParkingRecord, SystemStatus, ThemeMode, User } from './types';

const TOKEN_KEY = 'fmr_access_token';
const THEME_KEY = 'fmr_theme_mode';
const ACCENT_KEY = 'fmr_accent_color';
const ACTIVE_PARKING_KEY = 'fmr_active_parking_by_user_v1';
const APP_BACKGROUND_IMAGE_URL = '/images/parking-background-option-3.jpg';
const USERNAME_PATTERN = '[A-Za-z0-9](?:[A-Za-z0-9._-]{1,62}[A-Za-z0-9])?';
const PASSWORD_POLICY_PATTERN = '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,128}';
const PASSWORD_POLICY_HINT = 'Use 8-128 chars including uppercase, lowercase, and a digit.';
const DEFAULT_ACCENT_COLOR: AccentColor = 'evergreen';
type ResolvedTheme = 'light' | 'dark';
type AccentOption = {
  id: AccentColor;
  label: string;
  swatch: string;
  tones: Record<ResolvedTheme, { primary: string; strong: string }>;
};
const ACCENT_OPTIONS: AccentOption[] = [
  {
    id: 'evergreen',
    label: 'Evergreen',
    swatch: '#0e3f3b',
    tones: {
      light: { primary: '#0e3f3b', strong: '#1a7269' },
      dark: { primary: '#1f7f74', strong: '#2e9f92' }
    }
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    swatch: '#1f4f8a',
    tones: {
      light: { primary: '#1f4f8a', strong: '#2f6db5' },
      dark: { primary: '#2f6db5', strong: '#4b87cc' }
    }
  },
  {
    id: 'cranberry',
    label: 'Cranberry',
    swatch: '#7a2f43',
    tones: {
      light: { primary: '#7a2f43', strong: '#a3415b' },
      dark: { primary: '#9c4259', strong: '#ba5f76' }
    }
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#7c4f00',
    tones: {
      light: { primary: '#7c4f00', strong: '#a36700' },
      dark: { primary: '#a36700', strong: '#c38312' }
    }
  },
  {
    id: 'graphite',
    label: 'Graphite',
    swatch: '#334455',
    tones: {
      light: { primary: '#334455', strong: '#4b6178' },
      dark: { primary: '#4f6680', strong: '#6885a3' }
    }
  }
];
const ACCENT_BY_ID: Record<AccentColor, AccentOption> = Object.fromEntries(
  ACCENT_OPTIONS.map((entry) => [entry.id, entry])
) as Record<AccentColor, AccentOption>;

type TabKey = 'find' | 'history' | 'settings';
type AuthMode = 'login' | 'register';
type LocatedFix = { latitude: number; longitude: number; placeLabel: string };
type ActiveParkingPhoto = {
  id: string;
  name: string;
  type: string;
  data_url: string;
};
type ActiveParkingSession = {
  started_at: string;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  note: string | null;
  photos: ActiveParkingPhoto[];
};
type ExpandedPhoto = {
  src: string;
  alt: string;
};

function normalizeUsernameInput(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOtpInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

function isAccentColor(value: string): value is AccentColor {
  return value in ACCENT_BY_ID;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${day}-${month}-${year} ${time}`;
}

function formatActiveDuration(startedAt: string, nowMs = Date.now()): string {
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) {
    return '0h 00m';
  }
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - startedMs) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function loadActiveParkingMap(): Record<string, ActiveParkingSession> {
  const raw = localStorage.getItem(ACTIVE_PARKING_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Record<string, ActiveParkingSession>;
  } catch {
    return {};
  }
}

function loadActiveParkingForUser(userId: string): ActiveParkingSession | null {
  const byUser = loadActiveParkingMap();
  return byUser[userId] || null;
}

function saveActiveParkingForUser(userId: string, session: ActiveParkingSession | null): void {
  const byUser = loadActiveParkingMap();
  if (session) {
    byUser[userId] = session;
  } else {
    delete byUser[userId];
  }
  try {
    localStorage.setItem(ACTIVE_PARKING_KEY, JSON.stringify(byUser));
  } catch {
    // ignore storage quota errors
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read selected photo.'));
    };
    reader.onerror = () => {
      reject(new Error('Unable to read selected photo.'));
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(photo: ActiveParkingPhoto): File {
  const [meta, encoded] = photo.data_url.split(',');
  if (!encoded) {
    return new File([], photo.name, { type: photo.type || 'application/octet-stream' });
  }
  const mimeMatch = meta.match(/^data:([^;]+);base64$/);
  const mime = mimeMatch?.[1] || photo.type || 'application/octet-stream';
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], photo.name, { type: mime });
}

function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

function openStreetMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

function openStreetMapEmbedUrl(lat: number, lng: number): string {
  const delta = 0.0035;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
  const search = new URLSearchParams({
    bbox,
    layer: 'mapnik',
    marker: `${lat},${lng}`
  });
  return `https://www.openstreetmap.org/export/embed.html?${search.toString()}`;
}

function recordLocationSummary(record: ParkingRecord): string {
  if (record.latitude === null || record.longitude === null) {
    return 'Location unavailable';
  }

  if (record.location_label && record.location_label.trim()) {
    return record.location_label;
  }

  return 'Address unavailable';
}

function geolocate(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported on this device/browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        reject(new Error(error.message || 'Could not retrieve current location.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000
      }
    );
  });
}

function coordinateLabel(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function normalizeLocationLabelParts(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .join(', ');
}

function formatReverseGeocodedAddress(payload: {
  display_name?: string;
  address?: Record<string, string | undefined>;
}): string {
  const address = payload.address ?? {};
  const street = address.road || address.pedestrian || address.footway || address.path || address.cycleway;
  const houseNumber = address.house_number;
  const postcode = address.postcode;
  const city = address.city || address.town || address.village || address.municipality;
  const province = address.state || address.county || address.state_district;
  const country = address.country;

  const streetPart = [street, houseNumber].filter(Boolean).join(' ').trim();
  const cityPart = [postcode, city].filter(Boolean).join(' ').trim();

  const ordered = normalizeLocationLabelParts([streetPart, cityPart, province, country]);
  if (ordered) {
    return ordered;
  }

  return (payload.display_name || '').trim();
}

async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const search = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '18',
    addressdetails: '1'
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${search.toString()}`, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Location name unavailable.');
  }

  const payload = (await response.json()) as { display_name?: string; address?: Record<string, string | undefined> };
  const label = formatReverseGeocodedAddress(payload);
  if (!label) {
    throw new Error('Location name unavailable.');
  }

  return label;
}

function App(): JSX.Element {
  const toastTimeoutRef = useRef<number | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemStatusError, setSystemStatusError] = useState<string>('');
  const [systemStatusReloadKey, setSystemStatusReloadKey] = useState<number>(0);
  const [token, setToken] = useState<string>(localStorage.getItem(TOKEN_KEY) || '');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeParking, setActiveParking] = useState<ActiveParkingSession | null>(null);
  const [scope, setScope] = useState<'me' | 'all' | string>('me');
  const [activeTab, setActiveTab] = useState<TabKey>('find');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });
  const [accentColor, setAccentColor] = useState<AccentColor>(() => {
    const stored = localStorage.getItem(ACCENT_KEY);
    if (stored && isAccentColor(stored)) {
      return stored;
    }
    return DEFAULT_ACCENT_COLOR;
  });

  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const tokenRef = useRef<string>(token);
  const activeParkingOwnerRef = useRef<string | null>(null);
  const manualLogoutRef = useRef<boolean>(false);

  const ownerIdForQuery = useMemo(() => {
    if (!currentUser?.is_admin) {
      return undefined;
    }
    if (scope === 'all') {
      return undefined;
    }
    if (scope === 'me') {
      return currentUser.id;
    }
    return scope;
  }, [currentUser, scope]);

  useEffect(() => {
    let active = true;
    setSystemStatusError('');

    void (async () => {
      try {
        const status = await api.systemStatus();
        if (active) {
          setSystemStatus(status);
          setSystemStatusError('');
        }
      } catch (error) {
        if (active) {
          setSystemStatusError((error as Error).message);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [systemStatusReloadKey]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyThemeAndAccent = () => {
      const resolvedTheme: ResolvedTheme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      const accent = ACCENT_BY_ID[accentColor].tones[resolvedTheme];
      document.documentElement.style.setProperty('--ui-accent', accent.primary);
      document.documentElement.style.setProperty('--ui-accent-strong', accent.strong);
      localStorage.setItem(THEME_KEY, themeMode);
      localStorage.setItem(ACCENT_KEY, accentColor);
    };

    applyThemeAndAccent();
    media.addEventListener('change', applyThemeAndAccent);

    return () => {
      media.removeEventListener('change', applyThemeAndAccent);
    };
  }, [themeMode, accentColor]);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-background-image-url', `url('${APP_BACKGROUND_IMAGE_URL}')`);
  }, []);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    api.configureAuthSession({
      getAccessToken: () => tokenRef.current,
      setAccessToken: (nextToken: string) => {
        localStorage.setItem(TOKEN_KEY, nextToken);
        setToken(nextToken);
      },
      clearAccessToken: () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setCurrentUser(null);
      }
    });

    return () => {
      api.configureAuthSession(null);
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const tryRefresh = async (): Promise<boolean> => {
        try {
          const refreshed = await api.refresh();
          localStorage.setItem(TOKEN_KEY, refreshed.access_token);
          if (active) {
            setToken(refreshed.access_token);
            setCurrentUser(refreshed.user);
            setLoading(false);
          }
          return true;
        } catch {
          return false;
        }
      };

      if (!token) {
        if (manualLogoutRef.current) {
          if (active) {
            setCurrentUser(null);
            setLoading(false);
          }
          return;
        }
        const refreshed = await tryRefresh();
        if (!refreshed && active) {
          setCurrentUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const me = await api.me(token);
        if (active) {
          setCurrentUser(me);
          setLoading(false);
        }
      } catch {
        if (active) {
          localStorage.removeItem(TOKEN_KEY);
          setToken('');
          setCurrentUser(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !currentUser) {
      return;
    }

    void refreshData(token, currentUser, ownerIdForQuery, setRecords, setUsers, setMessage);
  }, [token, currentUser, ownerIdForQuery]);

  useEffect(() => {
    const userId = currentUser?.id ?? null;
    if (userId !== activeParkingOwnerRef.current) {
      activeParkingOwnerRef.current = userId;
      if (!userId) {
        setActiveParking(null);
        return;
      }
      setActiveParking(loadActiveParkingForUser(userId));
      return;
    }
    if (!userId) {
      return;
    }
    saveActiveParkingForUser(userId, activeParking);
  }, [currentUser?.id, activeParking]);

  useEffect(() => {
    if (!currentUser || !activeParking || !window.isSecureContext || !('Notification' in window)) {
      return;
    }

    let cancelled = false;
    let notifyInterval: number | null = null;

    const emitParkingNotification = (): void => {
      if (cancelled || Notification.permission !== 'granted') {
        return;
      }

      try {
        const locationText = activeParking.location_label?.trim() ? `Location: ${activeParking.location_label}` : '';
        const notification = new Notification('You are parked', {
          body: `Active: ${formatActiveDuration(activeParking.started_at)}${locationText ? `\n${locationText}` : ''}`,
          tag: 'fmr-active-parking'
        });
        notification.onclick = () => {
          try {
            notification.close();
          } catch {
            // no-op
          }
          window.focus();
        };
      } catch {
        // ignore notification delivery failures
      }
    };

    const startNotifications = (): void => {
      emitParkingNotification();
      notifyInterval = window.setInterval(emitParkingNotification, 60000);
    };

    if (Notification.permission === 'default') {
      void Notification.requestPermission().then((permission) => {
        if (!cancelled && permission === 'granted') {
          startNotifications();
        }
      });
    } else if (Notification.permission === 'granted') {
      startNotifications();
    }

    return () => {
      cancelled = true;
      if (notifyInterval !== null) {
        window.clearInterval(notifyInterval);
      }
    };
  }, [currentUser?.id, activeParking]);

  useEffect(() => {
    if (!currentUser || !message) {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      return;
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setMessage('');
      toastTimeoutRef.current = null;
    }, 5000);

    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    };
  }, [currentUser, message]);

  const handleAuthSuccess = (nextToken: string, user: User): void => {
    manualLogoutRef.current = false;
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setCurrentUser(user);
    setSystemStatus((previous) =>
      previous
        ? {
            ...previous,
            has_users: true
          }
        : previous
    );
    setActiveTab('find');
    setAuthMode('login');
    setMessage('');
  };

  const handleLogout = (): void => {
    manualLogoutRef.current = true;
    void api.logout().catch(() => {
      // local logout still applies if backend logout fails
    });
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setCurrentUser(null);
    setRecords([]);
    setUsers([]);
    setScope('me');
    setActiveTab('find');
    setAuthMode('login');
    setMessage('Signed out.');
  };

  if (!systemStatus) {
    if (systemStatusError) {
      return (
        <div className="screen-center">
          <section className="panel status-panel">
            <h1>Unable to load system status.</h1>
            <p className="error">{systemStatusError}</p>
            <button className="btn" type="button" onClick={() => setSystemStatusReloadKey((previous) => previous + 1)}>
              Retry
            </button>
          </section>
        </div>
      );
    }
    return <div className="screen-center">Loading system status...</div>;
  }

  if (loading) {
    return <div className="screen-center">Loading...</div>;
  }

  if (!systemStatus.has_users) {
    return (
      <div className="shell auth-shell">
        <Header />
        <main className="auth-main">
          <BootstrapCard onBootstrap={handleAuthSuccess} onError={setMessage} message={message} />
        </main>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="shell auth-shell">
        <Header />
        <main className="auth-main">
          <AuthModeNav mode={authMode} onSelect={setAuthMode} />
          <LoginCard mode={authMode} onLogin={handleAuthSuccess} onError={setMessage} message={message} />
        </main>
      </div>
    );
  }

  return (
    <div className="shell app-shell">
      <Header currentUser={currentUser} onLogout={handleLogout} />

      <main className="tab-main">
        {activeTab === 'find' && (
          <div className="tab-page">
            <section className="panel panel-wide">
              <div className="panel-title-row">
                <h1>{activeParking ? 'You are parked' : 'Parked?'}</h1>
              </div>
              {!activeParking ? (
                <ParkNowCard
                  onStartParking={(session) => {
                    setActiveParking(session);
                    setMessage('Parking started.');
                  }}
                  onError={setMessage}
                />
              ) : (
                <ActiveParkingCard
                  parking={activeParking}
                  onEndParking={async () => {
                    const formData = new FormData();
                    if (
                      activeParking.latitude !== null &&
                      activeParking.longitude !== null &&
                      activeParking.location_label?.trim()
                    ) {
                      formData.append('latitude', String(activeParking.latitude));
                      formData.append('longitude', String(activeParking.longitude));
                      formData.append('location_label', activeParking.location_label.trim());
                    }
                    if (activeParking.note?.trim()) {
                      formData.append('note', activeParking.note.trim());
                    }
                    activeParking.photos.forEach((photo) => {
                      formData.append('photos', dataUrlToFile(photo));
                    });
                    formData.append('parked_at', activeParking.started_at);
                    await api.createRecord(token, formData);
                    setActiveParking(null);
                    await refreshData(token, currentUser, ownerIdForQuery, setRecords, setUsers, setMessage);
                    setMessage('Parking session ended and saved.');
                  }}
                  onError={setMessage}
                />
              )}
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="tab-page">
            <section className="panel panel-wide">
              <div className="panel-title-row">
                <h2>History</h2>
                {currentUser.is_admin && (
                  <label className="inline-field compact">
                    Scope
                    <select value={scope} onChange={(event) => setScope(event.target.value)}>
                      <option value="me">My records</option>
                      <option value="all">All users</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.username}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <HistoryCard
                token={token}
                records={records}
                onUpdated={async () => {
                  await refreshData(
                    token,
                    currentUser,
                    ownerIdForQuery,
                    setRecords,
                    setUsers,
                    setMessage
                  );
                }}
                onError={setMessage}
              />
            </section>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-page">
            <section className="panel panel-wide">
              <h2>Profile</h2>
              <ProfileCard
                token={token}
                user={currentUser}
                themeMode={themeMode}
                onThemeModeChange={setThemeMode}
                accentColor={accentColor}
                onAccentColorChange={setAccentColor}
                onRefreshUser={async () => {
                  const me = await api.me(token);
                  setCurrentUser(me);
                }}
                onError={setMessage}
              />
            </section>

            {currentUser.is_admin && (
              <section className="panel panel-wide">
                <h2>Admin</h2>
                <AdminUsersCard
                  token={token}
                  currentUser={currentUser}
                  users={users}
                  onUpdated={async () => {
                    await refreshData(
                      token,
                      currentUser,
                      ownerIdForQuery,
                      setRecords,
                      setUsers,
                      setMessage
                    );
                  }}
                  onError={setMessage}
                />
              </section>
            )}
          </div>
        )}
      </main>

      <BottomTabBar activeTab={activeTab} onSelect={setActiveTab} />

      {message ? (
        <div className="toast" role="status" aria-live="polite">
          <span>{message}</span>
          <button className="toast-dismiss" type="button" onClick={() => setMessage('')} aria-label="Dismiss notification">
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function refreshData(
  token: string,
  user: User,
  ownerIdForQuery: string | undefined,
  setRecords: (records: ParkingRecord[]) => void,
  setUsers: (users: User[]) => void,
  setMessage: (message: string) => void
): Promise<void> {
  try {
    const records = await api.listRecords(token, ownerIdForQuery);
    setRecords(records);

    if (user.is_admin) {
      const users = await api.listUsers(token);
      setUsers(users);
    }
  } catch (error) {
    setMessage((error as Error).message);
  }
}

function Header({
  currentUser,
  onLogout
}: {
  currentUser?: User | null;
  onLogout?: () => void;
}): JSX.Element {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-dot" />
        <span>find-my-ride</span>
      </div>

      {currentUser && onLogout ? (
        <details className="user-menu">
          <summary className="user-menu-trigger" aria-label="Open user menu">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12c2.76 0 5-2.69 5-6s-2.24-6-5-6-5 2.69-5 6 2.24 6 5 6Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z" />
            </svg>
          </summary>
          <div className="user-menu-panel">
            <p className="small-meta">
              Signed in as <strong>{currentUser.username}</strong>
              {currentUser.is_admin ? ' (admin)' : ''}
            </p>
            <button className="user-menu-action" type="button" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </details>
      ) : null}
    </header>
  );
}

function BottomTabBar({
  activeTab,
  onSelect
}: {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
}): JSX.Element {
  return (
    <nav className="bottom-tabs" aria-label="Primary navigation">
      <button
        type="button"
        className={`tab-button${activeTab === 'find' ? ' active' : ''}`}
        onClick={() => onSelect('find')}
      >
        home
      </button>
      <button
        type="button"
        className={`tab-button${activeTab === 'history' ? ' active' : ''}`}
        onClick={() => onSelect('history')}
      >
        history
      </button>
      <button
        type="button"
        className={`tab-button${activeTab === 'settings' ? ' active' : ''}`}
        onClick={() => onSelect('settings')}
      >
        settings
      </button>
    </nav>
  );
}

function AuthModeNav({
  mode,
  onSelect
}: {
  mode: AuthMode;
  onSelect: (mode: AuthMode) => void;
}): JSX.Element {
  return (
    <nav className="auth-mode-nav" aria-label="Authentication mode">
      <button
        type="button"
        className={`auth-mode-btn${mode === 'login' ? ' active' : ''}`}
        onClick={() => onSelect('login')}
      >
        Sign in
      </button>
      <button
        type="button"
        className={`auth-mode-btn${mode === 'register' ? ' active' : ''}`}
        onClick={() => onSelect('register')}
      >
        Register
      </button>
    </nav>
  );
}

function BootstrapCard({
  onBootstrap,
  onError,
  message
}: {
  onBootstrap: (token: string, user: User) => void;
  onError: (message: string) => void;
  message: string;
}): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <section className="panel auth-card">
      <h1>Create first admin</h1>
      <p className="muted">This account becomes the initial administrator.</p>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              const auth = await api.bootstrapAdmin(normalizeUsernameInput(username), password);
              onBootstrap(auth.access_token, auth.user);
            } catch (error) {
              onError((error as Error).message);
            }
          })();
        }}
      >
        <label className="field">
          Username
          <input
            required
            minLength={3}
            maxLength={64}
            pattern={USERNAME_PATTERN}
            title="Use 3-64 chars: letters, numbers, '.', '_' or '-'"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="field">
          Password (8+ chars, upper/lower/digit)
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            pattern={PASSWORD_POLICY_PATTERN}
            title={PASSWORD_POLICY_HINT}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="btn" type="submit">Create admin and sign in</button>
      </form>

      {message ? <p className="error">{message}</p> : null}
    </section>
  );
}

function LoginCard({
  mode,
  onLogin,
  onError,
  message
}: {
  mode: AuthMode;
  onLogin: (token: string, user: User) => void;
  onError: (message: string) => void;
  message: string;
}): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{ username: string; password: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setOtpCode('');
    setOtpError('');
    setShowOtpModal(false);
    setPendingLogin(null);
  }, [mode]);

  const closeOtpModal = (): void => {
    setOtpCode('');
    setOtpError('');
    setShowOtpModal(false);
    setPendingLogin(null);
  };

  return (
    <>
      <section className="panel auth-card">
        <h1>{mode === 'login' ? 'Sign in' : 'Register'}</h1>

        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              setSubmitting(true);
              try {
                const normalizedUsername = normalizeUsernameInput(username);
                if (mode === 'login') {
                  const auth = await api.login(normalizedUsername, password);
                  onLogin(auth.access_token, auth.user);
                } else {
                  const auth = await api.register(normalizedUsername, password);
                  onLogin(auth.access_token, auth.user);
                }
              } catch (error) {
                const detail = (error as Error).message;
                if (mode === 'login' && detail.toLowerCase().includes('mfa code')) {
                  setPendingLogin({ username: normalizeUsernameInput(username), password });
                  setOtpCode('');
                  setOtpError('');
                  setShowOtpModal(true);
                  onError('');
                } else {
                  onError(detail);
                }
              } finally {
                setSubmitting(false);
              }
            })();
          }}
        >
          <label className="field">
            Username
            <input
              required
              minLength={3}
              maxLength={64}
              pattern={USERNAME_PATTERN}
              title="Use 3-64 chars: letters, numbers, '.', '_' or '-'"
              autoComplete={mode === 'login' ? 'username' : 'new-username'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="field">
            Password
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              pattern={PASSWORD_POLICY_PATTERN}
              title={PASSWORD_POLICY_HINT}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button className="btn" type="submit" disabled={submitting}>
            {mode === 'login' ? (submitting ? 'Signing in...' : 'Sign in') : submitting ? 'Registering...' : 'Register now'}
          </button>
        </form>

        {message ? <p className="error">{message}</p> : null}
      </section>

      {showOtpModal && pendingLogin ? (
        <div className="otp-modal-backdrop">
          <section
            className="panel otp-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="otp-modal-title"
          >
            <h2 id="otp-modal-title">Enter OTP code</h2>
            <p className="muted">Multi-factor authentication is enabled for this account.</p>

            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setSubmitting(true);
                  setOtpError('');
                  try {
                    const auth = await api.login(pendingLogin.username, pendingLogin.password, otpCode.trim());
                    onLogin(auth.access_token, auth.user);
                  } catch (error) {
                    setOtpError((error as Error).message);
                  } finally {
                    setSubmitting(false);
                  }
                })();
              }}
            >
              <label className="field">
                OTP code
                <input
                  required
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]{6,8}"
                  minLength={6}
                  maxLength={8}
                  value={otpCode}
                  onChange={(event) => setOtpCode(normalizeOtpInput(event.target.value))}
                />
              </label>

              <div className="button-row">
                <button className="btn" type="submit" disabled={submitting}>
                  {submitting ? 'Verifying...' : 'Verify and sign in'}
                </button>
                <button className="btn secondary" type="button" disabled={submitting} onClick={closeOtpModal}>
                  Cancel
                </button>
              </div>
            </form>

            {otpError ? <p className="error">{otpError}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function ParkNowCard({
  onStartParking,
  onError
}: {
  onStartParking: (session: ActiveParkingSession) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const [note, setNote] = useState('');
  const [photoSlots, setPhotoSlots] = useState<Array<File | null>>([null, null, null]);
  const photoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [locatedFix, setLocatedFix] = useState<LocatedFix | null>(null);
  const [locateState, setLocateState] = useState<'idle' | 'ready' | 'unavailable'>('idle');
  const [locateHint, setLocateHint] = useState<string>('');
  const [cameraSlotIndex, setCameraSlotIndex] = useState<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [expandedPhoto, setExpandedPhoto] = useState<ExpandedPhoto | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const canUseInAppCamera = window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function';

  const previewUrls = useMemo(() => photoSlots.map((file) => (file ? URL.createObjectURL(file) : '')), [photoSlots]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [previewUrls]);

  const stopCameraStream = (): void => {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  };

  const closeCameraModal = (): void => {
    stopCameraStream();
    setCameraSlotIndex(null);
    setCameraReady(false);
    setCameraBusy(false);
    setCameraError('');
  };

  const setPhotoSlotFromFileList = (slotIndex: number, fileList: FileList | null): void => {
    const selected = fileList?.[0] ?? null;
    setPhotoSlots((previous) => previous.map((entry, index) => (index === slotIndex ? selected : entry)));
    if (selected && cameraSlotIndex === slotIndex) {
      closeCameraModal();
    }
  };

  const syncPhotoSlotsFromInputs = (): void => {
    setPhotoSlots((previous) =>
      previous.map((entry, index) => {
        const selected = photoInputRefs.current[index]?.files?.[0] ?? null;
        return selected ?? entry;
      })
    );
  };

  useEffect(() => {
    const handleFocus = (): void => {
      syncPhotoSlotsFromInputs();
    };

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        syncPhotoSlotsFromInputs();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (cameraSlotIndex === null || !canUseInAppCamera) {
      return;
    }

    let cancelled = false;
    setCameraReady(false);
    setCameraBusy(true);
    setCameraError('');

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }

        cameraStreamRef.current = stream;
        const video = cameraVideoRef.current;
        if (!video) {
          throw new Error('Camera preview is unavailable.');
        }
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Some browsers block autoplay but still render a live stream frame.
        }
        if (!cancelled) {
          setCameraReady(true);
        }
      } catch {
        if (!cancelled) {
          setCameraReady(false);
          setCameraError('Could not open camera. You can still use gallery upload.');
        }
      } finally {
        if (!cancelled) {
          setCameraBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraSlotIndex, canUseInAppCamera]);

  const openGalleryPicker = (slotIndex: number): void => {
    const input = photoInputRefs.current[slotIndex];
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  };

  const openCaptureForSlot = (slotIndex: number): void => {
    if (canUseInAppCamera) {
      setCameraSlotIndex(slotIndex);
      return;
    }
    openGalleryPicker(slotIndex);
  };

  const capturePhotoFromPreview = (): void => {
    if (cameraSlotIndex === null) {
      return;
    }
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setCameraError('Camera is still initializing. Try again.');
      return;
    }

    setCameraBusy(true);
    setCameraError('');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraBusy(false);
      setCameraError('Could not capture the photo.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraBusy(false);
          setCameraError('Could not capture the photo.');
          return;
        }

        const fileName = `parking-photo-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
        const capturedFile = new File([blob], fileName, { type: 'image/jpeg' });
        setPhotoSlots((previous) => previous.map((entry, index) => (index === cameraSlotIndex ? capturedFile : entry)));
        closeCameraModal();
      },
      'image/jpeg',
      0.9
    );
  };

  const runLocate = async (): Promise<LocatedFix | null> => {
    setLocating(true);
    try {
      const fix = await geolocate();
      const placeLabel = await reverseGeocode(fix.latitude, fix.longitude);

      const nextFix: LocatedFix = {
        latitude: fix.latitude,
        longitude: fix.longitude,
        placeLabel
      };
      setLocatedFix(nextFix);
      setLocateState('ready');
      setLocateHint('');
      return nextFix;
    } catch (error) {
      setLocatedFix(null);
      setLocateState('unavailable');
      if (!window.isSecureContext) {
        setLocateHint('Mobile browsers usually require HTTPS for geolocation.');
      } else if (error instanceof Error && error.message === 'Location name unavailable.') {
        setLocateHint('Could not resolve a physical address. Please retry in a clearer signal area.');
      } else {
        setLocateHint('');
      }
      return null;
    } finally {
      setLocating(false);
    }
  };

  return (
    <>
      <div className="stack park-form">
        <p className="muted">
          Use Locate for a GPS fix when available. If GPS fails, you can still save with notes and/or photos.
        </p>

        <div className="stack">
          <button
            className="btn secondary"
            type="button"
            disabled={saving || locating}
            onClick={() => {
              void runLocate();
            }}
          >
            {locating ? 'Locating...' : 'Locate'}
          </button>
          {locateState === 'ready' && locatedFix ? (
            <p className="small-meta">
              {locatedFix.placeLabel}
              <br />
              {coordinateLabel(locatedFix.latitude, locatedFix.longitude)}
            </p>
          ) : locateState === 'unavailable' ? (
            <>
              <p className="small-meta error">No reception</p>
              {locateHint ? <p className="small-meta">{locateHint}</p> : null}
            </>
          ) : (
            <p className="small-meta">Tap Locate to confirm position.</p>
          )}
        </div>

        <label className="field">
          Note (optional)
          <textarea
            rows={3}
            value={note}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Example: level B2, yellow elevator, section C"
          />
        </label>

        <div className="field">
          <span>Photos (optional, {photoSlots.filter(Boolean).length}/3)</span>
          <div className="capture-grid">
            {photoSlots.map((file, index) => {
              const inputId = `park-photo-slot-${index + 1}`;
              return (
                <div className="capture-slot" key={inputId}>
                  <input
                    id={inputId}
                    ref={(element) => {
                      photoInputRefs.current[index] = element;
                    }}
                    aria-label={`Capture photo ${index + 1}`}
                    className="capture-input-hidden"
                    type="file"
                    accept="image/*"
                    onInput={(event) => {
                      setPhotoSlotFromFileList(index, (event.currentTarget as HTMLInputElement).files);
                    }}
                    onChange={(event) => {
                      setPhotoSlotFromFileList(index, event.currentTarget.files);
                    }}
                  />
                  <div className={`capture-picker${file ? ' has-photo' : ''}`}>
                    {file ? (
                      <button
                        className="capture-thumb-button"
                        type="button"
                        onClick={() => {
                          const src = previewUrls[index];
                          if (!src) {
                            return;
                          }
                          setExpandedPhoto({
                            src,
                            alt: `Selected parking photo ${index + 1}`
                          });
                        }}
                      >
                        <div className="capture-thumb">
                          <img
                            className="capture-thumb-image"
                            src={previewUrls[index]}
                            alt={`Selected parking photo ${index + 1}`}
                          />
                        </div>
                      </button>
                    ) : (
                      <button
                        className="btn secondary capture-cta"
                        type="button"
                        onClick={() => {
                          openCaptureForSlot(index);
                        }}
                      >
                        Capture photo {index + 1}
                      </button>
                    )}
                  </div>
                  {file ? (
                    <div className="button-row">
                      <button
                        className="btn secondary tiny"
                        type="button"
                        onClick={() => {
                          openCaptureForSlot(index);
                        }}
                      >
                        Retake
                      </button>
                      <button
                        className="btn secondary tiny"
                        type="button"
                        onClick={() => {
                          const input = photoInputRefs.current[index];
                          if (input) {
                            input.value = '';
                          }
                          setPhotoSlots((previous) =>
                            previous.map((entry, entryIndex) => (entryIndex === index ? null : entry))
                          );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <button
          className="btn"
          type="button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void (async () => {
              try {
                let location = locatedFix;
                if (!location) {
                  location = await runLocate();
                }
                const hasEvidence = Boolean(note.trim()) || photoSlots.some((file) => Boolean(file));
                if (!location) {
                  if (!hasEvidence) {
                    if (!window.isSecureContext) {
                      throw new Error(
                        'Locate requires HTTPS on most mobile browsers. Add a note/photo or open this app via HTTPS and retry.'
                      );
                    }
                    throw new Error('Add a location, note, or photo before saving.');
                  }
                }

                const photos = await Promise.all(
                  photoSlots
                    .filter((file): file is File => Boolean(file))
                    .map(async (file, index) => ({
                      id: `photo-${index + 1}`,
                      name: file.name || `parking-photo-${index + 1}.jpg`,
                      type: file.type || 'image/jpeg',
                      data_url: await fileToDataUrl(file)
                    }))
                );
                const now = new Date().toISOString();
                onStartParking({
                  started_at: now,
                  latitude: location ? location.latitude : null,
                  longitude: location ? location.longitude : null,
                  location_label: location ? location.placeLabel : null,
                  note: note.trim() || null,
                  photos
                });
                setNote('');
                setPhotoSlots([null, null, null]);
                setLocatedFix(null);
                setLocateState('idle');
              } catch (error) {
                onError((error as Error).message);
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          {saving ? 'Saving...' : 'Park Here Now'}
        </button>
      </div>

      {cameraSlotIndex !== null ? (
        <div className="otp-modal-backdrop camera-modal-backdrop" role="dialog" aria-modal="true" aria-label="Capture parking photo">
          <section className="panel camera-modal">
            <h2>Capture photo {cameraSlotIndex + 1}</h2>
            <p className="muted">Keep the camera steady and use Capture. You can also upload from gallery.</p>
            <div className="camera-preview-frame">
              <video ref={cameraVideoRef} className="camera-preview" autoPlay muted playsInline />
            </div>
            {cameraError ? <p className="error">{cameraError}</p> : null}
            <div className="button-row">
              <button
                className="btn"
                type="button"
                disabled={cameraBusy || !cameraReady}
                onClick={() => {
                  capturePhotoFromPreview();
                }}
              >
                {cameraBusy ? 'Processing...' : 'Capture'}
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={cameraBusy}
                onClick={() => {
                  openGalleryPicker(cameraSlotIndex);
                }}
              >
                Use gallery
              </button>
              <button className="btn secondary" type="button" disabled={cameraBusy} onClick={closeCameraModal}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <PhotoLightbox
        photo={expandedPhoto}
        onClose={() => {
          setExpandedPhoto(null);
        }}
      />
    </>
  );
}

function PhotoLightbox({
  photo,
  onClose
}: {
  photo: ExpandedPhoto | null;
  onClose: () => void;
}): JSX.Element | null {
  useEffect(() => {
    if (!photo) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [photo, onClose]);

  if (!photo) {
    return null;
  }

  return (
    <div
      className="otp-modal-backdrop photo-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      onClick={onClose}
    >
      <section
        className="panel photo-lightbox"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="photo-lightbox-header">
          <h2>Photo preview</h2>
          <button className="btn secondary tiny" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <img className="photo-lightbox-image" src={photo.src} alt={`${photo.alt} (full size)`} />
      </section>
    </div>
  );
}

function ActiveParkingCard({
  parking,
  onEndParking,
  onError
}: {
  parking: ActiveParkingSession;
  onEndParking: () => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [clockMs, setClockMs] = useState(Date.now());
  const [expandedPhoto, setExpandedPhoto] = useState<ExpandedPhoto | null>(null);
  const hasLocation = parking.latitude !== null && parking.longitude !== null;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockMs(Date.now());
    }, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="stack">
      <div className="parking-session-metrics" aria-label="Parking session timing">
        <span className="parking-session-label">Started:</span>
        <span className="parking-session-value">{formatDateTime(parking.started_at)}</span>
        <span className="parking-session-label">Active:</span>
        <strong className="parking-session-value parking-session-active">
          {formatActiveDuration(parking.started_at, clockMs)}
        </strong>
      </div>

      {hasLocation ? (
        <>
          <p className="muted history-location parking-active-location">{parking.location_label}</p>
          <iframe
            className="detail-map-frame"
            src={openStreetMapEmbedUrl(parking.latitude as number, parking.longitude as number)}
            title="OpenStreetMap preview of parked location"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </>
      ) : (
        <p className="small-meta">Location unavailable for this active parking session.</p>
      )}

      {parking.note ? (
        <div className="stack">
          <h4 className="section-heading">More details</h4>
          <p className="note record-note">{parking.note}</p>
        </div>
      ) : null}

      {parking.photos.length > 0 ? (
        <div className="photo-grid">
          {parking.photos.map((photo) => (
            <button
              key={photo.id}
              className="photo-thumb-button"
              type="button"
              onClick={() => {
                setExpandedPhoto({
                  src: photo.data_url,
                  alt: 'Parking photo evidence'
                });
              }}
            >
              <img className="photo-thumb" src={photo.data_url} alt="Parking photo evidence" />
            </button>
          ))}
        </div>
      ) : null}

      {hasLocation ? (
        <>
          <h4 className="section-heading">Take me there</h4>
          <div className="button-row">
            <a
              className="btn"
              href={googleMapsDirectionsUrl(parking.latitude as number, parking.longitude as number)}
              target="_blank"
              rel="noreferrer"
            >
              Google Maps
            </a>
            <a
              className="btn secondary"
              href={openStreetMapUrl(parking.latitude as number, parking.longitude as number)}
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap
            </a>
          </div>
        </>
      ) : null}

      <h4 className="section-heading">Actions</h4>
      {!confirmEnd ? (
        <button className="btn danger" type="button" disabled={ending} onClick={() => setConfirmEnd(true)}>
          End parking
        </button>
      ) : (
        <section className="end-parking-confirm" role="alertdialog" aria-label="End parking confirmation">
          <p className="muted">Really end parking?</p>
          <div className="button-row">
            <button
              className="btn danger"
              type="button"
              disabled={ending}
              onClick={() => {
                setEnding(true);
                void (async () => {
                  try {
                    await onEndParking();
                  } catch (error) {
                    onError((error as Error).message);
                  } finally {
                    setEnding(false);
                    setConfirmEnd(false);
                  }
                })();
              }}
            >
              {ending ? 'Ending...' : 'Yes, end parking'}
            </button>
            <button className="btn secondary" type="button" disabled={ending} onClick={() => setConfirmEnd(false)}>
              No
            </button>
          </div>
        </section>
      )}

      <PhotoLightbox
        photo={expandedPhoto}
        onClose={() => {
          setExpandedPhoto(null);
        }}
      />
    </div>
  );
}

function HistoryCard({
  token,
  records,
  onUpdated,
  onError
}: {
  token: string;
  records: ParkingRecord[];
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  if (records.length === 0) {
    return <p className="muted">No parking records yet.</p>;
  }

  return (
    <div className="history-list">
      {records.map((record) => (
        <RecordCard
          key={record.id}
          record={record}
          token={token}
          onError={onError}
          onDelete={async () => {
            await api.deleteRecord(token, record.id);
            await onUpdated();
            onError('Record deleted.');
          }}
        />
      ))}
    </div>
  );
}

function RecordCard({
  record,
  token,
  onError,
  onDelete
}: {
  record: ParkingRecord;
  token: string;
  onError: (message: string) => void;
  onDelete: () => Promise<void>;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<ExpandedPhoto | null>(null);
  const hasLocation = record.latitude !== null && record.longitude !== null;
  const locationSummary = recordLocationSummary(record);

  return (
    <article className="history-item">
      <div className="history-header">
        <strong className="history-time">{formatDateTime(record.parked_at)}</strong>
      </div>
      <p className="muted history-location">{locationSummary}</p>

      {expanded ? (
        <div className="record-details stack">
          {hasLocation ? (
            <>
              <iframe
                className="detail-map-frame"
                src={openStreetMapEmbedUrl(record.latitude as number, record.longitude as number)}
                title="OpenStreetMap preview of parked location"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </>
          ) : (
            <p className="small-meta detail-location">Location unavailable for this record.</p>
          )}

          <h4 className="section-heading">More details</h4>
          {record.note ? <p className="note record-note">{record.note}</p> : <p className="muted record-note-empty">No note saved.</p>}

          {record.photos.length > 0 ? (
            <div className="photo-grid">
              {record.photos.map((photo) => (
                <ProtectedImage
                  key={photo.id}
                  token={token}
                  path={photo.download_url}
                  alt="Parking photo evidence"
                  onPreview={(src, alt) => {
                    setExpandedPhoto({ src, alt });
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="small-meta">No photos saved.</p>
          )}

          {hasLocation ? (
            <>
              <h4 className="section-heading">Take me there</h4>
              <div className="button-row">
                <a
                  className="btn"
                  href={googleMapsDirectionsUrl(record.latitude as number, record.longitude as number)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Maps
                </a>
                <a
                  className="btn secondary"
                  href={openStreetMapUrl(record.latitude as number, record.longitude as number)}
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenStreetMap
                </a>
              </div>
            </>
          ) : null}

          <h4 className="section-heading">Actions</h4>
          <div className="button-row">
            <button className="btn secondary" type="button" onClick={() => setExpanded(false)}>
              Close
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    await onDelete();
                  } catch (error) {
                    onError((error as Error).message);
                  }
                })();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="button-row">
          <button className="btn secondary" type="button" onClick={() => setExpanded(true)}>
            More info
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await onDelete();
                } catch (error) {
                  onError((error as Error).message);
                }
              })();
            }}
          >
            Delete
          </button>
        </div>
      )}

      <PhotoLightbox
        photo={expandedPhoto}
        onClose={() => {
          setExpandedPhoto(null);
        }}
      />
    </article>
  );
}

function ProfileCard({
  token,
  user,
  themeMode,
  onThemeModeChange,
  accentColor,
  onAccentColorChange,
  onRefreshUser,
  onError
}: {
  token: string;
  user: User;
  themeMode: ThemeMode;
  onThemeModeChange: (theme: ThemeMode) => void;
  accentColor: AccentColor;
  onAccentColorChange: (accentColor: AccentColor) => void;
  onRefreshUser: () => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <div className="stack">
      <h3 className="section-heading">Change password</h3>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              if (newPassword !== confirmPassword) {
                throw new Error('New password and confirmation do not match.');
              }

              await api.changePassword(token, currentPassword, newPassword);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              onError('Password changed successfully.');
            } catch (error) {
              onError((error as Error).message);
            }
          })();
        }}
      >
        <label className="field">
          Current password
          <input
            type="password"
            required
            minLength={1}
            maxLength={128}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>

        <label className="field">
          New password
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            pattern={PASSWORD_POLICY_PATTERN}
            title={PASSWORD_POLICY_HINT}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>

        <label className="field">
          Confirm new password
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            pattern={PASSWORD_POLICY_PATTERN}
            title={PASSWORD_POLICY_HINT}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        <button className="btn" type="submit">Change password</button>
      </form>

      <h3 className="section-heading">Theme</h3>
      <label className="field compact-field">
        Appearance
        <select value={themeMode} onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <div className="field">
        <span>Accent color</span>
        <div className="accent-options" role="radiogroup" aria-label="Accent color">
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`accent-option${accentColor === option.id ? ' active' : ''}`}
              type="button"
              role="radio"
              aria-checked={accentColor === option.id}
              aria-label={option.label}
              onClick={() => onAccentColorChange(option.id)}
            >
              <span className="accent-swatch" style={{ backgroundColor: option.swatch }} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <h3 className="section-heading">MFA</h3>
      <MfaCard token={token} user={user} onRefreshUser={onRefreshUser} onError={onError} />
    </div>
  );
}

function MfaCard({
  token,
  user,
  onRefreshUser,
  onError
}: {
  token: string;
  user: User;
  onRefreshUser: () => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    let active = true;

    if (!setupData) {
      setQrCodeDataUrl('');
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        const dataUrl = await QRCode.toDataURL(setupData.otpauth_url, {
          width: 220,
          margin: 1
        });
        if (active) {
          setQrCodeDataUrl(dataUrl);
        }
      } catch {
        if (active) {
          setQrCodeDataUrl('');
          onError('Could not generate MFA QR code. You can still use the secret or URI manually.');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [setupData, onError]);

  return (
    <div className="stack">
      <p className="muted">
        {user.mfa_enabled
          ? 'MFA is enabled. Disable requires a valid OTP code.'
          : 'Enable MFA with any authenticator app that supports TOTP.'}
      </p>

      {!user.mfa_enabled && !setupData ? (
        <button
          className="btn"
          type="button"
          onClick={() => {
            void (async () => {
              try {
                const setup = await api.setupMfa(token);
                setSetupData(setup);
              } catch (error) {
                onError((error as Error).message);
              }
            })();
          }}
        >
          Start MFA setup
        </button>
      ) : null}

      {setupData ? (
        <div className="stack">
          {qrCodeDataUrl ? (
            <div className="mfa-qr-frame">
              <img className="mfa-qr-image" src={qrCodeDataUrl} alt="MFA setup QR code" />
            </div>
          ) : (
            <p className="small-meta">Generating MFA QR code...</p>
          )}
          <p className="note">
            Secret: <code>{setupData.secret}</code>
          </p>
          <p className="muted">Paste this URI in your authenticator if QR import is unavailable:</p>
          <code className="code-wrap">{setupData.otpauth_url}</code>
          <label className="field">
            Enter OTP to verify
            <input
              value={code}
              onChange={(event) => setCode(normalizeOtpInput(event.target.value))}
              inputMode="numeric"
              pattern="[0-9]{6,8}"
              minLength={6}
              maxLength={8}
            />
          </label>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await api.verifyMfa(token, code);
                  setSetupData(null);
                  setCode('');
                  await onRefreshUser();
                  onError('MFA enabled.');
                } catch (error) {
                  onError((error as Error).message);
                }
              })();
            }}
          >
            Verify and enable MFA
          </button>
        </div>
      ) : null}

      {user.mfa_enabled ? (
        <div className="stack">
          <label className="field">
            OTP code to disable
            <input
              value={code}
              onChange={(event) => setCode(normalizeOtpInput(event.target.value))}
              inputMode="numeric"
              pattern="[0-9]{6,8}"
              minLength={6}
              maxLength={8}
            />
          </label>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await api.disableMfa(token, code);
                  setCode('');
                  await onRefreshUser();
                  onError('MFA disabled.');
                } catch (error) {
                  onError((error as Error).message);
                }
              })();
            }}
          >
            Disable MFA
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AdminUsersCard({
  token,
  currentUser,
  users,
  onUpdated,
  onError
}: {
  token: string;
  currentUser: User;
  users: User[];
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState('');

  const openEditModal = (entry: User): void => {
    setEditingUser(entry);
    setEditPassword('');
    setEditIsAdmin(entry.is_admin);
    setEditError('');
  };

  const closeEditModal = (): void => {
    setEditingUser(null);
    setEditPassword('');
    setEditError('');
    setSavingEdit(false);
  };

  return (
    <div className="stack">
      <h3 className="section-heading">Add users</h3>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              await api.createUser(token, normalizeUsernameInput(username), password, isAdmin);
              setUsername('');
              setPassword('');
              setIsAdmin(false);
              await onUpdated();
              onError('User created.');
            } catch (error) {
              onError((error as Error).message);
            }
          })();
        }}
      >
        <label className="field">
          New username
          <input
            required
            minLength={3}
            maxLength={64}
            pattern={USERNAME_PATTERN}
            title="Use 3-64 chars: letters, numbers, '.', '_' or '-'"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="field">
          Temp password
          <input
            required
            type="password"
            minLength={8}
            maxLength={128}
            pattern={PASSWORD_POLICY_PATTERN}
            title={PASSWORD_POLICY_HINT}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
          Grant admin access
        </label>

        <button className="btn" type="submit">Create user</button>
      </form>

      <h3 className="section-heading">Edit users</h3>
      <div className="user-list">
        {users.map((entry) => (
          <div className="user-row admin-user-row" key={entry.id}>
            <div className="stack admin-user-meta">
              <strong>
                {entry.username}
                {entry.id === currentUser.id ? ' (you)' : ''}
              </strong>
              <span className="muted">
                {entry.is_admin ? 'admin' : 'user'} | MFA {entry.mfa_enabled ? 'on' : 'off'}
              </span>
            </div>
            {entry.id === currentUser.id ? (
              <span className="small-meta">Current account</span>
            ) : (
              <div className="admin-user-actions">
                <button className="btn secondary tiny" type="button" onClick={() => openEditModal(entry)}>
                  Edit
                </button>
                <button
                  className="btn danger tiny"
                  type="button"
                  disabled={deletingUserId === entry.id}
                  onClick={() => {
                    if (!window.confirm(`Delete user "${entry.username}"?`)) {
                      return;
                    }
                    setDeletingUserId(entry.id);
                    void (async () => {
                      try {
                        await api.deleteUser(token, entry.id);
                        await onUpdated();
                        onError('User deleted.');
                      } catch (error) {
                        onError((error as Error).message);
                      } finally {
                        setDeletingUserId('');
                      }
                    })();
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingUser ? (
        <div className="otp-modal-backdrop">
          <section
            className="panel admin-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-modal-title"
          >
            <h3 id="edit-user-modal-title">Edit user</h3>
            <p className="small-meta">Editing: {editingUser.username}</p>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  if (!editingUser) {
                    return;
                  }
                  setSavingEdit(true);
                  setEditError('');
                  try {
                    const payload: { password?: string; is_admin?: boolean } = {};
                    const trimmedPassword = editPassword.trim();
                    if (trimmedPassword) {
                      payload.password = trimmedPassword;
                    }
                    if (editIsAdmin !== editingUser.is_admin) {
                      payload.is_admin = editIsAdmin;
                    }
                    if (!payload.password && payload.is_admin === undefined) {
                      throw new Error('Make a role change and/or enter a reset password.');
                    }

                    await api.updateUser(token, editingUser.id, payload);
                    closeEditModal();
                    await onUpdated();
                    onError('User updated.');
                  } catch (error) {
                    setEditError((error as Error).message);
                  } finally {
                    setSavingEdit(false);
                  }
                })();
              }}
            >
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={(event) => setEditIsAdmin(event.target.checked)}
                />
                Grant admin access
              </label>

              <label className="field">
                Reset password (optional)
                <input
                  type="password"
                  minLength={8}
                  maxLength={128}
                  pattern={PASSWORD_POLICY_PATTERN}
                  title={PASSWORD_POLICY_HINT}
                  autoComplete="new-password"
                  value={editPassword}
                  onChange={(event) => setEditPassword(event.target.value)}
                  placeholder="Leave blank to keep current password"
                />
              </label>

              <div className="button-row">
                <button className="btn" type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save changes'}
                </button>
                <button className="btn secondary" type="button" disabled={savingEdit} onClick={closeEditModal}>
                  Cancel
                </button>
              </div>
            </form>

            {editError ? <p className="error">{editError}</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
