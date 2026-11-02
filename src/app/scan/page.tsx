import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getUser } from "@/lib/auth";
import { HTML_LANG, pickLang, STRINGS } from "@/lib/freeScan/i18n";
import { TopBar } from "@/components/TopBar";
import { FreeScanForm } from "@/components/FreeScan";

export const metadata: Metadata = { title: "Free French scan · Analyse gratuite du français | Bill 96 Checker" };

export default async function FreeScanPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = pickLang((await searchParams).lang, (await headers()).get("accept-language"));
  const t = STRINGS[lang];
  const other = lang === "fr" ? "en" : "fr";
  const user = await getUser();
  return (
    <>
      <TopBar user={user} />
      <main className="container" lang={HTML_LANG[lang]}>
        <section className="hero">
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Link href={`/scan?lang=${other}`} lang={HTML_LANG[other]}>{t.otherLang}</Link>
          </div>
          <h1>{t.scan.title}</h1>
          <p>{t.scan.lead}</p>
          <div className="card" style={{ textAlign: "left", marginTop: 24 }}>
            <FreeScanForm lang={lang} />
          </div>
          <ul className="checks">
            {t.scan.checks.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <p className="disclaimer">{t.disclaimer}</p>
        </section>
      </main>
    </>
  );
}
