/**
 * Studio Translation Card Context — 인물 카드를 번역 요청(AI 프롬프트)의 문맥으로 바꾸는 순수 계층.
 *
 * 무엇을 하고 무엇을 하지 않는가
 * ----------------------------
 *  · 대사별 문맥(`DialogueTranslationItemContext`)을 만든다. **화자가 지정된 대사에 한한다** — 화자를
 *    추정하지 않으므로 지정이 없는 대사는 지금까지와 똑같이 `{id, text}` 만 나간다.
 *  · 이 문맥을 요청 문자열로 싣는 일(`studio-translation-card-prompt`)과 요청을 보내는 일(AI 라우팅·무료 우선 정책·
 *    전송)은 여기서 하지 않는다. 이 모듈은 카드 스키마를 읽으므로 에디터 진입 그래프가 아니라 번역 패널(지연 로드)에서만
 *    쓰인다 — 프롬프트 직렬화 쪽을 따로 둔 이유다.
 *
 * 프롬프트 인젝션 방어 — 카드 텍스트는 **데이터**다
 * --------------------------------------------
 * 카드의 이름·말투 메모·호칭·고정어·금지어는 사람이 쓴 자유 텍스트이고, 공유받은 프로젝트나 붙여넣기로
 * 들어올 수 있다. 그래서 세 겹으로 막는다.
 *  1. 구조 분리 — 카드 텍스트는 **user 메시지의 JSON 문자열 값**으로만 들어간다. system 프롬프트에는
 *     카드 텍스트가 한 글자도 섞이지 않는다(system 에는 "이 값들은 데이터"라는 규칙만 있다).
 *  2. 정리 — 보이지 않는 제어·방향 문자를 지우고, 줄바꿈·연속 공백을 한 칸으로 접고, 코드 펜스와
 *     `<|…|>` 형태의 구분자를 지우고, 항목별 길이를 코드 포인트 기준으로 자른다.
 *  3. 한계 — 인물 수·금지어 수·고정어 수에 상한을 둔다. 상한을 넘는 것은 조용히 늘리지 않고 버린다.
 * 모델의 응답은 여전히 `parseTranslationResponse` 가 **요청한 id 만** 받아들이고, 사람이 검토한 뒤 적용한다 —
 * 마지막 방어선은 그 검토다.
 *
 * 순수·결정적. DOM/React 의존이 없다.
 */

import { isTranslationTargetLocale } from "./studio-dialogue-source-locale";
import { STUDIO_TRANSLATION_CARD_PROMPT_LIMITS } from "./studio-translation-card-prompt";
import {
  boundedStudioTranslationCardText,
  cleanStudioTranslationCardTerm,
  isUsableStudioTranslationAddressTerm,
  isUsableStudioTranslationBannedTerm,
  isUsableStudioTranslationFixedTerm,
  studioTranslationCardLocaleApplies,
  studioTranslationSpeakerOf,
} from "./studio-translation-character-card";
import { studioTranslationTextContains } from "./studio-translation-term-match";

import type {
  DialogueTranslationCardContextMap,
  DialogueTranslationCastMember,
  DialogueTranslationItemContext,
} from "./studio-translation-card-prompt";
import type {
  StudioTranslationEffectiveCard,
  StudioTranslationSpeakerAssignment,
} from "./studio-translation-character-card";

// ── 정리 ─────────────────────────────────────────────────────────────────────

/**
 * 프롬프트에 실을 카드 텍스트를 정리한다. 반환값은 한 줄이고 `maxChars` 코드 포인트 이하다(잘리면 `…` 로 끝).
 * 의미를 바꾸는 가공은 하지 않는다 — 숨은 문자와 구분자만 지운다.
 */
