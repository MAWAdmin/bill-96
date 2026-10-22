/**
 * Runs inside the scanned page. Kept as a plain JS string (not a TS function)
 * so no bundler/transpiler helper can leak into the serialized code that
 * Playwright sends to the browser.
 */

export type BlockKind = "text" | "alt" | "placeholder" | "aria" | "value" | "meta";
export type BlockRole = "heading" | "button" | "nav" | "link" | "footer" | "body" | "meta";

export interface RawBlock {
  text: string;
  kind: BlockKind;
  role: BlockRole;
  tag: string;
  fontSize: number;
  fontWeight: number;
  top: number;
  inViewport: boolean;
  selector: string;
}

export interface RawHreflang {
  hreflang: string;
  href: string; // absolute (resolved by the browser)
  raw: string; // attribute as written
}

export interface Extraction {
  htmlLang: string;
  title: string;
  /** The business name the page declares (og:site_name / application-name), if any. */
  siteName: string | null;
  canonical: string | null;
  hreflang: RawHreflang[];
  blocks: RawBlock[];
  truncated: boolean;
}

export const EXTRACT_SCRIPT = String.raw`(() => {
  const MAX = 2500;
  const vh = window.innerHeight;
  const blocks = [];
  let truncated = false;
  const SKIP = "script,style,noscript,template,svg,code,pre,iframe,canvas,textarea,select,option,[aria-hidden=true]";
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const hasLetter = (s) => /\p{L}{2,}/u.test(s);

  const selectorOf = (el) => {
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.body && parts.length < 5) {
      let p = e.tagName.toLowerCase();
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) { parts.unshift(p + "#" + e.id); break; }
      const cls = Array.from(e.classList).filter((c) => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) p += "." + cls.join(".");
      const parent = e.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === e.tagName);
        if (same.length > 1) p += ":nth-of-type(" + (same.indexOf(e) + 1) + ")";
      }
      parts.unshift(p);
      e = parent;
    }
    return parts.join(" > ");
  };

  const roleOf = (el) => {
    if (el.closest("h1,h2,h3,h4,h5,h6,[role=heading]")) return "heading";
    if (el.closest("button,[role=button],input[type=submit],input[type=button]")) return "button";
    if (el.closest("nav,header,[role=navigation]")) return "nav";
    if (el.closest("footer,[role=contentinfo]")) return "footer";
    if (el.closest("a")) return "link";
    return "body";
  };

  const box = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { cs, r };
  };

  const push = (el, text, kind, b) => {
    if (blocks.length >= MAX) { truncated = true; return; }
    const cs = b ? b.cs : null;
    const top = b ? b.r.top + window.scrollY : 0;
    blocks.push({
      text: text.slice(0, 2000),
      kind,
      role: kind === "meta" ? "meta" : roleOf(el),
      tag: el.tagName.toLowerCase(),
      fontSize: cs ? parseFloat(cs.fontSize) || 16 : 0,
      fontWeight: cs ? parseInt(cs.fontWeight, 10) || 400 : 0,
      top: Math.round(top),
      inViewport: !!b && top < vh,
      selector: selectorOf(el),
    });
  };

  for (const el of Array.from(document.body ? document.body.querySelectorAll("*") : [])) {
    if (el.closest(SKIP)) continue;
    let own = "";
    for (const n of el.childNodes) if (n.nodeType === 3) own += " " + n.textContent;
    own = clean(own);
    const tag = el.tagName;
    const attrs = [];
    if (tag === "IMG" && el.getAttribute("alt")) attrs.push(["alt", el.getAttribute("alt")]);
    if ((tag === "INPUT" || tag === "TEXTAREA") && el.getAttribute("placeholder")) attrs.push(["placeholder", el.getAttribute("placeholder")]);
    if (tag === "INPUT" && /^(submit|button)$/i.test(el.type) && el.value) attrs.push(["value", el.value]);
    if (el.getAttribute("aria-label") && !own) attrs.push(["aria", el.getAttribute("aria-label")]);
    if (!(own && hasLetter(own)) && !attrs.length) continue;
    const b = box(el);
    if (own && hasLetter(own) && b) push(el, own, "text", b);
    for (const [kind, v] of attrs) {
      const t = clean(v);
      if (hasLetter(t) && (b || kind === "alt")) push(el, t, kind, b);
    }
  }

  const head = document.head || document.documentElement;
  if (clean(document.title)) push(head, clean(document.title), "meta", null);
  const desc = document.querySelector('meta[name="description"]');
  if (desc && hasLetter(clean(desc.getAttribute("content")))) push(desc, clean(desc.getAttribute("content")), "meta", null);

  const canonical = document.querySelector('link[rel="canonical"]');
  const siteNameEl = document.querySelector('meta[property="og:site_name"], meta[name="application-name"]');
  return {
    htmlLang: document.documentElement.getAttribute("lang") || "",
    title: clean(document.title),
    siteName: siteNameEl ? clean(siteNameEl.getAttribute("content")) || null : null,
    canonical: canonical ? canonical.href : null,
    hreflang: Array.from(document.querySelectorAll('link[rel~="alternate"][hreflang]')).map((l) => ({
      hreflang: l.getAttribute("hreflang") || "",
      href: l.href,
      raw: l.getAttribute("href") || "",
    })),
    blocks,
    truncated,
  };
})()`;

/** Scrolls through the page so lazy-loaded sections render before extraction. */
export const AUTOSCROLL_SCRIPT = String.raw`(async () => {
  const step = Math.max(400, window.innerHeight * 0.8);
  const limit = Math.min(document.body ? document.body.scrollHeight : 0, 30000);
  for (let y = 0; y < limit; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 80));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 150));
})()`;
