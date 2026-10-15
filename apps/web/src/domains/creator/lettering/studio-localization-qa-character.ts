/**
 * Studio Localization QA — 인물 카드 규칙(호칭 일관성·존대 단계·고정어·금지어)의 순수 판정.
 *
 * 이 모듈은 번역문 한 편을 인물 카드에 대 보고, 어긴 곳을 **MQM 오류 입력**으로 돌려준다. 점수는 매기지
 * 않는다 — 오류 입력을 `studio-localization-qa` 가 문체·넘침·용어집 오류와 같은 채점기에 넣는다(점수 하나).
 *
 * MQM 분류 (서브타입 이름은 지어내지 않고 차원만 싣는다 — `studio-localization-mqm` 카탈로그 정책 그대로)
 *   · 호칭 일관성(변형 사용·원문 호칭 누락) → Terminology
 *   · 고정어 위반 · 금지어 사용              → Terminology (용어집 충돌과 같은 차원)
 *   · 존대 단계 불일치                       → Style
 * 심각도는 MQM 이 정해 주지 않는 **정책값**이다. 기본값은 이 저장소의 선택이고 `severity` 로 갈아 끼운다.
 *
 * 정직성 (이 모듈이 "통과"로 보이지 않게 하려고 센다)
 *  · 화자가 지정되지 않은 대사에는 어떤 인물 규칙도 적용하지 않는다 — 화자를 추정하지 않는다.
 *    대신 지정/미지정 큐 수를 결과에 싣는다.
 *  · 원문을 모르면 원문 전제 규칙(고정어, 원문 호칭 누락)은 돌지 않는다. 돌지 않았다는 사실도 센다
 *    (`ruleCheckedCueCount` 는 규칙을 **실제로 대 본** 큐만, `sourceMissingCueCount` 는 원문을 몰라 건너뛴 큐를 센다).
 *  · 존대 단계는 어미 휴리스틱이라 한국어·일본어만 판정한다. 그 밖의 언어는 판정하지 않고
 *    `registerUnsupportedLocale` 로 드러낸다. 문장에서 읽어 낸 층위가 없으면 `registerUnclassifiedCueCount`.
 *  · 용어 포함 판정은 단어 경계를 인식하는 부분 문자열이다(`studio-translation-term-match`) — 형태소 분석은
 *    하지 않으므로 한국어 어간 변화는 잡지 못한다.
 *
 * 순수·결정적. 입력은 변형하지 않는다.
 */

import { isTranslationTargetLocale } from "./studio-dialogue-source-locale";
import {
  STUDIO_TRANSLATION_REGISTER_LABELS,
  cleanStudioTranslationCardTerm,
  isUsableStudioTranslationAddressTerm,
  isUsableStudioTranslationBannedTerm,
  isUsableStudioTranslationFixedTerm,
  studioTranslationCardLocaleApplies,
  studioTranslationRegisterTier,
  studioTranslationSpeakerOf,
} from "./studio-translation-character-card";
import { studioTranslationTextContains } from "./studio-translation-term-match";
import {
  compareStudioTranslationRegister,
  detectStudioTranslationRegister,
  studioRegisterLanguageOf,
} from "./studio-translation-register";

import type { StudioMqmErrorInput, StudioMqmEvidence, StudioMqmSeverity } from "./studio-localization-mqm";
import type {
  StudioTranslationAddressTerm,
  StudioTranslationEffectiveCard,
  StudioTranslationRegister,
  StudioTranslationSpeakerAssignment,
} from "./studio-translation-character-card";

// ── 입력·결과 ────────────────────────────────────────────────────────────────

export interface StudioCharacterQaCue {
  readonly id: string;
  /** 0 기준 페이지 순번(오류에는 +1 로 싣는다). */
  readonly pageIndex: number;
  /** 검사 대상 번역문. */
  readonly text: string;
  /** 원문. 모르면 undefined — 원문 전제 규칙은 건너뛴다. */
  readonly sourceText?: string;
}

