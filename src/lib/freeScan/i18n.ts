import type { RiskBand } from "../siteScore";

/**
 * EN/FR copy for the public free scan. Copy rule: never say "compliant" or
 * "certified" (or the French equivalents); say "gaps found" and "French
 * drafts". tests/unit/freeScan.spec.ts enforces this.
 */

export type Lang = "en" | "fr";

/** ?lang= wins, then the browser's Accept-Language, then English. */
export function pickLang(param: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (param === "fr" || param === "en") return param;
  const first = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("fr") ? "fr" : "en";
}

export const HTML_LANG: Record<Lang, string> = { en: "en", fr: "fr-CA" };

const en = {
  otherLang: "Français",
  disclaimer: "Automated triage, not legal advice. French drafts are suggestions for a person to review before publishing.",
  scan: {
    title: "Free Bill 96 French scan",
    lead: "Paste your store's address. We check your homepage and up to 10 more pages for French-language gaps, then draft French for the English we find. No account needed.",
    urlLabel: "Store URL",
    urlPlaceholder: "https://www.mystore.com",
    submit: "Scan my site",
    submitting: "Starting…",
    limit: "One free scan per site every 24 hours.",
    checks: [
      "Pages with no French version",
      "English that stands out more than French (size, weight, position)",
      "Untranslated buttons, image text and page titles",
      "hreflang language links",
    ],
  },
  results: {
    title: "French-language scan",
    queued: (ahead: number) => (ahead > 0 ? `Waiting in line: ${ahead} scan${ahead === 1 ? "" : "s"} ahead of yours.` : "Starting your scan…"),
    discovering: "Finding pages…",
    scanning: "Scanning pages…",
    drafting: "Drafting French…",
    pages: (done: number, total: number) => `${done}/${total} pages`,
    failed: "The scan could not finish.",
    noPages: "We couldn't load any pages from this site.",
    tryAgain: "Run a new scan",
    reused: "This site was scanned in the last 24 hours. Here are those results.",
    siteScore: "Site score",
    scoreHint: "Out of 100, weighted by how serious each gap is",
    pagesChecked: "Pages checked",
    gapsFound: "Gaps found",
    englishStrings: "English strings",
    locked: "Locked",
    lockedHint: "Enter your email below",
    stringsHint: "need French",
    topIssues: "Top gaps found",
    allIssues: "All gaps found",
    onPages: (n: number) => `On ${n} page${n === 1 ? "" : "s"}`,
    fix: "Fix:",
    noGaps: "No gaps found on the pages we checked.",
    lockedMore: "The full list of gaps and the number of English strings are in the full results.",
    drafts: "French drafts",
    draftsIntro: "English we found on your pages, next to a Quebec French draft to review.",
    colEnglish: "English on your site",
    colFrench: "French draft (fr-CA)",
    mockDrafts: "Placeholder drafts: AI drafting is not set up on this server.",
    noDraft: "No draft yet",
    noStrings: "We didn't find English text that needs French on these pages.",
    stringsTotal: (n: number) => `${n} English string${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} French`,
    stringsShown: (n: number) => `French drafts are shown for the first ${n}.`,
    unlockTitle: "See the full results",
    unlockBody: "Enter your email to see every gap we found and how many English strings need French, and to get a link you can share (valid 30 days).",
    email: "Email",
    name: "Name (optional)",
    unlock: "Show full results",
    unlocking: "Unlocking…",
    consent: "We save your email with this scan and may contact you about your results.",
    shareTitle: "Share these results",
    shareHint: (date: string) => `Anyone with this link can see these results until ${date}.`,
    copy: "Copy link",
    copied: "Copied",
    ctaTitle: "Put every string in a translation queue",
    ctaBody: (n: number) =>
      `Create an account with the same email to get all ${n} English string${n === 1 ? "" : "s"} in a review queue with French drafts, then edit, approve and export them.`,
    cta: "Create an account",
    expired: "This results link has expired.",
  },
  bands: { low: "Low risk", medium: "Medium risk", high: "High risk", critical: "Critical risk" } satisfies Record<RiskBand, string>,
  severity: { critical: "critical", high: "high", medium: "medium", low: "low", info: "info" } as Record<string, string>,
  errors: {
    invalidUrl: "Enter a website address, like https://www.mystore.com.",
    notAllowed: "That address can't be scanned.",
    tooMany: "Too many requests from your network. Try again later.",
    busy: "We're scanning a lot of sites right now. Try again in a few minutes.",
    invalidEmail: "Enter a valid email address.",
    notReady: "These results aren't ready yet.",
    generic: "Something went wrong. Try again.",
  },
};

