-- Seed deterministic README history rows for a single demo user.
--
-- Usage example:
--   docker compose exec -T db psql \
--     -U "$POSTGRES_USER" \
--     -d "$POSTGRES_DB" \
--     -v ON_ERROR_STOP=1 \
--     -v demo_user_id="<user-id>" \
--     < scripts/readme-screenshots/seed_history.sql

DELETE FROM photos
WHERE record_id IN (
  SELECT id
  FROM parking_records
  WHERE owner_id = :'demo_user_id'
);

DELETE FROM parking_records
WHERE owner_id = :'demo_user_id';

WITH seed_rows AS (
  SELECT *
  FROM (
    VALUES
      (37.7897, -122.3942, 'Mission Street 250, 94105 San Francisco, California, United States', 'Quick stop near entrance', 5),
      (37.7816, -122.4041, 'Howard Street 865, 94103 San Francisco, California, United States', NULL, 25),
      (NULL::double precision, NULL::double precision, NULL::text, 'Surface lot, row C', 45),
      (37.7694, -122.4862, 'Lincoln Way 1000, 94122 San Francisco, California, United States', 'Near museum side', 65)
  ) AS source(latitude, longitude, location_label, note, minutes_ago)
),
prepared_rows AS (
  SELECT
    (
      SUBSTRING(hash, 1, 8) || '-' ||
      SUBSTRING(hash, 9, 4) || '-' ||
      SUBSTRING(hash, 13, 4) || '-' ||
      SUBSTRING(hash, 17, 4) || '-' ||
      SUBSTRING(hash, 21, 12)
    ) AS id,
    latitude,
    longitude,
    location_label,
    note,
    (NOW() - ((minutes_ago::text || ' minutes')::interval)) AS parked_at
  FROM (
    SELECT
      MD5(CLOCK_TIMESTAMP()::text || RANDOM()::text || ROW_NUMBER() OVER ()::text) AS hash,
      latitude,
      longitude,
      location_label,
      note,
      minutes_ago
    FROM seed_rows
  ) AS generated
)
INSERT INTO parking_records (
  id,
  owner_id,
  latitude,
  longitude,
  location_label,
  note,
  parked_at,
  created_at,
  updated_at
)
SELECT
  id,
  :'demo_user_id',
  latitude,
  longitude,
  location_label,
  note,
  parked_at,
  NOW(),
  NOW()
FROM prepared_rows;
