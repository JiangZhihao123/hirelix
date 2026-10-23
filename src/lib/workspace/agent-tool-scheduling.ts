// Explicitly reviewed read capabilities. New tools are exclusive by default.
const concurrentReads = new Set([
  "web_search", "web_fetch", "read_skill", "list_candidates", "list_roles", "list_reminders",
  "find_candidates", "find_roles", "read_candidate", "read_role", "read_record",
  "read_document", "read_file", "find_conversations", "read_conversation",
  "mailbox_status", "read_mail_thread", "read_mail_attachment", "search_mail", "read_mail",
]);

export function createToolScheduler(signal: AbortSignal, concurrency = Number(process.env.WORKSPACE_TOOL_READ_CONCURRENCY ?? 6)) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32)
    throw new Error("WORKSPACE_TOOL_READ_CONCURRENCY must be an integer from 1 to 32");
  let barrier: Promise<unknown> = Promise.resolve();
  let reads: Promise<unknown>[] = [];
  let active = 0;
  const waiting: Array<() => void> = [];
  async function readSlot<T>(execute: () => Promise<T>) {
    if (active >= concurrency) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try { signal.throwIfAborted(); return await execute(); }
    finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  }
  return <T>(name: string, execute: () => Promise<T>): Promise<T> => {
    const read = concurrentReads.has(name);
    const wait = read ? barrier : Promise.all([barrier, ...reads]);
    const run = wait.then(() => {
      signal.throwIfAborted();
      return read ? readSlot(execute) : execute();
    });
    const settled = run.catch(() => {});
    if (read) reads.push(settled);
    else { barrier = settled; reads = []; }
    return run;
  };
}