/** 규칙별 MQM 심각도. 전부 정책값이다. */
export interface StudioCharacterQaSeverity {
  /** 호칭 변형(카드가 피하라고 적은 표기)이 쓰인 경우. */
  readonly addressVariant: StudioMqmSeverity;
  /** 원문에 호칭이 있는데 번역에 카드 호칭이 없는 경우. */
  readonly addressMissing: StudioMqmSeverity;
  readonly fixedTerm: StudioMqmSeverity;
  readonly bannedTerm: StudioMqmSeverity;
  /** 존대 ↔ 반말 층위가 어긋난 경우. */
  readonly registerTier: StudioMqmSeverity;
  /** 존대 안에서 격식(합쇼체)과 보통(해요체)이 어긋난 경우. */
  readonly registerLevel: StudioMqmSeverity;
}

export const DEFAULT_STUDIO_CHARACTER_QA_SEVERITY: StudioCharacterQaSeverity = Object.freeze({
  addressVariant: "minor",
  addressMissing: "minor",
  fixedTerm: "major",
  bannedTerm: "major",
  registerTier: "major",
  registerLevel: "minor",
});

export type StudioCharacterQaStatus = "off" | "source-locale" | "ran";

export interface StudioCharacterQaSummary {
  /**
   * off — 규칙이 하나라도 적힌 카드가 없어 검사할 게 없음 · source-locale — 번역문이 아니라 원문을 검사하는
   * 중이라 건너뜀 · ran — 실제로 돌림.
   */
  readonly status: StudioCharacterQaStatus;
  /** 호칭·고정어·금지어·존대 단계 중 하나라도 적힌 카드 수. */
  readonly cardCount: number;
  readonly attributedCueCount: number;
  readonly unattributedCueCount: number;
  /** 규칙을 한 개라도 실제로 대 본 큐 수. */
  readonly ruleCheckedCueCount: number;
  /**
   * 고정어·원문 호칭 규칙이 있는데 그 큐의 원문을 몰라 건너뛴 큐 수. 이 값이 0보다 크면 "고정어 위반 0건"은 통과가 아니라
   * 일부를 검사하지 못했다는 뜻이다.
   */
  readonly sourceMissingCueCount: number;
  /** 존대 단계까지 판정한 큐 수. */
  readonly registerCheckedCueCount: number;
  /** 기대 단계가 있는데 문장 어미로 층위를 읽지 못한 큐 수. */
  readonly registerUnclassifiedCueCount: number;
  /** 기대 단계가 있는 큐가 있었지만 대상 언어가 존대 판정을 지원하지 않음. */
  readonly registerUnsupportedLocale: boolean;
}

export interface StudioCharacterQaResult extends StudioCharacterQaSummary {
  readonly errors: readonly StudioMqmErrorInput[];
}

export const EMPTY_STUDIO_CHARACTER_QA_SUMMARY: StudioCharacterQaSummary = Object.freeze({
  status: "off",
  cardCount: 0,
  attributedCueCount: 0,
  unattributedCueCount: 0,
  ruleCheckedCueCount: 0,
  sourceMissingCueCount: 0,
  registerCheckedCueCount: 0,
  registerUnclassifiedCueCount: 0,
  registerUnsupportedLocale: false,
});

// ── 카드 규칙 조회 ───────────────────────────────────────────────────────────

function hasAnyRule(card: StudioTranslationEffectiveCard): boolean {
  return (
    card.register !== null
    || card.addressTerms.some(
      (row) => isUsableStudioTranslationAddressTerm(row) || row.register !== null,
    )
    || card.fixedTerms.some(isUsableStudioTranslationFixedTerm)
    || card.bannedTerms.some(isUsableStudioTranslationBannedTerm)
  );
}

function addressRowsFor(
  card: StudioTranslationEffectiveCard,
  listenerId: string | null,
  targetLocale: string,
): readonly { readonly row: StudioTranslationAddressTerm; readonly index: number }[] {
  if (listenerId === null) return [];
  const rows: { readonly row: StudioTranslationAddressTerm; readonly index: number }[] = [];
  card.addressTerms.forEach((row, index) => {
    if (
      row.listenerId === listenerId
      && (isUsableStudioTranslationAddressTerm(row) || row.register !== null)
      && studioTranslationCardLocaleApplies(row.locale, targetLocale)
    ) {
      rows.push({ row, index });
    }
  });
  return rows;
}

