import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Disclaimer } from "@/components/ui";

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return (
    <>
      <TopBar user={null} />
      <main className="container">
        <section className="hero">
          <h1>Make your Quebec storefront French-first</h1>
          <p>
            Scan your Shopify, WordPress or any website for Bill 96 French-language gaps: English-only pages, English that
            outweighs French, untranslated buttons and alt text, broken hreflang. Then review AI-drafted Quebec French
            translations before you publish.
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
            <Link className="btn btn-primary" href="/signup">Create an account</Link>
            <Link className="btn" href="/login">Log in</Link>
          </div>
          <div className="features">
            <div className="card">
              <h3>Visual prominence</h3>
              <p className="muted">Measures French vs English by rendered font size, weight and position, not just word counts.</p>
            </div>
            <div className="card">
              <h3>Whole-site scans</h3>
              <p className="muted">Discovers pages from your sitemap and checks each one in a real browser, including hreflang reciprocity.</p>
            </div>
            <div className="card">
              <h3>Translation queue</h3>
              <p className="muted">Every English string found becomes a fr-CA draft to edit, approve and export, with a glossary for brand terms.</p>
            </div>
          </div>
          <Disclaimer />
        </section>
      </main>
    </>
  );
}
