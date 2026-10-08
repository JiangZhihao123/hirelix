export async function copyConversationMessage(id: string, content: string, setCopiedId: (value: string | null | ((current: string | null) => string | null)) => void, setError: (error: string) => void) {
  try { await navigator.clipboard.writeText(content); setCopiedId(id); window.setTimeout(() => setCopiedId(current => current === id ? null : current),2000); }
  catch { setError("Could not copy this message"); }
}
