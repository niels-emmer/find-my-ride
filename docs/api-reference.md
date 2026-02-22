# API Reference

Base path: `/api`

Auth style: `Authorization: Bearer <token>`

## System

### `GET /system/status`

Returns:

- `has_users: boolean`
- `allow_self_register: boolean`

## Auth

### `POST /auth/bootstrap`

Create first admin user (only when no users exist).

Request body:

- `username: string`
- `password: string (min 12)`

Response:

- `access_token`
- `token_type`
- `user`

### `POST /auth/register`

Self-register user (only when `ALLOW_SELF_REGISTER=true`).

Request body:

- `username`
- `password`

Response: token + user object.

### `POST /auth/login`

Request body:

- `username`
- `password`
- `otp_code` (required if MFA enabled)

Response: token + user object.

### `GET /auth/me`

Returns authenticated user profile.

### `POST /auth/mfa/setup`

Creates TOTP secret and returns:

- `secret`
- `otpauth_url`

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

- `username`
- `password`
- `is_admin: boolean`

## Parking

### `POST /parking/records`

Create parking record with multipart form-data.

Form fields:

- `latitude` (required)
- `longitude` (required)
- `parked_at` (optional ISO datetime)
- `note` (optional)
- `photos` (optional repeated file field, max 3)

Returns `ParkingRecordOut`.

### `GET /parking/records`

Query params:

- `owner_id` (admin-only filter)
- `limit` (default 50, max 200)

Returns list of `ParkingRecordOut` ordered by newest parked time.

### `GET /parking/records/latest`

Query params:

- `owner_id` (admin-only filter)

Returns latest `ParkingRecordOut` or `null`.

### `PATCH /parking/records/{record_id}`

Request JSON (all optional):

- `latitude`
- `longitude`
- `note`
- `parked_at`

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
- `latitude`
- `longitude`
- `note`
- `parked_at`
- `created_at`
- `updated_at`
- `photos: PhotoOut[]`
