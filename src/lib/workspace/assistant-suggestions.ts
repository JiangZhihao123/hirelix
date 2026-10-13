/** Explicit presentation protocol; incomplete delimiters stay hidden while streaming. */
export function assistantSegments(content: string): Array<{kind: "text" | "suggestion"; text: string}> {
  const segments: Array<{kind: "text" | "suggestion"; text: string}> = [];
  let kind: "text" | "suggestion" = "text";
  let text = "";
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = kind === "text" ? ":::assistant-suggestion" : ":::";
    if (line === marker) {
      if (text) segments.push({kind, text});
      text = "";
      kind = kind === "text" ? "suggestion" : "text";
    } else if (!(i === lines.length - 1 && line.startsWith(":") && marker.startsWith(line))) {
      text += line + (i < lines.length - 1 ? "\n" : "");
    }
  }
  if (text) segments.push({kind, text});
  return segments;
}