/** 이 청자에게 기대하는 존대 단계 — 청자별 행의 단계가 인물 기본 단계보다 우선한다. */
function expectedRegisterFor(
  card: StudioTranslationEffectiveCard,
  rows: readonly { readonly row: StudioTranslationAddressTerm }[],
): StudioTranslationRegister | null {
  for (const { row } of rows) {
    if (row.register !== null) return row.register;
  }
  return card.register;
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

interface CueFacts {
  readonly cue: StudioCharacterQaCue;
  readonly assignment: StudioTranslationSpeakerAssignment;
  readonly card: StudioTranslationEffectiveCard;
  readonly rows: readonly AddressRow[];
}

interface AddressRow {
  readonly row: StudioTranslationAddressTerm;
  readonly index: number;
}

/** 규칙 하나를 판정하는 데 필요한 공통 재료 — 판정 함수마다 같은 인자를 되풀이하지 않으려는 묶음이다. */
interface RuleContext {
  readonly targetLocale: string;
  readonly severity: StudioCharacterQaSeverity;
  readonly nameOf: (characterId: string) => string;
  /** 카드 호칭을 처음 쓴 큐(근거 대사) — 호칭 행별. */
  readonly canonicalCueByRow: ReadonlyMap<string, string>;
  readonly errors: StudioMqmErrorInput[];
}

function evidence(entries: Readonly<Record<string, string | undefined>>): StudioMqmEvidence {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== "") out[key] = value;
  }
  return Object.freeze(out);
}

function pushError(
  ctx: RuleContext,
  cue: StudioCharacterQaCue,
  rule: {
    readonly key: string;
    readonly ruleId: string;
    readonly dimension: "terminology" | "style";
    readonly severity: StudioMqmSeverity;
  },
  note: string,
  details: Readonly<Record<string, string | undefined>>,
): void {
  ctx.errors.push({
    id: `${cue.id}:character:${rule.key}`,
    dimension: rule.dimension,
    severity: rule.severity,
    cueId: cue.id,
    page: cue.pageIndex + 1,
    note,
    evidence: evidence({ ruleId: `character/${rule.ruleId}`, ...details }),
  });
}

function sourceOf(cue: StudioCharacterQaCue): string | null {
  return cue.sourceText !== undefined && cue.sourceText.trim() !== "" ? cue.sourceText : null;
}

/** 이 큐에 적용될 규칙 중 원문이 있어야 도는 것(고정어, 원문 호칭 누락)이 있는가. */
function hasSourceDependentRule({ card, rows }: CueFacts, targetLocale: string): boolean {
  return (
    card.fixedTerms.some(
      (fixed) =>
        isUsableStudioTranslationFixedTerm(fixed) && studioTranslationCardLocaleApplies(fixed.locale, targetLocale),
    )
    || rows.some(
      ({ row }) =>
        isUsableStudioTranslationAddressTerm(row) && cleanStudioTranslationCardTerm(row.sourceTerm) !== "",
    )
  );
}

/** 금지어 — 번역문에 있으면 오류. 규칙을 실제로 대 봤으면 true. */
function checkBannedTerms({ cue, card }: CueFacts, ctx: RuleContext): boolean {
  let checked = false;
  card.bannedTerms.forEach((banned, index) => {
    if (
      !isUsableStudioTranslationBannedTerm(banned)
      || !studioTranslationCardLocaleApplies(banned.locale, ctx.targetLocale)
    ) {
      return;
    }
    checked = true;
    if (!studioTranslationTextContains(cue.text, banned.term)) return;
    const term = cleanStudioTranslationCardTerm(banned.term);
    pushError(
      ctx,
      cue,
      { key: `banned-term:${index}`, ruleId: "banned-term", dimension: "terminology", severity: ctx.severity.bannedTerm },
      `‘${card.name}’의 대사에 금지어 “${term}”이(가) 쓰였어요.`,
      { characterId: card.characterId, characterName: card.name, expected: "쓰지 않음", actual: term },
    );
  });
  return checked;
}

