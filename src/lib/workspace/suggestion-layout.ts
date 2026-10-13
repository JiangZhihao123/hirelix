import { unified } from "unified";
import remarkParse from "remark-parse";
import { assistantSegments } from "./assistant-suggestions";
import type { Paragraph, Root, RootContent } from "mdast";

/** Render explicit replies independently of Markdown line breaks; legacy explanations stay out of the reply controls. */
export function suggestionLayout() {
  return (tree: Root) => {
    const output: RootContent[] = [];
    let option = false;
    const append = (paragraph: Paragraph) => {
      if (!paragraph.children.some(child => child.type !== "text" || child.value.trim())) return;
      if (!option) output.push(paragraph);
    };
    for (const node of tree.children) {
      if (node.type !== "paragraph") {
        option = false;
        output.push(node);
        continue;
      }
      let paragraph: Paragraph = { type: "paragraph", children: [] };
      for (const child of node.children) {
        if (child.type === "link") {
          append(paragraph);
          option = true;
          paragraph = { type: "paragraph", children: [] };
        } else paragraph.children.push(child);
      }
      append(paragraph);
    }
    tree.children = output;
  };
}

/** Reply controls belong to the completed message footer, including legacy suggestion blocks. */

type TextNode = { type: string; value?: string; url?: string; children?: TextNode[] };
const label = (node: TextNode): string => node.value ?? node.children?.map(label).join("") ?? "";
export function assistantReplies(content: string): string[] {
  const replies: string[] = [];
  for (const segment of assistantSegments(content)) {
    const tree = unified().use(remarkParse).parse(segment.text);
    function visit(node: TextNode) {
      if (node.type === "link" && (segment.kind === "suggestion" || node.url === "#assistant-reply")) {
        const text = label(node).trim();
        if (text && !replies.includes(text)) replies.push(text);
        return;
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  }
  return replies;
}
