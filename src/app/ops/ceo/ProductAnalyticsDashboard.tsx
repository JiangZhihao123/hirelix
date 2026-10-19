"use client";
import { useEffect, useState } from "react";
import type { ProductAnalytics, AnalyticsRow } from "@/lib/product-analytics";
const n = (value: unknown) =>
  new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
function Table({
  title,
  rows,
  columns,
  note,
}: {
  title: string;
  rows: AnalyticsRow[];
  columns: [string, string][];
  note?: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="mt-1 text-sm text-slate-500">{note}</p>}
      <div className="mt-4 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th
                  className="whitespace-nowrap border-b p-2 text-slate-500"
                  key={key}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100">
                {columns.map(([key]) => (
                  <td className="max-w-xs break-words p-2" key={key}>
                    {row[key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="py-8 text-center text-slate-500">
            当前筛选范围内暂无数据
          </p>
        )}
      </div>
    </section>
  );
}
export function ProductAnalyticsDashboard({ secret }: { secret: string }) {
  const [days, setDays] = useState("7"),
    [timezone, setTimezone] = useState("Asia/Shanghai"),
    [source, setSource] = useState("all"),
    [device, setDevice] = useState("all"),
    [page, setPage] = useState(""),
    [internal, setInternal] = useState(false);
  const [tab, setTab] = useState("overview"),
    [data, setData] = useState<ProductAnalytics | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [applied, setApplied] = useState({
    days: "7",
    timezone: "Asia/Shanghai",
    source: "all",
    device: "all",
    page: "",
    internal: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    const { days, timezone, source, device, page, internal } = applied;
    const end = new Date();
    const params = new URLSearchParams({
      from: new Date(+end - Number(days) * 86400000).toISOString(),
      to: end.toISOString(),
      timezone,
      source,
      device,
      page: page || "all",
      internal: internal ? "1" : "0",
    });
    fetch(`/api/ops/analytics?${params}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            r.status === 404 ? "访问凭据无效" : "数据加载失败，请重试",
          );
        return r.json();
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [secret, applied, revision]);
  const exportData = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hirelix-analytics.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const cards = data
    ? [
        ["浏览器访客", data.traffic.visitors],
        ["会话", data.traffic.sessions],
        ["页面浏览", data.traffic.page_views],
        ["新增账号", data.product.new_accounts],
        ["发起对话账号", data.product.conversation_accounts],
        ["有评估 / 推荐成果", data.product.outcome_accounts],
        ["页面有效阅读（秒）", data.engagement.active_seconds],
        ["交互失败 / 前端错误", data.traffic.errors],
      ]
    : [];
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-[1500px] space-y-6 p-6 lg:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              Hirelix · 第一方分析
            </p>
            <h1 className="mt-2 text-3xl font-semibold">网站流量与产品使用</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              从访问来源到资料、成果与回访。浏览器访客、登录账号、业务成果分别统计；内部账号默认排除。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border bg-white px-4 py-2"
              onClick={() => {
                setLoading(true);
                setError("");
                setData(null);
                setRevision((x) => x + 1);
              }}
              disabled={loading}
            >
              {loading ? "加载中…" : "刷新"}
            </button>
            <button
              className="rounded-lg bg-emerald-800 px-4 py-2 text-white"
              onClick={exportData}
              disabled={!data || loading}
            >
              导出当前数据
            </button>
          </div>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setError("");
            setData(null);
            setApplied({ days, timezone, source, device, page, internal });
          }}
          className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4"
        >
          <label className="text-sm">
            时间范围
            <select
              aria-label="时间范围"
              className="ml-2 rounded border p-2"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              {[1, 7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  最近 {d} 天
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            统计时区
            <select
              aria-label="统计时区"
              className="ml-2 rounded border p-2"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {[
                "Asia/Shanghai",
                "UTC",
                "America/New_York",
                "Europe/London",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            来源
            <input
              aria-label="来源"
              className="ml-2 w-36 rounded border p-2"
              placeholder="all / google_organic"
              value={source}
              onChange={(e) => setSource(e.target.value || "all")}
            />
          </label>
          <label className="text-sm">
            设备
            <select
              aria-label="设备"
              className="ml-2 rounded border p-2"
              value={device}
              onChange={(e) => setDevice(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="desktop">电脑</option>
              <option value="mobile">移动端</option>
            </select>
          </label>
          <label className="text-sm">
            页面
            <input
              aria-label="页面"
              className="ml-2 w-40 rounded border p-2"
              placeholder="全部 /product"
              value={page}
              onChange={(e) => setPage(e.target.value)}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            包含内部 / 本地测试
          </label>
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            type="submit"
          >
            应用筛选
          </button>
        </form>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
            {error}
          </p>
        )}
        {data && (
          <>
            <p className="text-xs text-slate-500">
              采集起点：
              {data.coverageSince
                ? new Date(String(data.coverageSince)).toLocaleString("zh-CN", {
                    timeZone: data.filters.timezone,
                  })
                : "尚未收到新埋点"}{" "}
              · 更新：
              {new Date(data.generatedAt).toLocaleString("zh-CN", {
                timeZone: data.filters.timezone,
              })}{" "}
              ({data.filters.timezone}) · 配置内部排除项：
              {data.internalConfigured}。
              {!data.internalConfigured &&
                "尚未配置内部账号，登录的 QA 账号可能计入生产统计。"}
            </p>
            <nav className="flex flex-wrap gap-2" aria-label="分析视图">
              {[
                ["overview", "总览与转化"],
                ["traffic", "来源与页面"],
                ["product", "产品与回访"],
                ["health", "质量与错误"],
                ["events", "事件明细"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={`rounded-lg px-4 py-2 text-sm ${tab === key ? "bg-slate-900 text-white" : "border bg-white"}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "overview" && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {cards.map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-xl border bg-white p-5"
                    >
                      <p className="text-sm text-slate-500">{label}</p>
                      <p className="mt-2 text-3xl font-semibold">{n(value)}</p>
                    </div>
                  ))}
                </div>
                <Table
                  title="新增账号的激活情况"
                  note="同一注册 cohort 的独立行为覆盖率，不要求先上传文件；截至筛选结束时间。成果指已保存且关联人选的推荐或非空评估，不把问候、空记录或后台索引当成果。"
                  columns={[
                    ["stage", "阶段"],
                    ["accounts", "账号数"],
                    ["rate", "占新增账号"],
                  ]}
                  rows={[
                    ["注册账号", data.product.new_accounts],
                    ["上传过文件", data.product.new_accounts_with_files],
                    ["产生可核验成果", data.product.new_accounts_with_outcome],
                  ].map(([stage, count]) => ({
                    stage: String(stage),
                    accounts: Number(count),
                    rate: Number(data.product.new_accounts)
                      ? `${Math.round((Number(count) / Number(data.product.new_accounts)) * 100)}%`
                      : "—",
                  }))}
                />
                <Table
                  title="访问到注册"
                  rows={Object.entries(data.acquisition).map(
                    ([key, value]) => ({
                      stage: (
                        {
                          visits: "访问会话",
                          cta_visits: "点击试用的会话",
                          login_visits: "发起 Google 登录的会话",
                          signup_visits: "关联到新注册的会话",
                        } as Record<string, string>
                      )[key],
                      count: Number(value),
                    }),
                  )}
                  columns={[
                    ["stage", "行为"],
                    ["count", "会话数"],
                  ]}
                  note="同一会话内去重的独立覆盖数；用户可直接进入登录页，不能相乘作为严格顺序漏斗。仅登录成功不能证明新注册。"
                />
                <section className="rounded-xl border bg-white p-5">
                  <h2 className="font-semibold">每日浏览量</h2>
                  <div className="mt-4 space-y-2">
                    {data.daily.map((row) => (
                      <div
                        key={String(row.day)}
                        className="flex items-center gap-3 text-xs"
                      >
                        <span className="w-24 shrink-0">{row.day}</span>
                        <div className="h-5 flex-1 rounded bg-slate-100">
                          <div
                            className="h-5 rounded bg-emerald-600"
                            style={{
                              width: `${(Number(row.page_views) / Math.max(1, ...data.daily.map((d) => Number(d.page_views)))) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right">
                          {n(row.page_views)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {!data.daily.length && (
                    <p className="mt-4 text-sm text-slate-500">暂无访问数据</p>
                  )}
                </section>
                <Table
                  title="每日趋势"
                  rows={data.daily}
                  columns={[
                    ["day", "日期"],
                    ["visitors", "浏览器访客"],
                    ["page_views", "页面浏览"],
                    ["accounts", "已关联账号"],
                  ]}
                />
              </>
            )}
            {tab === "traffic" && (
              <>
                <Table
                  title="来源"
                  note="来源依据 referrer / UTM；缺失 referrer 的访问按 direct 记录，不能推断为 AI 推荐。"
                  rows={data.sources}
                  columns={[
                    ["source", "来源"],
                    ["visitors", "访客"],
                    ["sessions", "会话"],
                    ["page_views", "浏览量"],
                    ["accounts", "关联账号"],
                  ]}
                />
                <Table
                  title="推广活动 UTM"
                  rows={data.campaigns}
                  columns={[
                    ["source", "来源"],
                    ["medium", "媒介"],
                    ["campaign", "活动"],
                    ["sessions", "会话"],
                    ["accounts", "关联账号"],
                  ]}
                />
                <Table
                  title="页面表现"
                  rows={data.pages}
                  columns={[
                    ["route", "页面"],
                    ["page_views", "浏览量"],
                    ["sessions", "会话"],
                    ["clicks", "导航点击"],
                    ["active_seconds", "有效阅读 秒"],
                    ["scroll_percent", "平均滚动 %"],
                    ["measured_pages", "停留样本"],
                    ["errors", "错误"],
                  ]}
                />
                <Table
                  title="设备与国家 / 地区"
                  note="国家来自托管平台请求信息；未知值保留为 unknown。"
                  rows={data.audience}
                  columns={[
                    ["device", "设备"],
                    ["country", "国家 / 地区"],
                    ["sessions", "会话"],
                  ]}
                />
              </>
            )}
            {tab === "product" && (
              <>
                <Table
                  title="业务记录"
                  rows={Object.entries(data.product).map(([metric, count]) => ({
                    metric:
                      (
                        {
                          new_accounts: "新增账号",
                          conversation_accounts: "发起对话账号",
                          outcome_accounts: "产生成果账号",
                          new_accounts_with_files: "新账号中已上传资料",
                          new_accounts_with_outcome: "新账号中已有成果",
                          files: "上传文件",
                          documents: "保存推荐 / 文稿",
                          feedback: "逐人反馈",
                          roles: "新增职位",
                        } as Record<string, string>
                      )[metric] || metric,
                    count,
                  }))}
                  columns={[
                    ["metric", "指标"],
                    ["count", "数量"],
                  ]}
                />
                <Table
                  title="注册 cohort 与对话回访"
                  note="D1 为注册后 24–48 小时，D7 为 168–192 小时内再次发消息；只统计观察窗口完整的账号。回访不代表已完成新成果。"
                  rows={data.retention.map((row) => ({
                    ...row,
                    d1_rate: Number(row.d1_eligible)
                      ? `${Math.round((Number(row.d1_returned) / Number(row.d1_eligible)) * 100)}%`
                      : "—",
                    d7_rate: Number(row.d7_eligible)
                      ? `${Math.round((Number(row.d7_returned) / Number(row.d7_eligible)) * 100)}%`
                      : "—",
                  }))}
                  columns={[
                    ["cohort", "注册日"],
                    ["accounts", "账号"],
                    ["activated", "有成果"],
                    ["d1_eligible", "D1 可观察"],
                    ["d1_returned", "D1 回访"],
                    ["d1_rate", "D1 回访率"],
                    ["d7_eligible", "D7 可观察"],
                    ["d7_returned", "D7 回访"],
                    ["d7_rate", "D7 回访率"],
                  ]}
                />
                <Table
                  title="成果使用"
                  rows={[
                    ["查看成果", data.traffic.document_views],
                    ["触发成果下载", data.traffic.document_exports],
                    ["复制成果", data.traffic.document_copies],
                    ["新建对话", data.continuation.new_conversations],
                    [
                      "后续新建对话",
                      data.continuation.subsequent_conversations,
                    ],
                  ].map(([action, count]) => ({
                    action: String(action),
                    count: Number(count),
                  }))}
                  columns={[
                    ["action", "行为"],
                    ["count", "次数"],
                  ]}
                  note="操作成功表示接口接受；下载表示浏览器开始下载。后续新建对话仅证明用户再次开启对话，不等于正确续接了同一委托。"
                />
                <Table
                  title="邮件发送结果"
                  rows={data.mail}
                  columns={[
                    ["provider", "邮箱"],
                    ["status", "状态"],
                    ["emails", "发送记录"],
                    ["accounts", "账号"],
                  ]}
                  note="读取真实发送记录；sent 表示提供方接受，不能证明收件人阅读。不会采集收件人、主题或正文。"
                />
                <Table
                  title="当前订阅状态"
                  rows={data.subscriptions}
                  columns={[
                    ["plan", "套餐"],
                    ["status", "状态"],
                    ["accounts", "账号"],
                  ]}
                  note="当前数据库快照，非历史时点，包含测试与兑换权益；不能当作实收收入。"
                />
                <Table
                  title="账单回调"
                  rows={data.billing}
                  columns={[
                    ["event_type", "事件"],
                    ["events", "次数"],
                    ["accounts", "账号"],
                  ]}
                  note="提供方已记录的回调；Sandbox 与 Live 以部署环境为准，不推算营收。"
                />
                <Table
                  title="功能操作"
                  rows={data.actions}
                  columns={[
                    ["event_type", "事件"],
                    ["action", "功能 / 接口"],
                    ["events", "次数"],
                    ["accounts", "账号"],
                    ["average_ms", "平均耗时 ms"],
                  ]}
                />
              </>
            )}
            {tab === "health" && (
              <>
                <Table
                  title="任务运行"
                  note="包含真实后台任务；done 表示任务完成，不等于邮件送达或用户认可。耗时为记录创建到最近状态更新时间。"
                  rows={data.jobs}
                  columns={[
                    ["kind", "类型"],
                    ["status", "状态"],
                    ["jobs", "数量"],
                    ["median_seconds", "中位耗时 秒"],
                    ["retried", "重试过"],
                    ["scheduled", "定时触发"],
                  ]}
                />
                <Table
                  title="失败分布"
                  note="不收集错误正文、表单输入或候选人资料。"
                  rows={data.errors}
                  columns={[
                    ["event_type", "类型"],
                    ["route", "页面"],
                    ["action", "操作"],
                    ["status", "HTTP"],
                    ["occurrences", "次数"],
                  ]}
                />
                <Table
                  title="浏览器性能"
                  rows={data.vitals}
                  columns={[
                    ["metric", "指标"],
                    ["p75_ms", "P75 ms"],
                    ["samples", "样本"],
                  ]}
                  note="LCP 由支持该 API 的浏览器提供；站内软导航不能等价于完整页面加载。"
                />
              </>
            )}
            {tab === "events" && (
              <Table
                title="最近 200 条事件"
                note="仅明细限 200 条；上方汇总使用整个筛选范围。标识为浏览器 / 账号的缩略值，时间为 UTC。"
                rows={data.recent}
                columns={[
                  ["created_at", "时间 UTC"],
                  ["event_type", "事件"],
                  ["route", "页面"],
                  ["source", "来源"],
                  ["browser", "浏览器"],
                  ["account", "账号"],
                  ["endpoint", "接口"],
                  ["action", "动作"],
                  ["status", "状态"],
                ]}
              />
            )}
          </>
        )}
        <footer className="text-xs leading-6 text-slate-500">
          页面事件是采集结果，浏览器拦截或网络中断可能导致遗漏。会话按标签页会话标识统计，访客按浏览器本地标识估算；清理存储会重置。注册与业务成果来自数据库；删除业务数据会影响历史计算。分析不保存对话、简历、邮件正文或分享令牌。没有历史埋点的时段不补造数据。
        </footer>
      </div>
    </main>
  );
}
