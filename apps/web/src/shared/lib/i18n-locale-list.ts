export function normalizeLocaleCode(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().replace(/_/g, "-").toLowerCase();
}

/** Every two-letter ISO 639-1 language code (184 languages). */
export const ISO_639_1_LANGUAGE_LOCALE_LIST: readonly string[] = (
  "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu"
).split(" ");

/** Widely used BCP 47 languages without an ISO 639-1 two-letter code (204 languages). */
export const EXTENDED_LANGUAGE_LOCALE_LIST: readonly string[] = (
  "ace ach ada alt arn ast awa ban bal bas bem ber bho bik bin bjn brx bua bug ceb chk chm chr ckb crh csb dak din doi dsb dua dyu efi eka ewo fan fil fon fur gaa gag gan gil gom gor gsw guz hak haw hil hmn hsb hsn ibb ilo inh jbo jgo jmc kab kac kaj kam kbd kcg kde kea kha khq kkj kln kmb kok kos kpe krc kri krl ksb ksf ksh kum lad lag lez lij lkt lmo loz lrc lua luo lus luy mad mag mai mak mas mdf men mer mfe mgh mgo mic min mni mos mua mus mwl mwr myv mzn nan nap naq nds new nia niu nmg nnh nog nqo nso nus nyn pag pam pap pau pcm prg quc raj rap rar rof rom rup rwk sad sah saq sat sba sbp scn sco seh ses shi shn sid sma smj smn sms snk srn ssy suk sus swb syr szl tem teo tet tig tiv tkl tlh tpi trv tum tvl twq tyv tzm udm umb vai vec vls vun wae wal war wbp wuu xal xog yao yap yav ybb yue zap zgh zun zza"
).split(" ");

/**
 * Worldwide country, region, and script variants across all global regions (351 variants).
 * `ko-KR` and `zh-Hant-TW` intentionally resolve to canonical `ko` and `zh-hant`.
 */
export const REGIONAL_AND_SCRIPT_LOCALE_LIST: readonly string[] = Object.entries({
  af: "NA ZA", am: "ET",
  ar: "AE BH DJ DZ EG ER IL IQ JO KM KW LB LY MA MR OM PS QA SA SD SO SS SY TD TN YE",
  as: "IN", az: "AZ Cyrl Latn", be: "BY", bg: "BG", bn: "BD IN", bs: "BA Cyrl Latn",
  ca: "AD ES FR IT", cs: "CZ", cy: "GB", da: "DK GL", de: "AT BE CH DE IT LI LU",
  dz: "BT", el: "CY GR",
  en: "AE AG AI AS AT AU BB BE BI BM BS BW BZ CA CH CM CY DE DK DM ER FI FJ FK FM GB GD GH GI GM GU GY HK ID IE IL IN JM KE KI KN KY LC LR LS MG MH MT MU MW MY NA NG NL NR NZ PG PH PK PR PW RW SB SC SD SE SG SL SS SZ TC TO TT TV TZ UG US VC VG VI VU WS ZA ZM ZW",
  es: "419 AR BO BR BZ CL CO CR CU DO EC ES GQ GT HN MX NI PA PE PH PR PY SV US UY VE",
  et: "EE", eu: "ES", fa: "AF IR", fi: "FI", fil: "PH", fo: "DK FO",
  fr: "BE BF BI BJ BL CA CD CF CG CH CI CM DJ DZ FR GA GF GN GP GQ HT KM LU MA MC MF MG ML MQ MR MU NC NE PF PM RE RW SC SN SY TD TG TN VU WF YT",
  ga: "GB IE", gd: "GB", gl: "ES", gn: "PY", gu: "IN", ha: "GH NE NG", he: "IL",
  hi: "IN", hr: "BA HR", ht: "HT", hu: "HU", hy: "AM", id: "ID", ig: "NG", is: "IS",
  it: "CH IT SM VA", ja: "JP", jv: "ID", ka: "GE", kk: "Cyrl KZ Latn", kl: "GL",
  km: "KH", kn: "IN", ks: "Arab Deva", ku: "Arab Latn TR", ky: "KG", lb: "LU",
  lg: "UG", ln: "CD CG", lo: "LA", lt: "LT", lu: "CD", lv: "LV", mg: "MG", mi: "NZ",
  mk: "MK", ml: "IN", mn: "Cyrl MN Mong", mr: "IN", ms: "BN ID MY SG", mt: "MT",
  my: "MM", nb: "NO SJ", nd: "ZW", ne: "IN NP", nl: "AW BE BQ CW NL SR SX",
  nn: "NO", no: "NO", nr: "ZA", ny: "MW", om: "ET KE", or: "IN", os: "GE RU",
  pa: "Arab Guru IN PK", pl: "PL", ps: "AF PK",
  pt: "AO BR CH CV GQ GW LU MO MZ PT ST TL", qu: "BO EC PE", rm: "CH", rn: "BI",
  ro: "MD RO", ru: "BY KG KZ MD RU UA", rw: "RW", sa: "IN", sd: "Arab Deva PK",
  se: "FI NO SE", sg: "CF", si: "LK", sk: "SK", sl: "SI", sm: "AS WS", sn: "ZW",
  so: "DJ ET KE SO", sq: "AL MK XK", sr: "BA Cyrl Latn ME RS XK", ss: "SZ ZA",
  st: "LS ZA", su: "ID", sv: "AX FI SE", sw: "CD KE TZ UG", ta: "IN LK MY SG",
  te: "IN", tg: "TJ", th: "TH", ti: "ER ET", tk: "TM", tl: "PH", tn: "BW ZA",
  to: "TO", tr: "CY TR", ts: "ZA", tt: "RU", ug: "CN", uk: "UA", ur: "IN PK",
  uz: "AF Cyrl Latn UZ", ve: "ZA", vi: "VN", wo: "SN", xh: "ZA", yi: "001",
  yo: "BJ NG", yue: "HK CN", zgh: "MA Tfng", zh: "CN Hans Hant HK MO MY SG TW", zu: "ZA",
}).flatMap(([lang, subs]) => subs.split(" ").map((sub) => `${lang}-${sub}`));

/** Backward-compatible catalog that was previously exposed by the product. */
export const GOOGLE_PLAY_LOCALE_LIST: readonly string[] = (
  "af am ar as az be bg bn bs ca ceb cs cy da de de-AT de-CH de-DE el en en-AU en-GB en-IN en-US es es-419 es-ES es-MX et eu fa fi fil fr fr-CA fr-CH gl gu ha he hi hi-IN hr hu hy id ig is it ja jv ka kk km kn ko ku ky lo lt lv mk ml mn mr ms my nb ne nl nl-BE no or pa pl ps pt pt-BR pt-PT ro ru si sk sl so sq sr sv sw ta te th tl tr uk ur uz vi zh zh-CN zh-Hans zh-Hant zh-HK zh-TW zu"
).split(" ");

export const WORLD_LANGUAGE_LOCALE_LIST: readonly string[] = [
  ...ISO_639_1_LANGUAGE_LOCALE_LIST,
  ...EXTENDED_LANGUAGE_LOCALE_LIST,
  ...REGIONAL_AND_SCRIPT_LOCALE_LIST,
  ...GOOGLE_PLAY_LOCALE_LIST,
];

export const NORMALIZED_LOCALE_OPTIONS = (() => {
  const set = new Set<string>();
  for (const locale of WORLD_LANGUAGE_LOCALE_LIST) {
    const normalized = normalizeLocaleCode(locale);
    if (normalized) set.add(normalized);
  }
  return [...set];
})();
