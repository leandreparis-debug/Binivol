-- Binivol — constraints and triggers Prisma cannot express.
-- Every name is listed in docs/data-model.md.

-- ---------------------------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK (email = lower(email));

-- NIVOL: 11 digits followed by one upper-case letter (format seen on all legacy data).
ALTER TABLE "persons"
  ADD CONSTRAINT "persons_nivol_format" CHECK (nivol IS NULL OR nivol ~ '^[0-9]{11}[A-Z]$');

-- Any status other than CANDIDATE requires a NIVOL, except LEFT, INACTIVE and
-- people imported from the legacy workbook (which may be incomplete).
ALTER TABLE "persons"
  ADD CONSTRAINT "persons_nivol_required"
  CHECK (status IN ('CANDIDATE', 'LEFT', 'INACTIVE') OR legacy_import OR nivol IS NOT NULL);

ALTER TABLE "persons"
  ADD CONSTRAINT "persons_left_requires_date" CHECK (status <> 'LEFT' OR left_at IS NOT NULL);

ALTER TABLE "reference_items"
  ADD CONSTRAINT "reference_items_validity_positive" CHECK (validity_months IS NULL OR validity_months > 0);

ALTER TABLE "reference_item_prerequisites"
  ADD CONSTRAINT "reference_item_prerequisites_not_self" CHECK (item_id <> prerequisite_id);

ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_dates" CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT "training_sessions_capacity_positive" CHECK (capacity IS NULL OR capacity > 0);

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_dates" CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

-- A candidacy is closed exactly when it reached DONE or ABANDONED.
ALTER TABLE "candidacies"
  ADD CONSTRAINT "candidacies_closed_matches_stage"
  CHECK ((stage IN ('DONE', 'ABANDONED')) = (closed_at IS NOT NULL));

ALTER TABLE "mentorships"
  ADD CONSTRAINT "mentorships_not_self" CHECK (mentee_id <> mentor_id),
  ADD CONSTRAINT "mentorships_dates" CHECK (end_date IS NULL OR end_date >= start_date);

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_size_positive" CHECK (size_bytes >= 0),
  ADD CONSTRAINT "documents_sha256_format" CHECK (sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE "otp_challenges"
  ADD CONSTRAINT "otp_challenges_attempts_positive" CHECK (attempts >= 0);

-- ---------------------------------------------------------------------------
-- An appointment always points to a reference of kind FUNCTION.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION binivol_check_appointment_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM reference_items WHERE id = NEW.reference_id AND kind = 'FUNCTION'
  ) THEN
    RAISE EXCEPTION 'Une nomination doit porter sur une référence de type FUNCTION.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'appointments_reference_is_function';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "appointments_reference_is_function"
  BEFORE INSERT OR UPDATE OF reference_id ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION binivol_check_appointment_reference();

-- ---------------------------------------------------------------------------
-- Append-only logs. UPDATE, DELETE and TRUNCATE are refused, unless the GDPR
-- purge (step 14) sets `binivol.allow_purge = 'on'` for its own transaction:
--   BEGIN; SET LOCAL binivol.allow_purge = 'on'; DELETE …; COMMIT;
-- Statement-level, so it also fires when no row matches.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION binivol_forbid_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('binivol.allow_purge', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'La table % est en ajout seul : % interdit.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Seule la purge RGPD peut modifier ce journal, avec SET LOCAL binivol.allow_purge = ''on''.';
END
$$;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION binivol_forbid_log_mutation();

CREATE TRIGGER "access_logs_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "access_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION binivol_forbid_log_mutation();
