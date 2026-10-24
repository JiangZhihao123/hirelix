import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  internalAnalyticsUsers,
  analyticsCoverage,
  analyticsDatabaseIsLocal,
} from "./telemetry-server";

export type AnalyticsFilters = {
  from: string;
  to: string;
  timezone: string;
  source: string;
  campaign: string;
  content: string;
  attribution: "first" | "latest";
  device: string;
  page: string;
  includeInternal: boolean;
};
export function parseAnalyticsFilters(
  params: URLSearchParams,
  now = new Date(),
): AnalyticsFilters {
  const to = params.get("to") || now.toISOString(),
    from =
      params.get("from") ||
      new Date(now.getTime() - 7 * 86400000).toISOString();
  const start = new Date(from),
    end = new Date(to),
    timezone = params.get("timezone") || "Asia/Shanghai";
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    +end <= +start ||
    +end - +start > 93 * 86400000
  )
    throw new Error("Invalid range");
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  const attribution = params.get("attribution") || "latest";
  if (attribution !== "first" && attribution !== "latest") throw new Error("Invalid attribution model");
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    timezone,
    source: (params.get("source") || "all").slice(0, 120),
    campaign: (params.get("campaign") || "all").slice(0, 120),
    content: (params.get("content") || "all").slice(0, 120),
    attribution,
    device: (params.get("device") || "all").slice(0, 20),
    page: (params.get("page") || "all").slice(0, 240),
    includeInternal: params.get("internal") === "1",
  };
}
export type AnalyticsRow = Record<string, string | number | null>;
const rows = (result: unknown) => result as AnalyticsRow[];

