/**
 * 카피 점검 휴리스틱(순수 함수). 페이지에서 모은 보이는 문자열과 속성 문자열을 받아 다음을 가려낸다.
 *
 * 1. 번역 키 노출: `route.studioNew` 처럼 공백 없는 점(.) 구분 식별자가 사용자에게 그대로 보이는 경우
 * 2. 자리표시자 누출: `{value0}`, `{{name}}`, `${x}`, `undefined`, `[object Object]`, `NaN`, `%s`
 * 3. 영어/한국어 혼재 의심: 한글이 없는 3단어 이상 영어 문장(한국어 우선 제품의 한국어 화면 기준)
 *
 * 휴리스틱이므로 오탐·미탐이 있다. 보고서는 항상 탐지된 문자열 원문(표본)을 함께 싣고, 점수 영향은 상한으로 제한한다.
 * 제외 규칙: 전부 대문자인 영문 라벨(DESIGN.md 의 섹션 영문 라벨 시그니처), 브랜드 문구, 코드·주소처럼 보이는 문자열.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/u;

/** 파일 확장자·최상위 도메인처럼 점 뒤에 오는 흔한 접미사. 번역 키가 아니다. */
const NON_KEY_SUFFIXES = new Set([
  "com", "net", "org", "io", "app", "dev", "kr", "co", "me", "ai", "tv", "xyz", "info",
  "md", "json", "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "mp4", "webm", "mp3", "wav", "ogg",
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "html", "htm", "pdf", "zip", "txt", "csv", "xml", "yml", "yaml",
  "psd", "clip", "kra", "vrm", "glb", "gltf", "fbx", "obj", "usd", "usdz", "blend", "exe", "dmg", "apk", "ipa", "toon",
]);

const KEY_PATTERN = /^[a-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/u;

/** 한국어 화면에서 영어 그대로 두는 브랜드·고정 문구(소문자 비교). */
export const DEFAULT_ENGLISH_ALLOWLIST = Object.freeze([
  "stories come to life",
  "story comes to life",
]);

/**
 * 번역 키가 그대로 노출된 문자열인지.
 * @param {string} text
 */
export function looksLikeTranslationKey(text) {
  const value = text.trim();
  if (value.length < 4 || value.length > 80) return false;
  if (!KEY_PATTERN.test(value) || value.startsWith("www.")) return false;
  const segments = value.split(".");
  const last = segments[segments.length - 1].toLowerCase();
  return !NON_KEY_SUFFIXES.has(last);
}

const LEAK_PATTERNS = Object.freeze([
  ["value-template", /\{value\d+\}/u],
  ["mustache", /\{\{\s*[\w.$-]+\s*\}\}/u],
  ["template-literal", /\$\{[^}]+\}/u],
  ["object-object", /\[object Object\]/u],
  ["undefined", /\bundefined\b/u],
  ["nan", /\bNaN\b/u],
  ["null", /(?<![\w.])null(?![\w.])/u],
  ["printf", /(?<![\w%])%[sd](?!\w)/u],
]);

/**
 * 치환되지 않은 자리표시자·직렬화 누출이 보이는지. 해당 종류 이름을 돌려주고 없으면 null.
 * @param {string} text
 */
export function findPlaceholderLeak(text) {
  for (const [kind, pattern] of LEAK_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

/**
 * 한글이 전혀 없는 3단어 이상 영어 문장인지.
 * @param {string} text
 * @param {readonly string[]} [allowlist]
 */
export function looksLikeEnglishSentence(text, allowlist = DEFAULT_ENGLISH_ALLOWLIST) {
  const value = text.trim().replace(/\s+/gu, " ");
  if (value.length < 12 || HANGUL.test(value)) return false;
  if (/[{}=@\\<>|]|:\/\/|\/\//u.test(value)) return false;
  const letters = value.replace(/[^A-Za-z]/gu, "");
  if (letters.length < 8) return false;
  // 전부 대문자인 영문 라벨은 디자인 시그니처(섹션 영문 라벨)라 혼재로 보지 않는다.
  if (letters === letters.toUpperCase()) return false;
  if (allowlist.includes(value.toLowerCase())) return false;
  const words = value.split(" ").filter((word) => /^[A-Za-z][A-Za-z'’-]*[.,:;!?)]*$/u.test(word.replace(/^[("'“‘]+/u, "")));
  return words.length >= 3 && words.length >= value.split(" ").length - 1;
}

function byCountThenText(left, right) {
  return right.count - left.count || left.text.localeCompare(right.text, "en");
}

/**
 * 페이지에서 모은 문자열을 분석한다.
 * @param {{ texts: ReadonlyArray<{ text: string, count: number, tag?: string }>, attributes?: ReadonlyArray<{ kind: string, text: string, count: number, tag?: string }>, englishAllowlist?: readonly string[], limit?: number }} input
 */
export function analyzeCopy({ texts, attributes = [], englishAllowlist = DEFAULT_ENGLISH_ALLOWLIST, limit = 20 }) {
  const rawKeys = new Map();
  const leaks = new Map();
  const english = new Map();
  const add = (map, text, count, extra) => {
    const existing = map.get(text);
    if (existing) existing.count += count;
    else map.set(text, { text, count, ...extra });
  };
  for (const entry of texts) {
    const text = entry.text.trim();
    if (!text) continue;
    if (looksLikeTranslationKey(text)) add(rawKeys, text, entry.count, { where: entry.tag ?? "text" });
    const leak = findPlaceholderLeak(text);
    if (leak) add(leaks, text, entry.count, { kind: leak, where: entry.tag ?? "text" });
    if (looksLikeEnglishSentence(text, englishAllowlist)) add(english, text, entry.count, { where: entry.tag ?? "text" });
  }
  for (const entry of attributes) {
    const text = entry.text.trim();
    if (!text) continue;
    const where = `${entry.tag ?? "*"}[${entry.kind}]`;
    if (looksLikeTranslationKey(text)) add(rawKeys, text, entry.count, { where });
    const leak = findPlaceholderLeak(text);
    if (leak) add(leaks, text, entry.count, { kind: leak, where });
  }
  const sorted = (map) => [...map.values()].sort(byCountThenText);
  const rawKeyList = sorted(rawKeys);
  const leakList = sorted(leaks);
  const englishList = sorted(english);
  return {
    rawKeys: { distinct: rawKeyList.length, samples: rawKeyList.slice(0, limit) },
    placeholderLeaks: { distinct: leakList.length, samples: leakList.slice(0, limit) },
    englishSentences: { distinct: englishList.length, samples: englishList.slice(0, limit) },
  };
}
