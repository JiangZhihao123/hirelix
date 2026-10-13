export type CandidateReference = { id: string; name: string };

export function candidateReferences(value: unknown): CandidateReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CandidateReference => !!item && typeof item.id === "string" && typeof item.name === "string").slice(0, 20);
}

/** Only the explicit @ token at the caret opens the picker; email addresses do not. */
export function candidateMentionAt(text: string, caret: number, references: CandidateReference[]) {
  const match = /(?:^|\s)@([^@\n]{0,80})$/.exec(text.slice(0, caret));
  if (!match || references.some(item => match[1].startsWith(`${item.name} `))) return null;
  return { start: caret - match[1].length - 1, end: caret, query: match[1] };
}
