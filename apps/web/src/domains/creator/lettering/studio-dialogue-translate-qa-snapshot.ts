/**
 * 대사 번역 패널의 현지화 QA 스냅샷 — 입력 지문·조립 호출·차원별 묶음.
 *
 * `StudioDialogueTranslatePanel` 안에 있던 계산을 그대로 옮겼다(동작 변경 없음). 패널 파일이 소스 파일 크기
 * 래칫(`scripts/source-file-size-baseline.json`)에 걸린 기존 초과 파일이라 줄을 더할 수 없고, 이 계산은
 * React 와 무관한 순수 함수라 따로 두는 쪽이 테스트하기도 쉽다. 인물 카드 규칙(§ 카드 입력)은 이번에 더해졌다.
 *
 * 보고서는 **스냅샷**이다: 검사 입력(대사·상자·서체·초안·로케일·테마·용어집·인물 카드)의 지문을 함께 저장해
 * 두고, 지문이 어긋나면 패널이 "다시 검사" 배너를 띄운다. 캔버스에서 말풍선 하나를 옮길 때마다 회차 전체를
 * 다시 재지 않으려는 선택이다 — 넘침 판정은 큐마다 글자 폭을 재는 이진 탐색이라 공짜가 아니다.
 */

import { parseStudioTranslationMemoryGlossaryText } from "../studio-translation-glossary";

import { collectDialogueItems, isDialogueElement } from "./studio-dialogue-batch";
import { SOURCE_LOCALE } from "./studio-dialogue-source-locale";
import {
  runStudioLocalizationQa,
  studioLocalizationQaGroups,
  type StudioLocalizationQaElementTypography,
  type StudioLocalizationQaReport as QaReport,
} from "./studio-localization-qa";

import type { StudioLocalizationQaDimensionSection } from "../StudioLocalizationQaReport";
import type { BubbleTextMeasurer, BubbleWebtoonTheme } from "./studio-bubble-text-fit";
import type { DialogueReviewPageLike } from "./studio-dialogue-review";
import type {
  StudioTranslationEffectiveCard,
  StudioTranslationSpeakerAssignment,
} from "./studio-translation-character-card";

export type StudioDialogueTranslateQaSnapshot = {
  readonly report: QaReport;
  /** 검사 당시 입력의 지문 — 지금 입력과 다르면 보고서가 낡은 것이다. */
  readonly fingerprint: string;
};

export type StudioDialogueTranslateQaInput = {
  readonly pages: readonly DialogueReviewPageLike[];
  readonly draft: Map<string, string> | null;
  /** 캔버스에 지금 표시 중인 로케일 — 초안 검사 중이고 이 값이 원문이면 요소의 text 가 곧 원문이다. */
  readonly activeLocale: string;
  /** 검사 대상 문자열의 로케일(초안이면 대상 언어, 아니면 표시 중인 언어). */
  readonly locale: string;
  readonly theme: BubbleWebtoonTheme | undefined;
  /** 용어집 자유 텍스트 — 파싱된 규칙이 QA의 용어집 검사(위반 표시)에 들어간다. */
  readonly glossary: string;
  /** 인물 카드(시트 + 번역용 오버라이드의 효과 카드). 없으면 인물 규칙은 꺼진다. */
  readonly cards?: readonly StudioTranslationEffectiveCard[];
  /** 대사 요소 id → 화자·청자 지정. */
  readonly speakers?: Readonly<Record<string, StudioTranslationSpeakerAssignment>>;
  /**
   * 카드·화자 지정의 지문. 호출부가 카드 집합이 바뀔 때만 다시 만든다 — 렌더마다 카드 전체를 직렬화하지
   * 않으려는 것이다. 이 값이 바뀌면 보고서는 낡은 것으로 본다.
   */
  readonly cardsSignature?: string;
};

/**
 * 검사 입력의 지문. 넘침 판정이 읽는 필드(문자열·상자·서체·세로쓰기·숨김/잠금)를 전부 싣는다 —
 * 하나라도 빠지면 그 필드만 바뀐 회차가 "여전히 통과"로 보인다.
 */
