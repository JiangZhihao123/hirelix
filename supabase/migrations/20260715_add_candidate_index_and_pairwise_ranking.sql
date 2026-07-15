CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS hirelix_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_id text,
  linkedin_url text,
  name text NOT NULL,
  current_title text,
  current_company text,
  seniority text,
  years_experience numeric,
  role_families text[] NOT NULL DEFAULT '{}',
  adjacent_roles text[] NOT NULL DEFAULT '{}',
  skills text[] NOT NULL DEFAULT '{}',
  domains text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  country_code text,
  state_or_region text,
  city text,
  metro_area text,
  highest_degree text,
  schools text[] NOT NULL DEFAULT '{}',
  fields_of_study text[] NOT NULL DEFAULT '{}',
  profile_summary text,
  semantic_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_document text NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_document)) STORED,
  embedding vector(1536),
  raw_profile jsonb NOT NULL,
  raw_content_hash text NOT NULL,
  source_snapshot_id text,
  representation_version integer NOT NULL DEFAULT 1,
  representation_model text,
  embedding_model text,
  processing_status text NOT NULL DEFAULT 'pending',
  processing_error text,
  represented_at timestamptz,
  embedded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hirelix_profiles_identity_check CHECK (linkedin_id IS NOT NULL OR linkedin_url IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS hirelix_profiles_linkedin_id_key
  ON hirelix_profiles (linkedin_id) WHERE linkedin_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hirelix_profiles_linkedin_url_key
  ON hirelix_profiles (linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_location
  ON hirelix_profiles (country_code, state_or_region, city, metro_area);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_seniority
  ON hirelix_profiles (seniority, years_experience);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_role_families
  ON hirelix_profiles USING gin (role_families);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_skills
  ON hirelix_profiles USING gin (skills);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_domains
  ON hirelix_profiles USING gin (domains);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_schools
  ON hirelix_profiles USING gin (schools);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_search_vector
  ON hirelix_profiles USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_title_trgm
  ON hirelix_profiles USING gin (current_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_company_trgm
  ON hirelix_profiles USING gin (current_company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hirelix_profiles_embedding_hnsw
  ON hirelix_profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS hirelix_profile_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES hirelix_profiles(id) ON DELETE CASCADE,
  source_ordinal integer NOT NULL,
  title text,
  company text,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  location text,
  description text,
  search_document text NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_document)) STORED,
  embedding vector(1536),
  embedding_model text,
  embedded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, source_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_hirelix_profile_experiences_profile
  ON hirelix_profile_experiences (profile_id);
CREATE INDEX IF NOT EXISTS idx_hirelix_profile_experiences_search_vector
  ON hirelix_profile_experiences USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_hirelix_profile_experiences_title_trgm
  ON hirelix_profile_experiences USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hirelix_profile_experiences_company_trgm
  ON hirelix_profile_experiences USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hirelix_profile_experiences_embedding_hnsw
  ON hirelix_profile_experiences USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE embedding IS NOT NULL;

ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES hirelix_profiles(id);
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS retrieval_channels jsonb;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS retrieval_rank integer;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS qualification_decision text;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS qualification_evidence jsonb;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS davidson_score numeric;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS rank_low integer;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS rank_high integer;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS final_rank integer;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS final_decision text;
ALTER TABLE hirelix_candidates ADD COLUMN IF NOT EXISTS evidence_pack jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS hirelix_candidates_search_profile_key
  ON hirelix_candidates (search_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hirelix_candidates_final_rank
  ON hirelix_candidates (search_id, final_rank) WHERE final_rank IS NOT NULL;

CREATE TABLE IF NOT EXISTS hirelix_candidate_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES hirelix_searches(id) ON DELETE CASCADE,
  candidate_a_profile_id uuid NOT NULL REFERENCES hirelix_profiles(id),
  candidate_b_profile_id uuid NOT NULL REFERENCES hirelix_profiles(id),
  pair_key text NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  presented_order text NOT NULL,
  decision text NOT NULL,
  decisive_dimensions text[] NOT NULL DEFAULT '{}',
  reason text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualification_review_profile_id uuid REFERENCES hirelix_profiles(id),
  is_order_swap boolean NOT NULL DEFAULT false,
  is_stable boolean NOT NULL DEFAULT true,
  included_in_fit boolean NOT NULL DEFAULT true,
  model text NOT NULL,
  prompt_version integer NOT NULL DEFAULT 1,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_id, pair_key, attempt, presented_order)
);

CREATE INDEX IF NOT EXISTS idx_hirelix_candidate_comparisons_search
  ON hirelix_candidate_comparisons (search_id, included_in_fit, is_stable);

