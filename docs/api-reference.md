# API Reference

Base path: `/api`

Auth style:

- Access token: `Authorization: Bearer <token>`
- Refresh token: HttpOnly cookie (`REFRESH_TOKEN_COOKIE_NAME`, default `fmr_refresh_token`) scoped to `/api/auth`

## System

### `GET /system/status`

Returns:

- `has_users: boolean`
- `allow_self_register: boolean` (currently always `true`)

## Auth

### `POST /auth/bootstrap`

Create first admin user (only when no users exist).

Request body:

- `username: string` (3-64 chars; normalized lowercase; allowed chars: letters, digits, `.`, `_`, `-`)
- `password: string` (8-128 chars, must include uppercase/lowercase/digit)

Response:

- `access_token`
- `token_type`
- `user`
- Sets refresh cookie

### `POST /auth/register`

Self-register user (open by default; no moderation gate).

Request body:

- `username` (same policy as bootstrap)
- `password` (same policy as bootstrap)

Response: token + user object.
Also sets refresh cookie.

### `POST /auth/login`

Request body:

- `username` (same policy as bootstrap)
- `password`
- `otp_code` (required if MFA enabled)

Response: token + user object.
Also sets refresh cookie.

Frontend client flow:

- Submit username/password first.
- If response detail indicates MFA code is required, prompt for OTP and retry the same endpoint with `otp_code`.

### `POST /auth/refresh`

Rotate refresh token cookie and issue a new access token.

Request:

- No JSON body
- Requires refresh cookie

Response:

- `access_token`
- `token_type`
- `user`
- Sets rotated refresh cookie

Failure:

- `401` if refresh token is missing/invalid/revoked/expired

### `POST /auth/logout`

Revoke the current refresh token and clear refresh cookie.

Request:

- No JSON body

Response:

- `message`

### `GET /auth/me`

Returns authenticated user profile.

### `POST /auth/change-password`

Change password for the authenticated user.

Request body:

- `current_password`
- `new_password` (8-128 chars, must include uppercase/lowercase/digit)

Response:

- `message`

Behavior:

- Revokes all active refresh tokens for the current user.

### `POST /auth/mfa/setup`

Creates TOTP secret and returns:

- `secret`
- `otpauth_url`

Frontend client uses `otpauth_url` to generate a local QR code for authenticator app scan.

### `POST /auth/mfa/verify`

Request body:

- `code`

Enables MFA when code is valid.

### `POST /auth/mfa/disable`

Request body:

- `code`

Disables MFA (requires valid code if currently enabled).

## Users (admin only)

### `GET /users`

Returns list of users.

### `POST /users`

Create user.

Request body:

- `username` (same policy as bootstrap)
- `password` (same policy as bootstrap)
- `is_admin: boolean`

### `PATCH /users/{user_id}`

Update an existing user (admin only).

Request body (at least one required):

- `password` (8-128 chars, must include uppercase/lowercase/digit) to reset password
- `is_admin: boolean` to change role

Rules:

- Admin cannot edit self via this endpoint.
- API prevents removing the last admin role.
- If password is changed, all active refresh tokens for that user are revoked.

### `DELETE /users/{user_id}`

Delete an existing user (admin only).

Rules:

- Admin cannot delete self via this endpoint.
- API prevents deleting the last admin account.

## Parking

### `POST /parking/records`

Create parking record with multipart form-data.

Form fields:

- `latitude` (optional, must be sent with `longitude`)
- `longitude` (optional, must be sent with `latitude`)
- `location_label` (required when location pair is provided; must be a physical address, not coordinate text)
- `parked_at` (optional ISO datetime)
- `note` (optional)
- `photos` (optional repeated file field, max 3)

Validation rules:

- Provide both `latitude` and `longitude`, or neither.
- Record creation requires at least one of:
  - location pair (`latitude` + `longitude`)
  - non-empty `note`
  - at least one `photos` file
- When a location pair is sent, `location_label` must be present and non-coordinate (physical address).
- If location is omitted, `location_label` is cleared/ignored.
- Text fields (`location_label`, `note`) reject control characters.
- Stored/returned `location_label` values are normalized as street-first address text when geocoding succeeds.

Photo upload constraints:

- max size per file = `MAX_PHOTO_SIZE_MB` (default 8 MB)
- allowed content types = `image/jpeg`, `image/jpg`, `image/pjpeg`, `image/png`, `image/webp`, `image/heic`, `image/heic-sequence`, `image/heif`, `image/heif-sequence`, `image/avif`

Returns `ParkingRecordOut`.

### `GET /parking/records`

Query params:

- `owner_id` (admin-only UUID filter)
- `limit` (default 50, max 200)

Returns list of `ParkingRecordOut` ordered by newest parked time.

### `GET /parking/records/latest`

Query params:

- `owner_id` (admin-only UUID filter)

Returns latest `ParkingRecordOut` or `null`.

### `PATCH /parking/records/{record_id}`

Request JSON (all optional):

- `latitude`
- `longitude`
- `location_label`
- `note`
- `parked_at`

Validation rules:

- If updating location, provide both `latitude` and `longitude` together.
- To clear location, set both `latitude` and `longitude` to `null`.
- Clearing location also clears `location_label`.
- When updating to non-null coordinates, include `location_label` with a physical address (not coordinate text).

Returns updated record.

### `DELETE /parking/records/{record_id}`

Deletes a record and linked photos.

### `POST /parking/records/{record_id}/photos`

Add additional photos (multipart form-data field `photos`).

### `DELETE /parking/photos/{photo_id}`

Delete a specific photo.

### `GET /parking/photos/{photo_id}/download`

Download photo if caller has access.

## Response objects

### `UserOut`

- `id`
- `username`
- `is_admin`
- `mfa_enabled`
- `created_at`

### `PhotoOut`

- `id`
- `file_name`
- `content_type`
- `file_size`
- `created_at`
- `download_url`

### `ParkingRecordOut`

- `id`
- `owner_id`
- `latitude` (`number | null`)
- `longitude` (`number | null`)
- `location_label` (`string | null`)
- `note`
- `parked_at`
- `created_at`
- `updated_at`
- `photos: PhotoOut[]`
