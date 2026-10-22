/**
 * Lightweight French/English classifier for short UI strings and paragraphs.
 *
 * Words that are common in BOTH languages ("on", "a", "or", "plus", "total",
 * "contact", "menu", "code", "description", "type", "service"...) are
 * deliberately left out of both lists so they never tip the balance. Accented letters are a
 * strong French signal. Strings with no signal (brand names, SKUs, prices)
 * come back as "unknown" and are ignored by the predominance maths.
 */

export type Lang = "fr" | "en" | "mixed" | "unknown";

export interface LangResult {
  lang: Lang;
  fr: number;
  en: number;
  words: number;
}

const FR_WORDS = new Set(
  `le la les des du de un une et est sont pour avec vous votre vos nous notre nos sur dans au aux ce cette ces
  qui que quoi dont où ou mais donc ni pas ne moins très tout tous toute toutes être avoir fait faire
  en par afin chaque selon lors avant plusieurs autre autres
  il elle ils elles je tu mon ma mes ton ta tes son sa ses leur leurs lui y chez sans sous entre vers depuis
  aussi bien comme encore alors ici voici voilà jour jours ans année nouveau nouvelle nouveautés
  panier ajouter acheter commander commande commandes livraison gratuite gratuit retour retours boutique
  magasiner magasinez rechercher recherche compte connexion connecter déconnexion inscription inscrire
  accueil propos nous joindre aide prix taille couleur quantité avis épuisé rupture stock disponible
  produits produit voir lire suite découvrir découvrez achetez maintenant infolettre abonner abonnez courriel
  paiement caisse sous-total expédition expédié remboursement politique confidentialité conditions
  utilisation droits réservés mot passe oublié bienvenue merci soldes solde rabais offre offres économisez
  meilleurs vendeurs collection collections catégories trier filtrer filtres résultats ingrédients détails
  caractéristiques garantie emballage cadeau cadeaux carte cartes-cadeaux taxes incluses magasin succursale
  heures ouverture lundi mardi mercredi jeudi vendredi samedi dimanche janvier février mars avril mai juin
  juillet août septembre octobre novembre décembre français anglais langue fermer ouvrir précédent suivant`
    .split(/\s+/)
    .filter(Boolean)
);

const EN_WORDS = new Set(
  `the and of to is are for with you your our we us this that these those which what who where when how
  it its be been being have has had do does did not no yes but if then than from by at as into about
  my he she they them their there here all any each every some more most other new now just only also
  very can will would should could may might must shall get got make made see view read learn shop buy
  add cart checkout bag basket shipping free returns return store search account login log sign up in out
  register home about us help price size color colour quantity reviews review sold stock available products
  product details features ingredients related recommended bestsellers best sellers newsletter subscribe
  email payment subtotal order orders track tracking refund policy privacy terms conditions rights reserved
  password forgot welcome thanks thank sale save offer offers deals shop now collection collections
  categories sort filter filters results warranty gift gifts card cards taxes included hours open closed
  monday tuesday wednesday thursday friday saturday sunday january february march april june july august
  september october november december english french language close previous next continue shopping
  wishlist share follow item items left only remove update apply discount enter`
    .split(/\s+/)
    .filter(Boolean)
);

const ACCENTED = /[àâäéèêëîïôöùûüÿçœæ]/i;
const FR_ELISION = /^(l|d|j|qu|n|s|c|m|t)['’]/i;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize("NFC").match(/[\p{L}][\p{L}'’-]*/gu) || []).flatMap((w) => {
    const m = w.match(FR_ELISION);
    return m ? [m[0], w.slice(m[0].length)] : [w];
  });
}

export function detectLanguage(text: string): LangResult {
  const words = tokenize(text);
  let fr = 0;
  let en = 0;
  for (const w of words) {
    if (FR_ELISION.test(w)) {
      fr += 1;
      continue;
    }
    const isFr = FR_WORDS.has(w);
    const isEn = EN_WORDS.has(w);
    if (isFr && !isEn) fr += 1;
    else if (isEn && !isFr) en += 1;
    if (ACCENTED.test(w)) fr += isFr ? 0.5 : 1;
  }
  return { lang: decide(fr, en), fr, en, words: words.length };
}

function decide(fr: number, en: number): Lang {
  const total = fr + en;
  if (total === 0) return "unknown";
  const frShare = fr / total;
  if (frShare >= 0.7) return "fr";
  if (frShare <= 0.3) return "en";
  // Short strings with a split signal are "mixed" only when both sides are real.
  return fr >= 1 && en >= 1 ? "mixed" : frShare > 0.5 ? "fr" : "en";
}
