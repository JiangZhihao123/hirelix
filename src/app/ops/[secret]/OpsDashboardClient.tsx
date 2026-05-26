"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  Filter,
  Flame,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Search,
  UserCheck,
} from "lucide-react";

import type { OpsConversionData, OpsRange } from "@/lib/ops-conversion";

const ranges: Array<{ key: OpsRange; label: string }> = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "7d", label: "最近7天" },
  { key: "30d", label: "最近30天" },
];

const numberFormatter = new Intl.NumberFormat("zh-CN");

export function OpsDashboardClient({ secret }: { secret: string }) {
  const [range, setRange] = useState<OpsRange>("today");
  const [data, setData] = useState<OpsConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData(selectedRange = range) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ops/conversion?secret=${encodeURIComponent(secret)}&range=${selectedRange}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("看板数据加载失败");
      setData((await response.json()) as OpsConversionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "看板数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(range);
    // loadData intentionally omitted so range changes are the only fetch trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const maxPageBucket = useMemo(
    () => Math.max(1, ...(data?.duration.pageStayBuckets.map((bucket) => bucket.count) ?? [0])),
    [data],
  );
  const maxActiveBucket = useMemo(
    () => Math.max(1, ...(data?.duration.activeReadBuckets.map((bucket) => bucket.count) ?? [0])),
    [data],
  );

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-sky-700">Hirelix</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              访问转化看板
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              只看真人访问、停留秒数、点击、登录和第一次搜索。机器和预览流量单独过滤。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              {ranges.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    range === item.key
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading && !data ? (
          <div className="mt-10 flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取看板数据...
          </div>
        ) : null}

        {data ? (
          <div className="mt-6 space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-5 lg:grid-cols-[1fr_28rem] lg:items-start">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {data.range.label}
                  </p>
                  <p className="mt-2 text-xl font-bold leading-8 text-slate-950">
                    {data.diagnosis}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MetricCard icon={UserCheck} label="真人访问" value={data.summary.humanVisits} tone="blue" />
                    <MetricCard icon={MousePointerClick} label="有效点击" value={data.summary.effectiveClicks} tone="slate" />
                    <MetricCard icon={CheckCircle2} label="成功登录" value={data.summary.successfulLogins} tone="green" />
                    <MetricCard icon={Search} label="创建搜索" value={data.summary.createdSearches} tone="amber" />
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-950">
                    <Flame className="h-4 w-4 text-amber-700" />
                    {data.range.label}最该看
                  </div>
                  <div className="space-y-2">
                    {data.actionItems.slice(0, 3).map((item) => (
                      <ActionItemRow key={item.title} item={item} />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Panel title="人群分层">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.visitorSegments.map((segment) => (
                    <div key={segment.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800">{segment.label}</p>
                        <p className="text-xl font-bold tabular-nums">{formatNumber(segment.count)}</p>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{segment.note}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="关键秒数">
                <div className="grid grid-cols-2 gap-3">
                  <PlainStat label="中位停留" value={`${data.summary.medianStaySeconds}秒`} />
                  <PlainStat label="平均有效阅读" value={`${data.summary.averageActiveSeconds}秒`} />
                  <PlainStat label="10秒内离开" value={data.summary.leftWithin10Seconds} />
                  <PlainStat label="30秒以上" value={data.summary.stayed30Seconds} />
                  <PlainStat label="60秒以上" value={data.summary.stayed60Seconds} />
                  <PlainStat label="180秒以上" value={data.summary.stayed180Seconds} />
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <Panel title="高意向访客">
                {data.highIntentSessions.length === 0 ? (
                  <EmptyState text="还没有高意向访客" />
                ) : (
                  <div className="space-y-2">
                    {data.highIntentSessions.map((session, index) => (
                      <div key={`${session.lastEventAt}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{session.reason}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {session.source} · 最后动作：{session.lastAction}
                            </p>
                          </div>
                          <span className="text-xs text-slate-500">{formatTime(session.lastEventAt)}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <MiniStat label="停留" value={`${session.staySeconds}秒`} />
                          <MiniStat label="有效阅读" value={`${session.activeReadSeconds}秒`} />
                          <MiniStat label="滚动" value={`${session.maxScrollDepth}%`} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="看到了哪里">
                {data.topSections.length === 0 ? (
                  <EmptyState text="还没有模块曝光数据" />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.topSections.map((section) => (
                      <div key={section.section} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <span className="text-sm font-medium text-slate-800">{section.section}</span>
                        <span className="text-sm font-bold tabular-nums">{formatNumber(section.views)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Panel title="停留多久">
                <div className="grid gap-5 md:grid-cols-2">
                  <BucketList
                    title="页面打开停留"
                    buckets={data.duration.pageStayBuckets}
                    max={maxPageBucket}
                  />
                  <BucketList
                    title="有效阅读停留"
                    buckets={data.duration.activeReadBuckets}
                    max={maxActiveBucket}
                  />
                </div>
              </Panel>

              <Panel title="掉在哪里">
                <div className="space-y-3">
                  {data.funnel.map((step) => (
                    <div key={step.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-700">{step.label}</span>
                        <span className="text-lg font-bold tabular-nums">{formatNumber(step.count)}</span>
                      </div>
                      {step.rateFromPrevious !== null ? (
                        <p className="mt-1 text-xs text-slate-500">到上一步的 {step.rateFromPrevious}%</p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">起点</p>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Panel title="从哪来的">
                {data.sources.length === 0 ? (
                  <EmptyState text="还没有真人来源数据" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                          <th className="py-2 pr-3 font-medium">来源</th>
                          <th className="py-2 pr-3 font-medium">真人访问</th>
                          <th className="py-2 pr-3 font-medium">中位停留</th>
                          <th className="py-2 pr-3 font-medium">认真看</th>
                          <th className="py-2 pr-3 font-medium">点击</th>
                          <th className="py-2 pr-3 font-medium">登录</th>
                          <th className="py-2 pr-3 font-medium">创建搜索</th>
                          <th className="py-2 pr-3 font-medium">点击率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.sources.map((source) => (
                          <tr key={source.source}>
                            <td className="py-3 pr-3 font-medium text-slate-900">{source.source}</td>
                            <td className="py-3 pr-3 tabular-nums">{source.humanVisits}</td>
                            <td className="py-3 pr-3 tabular-nums">{source.medianStaySeconds}秒</td>
                            <td className="py-3 pr-3 tabular-nums">{source.seriousReaders}</td>
                            <td className="py-3 pr-3 tabular-nums">{source.effectiveClicks}</td>
                            <td className="py-3 pr-3 tabular-nums">{source.successfulLogins}</td>
                            <td className="py-3 pr-3 tabular-nums">{source.createdSearches}</td>
                            <td className="py-3 pr-3 tabular-nums">{source.clickRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="已过滤流量">
                <div className="space-y-3">
                  {data.filteredTraffic.map((item) => (
                    <div key={item.kind} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        {item.kind === "data_center" ? (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        ) : (
                          <Filter className="h-4 w-4 text-slate-500" />
                        )}
                        {item.label}
                      </span>
                      <span className="font-bold tabular-nums">{formatNumber(item.count)}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <Panel title="访问 IP 溯源">
              {data.ipAttribution.length === 0 ? (
                <EmptyState text="还没有 IP 数据" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                        <th className="py-2 pr-3 font-medium">IP</th>
                        <th className="py-2 pr-3 font-medium">类型</th>
                        <th className="py-2 pr-3 font-medium">地区</th>
                        <th className="py-2 pr-3 font-medium">归属</th>
                        <th className="py-2 pr-3 font-medium">访问</th>
                        <th className="py-2 pr-3 font-medium">真人</th>
                        <th className="py-2 pr-3 font-medium">过滤</th>
                        <th className="py-2 pr-3 font-medium">最后出现</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.ipAttribution.map((item) => (
                        <tr key={item.ipAddress}>
                          <td className="py-3 pr-3 font-mono text-xs text-slate-700">{item.maskedIp}</td>
                          <td className="py-3 pr-3">
                            <NetworkTypeBadge type={item.networkType} />
                          </td>
                          <td className="py-3 pr-3 text-slate-700">{formatLocation(item)}</td>
                          <td className="max-w-[18rem] truncate py-3 pr-3 text-slate-600">
                            {item.org || item.asn || "未知"}
                          </td>
                          <td className="py-3 pr-3 tabular-nums">{item.sessions}</td>
                          <td className="py-3 pr-3 tabular-nums">{item.humanSessions}</td>
                          <td className="py-3 pr-3 tabular-nums">{item.filteredSessions}</td>
                          <td className="py-3 pr-3 text-slate-500">{formatTime(item.lastSeenAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="最近真人行为">
              {data.recentHumanEvents.length === 0 ? (
                <EmptyState text={`${data.range.label}还没有真人访问`} />
              ) : (
                <div className="grid gap-2">
                  {data.recentHumanEvents.map((event, index) => (
                    <div
                      key={`${event.time}-${index}`}
                      className="grid gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm lg:grid-cols-[5rem_1fr_18rem]"
                    >
                      <span className="text-slate-500">{formatTime(event.time)}</span>
                      <div>
                        <div className="font-medium text-slate-900">
                          {event.label}
                          {event.details ? (
                            <span className="ml-2 font-normal text-slate-500">{event.details}</span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">来源：{event.source}</div>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600 lg:text-right">
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <span className="font-mono">{event.ip.maskedIp}</span>
                          <NetworkTypeBadge type={event.ip.networkType} />
                        </div>
                        <div>{formatLocation(event.ip)}</div>
                        <div className="truncate">{event.ip.org || event.ip.asn || "未知归属"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function NetworkTypeBadge({ type }: { type: "residential" | "business" | "data_center" | "unknown" }) {
  const config = {
    residential: { label: "住宅/移动", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    business: { label: "公司网络", className: "bg-sky-50 text-sky-700 ring-sky-200" },
    data_center: { label: "数据中心", className: "bg-amber-50 text-amber-800 ring-amber-200" },
    unknown: { label: "未知", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  }[type];

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${config.className}`}>
      {type === "data_center" ? <Database className="h-3 w-3" /> : null}
      {config.label}
    </span>
  );
}

function formatLocation(item: { country: string; region: string; city: string }) {
  return [item.country, item.region, item.city].filter(Boolean).join(" · ") || "未知";
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-4 text-base font-bold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  tone?: "slate" | "blue" | "green" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs opacity-75">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function ActionItemRow({
  item,
}: {
  item: {
    priority: "high" | "medium" | "low";
    title: string;
    detail: string;
  };
}) {
  const tone = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-slate-100 text-slate-600",
  }[item.priority];
  return (
    <div className="rounded-lg bg-white/75 px-3 py-2 ring-1 ring-amber-200/70">
      <div className="flex items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
          {item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低"}
        </span>
        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function PlainStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</p>
    </div>
  );
}

function BucketList({
  title,
  buckets,
  max,
}: {
  title: string;
  buckets: Array<{ key: string; label: string; count: number }>;
  max: number;
}) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Clock3 className="h-4 w-4 text-sky-600" />
        {title}
      </h3>
      <div className="space-y-2">
        {buckets.map((bucket) => (
          <div key={bucket.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-slate-600">{bucket.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{bucket.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-600"
                style={{ width: `${Math.max(4, Math.round((bucket.count / max) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
