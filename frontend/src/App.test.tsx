import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const apiMock = vi.hoisted(() => ({
  configureAuthSession: vi.fn(),
  systemStatus: vi.fn(),
  bootstrapAdmin: vi.fn(),
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  changePassword: vi.fn(),
  setupMfa: vi.fn(),
  verifyMfa: vi.fn(),
  disableMfa: vi.fn(),
  listRecords: vi.fn(),
  latestRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  addPhotos: vi.fn(),
  deletePhoto: vi.fn(),
  deleteRecord: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn()
}));

const qrcodeMock = vi.hoisted(() => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,mock-mfa-qr')
}));

const DEFAULT_USER_AGENT = window.navigator.userAgent;

vi.mock('./api', () => ({
  api: apiMock,
  toAbsoluteApiPath: (path: string) => path
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: qrcodeMock.toDataURL
  }
}));

function mockGeolocationSuccess(latitude: number, longitude: number): void {
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (onSuccess: PositionCallback) => {
        onSuccess({ coords: { latitude, longitude } } as GeolocationPosition);
      }
    }
  });
}

function mockGeolocationFailure(message = 'No signal'): void {
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (_onSuccess: PositionCallback, onError: PositionErrorCallback) => {
        onError({ message } as GeolocationPositionError);
      }
    }
  });
}

function setSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value
  });
}

function setUserAgent(value: string): void {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value
  });
}

function setMediaDevices(
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
): void {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: getUserMedia ? { getUserMedia } : undefined
  });
}

function seedAuthenticatedSession(isAdmin: boolean): void {
  localStorage.setItem('fmr_access_token', 'token-123');

  apiMock.systemStatus.mockResolvedValue({ has_users: true, allow_self_register: false });
  apiMock.me.mockResolvedValue({
    id: isAdmin ? 'admin-id' : 'user-id',
    username: isAdmin ? 'admin' : 'driver',
    is_admin: isAdmin,
    mfa_enabled: false,
    created_at: new Date().toISOString()
  });
  apiMock.listRecords.mockResolvedValue([]);
  apiMock.latestRecord.mockResolvedValue(null);
  apiMock.listUsers.mockResolvedValue(
    isAdmin
      ? [
          {
            id: 'admin-id',
            username: 'admin',
            is_admin: true,
            mfa_enabled: false,
            created_at: new Date().toISOString()
          }
        ]
      : []
  );

  apiMock.changePassword.mockResolvedValue({ message: 'Password updated successfully' });
  apiMock.setupMfa.mockResolvedValue({
    secret: 'ABCDEF123456',
    otpauth_url: 'otpauth://totp/test?secret=ABCDEF123456'
  });
  apiMock.verifyMfa.mockResolvedValue({ mfa_enabled: true });
  apiMock.disableMfa.mockResolvedValue({ mfa_enabled: false });
}

function buildRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: 'record-1',
    owner_id: 'user-id',
    latitude: 40.7128,
    longitude: -74.006,
    location_label: 'Battery Park Garage, New York',
    note: 'Level B2 near west elevator',
    parked_at: now,
    created_at: now,
    updated_at: now,
    photos: [
      {
        id: 'photo-1',
        file_name: 'garage.jpg',
        content_type: 'image/jpeg',
        file_size: 1024,
        created_at: now,
        download_url: '/api/parking/photos/photo-1/download'
      }
    ],
    ...overrides
  };
}

