// Resource stops are resumable outcomes, not provider or tool failures.
export const AGENT_EXECUTION_TIMEOUT_MS = 15 * 60 * 1000;

const pauseMessages = {
  time_limit: "Paused at the time limit. Your message and saved results are kept. Continue when ready.",
  credit_limit: "Paused because there are not enough AI credits to continue. Your saved results are kept. Check your allowance in Settings before continuing.",
  output_limit: "Paused because the model response reached its output limit. Your saved results are kept. Continue in this conversation.",
} as const;

export type AgentPauseReason = keyof typeof pauseMessages;

export function agentPauseReason(value: unknown): AgentPauseReason | undefined {
  return typeof value === "string" && Object.hasOwn(pauseMessages, value) ? value as AgentPauseReason : undefined;
}

export function agentPauseMessage(value: unknown) {
  const reason = agentPauseReason(value);
  return reason ? pauseMessages[reason] : undefined;
}

export class AgentPause extends Error {
  constructor(readonly reason: AgentPauseReason) {
    super(pauseMessages[reason]);
    this.name = "AgentPause";
  }
}
