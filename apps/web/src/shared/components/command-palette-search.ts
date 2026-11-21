/**
 * Korean Hangul Chosung (초성) and fuzzy search utility for the ToonStudio Command Palette.
 * Supports Korean consonant decomposition, prefix matching, and multi-keyword synonyms.
 *
 * 초성 추출·판정은 손구현을 걷어내고 es-hangul 기반 공용 유틸(@/shared/lib/hangul)을 쓴다.
 * 이 파일의 export 이름·동작 계약은 기존 테스트(command-palette-search.test.ts)가 고정한다.
 */
import { choseongOf, isChoseongQuery } from "@/shared/lib/hangul";

import type {
  PaletteCommand,
  PaletteCompetitorAlias,
  PalettePage,
  PaletteStudioTool,
} from "./command-palette-types";

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

/** 공백·하이픈·슬래시·중점을 제거해 경쟁 앱 용어 띄어쓰기 변형을 통일한다. */
export function normalizeCommandQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/·•.()]+/gu, "");
}

function aliasMatchesQuery(
  term: string,
  cleanQ: string,
  compactQ: string,
  chosungOnly: boolean,
  queryChosung: string,
): number {
  const cleanTerm = term.toLowerCase();
  const compactTerm = normalizeCommandQuery(term);
  if (cleanTerm === cleanQ || (compactQ.length > 0 && compactTerm === compactQ)) return 120;
  if (cleanTerm.startsWith(cleanQ) || (compactQ.length > 0 && compactTerm.startsWith(compactQ))) return 96;
  if (cleanTerm.includes(cleanQ) || (compactQ.length > 0 && compactTerm.includes(compactQ))) return 78;
  const termChosung = extractChosung(cleanTerm);
  if (chosungOnly && termChosung.includes(cleanQ)) return 72;
  if (queryChosung.length > 0 && termChosung.includes(queryChosung)) return 56;
  return 0;
}

/**
 * 검색어에 가장 정확하게 대응하는 경쟁 앱 용어 별칭을 반환한다.
 */
export function findMatchedCompetitorAlias(
  query: string,
  aliases?: readonly PaletteCompetitorAlias[],
): PaletteCompetitorAlias | null {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ || !aliases || aliases.length === 0) return null;
  const compactQ = normalizeCommandQuery(cleanQ);
  const chosungOnly = isChosungOnly(cleanQ);
  const queryChosung = extractChosung(cleanQ);

  let best: PaletteCompetitorAlias | null = null;
  let bestScore = 0;
  for (const alias of aliases) {
    const score = aliasMatchesQuery(alias.term, cleanQ, compactQ, chosungOnly, queryChosung);
    if (score > bestScore) {
      bestScore = score;
      best = alias;
    }
  }
  return best;
}

/**
 * Matches target text against query supporting:
 * 1. Direct substring & whitespace-insensitive search (case-insensitive)
 * 2. Korean Chosung search (e.g. 'ㅅㅌㄷㅇ' -> '스튜디오')
 * 3. Additional keywords/synonyms & competitor aliases search
 */
