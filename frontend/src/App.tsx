import { useEffect, useMemo, useState } from 'react';

import { api } from './api';
import { ProtectedImage } from './ProtectedImage';
import type { ParkingRecord, SystemStatus, ThemeMode, User } from './types';

const TOKEN_KEY = 'fmr_access_token';
const THEME_KEY = 'fmr_theme_mode';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

function openStreetMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
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

function App(): JSX.Element {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [token, setToken] = useState<string>(localStorage.getItem(TOKEN_KEY) || '');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [latestRecord, setLatestRecord] = useState<ParkingRecord | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [scope, setScope] = useState<'me' | 'all' | string>('me');

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });

  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

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

    void (async () => {
      try {
        const status = await api.systemStatus();
        if (active) {
          setSystemStatus(status);
        }
      } catch (error) {
        if (active) {
          setMessage((error as Error).message);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolved = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
      document.documentElement.setAttribute('data-theme', resolved);
      localStorage.setItem(THEME_KEY, themeMode);
    };

    applyTheme();
    media.addEventListener('change', applyTheme);

    return () => {
      media.removeEventListener('change', applyTheme);
    };
  }, [themeMode]);

  useEffect(() => {
    let active = true;

    if (!token) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    void (async () => {
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

    void refreshData(token, currentUser, ownerIdForQuery, setRecords, setLatestRecord, setUsers, setMessage);
  }, [token, currentUser, ownerIdForQuery]);

  const handleAuthSuccess = (nextToken: string, user: User): void => {
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
    setMessage('');
  };

  const handleLogout = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setCurrentUser(null);
    setRecords([]);
    setLatestRecord(null);
    setUsers([]);
    setScope('me');
  };

  if (!systemStatus) {
    return <div className="screen-center">Loading system status...</div>;
  }

  if (loading) {
    return <div className="screen-center">Loading...</div>;
  }

  if (!systemStatus.has_users) {
    return (
      <div className="shell auth-shell">
        <Header themeMode={themeMode} onThemeModeChange={setThemeMode} />
        <BootstrapCard
          onBootstrap={handleAuthSuccess}
          onError={setMessage}
          message={message}
        />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="shell auth-shell">
        <Header themeMode={themeMode} onThemeModeChange={setThemeMode} />
        <LoginCard
          allowRegistration={systemStatus.allow_self_register}
          onLogin={handleAuthSuccess}
          onError={setMessage}
          message={message}
        />
      </div>
    );
  }

  return (
    <div className="shell">
      <Header themeMode={themeMode} onThemeModeChange={setThemeMode} />

      <main className="layout">
        <section className="panel panel-wide">
          <div className="panel-title-row">
            <h1>find-my-ride</h1>
            <div className="small-meta">
              Signed in as <strong>{currentUser.username}</strong>
              {currentUser.is_admin ? ' (admin)' : ''}
            </div>
          </div>

          <ParkNowCard
            token={token}
            onParked={async () => {
              await refreshData(token, currentUser, ownerIdForQuery, setRecords, setLatestRecord, setUsers, setMessage);
            }}
            onError={setMessage}
          />
        </section>

        <section className="panel">
          <div className="panel-title-row">
            <h2>Last parked</h2>
            <button className="btn secondary" onClick={handleLogout}>Sign out</button>
          </div>
          <LatestRecordCard record={latestRecord} token={token} />
        </section>

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
              await refreshData(token, currentUser, ownerIdForQuery, setRecords, setLatestRecord, setUsers, setMessage);
            }}
            onError={setMessage}
          />
        </section>

        <section className="panel">
          <h2>Security</h2>
          <MfaCard
            token={token}
            user={currentUser}
            onRefreshUser={async () => {
              const me = await api.me(token);
              setCurrentUser(me);
            }}
            onError={setMessage}
          />
        </section>

        {currentUser.is_admin && (
          <section className="panel">
            <h2>Admin users</h2>
            <AdminUsersCard
              token={token}
              users={users}
              onUpdated={async () => {
                await refreshData(token, currentUser, ownerIdForQuery, setRecords, setLatestRecord, setUsers, setMessage);
              }}
              onError={setMessage}
            />
          </section>
        )}
      </main>

      {message ? <div className="toast">{message}</div> : null}
    </div>
  );
}

async function refreshData(
  token: string,
  user: User,
  ownerIdForQuery: string | undefined,
  setRecords: (records: ParkingRecord[]) => void,
  setLatestRecord: (record: ParkingRecord | null) => void,
  setUsers: (users: User[]) => void,
  setMessage: (message: string) => void
): Promise<void> {
  try {
    const [records, latest] = await Promise.all([
      api.listRecords(token, ownerIdForQuery),
      api.latestRecord(token, ownerIdForQuery)
    ]);

    setRecords(records);
    setLatestRecord(latest);

    if (user.is_admin) {
      const users = await api.listUsers(token);
      setUsers(users);
    }
  } catch (error) {
    setMessage((error as Error).message);
  }
}

