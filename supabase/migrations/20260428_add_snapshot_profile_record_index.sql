-- Preserve Bright Data snapshot download order when raw profiles are loaded from cache.

ALTER TABLE public.hirelix_snapshot_profiles
  ADD COLUMN IF NOT EXISTS record_index INTEGER;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY snapshot_id, source_round
      ORDER BY created_at, id
    ) - 1 AS next_record_index
  FROM public.hirelix_snapshot_profiles
  WHERE record_index IS NULL
)
UPDATE public.hirelix_snapshot_profiles AS profiles
SET record_index = ranked.next_record_index
FROM ranked
WHERE profiles.id = ranked.id;

CREATE INDEX IF NOT EXISTS hirelix_snapshot_profiles_by_round_order
  ON public.hirelix_snapshot_profiles (snapshot_id, source_round, record_index);
