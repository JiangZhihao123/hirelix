-- 落库每次 Bright Data snapshot 下载的原始 profile 数据
-- 目的：
--   1. 重跑 deep scoring 时可直接从库中读取，无需再次调用 Bright Data API
--   2. 保留被过滤掉的候选人数据，便于调试和分析
--   3. 按 (snapshot_id, linkedin_id) 做幂等 upsert，防止重复写入

CREATE TABLE public.hirelix_snapshot_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  TEXT        NOT NULL,              -- Bright Data snapshot ID
  search_id    UUID        NOT NULL               -- 关联的 hirelix_searches.id
                           REFERENCES public.hirelix_searches(id) ON DELETE CASCADE,
  job_id       UUID        NOT NULL               -- 关联的 hirelix_search_jobs.id
                           REFERENCES public.hirelix_search_jobs(id) ON DELETE CASCADE,
  source_round TEXT        NOT NULL DEFAULT 'standard', -- standard | hidden_gem | company_target
  record_index INTEGER,                           -- Bright Data 下载结果中的原始顺序
  linkedin_id  TEXT,                              -- Bright Data 的 linkedin_id / record.id
  profile_url  TEXT,                              -- LinkedIn 档案 URL
  raw_data     JSONB       NOT NULL,              -- 完整原始 record（下载后、adapt 前）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 按 snapshot_id 查所有 profile
CREATE INDEX hirelix_snapshot_profiles_by_snapshot
  ON public.hirelix_snapshot_profiles (snapshot_id);

-- 按 search_id 查某次搜索的全量召回
CREATE INDEX hirelix_snapshot_profiles_by_search
  ON public.hirelix_snapshot_profiles (search_id);

CREATE INDEX hirelix_snapshot_profiles_by_round_order
  ON public.hirelix_snapshot_profiles (snapshot_id, source_round, record_index);

-- 幂等保证：同一 snapshot 内 linkedin_id 唯一
CREATE UNIQUE INDEX hirelix_snapshot_profiles_unique_lid
  ON public.hirelix_snapshot_profiles (snapshot_id, linkedin_id)
  WHERE linkedin_id IS NOT NULL;
