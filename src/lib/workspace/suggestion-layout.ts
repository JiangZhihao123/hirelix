import type { Blockquote, Paragraph, Root, RootContent } from "mdast";

/** Render explicit replies independently of Markdown line breaks; legacy explanations stay out of the reply controls. */
export function suggestionLayout() {
  return (tree: Root) => {
    const output: RootContent[] = [];
    let option: Blockquote | undefined;
    const append = (paragraph: Paragraph) => {
      if (!paragraph.children.some(child => child.type !== "text" || child.value.trim())) return;
      if (!option) output.push(paragraph);
    };
    for (const node of tree.children) {
      if (node.type !== "paragraph") {
        option = undefined;
        output.push(node);
        continue;
      }
      let paragraph: Paragraph = { type: "paragraph", children: [] };
      for (const child of node.children) {
        if (child.type === "link") {
          append(paragraph);
          option = {
            type: "blockquote",
            data: { hName: "div", hProperties: { className: ["ws-suggestion-option"] } },
            children: [{ type: "paragraph", children: [child] }],
          };
          output.push(option);
          paragraph = { type: "paragraph", children: [] };
        } else paragraph.children.push(child);
      }
      append(paragraph);
    }
    tree.children = output;
  };
}