export type Strings = typeof en;

const fr: Strings = {
  otherLang: "English",
  disclaimer: "Triage automatisé, pas un avis juridique. Les ébauches en français sont des suggestions à faire réviser par une personne avant publication.",
  scan: {
    title: "Analyse gratuite du français (loi 96)",
    lead: "Collez l'adresse de votre boutique. Nous vérifions votre page d'accueil et jusqu'à 10 autres pages pour repérer les lacunes en français, puis nous préparons des ébauches en français pour le texte anglais trouvé. Aucun compte requis.",
    urlLabel: "Adresse de la boutique",
    urlPlaceholder: "https://www.maboutique.com",
    submit: "Analyser mon site",
    submitting: "Démarrage…",
    limit: "Une analyse gratuite par site toutes les 24 heures.",
    checks: [
      "Pages sans version française",
      "Anglais plus visible que le français (taille, graisse, position)",
      "Boutons, textes d'images et titres de page non traduits",
      "Liens de langue hreflang",
    ],
  },
  results: {
    title: "Analyse du français",
    queued: (ahead) => (ahead > 0 ? `En file d'attente : ${ahead} analyse${ahead === 1 ? "" : "s"} avant la vôtre.` : "Démarrage de votre analyse…"),
    discovering: "Recherche des pages…",
    scanning: "Analyse des pages…",
    drafting: "Préparation des ébauches en français…",
    pages: (done, total) => `${done}/${total} pages`,
    failed: "L'analyse n'a pas pu se terminer.",
    noPages: "Nous n'avons pu charger aucune page de ce site.",
    tryAgain: "Lancer une nouvelle analyse",
    reused: "Ce site a été analysé dans les dernières 24 heures. Voici ces résultats.",
    siteScore: "Note du site",
    scoreHint: "Sur 100, pondérée selon la gravité de chaque lacune",
    pagesChecked: "Pages vérifiées",
    gapsFound: "Lacunes trouvées",
    englishStrings: "Textes en anglais",
    locked: "Verrouillé",
    lockedHint: "Entrez votre courriel ci-dessous",
    stringsHint: "à traduire",
    topIssues: "Principales lacunes trouvées",
    allIssues: "Toutes les lacunes trouvées",
    onPages: (n) => `Sur ${n} page${n === 1 ? "" : "s"}`,
    fix: "Correctif :",
    noGaps: "Aucune lacune trouvée sur les pages vérifiées.",
    lockedMore: "La liste complète des lacunes et le nombre de textes en anglais se trouvent dans les résultats complets.",
    drafts: "Ébauches en français",
    draftsIntro: "Texte anglais trouvé sur vos pages, à côté d'une ébauche en français québécois à réviser.",
    colEnglish: "Anglais sur votre site",
    colFrench: "Ébauche française (fr-CA)",
    mockDrafts: "Ébauches fictives : la rédaction par IA n'est pas configurée sur ce serveur.",
    noDraft: "Pas encore d'ébauche",
    noStrings: "Nous n'avons pas trouvé de texte anglais à traduire sur ces pages.",
    stringsTotal: (n) => `${n} texte${n === 1 ? "" : "s"} en anglais à traduire en français`,
    stringsShown: (n) => `Les ébauches en français sont affichées pour les ${n} premiers.`,
    unlockTitle: "Voir tous les résultats",
    unlockBody: "Entrez votre courriel pour voir toutes les lacunes trouvées et le nombre de textes anglais à traduire, et pour obtenir un lien à partager (valide 30 jours).",
    email: "Courriel",
    name: "Nom (facultatif)",
    unlock: "Afficher tous les résultats",
    unlocking: "Déverrouillage…",
    consent: "Nous enregistrons votre courriel avec cette analyse et pourrions vous contacter au sujet de vos résultats.",
    shareTitle: "Partager ces résultats",
    shareHint: (date) => `Toute personne ayant ce lien peut voir ces résultats jusqu'au ${date}.`,
    copy: "Copier le lien",
    copied: "Copié",
    ctaTitle: "Placez tous les textes dans une file de traduction",
    ctaBody: (n) =>
      `Créez un compte avec le même courriel pour obtenir les ${n} texte${n === 1 ? "" : "s"} en anglais dans une file de révision avec des ébauches en français, puis les modifier, les approuver et les exporter.`,
    cta: "Créer un compte",
    expired: "Ce lien vers les résultats a expiré.",
  },
  bands: { low: "Risque faible", medium: "Risque moyen", high: "Risque élevé", critical: "Risque critique" },
  severity: { critical: "critique", high: "élevée", medium: "moyenne", low: "faible", info: "info" },
  errors: {
    invalidUrl: "Entrez une adresse Web, par exemple https://www.maboutique.com.",
    notAllowed: "Cette adresse ne peut pas être analysée.",
    tooMany: "Trop de demandes depuis votre réseau. Réessayez plus tard.",
    busy: "Nous analysons beaucoup de sites en ce moment. Réessayez dans quelques minutes.",
    invalidEmail: "Entrez une adresse courriel valide.",
    notReady: "Ces résultats ne sont pas encore prêts.",
    generic: "Une erreur s'est produite. Réessayez.",
  },
};