function Header({
  themeMode,
  onThemeModeChange
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}): JSX.Element {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-dot" />
        <span>find-my-ride</span>
      </div>

      <label className="inline-field compact">
        Theme
        <select
          value={themeMode}
          onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </header>
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
              const auth = await api.bootstrapAdmin(username, password);
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
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="field">
          Password (12+ chars)
          <input
            type="password"
            required
            minLength={12}
            maxLength={128}
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
  allowRegistration,
  onLogin,
  onError,
  message
}: {
  allowRegistration: boolean;
  onLogin: (token: string, user: User) => void;
  onError: (message: string) => void;
  message: string;
}): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <section className="panel auth-card">
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              if (mode === 'login') {
                const auth = await api.login(username, password, otpCode || undefined);
                onLogin(auth.access_token, auth.user);
              } else {
                const auth = await api.register(username, password);
                onLogin(auth.access_token, auth.user);
              }
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
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="field">
          Password
          <input
            type="password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {mode === 'login' ? (
          <label className="field">
            OTP code (if MFA enabled)
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
            />
          </label>
        ) : null}

        <button className="btn" type="submit">{mode === 'login' ? 'Sign in' : 'Register'}</button>
      </form>

      {allowRegistration ? (
        <button
          className="btn secondary"
          onClick={() => setMode((previous) => (previous === 'login' ? 'register' : 'login'))}
          type="button"
        >
          {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
        </button>
      ) : (
        <p className="muted">Account creation is handled by an administrator.</p>
      )}

      {message ? <p className="error">{message}</p> : null}
    </section>
  );
}

