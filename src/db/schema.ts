/**
 * Drizzle ORM schema definitions for Hirelix self-hosted Postgres.
 *
 * Naming convention: snake_case for both column names and TypeScript property
 * names so existing call sites can be migrated with minimal churn.
 *
 * Notes:
 * - `user_id` columns are kept as plain `uuid` (no FK) because better-auth
 *   identity tables and Hirelix business tables are managed separately.
 * - Defaults / NOT NULL constraints mirror `supabase/migrations/*.sql`.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------
export const hirelix_searches = pgTable(
  "hirelix_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    title: text("title"),
    jd_text: text("jd_text").notNull(),
    parsed_requirements: jsonb("parsed_requirements"),
    status: text("status").notNull().default("queued"),
    pipeline_step: text("pipeline_step"),
    error_message: text("error_message"),
    queued_at: timestamp("queued_at", { withTimezone: true }),
    parse_completed_at: timestamp("parse_completed_at", { withTimezone: true }),
    search_completed_at: timestamp("search_completed_at", { withTimezone: true }),
    partial_ready_at: timestamp("partial_ready_at", { withTimezone: true }),
    done_at: timestamp("done_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    user_idx: index("idx_hirelix_searches_user_id").on(t.user_id),
    status_updated_idx: index("idx_hirelix_searches_status_updated_at").on(
      t.status,
      t.updated_at,
    ),
  }),
);

export const hirelix_search_shares = pgTable(
  "hirelix_search_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    search_id: uuid("search_id").notNull(),
    user_id: uuid("user_id").notNull(),
    token_hash: text("token_hash").notNull(),
    candidate_limit: integer("candidate_limit").notNull().default(50),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    token_hash_key: uniqueIndex("hirelix_search_shares_token_hash_key").on(t.token_hash),
    search_idx: index("idx_hirelix_search_shares_search_id").on(t.search_id),
    user_idx: index("idx_hirelix_search_shares_user_id").on(t.user_id),
  }),
);

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
export const hirelix_candidates = pgTable(
  "hirelix_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    search_id: uuid("search_id").notNull(),
    profile_id: uuid("profile_id"),
    name: text("name").notNull(),
    headline: text("headline"),
    location: text("location"),
    skills: text("skills").array(),
    experience_years: integer("experience_years"),
    match_score: integer("match_score"),
    match_reasons: text("match_reasons").array(),
    profile_url: text("profile_url"),
    github_url: text("github_url"),
    email: text("email"),
    outreach_draft: text("outreach_draft"),
    status: text("status").default("new"),
    metadata: jsonb("metadata"),
    retrieval_channels: jsonb("retrieval_channels"),
    retrieval_rank: integer("retrieval_rank"),
    qualification_decision: text("qualification_decision"),
    qualification_evidence: jsonb("qualification_evidence"),
    davidson_score: numeric("davidson_score"),
    rank_low: integer("rank_low"),
    rank_high: integer("rank_high"),
    final_rank: integer("final_rank"),
    final_decision: text("final_decision"),
    evidence_pack: jsonb("evidence_pack"),
    enriched_at: timestamp("enriched_at", { withTimezone: true }),
    enrich_source: text("enrich_source"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    search_idx: index("idx_hirelix_candidates_search_id").on(t.search_id),
    enriched_at_idx: index("idx_hirelix_candidates_enriched_at").on(t.enriched_at),
  }),
);

// ---------------------------------------------------------------------------
// Reusable Bright-backed candidate index
// ---------------------------------------------------------------------------
export const hirelix_profiles = pgTable("hirelix_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  linkedin_id: text("linkedin_id"),
  linkedin_url: text("linkedin_url"),
  name: text("name").notNull(),
  current_title: text("current_title"),
  current_company: text("current_company"),
  seniority: text("seniority"),
  years_experience: numeric("years_experience"),
  role_families: text("role_families").array().notNull().default(sql`'{}'::text[]`),
  adjacent_roles: text("adjacent_roles").array().notNull().default(sql`'{}'::text[]`),
  skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
  domains: text("domains").array().notNull().default(sql`'{}'::text[]`),
  capabilities: text("capabilities").array().notNull().default(sql`'{}'::text[]`),
  country_code: text("country_code"),
  state_or_region: text("state_or_region"),
  city: text("city"),
  metro_area: text("metro_area"),
  highest_degree: text("highest_degree"),
  schools: text("schools").array().notNull().default(sql`'{}'::text[]`),
  fields_of_study: text("fields_of_study").array().notNull().default(sql`'{}'::text[]`),
  profile_summary: text("profile_summary"),
  semantic_evidence: jsonb("semantic_evidence").notNull().default(sql`'[]'::jsonb`),
  search_document: text("search_document").notNull().default(""),
  embedding: vector("embedding", { dimensions: 1536 }),
  raw_profile: jsonb("raw_profile").notNull(),
  raw_content_hash: text("raw_content_hash").notNull(),
  source_snapshot_id: text("source_snapshot_id"),
  representation_version: integer("representation_version").notNull().default(1),
  representation_model: text("representation_model"),
  embedding_model: text("embedding_model"),
  processing_status: text("processing_status").notNull().default("pending"),
  processing_error: text("processing_error"),
  represented_at: timestamp("represented_at", { withTimezone: true }),
  embedded_at: timestamp("embedded_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hirelix_profile_experiences = pgTable("hirelix_profile_experiences", {
  id: uuid("id").primaryKey().defaultRandom(),
  profile_id: uuid("profile_id").notNull(),
  source_ordinal: integer("source_ordinal").notNull(),
  title: text("title"),
  company: text("company"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  is_current: boolean("is_current").notNull().default(false),
  location: text("location"),
  description: text("description"),
  search_document: text("search_document").notNull().default(""),
  embedding: vector("embedding", { dimensions: 1536 }),
  embedding_model: text("embedding_model"),
  embedded_at: timestamp("embedded_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hirelix_candidate_comparisons = pgTable("hirelix_candidate_comparisons", {
  id: uuid("id").primaryKey().defaultRandom(),
  search_id: uuid("search_id").notNull(),
  candidate_a_profile_id: uuid("candidate_a_profile_id").notNull(),
  candidate_b_profile_id: uuid("candidate_b_profile_id").notNull(),
  pair_key: text("pair_key").notNull(),
  attempt: integer("attempt").notNull().default(1),
  presented_order: text("presented_order").notNull(),
  decision: text("decision").notNull(),
  decisive_dimensions: text("decisive_dimensions").array().notNull().default(sql`'{}'::text[]`),
  reason: text("reason"),
  evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
  risks: jsonb("risks").notNull().default(sql`'[]'::jsonb`),
  qualification_review_profile_id: uuid("qualification_review_profile_id"),
  is_order_swap: boolean("is_order_swap").notNull().default(false),
  is_stable: boolean("is_stable").notNull().default(true),
  included_in_fit: boolean("included_in_fit").notNull().default(true),
  model: text("model").notNull(),
  prompt_version: integer("prompt_version").notNull().default(1),
  request_hash: text("request_hash").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Search jobs queue
// ---------------------------------------------------------------------------
export const hirelix_search_jobs = pgTable(
  "hirelix_search_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    search_id: uuid("search_id").notNull().unique(),
    user_id: uuid("user_id").notNull(),
    jd_text: text("jd_text").notNull(),
    candidate_count: integer("candidate_count").notNull().default(5),
    status: text("status").notNull().default("queued"),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error: text("last_error"),
    available_at: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    locked_at: timestamp("locked_at", { withTimezone: true }),
    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    status_avail_idx: index("idx_hirelix_search_jobs_status_available_at").on(
      t.status,
      t.available_at,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Search notifications
// ---------------------------------------------------------------------------
export const hirelix_search_notifications = pgTable(
  "hirelix_search_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    search_id: uuid("search_id").notNull(),
    user_id: uuid("user_id").notNull(),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull(),
    status: text("status").notNull().default("queued"),
    provider_message_id: text("provider_message_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    last_error: text("last_error"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unique_kind_channel: uniqueIndex(
      "idx_hirelix_search_notifications_unique_kind_channel",
    ).on(t.search_id, t.kind, t.channel),
    user_created_idx: index("idx_hirelix_search_notifications_user_id_created_at").on(
      t.user_id,
      t.created_at,
    ),
  }),
);

// ---------------------------------------------------------------------------
// GitHub enrichment jobs
// ---------------------------------------------------------------------------
export const hirelix_github_enrichment_jobs = pgTable(
  "hirelix_github_enrichment_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidate_id: uuid("candidate_id").notNull().unique(),
    search_id: uuid("search_id").notNull(),
    user_id: uuid("user_id").notNull(),
    status: text("status").notNull().default("queued"),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error: text("last_error"),
    available_at: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    locked_at: timestamp("locked_at", { withTimezone: true }),
    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    status_avail_idx: index("idx_hirelix_github_enrichment_jobs_status_available_at").on(
      t.status,
      t.available_at,
    ),
    search_idx: index("idx_hirelix_github_enrichment_jobs_search_id").on(t.search_id),
  }),
);

// ---------------------------------------------------------------------------
// User settings (with billing fields)
// ---------------------------------------------------------------------------
export const hirelix_user_settings = pgTable("hirelix_user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().unique(),
  pdl_api_key: text("pdl_api_key"),
  company_profile: jsonb("company_profile"),
  subscription_plan: text("subscription_plan").default("free"),
  subscription_status: text("subscription_status").default("active"),
  billing_cycle: text("billing_cycle"),
  paddle_customer_id: text("paddle_customer_id"),
  paddle_subscription_id: text("paddle_subscription_id"),
  paddle_transaction_id: text("paddle_transaction_id"),
  subscription_started_at: timestamp("subscription_started_at", { withTimezone: true }),
  subscription_renews_at: timestamp("subscription_renews_at", { withTimezone: true }),
  extra_search_credits: integer("extra_search_credits").notNull().default(0),
  extra_enrich_credits: integer("extra_enrich_credits").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Usage events
// ---------------------------------------------------------------------------
export const hirelix_usage_events = pgTable(
  "hirelix_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    event_type: text("event_type").notNull(),
    related_id: uuid("related_id"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    user_created_idx: index("idx_hirelix_usage_events_user_id_created_at").on(
      t.user_id,
      t.created_at,
    ),
    unique_event_related: uniqueIndex("hirelix_usage_events_event_type_related_id_key").on(
      t.event_type,
      t.related_id,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Billing events (Paddle webhook log)
// ---------------------------------------------------------------------------
export const hirelix_billing_events = pgTable("hirelix_billing_events", {
  event_id: text("event_id").primaryKey(),
  event_type: text("event_type").notNull(),
  user_id: uuid("user_id"),
  payload: jsonb("payload").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Promotional billing access
// ---------------------------------------------------------------------------
export const hirelix_redemption_codes = pgTable(
  "hirelix_redemption_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code_hash: text("code_hash").notNull(),
    code_prefix: text("code_prefix").notNull(),
    campaign: text("campaign"),
    benefit_plan: text("benefit_plan").notNull().default("starter_monthly"),
    duration_days: integer("duration_days").notNull().default(30),
    max_redemptions: integer("max_redemptions").notNull().default(1),
    redemption_count: integer("redemption_count").notNull().default(0),
    status: text("status").notNull().default("active"),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    created_by: text("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    code_hash_key: uniqueIndex("hirelix_redemption_codes_code_hash_key").on(t.code_hash),
    status_expires_idx: index("idx_hirelix_redemption_codes_status_expires").on(
      t.status,
      t.expires_at,
    ),
  }),
);

export const hirelix_redemptions = pgTable(
  "hirelix_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code_id: uuid("code_id").notNull(),
    user_id: uuid("user_id").notNull(),
    benefit_plan: text("benefit_plan").notNull().default("starter_monthly"),
    status: text("status").notNull().default("active"),
    redeemed_at: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    code_user_key: uniqueIndex("hirelix_redemptions_code_user_key").on(t.code_id, t.user_id),
    user_benefit_key: uniqueIndex("hirelix_redemptions_user_benefit_key").on(
      t.user_id,
      t.benefit_plan,
    ),
    user_status_ends_idx: index("idx_hirelix_redemptions_user_status_ends").on(
      t.user_id,
      t.status,
      t.ends_at,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Growth outreach tracking
// ---------------------------------------------------------------------------
export const hirelix_growth_outreach_clicks = pgTable(
  "hirelix_growth_outreach_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email_id: text("email_id").notNull(),
    batch_id: text("batch_id"),
    recipient: text("recipient"),
    company: text("company"),
    source_url: text("source_url"),
    destination_url: text("destination_url").notNull(),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    referer: text("referer"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    email_created_idx: index("idx_hirelix_growth_outreach_clicks_email_created").on(
      t.email_id,
      t.created_at,
    ),
    batch_created_idx: index("idx_hirelix_growth_outreach_clicks_batch_created").on(
      t.batch_id,
      t.created_at,
    ),
  }),
);

export const hirelix_growth_landing_events = pgTable(
  "hirelix_growth_landing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    event_type: text("event_type").notNull(),
    visitor_id: text("visitor_id"),
    session_id: text("session_id"),
    email_id: text("email_id"),
    batch_id: text("batch_id"),
    recipient: text("recipient"),
    company: text("company"),
    page_url: text("page_url"),
    referrer: text("referrer"),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    email_created_idx: index("idx_hirelix_growth_landing_events_email_created").on(
      t.email_id,
      t.created_at,
    ),
    event_created_idx: index("idx_hirelix_growth_landing_events_event_created").on(
      t.event_type,
      t.created_at,
    ),
    session_created_idx: index("idx_hirelix_growth_landing_events_session_created").on(
      t.session_id,
      t.created_at,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Private beta invites
// ---------------------------------------------------------------------------
export const hirelix_beta_invites = pgTable(
  "hirelix_beta_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invite_code: text("invite_code").notNull().unique(),
    recipient_email: text("recipient_email"),
    first_name: text("first_name"),
    company: text("company"),
    source: text("source").notNull().default("manual"),
    invited_by_user_id: uuid("invited_by_user_id"),
    batch_id: text("batch_id"),
    campaign: text("campaign"),
    status: text("status").notNull().default("reserved"),
    seat_number: integer("seat_number"),
    free_search_limit: integer("free_search_limit").notNull().default(1),
    referral_limit: integer("referral_limit").notNull().default(3),
    activated_user_id: uuid("activated_user_id"),
    clicked_at: timestamp("clicked_at", { withTimezone: true }),
    activated_at: timestamp("activated_at", { withTimezone: true }),
    used_at: timestamp("used_at", { withTimezone: true }),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    status_created_idx: index("idx_hirelix_beta_invites_status_created").on(
      t.status,
      t.created_at,
    ),
    activated_user_idx: index("idx_hirelix_beta_invites_activated_user").on(
      t.activated_user_id,
    ),
    invited_by_idx: index("idx_hirelix_beta_invites_invited_by").on(
      t.invited_by_user_id,
    ),
    source_created_idx: index("idx_hirelix_beta_invites_source_created").on(
      t.source,
      t.created_at,
    ),
  }),
);

export const hirelix_beta_invite_events = pgTable(
  "hirelix_beta_invite_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invite_code: text("invite_code").notNull(),
    event_type: text("event_type").notNull(),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    referer: text("referer"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invite_created_idx: index("idx_hirelix_beta_invite_events_invite_created").on(
      t.invite_code,
      t.created_at,
    ),
    event_created_idx: index("idx_hirelix_beta_invite_events_event_created").on(
      t.event_type,
      t.created_at,
    ),
  }),
);

// ---------------------------------------------------------------------------
// LLM usage events
// ---------------------------------------------------------------------------
export const hirelix_llm_usage_events = pgTable(
  "hirelix_llm_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    search_id: uuid("search_id"),
    job_id: uuid("job_id"),
    user_id: uuid("user_id"),
    stage: text("stage").notNull(),
    status: text("status").notNull().default("success"),
    model: text("model").notNull(),
    provider: text("provider").notNull().default("deepseek"),
    attempt: integer("attempt").notNull().default(1),
    batch_size: integer("batch_size"),
    candidate_indexes: integer("candidate_indexes").array(),
    input_tokens: integer("input_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull().default(0),
    total_tokens: integer("total_tokens").notNull().default(0),
    cached_input_tokens: integer("cached_input_tokens").notNull().default(0),
    cache_miss_input_tokens: integer("cache_miss_input_tokens").notNull().default(0),
    max_output_tokens: integer("max_output_tokens"),
    thinking: text("thinking"),
    reasoning_effort: text("reasoning_effort"),
    latency_ms: integer("latency_ms"),
    error_message: text("error_message"),
    request_hash: text("request_hash"),
    response_hash: text("response_hash"),
    request_payload: jsonb("request_payload"),
    response_payload: jsonb("response_payload"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    search_created_idx: index("idx_hirelix_llm_usage_events_search_created").on(
      t.search_id,
      t.created_at,
    ),
    stage_created_idx: index("idx_hirelix_llm_usage_events_stage_created").on(
      t.stage,
      t.created_at,
    ),
    model_created_idx: index("idx_hirelix_llm_usage_events_model_created").on(
      t.model,
      t.created_at,
    ),
  }),
);

// ---------------------------------------------------------------------------
// GitHub identity / profile cache
// ---------------------------------------------------------------------------
export const hirelix_github_identity_cache = pgTable(
  "hirelix_github_identity_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fingerprint: text("fingerprint").notNull().unique(),
    linkedin_url: text("linkedin_url"),
    candidate_name: text("candidate_name"),
    current_company: text("current_company"),
    github_login: text("github_login"),
    github_url: text("github_url"),
    status: text("status").notNull(),
    discovery_source: text("discovery_source"),
    confidence: numeric("confidence"),
    evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expires_idx: index("idx_hirelix_github_identity_cache_expires_at").on(t.expires_at),
  }),
);

export const hirelix_github_profile_cache = pgTable(
  "hirelix_github_profile_cache",
  {
    github_login: text("github_login").primaryKey(),
    raw_profile: jsonb("raw_profile").notNull().default(sql`'{}'::jsonb`),
    contribution_signals: jsonb("contribution_signals").notNull().default(sql`'{}'::jsonb`),
    technical_signals: jsonb("technical_signals").notNull().default(sql`'{}'::jsonb`),
    fetched_at: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expires_idx: index("idx_hirelix_github_profile_cache_expires_at").on(t.expires_at),
  }),
);

// ---------------------------------------------------------------------------
// Public evidence
// ---------------------------------------------------------------------------
export const hirelix_public_evidence_jobs = pgTable(
  "hirelix_public_evidence_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidate_id: uuid("candidate_id").notNull().unique(),
    search_id: uuid("search_id").notNull(),
    user_id: uuid("user_id"),
    usage_event_id: uuid("usage_event_id"),
    status: text("status").notNull().default("queued"),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error: text("last_error"),
    available_at: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    locked_at: timestamp("locked_at", { withTimezone: true }),
    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    status_avail_idx: index("idx_hirelix_public_evidence_jobs_status_available").on(
      t.status,
      t.available_at,
    ),
    search_idx: index("idx_hirelix_public_evidence_jobs_search").on(t.search_id),
  }),
);

export const hirelix_public_evidence_items = pgTable(
  "hirelix_public_evidence_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidate_id: uuid("candidate_id").notNull(),
    search_id: uuid("search_id").notNull(),
    source_type: text("source_type").notNull(),
    source_url: text("source_url").notNull(),
    title: text("title"),
    snippet: text("snippet"),
    identity_status: text("identity_status").notNull().default("uncertain"),
    identity_confidence: numeric("identity_confidence"),
    relevance_score: integer("relevance_score"),
    evidence_strength: text("evidence_strength").notNull().default("weak"),
    evidence_summary: text("evidence_summary").notNull(),
    outreach_angle: text("outreach_angle"),
    raw_metadata: jsonb("raw_metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unique_candidate_url: uniqueIndex(
      "hirelix_public_evidence_items_candidate_id_source_url_key",
    ).on(t.candidate_id, t.source_url),
    candidate_idx: index("idx_hirelix_public_evidence_items_candidate").on(
      t.candidate_id,
      t.relevance_score,
    ),
    search_idx: index("idx_hirelix_public_evidence_items_search").on(
      t.search_id,
      t.evidence_strength,
    ),
  }),
);

export const hirelix_public_source_cache = pgTable(
  "hirelix_public_source_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidate_fingerprint: text("candidate_fingerprint").notNull(),
    source_url_hash: text("source_url_hash").notNull(),
    source_url: text("source_url").notNull(),
    source_type: text("source_type").notNull(),
    identity_verdict: text("identity_verdict"),
    identity_confidence: numeric("identity_confidence"),
    page_title: text("page_title"),
    page_text_summary: text("page_text_summary"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unique_fingerprint_hash: uniqueIndex(
      "hirelix_public_source_cache_candidate_fingerprint_source_url_hash_key",
    ).on(t.candidate_fingerprint, t.source_url_hash),
    expires_idx: index("idx_hirelix_public_source_cache_expires").on(t.expires_at),
  }),
);

// ---------------------------------------------------------------------------
// Bright Data dataset snapshots cache
// ---------------------------------------------------------------------------
export const hirelix_dataset_snapshots = pgTable(
  "hirelix_dataset_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshot_id: text("snapshot_id").notNull().unique(),
    round: text("round").notNull(),
    filter_hash: text("filter_hash").notNull(),
    filter_summary: jsonb("filter_summary"),
    dataset_size: integer("dataset_size"),
    records_limit: integer("records_limit"),
    cost: numeric("cost"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    lookup_idx: index("hirelix_dataset_snapshots_lookup").on(t.filter_hash, t.expires_at),
  }),
);

export const hirelix_snapshot_profiles = pgTable(
  "hirelix_snapshot_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshot_id: text("snapshot_id").notNull(),
    search_id: uuid("search_id").notNull(),
    job_id: uuid("job_id").notNull(),
    source_round: text("source_round").notNull().default("standard"),
    record_index: integer("record_index"),
    linkedin_id: text("linkedin_id"),
    profile_url: text("profile_url"),
    raw_data: jsonb("raw_data").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    by_snapshot: index("hirelix_snapshot_profiles_by_snapshot").on(t.snapshot_id),
    by_search: index("hirelix_snapshot_profiles_by_search").on(t.search_id),
    by_round_order: index("hirelix_snapshot_profiles_by_round_order").on(
      t.snapshot_id,
      t.source_round,
      t.record_index,
    ),
    // Note: original SQL uses a partial unique index `WHERE linkedin_id IS NOT NULL`.
    // Drizzle's uniqueIndex does not support WHERE clauses; we recreate this in
    // the VPS init SQL (`migrations/00_vps_init.sql`) instead of via Drizzle.
  }),
);

// ---------------------------------------------------------------------------
// better-auth core tables (user, session, account, verification).
//
// We keep all `hirelix_*.user_id` columns typed as `uuid` and store the
// better-auth `user.id` (a uuid string generated by us via the
// `advanced.database.generateId` hook) so that existing data in the
// `hirelix_*` tables keeps working unchanged.
// ---------------------------------------------------------------------------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Convenience: union of all tables (useful for tooling)
// ---------------------------------------------------------------------------
export const schema = {
  hirelix_searches,
  hirelix_search_shares,
  hirelix_candidates,
  hirelix_search_jobs,
  hirelix_search_notifications,
  hirelix_github_enrichment_jobs,
  hirelix_user_settings,
  hirelix_usage_events,
  hirelix_billing_events,
  hirelix_redemption_codes,
  hirelix_redemptions,
  hirelix_growth_outreach_clicks,
  hirelix_growth_landing_events,
  hirelix_beta_invites,
  hirelix_beta_invite_events,
  hirelix_llm_usage_events,
  hirelix_github_identity_cache,
  hirelix_github_profile_cache,
  hirelix_public_evidence_jobs,
  hirelix_public_evidence_items,
  hirelix_public_source_cache,
  hirelix_dataset_snapshots,
  hirelix_snapshot_profiles,
  user,
  session,
  account,
  verification,
};
