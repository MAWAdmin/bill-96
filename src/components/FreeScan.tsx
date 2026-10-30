"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { STRINGS, type Lang } from "@/lib/freeScan/i18n";

// Remembered only in the visitor's own tab, so the signup link can prefill it
// without putting the email in the shareable results page.
const EMAIL_KEY = "b96_free_scan_email";

async function postJson(url: string, body: unknown): Promise<Record<string, any>> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({}));
}

export function FreeScanForm({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = String(new FormData(e.currentTarget).get("url") ?? "");
    setPending(true);
    setError("");
    try {
      const data = await postJson("/api/public-scan", { url, lang });
      if (data.resultsUrl) return router.push(`${data.resultsUrl}?lang=${lang}`);
      if (data.existing?.resultsUrl) return router.push(`${data.existing.resultsUrl}?lang=${lang}&reused=1`);
      setError(data.error ?? t.errors.generic);
    } catch {
      setError(t.errors.generic);
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="scan-form">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <label htmlFor="url">{t.scan.urlLabel}</label>
      <div className="row">
        <input id="url" name="url" type="text" inputMode="url" autoComplete="url" placeholder={t.scan.urlPlaceholder} required />
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? t.scan.submitting : t.scan.submit}
        </button>
      </div>
      <div className="hint">{t.scan.limit}</div>
    </form>
  );
}

export function UnlockForm({ scanId, lang }: { scanId: string; lang: Lang }) {
  const t = STRINGS[lang].results;
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    setPending(true);
    setError("");
    try {
      const data = await postJson(`/api/public-scan/${scanId}/unlock`, { email, name: fd.get("name"), lang });
      if (data.shareUrl) {
        try {
          sessionStorage.setItem(EMAIL_KEY, email);
        } catch {}
        return router.push(`${data.shareUrl}?lang=${lang}`);
      }
      setError(data.error ?? STRINGS[lang].errors.generic);
    } catch {
      setError(STRINGS[lang].errors.generic);
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="narrow">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="unlock-email">{t.email}</label>
        <input id="unlock-email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="unlock-name">{t.name}</label>
        <input id="unlock-name" name="name" type="text" autoComplete="name" maxLength={100} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? t.unlocking : t.unlock}
      </button>
      <div className="hint">{t.consent}</div>
    </form>
  );
}

export function ShareLink({ path, lang }: { path: string; lang: Lang }) {
  const t = STRINGS[lang].results;
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(new URL(path, window.location.origin).toString()), [path]);
  return (
    <div className="row">
      <input type="text" readOnly value={url} aria-label={t.shareTitle} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 220 }} />
      <button
        className="btn"
        type="button"
        onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {})}
      >
        {copied ? t.copied : t.copy}
      </button>
    </div>
  );
}

export function SignupCta({ lang }: { lang: Lang }) {
  const [href, setHref] = useState("/signup?from=scan");
  useEffect(() => {
    try {
      const email = sessionStorage.getItem(EMAIL_KEY);
      if (email) setHref(`/signup?from=scan&email=${encodeURIComponent(email)}`);
    } catch {}
  }, []);
  return (
    <Link className="btn btn-primary" href={href}>
      {STRINGS[lang].results.cta}
    </Link>
  );
}
