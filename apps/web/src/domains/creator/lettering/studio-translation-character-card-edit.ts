/**
 * Studio Translation Character Card — 편집 연산(순수).
 *
 * 카드 집합(`studio-translation-character-card`)을 고치는 모든 길이 여기 있다. 화면은 이 함수들의 결과를
 * 저장소에 맡기기만 한다 — 상한·정리·고아 지정 처리가 화면마다 달라지지 않게 하려는 분리다.
 *
 * 규칙
 *  · 입력은 변형하지 않는다. 바뀐 것이 없으면 **입력 참조를 그대로** 돌려준다(호출부가 `next !== prev` 로
 *    불필요한 저장을 건너뛴다).
 *  · 길이 상한은 파서와 같은 함수를 거친다 — 화면이 상한을 몰라도 저장소는 안전하다.
 *  · 화자 지정 맵은 `Object.fromEntries` 로만 만든다(대입은 `__proto__` 키에서 프로토타입을 바꾼다).
 */

import {
  STUDIO_TRANSLATION_CARD_LIMITS,
  boundedStudioTranslationCardText,
  isValidStudioTranslationCardId,
  parseStudioTranslationCardRecord,
  studioTranslationSpeakerOf,
} from "./studio-translation-character-card";

import type {
  StudioTranslationCardOrigin,
  StudioTranslationCardRecord,
  StudioTranslationCharacterCardSet,
  StudioTranslationSpeakerAssignment,
} from "./studio-translation-character-card";

export type StudioTranslationCardPatch = Partial<
  Pick<
    StudioTranslationCardRecord,
    "name" | "speechNote" | "register" | "addressTerms" | "fixedTerms" | "bannedTerms"
  >
>;

function emptyRecord(
  characterId: string,
  origin: StudioTranslationCardOrigin,
  name = "",
): StudioTranslationCardRecord {
  return Object.freeze({
    characterId,
    origin,
    name,
    speechNote: null,
    register: null,
    addressTerms: Object.freeze([]),
    fixedTerms: Object.freeze([]),
    bannedTerms: Object.freeze([]),
  });
}

/** 시트 카드가 아무 값도 안 남겼는가 — 그렇다면 저장소에서 지워 유령 카드를 만들지 않는다. */
function isBlankSheetRecord(record: StudioTranslationCardRecord): boolean {
  return (
    record.origin === "story-bible"
    && (record.speechNote === null || record.speechNote.trim() === "")
    && record.register === null
    && record.addressTerms.length === 0
    && record.fixedTerms.length === 0
    && record.bannedTerms.length === 0
  );
}

function withCards(
  set: StudioTranslationCharacterCardSet,
  cards: readonly StudioTranslationCardRecord[],
): StudioTranslationCharacterCardSet {
  return Object.freeze({ ...set, cards: Object.freeze(cards) });
}

function withSpeakers(
  set: StudioTranslationCharacterCardSet,
  entries: readonly (readonly [string, StudioTranslationSpeakerAssignment])[],
): StudioTranslationCharacterCardSet {
  return Object.freeze({ ...set, speakers: Object.freeze(Object.fromEntries(entries)) });
}

/**
 * 카드 한 장의 번역용 값을 고친다. 아직 저장된 적 없는 시트 인물이면 빈 오버라이드부터 만든다.
 * 시트 카드가 모든 값을 비우면 저장소에서 지운다.
 */
export function patchStudioTranslationCard(
  set: StudioTranslationCharacterCardSet,
  characterId: string,
  patch: StudioTranslationCardPatch,
  origin: StudioTranslationCardOrigin = "story-bible",
): StudioTranslationCharacterCardSet {
  if (!isValidStudioTranslationCardId(characterId)) return set;
  const existing = set.cards.find((card) => card.characterId === characterId) ?? null;
  const merged = parseStudioTranslationCardRecord({
    ...(existing ?? emptyRecord(characterId, origin)),
    ...patch,
  });
  if (merged === null) return set;
  const keep = isBlankSheetRecord(merged) ? null : merged;
  if (existing === null) {
    if (keep === null || set.cards.length >= STUDIO_TRANSLATION_CARD_LIMITS.cards) return set;
    return withCards(set, [...set.cards, keep]);
  }
  return withCards(
    set,
    keep === null
      ? set.cards.filter((card) => card.characterId !== characterId)
      : set.cards.map((card) => (card.characterId === characterId ? keep : card)),
  );
}

