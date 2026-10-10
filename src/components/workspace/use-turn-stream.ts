"use client";
import { useEffect, useState } from "react";
import { isTurnRunning, type TurnSnapshot } from "@/lib/workspace/turn-progress";
import type { Job } from "@/lib/workspace/types";

export function useTurnStream(job: Job | null | undefined, onComplete: () => void) {
  const [live, setLive] = useState<TurnSnapshot | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const id = job?.id, running = isTurnRunning(job);
  useEffect(() => {
    if (!id || !running) return;
    let reconnectNotice: ReturnType<typeof setTimeout> | undefined;
    const connection = new EventSource(`/api/workspace/jobs/${id}/stream`);
    connection.addEventListener("snapshot", event => {
      const update = JSON.parse((event as MessageEvent).data) as TurnSnapshot;
      if (update.id !== id) return;
      clearTimeout(reconnectNotice);
      reconnectNotice = undefined;
      setDisconnected(false);
      setLive(previous => ({...update, result: {
        ...update.result,
        ...(update.status === "done" && !update.result.live_reply && previous?.id === id ? {live_reply: previous.result.live_reply} : {}),
      }}));
      if (!isTurnRunning(update)) { connection.close(); onComplete(); }
    });
    connection.onerror = () => {
      // Brief reconnects at the server's connection limit don't disturb a turn.
      reconnectNotice ??= setTimeout(() => setDisconnected(true), 2000);
    };
    return () => { connection.close(); clearTimeout(reconnectNotice); };
  }, [id, running, onComplete]);
  return {
    job: job && live?.id === job.id && Date.parse(live.updated_at) >= Date.parse(job.updated_at) ? { ...job, ...live, result: { ...job.result, ...live.result } } : job,
    disconnected: running && disconnected,
  };
}
