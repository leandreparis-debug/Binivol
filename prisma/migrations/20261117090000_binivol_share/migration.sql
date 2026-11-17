-- Read-only views published for Binitenue (uniform management of the unit), which shares this
-- database (docs/binivol-share.md). Binitenue connects with its own role `binitenue_app`, member
-- of `binivol_share_reader`: it can read these views and call `account_password_hash`, nothing
-- else in Binivol. Views run with the privileges of their owner (the migration role), so the
-- reader needs no right on the underlying tables.
--
-- Written by hand: Prisma only manages the `public` schema and ignores `binivol_share`.

CREATE SCHEMA IF NOT EXISTS binivol_share;

COMMENT ON SCHEMA binivol_share IS
  'Read-only views for Binitenue (docs/binivol-share.md). No table, no write.';

-- Volunteers: everyone but candidates and archived people. The postal address is sensitive
-- (person_sensitive, every read logged by Binivol): it is NOT published, the columns stay
-- null until a logged way to share it is decided.
CREATE VIEW binivol_share.volunteers AS
SELECT
  p.id,
  p.nivol,
  p.civility::text AS civility,
  p.first_name,
  p.last_name,
  p.email,
  p.phone,
  NULL::text AS address_line,
  NULL::text AS postal_code,
  NULL::text AS city,
  p.status::text AS status,
  COALESCE(p.is_trainer, false) AS is_trainer,
  p.entry_date,
  p.left_at,
  GREATEST(
    p.updated_at,
    (SELECT max(tr.date)::timestamptz FROM training_records tr
      WHERE tr.person_id = p.id AND tr.cancelled_at IS NULL AND tr.result = 'PASSED'),
    (SELECT max(f.done_at)::timestamptz FROM follow_ups f
      WHERE f.person_id = p.id AND f.cancelled_at IS NULL),
    (SELECT max(a.updated_at) FROM appointments a WHERE a.person_id = p.id)
  )::timestamptz AS last_activity_at,
  p.updated_at::timestamptz AS updated_at
FROM persons p
WHERE p.status <> 'CANDIDATE' AND p.archived_at IS NULL;

-- Appointments (functions) of those volunteers.
CREATE VIEW binivol_share.appointments AS
SELECT
  a.id,
  a.person_id,
  r.code AS function_code,
  r.label AS function_label,
  a.start_date,
  a.end_date,
  (a.cancelled_at IS NOT NULL) AS cancelled,
  a.updated_at::timestamptz AS updated_at
FROM appointments a
JOIN reference_items r ON r.id = a.reference_id
JOIN persons p ON p.id = a.person_id
WHERE p.status <> 'CANDIDATE' AND p.archived_at IS NULL;

-- Trainings: passed (valid or expired, in Europe/Paris) or in progress. Failed, absent and
-- cancelled records are left out.
CREATE VIEW binivol_share.qualifications AS
SELECT
  tr.id,
  tr.person_id,
  r.code,
  r.label,
  CASE
    WHEN tr.result = 'PASSED'
      AND tr.expires_at IS NOT NULL
      AND tr.expires_at < (now() AT TIME ZONE 'Europe/Paris')::date THEN 'EXPIRED'
    WHEN tr.result = 'PASSED' THEN 'VALID'
    ELSE 'IN_PROGRESS'
  END AS status,
  tr.date AS obtained_at,
  tr.expires_at AS valid_until,
  tr.updated_at::timestamptz AS updated_at
FROM training_records tr
JOIN reference_items r ON r.id = tr.reference_id
JOIN persons p ON p.id = tr.person_id
WHERE tr.cancelled_at IS NULL
  AND tr.result IN ('PASSED', 'REGISTERED', 'TO_CONFIRM')
  AND r.kind = 'TRAINING'
  AND p.status <> 'CANDIDATE' AND p.archived_at IS NULL;

-- Accounts of the managers, with their profiles. No password hash here.
CREATE VIEW binivol_share.accounts AS
SELECT
  u.id,
  u.email,
  u.name,
  u.active,
  u.username,
  COALESCE(
    (SELECT array_agg(up.profile::text ORDER BY up.profile::text)
       FROM user_profiles up WHERE up.user_id = u.id),
    ARRAY[]::text[]
  ) AS profiles
FROM users u;

-- Same identifier and password as Binivol (ADR-070): Binitenue verifies the argon2id hash
-- itself, so it needs the hash of ONE account, the one being signed in. This function returns
-- it for an exact identifier only (no listing of hashes); it runs with the owner's rights.
CREATE FUNCTION binivol_share.account_password_hash(p_username text)
RETURNS TABLE (account_id text, password_hash text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.password_hash
  FROM users u
  WHERE u.username = lower(btrim(p_username))
    AND u.password_hash IS NOT NULL
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION binivol_share.account_password_hash(text) FROM PUBLIC;

-- Reader role (no login). Creating a role needs CREATEROLE: on a hosted database without it
-- (Supabase), the views are still created and the grants are skipped with a notice.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'binivol_share_reader') THEN
    CREATE ROLE binivol_share_reader NOLOGIN;
  END IF;
  GRANT USAGE ON SCHEMA binivol_share TO binivol_share_reader;
  GRANT SELECT ON ALL TABLES IN SCHEMA binivol_share TO binivol_share_reader;
  GRANT EXECUTE ON FUNCTION binivol_share.account_password_hash(text) TO binivol_share_reader;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'binivol_share_reader not created (no CREATEROLE): grants skipped';
END
$$;
