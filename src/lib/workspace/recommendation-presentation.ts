/** Presentation only: never infer candidate facts or split unstructured prose by names. */
export function recommendationSections(content: string, people: Array<{id: string; name: string}>) {
  const sections: Record<string, string> = {};
  const headings: Record<string, string> = {};
  const opening: string[] = [];
  const closing: string[] = [];
  let afterCandidates = false;
  let current: string | null = null;
  let fenced = false;
  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced ? /^##\s+(.+?)\s*$/.exec(line)?.[1] : undefined;
    const matches = heading ? people.filter(person => person.name === heading || heading.startsWith(`${person.name} — `)) : [];
    if (matches.length === 1) {
      current = matches[0].id;
      sections[current] ??= '';
      headings[current] = heading!;
    } else if (heading) {
      current = null;
      afterCandidates = Object.keys(sections).length > 0;
      (afterCandidates ? closing : opening).push(line);
    } else if (current) sections[current] += `${line}\n`;
    else (afterCandidates ? closing : opening).push(line);
  }
  // Partially identified documents remain intact, rather than losing or misattributing text.
  if (people.some(person => !sections[person.id]?.trim())) return {overview: content, closing: "", sections: {} as Record<string,string>, headings: {} as Record<string,string>};
  return {closing: closing.join("\n").trim(), overview: opening.join('\n').trim(), sections, headings};
}

export function recommendationCover(doc: {language: string; role: string; people: Array<{name: string}>; files?: Array<unknown>}) {
  const names = doc.people.map(person => person.name).join(doc.language === 'zh' ? '、' : ', ');
  return doc.language === 'zh'
    ? `您好，\n\n针对${doc.role || '本次职位'}，本次推荐：${names}。推荐理由、需关注事项${doc.files?.length ? "及选定简历" : ""}已整理在推荐页中，您可以逐位查看并留下反馈。\n\n谢谢。`
    : `Hello,\n\nPlease find this recommendation for ${doc.role || 'the role'}: ${names}. The recommendation page includes the rationale and points to discuss${doc.files?.length ? ", along with the selected CVs" : ""}. You can review each candidate and leave individual feedback.\n\nThank you.`;
}
