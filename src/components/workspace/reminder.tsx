"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT, useLanguage } from "@/components/LanguageProvider";
import { api, useQuery, ErrorNotice } from "./client";
import type { Reminder } from "@/lib/workspace/reminders";
export function ReminderReceipt({id}: {id:string}) {
  const t=useT();
  const {locale} = useLanguage();
  const query=useQuery<{reminders:Reminder[]}>(`/reminders?id=${id}`);
  const item=query.data?.reminders.find(item=>item.id===id);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{const timer=setInterval(query.refresh,15000);return()=>clearInterval(timer);},[query.refresh]);
  async function toggle(){if(!item)return;setBusy(true);try{await api("/reminders",{method:"PATCH",body:JSON.stringify({id,expected_version:item.version,enabled:!item.enabled})});query.refresh();setError("");}catch(cause){setError(cause instanceof Error?cause.message:"Could not update reminder");}finally{setBusy(false);}}
  return <section className="ws-assistant-agreement"><div>{item && <><strong>{item.title}</strong><p>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:item.timezone}).format(new Date(item.next_run_at))} · {item.timezone}</p><small>{t(item.completed_at?"Reminder delivered":item.enabled?"Reminder set":"Reminder paused")} · {t("Delivered in this conversation")}</small></>}<ErrorNotice error={error||query.error}/><Link className="ws-link" href="/app/reminders">{t("Manage reminders")}</Link></div>{item&&!item.completed_at&&<button disabled={busy} className="ws-link" onClick={toggle}>{t(item.enabled?"Pause":"Resume")}</button>}</section>;
}
