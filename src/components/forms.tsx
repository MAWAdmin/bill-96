"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { FormState } from "@/app/actions";

export function SubmitButton({ children, className = "btn btn-primary", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}

/** A form bound to a server action returning FormState; shows its error/ok message. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      {state.ok && <div className="alert alert-ok" role="status">{state.ok}</div>}
      {children}
    </form>
  );
}

/** Re-renders the server component every `ms` while `active`. */
export function AutoRefresh({ active, ms = 2000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}

export function ScanModeFields({ defaultMax, baseUrl }: { defaultMax: number; baseUrl: string }) {
  const [mode, setMode] = useState<"sitemap" | "urls">("sitemap");
  return (
    <>
      <div className="field">
        <div className="segmented" role="radiogroup" aria-label="Scan mode">
          <label>
            <input type="radio" name="mode" value="sitemap" checked={mode === "sitemap"} onChange={() => setMode("sitemap")} />
            Whole site (sitemap)
          </label>
          <label>
            <input type="radio" name="mode" value="urls" checked={mode === "urls"} onChange={() => setMode("urls")} />
            Specific URLs
          </label>
        </div>
      </div>
      {mode === "sitemap" ? (
        <div className="field">
          <label htmlFor="max_pages">Max pages</label>
          <input id="max_pages" name="max_pages" type="number" min={1} max={200} defaultValue={defaultMax} style={{ maxWidth: 140 }} />
          <div className="hint">Pages are sampled from the sitemap across products, collections, pages and blog posts.</div>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="urls">URLs (one per line)</label>
          <textarea id="urls" name="urls" rows={5} placeholder={`${baseUrl.replace(/\/$/, "")}/products/example\n${baseUrl.replace(/\/$/, "")}/cart`} />
        </div>
      )}
    </>
  );
}

export function ConfirmButton({ label, confirmLabel, className = "btn btn-danger" }: { label: string; confirmLabel: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="row">
      <button type="submit" className={className} disabled={pending}>
        {pending ? "Working…" : confirmLabel}
      </button>
      <button type="button" className="btn" onClick={() => setArmed(false)}>
        Keep it
      </button>
    </span>
  );
}
