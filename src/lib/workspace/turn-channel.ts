import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { getLogger } from "@/lib/logger";
import type { TurnPart, TurnPhase } from "./turn-progress";

// A separate connection pool keeps notifications independent of checkpoint writes.
// LISTEN requires a session connection, not a transaction-mode pooler.
let transport: ReturnType<typeof postgres> | undefined;
function channelClient() {
  if (!transport) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    const local = ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
    transport = postgres(url, {
      prepare: false, max: 2, idle_timeout: 30, connect_timeout: 10,
      ssl: /[?&]sslmode=disable\b/.test(url) || process.env.DATABASE_SSL === "false" || (local && process.env.DATABASE_SSL !== "true") ? false : "require",
    });
  }
  return transport;
}
export type LiveTurn = { epoch: string; attempt: number; sequence: number; live_reply: string; parts: TurnPart[]; phase?: TurnPhase };
const channel = (id: string) => `hirelix_turn_${id.replaceAll("-", "")}`;

export async function publishTurn(id: string, state: LiveTurn) {
  const client = channelClient();
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64");
  const batch = randomUUID();
  const payloads: string[] = [];
  // PostgreSQL limits each NOTIFY payload to < 8 KB; base64 keeps UTF-8 intact.
  for (let offset = 0; offset < encoded.length; offset += 6000) {
    payloads.push(JSON.stringify({ batch, index: payloads.length, total: Math.ceil(encoded.length / 6000), data: encoded.slice(offset, offset + 6000) }));
  }
  await client`SELECT pg_notify(${channel(id)}, payload) FROM jsonb_array_elements_text(${client.json(payloads)}) AS payload`;
}

// Subscribe only after the HTTP boundary has checked ownership. Notifications
// contain display data, never provider reasoning, job credentials or tool inputs.
export async function subscribeTurn(id: string, receive: (state: LiveTurn) => void) {
  const batches = new Map<string, { chunks: string[]; count: number; total: number; at: number }>();
  const listener = await channelClient().listen(channel(id), payload => {
    try {
      const part = JSON.parse(payload) as {batch: string; index: number; total: number; data: string};
      if (!Number.isInteger(part.total) || part.total < 1 || part.total > 4096 || !Number.isInteger(part.index) || part.index < 0 || part.index >= part.total || typeof part.data !== "string") return;
      for (const [key, value] of batches) if (Date.now() - value.at > 10000) batches.delete(key);
      let batch = batches.get(part.batch);
      if (!batch) {
        if (batches.size >= 4) batches.delete(batches.keys().next().value!);
        batch = { chunks: [], count: 0, total: part.total, at: Date.now() };
        batches.set(part.batch, batch);
      }
      if (batch.total !== part.total || batch.chunks[part.index] !== undefined) return;
      batch.chunks[part.index] = part.data;
      if (++batch.count !== batch.total) return;
      batches.delete(part.batch);
      const state = JSON.parse(Buffer.from(batch.chunks.join(""), "base64").toString()) as LiveTurn;
      if (typeof state.epoch === "string" && Number.isInteger(state.attempt) && Number.isInteger(state.sequence) && typeof state.live_reply === "string" && Array.isArray(state.parts)) receive(state);
    } catch {
      getLogger({component: "turn_channel"}).warn({job_id: id}, "Invalid turn notification");
    }
  });
  return async () => { batches.clear(); await listener.unlisten(); };
}
export async function closeTurnChannel() {
  await transport?.end({timeout: 5});
  transport = undefined;
}

export async function signalTurnStop(id: string, lease: string, sequence?: number) {
  await channelClient().notify(`${channel(id)}_stop`, JSON.stringify({lease, sequence}));
}
export async function subscribeTurnStop(id: string, lease: string, stop: (sequence?: number) => void) {
  const listener = await channelClient().listen(`${channel(id)}_stop`, value => { try { const data = JSON.parse(value) as {lease?: string; sequence?: number}; if (data.lease === lease) stop(data.sequence); } catch { /* Ignore malformed control messages. */ } });
  return () => listener.unlisten();
}
