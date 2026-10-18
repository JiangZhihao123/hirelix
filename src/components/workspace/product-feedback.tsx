"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, CheckCircle2 } from "lucide-react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError, Dialog, Field, useQuery } from "./client";
import { feedbackPagePath } from "@/lib/product-feedback-contract";

export function ProductFeedbackEntry() {
  const { locale } = useLanguage();
  const t = useT();
  const zh = locale === "zh";
  const { user } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const access = useQuery<{ admin: boolean }>(
    open ? "/feedback?access=1" : null,
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const changed = () => {
    setRequestKey(crypto.randomUUID());
    setError("");
  };
  return (
    <>
      <button
        type="button"
        className="ws-feedback-entry"
        onClick={() => {
          setOpen(true);
          if (!requestKey) setRequestKey(crypto.randomUUID());
        }}
      >
        <MessageSquare size={16} />
        {zh ? "帮助与反馈" : "Help & feedback"}
      </button>
      {open && (
        <Dialog
          title={zh ? "帮助与反馈" : "Help & feedback"}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          {saved ? (
            <div className="ws-feedback-form" role="status">
              <CheckCircle2 size={30} className="text-[#285542]" />
              <h3>
                {zh
                  ? "已收到，谢谢你的反馈"
                  : "Thanks — your feedback is saved"}
              </h3>
              <p>
                {zh
                  ? "我们会查看你的反馈；如需补充信息或有进展，会通过以下邮箱联系你："
                  : "We’ll review your feedback and contact you with questions or updates at:"}{" "}
                <strong>{user?.email}</strong>
              </p>
              <p className="ws-muted">
                {zh ? "反馈编号" : "Reference"}：{saved.slice(0, 8)}
              </p>
              <div className="ws-actions">
                <button
                  className="ws-button ws-button-primary"
                  onClick={() => setOpen(false)}
                >
                  {zh ? "完成" : "Done"}
                </button>
                <button
                  className="ws-button"
                  onClick={() => {
                    setSaved("");
                    setMessage("");
                    setFile(null);
                    setPreview("");
                    setCategory("other");
                    changed();
                  }}
                >
                  {zh ? "再提一条" : "Send another"}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="ws-feedback-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                const form = new FormData();
                form.set("request_key", requestKey);
                form.set("category", category);
                form.set("message", message.trim());
                form.set("page_path", feedbackPagePath(path));
                if (file) form.set("screenshot", file);
                try {
                  const result = await api<{ id: string }>("/feedback", {
                    method: "POST",
                    body: form,
                  });
                  setSaved(result.id);
                } catch (error) {
                  setError(
                    error instanceof ApiError
                      ? t(error.message)
                      : zh
                        ? "暂时无法提交，内容已保留。请重试，或联系 support@hirelix.online。"
                        : "Could not submit. Your feedback is kept here. Retry, or contact support@hirelix.online.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>
                {zh
                  ? "哪里不好用？你希望我们改进什么？我们会认真阅读。"
                  : "What isn’t working well? What would make Hirelix more useful? We read every report."}
              </p>
              <Field label={zh ? "反馈内容" : "Your feedback"}>
                <textarea
                  required
                  rows={5}
                  maxLength={5000}
                  value={message}
                  disabled={busy}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    changed();
                  }}
                  placeholder={
                    zh
                      ? "说说你遇到的问题，或想实现的事情……"
                      : "Tell us what happened, or what you’d like to do…"
                  }
                />
              </Field>
              <Field label={zh ? "类型（可选）" : "Category (optional)"}>
                <select
                  value={category}
                  disabled={busy}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    changed();
                  }}
                >
                  <option value="other">{zh ? "其他" : "Other"}</option>
                  <option value="problem">
                    {zh ? "遇到问题" : "Something isn’t working"}
                  </option>
                  <option value="suggestion">
                    {zh ? "功能建议" : "An idea or suggestion"}
                  </option>
                </select>
              </Field>
              <Field
                label={
                  zh
                    ? "截图（可选，最大 2 MB）"
                    : "Screenshot (optional, up to 2 MB)"
                }
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (!picked) return;
                    if (
                      picked.size > 2 * 1024 * 1024 ||
                      !["image/png", "image/jpeg", "image/webp"].includes(
                        picked.type,
                      )
                    ) {
                      setError(
                        zh
                          ? "请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。"
                          : "Choose a PNG, JPEG or WebP image up to 2 MB.",
                      );
                      e.target.value = "";
                      setFile(null);
                      setPreview("");
                      setRequestKey(crypto.randomUUID());
                      return;
                    }
                    setFile(picked);
                    setPreview(URL.createObjectURL(picked));
                    changed();
                  }}
                />
              </Field>
              {preview && (
                <div>
                  {/* User-selected local preview; not a public image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    className="ws-feedback-preview"
                    alt={zh ? "将提交的截图" : "Screenshot to be submitted"}
                  />
                  <button
                    type="button"
                    className="ws-link"
                    disabled={busy}
                    onClick={() => {
                      setFile(null);
                      if (fileInput.current) fileInput.current.value = "";
                      setPreview("");
                      changed();
                    }}
                  >
                    {zh ? "移除截图" : "Remove screenshot"}
                  </button>
                </div>
              )}
              <p className="ws-muted">
                {zh
                  ? "将记录当前页面、产品版本、时间和账号邮箱。不会自动附带简历、候选人资料或对话内容；提交前请检查截图中的隐私信息。"
                  : "Includes this page, product version, time and account email. CVs, candidate records and conversations are not attached automatically. Please check your screenshot for private information."}
              </p>
              <p className="ws-muted">
                {zh ? "回复邮箱" : "Reply email"}：{user?.email}
              </p>
              {error && (
                <p role="alert" className="ws-error">
                  {error}
                </p>
              )}
              <div className="ws-actions">
                <button
                  type="submit"
                  className="ws-button ws-button-primary"
                  disabled={busy || !message.trim()}
                >
                  {busy
                    ? zh
                      ? "正在提交…"
                      : "Submitting…"
                    : zh
                      ? "提交反馈"
                      : "Send feedback"}
                </button>
                <a className="ws-link" href="mailto:support@hirelix.online">
                  {zh ? "邮件联系支持" : "Email support"}
                </a>
              </div>
            </form>
          )}
          {access.data?.admin && (
            <p className="ws-feedback-admin-link">
              <Link
                className="ws-link"
                href="/app/feedback"
                onClick={() => setOpen(false)}
              >
                {zh ? "管理用户反馈" : "Manage user feedback"} ↗
              </Link>
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
