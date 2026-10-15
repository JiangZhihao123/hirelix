// Format stored source fields without inferring why a candidate is suitable.
export function semanticExcerpt(content: string): string {
  const source = content.slice(content.indexOf("\n") + 1);
  function strings(value: unknown): string[] {
    if (typeof value === 'string') return value.trim() ? [value] : [];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
  }
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
    if (typeof value.content === 'string') {
      try { return strings(JSON.parse(value.content)).join(' · '); }
      catch { return value.content; }
    }
    // Experience and notes explain the result better than repeating the row's
    // name, headline and location. Keep the exact source wording.
    return strings([value.profile, value.note, value.skills]).join(' · ')
      || strings([value.name, value.headline, value.location]).join(' · ');
  } catch {
    // A chunk may be part of a larger JSON source; its original is still linked.
    return '';
  }
}