export function scoreCommandSearch(
  target: string,
  query: string,
  keywords?: readonly string[],
  subtitle?: string,
  competitorAliases?: readonly PaletteCompetitorAlias[],
): number {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return 1;

  const compactQ = normalizeCommandQuery(cleanQ);
  const cleanT = target.toLowerCase();
  const compactT = normalizeCommandQuery(target);
  const chosungOnly = isChosungOnly(cleanQ);
  const queryChosung = extractChosung(cleanQ);

  let best = 0;

  if (cleanT === cleanQ || (compactQ.length > 0 && compactT === compactQ)) {
    best = Math.max(best, 130);
  } else if (cleanT.startsWith(cleanQ) || (compactQ.length > 0 && compactT.startsWith(compactQ))) {
    best = Math.max(best, 108);
  } else if (cleanT.includes(cleanQ) || (compactQ.length > 0 && compactT.includes(compactQ))) {
    best = Math.max(best, 84);
  }

  if (competitorAliases && competitorAliases.length > 0) {
    for (const alias of competitorAliases) {
      best = Math.max(best, aliasMatchesQuery(alias.term, cleanQ, compactQ, chosungOnly, queryChosung));
    }
  }

  if (keywords && keywords.length > 0) {
    for (const kw of keywords) {
      const cleanKw = kw.toLowerCase();
      const compactKw = normalizeCommandQuery(kw);
      if (cleanKw === cleanQ || (compactQ.length > 0 && compactKw === compactQ)) {
        best = Math.max(best, 110);
      } else if (cleanKw.startsWith(cleanQ) || (compactQ.length > 0 && compactKw.startsWith(compactQ))) {
        best = Math.max(best, 88);
      } else if (cleanKw.includes(cleanQ) || (compactQ.length > 0 && compactKw.includes(compactQ))) {
        best = Math.max(best, 68);
      } else {
        const kwChosung = extractChosung(cleanKw);
        if (chosungOnly && kwChosung.includes(cleanQ)) best = Math.max(best, 64);
        else if (queryChosung.length > 0 && kwChosung.includes(queryChosung)) best = Math.max(best, 46);
      }
    }
  }

  if (subtitle) {
    const cleanSub = subtitle.toLowerCase();
    const compactSub = normalizeCommandQuery(subtitle);
    if (cleanSub.includes(cleanQ) || (compactQ.length > 0 && compactSub.includes(compactQ))) {
      best = Math.max(best, 52);
    } else if (chosungOnly && extractChosung(cleanSub).includes(cleanQ)) {
      best = Math.max(best, 44);
    }
  }

  const targetChosung = extractChosung(cleanT);
  if (chosungOnly && targetChosung.includes(cleanQ)) {
    best = Math.max(best, 76);
  } else if (queryChosung.length > 0 && targetChosung.includes(queryChosung)) {
    best = Math.max(best, 50);
  }

  return best;
}

export function matchesCommandSearch(
  target: string,
  query: string,
  keywords?: readonly string[],
  subtitle?: string,
  competitorAliases?: readonly PaletteCompetitorAlias[],
): boolean {
  return scoreCommandSearch(target, query, keywords, subtitle, competitorAliases) > 0;
}

export interface RankedPaletteItem<T> {
  readonly item: T;
  readonly score: number;
  readonly matchedAlias: PaletteCompetitorAlias | null;
}

export function rankPaletteCommands(
  commands: readonly PaletteCommand[],
  query: string,
): readonly RankedPaletteItem<PaletteCommand>[] {
  if (!query) {
    return commands.map((item) => ({ item, score: 1, matchedAlias: null }));
  }
  const ranked: RankedPaletteItem<PaletteCommand>[] = [];
  for (const item of commands) {
    const score = scoreCommandSearch(
      item.title,
      query,
      item.keywords,
      item.subtitle,
      item.competitorAliases,
    );
    if (score > 0) {
      ranked.push({
        item,
        score,
        matchedAlias: findMatchedCompetitorAlias(query, item.competitorAliases),
      });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function rankPaletteStudioTools(
  tools: readonly PaletteStudioTool[],
  query: string,
): readonly RankedPaletteItem<PaletteStudioTool>[] {
  if (!query) {
    return tools.map((item) => ({ item, score: 1, matchedAlias: null }));
  }
  const ranked: RankedPaletteItem<PaletteStudioTool>[] = [];
  for (const item of tools) {
    const score = scoreCommandSearch(
      item.name,
      query,
      item.keywords,
      item.tip,
      item.competitorAliases,
    );
    if (score > 0) {
      ranked.push({
        item,
        score,
        matchedAlias: findMatchedCompetitorAlias(query, item.competitorAliases),
      });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function rankPalettePages(
  pages: readonly PalettePage[],
  query: string,
): readonly RankedPaletteItem<PalettePage>[] {
  if (!query) {
    return pages.map((item) => ({ item, score: 1, matchedAlias: null }));
  }
  const ranked: RankedPaletteItem<PalettePage>[] = [];
  for (const item of pages) {
    const score = scoreCommandSearch(item.title, query, item.keywords, item.subtitle);
    if (score > 0) {
      ranked.push({ item, score, matchedAlias: null });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
