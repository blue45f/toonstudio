/**
 * Studio 문서의 대사 번역을 홍보 쇼츠 편집기가 읽는 "번역 초안" 목록으로 바꾸는 순수 규칙.
 *
 * 문서에는 대사 번역이 요소 사이드 저장소(dialogueI18n)에, 검수 상태가 dialogueReview에 들어 있다.
 * 여기서는 그 값을 있는 그대로 옮긴다. 번역하거나 문장을 고치지 않고, 번역이 없는 대사를 채우지 않는다.
 *
 *  - 초안의 원문(source)은 번역을 만든 시점의 원문 스냅샷이다(없으면 현재 텍스트).
 *  - 승인(approved)은 검수 상태가 "승인"인 번역뿐이다. "수정 필요"와 미검수는 승인 전 초안이다.
 *  - 원문 행(rows)은 보이는 모든 말풍선·텍스트의 "현재 원문"이다. 번역이 없는 대사도 "번역 없음"으로 판정할 수 있게 담는다.
 *    번역 뒤에 원문을 고쳤다면 행의 원문(고친 글)과 초안의 원문(스냅샷)이 달라져 홍보 편집기가 "오래됨"으로 판정한다.
 *    캔버스가 지금 번역 언어를 보여 주고 있으면 el.text는 번역문이라 스냅샷이 현재 원문의 유일한 단서다.
 */
import { collectDialogueItems } from "../lettering/studio-dialogue-batch";
import { SOURCE_LOCALE } from "../lettering/studio-dialogue-translate";
import {
  isPromoLocaleCode,
  PROMO_TRANSLATION_DRAFTS_MAX,
  PROMO_TRANSLATION_ROWS_MAX,
  PROMO_TRANSLATION_TEXT_MAX,
} from "../promo/promo-handoff-contract";
import { studioPromoPageElements } from "./studio-promo-cuts";

import type { DialogueReviewPageLike } from "../lettering/studio-dialogue-review";

export interface StudioPromoTranslationRow {
  readonly pageId: string;
  readonly elementId: string;
  readonly source: string;
}
export interface StudioPromoTranslationEntry extends StudioPromoTranslationRow {
  readonly locale: string;
  readonly text: string;
  readonly approved: boolean;
}
export interface StudioPromoTranslationLocale {
  readonly code: string;
  /** 번역문이 있는 대사 수. */
  readonly total: number;
  /** 그중 검수에서 승인한 수. */
  readonly approved: number;
}
export interface StudioPromoTranslationListing {
  readonly rows: readonly StudioPromoTranslationRow[];
  readonly entries: readonly StudioPromoTranslationEntry[];
  readonly locales: readonly StudioPromoTranslationLocale[];
  /** 로케일 코드 모양이 맞지 않아(예: 한글 이름) 뺀 로케일. */
  readonly skippedLocales: readonly string[];
  /** ID·글자 수 상한을 넘어 뺀 행·번역 수. */
  readonly oversizedCount: number;
  /** 지금 캔버스에 번역 언어로 표시되고 있는 대사 수 — 컷 묶음 자막이 번역문이 된다. */
  readonly translatedVisibleCount: number;
}

function idFits(value: string): boolean {
  return value.length >= 1 && value.length <= 200;
}

/** 번역 초안 ID — 페이지·대사·로케일이 같으면 항상 같은 값이다(내보낼 때마다 달라지지 않는다). */
export function studioPromoTranslationDraftId(pageId: string, elementId: string, locale: string): string {
  return `${pageId}:${elementId}:${locale}`;
}

