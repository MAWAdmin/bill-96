"use client";

import { useState, useTransition } from "react";
import { saveTranslation } from "@/app/actions";
import { StatusBadge } from "./ui";

export interface TranslationRowData {
  id: string;
  source_text: string;
  kind: string;
  context: string | null;
  first_seen_url: string | null;
  occurrences: number;
  status: string;
  draft_text: string | null;
  final_text: string | null;
  provider: string | null;
  error: string | null;
}

const KIND_LABEL: Record<string, string> = {
  text: "Text",
  alt: "Image alt",
  placeholder: "Placeholder",
  value: "Button",
  aria: "Aria label",
  meta: "Title/meta",
};

export function TranslationRow({ item }: { item: TranslationRowData }) {
  const [status, setStatus] = useState(item.status);
  const [text, setText] = useState(item.final_text ?? item.draft_text ?? "");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const locked = status === "approved" || status === "published";

  const act = (action: "approve" | "save" | "reject" | "reopen") =>
    start(async () => {
      const res = await saveTranslation(item.id, action, text);
      setMsg(res);
      if (!res.error) {
        setStatus(
          action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "save" ? (text.trim() ? "draft" : "pending") : text.trim() ? "draft" : "pending"
        );
      }
    });

  return (
    <div className="tr-item" data-testid="translation-item">
      <div>
        <div className="row small muted" style={{ marginBottom: 4 }}>
          <StatusBadge status={status} />
          <span>{KIND_LABEL[item.kind] ?? item.kind}</span>
          {item.context && <span>· {item.context}</span>}
          {item.occurrences > 1 && <span>· {item.occurrences} pages</span>}
        </div>
        <div className="tr-source" lang="en">{item.source_text}</div>
        {item.first_seen_url && <span className="url small muted" title={item.first_seen_url}>{item.first_seen_url}</span>}
      </div>
      <div>
        <textarea
          lang="fr-CA"
          aria-label="French translation"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={locked}
          rows={Math.min(8, Math.max(2, Math.ceil(item.source_text.length / 60)))}
          placeholder="Traduction française…"
        />
        <div className="small muted">
          {item.provider && !locked && text === (item.draft_text ?? "") ? `Draft by ${item.provider === "memory" ? "translation memory" : item.provider}. Review before approving.` : ""}
          {item.error && status === "pending" ? <span style={{ color: "var(--bad)" }}>{item.error}</span> : null}
        </div>
        {msg.error && <div className="small" style={{ color: "var(--bad)" }}>{msg.error}</div>}
      </div>
      <div className="tr-actions">
        {locked ? (
          <button className="btn btn-sm" disabled={pending} onClick={() => act("reopen")}>Edit again</button>
        ) : (
          <>
            <button className="btn btn-sm btn-primary" disabled={pending || !text.trim()} onClick={() => act("approve")}>Approve</button>
            <button className="btn btn-sm" disabled={pending} onClick={() => act("save")}>Save draft</button>
            {status !== "rejected" ? (
              <button className="btn btn-sm" disabled={pending} onClick={() => act("reject")} title="Not French-relevant (brand name, code, etc.)">Ignore</button>
            ) : (
              <button className="btn btn-sm" disabled={pending} onClick={() => act("reopen")}>Restore</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
