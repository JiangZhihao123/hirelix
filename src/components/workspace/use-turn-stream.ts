"use client";
import { useEffect, useRef, useState } from "react";
import { isTurnRunning, type TurnSnapshot } from "@/lib/workspace/turn-progress";
import type { Job } from "@/lib/workspace/types";

export function useTurnStream(job: Job | null | undefined, onComplete: () => void) {
  const [live, setLive] = useState<TurnSnapshot | null>(null);
  const [frozen, setFrozen] = useState<Job | null>(null);
  const frozenId = useRef<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const id = job?.id, running = isTurnRunning(job);
  useEffect(() => {
    if (!id || !running) return;
    let reconnectNotice: ReturnType<typeof setTimeout> | undefined;
    let receiptCount = 0;
    const connection = new EventSource(`/api/workspace/jobs/${id}/stream`);
    connection.addEventListener("snapshot", event => {
      const update = JSON.parse((event as MessageEvent).data) as TurnSnapshot;
      if (update.id !== id || (frozenId.current === id && isTurnRunning(update))) return;
      clearTimeout(reconnectNotice);
      reconnectNotice = undefined;
      setDisconnected(false);
      setLive(previous => previous?.id === id && !isTurnRunning(previous) && isTurnRunning(update) && previous.result.stream_epoch === update.result.stream_epoch ? previous : ({...update, result: {
        ...update.result,
        ...(update.status === "done" && !update.result.live_reply && previous?.id === id ? {live_reply: previous.result.live_reply} : {}),
      }}));
      if (!isTurnRunning(update)) { connection.close(); window.dispatchEvent(new Event("hirelix:work-changed")); onComplete(); }
      else if (update.result.receipt_count !== receiptCount) { receiptCount = update.result.receipt_count; onComplete(); }
    });
    connection.onerror = () => {
      // Brief reconnects at the server's connection limit don't disturb a turn.
      reconnectNotice ??= setTimeout(() => setDisconnected(true), 2000);
    };
    return () => { connection.close(); clearTimeout(reconnectNotice); };
  }, [id, running, onComplete]);
  let current = job;
  if (job && live?.id === job.id && (!job.result?.stream_epoch || live.result.stream_epoch === job.result.stream_epoch) && (live.attempts ?? job.attempts) >= job.attempts &&
      (isTurnRunning(job) || !isTurnRunning(live)) &&
      (Date.parse(live.updated_at) >= Date.parse(job.updated_at) ||
       (isTurnRunning(job) && Number(live.result.stream_sequence || 0) > Number(job.result?.stream_sequence || 0)))) {
    current = {...job, ...live, attempts: live.attempts ?? job.attempts, result: {...job.result, ...live.result}};
  }
  if (current && frozen?.id === current.id && frozen.result?.stream_epoch === current.result?.stream_epoch) {
    if (isTurnRunning(current)) current = frozen;
    else if (current.status === "cancelled") {
      current = {...current, result: {...current.result, parts: frozen.result?.parts, stream_sequence: frozen.result?.stream_sequence}};
    }
  }
  return {
    job: current,
    disconnected: running && disconnected,
    freeze: () => { if (current) { frozenId.current = current.id; setFrozen(current); } },
    unfreeze: () => { frozenId.current = null; setFrozen(null); },
  };
}