/** 선택한 페이지 범위의 대사와 번역을 읽기 순서로 나열한다. */
export function listStudioPromoTranslations(
  pages: readonly DialogueReviewPageLike[],
  pageIndices: readonly number[],
): StudioPromoTranslationListing {
  const indices = [...new Set(pageIndices)]
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((left, right) => left - right);
  const rows: StudioPromoTranslationRow[] = [];
  const entries: StudioPromoTranslationEntry[] = [];
  const skippedLocales = new Set<string>();
  let oversizedCount = 0;
  let translatedVisibleCount = 0;

  for (const pageIndex of indices) {
    const page = pages[pageIndex];
    if (!page) continue;
    // 컷 나열과 같은 요소 집합(숨기거나 작은 프레임 제외)으로 읽기 순서를 계산해 두 목록의 순서가 어긋나지 않게 한다.
    for (const item of collectDialogueItems([{ id: page.id, elements: studioPromoPageElements(page).elements, groups: page.groups }])) {
      if (item.hidden) continue;
      const translations = page.dialogueI18n?.[item.id];
      // 번역을 만들 때 남긴 원문 스냅샷. 번역 기록이 없으면 지금 텍스트가 곧 원문이다.
      const snapshot = translations?.[SOURCE_LOCALE];
      const translatedSource = snapshot ?? item.text;
      // 캔버스가 지금 번역 언어를 보여 주면 el.text는 번역문이라 현재 원문은 스냅샷뿐이다. 원문 언어를 보여 주고 있으면
      // el.text가 현재 원문이다 — 번역 뒤에 원문을 고쳤다면 스냅샷과 달라져 홍보 편집기에서 "오래됨"으로 판정된다.
      const locales = translations
        ? Object.keys(translations).filter((code) => code !== SOURCE_LOCALE).sort((left, right) => left.localeCompare(right))
        : [];
      const showsTranslation = snapshot !== undefined && item.text !== snapshot
        && locales.some((code) => translations?.[code] === item.text);
      const currentSource = showsTranslation ? translatedSource : item.text;
      if (!currentSource.trim()) continue;
      if (!idFits(page.id) || !idFits(item.id) || currentSource.length > PROMO_TRANSLATION_TEXT_MAX || translatedSource.length > PROMO_TRANSLATION_TEXT_MAX) {
        oversizedCount += 1;
        continue;
      }
      rows.push({ pageId: page.id, elementId: item.id, source: currentSource });
      if (!translations) continue;

      for (const locale of locales) {
        const text = translations[locale];
        if (typeof text !== "string" || !text.trim()) continue;
        if (!isPromoLocaleCode(locale)) {
          skippedLocales.add(locale);
          continue;
        }
        if (text.length > PROMO_TRANSLATION_TEXT_MAX || studioPromoTranslationDraftId(page.id, item.id, locale).length > 200) {
          oversizedCount += 1;
          continue;
        }
        entries.push({
          pageId: page.id,
          elementId: item.id,
          source: translatedSource,
          locale,
          text,
          approved: page.dialogueReview?.[item.id]?.[locale] === "approved",
        });
      }
      if (showsTranslation) translatedVisibleCount += 1;
    }
  }

  const byLocale = new Map<string, { total: number; approved: number }>();
  for (const entry of entries) {
    const current = byLocale.get(entry.locale) ?? { total: 0, approved: 0 };
    byLocale.set(entry.locale, { total: current.total + 1, approved: current.approved + (entry.approved ? 1 : 0) });
  }
  const locales = [...byLocale.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, counts]): StudioPromoTranslationLocale => ({ code, ...counts }));
  return {
    rows,
    entries,
    locales,
    skippedLocales: [...skippedLocales].sort((left, right) => left.localeCompare(right)),
    oversizedCount,
    translatedVisibleCount,
  };
}

/** 한 파일에 담을 수 있는 초안·행 수를 넘었는가. */
export function exceedsStudioPromoTranslationLimit(
  listing: Pick<StudioPromoTranslationListing, "rows" | "entries">,
): boolean {
  return listing.entries.length > PROMO_TRANSLATION_DRAFTS_MAX || listing.rows.length > PROMO_TRANSLATION_ROWS_MAX;
}
