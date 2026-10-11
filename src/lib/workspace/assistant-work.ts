export type AssistantWorkReceipt = { job_id: string; title: string; kind: "submission" | "search_update" };
export type AssistantScheduleReceipt = { id: string; role_id: string; title: string };

export function quotedAuthorization(message: string, quote: string | null | undefined) {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return !!quote && normalize(quote).length >= 2 && normalize(message).includes(normalize(quote));
}
