"use client";

import { useRef, useState } from "react";
import { feedbackResponses, feedbackLabels } from "@/lib/workspace/recommendation-feedback-contract";

export function RecommendationFeedback({token, personId, name, zh}: {token: string; personId: string; name: string; zh: boolean}) {
  const [response, setResponse] = useState<(typeof feedbackResponses)[number]>("comment");
  const [author, setAuthor] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const request = useRef<{fingerprint: string; key: string} | null>(null);
  const labels = {interview: "希望面试", hold: "暂缓考虑", decline: "此职位不再推进", comment: "补充意见"};
  if (status === "saved") return <p role="status" className="mt-4 text-sm text-[#286049]">{zh ? "反馈已发送给推荐人。" : "Feedback sent to your recruiter."} <button className="underline underline-offset-4" onClick={() => {setStatus("idle"); setComment(""); request.current = null;}}>{zh ? "补充反馈" : "Add more feedback"}</button></p>;
  return <form className="mt-4 grid gap-3" aria-label={zh ? `${name} 的反馈` : `Feedback for ${name}`} onSubmit={async event => {
    event.preventDefault(); setStatus("saving"); setError("");
    const body = {person_id: personId, response, name: author.trim(), comment: comment.trim()};
    const fingerprint = JSON.stringify(body);
    if (request.current?.fingerprint !== fingerprint) request.current = {fingerprint, key: crypto.randomUUID()};
    try {
      const res = await fetch(`/recommendation/${token}/feedback`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...body, request_key: request.current.key})});
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save feedback");
      setStatus("saved");
    } catch (err) {setStatus("idle"); setError(err instanceof Error ? err.message : "Could not save feedback");}
  }}>
    <label className="grid gap-1 text-sm">{zh ? "您的意见" : "Your response"}<select className="rounded-lg border border-[#dde3dd] bg-white p-2" value={response} disabled={status === "saving"} onChange={event => setResponse(event.target.value as typeof response)}>{feedbackResponses.map(value => <option key={value} value={value}>{zh ? labels[value] : feedbackLabels[value]}</option>)}</select></label>
    <label className="grid gap-1 text-sm">{zh ? "您的姓名" : "Your name"}<input className="rounded-lg border border-[#dde3dd] p-2" value={author} required maxLength={120} disabled={status === "saving"} onChange={event => setAuthor(event.target.value)} autoComplete="name" /></label>
    <label className="grid gap-1 text-sm">{zh ? "反馈或需要确认的问题" : "Feedback or questions to clarify"}<textarea className="rounded-lg border border-[#dde3dd] p-2" rows={3} value={comment} maxLength={4000} required={response === "comment"} disabled={status === "saving"} onChange={event => setComment(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button className="justify-self-start rounded-lg bg-[#285542] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={status === "saving"}>{status === "saving" ? zh ? "正在发送…" : "Sending…" : zh ? "发送反馈" : "Send feedback"}</button>
  </form>;
}