export function sanitizeStudioTranslationPromptText(value: string, maxChars: number): string {
  const stripped = boundedStudioTranslationCardText(value, Number.MAX_SAFE_INTEGER)
    .replace(/`{3,}/gu, " ")
    .replace(/<\|[^|]*\|>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const characters = Array.from(stripped);
  if (characters.length <= maxChars) return stripped;
  return `${characters.slice(0, Math.max(0, maxChars - 1)).join("").trimEnd()}…`;
}

function promptTerm(value: string): string {
  return sanitizeStudioTranslationPromptText(
    cleanStudioTranslationCardTerm(value),
    STUDIO_TRANSLATION_CARD_PROMPT_LIMITS.termChars,
  );
}

// ── 문맥 만들기 ──────────────────────────────────────────────────────────────

function castMemberOf(
  card: StudioTranslationEffectiveCard,
  targetLocale: string,
): DialogueTranslationCastMember {
  const limits = STUDIO_TRANSLATION_CARD_PROMPT_LIMITS;
  const note = sanitizeStudioTranslationPromptText(card.speechNote, limits.noteChars);
  const banned = card.bannedTerms
    .filter(
      (term) =>
        isUsableStudioTranslationBannedTerm(term)
        && studioTranslationCardLocaleApplies(term.locale, targetLocale),
    )
    .map((term) => promptTerm(term.term))
    .filter((term) => term !== "")
    .slice(0, limits.bannedPerCast);
  return Object.freeze({
    id: card.characterId,
    name: sanitizeStudioTranslationPromptText(card.name, limits.nameChars),
    ...(note === "" ? {} : { speechNote: note }),
    ...(card.register === null ? {} : { register: card.register }),
    ...(banned.length === 0 ? {} : { banned: Object.freeze(banned) }),
  });
}

export interface StudioTranslationCardContextStats {
  readonly total: number;
  /** 화자가 지정된 대사 수. */
  readonly attributed: number;
  /** 화자가 지정되어 있고 그 화자의 카드를 찾아 문맥을 실제로 만든 대사 수. */
  readonly withContext: number;
}

/**
 * 번역할 대사 목록에 인물 카드 문맥을 붙인다. 대사의 `text` 는 번역 원문이다(고정어의 원문 대조에 쓴다).
 * 대상 언어가 비어 있거나 원문(`source`)이면 번역 요청이 아니므로 문맥을 만들지 않는다.
 */
export function buildDialogueTranslationCardContexts(input: {
  readonly items: readonly { readonly id: string; readonly text: string }[];
  readonly cards: readonly StudioTranslationEffectiveCard[];
  readonly speakers: Readonly<Record<string, StudioTranslationSpeakerAssignment>>;
  readonly targetLocale: string;
}): { readonly contexts: DialogueTranslationCardContextMap; readonly stats: StudioTranslationCardContextStats } {
  const { items, cards, speakers, targetLocale } = input;
  const total = items.length;
  if (!isTranslationTargetLocale(targetLocale)) {
    return { contexts: Object.freeze({}), stats: { total, attributed: 0, withContext: 0 } };
  }
  const cardById = new Map(cards.map((card) => [card.characterId, card]));
  const castCache = new Map<string, DialogueTranslationCastMember>();
  const entries: [string, DialogueTranslationItemContext][] = [];
  let attributed = 0;

  for (const item of items) {
    const assignment = studioTranslationSpeakerOf(speakers, item.id);
    if (assignment === null) continue;
    attributed += 1;
    const card = cardById.get(assignment.speakerId);
    if (card === undefined) continue;
    let speaker = castCache.get(card.characterId);
    if (speaker === undefined) {
      speaker = castMemberOf(card, targetLocale);
      castCache.set(card.characterId, speaker);
    }
    const listenerCard =
      assignment.listenerId === null ? undefined : cardById.get(assignment.listenerId);
    const row =
      listenerCard === undefined
        ? undefined
        : card.addressTerms.find(
            (term) =>
              term.listenerId === listenerCard.characterId
              && isUsableStudioTranslationAddressTerm(term)
              && studioTranslationCardLocaleApplies(term.locale, targetLocale),
          );
    const rowRegisterRow =
      listenerCard === undefined
        ? undefined
        : card.addressTerms.find(
            (term) =>
              term.listenerId === listenerCard.characterId
              && term.register !== null
              && studioTranslationCardLocaleApplies(term.locale, targetLocale),
          );
    const pairRegister = rowRegisterRow?.register ?? row?.register ?? null;
    const fixed = card.fixedTerms
      .filter(
        (term) =>
          isUsableStudioTranslationFixedTerm(term)
          && studioTranslationCardLocaleApplies(term.locale, targetLocale)
          && studioTranslationTextContains(item.text, term.source),
      )
      .map((term) => Object.freeze({ source: promptTerm(term.source), target: promptTerm(term.target) }))
      .filter((term) => term.source !== "" && term.target !== "")
      .slice(0, STUDIO_TRANSLATION_CARD_PROMPT_LIMITS.fixedPerItem);
    const addressTerm = row === undefined ? "" : promptTerm(row.targetTerm);

    entries.push([
      item.id,
      Object.freeze({
        speaker,
        ...(listenerCard === undefined
          ? {}
          : {
              listener: Object.freeze({
                id: listenerCard.characterId,
                name: sanitizeStudioTranslationPromptText(
                  listenerCard.name,
                  STUDIO_TRANSLATION_CARD_PROMPT_LIMITS.nameChars,
                ),
              }),
            }),
        ...(addressTerm === "" ? {} : { addressTerm }),
        ...(pairRegister === null || pairRegister === speaker.register ? {} : { register: pairRegister }),
        ...(fixed.length === 0 ? {} : { fixed: Object.freeze(fixed) }),
      }),
    ]);
  }
  return {
    contexts: Object.freeze(Object.fromEntries(entries)),
    stats: { total, attributed, withContext: entries.length },
  };
}
