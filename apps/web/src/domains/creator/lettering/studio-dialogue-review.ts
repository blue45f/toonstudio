/**
 * Studio Dialogue Review — 적용된 대사 번역의 대조 검수(원문 ↔ 번역) 순수 코어.
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * `studio-dialogue-translate.ts`는 번역을 "만들어(dialogueI18n에 병합) 보여 주는(로케일 전환)"
 * 계층까지만 책임진다. 사람이 번역을 **읽고 판정하는** 단계 — letr.ai식 반자동 파이프라인의
 * "AI 1차 → 사람 2차 수정" — 은 그 위에 얹히는 별도 관심사다. 초안 검토 화면(패널 B)은 적용
 * **전** 초안만 상대하고, 적용이 끝난 번역은 로케일 칩으로 캔버스를 돌려 눈으로 보는 수밖에
 * 없었다. 검수 상태(승인/수정 필요)를 항목별로 남길 저장 자리도 없었다.
 *
 * 이 모듈이 추가하는 것:
 *  · 대조 행 목록 — 페이지 순서 그대로, 원문(dialogueI18n의 SOURCE_LOCALE 스냅샷)과
 *    대상 로케일 번역을 한 행에 묶는다.
 *  · 적용된 번역의 인라인 수정 — dialogueI18n만 고치고, 지금 화면에 보이는 로케일이면
 *    el.text도 함께 맞춘다(호스트가 visibleLocale로 알려 준다).
 *  · 항목별 검수 상태 — PageState.dialogueReview(elId → 로케일 → 상태)에 저장한다.
 *
 * 정직성 규칙:
 *  · 원문을 지어내지 않는다. 원문 스냅샷이 없으면 sourceText는 null이고, 패널은
 *    "원문 미기록"으로 표시한다. el.text는 "지금 표시 중인 언어"라 원문이라고 단정할 수 없다.
 *  · 번역이 없는 항목은 translation이 null이다 — 빈 문자열로 채워 "번역됨"처럼 보이지 않는다.
 *  · 번역문을 고치면 그 항목의 검수 상태는 자동으로 사라진다(미검수로 복귀). 고쳐진 문장을
 *    예전 승인으로 통과시키는 것은 조용한 거짓말이다(번역 메모리의 "원문 변경 시 승인 불가"와
 *    같은 판단).
 *  · 검수 상태는 번역이 실제로 있는 항목에만 붙는다. 미번역 항목의 "승인"은 존재하지 않는다.
 *
 * 규칙(studio-dialogue-translate.ts와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 사용자 노출 문자열은 한글.
 *  - 입력 배열/객체는 절대 변형하지 않는다. 바뀐 페이지·요소만 새 객체로 만들고,
 *    바뀐 것이 하나도 없으면 입력 배열을 그대로(참조 동일) 돌려준다.
 */

import { collectDialogueItems, isDialogueElement } from "./studio-dialogue-batch";
import {
  SOURCE_LOCALE,
  type DialogueLocaleMap,
  type DialogueTranslatePageLike,
} from "./studio-dialogue-translate";

// ── 데이터 모델 ───────────────────────────────────────────────────────────

/** 검수 상태. 미검수는 "상태 없음"으로 표현한다(별도 값을 만들지 않는다). */
export type DialogueReviewStatus = "approved" | "needs-edit";

/** elementId → localeCode → 검수 상태. PageState.dialogueReview 에 그대로 저장. */
export type DialogueReviewMap = Record<string, Record<string, DialogueReviewStatus>>;

/** studio-dialogue-translate 의 페이지 형태 + 검수 저장소. PageState 가 구조적으로 만족한다. */
export interface DialogueReviewPageLike extends DialogueTranslatePageLike {
  dialogueReview?: DialogueReviewMap;
}

/** 대조 검수 한 행. sourceText/translation 의 null 은 "없음" 그 자체가 정보다(위 정직성 규칙). */
export interface DialogueReviewRow {
  readonly id: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번(표시할 땐 +1). */
  readonly pageIndex: number;
  /** 원문 스냅샷. 기록된 적 없으면 null. */
  readonly sourceText: string | null;
  /** 대상 로케일 번역. 없으면 null = 미번역. */
  readonly translation: string | null;
  /** 검수 상태. 없으면 null = 미검수. */
  readonly status: DialogueReviewStatus | null;
  readonly hidden: boolean;
  readonly locked: boolean;
}

// ── 행 목록 ───────────────────────────────────────────────────────────────

/**
 * 대상 로케일의 대조 행을 페이지 순서→요소 순서로 나열한다(collectDialogueItems 의 순서를
 * 그대로 쓴다 — 목록 순서를 새로 정의하지 않는다). 원문(SOURCE_LOCALE)은 검수 대상이 아니므로
 * 빈 목록을 돌려준다(원문 자체의 수정은 캔버스·일괄 편집의 몫이다).
 */
