import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const parser = unified().use(remarkParse).use(remarkGfm);
type TextNode = {
  type: string;
  value?: string;
  alt?: string | null;
  children?: TextNode[];
};

function readableText(node: TextNode): string {
  // Match the rendered Markdown: link labels and image descriptions are visible,
  // destinations, reference definitions and raw HTML markup are not.
  if (node.type === "definition" || node.type === "html") return "";
  if (node.type === "image" || node.type === "imageReference") return node.alt || "";
  if (node.type === "break") return " ";
  if (node.value !== undefined) return node.value;
  const inline = ["paragraph", "heading", "emphasis", "strong", "delete", "link", "linkReference", "tableCell"].includes(node.type);
  return (node.children || []).map(readableText).join(inline ? "" : " ");
}

export function conversationExcerpt(content: string, query: string): string | null {
  // Parse the complete message before truncation so a cut link or emphasis marker
  // cannot leak Markdown syntax into a search result.
  const text = readableText(parser.parse(content)).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const index = normalizedQuery ? text.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase()) : -1;
  const start = Math.max(0, index - 55);
  const end = start + 170;
  return `${start ? "…" : ""}${text.slice(start, end)}${text.length > end ? "…" : ""}`;
}
