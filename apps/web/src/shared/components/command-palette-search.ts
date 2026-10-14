/**
 * Korean Hangul Chosung (초성) and fuzzy search utility for the ToonStudio Command Palette.
 * Supports Korean consonant decomposition, prefix matching, and multi-keyword synonyms.
 *
 * 초성 추출·판정은 손구현을 걷어내고 es-hangul 기반 공용 유틸(@/shared/lib/hangul)을 쓴다.
 * 이 파일의 export 이름·동작 계약은 기존 테스트(command-palette-search.test.ts)가 고정한다.
 */
import { choseongOf, isChoseongQuery } from "@/shared/lib/hangul";

/**
 * Extracts Korean Chosung (initial consonants) from a string.
 * Non-Hangul characters are preserved as-is.
 */
export function extractChosung(str: string): string {
  return choseongOf(str);
}

/**
 * Checks if a string contains only Korean Chosung consonants.
 */
export function isChosungOnly(str: string): boolean {
  return isChoseongQuery(str);
}

/**
 * Matches target text against query supporting:
 * 1. Direct substring search (case-insensitive)
 * 2. Korean Chosung search (e.g. 'ㅅㅌㄷㅇ' -> '스튜디오')
 * 3. Additional keywords/synonyms search
 */
export function matchesCommandSearch(
  target: string,
  query: string,
  keywords?: readonly string[],
  subtitle?: string
): boolean {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return true;

  const cleanT = target.toLowerCase();
  if (cleanT.includes(cleanQ)) return true;

  if (subtitle && subtitle.toLowerCase().includes(cleanQ)) return true;

  // Chosung matching
  if (isChosungOnly(cleanQ)) {
    const targetChosung = extractChosung(cleanT);
    if (targetChosung.includes(cleanQ)) return true;
    if (subtitle && extractChosung(subtitle.toLowerCase()).includes(cleanQ)) return true;
  }

  // Also check if target's chosung matches the query's chosung
  const targetChosung = extractChosung(cleanT);
  const queryChosung = extractChosung(cleanQ);
  if (targetChosung.includes(queryChosung)) return true;

  // Synonyms and aliases matching
  if (keywords && keywords.length > 0) {
    for (const kw of keywords) {
      const cleanKw = kw.toLowerCase();
      if (cleanKw.includes(cleanQ)) return true;
      if (isChosungOnly(cleanQ) && extractChosung(cleanKw).includes(cleanQ)) return true;
      if (extractChosung(cleanKw).includes(queryChosung)) return true;
    }
  }

  return false;
}
