/**
 * Drizzle ORM schema definitions for Hirelix self-hosted Postgres.
 *
 * Naming convention: snake_case for both column names and TypeScript property
 * names so existing call sites (which use snake_case keys returned by Supabase
 * client) can be migrated with minimal churn.
 *
 * Notes:
 * - `user_id` columns originally referenced `auth.users(id)` in Supabase. We
 *   keep them as plain `uuid` (no FK) because Auth lives in Supabase but data
 *   lives in our own Postgres.
 * - Defaults / NOT NULL constraints mirror `supabase/migrations/*.sql`.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
export const hirelix_candidates = pgTable(
  "hirelix_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    search_id: uuid("search_id").notNull(),
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
  hirelix_candidates,
  hirelix_search_jobs,
  hirelix_search_notifications,
  hirelix_github_enrichment_jobs,
  hirelix_user_settings,
  hirelix_usage_events,
  hirelix_billing_events,
  hirelix_growth_outreach_clicks,
  hirelix_growth_landing_events,
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
