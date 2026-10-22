"use client";

import Link from "next/link";
import { useState, useTransition, type KeyboardEvent } from "react";
import { saveTranslation } from "@/app/actions";
import { KIND_LABEL, type TranslationRowData } from "./TranslationRow";

/**
 * Reviews the open translation queue one string at a time. The queue lives in
 * local state, so approving moves straight to the next card without waiting
 * for the page to reload.
 */
export function ReviewDeck({
  items,
  total,
  done: initialDone,
  exportHref,
  allHref,
}: {
  items: TranslationRowData[];
  total: number;
  done: number;
  exportHref: string;
  allHref: string;
}) {
  const [queue, setQueue] = useState(items);
  const [done, setDone] = useState(initialDone);
  const [approved, setApproved] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [flash, setFlash] = useState("");
  const pct = total ? Math.round((done / total) * 100) : 0;
  const current = queue[0];

  const progress = (
    <div className="deck-progress" aria-live="polite">
      <div className="progress ok"><div style={{ width: `${pct}%` }} /></div>
      <span data-testid="deck-progress">{done} of {total} done</span>
    </div>
  );

  if (!current) {
    return (
      <div className="deck">
        {progress}
        <div className="card celebrate">
          <div className="big" aria-hidden>🎉</div>
          <h2>All caught up</h2>
          <p className="muted">
            {approved ? `You approved ${approved} translation${approved === 1 ? "" : "s"}. ` : ""}
            Download them to add to your store.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <a className="btn btn-primary" href={exportHref}>Download approved (CSV)</a>
            <Link className="btn" href={allHref}>See all strings</Link>
          </div>
        </div>
      </div>
    );
  }

  if (skipped >= queue.length) {
    return (
      <div className="deck">
        {progress}
        <div className="card celebrate">
          <div className="big" aria-hidden>👋</div>
          <h2>You skipped the last {queue.length === 1 ? "one" : queue.length}</h2>
          <p className="muted">They&apos;ll be here when you come back.</p>
          <button className="btn btn-primary" onClick={() => setSkipped(0)}>Go through them again</button>
        </div>
      </div>
    );
  }

  const next = (outcome: "approved" | "rejected" | "skipped") => {
    if (outcome === "skipped") {
      setQueue((q) => [...q.slice(1), q[0]]);
      setSkipped((n) => n + 1);
      setFlash("");
      return;
    }
    setQueue((q) => q.slice(1));
    setDone((n) => n + 1);
    if (outcome === "approved") setApproved((n) => n + 1);
    setFlash(outcome === "approved" ? "Approved ✓" : "Marked as not needed");
  };

  return (
    <div className="deck">
      {progress}
      <Card key={current.id} item={current} onDone={next} />
      <div className="row small muted" style={{ justifyContent: "center", marginTop: 4 }}>
        {flash && <span className="flash" role="status">{flash}</span>}
        <span>{queue.length} left · <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> approves</span>
      </div>
    </div>
  );
}

function Card({ item, onDone }: { item: TranslationRowData; onDone: (o: "approved" | "rejected" | "skipped") => void }) {
  const original = item.final_text ?? item.draft_text ?? "";
  const [text, setText] = useState(original);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const where = item.first_seen_url ? pathOf(item.first_seen_url) : null;

  const act = (action: "approve" | "reject" | "skip") =>
    start(async () => {
      setError("");
      if (action === "skip") {
        // Keep edits made before skipping.
        if (text.trim() && text !== original) await saveTranslation(item.id, "save", text);
        onDone("skipped");
        return;
      }
      const res = await saveTranslation(item.id, action, text);
      if (res.error) setError(res.error);
      else onDone(action === "approve" ? "approved" : "rejected");
    });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !pending) {
      e.preventDefault();
      act("approve");
    }
  };

  return (
    <div className="card review-card" data-testid="review-card" onKeyDown={onKey}>
      <div className="label">English · {KIND_LABEL[item.kind] ?? item.kind}</div>
      <div className="source" lang="en" data-testid="source-text">{item.source_text}</div>
      <div className="where">
        {where ? <>Found on <a href={item.first_seen_url!} target="_blank" rel="noreferrer">{where}</a></> : null}
        {item.occurrences > 1 ? ` and ${item.occurrences - 1} other page${item.occurrences === 2 ? "" : "s"}` : ""}
      </div>

      <label htmlFor={`fr-${item.id}`} className="label">
        French
        {item.provider && text === (item.draft_text ?? "") ? (
          <span className="badge b-fr" style={{ textTransform: "none", letterSpacing: 0 }}>
            {item.provider === "memory" ? "from your earlier approvals" : `draft by ${item.provider === "claude" ? "AI" : item.provider}, check it`}
          </span>
        ) : null}
      </label>
      <textarea
        id={`fr-${item.id}`}
        lang="fr-CA"
        aria-label="French translation"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type the French here…"
        autoFocus
        rows={Math.min(8, Math.max(2, Math.ceil(item.source_text.length / 50)))}
      />
      {error && <div className="small" style={{ color: "var(--bad)", marginTop: 6 }}>{error}</div>}

      <div className="actions">
        <button className="btn btn-ok btn-lg" disabled={pending || !text.trim()} onClick={() => act("approve")}>Approve</button>
        <button className="btn" disabled={pending} onClick={() => act("skip")}>Skip for now</button>
        <span className="spacer" />
        <button className="btn btn-ghost" disabled={pending} onClick={() => act("reject")} title="Brand names, codes and other text that stays as is">
          Not needed
        </button>
      </div>
    </div>
  );
}

function pathOf(url: string) {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}