function ParkNowCard({
  token,
  onParked,
  onError
}: {
  token: string;
  onParked: () => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="stack">
      <p className="muted">
        One tap captures time/date and your current location. Add note and up to 3 photos for garage level markers.
      </p>

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

      <label className="field">
        Photos (optional, max 3)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files || []);
            setFiles(selected.slice(0, 3));
          }}
        />
      </label>

      <div className="grid-2">
        <label className="field">
          Manual latitude (fallback)
          <input
            inputMode="decimal"
            placeholder="Only needed if GPS fails"
            value={manualLatitude}
            onChange={(event) => setManualLatitude(event.target.value)}
          />
        </label>
        <label className="field">
          Manual longitude (fallback)
          <input
            inputMode="decimal"
            placeholder="Only needed if GPS fails"
            value={manualLongitude}
            onChange={(event) => setManualLongitude(event.target.value)}
          />
        </label>
      </div>

      <button
        className="btn"
        type="button"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void (async () => {
            try {
              let location: { latitude: number; longitude: number };
              try {
                location = await geolocate();
              } catch {
                const fallbackLat = Number(manualLatitude);
                const fallbackLng = Number(manualLongitude);
                if (Number.isNaN(fallbackLat) || Number.isNaN(fallbackLng)) {
                  throw new Error(
                    'Location failed. Add manual latitude/longitude as fallback, then retry.'
                  );
                }
                location = { latitude: fallbackLat, longitude: fallbackLng };
              }

              const formData = new FormData();
              formData.append('latitude', String(location.latitude));
              formData.append('longitude', String(location.longitude));
              if (note.trim()) {
                formData.append('note', note.trim());
              }
              formData.append('parked_at', new Date().toISOString());
              files.slice(0, 3).forEach((file) => formData.append('photos', file));

              await api.createRecord(token, formData);
              setNote('');
              setFiles([]);
              setManualLatitude('');
              setManualLongitude('');
              await onParked();
              onError('Parking location saved.');
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
  );
}

function LatestRecordCard({ record, token }: { record: ParkingRecord | null; token: string }): JSX.Element {
  if (!record) {
    return <p className="muted">No records yet. Save a parking spot to get started.</p>;
  }

  return (
    <div className="stack">
      <div className="metric-grid">
        <div>
          <span className="metric-label">Time</span>
          <strong>{formatDateTime(record.parked_at)}</strong>
        </div>
        <div>
          <span className="metric-label">Latitude</span>
          <strong>{record.latitude.toFixed(6)}</strong>
        </div>
        <div>
          <span className="metric-label">Longitude</span>
          <strong>{record.longitude.toFixed(6)}</strong>
        </div>
      </div>

      {record.note ? <p className="note">{record.note}</p> : <p className="muted">No note saved.</p>}

      {record.photos.length > 0 ? (
        <div className="photo-grid">
          {record.photos.map((photo) => (
            <ProtectedImage key={photo.id} token={token} path={photo.download_url} alt="Parking context" />
          ))}
        </div>
      ) : null}

      <div className="button-row">
        <a className="btn" href={googleMapsDirectionsUrl(record.latitude, record.longitude)} target="_blank" rel="noreferrer">
          Walk with Google Maps
        </a>
        <a className="btn secondary" href={openStreetMapUrl(record.latitude, record.longitude)} target="_blank" rel="noreferrer">
          Open in OpenStreetMap
        </a>
      </div>
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
  const [editingId, setEditingId] = useState<string>('');
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [latDraft, setLatDraft] = useState<string>('');
  const [lngDraft, setLngDraft] = useState<string>('');
  const [timeDraft, setTimeDraft] = useState<string>('');

  if (records.length === 0) {
    return <p className="muted">No parking records yet.</p>;
  }

  const startEdit = (record: ParkingRecord): void => {
    setEditingId(record.id);
    setNoteDraft(record.note || '');
    setLatDraft(String(record.latitude));
    setLngDraft(String(record.longitude));
    setTimeDraft(new Date(record.parked_at).toISOString().slice(0, 16));
  };

  return (
    <div className="history-list">
      {records.map((record) => (
        <article className="history-item" key={record.id}>
          <div className="history-header">
            <strong>{formatDateTime(record.parked_at)}</strong>
            <span className="muted">
              {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}
            </span>
          </div>

          {editingId === record.id ? (
            <div className="stack">
              <label className="field">
                Note
                <textarea
                  rows={2}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                />
              </label>

              <div className="grid-2">
                <label className="field">
                  Latitude
                  <input value={latDraft} onChange={(event) => setLatDraft(event.target.value)} />
                </label>

                <label className="field">
                  Longitude
                  <input value={lngDraft} onChange={(event) => setLngDraft(event.target.value)} />
                </label>
              </div>

              <label className="field">
                Parked at
                <input
                  type="datetime-local"
                  value={timeDraft}
                  onChange={(event) => setTimeDraft(event.target.value)}
                />
              </label>

              <div className="button-row">
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        const maybeDate = new Date(timeDraft);
                        if (Number.isNaN(maybeDate.getTime())) {
                          throw new Error('Please provide a valid date/time value.');
                        }

                        await api.updateRecord(token, record.id, {
                          note: noteDraft.trim() || null,
                          latitude: Number(latDraft),
                          longitude: Number(lngDraft),
                          parked_at: maybeDate.toISOString()
                        });
                        setEditingId('');
                        await onUpdated();
                        onError('Record updated.');
                      } catch (error) {
                        onError((error as Error).message);
                      }
                    })();
                  }}
                >
                  Save
                </button>
                <button className="btn secondary" type="button" onClick={() => setEditingId('')}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {record.note ? <p className="note">{record.note}</p> : <p className="muted">No note.</p>}
              {record.photos.length > 0 ? (
                <div className="photo-grid">
                  {record.photos.map((photo) => (
                    <div className="photo-frame" key={photo.id}>
                      <ProtectedImage token={token} path={photo.download_url} alt="Parking evidence" />
                      <button
                        className="btn tiny danger"
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              await api.deletePhoto(token, photo.id);
                              await onUpdated();
                              onError('Photo removed.');
                            } catch (error) {
                              onError((error as Error).message);
                            }
                          })();
                        }}
                      >
                        Remove photo
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {record.photos.length < 3 ? (
                <label className="field compact-field">
                  Add photos
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    multiple
                    onChange={(event) => {
                      const selected = Array.from(event.target.files || []);
                      if (!selected.length) {
                        return;
                      }
                      const remaining = 3 - record.photos.length;
                      void (async () => {
                        try {
                          await api.addPhotos(token, record.id, selected.slice(0, remaining));
                          await onUpdated();
                          onError('Photos added.');
                          event.currentTarget.value = '';
                        } catch (error) {
                          onError((error as Error).message);
                        }
                      })();
                    }}
                  />
                </label>
              ) : null}

              <div className="button-row">
                <button className="btn secondary" type="button" onClick={() => startEdit(record)}>
                  Edit
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        await api.deleteRecord(token, record.id);
                        await onUpdated();
                        onError('Record deleted.');
                      } catch (error) {
                        onError((error as Error).message);
                      }
                    })();
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </article>
      ))}
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
  const [code, setCode] = useState('');

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
          <p className="note">Secret: <code>{setupData.secret}</code></p>
          <p className="muted">Paste this URI in your authenticator if QR import is unavailable:</p>
          <code className="code-wrap">{setupData.otpauth_url}</code>
          <label className="field">
            Enter OTP to verify
            <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
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
            <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
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
  users,
  onUpdated,
  onError
}: {
  token: string;
  users: User[];
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  return (
    <div className="stack">
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              await api.createUser(token, username, password, isAdmin);
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
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="field">
          Temp password
          <input
            required
            type="password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(event) => setIsAdmin(event.target.checked)}
          />
          Grant admin access
        </label>

        <button className="btn" type="submit">Create user</button>
      </form>

      <div className="user-list">
        {users.map((user) => (
          <div className="user-row" key={user.id}>
            <strong>{user.username}</strong>
            <span className="muted">
              {user.is_admin ? 'admin' : 'user'} | MFA {user.mfa_enabled ? 'on' : 'off'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
