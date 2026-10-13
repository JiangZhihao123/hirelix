import type { Job, Message } from "@/lib/workspace/types";
import { isTurnRunning } from "@/lib/workspace/turn-progress";

type DisplayJob = Pick<Job, "status" | "progress" | "error" | "result">;
export type TurnMessage = { key: string; message: Message; activeJob?: DisplayJob; optimistic?: boolean };

export function conversationTurnView(input: {
  messages: Message[]; job?: Job | null; sending: boolean; pendingKey: string;
  conversationId: string | null; optimistic?: {text: string; priorIds: string[]} | null;
}): TurnMessage[] {
  const {messages, job, sending, pendingKey, conversationId, optimistic} = input;
  const belongsToJob = (message: Message) => message.role === "assistant" &&
    (message.id === job?.result?.message_id || message.id === job?.result?.receipt_message_id);
  const view: TurnMessage[] = messages.map(message => ({
    key: `message:${message.metadata.reply_request_key || (belongsToJob(message) ? job?.request_key : message.id)}`,
    message,
    ...(!sending && belongsToJob(message) ? {activeJob: job!} : {}),
  }));
  if (optimistic && !messages.some(message => message.role === "user" && !optimistic.priorIds.includes(message.id))) {
    view.push({key: "optimistic-user", optimistic: true, message: {
      id: "optimistic-user", role: "user", content: optimistic.text, conversation_id: conversationId || "",
      metadata: {}, created_at: "",
    }});
  }
  if (sending || (job && !messages.some(belongsToJob) && (isTurnRunning(job) || ["done", "cancelled", "error"].includes(job.status)))) {
    const key = sending ? pendingKey : job!.request_key;
    view.push({key: `message:${key}`, message: {
      id: `pending:${key}`, role: "assistant", content: "", conversation_id: conversationId || "",
      metadata: {reply_request_key: key}, created_at: sending ? "" : job!.created_at,
    }, activeJob: sending ? {status: "queued", progress: "", error: null, result: null} : job!});
  }
  return view;
}