export function studioDialogueTranslateQaFingerprint(
  input: StudioDialogueTranslateQaInput,
): string {
  const parts: string[] = [
    input.locale,
    input.theme ?? "",
    input.glossary,
    input.cardsSignature ?? "",
  ];
  for (const page of input.pages) {
    for (const el of page.elements) {
      if (!isDialogueElement(el)) continue;
      const typo = el as typeof el & StudioLocalizationQaElementTypography;
      parts.push(
        [
          el.id,
          input.draft?.get(el.id) ?? el.text,
          el.width ?? "",
          el.height ?? "",
          typo.fontSize ?? "",
          typo.font ?? "",
          typo.fontStyle ?? "",
          typo.lineHeight ?? "",
          typo.vertical ? 1 : 0,
          el.hidden ? 1 : 0,
          el.locked ? 1 : 0,
        ].join("\u001f"),
      );
    }
  }
  return parts.join("\u001e");
}

/** 순수 조립층을 부르고 지문과 함께 묶는다 — 자동 실행(효과)과 "다시 검사"(클릭)가 같은 길을 탄다. */
export function computeStudioDialogueTranslateQaSnapshot(
  input: StudioDialogueTranslateQaInput,
  measurer: BubbleTextMeasurer,
): StudioDialogueTranslateQaSnapshot {
  // 원문 확보 경로가 두 가지다. 초안 검사 중이고 캔버스가 원문을 보여 주고 있으면 요소의
  // 현재 text 가 원문이다. 적용된 번역을 검사할 때는 dialogueI18n의 원문 스냅샷이 원문이다 —
  // 스냅샷이 없는 큐는 sourceTextFor가 undefined를 돌려줘, 전제(원문)가 없는 검사가 조용히
  // 건너뛰어진다(QA 조립층 계약). 검사 대상이 원문 자체면 원문을 넘기지 않는다.
  const sourceById = (() => {
    if (input.draft) {
      return input.activeLocale === SOURCE_LOCALE
        ? new Map(collectDialogueItems(input.pages).map((item) => [item.id, item.text]))
        : null;
    }
    if (input.locale === SOURCE_LOCALE) return null;
    const map = new Map<string, string>();
    for (const page of input.pages) {
      if (!page.dialogueI18n) continue;
      for (const [elId, entry] of Object.entries(page.dialogueI18n)) {
        const source = entry[SOURCE_LOCALE];
        if (source !== undefined) map.set(elId, source);
      }
    }
    return map.size > 0 ? map : null;
  })();
  // 용어집 규칙 주입 — 지금까지 이 패널은 규칙을 넘기지 않아 QA의 용어집 검사가 실제
  // 사용 경로에서는 0개 규칙으로 돌았다. 규칙이 있을 때만 넘긴다(없으면 검사 자체가 없다).
  const glossaryRules = parseStudioTranslationMemoryGlossaryText(input.glossary);
  const report = runStudioLocalizationQa(input.pages, measurer, {
    targetLocale: input.locale,
    ...(input.draft ? { translations: input.draft } : {}),
    ...(sourceById ? { sourceTextFor: (cueId: string) => sourceById.get(cueId) } : {}),
    ...(glossaryRules.length > 0 ? { glossaryRules } : {}),
    ...(input.theme === undefined ? {} : { theme: input.theme }),
    ...(input.cards === undefined
      ? {}
      : { characterCards: { cards: input.cards, speakers: input.speakers ?? {} } }),
  });
  return { report, fingerprint: studioDialogueTranslateQaFingerprint(input) };
}

export function studioDialogueTranslateQaSections(
  report: QaReport,
): readonly StudioLocalizationQaDimensionSection[] {
  return studioLocalizationQaGroups(report).map((group) => ({
    dimension: group.rollup.dimension,
    label: group.rollup.label,
    penalty: group.rollup.penalty,
    errorCount: group.rollup.errorCount,
    errors: group.errors,
  }));
}