export function collectDialogueReviewRows(
  pages: readonly DialogueReviewPageLike[],
  locale: string
): DialogueReviewRow[] {
  if (locale === SOURCE_LOCALE) return [];
  const pageById = new Map(pages.map((page) => [page.id, page]));
  return collectDialogueItems(pages).map((item) => {
    const page = pageById.get(item.pageId);
    const entry = page?.dialogueI18n?.[item.id];
    return {
      id: item.id,
      pageId: item.pageId,
      pageIndex: item.pageIndex,
      sourceText: entry?.[SOURCE_LOCALE] ?? null,
      translation: entry?.[locale] ?? null,
      status: page?.dialogueReview?.[item.id]?.[locale] ?? null,
      hidden: item.hidden,
      locked: item.locked,
    };
  });
}

/** 행을 페이지 단위로 묶는다(연속된 같은 pageId를 한 그룹으로 — 패널 표시 전용 조립). */
export function groupDialogueReviewRows(
  rows: readonly DialogueReviewRow[]
): { pageId: string; pageIndex: number; rows: DialogueReviewRow[] }[] {
  const groups: { pageId: string; pageIndex: number; rows: DialogueReviewRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.pageId === row.pageId) last.rows.push(row);
    else groups.push({ pageId: row.pageId, pageIndex: row.pageIndex, rows: [row] });
  }
  return groups;
}

/** 검수 진척 요약 — 패널 머리말의 숫자(전체/번역됨/승인/수정 필요/미검수/미번역). */
export function summarizeDialogueReview(
  pages: readonly DialogueReviewPageLike[],
  locale: string
): {
  total: number;
  translated: number;
  untranslated: number;
  approved: number;
  needsEdit: number;
  unreviewed: number;
} {
  const rows = collectDialogueReviewRows(pages, locale);
  let translated = 0;
  let approved = 0;
  let needsEdit = 0;
  for (const row of rows) {
    if (row.translation === null) continue;
    translated += 1;
    if (row.status === "approved") approved += 1;
    else if (row.status === "needs-edit") needsEdit += 1;
  }
  return {
    total: rows.length,
    translated,
    untranslated: rows.length - translated,
    approved,
    needsEdit,
    unreviewed: translated - approved - needsEdit,
  };
}

// ── 번역문 수정 ───────────────────────────────────────────────────────────

export interface DialogueTranslationTextEdit {
  readonly pageId: string;
  readonly elId: string;
  /** SOURCE_LOCALE은 허용하지 않는다(원문 수정은 이 모듈의 몫이 아니다). */
  readonly locale: string;
  /** 새 번역문. 빈 문자열(공백만 포함)이면 그 로케일 번역을 지운다(미번역으로 복귀). */
  readonly text: string;
  /** 지금 캔버스에 표시 중인 로케일 — el.text 동기화 판단에만 쓴다. */
  readonly visibleLocale: string;
}

/**
 * 적용된 번역문 하나를 고친다. dialogueI18n을 갱신하고, 그 로케일이 지금 표시 중이면
 * el.text도 함께 맞춘다. 지우는 경우 표시 텍스트는 원문 스냅샷으로 되돌리고, 스냅샷이
 * 없으면 el.text를 건드리지 않는다(다른 언어 텍스트를 원문인 양 남기지 않기 위해, 지운
 * 로케일이 표시 중이 아니면 애초에 el.text는 그 로케일이 아니다).
 *
 * 항목에 dialogueI18n 엔트리가 없을 때 새 번역을 만들면, 지금 원문이 표시 중일 때만
 * (visibleLocale===SOURCE_LOCALE) 현재 el.text를 원문으로 시딩한다 — 표시 중이 아닌데
 * el.text를 원문으로 기록하면 거짓 스냅샷이 된다(applyDialogueTranslations의 시딩 규칙과 동일).
 *
 * 텍스트가 실제로 바뀌면 그 항목·로케일의 검수 상태는 제거된다(모듈 머리말의 정직성 규칙).
 * 바뀐 것이 없으면 입력 배열을 그대로 돌려준다.
 */