describe('App tabs and settings', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(apiMock).forEach((mockFn) => {
      mockFn.mockReset();
    });
    apiMock.refresh.mockRejectedValue(new Error('Refresh token is missing'));
    apiMock.logout.mockResolvedValue({ message: 'Signed out' });
    qrcodeMock.toDataURL.mockReset();
    qrcodeMock.toDataURL.mockResolvedValue('data:image/png;base64,mock-mfa-qr');
    mockGeolocationSuccess(52.01, 4.31);
    setSecureContext(true);
    setUserAgent(DEFAULT_USER_AGENT);
    setMediaDevices(async () => ({
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream));
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 1280
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 720
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) => {
        callback(new Blob(['captured-image'], { type: 'image/jpeg' }));
      }
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D))
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows fixed tabs and switches between home, history, and settings', async () => {
    seedAuthenticatedSession(false);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Last parked' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'home' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'history' }));
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.queryByText('Scope')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings' }));
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();

    expect(screen.getByLabelText('Appearance')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Accent color' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('updates accent color live from settings profile and adapts to theme', async () => {
    seedAuthenticatedSession(false);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'settings' }));
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Cobalt' }));

    expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#1f4f8a');
    expect(document.documentElement.style.getPropertyValue('--ui-accent-strong')).toBe('#2f6db5');
    expect(localStorage.getItem('fmr_accent_color')).toBe('cobalt');

    fireEvent.change(screen.getByLabelText('Appearance'), { target: { value: 'dark' } });
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#2f6db5');
    });
    expect(document.documentElement.style.getPropertyValue('--ui-accent-strong')).toBe('#4b87cc');
  });

  it('applies the selected parked-car background asset on load', async () => {
    apiMock.systemStatus.mockResolvedValue({ has_users: false, allow_self_register: false });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Create first admin' })).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--app-background-image-url')).toContain(
      '/images/parking-background-option-3.jpg'
    );
  });

  it('shows auth mode buttons and allows self-registration from register mode', async () => {
    apiMock.systemStatus.mockResolvedValue({ has_users: true, allow_self_register: false });
    apiMock.register.mockResolvedValue({
      access_token: 'new-token',
      token_type: 'bearer',
      user: {
        id: 'new-user-id',
        username: 'newdriver',
        is_admin: false,
        mfa_enabled: false,
        created_at: new Date().toISOString()
      }
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Open user menu')).not.toBeInTheDocument();
    const authModeNav = screen.getByRole('navigation', { name: 'Authentication mode' });
    expect(within(authModeNav).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(authModeNav).getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByLabelText('OTP code')).not.toBeInTheDocument();

    fireEvent.click(within(authModeNav).getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('heading', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByLabelText('OTP code')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newdriver' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'RegisterPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register now' }));

    await waitFor(() => {
      expect(apiMock.register).toHaveBeenCalledWith('newdriver', 'RegisterPass123');
    });
  });

  it('prompts for OTP in a second modal when MFA is enabled for login', async () => {
    apiMock.systemStatus.mockResolvedValue({ has_users: true, allow_self_register: true });
    apiMock.login.mockImplementation(
      async (username: string, password: string, otpCode?: string): Promise<Record<string, unknown>> => {
        if (!otpCode) {
          throw new Error('MFA code required or invalid');
        }
        return {
          access_token: 'mfa-token',
          token_type: 'bearer',
          user: {
            id: 'driver-id',
            username,
            is_admin: false,
            mfa_enabled: true,
            created_at: new Date().toISOString()
          }
        };
      }
    );
    apiMock.me.mockResolvedValue({
      id: 'driver-id',
      username: 'driver',
      is_admin: false,
      mfa_enabled: true,
      created_at: new Date().toISOString()
    });
    apiMock.listRecords.mockResolvedValue([]);
    apiMock.latestRecord.mockResolvedValue(null);

    render(<App />);

    const signInHeading = await screen.findByRole('heading', { name: 'Sign in' });
    const authCard = signInHeading.closest('section');
    expect(authCard).not.toBeNull();
    const card = authCard as HTMLElement;

    fireEvent.change(within(card).getByLabelText('Username'), { target: { value: 'driver' } });
    fireEvent.change(within(card).getByLabelText('Password'), { target: { value: 'DriverPass123' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Sign in' }));

    const otpDialog = await screen.findByRole('dialog', { name: 'Enter OTP code' });
    fireEvent.change(within(otpDialog).getByLabelText('OTP code'), { target: { value: '123456' } });
    fireEvent.click(within(otpDialog).getByRole('button', { name: 'Verify and sign in' }));

    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();
    expect(apiMock.login.mock.calls[0]).toEqual(['driver', 'DriverPass123']);
    expect(apiMock.login.mock.calls[1]).toEqual(['driver', 'DriverPass123', '123456']);
  });

  it('refreshes session when stored access token is expired', async () => {
    localStorage.setItem('fmr_access_token', 'expired-token');
    apiMock.systemStatus.mockResolvedValue({ has_users: true, allow_self_register: true });
    apiMock.me
      .mockRejectedValueOnce(new Error('Invalid auth token'))
      .mockResolvedValueOnce({
        id: 'refreshed-user-id',
        username: 'driver',
        is_admin: false,
        mfa_enabled: false,
        created_at: new Date().toISOString()
      });
    apiMock.refresh.mockResolvedValue({
      access_token: 'refreshed-token',
      token_type: 'bearer',
      user: {
        id: 'refreshed-user-id',
        username: 'driver',
        is_admin: false,
        mfa_enabled: false,
        created_at: new Date().toISOString()
      }
    });
    apiMock.listRecords.mockResolvedValue([]);
    apiMock.latestRecord.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();
    expect(apiMock.refresh).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('fmr_access_token')).toBe('refreshed-token');
  });

  it('restores a session from refresh cookie when no access token is stored', async () => {
    apiMock.systemStatus.mockResolvedValue({ has_users: true, allow_self_register: true });
    apiMock.refresh.mockResolvedValue({
      access_token: 'restored-token',
      token_type: 'bearer',
      user: {
        id: 'restored-user-id',
        username: 'driver',
        is_admin: false,
        mfa_enabled: false,
        created_at: new Date().toISOString()
      }
    });
    apiMock.me.mockResolvedValue({
      id: 'restored-user-id',
      username: 'driver',
      is_admin: false,
      mfa_enabled: false,
      created_at: new Date().toISOString()
    });
    apiMock.listRecords.mockResolvedValue([]);
    apiMock.latestRecord.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();
    expect(apiMock.refresh).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('fmr_access_token')).toBe('restored-token');
  });

  it('shows signed-in user menu in top bar and signs out from menu', async () => {
    seedAuthenticatedSession(false);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Open user menu'));
    expect(screen.getByText('Signed in as')).toBeInTheDocument();
    expect(screen.getByText('driver')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(apiMock.logout).toHaveBeenCalledTimes(1);
  });

  it('shows admin section and history scope selector only for admins', async () => {
    seedAuthenticatedSession(true);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'history' }));
    expect(await screen.findByText('Scope')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings' }));

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit users' })).toBeInTheDocument();
  });

  it('lets admins edit/delete non-self users and hides actions for self', async () => {
    seedAuthenticatedSession(true);
    apiMock.listUsers.mockResolvedValue([
      {
        id: 'admin-id',
        username: 'admin',
        is_admin: true,
        mfa_enabled: false,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-2',
        username: 'driver2',
        is_admin: false,
        mfa_enabled: true,
        created_at: new Date().toISOString()
      }
    ]);
    apiMock.updateUser.mockResolvedValue({
      id: 'user-2',
      username: 'driver2',
      is_admin: true,
      mfa_enabled: true,
      created_at: new Date().toISOString()
    });
    apiMock.deleteUser.mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'settings' }));

    expect(await screen.findByRole('heading', { name: 'Add users' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit users' })).toBeInTheDocument();

    const adminLabel = screen.getByText('admin (you)');
    const adminRow = adminLabel.closest('.user-row');
    expect(adminRow).not.toBeNull();
    expect(within(adminRow as HTMLElement).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(adminRow as HTMLElement).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    const driverLabel = screen.getByText('driver2');
    const driverRow = driverLabel.closest('.user-row');
    expect(driverRow).not.toBeNull();
    fireEvent.click(within(driverRow as HTMLElement).getByRole('button', { name: 'Edit' }));

    const editDialog = await screen.findByRole('dialog', { name: 'Edit user' });
    fireEvent.click(within(editDialog).getByLabelText('Grant admin access'));
    fireEvent.change(within(editDialog).getByLabelText('Reset password (optional)'), {
      target: { value: 'Driver2Reset123' }
    });
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(apiMock.updateUser).toHaveBeenCalledWith('token-123', 'user-2', {
        password: 'Driver2Reset123',
        is_admin: true
      });
    });

    const refreshedDriverLabel = await screen.findByText('driver2');
    const refreshedDriverRow = refreshedDriverLabel.closest('.user-row');
    expect(refreshedDriverRow).not.toBeNull();
    fireEvent.click(within(refreshedDriverRow as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(apiMock.deleteUser).toHaveBeenCalledWith('token-123', 'user-2');
    });

    confirmSpy.mockRestore();
  });

  it('submits password change from profile', async () => {
    seedAuthenticatedSession(false);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'settings' }));

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'OldPassword123' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(apiMock.changePassword).toHaveBeenCalledWith('token-123', 'OldPassword123', 'NewPassword123');
    });
  });

  it('shows MFA setup QR code above the secret during setup', async () => {
    seedAuthenticatedSession(false);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start MFA setup' }));

    const qrImage = await screen.findByAltText('MFA setup QR code');
    expect(qrImage).toHaveAttribute('src', expect.stringContaining('data:image/png;base64,mock-mfa-qr'));
    expect(qrcodeMock.toDataURL).toHaveBeenCalledWith(
      'otpauth://totp/test?secret=ABCDEF123456',
      expect.objectContaining({ width: 220, margin: 1 })
    );
    expect(screen.getByText(/Secret:/)).toBeInTheDocument();
  });

  it('shows a retry state when system status cannot be loaded', async () => {
    apiMock.systemStatus.mockRejectedValueOnce(new Error('Network unreachable'));
    apiMock.systemStatus.mockResolvedValueOnce({ has_users: false, allow_self_register: false });

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Unable to load system status/i })).toBeInTheDocument();
    expect(screen.getByText('Network unreachable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Create first admin' })).toBeInTheDocument();
    await waitFor(() => {
      expect(apiMock.systemStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('allows dismissing toast notifications manually', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationFailure('No signal');

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Add a location, note, or photo before saving.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it(
    'auto-dismisses toast notifications after timeout',
    async () => {
      seedAuthenticatedSession(false);
      mockGeolocationFailure('No signal');

      render(<App />);
      expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Add a location, note, or photo before saving.');

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      }, { timeout: 7000 });
    },
    10000
  );

  it('captures parking photos with slot buttons and previews', async () => {
    seedAuthenticatedSession(false);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Photo source')).not.toBeInTheDocument();
    expect(screen.queryByText(/Samsung Internet note/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Location' })).not.toBeInTheDocument();
    expect(screen.getByText('Photos (optional, 0/3)')).toBeInTheDocument();

    const firstPhotoInput = screen.getByLabelText('Capture photo 1');
    const file = new File(['image-data'], 'level-b2.jpg', { type: 'image/jpeg' });
    fireEvent.input(firstPhotoInput, { target: { files: [file] } });

    expect(await screen.findByAltText('Selected parking photo 1')).toBeInTheDocument();
    fireEvent.click(screen.getByAltText('Selected parking photo 1'));
    const capturePreviewDialog = await screen.findByRole('dialog', { name: 'Photo preview' });
    expect(within(capturePreviewDialog).getByAltText('Selected parking photo 1 (full size)')).toBeInTheDocument();
    fireEvent.click(within(capturePreviewDialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Photo preview' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByLabelText('Capture photo 1')).toBeInTheDocument();
  });

  it('captures parking photos with in-app camera modal when media devices are available', async () => {
    seedAuthenticatedSession(false);
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }]
    } as unknown as MediaStream));
    setMediaDevices(getUserMedia);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Capture photo 1' }));
    expect(await screen.findByRole('dialog', { name: 'Capture parking photo' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expect(await screen.findByAltText('Selected parking photo 1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Capture parking photo' })).not.toBeInTheDocument();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('falls back to file picker when in-app camera is unavailable', async () => {
    seedAuthenticatedSession(false);
    setMediaDevices(undefined);
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Capture photo 1' }));
    expect(clickSpy).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Capture parking photo' })).not.toBeInTheDocument();

    clickSpy.mockRestore();
  });

  it('shows selected photo thumbnails in active parking view', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationFailure('No signal');

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    const firstPhotoInput = screen.getByLabelText('Capture photo 1');
    const file = new File(['image-data'], 'level-b2.jpg', { type: 'image/jpeg' });
    fireEvent.input(firstPhotoInput, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'B2 near blue elevator' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));

    expect(await screen.findByRole('heading', { name: 'You are parked' })).toBeInTheDocument();
    const activePhoto = await screen.findByAltText('Parking photo evidence');
    expect(activePhoto).toBeInTheDocument();
    fireEvent.click(activePhoto);
    const activePreviewDialog = await screen.findByRole('dialog', { name: 'Photo preview' });
    expect(within(activePreviewDialog).getByAltText('Parking photo evidence (full size)')).toBeInTheDocument();
  });

  it('syncs selected camera file when browser returns focus without change callback', async () => {
    seedAuthenticatedSession(false);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    const cameraInput = screen.getByLabelText('Capture photo 1') as HTMLInputElement;
    const file = new File(['image-data'], 'camera.jpg', { type: 'image/jpeg' });
    Object.defineProperty(cameraInput, 'files', {
      configurable: true,
      value: [file]
    });

    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByAltText('Selected parking photo 1')).toBeInTheDocument();
  });

  it('does not force a direct capture attribute on file inputs', async () => {
    seedAuthenticatedSession(false);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    const cameraInput = screen.getByLabelText('Capture photo 1') as HTMLInputElement;
    expect(cameraInput).not.toHaveAttribute('capture');
  });

  it('switches home to active parking state and saves only after explicit end confirmation', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationFailure('No signal');

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'B2 near blue elevator' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));

    expect(await screen.findByRole('heading', { name: 'You are parked' })).toBeInTheDocument();
    expect(screen.getByText('B2 near blue elevator')).toBeInTheDocument();
    expect(apiMock.createRecord).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'End parking' }));
    expect(await screen.findByText('Really end parking?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.queryByText('Really end parking?')).not.toBeInTheDocument();
    expect(apiMock.createRecord).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'End parking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, end parking' }));
    await waitFor(() => {
      expect(apiMock.createRecord).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();
  });

  it('renders history cards with saved address and expandable details', async () => {
    seedAuthenticatedSession(false);
    const record = buildRecord();
    apiMock.listRecords.mockResolvedValue([record]);
    apiMock.latestRecord.mockResolvedValue(record);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['img-bytes'], { type: 'image/jpeg' })
    } as Response);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'history' }));

    expect(await screen.findByText('Battery Park Garage, New York')).toBeInTheDocument();
    expect(screen.queryByText('Add photos')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More info' }));
    expect(await screen.findByTitle('OpenStreetMap preview of parked location')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'More details' })).toBeInTheDocument();
    expect(screen.getByText('Level B2 near west elevator')).toBeInTheDocument();
    const historyPhoto = await screen.findByAltText('Parking photo evidence');
    expect(historyPhoto).toBeInTheDocument();
    fireEvent.click(historyPhoto);
    const historyPreviewDialog = await screen.findByRole('dialog', { name: 'Photo preview' });
    expect(within(historyPreviewDialog).getByAltText('Parking photo evidence (full size)')).toBeInTheDocument();
    fireEvent.click(within(historyPreviewDialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Photo preview' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Google Maps' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it('saves record without coordinates when ending a note-only parking session', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationFailure('No signal');

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'B2 near blue elevator' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));

    expect(await screen.findByRole('heading', { name: 'You are parked' })).toBeInTheDocument();
    expect(apiMock.createRecord).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'End parking' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, end parking' }));
    await waitFor(() => {
      expect(apiMock.createRecord).toHaveBeenCalledTimes(1);
    });
    const formData = apiMock.createRecord.mock.calls[0][1] as FormData;
    expect(formData.get('note')).toBe('B2 near blue elevator');
    expect(formData.get('latitude')).toBeNull();
    expect(formData.get('longitude')).toBeNull();
  });

  it('includes location label when ending a session started with a successful locate result', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationSuccess(40.7128, -74.006);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'ignore me',
        address: {
          road: 'Damrak',
          house_number: '12',
          postcode: '1012 LG',
          city: 'Amsterdam',
          state: 'Noord-Holland',
          country: 'Netherlands'
        }
      })
    } as Response);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));
    expect(await screen.findByRole('heading', { name: 'You are parked' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End parking' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, end parking' }));

    await waitFor(() => {
      expect(apiMock.createRecord).toHaveBeenCalledTimes(1);
    });
    const formData = apiMock.createRecord.mock.calls[0][1] as FormData;
    expect(formData.get('location_label')).toBe('Damrak 12, 1012 LG Amsterdam, Noord-Holland, Netherlands');

    fetchMock.mockRestore();
  });

  it('shows take-me-there links and actions section while active parking has a location', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationSuccess(40.7128, -74.006);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'ignore me',
        address: {
          road: 'Damrak',
          house_number: '12',
          postcode: '1012 LG',
          city: 'Amsterdam',
          state: 'Noord-Holland',
          country: 'Netherlands'
        }
      })
    } as Response);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));
    expect(await screen.findByRole('heading', { name: 'You are parked' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Take me there' })).toBeInTheDocument();
    const googleMapsLink = screen.getByRole('link', { name: 'Google Maps' });
    const openStreetMapLink = screen.getByRole('link', { name: 'OpenStreetMap' });
    expect(googleMapsLink).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=40.7128,-74.006&travelmode=walking'
    );
    expect(openStreetMapLink).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/?mlat=40.7128&mlon=-74.006#map=18/40.7128/-74.006'
    );

    expect(screen.getByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End parking' })).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it('restores an active parking session from local storage after app reload', async () => {
    seedAuthenticatedSession(false);
    localStorage.setItem(
      'fmr_active_parking_by_user_v1',
      JSON.stringify({
        'user-id': {
          started_at: new Date(Date.now() - 75 * 60000).toISOString(),
          latitude: null,
          longitude: null,
          location_label: null,
          note: 'Sticky session note',
          photos: []
        }
      })
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'You are parked' })).toBeInTheDocument();
    expect(screen.getByText('Sticky session note')).toBeInTheDocument();
    expect(screen.getByText('Started:')).toBeInTheDocument();
    expect(screen.getByText('Active:')).toBeInTheDocument();
    const activeValue = screen.getByText(/\d+h \d{2}m/);
    expect(activeValue.tagName).toBe('STRONG');
  });

  it('requests browser notifications for active parking sessions when available', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationFailure('No signal');

    const notificationCalls = vi.fn();
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const notificationDescriptor = Object.getOwnPropertyDescriptor(window, 'Notification');
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});
    class NotificationMock {
      static permission: NotificationPermission = 'default';
      static instances: NotificationMock[] = [];
      static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
        NotificationMock.permission = 'granted';
        return 'granted';
      });
      onclick: (() => void) | null = null;
      close = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        notificationCalls(title, options);
        NotificationMock.instances.push(this);
      }
    }

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: NotificationMock
    });

    try {
      render(<App />);
      expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Note (optional)'), {
        target: { value: 'B2 near blue elevator' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));

      await waitFor(() => {
        expect(NotificationMock.requestPermission).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(notificationCalls).toHaveBeenCalled();
      });
      const firstCallOptions = notificationCalls.mock.calls[0]?.[1] as NotificationOptions | undefined;
      expect(firstCallOptions?.body).toContain('Active:');
      expect(NotificationMock.instances[0]?.onclick).toBeTypeOf('function');
      (NotificationMock.instances[0].onclick as () => void)();
      expect(focusSpy).toHaveBeenCalled();
    } finally {
      focusSpy.mockRestore();
      if (visibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
      }
      if (notificationDescriptor) {
        Object.defineProperty(window, 'Notification', notificationDescriptor);
      }
    }
  });

  it('treats reverse-lookup failure as unavailable for address-based saves', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationSuccess(40.7128, -74.006);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false
    } as Response);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
    expect(await screen.findByText('No reception')).toBeInTheDocument();
    expect(screen.getByText('Could not resolve a physical address. Please retry in a clearer signal area.')).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it('blocks save when location fails and there is no note or photo evidence', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationFailure('No signal');

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Park Here Now' }));

    expect(await screen.findByText('Add a location, note, or photo before saving.')).toBeInTheDocument();
    expect(apiMock.createRecord).not.toHaveBeenCalled();
  });

  it('locates with reverse-lookup name and shows no reception when lookup fails', async () => {
    seedAuthenticatedSession(false);
    mockGeolocationSuccess(40.7128, -74.006);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'Battery Park Garage, New York' })
    } as Response);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parked?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
    expect(await screen.findByText(/Battery Park Garage, New York/)).toBeInTheDocument();
    expect(screen.getByText(/40\.712800,\s*-74\.006000/)).toBeInTheDocument();

    fetchMock.mockRestore();
    mockGeolocationFailure('No signal');
    setSecureContext(false);
    fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
    expect(await screen.findByText('No reception')).toBeInTheDocument();
    expect(screen.getByText('Mobile browsers usually require HTTPS for geolocation.')).toBeInTheDocument();
  });
});