export async function getProductAnalytics(f: AnalyticsFilters) {
  const internal = internalAnalyticsUsers();
  const local = await analyticsDatabaseIsLocal();
  const excluded = sql`SELECT id FROM "user" WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(internal.ids)}::jsonb)) OR lower(email) IN (SELECT jsonb_array_elements_text(${JSON.stringify(internal.emails)}::jsonb))`;
  const dimension = (field: string, fallback: string) => f.attribution === "first"
    ? sql`coalesce(nullif(e.metadata->>${"first_" + field},''),${fallback})`
    : sql`coalesce(nullif(e.metadata->>${"latest_" + field},''),nullif(e.metadata->>${field},''),${fallback})`;
  const source = dimension("traffic_source", "unattributed"), campaign = dimension("utm_campaign", "none"),
    content = dimension("utm_content", "none"), medium = dimension("utm_medium", "none");
  // An authenticated event links earlier anonymous events from the same visit.
  // A visitor id remains an estimated browser, never a unique person.
  const base = sql`WITH identities AS (
    SELECT session_id, CASE WHEN count(DISTINCT metadata->>'user_id')=1 THEN max(metadata->>'user_id') END AS account_id,
      bool_or(coalesce((metadata->>'internal')::boolean,false)) AS internal
    FROM hirelix_growth_landing_events WHERE metadata->>'telemetry_version'='2'
      AND created_at>=${f.from}::timestamptz AND created_at<${f.to}::timestamptz GROUP BY session_id
  ), events AS (
    SELECT e.*, coalesce(e.metadata->>'user_id',i.account_id) AS account_id, ${source} AS source,
      ${campaign} AS campaign,${content} AS content,${medium} AS medium,
      coalesce(e.metadata->>'device_type','unknown') AS device,
      regexp_replace(e.page_url,'^https?://[^/]+','','i') AS route
    FROM hirelix_growth_landing_events e LEFT JOIN identities i ON i.session_id=e.session_id
    WHERE e.metadata->>'telemetry_version'='2' AND e.created_at>=${f.from}::timestamptz AND e.created_at<${f.to}::timestamptz
      AND (${f.includeInternal} OR (NOT coalesce(i.internal,false) AND NOT coalesce((e.metadata->>'internal')::boolean,false) AND coalesce(e.metadata->>'user_id',i.account_id,'') NOT IN (${excluded})))
      AND (${f.source}='all' OR ${source}=${f.source})
      AND (${f.campaign}='all' OR ${campaign}=${f.campaign})
      AND (${f.content}='all' OR ${content}=${f.content})
      AND (${f.device}='all' OR e.metadata->>'device_type'=${f.device})
      AND (${f.page}='all' OR regexp_replace(e.page_url,'^https?://[^/]+','','i')=${f.page})
  )`;
  const qualifyUser = sql`(${f.includeInternal} OR (${!local} AND u.id NOT IN (${excluded}))) AND
    (${f.source}='all' AND ${f.campaign}='all' AND ${f.content}='all' AND ${f.device}='all' AND ${f.page}='all' OR u.id IN (SELECT account_id FROM events))`;
  const work = sql`, users AS (SELECT u.id,u."createdAt" AS created_at FROM "user" u WHERE ${qualifyUser}),
    outcomes AS (
      SELECT d.user_id::text AS user_id,d.created_at,'recommendation' AS kind FROM hirelix_private_deliverables d
      WHERE d.kind='submission' AND length(trim(d.content))>0 AND cardinality(d.person_ids)>0
      UNION ALL SELECT r.user_id::text,coalesce((SELECT min(v.created_at) FROM hirelix_private_versions v WHERE v.user_id=r.user_id AND v.entity_id=r.id AND v.entity_type='role_candidate' AND v.snapshot->'assessment'<>'{}'::jsonb),r.updated_at),'assessment' FROM hirelix_private_role_candidates r WHERE r.assessment<>'{}'::jsonb
    ), activity AS (
      SELECT user_id::text AS user_id,created_at FROM hirelix_agent_messages WHERE role='user' AND conversation_id IS NOT NULL AND coalesce(metadata->>'delivery','sent') NOT IN ('removed','queued')
    )`;
  const queries = await Promise.all([
    db.execute(sql`${base} SELECT count(*) FILTER(WHERE event_type='page_view')::int AS page_views,
      count(DISTINCT visitor_id) FILTER(WHERE event_type='page_view')::int AS visitors,
      count(DISTINCT session_id) FILTER(WHERE event_type='page_view')::int AS sessions,
      count(DISTINCT account_id)::int AS signed_in_accounts,
      count(*) FILTER(WHERE event_type IN ('client_error','product_action_failed'))::int AS errors,
      count(*) FILTER(WHERE event_type IN ('personal_agent_cta_click','try_for_free_click'))::int AS trial_clicks,
      count(DISTINCT session_id) FILTER(WHERE event_type='google_signin_click')::int AS login_attempts,
      count(*) FILTER(WHERE event_type='document_view')::int AS document_views,
      count(*) FILTER(WHERE event_type='document_export')::int AS document_exports,
      count(*) FILTER(WHERE event_type='document_copy')::int AS document_copies FROM events`),
    db.execute(sql`${base}, pages AS (SELECT metadata->>'page_id' AS page_id, max((metadata->>'active_read_seconds')::numeric) AS active,
      max((metadata->>'page_stay_seconds')::numeric) AS stay,max((metadata->>'max_scroll_depth')::numeric) AS scroll FROM events WHERE event_type='session_summary' GROUP BY metadata->>'page_id')
      SELECT coalesce(round(avg(active)),0) AS active_seconds,coalesce(round(avg(stay)),0) AS stay_seconds,
      coalesce(round(avg(scroll)),0) AS scroll_percent,count(*)::int AS measured_pages FROM pages`),
    db.execute(sql`${base} SELECT to_char(created_at AT TIME ZONE ${f.timezone},'YYYY-MM-DD') AS day,
      count(*) FILTER(WHERE event_type='page_view')::int AS page_views,count(DISTINCT visitor_id)::int AS visitors,
      count(DISTINCT account_id)::int AS accounts FROM events GROUP BY day ORDER BY day`),
    db.execute(sql`${base} SELECT source,count(DISTINCT visitor_id)::int AS visitors,count(DISTINCT session_id)::int AS sessions,
      count(DISTINCT account_id)::int AS accounts,count(*) FILTER(WHERE event_type='page_view')::int AS page_views FROM events GROUP BY source ORDER BY sessions DESC`),
    db.execute(sql`${base}, totals AS (SELECT route,count(*) FILTER(WHERE event_type='page_view')::int AS page_views,
      count(DISTINCT session_id)::int AS sessions,count(*) FILTER(WHERE event_type='navigation_click')::int AS clicks,
      count(*) FILTER(WHERE event_type IN ('client_error','product_action_failed'))::int AS errors FROM events GROUP BY route),
      summaries AS (SELECT route,metadata->>'page_id' AS page_id,max((metadata->>'active_read_seconds')::numeric) AS active,max((metadata->>'max_scroll_depth')::numeric) AS scroll FROM events WHERE event_type='session_summary' GROUP BY route,page_id),
      engagement AS (SELECT route,round(avg(active)) AS active_seconds,round(avg(scroll)) AS scroll_percent,count(*)::int AS measured_pages FROM summaries GROUP BY route)
      SELECT t.*,e.active_seconds,e.scroll_percent,e.measured_pages FROM totals t LEFT JOIN engagement e USING(route) ORDER BY page_views DESC`),
    db.execute(
      sql`${base} SELECT device,coalesce(metadata->>'country','unknown') AS country,count(DISTINCT session_id)::int AS sessions FROM events GROUP BY device,country ORDER BY sessions DESC`,
    ),
    db.execute(sql`${base} SELECT event_type,coalesce(metadata->>'endpoint',metadata->>'action',metadata->>'section_id',metadata->>'cta_location',metadata->>'plan','—') AS action,
      count(*)::int AS events,count(DISTINCT account_id)::int AS accounts,
      round(avg((metadata->>'duration_ms')::numeric)) AS average_ms FROM events WHERE event_type NOT IN ('session_summary','web_vital') GROUP BY event_type,action ORDER BY events DESC`),
    db.execute(sql`${base} SELECT event_type,route,coalesce(metadata->>'endpoint',metadata->>'action','—') AS action,
      metadata->>'status' AS status,count(*)::int AS occurrences FROM events WHERE event_type IN ('client_error','product_action_failed') GROUP BY event_type,route,action,status ORDER BY occurrences DESC`),
    db.execute(sql`${base} SELECT metric,round(percentile_cont(0.75) WITHIN GROUP(ORDER BY value)::numeric) AS p75_ms,count(*)::int AS samples FROM (
      SELECT metadata->>'page_id' AS page_id,metadata->>'metric' AS metric,max((metadata->>'value')::numeric) AS value FROM events WHERE event_type='web_vital' GROUP BY page_id,metric
    ) v GROUP BY metric`),
    db.execute(sql`${base} SELECT id,created_at,event_type,route,source,device,left(visitor_id,8) AS browser,
      left(account_id,8) AS account,metadata->>'endpoint' AS endpoint,metadata->>'action' AS action,metadata->>'status' AS status
      FROM events ORDER BY created_at DESC,id DESC LIMIT 200`),
    db.execute(sql`${base}${work} SELECT
      (SELECT count(*)::int FROM users WHERE created_at>=${f.from}::timestamptz AND created_at<${f.to}::timestamptz) AS new_accounts,
      (SELECT count(DISTINCT a.user_id)::int FROM activity a JOIN users u ON u.id=a.user_id WHERE a.created_at>=${f.from}::timestamptz AND a.created_at<${f.to}::timestamptz) AS conversation_accounts,
      (SELECT count(DISTINCT o.user_id)::int FROM outcomes o JOIN users u ON u.id=o.user_id WHERE o.created_at>=${f.from}::timestamptz AND o.created_at<${f.to}::timestamptz) AS outcome_accounts,
      (SELECT count(*)::int FROM users u WHERE u.created_at>=${f.from}::timestamptz AND u.created_at<${f.to}::timestamptz AND EXISTS(SELECT 1 FROM hirelix_private_files f WHERE f.user_id::text=u.id AND f.created_at<${f.to}::timestamptz)) AS new_accounts_with_files,
      (SELECT count(*)::int FROM users u WHERE u.created_at>=${f.from}::timestamptz AND u.created_at<${f.to}::timestamptz AND EXISTS(SELECT 1 FROM outcomes o WHERE o.user_id=u.id AND o.created_at<${f.to}::timestamptz)) AS new_accounts_with_outcome,
      (SELECT count(*)::int FROM hirelix_private_files d JOIN users u ON u.id=d.user_id::text WHERE d.created_at>=${f.from}::timestamptz AND d.created_at<${f.to}::timestamptz) AS files,
      (SELECT count(*)::int FROM hirelix_private_deliverables d JOIN users u ON u.id=d.user_id::text WHERE d.created_at>=${f.from}::timestamptz AND d.created_at<${f.to}::timestamptz) AS documents,
      (SELECT count(*)::int FROM hirelix_private_records d JOIN users u ON u.id=d.user_id::text WHERE d.kind='feedback' AND d.person_id IS NOT NULL AND d.created_at>=${f.from}::timestamptz AND d.created_at<${f.to}::timestamptz) AS feedback,
      (SELECT count(*)::int FROM hirelix_private_roles d JOIN users u ON u.id=d.user_id::text WHERE d.created_at>=${f.from}::timestamptz AND d.created_at<${f.to}::timestamptz) AS roles`),
    db.execute(sql`${base}${work}, first_outcomes AS (SELECT user_id,min(created_at) AS first_at FROM outcomes GROUP BY user_id)
      SELECT to_char(u.created_at AT TIME ZONE ${f.timezone},'YYYY-MM-DD') AS cohort,count(*)::int AS accounts,
      count(*) FILTER(WHERE o.first_at<${f.to}::timestamptz)::int AS activated,
      count(*) FILTER(WHERE u.created_at+interval '2 days'<=${f.to}::timestamptz)::int AS d1_eligible,
      count(*) FILTER(WHERE u.created_at+interval '2 days'<=${f.to}::timestamptz AND EXISTS(SELECT 1 FROM activity a WHERE a.user_id=u.id AND a.created_at>=u.created_at+interval '1 day' AND a.created_at<u.created_at+interval '2 days'))::int AS d1_returned,
      count(*) FILTER(WHERE u.created_at+interval '8 days'<=${f.to}::timestamptz)::int AS d7_eligible,
      count(*) FILTER(WHERE u.created_at+interval '8 days'<=${f.to}::timestamptz AND EXISTS(SELECT 1 FROM activity a WHERE a.user_id=u.id AND a.created_at>=u.created_at+interval '7 days' AND a.created_at<u.created_at+interval '8 days'))::int AS d7_returned
      FROM users u LEFT JOIN first_outcomes o ON o.user_id=u.id WHERE u.created_at>=${f.from}::timestamptz AND u.created_at<${f.to}::timestamptz GROUP BY cohort ORDER BY cohort`),
    db.execute(sql`${base}${work} SELECT j.kind,j.status,count(*)::int AS jobs,
      round(percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM (j.updated_at-j.created_at)))::numeric) AS median_seconds,
      count(*) FILTER(WHERE j.attempts>1)::int AS retried,
      count(*) FILTER(WHERE j.payload ? 'schedule_id')::int AS scheduled
      FROM hirelix_private_jobs j JOIN users u ON u.id=j.user_id::text WHERE j.created_at>=${f.from}::timestamptz AND j.created_at<${f.to}::timestamptz GROUP BY j.kind,j.status ORDER BY jobs DESC`),
    db.execute(sql`${base}${work} SELECT count(*)::int AS new_conversations,count(DISTINCT c.user_id)::int AS accounts,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM hirelix_private_conversations p WHERE p.user_id=c.user_id AND p.created_at<c.created_at))::int AS subsequent_conversations
      FROM hirelix_private_conversations c JOIN users u ON u.id=c.user_id::text WHERE c.created_at>=${f.from}::timestamptz AND c.created_at<${f.to}::timestamptz`),
    analyticsCoverage(),
    db.execute(sql`${base}${work}, registered AS (
      SELECT DISTINCT ON (u.id) u.id,u.created_at,e.source,e.medium,e.campaign,e.content
      FROM events e JOIN users u ON u.id=e.account_id
      WHERE e.event_type='signup_success' AND e.metadata->>'registration_verified'='true'
        AND u.created_at>=${f.from}::timestamptz AND u.created_at<${f.to}::timestamptz
      ORDER BY u.id,e.created_at,e.id
    ), traffic AS (
      SELECT source,medium,campaign,content,count(*)::int AS page_views,count(DISTINCT visitor_id)::int AS visitors,
        count(DISTINCT session_id)::int AS sessions FROM events WHERE event_type='page_view' GROUP BY source,medium,campaign,content
    ), conversions AS (
      SELECT r.source,r.medium,r.campaign,r.content,count(*)::int AS registrations,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM hirelix_private_jobs j WHERE j.user_id::text=r.id
          AND j.kind IN ('import','assessment','deliverable','revision','brief_proposal','retrieval') AND j.status='done'
          AND j.created_at>=r.created_at AND j.updated_at<${f.to}::timestamptz))::int AS task_accounts,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM activity a WHERE a.user_id=r.id AND a.created_at>=r.created_at+interval '24 hours'
          AND a.created_at<${f.to}::timestamptz))::int AS returned_accounts,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM hirelix_billing_events b WHERE b.user_id::text=r.id AND b.event_type='transaction.completed'
          AND b.created_at>=r.created_at AND b.created_at<${f.to}::timestamptz))::int AS transaction_accounts
      FROM registered r GROUP BY r.source,r.medium,r.campaign,r.content
    ) SELECT coalesce(t.source,c.source) AS source,coalesce(t.medium,c.medium) AS medium,coalesce(t.campaign,c.campaign) AS campaign,
      coalesce(t.content,c.content) AS content,coalesce(t.visitors,0)::int AS visitors,coalesce(t.sessions,0)::int AS sessions,
      coalesce(t.page_views,0)::int AS page_views,coalesce(c.registrations,0)::int AS registrations,
      coalesce(c.task_accounts,0)::int AS task_accounts,coalesce(c.returned_accounts,0)::int AS returned_accounts,
      coalesce(c.transaction_accounts,0)::int AS transaction_accounts
      FROM traffic t FULL JOIN conversions c USING(source,medium,campaign,content) ORDER BY sessions DESC,registrations DESC,source,content`),
    db.execute(sql`${base}${work} SELECT coalesce(d.snapshot->>'provider','google') AS provider,d.status,count(*)::int AS emails,count(DISTINCT d.user_id)::int AS accounts
      FROM hirelix_private_email_deliveries d JOIN users u ON u.id=d.user_id::text WHERE d.created_at>=${f.from}::timestamptz AND d.created_at<${f.to}::timestamptz GROUP BY provider,d.status ORDER BY emails DESC`),
    db.execute(
      sql`${base}${work} SELECT s.subscription_plan AS plan,s.subscription_status AS status,count(*)::int AS accounts FROM hirelix_user_settings s JOIN users u ON u.id=s.user_id::text GROUP BY plan,status ORDER BY accounts DESC`,
    ),
    db.execute(
      sql`${base}${work} SELECT b.event_type,count(*)::int AS events,count(DISTINCT b.user_id)::int AS accounts FROM hirelix_billing_events b JOIN users u ON u.id=b.user_id::text WHERE b.created_at>=${f.from}::timestamptz AND b.created_at<${f.to}::timestamptz GROUP BY b.event_type ORDER BY events DESC`,
    ),
    db.execute(sql`${base}, visits AS (SELECT session_id,min(created_at) AS started_at,max(account_id) AS account_id,
      bool_or(event_type IN ('personal_agent_cta_click','try_for_free_click')) AS cta,
      bool_or(event_type='google_signin_click') AS login,
      bool_or(event_type='page_view') AS page_view,
      bool_or(event_type='signup_success' AND metadata->>'registration_verified'='true') AS signup
      FROM events WHERE session_id IS NOT NULL GROUP BY session_id)
      SELECT count(*) FILTER(WHERE page_view)::int AS visits,count(*) FILTER(WHERE cta)::int AS cta_visits,count(*) FILTER(WHERE login)::int AS login_visits,
      count(*) FILTER(WHERE signup)::int AS signup_visits FROM visits`),
  ]);
  return {
    filters: f,
    generatedAt: new Date().toISOString(),
    coverageSince: queries[14],
    internalConfigured: internal.ids.length + internal.emails.length,
    campaigns: rows(queries[15]),
    mail: rows(queries[16]),
    subscriptions: rows(queries[17]),
    billing: rows(queries[18]),
    acquisition: rows(queries[19])[0],
    traffic: rows(queries[0])[0],
    engagement: rows(queries[1])[0],
    daily: rows(queries[2]),
    sources: rows(queries[3]),
    pages: rows(queries[4]),
    audience: rows(queries[5]),
    actions: rows(queries[6]),
    errors: rows(queries[7]),
    vitals: rows(queries[8]),
    recent: rows(queries[9]),
    product: rows(queries[10])[0],
    retention: rows(queries[11]),
    jobs: rows(queries[12]),
    continuation: rows(queries[13])[0],
  };
}
export type ProductAnalytics = Awaited<ReturnType<typeof getProductAnalytics>>;