/** 고정어 — 원문에 고정어 원문이 있는데 번역에 지정한 번역이 없으면 오류. 원문을 모르면 돌지 않는다. */
function checkFixedTerms({ cue, card }: CueFacts, ctx: RuleContext): boolean {
  const source = sourceOf(cue);
  if (source === null) return false;
  let checked = false;
  card.fixedTerms.forEach((fixed, index) => {
    if (
      !isUsableStudioTranslationFixedTerm(fixed)
      || !studioTranslationCardLocaleApplies(fixed.locale, ctx.targetLocale)
    ) {
      return;
    }
    checked = true;
    if (!studioTranslationTextContains(source, fixed.source)) return;
    if (studioTranslationTextContains(cue.text, fixed.target)) return;
    const target = cleanStudioTranslationCardTerm(fixed.target);
    pushError(
      ctx,
      cue,
      { key: `fixed-term:${index}`, ruleId: "fixed-term", dimension: "terminology", severity: ctx.severity.fixedTerm },
      `‘${card.name}’의 고정어 “${cleanStudioTranslationCardTerm(fixed.source)}”는 “${target}”로 옮겨야 해요.`,
      { characterId: card.characterId, characterName: card.name, expected: target },
    );
  });
  return checked;
}

/** 호칭 일관성 — 카드 호칭 대신 변형을 썼거나, 원문 호칭이 있는데 번역에서 빠졌으면 오류. */
function checkAddressTerms({ cue, assignment, card, rows }: CueFacts, ctx: RuleContext): boolean {
  const source = sourceOf(cue);
  let checked = false;
  for (const { row, index } of rows) {
    if (!isUsableStudioTranslationAddressTerm(row)) continue;
    // 이 행이 오류를 낼 수 있어야 "대 봤다"고 센다 — 피할 표기가 있거나(변형), 원문과 원문 호칭을 다 알 때(누락)만.
    // 카드 호칭만 적힌 행은 번역에 그 호칭이 없어도 청자를 불렀는지 알 수 없어 판정할 근거가 없다.
    const evaluable =
      row.avoidTerms.some((avoid) => cleanStudioTranslationCardTerm(avoid) !== "")
      || (source !== null && cleanStudioTranslationCardTerm(row.sourceTerm) !== "");
    if (!evaluable) continue;
    checked = true;
    if (studioTranslationTextContains(cue.text, row.targetTerm)) continue;
    const term = cleanStudioTranslationCardTerm(row.targetTerm);
    const listener = ctx.nameOf(row.listenerId);
    const reference = ctx.canonicalCueByRow.get(`${assignment.speakerId}|${index}`);
    const common = {
      characterId: card.characterId,
      characterName: card.name,
      listenerId: row.listenerId,
      listenerName: listener,
      expected: term,
      referenceCueId: reference !== undefined && reference !== cue.id ? reference : undefined,
    };
    const variant = row.avoidTerms.find((avoid) => studioTranslationTextContains(cue.text, avoid));
    if (variant !== undefined) {
      const actual = cleanStudioTranslationCardTerm(variant);
      pushError(
        ctx,
        cue,
        { key: `address-variant:${index}`, ruleId: "address-variant", dimension: "terminology", severity: ctx.severity.addressVariant },
        `‘${card.name}’이(가) ‘${listener}’을(를) 부르는 호칭이 인물 카드(“${term}”)와 달라요 — “${actual}”로 옮겼어요.`,
        { ...common, actual },
      );
    } else if (
      source !== null
      && cleanStudioTranslationCardTerm(row.sourceTerm) !== ""
      && studioTranslationTextContains(source, row.sourceTerm)
    ) {
      pushError(
        ctx,
        cue,
        { key: `address-missing:${index}`, ruleId: "address-missing", dimension: "terminology", severity: ctx.severity.addressMissing },
        `원문에 ‘${listener}’를 부르는 호칭 “${cleanStudioTranslationCardTerm(row.sourceTerm)}”가 있는데 번역에 인물 카드 호칭 “${term}”이(가) 없어요.`,
        common,
      );
    }
  }
  return checked;
}