export const STRINGS: Record<Lang, Strings> = { en, fr };

/** Plain-language title and one fix line per issue code, for site owners. */
export const ISSUE_COPY: Record<string, Record<Lang, { title: string; fix: string }>> = {
  NO_FRENCH_VERSION: {
    en: { title: "Pages with no French version", fix: "Publish a French version of each page and link it with hreflang." },
    fr: { title: "Pages sans version française", fix: "Publiez une version française de chaque page et reliez-la avec hreflang." },
  },
  ENGLISH_MORE_PROMINENT: {
    en: { title: "English stands out more than French", fix: "Give French text at least the same size, weight and placement as English." },
    fr: { title: "L'anglais est plus visible que le français", fix: "Donnez au français au moins la même taille, la même graisse et le même emplacement que l'anglais." },
  },
  ENGLISH_LARGER_TEXT: {
    en: { title: "English text is bigger than the French", fix: "Make French headings and labels at least as large as the English ones." },
    fr: { title: "Le texte anglais est plus grand que le français", fix: "Affichez les titres et libellés français au moins aussi grands que les anglais." },
  },
  ENGLISH_DOMINATES_ABOVE_FOLD: {
    en: { title: "English dominates the first screen", fix: "Lead with French in the header, hero and announcement bar." },
    fr: { title: "L'anglais domine le premier écran", fix: "Mettez le français en premier dans l'en-tête, la bannière principale et la barre d'annonce." },
  },
  UNTRANSLATED_TEXT: {
    en: { title: "English text left on French pages", fix: "Translate the leftover strings. They are often theme or app text your translation app missed." },
    fr: { title: "Texte anglais resté sur des pages françaises", fix: "Traduisez les textes restants. Ce sont souvent des textes du thème ou d'une application oubliés par votre outil de traduction." },
  },
  UNTRANSLATED_ATTRIBUTES: {
    en: { title: "English image text, placeholders or button labels", fix: "Translate image alt text, form placeholders and button labels." },
    fr: { title: "Textes d'images, textes indicatifs ou boutons en anglais", fix: "Traduisez le texte alternatif des images, les textes indicatifs des formulaires et les libellés des boutons." },
  },
  UNTRANSLATED_META: {
    en: { title: "English page titles or search descriptions", fix: "Translate the SEO title and meta description of French pages." },
    fr: { title: "Titres de page ou descriptions de recherche en anglais", fix: "Traduisez le titre SEO et la méta-description des pages françaises." },
  },
  ENGLISH_PAGE_WITH_FRENCH_VERSION: {
    en: { title: "English pages that link to a French version", fix: "Nothing to fix here. Make sure the French version is complete." },
    fr: { title: "Pages anglaises liées à une version française", fix: "Rien à corriger ici. Vérifiez que la version française est complète." },
  },
  HTML_LANG_MISSING: {
    en: { title: "Page language isn't declared", fix: 'Set <html lang="fr-CA"> on French pages.' },
    fr: { title: "La langue de la page n'est pas déclarée", fix: 'Ajoutez <html lang="fr-CA"> aux pages françaises.' },
  },
  HTML_LANG_MISMATCH: {
    en: { title: "Declared page language doesn't match the text", fix: "Make the lang attribute match the page's actual language." },
    fr: { title: "La langue déclarée ne correspond pas au texte", fix: "Faites correspondre l'attribut lang à la langue réelle de la page." },
  },
  HREFLANG_MISSING: {
    en: { title: "No language links (hreflang)", fix: "Add hreflang tags that point to each language version of the page." },
    fr: { title: "Aucun lien de langue (hreflang)", fix: "Ajoutez des balises hreflang vers chaque version linguistique de la page." },
  },
  HREFLANG_NO_SELF: {
    en: { title: "Language links leave out the page itself", fix: "Include each page in its own hreflang set." },
    fr: { title: "Les liens de langue omettent la page elle-même", fix: "Incluez chaque page dans son propre ensemble hreflang." },
  },
  HREFLANG_NO_X_DEFAULT: {
    en: { title: "No default language link (x-default)", fix: 'Add hreflang="x-default" pointing to your default page.' },
    fr: { title: "Aucun lien de langue par défaut (x-default)", fix: 'Ajoutez hreflang="x-default" vers votre page par défaut.' },
  },
  HREFLANG_INVALID_CODE: {
    en: { title: "Invalid language codes in hreflang", fix: 'Use codes like "fr-CA", "en-CA" or "fr".' },
    fr: { title: "Codes de langue invalides dans hreflang", fix: "Utilisez des codes comme « fr-CA », « en-CA » ou « fr »." },
  },
  HREFLANG_NO_FRENCH: {
    en: { title: "Language links don't point to French", fix: 'Add an hreflang="fr-CA" link to the French version.' },
    fr: { title: "Les liens de langue ne mènent pas au français", fix: 'Ajoutez un lien hreflang="fr-CA" vers la version française.' },
  },
  HREFLANG_CONFLICT: {
    en: { title: "Conflicting language links", fix: "Point each language code to exactly one URL." },
    fr: { title: "Liens de langue contradictoires", fix: "Faites pointer chaque code de langue vers une seule adresse." },
  },
  HREFLANG_BROKEN_ALTERNATE: {
    en: { title: "Broken language links", fix: "Fix or remove hreflang links that return errors." },
    fr: { title: "Liens de langue brisés", fix: "Corrigez ou retirez les liens hreflang qui renvoient une erreur." },
  },
  HREFLANG_NOT_RECIPROCAL: {
    en: { title: "Language links that don't link back", fix: "Make each French and English page link to the other." },
    fr: { title: "Liens de langue sans lien de retour", fix: "Faites en sorte que chaque page française et anglaise renvoie à l'autre." },
  },
  HTTP_ERROR: {
    en: { title: "Pages returning errors", fix: "Fix or redirect pages that return an error status." },
    fr: { title: "Pages qui renvoient une erreur", fix: "Corrigez ou redirigez les pages qui renvoient un code d'erreur." },
  },
  LOAD_FAILED: {
    en: { title: "Pages we couldn't load", fix: "Check that these pages are publicly reachable." },
    fr: { title: "Pages impossibles à charger", fix: "Vérifiez que ces pages sont accessibles publiquement." },
  },
  CONSOLE_ERRORS: {
    en: { title: "JavaScript errors", fix: "Fix script errors. They can stop translation apps from showing French." },
    fr: { title: "Erreurs JavaScript", fix: "Corrigez les erreurs de script. Elles peuvent empêcher les applications de traduction d'afficher le français." },
  },
};
