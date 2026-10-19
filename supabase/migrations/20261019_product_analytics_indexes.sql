-- Reuse the first-party event store; no candidate or conversation content copied.
CREATE INDEX IF NOT EXISTS growth_events_created ON hirelix_growth_landing_events(created_at DESC);
CREATE INDEX IF NOT EXISTS growth_events_analytics_user ON hirelix_growth_landing_events((metadata->>'user_id'),created_at DESC) WHERE metadata->>'telemetry_version'='2';
CREATE INDEX IF NOT EXISTS growth_events_visitor ON hirelix_growth_landing_events(visitor_id,created_at DESC);