/** 근거 대사: 같은 화자→청자 호칭 행에서 카드 호칭을 처음 쓴 큐. */
function canonicalCuesByRow(facts: readonly CueFacts[]): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const { cue, assignment, rows } of facts) {
    for (const { row, index } of rows) {
      const key = `${assignment.speakerId}|${index}`;
      if (
        !found.has(key)
        && isUsableStudioTranslationAddressTerm(row)
        && studioTranslationTextContains(cue.text, row.targetTerm)
      ) {
        found.set(key, cue.id);
      }
    }
  }
  return found;
}

interface RegisterOutcome {
  readonly checkedCueIds: ReadonlySet<string>;
  readonly unclassifiedCueCount: number;
  readonly unsupportedLocale: boolean;
}

/** 존대 단계 — 기대 단계가 있는 큐의 번역문을 어미로 읽어 대 본다. 지원하지 않는 언어는 판정하지 않는다. */
function checkRegisters(facts: readonly CueFacts[], ctx: RuleContext): RegisterOutcome {
  const language = studioRegisterLanguageOf(ctx.targetLocale);
  const wanted = facts.flatMap((fact) => {
    const expected = expectedRegisterFor(fact.card, fact.rows);
    return expected === null ? [] : [{ fact, expected }];
  });
  if (wanted.length > 0 && language === null) {
    return { checkedCueIds: new Set(), unclassifiedCueCount: 0, unsupportedLocale: true };
  }
  const detections = wanted.map(({ fact, expected }) => ({
    fact,
    expected,
    detection: detectStudioTranslationRegister(fact.cue.text, ctx.targetLocale),
  }));
  // 근거 대사: 같은 화자→청자에서 기대 층위로 옮겨진 첫 큐.
  const okCueByPair = new Map<string, string>();
  for (const { fact, expected, detection } of detections) {
    if (detection === null || compareStudioTranslationRegister(expected, detection) !== null) continue;
    if (detection.tier === null) continue;
    const pairKey = `${fact.assignment.speakerId}|${fact.assignment.listenerId ?? ""}`;
    if (!okCueByPair.has(pairKey)) okCueByPair.set(pairKey, fact.cue.id);
  }

  const checkedCueIds = new Set<string>();
  let unclassifiedCueCount = 0;
  for (const { fact, expected, detection } of detections) {
    const { cue, assignment, card } = fact;
    if (detection === null || detection.tier === null) {
      unclassifiedCueCount += 1;
      continue;
    }
    checkedCueIds.add(cue.id);
    const mismatch = compareStudioTranslationRegister(expected, detection);
    if (mismatch === null) continue;
    const listenerName = assignment.listenerId === null ? undefined : ctx.nameOf(assignment.listenerId);
    const expectedLabel = STUDIO_TRANSLATION_REGISTER_LABELS[expected].ko;
    const reference = okCueByPair.get(`${assignment.speakerId}|${assignment.listenerId ?? ""}`);
    const detectedLabel =
      mismatch === "tier"
        ? studioTranslationRegisterTier(expected) === "honorific" ? "반말" : "존댓말"
        : detection.level === "formal" ? "격식 존대(합쇼체)" : "존대(해요체)";
    pushError(
      ctx,
      cue,
      {
        key: "register",
        ruleId: "register",
        dimension: "style",
        severity: mismatch === "tier" ? ctx.severity.registerTier : ctx.severity.registerLevel,
      },
      `‘${card.name}’은(는) ${listenerName === undefined ? "" : `‘${listenerName}’에게 `}${expectedLabel}로 말하는 인물인데 번역은 ${detectedLabel}로 읽혀요.`,
      {
        characterId: card.characterId,
        characterName: card.name,
        listenerId: assignment.listenerId ?? undefined,
        listenerName,
        expected: expectedLabel,
        actual: detectedLabel,
        referenceCueId: reference !== undefined && reference !== cue.id ? reference : undefined,
      },
    );
  }
  return { checkedCueIds, unclassifiedCueCount, unsupportedLocale: false };
}

