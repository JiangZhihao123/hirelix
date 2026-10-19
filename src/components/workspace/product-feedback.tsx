"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, CheckCircle2, Paperclip, X } from "lucide-react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, ApiError, Dialog, useQuery } from "./client";
import { feedbackPagePath } from "@/lib/product-feedback-contract";

export function ProductFeedbackEntry() {
  const { locale } = useLanguage();
  const t = useT();
  const zh = locale === "zh";
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [sourcePage, setSourcePage] = useState("");
  const access = useQuery<{ admin: boolean }>(open ? "/feedback?access=1" : null);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const changed = () => {
    setRequestKey(crypto.randomUUID());
    setError("");
  };
  const start = () => {
    if (saved) {
      setSaved(false);
      setMessage("");
      setFile(null);
      setPreview("");
      setError("");
    }
    if (saved || !requestKey) {
      setRequestKey(crypto.randomUUID());
      setSourcePage(feedbackPagePath(path));
    }
    setOpen(true);
  };
  return <>
    <button type="button" className="ws-feedback-entry" onClick={start}>
      <MessageSquare size={16} />{zh ? "意见反馈" : "Feedback"}
    </button>
    {open && <Dialog title={zh ? "发送反馈" : "Send feedback"} onClose={() => { if (!busy) setOpen(false); }}>
      {saved ? <div className="ws-feedback-success" role="status">
        <CheckCircle2 size={28} className="text-[#285542]" aria-hidden />
        <p>{zh ? "谢谢！我们已收到你的反馈。" : "Thanks! We’ve received your feedback."}</p>
        <button className="ws-button ws-button-primary" onClick={() => setOpen(false)}>{zh ? "完成" : "Done"}</button>
      </div> : <form className="ws-feedback-form" onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !message.trim()) return;
        setBusy(true);
        setError("");
        const form = new FormData();
        form.set("request_key", requestKey);
        form.set("category", "other");
        form.set("message", message.trim());
        form.set("page_path", sourcePage);
        if (file) form.set("screenshot", file);
        try {
          await api<{ id: string }>("/feedback", { method: "POST", body: form });
          setSaved(true);
          setFile(null);
          setPreview("");
        } catch (error) {
          setError(error instanceof ApiError ? t(error.message) : zh
            ? "暂时无法提交，内容已保留，请重试。"
            : "Could not send. Your feedback is kept here. Please retry.");
        } finally { setBusy(false); }
      }}>
        <div className="ws-feedback-body">
          <textarea required rows={4} maxLength={5000} aria-label={zh ? "反馈内容" : "Your feedback"}
            placeholder={zh ? "你希望我们改进什么？" : "What could we improve?"}
            disabled={busy} value={message} onChange={e => { setMessage(e.target.value); changed(); }} />
          <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={busy}
            aria-label={zh ? "添加截图" : "Attach screenshot"} onChange={e => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked) return;
              if (picked.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(picked.type)) {
                setError(zh ? "请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。" : "Choose a PNG, JPEG or WebP image up to 2 MB.");
                return; // Keep any previously selected valid attachment.
              }
              setFile(picked);
              setPreview(URL.createObjectURL(picked));
              changed();
            }} />
          {preview && file ? <div className="ws-feedback-attachment">
            {/* Local image selected by the user; never a public URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={zh ? "将提交的截图" : "Screenshot to be submitted"} />
            <span title={file.name}>{file.name}</span>
            <button type="button" className="ws-icon" aria-label={zh ? "移除截图" : "Remove screenshot"} disabled={busy}
              onClick={() => { setFile(null); setPreview(""); changed(); }}><X size={16} /></button>
          </div> : <button type="button" className="ws-feedback-attach" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Paperclip size={15} aria-hidden />{zh ? "添加截图" : "Attach screenshot"}
            <span>PNG, JPEG, WebP · 2 MB</span>
          </button>}
          <div className="ws-feedback-privacy">
            <p>{zh ? "请勿包含敏感信息。" : "Please don’t include sensitive information."}</p>
            <details>
              <summary>{zh ? "会附带哪些信息？" : "What is included?"}</summary>
              <p>{zh ? "将附带当前页面、产品版本、时间和账号邮箱，以便排查和回复。不会自动附带简历、候选人资料或对话；截图仅在你选择后上传。" : "Includes the page, product version, time and your account email so we can investigate and reply. CVs, candidate records and conversations are not attached. A screenshot is included only if you choose one."}</p>
              {access.data?.admin && <Link className="ws-link" href="/app/feedback" onClick={() => setOpen(false)}>{zh ? "管理用户反馈" : "Manage user feedback"}</Link>}
            </details>
          </div>
          {error && <p role="alert" className="ws-error">{error}</p>}
        </div>
        <footer className="ws-feedback-footer">
          <button type="submit" className="ws-button ws-button-primary" disabled={busy || !message.trim()}>
            {busy ? zh ? "正在发送…" : "Sending…" : zh ? "发送反馈" : "Send feedback"}
          </button>
        </footer>
      </form>}
    </Dialog>}
  </>;
}