export function updateDialogueTranslationText<P extends DialogueReviewPageLike>(
  pages: readonly P[],
  edit: DialogueTranslationTextEdit
): readonly P[] {
  if (edit.locale === SOURCE_LOCALE) return pages;
  const clearing = edit.text.trim() === "";

  let changed = false;
  const next = pages.map((page): P => {
    if (page.id !== edit.pageId) return page;
    const el = page.elements.find((candidate) => candidate.id === edit.elId);
    if (!el || !isDialogueElement(el)) return page;

    const existingEntry = page.dialogueI18n?.[edit.elId];
    const previousText = existingEntry?.[edit.locale];
    if (clearing ? previousText === undefined : previousText === edit.text) return page;

    // ── dialogueI18n 갱신 ──
    const dialogueI18n: DialogueLocaleMap = { ...(page.dialogueI18n ?? {}) };
    if (clearing) {
      const entry = { ...existingEntry };
      delete entry[edit.locale];
      if (Object.keys(entry).length === 0) delete dialogueI18n[edit.elId];
      else dialogueI18n[edit.elId] = entry;
    } else {
      const seedSource: Record<string, string> =
        existingEntry?.[SOURCE_LOCALE] === undefined && edit.visibleLocale === SOURCE_LOCALE
          ? { [SOURCE_LOCALE]: el.text }
          : {};
      dialogueI18n[edit.elId] = { ...existingEntry, ...seedSource, [edit.locale]: edit.text };
    }

    // ── 검수 상태 무효화(그 항목·로케일만) ──
    let dialogueReview = page.dialogueReview;
    if (dialogueReview?.[edit.elId]?.[edit.locale] !== undefined) {
      const reviewForEl = { ...dialogueReview[edit.elId] };
      delete reviewForEl[edit.locale];
      dialogueReview = { ...dialogueReview };
      if (Object.keys(reviewForEl).length === 0) delete dialogueReview[edit.elId];
      else dialogueReview[edit.elId] = reviewForEl;
    }

    // ── el.text 동기화(표시 중인 로케일일 때만) ──
    let elements = page.elements;
    if (edit.visibleLocale === edit.locale) {
      const sourceText = dialogueI18n[edit.elId]?.[SOURCE_LOCALE] ?? existingEntry?.[SOURCE_LOCALE];
      const visibleText = clearing ? sourceText : edit.text;
      if (visibleText !== undefined && visibleText !== el.text) {
        elements = page.elements.map((candidate) =>
          candidate.id === edit.elId ? { ...candidate, text: visibleText } : candidate
        );
      }
    }

    changed = true;
    const nextPage = {
      ...page,
      elements,
      dialogueI18n,
      ...(dialogueReview === page.dialogueReview ? {} : { dialogueReview }),
    } as P;
    // 맵이 통째로 비면 키 자체를 제거해 레거시 직렬화 형태(번역 없음 = 필드 없음)를 유지한다.
    if (Object.keys(dialogueI18n).length === 0) {
      delete (nextPage as { dialogueI18n?: unknown }).dialogueI18n;
    }
    if (dialogueReview !== undefined && Object.keys(dialogueReview).length === 0) {
      delete (nextPage as { dialogueReview?: unknown }).dialogueReview;
    }
    return nextPage;
  });
  return changed ? next : pages;
}

// ── 검수 상태 ─────────────────────────────────────────────────────────────

export interface DialogueReviewStatusEdit {
  readonly pageId: string;
  readonly elId: string;
  readonly locale: string;
  /** null이면 상태를 지운다(미검수로 복귀). */
  readonly status: DialogueReviewStatus | null;
}

/**
 * 항목·로케일의 검수 상태를 남긴다. 번역이 없는 항목에는 상태를 붙이지 않는다(미번역의
 * "승인"은 없다) — 그런 편집은 조용히 무시해 입력 배열을 그대로 돌려준다. 페이지에 남은
 * 상태가 하나도 없으면 dialogueReview 키 자체를 제거한다.
 */
export function setDialogueReviewStatus<P extends DialogueReviewPageLike>(
  pages: readonly P[],
  edit: DialogueReviewStatusEdit
): readonly P[] {
  if (edit.locale === SOURCE_LOCALE) return pages;

  let changed = false;
  const next = pages.map((page): P => {
    if (page.id !== edit.pageId) return page;
    if (page.dialogueI18n?.[edit.elId]?.[edit.locale] === undefined) return page;
    const previous = page.dialogueReview?.[edit.elId]?.[edit.locale] ?? null;
    if (previous === edit.status) return page;

    const dialogueReview: DialogueReviewMap = { ...(page.dialogueReview ?? {}) };
    if (edit.status === null) {
      const reviewForEl = { ...dialogueReview[edit.elId] };
      delete reviewForEl[edit.locale];
      if (Object.keys(reviewForEl).length === 0) delete dialogueReview[edit.elId];
      else dialogueReview[edit.elId] = reviewForEl;
    } else {
      dialogueReview[edit.elId] = { ...dialogueReview[edit.elId], [edit.locale]: edit.status };
    }

    changed = true;
    const nextPage = { ...page, dialogueReview } as P;
    if (Object.keys(dialogueReview).length === 0) {
      delete (nextPage as { dialogueReview?: unknown }).dialogueReview;
    }
    return nextPage;
  });
  return changed ? next : pages;
}