/**
 * 번역문 한 편(큐 목록)을 인물 카드에 대 본다.
 *
 * `cards` 는 효과 카드(시트 + 번역용 오버라이드)이고, `speakers` 는 작가가 지정한 대사별 화자·청자다.
 */
export function checkStudioTranslationCharacterRules(input: {
  readonly cues: readonly StudioCharacterQaCue[];
  readonly cards: readonly StudioTranslationEffectiveCard[];
  readonly speakers: Readonly<Record<string, StudioTranslationSpeakerAssignment>>;
  readonly targetLocale: string;
  readonly severity?: Partial<StudioCharacterQaSeverity>;
}): StudioCharacterQaResult {
  const { cues, cards, speakers, targetLocale } = input;
  const ruleCards = cards.filter(hasAnyRule);
  const base = { ...EMPTY_STUDIO_CHARACTER_QA_SUMMARY, cardCount: ruleCards.length };
  if (!isTranslationTargetLocale(targetLocale)) {
    return Object.freeze({ ...base, status: "source-locale", errors: Object.freeze([]) });
  }
  if (ruleCards.length === 0) return Object.freeze({ ...base, errors: Object.freeze([]) });

  const cardById = new Map(cards.map((card) => [card.characterId, card]));

  // 1단계 — 화자가 지정된 큐와 그 카드·호칭 행을 모은다. 화자를 추정하지 않으므로 지정이 없는 큐는 세기만 한다.
  const facts: CueFacts[] = [];
  let attributedCueCount = 0;
  let unattributedCueCount = 0;
  for (const cue of cues) {
    const assignment = studioTranslationSpeakerOf(speakers, cue.id);
    if (assignment === null) {
      unattributedCueCount += 1;
      continue;
    }
    attributedCueCount += 1;
    const card = cardById.get(assignment.speakerId);
    if (card === undefined || !hasAnyRule(card)) continue;
    facts.push({ cue, assignment, card, rows: addressRowsFor(card, assignment.listenerId, targetLocale) });
  }

  // 2단계 — 규칙 판정. 근거 대사는 판정 전에 모아 둔다(근거가 뒤에 나오는 대사도 찾아야 한다).
  const ctx: RuleContext = {
    targetLocale,
    severity: { ...DEFAULT_STUDIO_CHARACTER_QA_SEVERITY, ...input.severity },
    nameOf: (characterId) => cardById.get(characterId)?.name ?? characterId,
    canonicalCueByRow: canonicalCuesByRow(facts),
    errors: [],
  };
  const ruleCheckedCueIds = new Set<string>();
  let sourceMissingCueCount = 0;
  for (const fact of facts) {
    if (sourceOf(fact.cue) === null && hasSourceDependentRule(fact, targetLocale)) sourceMissingCueCount += 1;
    // 세 규칙을 모두 대 봐야 하므로 단축 평가(||)를 쓰지 않는다.
    const banned = checkBannedTerms(fact, ctx);
    const fixed = checkFixedTerms(fact, ctx);
    const address = checkAddressTerms(fact, ctx);
    if (banned || fixed || address) ruleCheckedCueIds.add(fact.cue.id);
  }
  const register = checkRegisters(facts, ctx);
  for (const cueId of register.checkedCueIds) ruleCheckedCueIds.add(cueId);

  return Object.freeze({
    status: "ran",
    cardCount: ruleCards.length,
    attributedCueCount,
    unattributedCueCount,
    ruleCheckedCueCount: ruleCheckedCueIds.size,
    sourceMissingCueCount,
    registerCheckedCueCount: register.checkedCueIds.size,
    registerUnclassifiedCueCount: register.unclassifiedCueCount,
    registerUnsupportedLocale: register.unsupportedLocale,
    errors: Object.freeze(ctx.errors),
  });
}
