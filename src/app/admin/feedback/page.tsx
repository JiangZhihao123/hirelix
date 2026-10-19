import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-session";
import { listFeedback } from "@/lib/product-feedback";
import { changeFeedbackStatus, refreshFeedback } from "./actions";
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; report?: string }>;
}) {
  const token = await requireAdminSession();
  const { before, report } = await searchParams;
  const reports = await listFeedback(token, before, report);
  return (
    <div className="admin-shell" lang="zh-CN">
      <header className="admin-header">
        <Link href="/admin">Hirelix 管理后台</Link>
        <Link href="/admin">返回流量与运营看板</Link>
      </header>
      <div className="admin-body">
        <nav aria-label="后台导航">
          <Link href="/admin/feedback">用户反馈</Link>
        </nav>
        <main>
          <div className="admin-heading">
            <div>
              <h1>用户反馈</h1>
              <p>查看产品建议和问题。实际回复用户后，再标记为已回复。</p>
            </div>
            <form action={refreshFeedback}>
              <button type="submit">刷新</button>
            </form>
          </div>
          {(report || before) && (
            <Link href="/admin/feedback">返回最新反馈</Link>
          )}
          {reports.length === 0 && <p className="admin-empty">暂无反馈</p>}
          <div className="admin-reports">
            {reports.map((item) => (
              <article key={item.id}>
                <header>
                  <div>
                    <strong>{item.email}</strong>
                    <p>
                      {new Date(item.created_at)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19)}{" "}
                      UTC · {item.id.slice(0, 8)}
                    </p>
                  </div>
                  <form action={changeFeedbackStatus}>
                    <input type="hidden" name="id" value={item.id} />
                    <label>
                      处理状态{" "}
                      <select name="status" defaultValue={item.status}>
                        <option value="new">待处理</option>
                        <option value="in_progress">处理中</option>
                        <option value="replied">已回复</option>
                      </select>
                    </label>
                    <button type="submit">保存</button>
                  </form>
                </header>
                <pre>{item.message}</pre>
                <p className="admin-meta">
                  来源：{item.page_path} · 版本：{item.app_version.slice(0, 12)}
                </p>
                <div className="admin-links">
                  <a
                    href={`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Re: Hirelix feedback ${item.id.slice(0, 8)}`)}`}
                  >
                    邮件回复
                  </a>
                  {item.has_screenshot && (
                    <a
                      href={`/api/admin/feedback/${item.id}/screenshot`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      查看截图 ↗
                    </a>
                  )}
                </div>
                <p className="admin-meta">
                  支持邮箱通知：
                  {item.notification_status === "sent"
                    ? "邮件服务已接受"
                    : item.notification_status === "failed"
                      ? "未确认送达，请直接处理此反馈"
                      : "等待发送或重试"}
                </p>
              </article>
            ))}
          </div>
          {reports.length === 50 && !report && (
            <Link href={`/admin/feedback?before=${reports.at(-1)!.id}`}>
              更早的反馈 →
            </Link>
          )}
        </main>
      </div>
    </div>
  );
}
