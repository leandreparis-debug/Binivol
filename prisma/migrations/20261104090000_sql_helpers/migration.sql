-- Binivol — SQL helpers used by column defaults and searches.
-- Standard PostgreSQL only (15 and 16): no extension, nothing provider-specific.

-- Readable numbers (P-00001, S-00001, F-00001), one sequence per entity,
-- as in the legacy workbook.
CREATE SEQUENCE IF NOT EXISTS person_ref_seq AS bigint START 1;
CREATE SEQUENCE IF NOT EXISTS training_record_ref_seq AS bigint START 1;
CREATE SEQUENCE IF NOT EXISTS appointment_ref_seq AS bigint START 1;

-- Next readable number for a prefix and a sequence. Pads to 5 digits and
-- keeps growing past 99999 instead of truncating (lpad alone would collide).
CREATE OR REPLACE FUNCTION binivol_next_ref(prefix text, seq regclass)
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT prefix || lpad(n::text, greatest(5, length(n::text)), '0')
  FROM (SELECT nextval(seq) AS n) AS next_value
$$;

-- Accent- and case-insensitive form of a text, for searches. Pure SQL with
-- translate(), so it is IMMUTABLE and indexable, and needs no `unaccent`
-- extension. Covers the Latin letters met in French names (œ and æ included).
CREATE OR REPLACE FUNCTION binivol_normalize(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    translate(
      replace(replace(replace(replace(coalesce(value, ''), 'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'Æ', 'AE'),
      'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ',
      'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy'
    )
  )
$$;