/** 시트에 없는 인물을 번역 카드로만 직접 추가한다. id 는 호출부가 정한다(순수성 유지). */
export function addManualStudioTranslationCard(
  set: StudioTranslationCharacterCardSet,
  input: { readonly id: string; readonly name: string },
): StudioTranslationCharacterCardSet {
  const name = boundedStudioTranslationCardText(
    input.name,
    STUDIO_TRANSLATION_CARD_LIMITS.nameChars,
  ).trim();
  if (
    !isValidStudioTranslationCardId(input.id)
    || name === ""
    || set.cards.some((card) => card.characterId === input.id)
    || set.cards.length >= STUDIO_TRANSLATION_CARD_LIMITS.cards
  ) {
    return set;
  }
  return withCards(set, [...set.cards, emptyRecord(input.id, "manual", name)]);
}

/**
 * 카드를 저장소에서 지운다. 이 카드를 화자로 지정한 대사 지정은 풀고, 청자로 지정한 대사는 청자만 비운다 —
 * 지운 인물을 가리키는 고아 지정을 남기지 않는다.
 */
export function removeStudioTranslationCard(
  set: StudioTranslationCharacterCardSet,
  characterId: string,
): StudioTranslationCharacterCardSet {
  const cards = set.cards.filter((card) => card.characterId !== characterId);
  let speakersChanged = false;
  const entries: [string, StudioTranslationSpeakerAssignment][] = [];
  for (const [dialogueId, assignment] of Object.entries(set.speakers)) {
    if (assignment.speakerId === characterId) {
      speakersChanged = true;
      continue;
    }
    if (assignment.listenerId === characterId) {
      speakersChanged = true;
      entries.push([dialogueId, Object.freeze({ speakerId: assignment.speakerId, listenerId: null })]);
      continue;
    }
    entries.push([dialogueId, assignment]);
  }
  if (cards.length === set.cards.length && !speakersChanged) return set;
  return Object.freeze({
    ...set,
    cards: Object.freeze(cards),
    speakers: Object.freeze(Object.fromEntries(entries)),
  });
}

/**
 * 대사 한 줄의 화자·청자를 지정한다. 화자가 `null` 이면 지정을 푼다. 청자가 화자와 같으면 청자는 비운다 —
 * 자기 자신을 부르는 호칭 규칙은 없다.
 */
export function setStudioTranslationSpeaker(
  set: StudioTranslationCharacterCardSet,
  dialogueId: string,
  assignment: { readonly speakerId: string | null; readonly listenerId: string | null },
): StudioTranslationCharacterCardSet {
  if (!isValidStudioTranslationCardId(dialogueId)) return set;
  const current = studioTranslationSpeakerOf(set.speakers, dialogueId);
  const { speakerId } = assignment;

  if (speakerId === null || !isValidStudioTranslationCardId(speakerId)) {
    if (current === null) return set;
    return withSpeakers(
      set,
      Object.entries(set.speakers).filter(([id]) => id !== dialogueId),
    );
  }
  const listenerId =
    assignment.listenerId !== null
    && isValidStudioTranslationCardId(assignment.listenerId)
    && assignment.listenerId !== speakerId
      ? assignment.listenerId
      : null;
  if (current?.speakerId === speakerId && current.listenerId === listenerId) return set;
  const updated: StudioTranslationSpeakerAssignment = Object.freeze({ speakerId, listenerId });
  const entries = Object.entries(set.speakers);
  if (current === null) {
    if (entries.length >= STUDIO_TRANSLATION_CARD_LIMITS.speakers) return set;
    return withSpeakers(set, [...entries, [dialogueId, updated]]);
  }
  // 기존 위치를 유지한다(순서가 곧 저장 직렬화 순서라, 편집 때마다 목록이 뒤섞이지 않게).
  return withSpeakers(
    set,
    entries.map(([id, value]): [string, StudioTranslationSpeakerAssignment] => [
      id,
      id === dialogueId ? updated : value,
    ]),
  );
}

/** 지금 문서에 없는 대사의 화자 지정을 걷어낸다(대사를 지운 뒤 남는 고아 지정 정리). */
export function pruneStudioTranslationSpeakers(
  set: StudioTranslationCharacterCardSet,
  liveDialogueIds: ReadonlySet<string>,
): StudioTranslationCharacterCardSet {
  const entries = Object.entries(set.speakers);
  const kept = entries.filter(([dialogueId]) => liveDialogueIds.has(dialogueId));
  return kept.length === entries.length ? set : withSpeakers(set, kept);
}

/** 화자 지정 현황 — 화면이 "지정 N/M" 을 말하고 QA 가 분모를 설명할 때 쓴다. */
export function summarizeStudioTranslationSpeakers(
  set: StudioTranslationCharacterCardSet,
  dialogueIds: readonly string[],
): { readonly total: number; readonly assigned: number; readonly withListener: number } {
  let assigned = 0;
  let withListener = 0;
  for (const dialogueId of dialogueIds) {
    const assignment = studioTranslationSpeakerOf(set.speakers, dialogueId);
    if (assignment === null) continue;
    assigned += 1;
    if (assignment.listenerId !== null) withListener += 1;
  }
  return { total: dialogueIds.length, assigned, withListener };
}
