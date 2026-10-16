"use client";

import { useId, useState } from "react";
import { useT } from "@/components/LanguageProvider";

/** Keep the overview scannable while retaining the complete source wording. */
export function ProfileText({ text }: { text: string }) {
  const t = useT();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 400 || text.split(/\r?\n/).length > 4;
  return (
    <div>
      <p id={id} className={long && !expanded ? "line-clamp-4 whitespace-pre-line" : "whitespace-pre-line"}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="ws-link mt-2"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? "Show less" : "Show more")}
        </button>
      )}
    </div>
  );
}
