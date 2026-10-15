/**
 * Studio Translation Character Card — 번역 인물 카드(호칭·존대·말투·금지어/고정어)의 스키마·파생·편집.
 *
 * 왜 필요한가
 * -----------
 * 번역 패널은 대사 문자열만 보고 번역한다. 그래서 같은 인물이 같은 상대를 어떤 호칭으로 부르는지,
 * 반말인지 존댓말인지, 절대 쓰지 말아야 할 단어가 무엇인지는 번역자의 기억에만 있었고, 회차가 길어질수록
 * 호칭이 흔들렸다. 이 모듈은 그 정보를 **인물 단위 카드**로 담는 데이터 계약이다.
 *
 * 두 층으로 나뉜다
 * ----------------
 *  · 시트 층(읽기 전용) — 스토리 바이블의 캐릭터 시트(`planning/studio-character-profile`)에서 파생한다.
 *    이름·별칭·말투 서술·나가는 관계 라벨이 여기서 온다. 이 모듈은 시트를 **절대 바꾸지 않는다**.
 *  · 번역용 오버라이드 층(저장) — 번역에만 필요한 값(존대 단계·호칭 맵·고정어·금지어, 그리고 말투 메모
 *    덮어쓰기)을 번역 프로젝트 문서(`studio-localization-project-store`)에 저장한다.
 *
 * 정직성 규칙 (지어내지 않는다)
 * ---------------------------
 *  · 시트에 없는 값은 추정으로 채우지 않는다. 비어 있으면 비어 있는 채로 "미입력"으로 드러난다.
 *    (예: 시트는 호칭을 모른다 — 관계 라벨 "형·동생"은 힌트로만 보여 줄 뿐 호칭으로 승격하지 않는다.)
 *  · 화자·청자 지정도 작가가 명시한 것만 담는다(`speakers`). 대사 요소에는 화자 필드가 없고,
 *    이름이 비슷하다고 짐작해 채우지 않는다.
 *
 * 스키마 버전과 역호환
 * -------------------
 *  · `schemaVersion: 1`. 선택 필드가 없는 v1 페이로드(예: `speakers` 없음)도 그대로 읽는다.
 *  · 알 수 없는 필드는 무시하고, 형식이 틀린 항목은 **항목 단위로** 버린다(문서 전체를 버리지 않는다).
 *  · 알 수 없는 버전(미래 버전 포함)은 해석할 수 없으므로 `null` — 호출부는 빈 카드 집합으로 취급한다.
 *
 * 순수·결정적. DOM/React 의존이 없고 입력은 변형하지 않으며 반환값은 freeze 한다.
 *
 * 편집 연산(카드 수정·직접 추가·삭제·화자 지정)은 `studio-translation-character-card-edit.ts` 에 있다.
 *
 * §1. 상한과 타입
 * §2. 텍스트 정리
 * §3. 파싱(역호환)
 * §4. 파생(시트 + 오버라이드 → 효과 카드)
 */

import { characterSheetView } from "../planning/studio-character-profile";

import type { StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";

// ── §1. 상한과 타입 ──────────────────────────────────────────────────────────

export const STUDIO_TRANSLATION_CARD_SCHEMA_VERSION = 1 as const;

/**
 * 방어적 상한. 외부 규격이 아니라 이 저장소가 정한 운영 값이다(**출처 UNVERIFIED**) — 한 회차 카드가
 * 이보다 커지면 사람이 관리할 수 없고, 프롬프트·저장소 크기도 통제할 수 없다는 판단뿐이다.
 */
export const STUDIO_TRANSLATION_CARD_LIMITS = Object.freeze({
  cards: 64,
  addressTerms: 24,
  avoidTerms: 8,
  fixedTerms: 32,
  bannedTerms: 32,
  speakers: 5000,
  idChars: 180,
  nameChars: 40,
  noteChars: 400,
  termChars: 60,
  localeChars: 16,
});

/**
 * 존대/반말 단계. 한국어 말투 층위를 그대로 따른다 — `studio-dialogue-voice.VoicePolitenessLevel` 에서
 * `unknown` 을 뺀 값이라 같은 어휘로 말투 지문과 카드를 오갈 수 있다.
 *  formal 격식 존대(합쇼체) · polite 존대(해요체) · casual 반말(해체) · plain 평서·하대(해라체)
 */
export const STUDIO_TRANSLATION_REGISTERS = ["formal", "polite", "casual", "plain"] as const;
export type StudioTranslationRegister = (typeof STUDIO_TRANSLATION_REGISTERS)[number];

/** 존대 여부만 가르는 거친 층위. QA 는 이 층위로 비교한다(반말 안의 결은 어미만으로 믿을 수 없다). */
export type StudioTranslationRegisterTier = "honorific" | "non-honorific";

export const STUDIO_TRANSLATION_REGISTER_LABELS: Readonly<
  Record<StudioTranslationRegister, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  formal: { ko: "격식 존대(합쇼체)", en: "Formal honorific" },
  polite: { ko: "존대(해요체)", en: "Polite honorific" },
  casual: { ko: "반말(해체)", en: "Casual speech" },
  plain: { ko: "평서·하대(해라체)", en: "Plain / blunt speech" },
});

export function studioTranslationRegisterTier(
  level: StudioTranslationRegister,
): StudioTranslationRegisterTier {
  return level === "formal" || level === "polite" ? "honorific" : "non-honorific";
}

/** 한 인물이 한 청자를 부르는 호칭 규칙. */
export interface StudioTranslationAddressTerm {
  /** 청자 인물 id(카드의 characterId 와 같은 공간). */
  readonly listenerId: string;
  /** 원문(한국어) 호칭. 비어 있으면 "원문에 호칭이 있었는데 번역에서 빠졌는가"는 검사하지 않는다. */
  readonly sourceTerm: string;
  /** 번역 호칭(기준 표기). */
  readonly targetTerm: string;
  /** 규칙이 적용되는 대상 언어(접두 일치: "en" 은 en-US 포함). 비어 있으면 모든 번역 언어. */
  readonly locale: string;
  /** 이 청자에게 쓰는 존대 단계. null 이면 인물 기본 단계를 따른다. */
  readonly register: StudioTranslationRegister | null;
  /** 번역문에 쓰이면 호칭이 바뀐 것으로 보는 다른 표기. */
  readonly avoidTerms: readonly string[];
}

/** 원문 표현 → 반드시 그렇게 옮길 번역(예: 입버릇, 별명). */
export interface StudioTranslationFixedTerm {
  readonly source: string;
  readonly target: string;
  readonly locale: string;
}

/** 이 인물의 번역 대사에 쓰면 안 되는 표기. */
export interface StudioTranslationBannedTerm {
  readonly term: string;
  readonly locale: string;
}

export type StudioTranslationCardOrigin = "story-bible" | "manual";

/** 저장되는 번역용 오버라이드 한 장. 시트 값은 여기에 복사하지 않는다(복사하면 시트가 낡는다). */
export interface StudioTranslationCardRecord {
  readonly characterId: string;
  readonly origin: StudioTranslationCardOrigin;
  /**
   * manual 카드의 이름. story-bible 카드는 시트가 이름의 권위이고, 이 값은 시트에서 인물이 사라졌을 때
   * 카드를 알아볼 수 있게 하는 **보관용 스냅샷**일 뿐이다(시트가 있으면 시트 이름을 쓴다).
   */
  readonly name: string;
  /** null 이면 시트의 말투 서술을 따른다. */
  readonly speechNote: string | null;
  readonly register: StudioTranslationRegister | null;
  readonly addressTerms: readonly StudioTranslationAddressTerm[];
  readonly fixedTerms: readonly StudioTranslationFixedTerm[];
  readonly bannedTerms: readonly StudioTranslationBannedTerm[];
}

/** 대사 한 줄의 화자·청자. 작가가 명시한 것만 담는다. */
export interface StudioTranslationSpeakerAssignment {
  readonly speakerId: string;
  readonly listenerId: string | null;
}

export interface StudioTranslationCharacterCardSet {
  readonly schemaVersion: typeof STUDIO_TRANSLATION_CARD_SCHEMA_VERSION;
  readonly cards: readonly StudioTranslationCardRecord[];
  /** 대사 요소 id → 화자·청자. */
  readonly speakers: Readonly<Record<string, StudioTranslationSpeakerAssignment>>;
}

export const EMPTY_STUDIO_TRANSLATION_CARD_SET: StudioTranslationCharacterCardSet = Object.freeze({
  schemaVersion: STUDIO_TRANSLATION_CARD_SCHEMA_VERSION,
  cards: Object.freeze([]),
  speakers: Object.freeze({}),
});

// ── §2. 텍스트 정리 ──────────────────────────────────────────────────────────

/**
 * 눈에 보이지 않는 제어·서식 문자인가. 제어 문자(C0/C1), 제로폭 공백·방향 표식, 양방향 서식 문자는
 * 화면에는 안 보이지만 프롬프트에는 그대로 실려 지시문을 숨기는 데 쓰일 수 있다.
 * 정규식 대신 코드 포인트 범위로 판정한다(제어 문자 정규식은 린트가 금지한다).
 */
function isHiddenControl(codePoint: number): boolean {
  return (
    codePoint < 0x20
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || (codePoint >= 0x2060 && codePoint <= 0x2064)
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
    || codePoint === 0xfeff
  );
}

/**
 * 저장·표시용 텍스트 정리. 숨은 제어 문자를 지우고(탭은 공백, 줄바꿈은 `multiline` 일 때만 유지),
 * 코드 포인트 기준으로 자른다. 앞뒤 공백은 **지우지 않는다** — 입력창이 이 값을 그대로 되받으므로,
 * 지우면 타이핑 중 공백이 사라진다. 공백 정리는 소비하는 쪽(QA·프롬프트)이 한다.
 */
export function boundedStudioTranslationCardText(
  value: unknown,
  maxChars: number,
  options: { readonly multiline?: boolean } = {},
): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const character of value.normalize("NFC")) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === "\n") {
      out += options.multiline === true ? "\n" : " ";
    } else if (character === "\t") {
      out += " ";
    } else if (!isHiddenControl(codePoint)) {
      out += character;
    }
  }
  const characters = Array.from(out);
  return characters.length <= maxChars ? out : characters.slice(0, maxChars).join("");
}

/** 소비용 정규화: NFC + 공백 접기 + 양끝 정리. 비교·프롬프트에 쓰는 값은 항상 이 함수를 거친다. */
export function cleanStudioTranslationCardTerm(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

const LOCALE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

/**
 * 언어 코드 형식(BCP-47 의 느슨한 부분집합)인가. 빈 문자열은 "모든 언어"라 true 다. 밑줄(`en_US`)은 적용 판정
 * (`studioTranslationCardLocaleApplies`)이 하이픈과 같게 읽으므로 여기서도 같게 본다 — 실제로 적용되는 규칙을
 * "어떤 언어에도 적용되지 않는다"고 경고하지 않으려는 것이다.
 */
export function isStudioTranslationCardLocaleTag(locale: string): boolean {
  const trimmed = locale.trim().replace(/_/gu, "-");
  return trimmed === "" || LOCALE_TAG.test(trimmed);
}

/**
 * 규칙의 대상 언어가 실제 번역 언어에 적용되는가. 빈 규칙 언어는 모든 번역 언어,
 * 그 외에는 **언어 서브태그 경계의 접두 일치**다("en" 은 "en-US" 에 적용, "en-US" 는 "en" 에 적용하지 않는다).
 * 용어집(`studio-translation-glossary.localeMatches`)의 정확 일치와 다른 이유: 카드의 영어 호칭은
 * en-US/en-GB 어느 쪽 번역에도 같은 인물의 같은 호칭이어야 하기 때문이다.
 */
export function studioTranslationCardLocaleApplies(
  ruleLocale: string,
  targetLocale: string,
): boolean {
  const rule = ruleLocale.trim().replace(/_/gu, "-").toLowerCase();
  if (rule === "") return true;
  const target = targetLocale.trim().replace(/_/gu, "-").toLowerCase();
  return target === rule || target.startsWith(`${rule}-`);
}

// ── §3. 파싱(역호환) ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidStudioTranslationCardId(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= STUDIO_TRANSLATION_CARD_LIMITS.idChars
    && value.trim() === value
    && value !== "."
    && value !== ".."
    && !value.includes("\\")
  );
}

function isRegister(value: unknown): value is StudioTranslationRegister {
  return (
    typeof value === "string"
    && (STUDIO_TRANSLATION_REGISTERS as readonly string[]).includes(value)
  );
}

function parseRegisterOrNull(value: unknown): StudioTranslationRegister | null {
  return isRegister(value) ? value : null;
}

function termText(value: unknown): string {
  return boundedStudioTranslationCardText(value, STUDIO_TRANSLATION_CARD_LIMITS.termChars);
}

function localeText(value: unknown): string {
  return boundedStudioTranslationCardText(value, STUDIO_TRANSLATION_CARD_LIMITS.localeChars);
}

/** 항목 하나가 형식에 맞는지 모르는 배열을 항목 단위로 걸러 읽는다. */
function readList<T>(
  value: unknown,
  limit: number,
  parseItem: (entry: unknown) => T | null,
): readonly T[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const out: T[] = [];
  for (const entry of value) {
    if (out.length >= limit) break;
    const parsed = parseItem(entry);
    if (parsed !== null) out.push(parsed);
  }
  return Object.freeze(out);
}

function parseAddressTerm(entry: unknown): StudioTranslationAddressTerm | null {
  // 청자를 아직 고르지 않은 행("")도 편집 중인 상태로 보존한다 — 소비하는 쪽이 쓸 수 없는 행으로 건너뛴다.
  if (!isRecord(entry)) return null;
  const { listenerId } = entry;
  if (listenerId !== "" && !isValidStudioTranslationCardId(listenerId)) return null;
  const avoid = readList(entry.avoidTerms, STUDIO_TRANSLATION_CARD_LIMITS.avoidTerms, (item) => {
    const text = termText(item);
    return text === "" ? null : text;
  });
  return Object.freeze({
    listenerId,
    sourceTerm: termText(entry.sourceTerm),
    targetTerm: termText(entry.targetTerm),
    locale: localeText(entry.locale),
    register: parseRegisterOrNull(entry.register),
    avoidTerms: avoid,
  });
}

function parseFixedTerm(entry: unknown): StudioTranslationFixedTerm | null {
  if (!isRecord(entry)) return null;
  return Object.freeze({
    source: termText(entry.source),
    target: termText(entry.target),
    locale: localeText(entry.locale),
  });
}

function parseBannedTerm(entry: unknown): StudioTranslationBannedTerm | null {
  if (!isRecord(entry)) return null;
  return Object.freeze({ term: termText(entry.term), locale: localeText(entry.locale) });
}

export function parseStudioTranslationCardRecord(entry: unknown): StudioTranslationCardRecord | null {
  if (!isRecord(entry) || !isValidStudioTranslationCardId(entry.characterId)) return null;
  // origin 이 없거나 모르는 값이면 해석할 수 없다 — 시트 카드로 추정해 붙이지 않는다.
  if (entry.origin !== "story-bible" && entry.origin !== "manual") return null;
  const note = entry.speechNote;
  return Object.freeze({
    characterId: entry.characterId,
    origin: entry.origin,
    name: boundedStudioTranslationCardText(entry.name, STUDIO_TRANSLATION_CARD_LIMITS.nameChars),
    speechNote:
      typeof note === "string"
        ? boundedStudioTranslationCardText(note, STUDIO_TRANSLATION_CARD_LIMITS.noteChars, {
            multiline: true,
          })
        : null,
    register: parseRegisterOrNull(entry.register),
    addressTerms: readList(
      entry.addressTerms,
      STUDIO_TRANSLATION_CARD_LIMITS.addressTerms,
      parseAddressTerm,
    ),
    fixedTerms: readList(entry.fixedTerms, STUDIO_TRANSLATION_CARD_LIMITS.fixedTerms, parseFixedTerm),
    bannedTerms: readList(
      entry.bannedTerms,
      STUDIO_TRANSLATION_CARD_LIMITS.bannedTerms,
      parseBannedTerm,
    ),
  });
}

function parseSpeakers(
  value: unknown,
): Readonly<Record<string, StudioTranslationSpeakerAssignment>> {
  if (!isRecord(value)) return Object.freeze({});
  const entries: [string, StudioTranslationSpeakerAssignment][] = [];
  for (const [dialogueId, entry] of Object.entries(value)) {
    if (entries.length >= STUDIO_TRANSLATION_CARD_LIMITS.speakers) break;
    if (!isValidStudioTranslationCardId(dialogueId) || !isRecord(entry)) continue;
    if (!isValidStudioTranslationCardId(entry.speakerId)) continue;
    const listenerId = isValidStudioTranslationCardId(entry.listenerId) ? entry.listenerId : null;
    entries.push([dialogueId, Object.freeze({ speakerId: entry.speakerId, listenerId })]);
  }
  // fromEntries 는 "__proto__" 같은 키도 평범한 own 속성으로 만든다(대입은 프로토타입을 바꾼다).
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * 대사 한 줄의 화자 지정을 읽는다. own 속성만 인정한다 — 대사 id 가 "constructor" 같은 이름이어도
 * 상속된 함수를 "지정"으로 착각하지 않는다.
 */
export function studioTranslationSpeakerOf(
  speakers: Readonly<Record<string, StudioTranslationSpeakerAssignment>>,
  dialogueId: string,
): StudioTranslationSpeakerAssignment | null {
  return Object.hasOwn(speakers, dialogueId) ? (speakers[dialogueId] ?? null) : null;
}

/**
 * 저장된 값을 카드 집합으로 읽는다. 해석할 수 없으면 `null`(호출부는 빈 집합으로 취급).
 * 같은 characterId 카드는 먼저 나온 것만 남긴다 — 둘 중 어느 쪽이 맞는지 정할 근거가 없고,
 * 조용히 합치면 서로 다른 호칭 규칙이 섞인다.
 */
export function parseStudioTranslationCharacterCardSet(
  value: unknown,
): StudioTranslationCharacterCardSet | null {
  if (!isRecord(value) || value.schemaVersion !== STUDIO_TRANSLATION_CARD_SCHEMA_VERSION) {
    return null;
  }
  const seen = new Set<string>();
  const cards = readList(value.cards, STUDIO_TRANSLATION_CARD_LIMITS.cards, (entry) => {
    const card = parseStudioTranslationCardRecord(entry);
    if (card === null || seen.has(card.characterId)) return null;
    seen.add(card.characterId);
    return card;
  });
  return Object.freeze({
    schemaVersion: STUDIO_TRANSLATION_CARD_SCHEMA_VERSION,
    cards,
    speakers: parseSpeakers(value.speakers),
  });
}

// ── §4. 파생(시트 + 오버라이드 → 효과 카드) ──────────────────────────────────

export type StudioTranslationCardField =
  | "speechNote"
  | "register"
  | "addressTerms"
  | "fixedTerms"
  | "bannedTerms";

export type StudioTranslationCardDisplayOrigin = StudioTranslationCardOrigin | "orphan";

/** 시트에서 읽은 관계 한 줄 — 호칭이 아니라 호칭을 적을 때 참고하는 힌트다. */
export interface StudioTranslationSheetRelation {
  readonly listenerId: string;
  readonly listenerName: string;
  readonly label: string;
}

/** 화면·QA·프롬프트가 읽는 카드 한 장(시트 값 + 오버라이드 병합 결과). */
export interface StudioTranslationEffectiveCard {
  readonly characterId: string;
  readonly name: string;
  readonly aliases: readonly string[];
  /** orphan 은 저장된 번역 카드는 있는데 시트에서 그 인물이 사라진 경우다(지우지 않고 드러낸다). */
  readonly origin: StudioTranslationCardDisplayOrigin;
  /** 시트의 말투 서술(정리됨). 시트가 없거나 비어 있으면 "". */
  readonly sheetSpeechNote: string;
  readonly speechNoteOverride: string | null;
  /** 오버라이드가 있으면 오버라이드, 없으면 시트 값(정리됨). */
  readonly speechNote: string;
  readonly speechNoteSource: "override" | "sheet" | "empty";
  readonly register: StudioTranslationRegister | null;
  readonly addressTerms: readonly StudioTranslationAddressTerm[];
  readonly fixedTerms: readonly StudioTranslationFixedTerm[];
  readonly bannedTerms: readonly StudioTranslationBannedTerm[];
  readonly sheetRelations: readonly StudioTranslationSheetRelation[];
  /** 값이 채워진 필드 — 비어 있으면 화면이 "미입력"으로 드러낸다. */
  readonly filled: Readonly<Record<StudioTranslationCardField, boolean>>;
}

/** 청자와 번역 호칭이 모두 채워진 행만 검사·프롬프트에 쓴다(편집 중인 빈 행은 건너뛴다). */
export function isUsableStudioTranslationAddressTerm(term: StudioTranslationAddressTerm): boolean {
  return term.listenerId !== "" && cleanStudioTranslationCardTerm(term.targetTerm) !== "";
}

export function isUsableStudioTranslationFixedTerm(term: StudioTranslationFixedTerm): boolean {
  return (
    cleanStudioTranslationCardTerm(term.source) !== ""
    && cleanStudioTranslationCardTerm(term.target) !== ""
  );
}

export function isUsableStudioTranslationBannedTerm(term: StudioTranslationBannedTerm): boolean {
  return cleanStudioTranslationCardTerm(term.term) !== "";
}

function buildEffectiveCard(input: {
  readonly characterId: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly origin: StudioTranslationCardDisplayOrigin;
  readonly sheetSpeechNote: string;
  readonly sheetRelations: readonly StudioTranslationSheetRelation[];
  readonly record: StudioTranslationCardRecord | null;
}): StudioTranslationEffectiveCard {
  const { record } = input;
  const overrideText =
    record === null || record.speechNote === null ? "" : cleanStudioTranslationCardTerm(record.speechNote);
  const speechNote = overrideText !== "" ? overrideText : input.sheetSpeechNote;
  const speechNoteSource: StudioTranslationEffectiveCard["speechNoteSource"] =
    overrideText !== "" ? "override" : input.sheetSpeechNote !== "" ? "sheet" : "empty";
  const addressTerms = record?.addressTerms ?? Object.freeze([]);
  const fixedTerms = record?.fixedTerms ?? Object.freeze([]);
  const bannedTerms = record?.bannedTerms ?? Object.freeze([]);
  const register = record?.register ?? null;
  return Object.freeze({
    characterId: input.characterId,
    name: input.name,
    aliases: input.aliases,
    origin: input.origin,
    sheetSpeechNote: input.sheetSpeechNote,
    speechNoteOverride: record === null ? null : record.speechNote,
    speechNote,
    speechNoteSource,
    register,
    addressTerms,
    fixedTerms,
    bannedTerms,
    sheetRelations: input.sheetRelations,
    filled: Object.freeze({
      speechNote: speechNote !== "",
      register: register !== null,
      addressTerms: addressTerms.some(isUsableStudioTranslationAddressTerm),
      fixedTerms: fixedTerms.some(isUsableStudioTranslationFixedTerm),
      bannedTerms: bannedTerms.some(isUsableStudioTranslationBannedTerm),
    }),
  });
}

/**
 * 시트(읽기 전용) + 번역용 오버라이드 → 효과 카드 목록.
 *
 * 순서: 바이블 캐릭터(바이블 순서) → 직접 추가한 카드(저장 순서) → 시트에서 사라진 카드(저장 순서).
 * 바이블이 없으면(null) 시트 층 없이 저장된 카드만 보여 준다 — 시트 값을 지어내지 않는다.
 */
export function deriveStudioTranslationEffectiveCards(input: {
  readonly bible: StudioStoryBible | null;
  readonly narrative: StudioStoryBibleNarrative | null;
  readonly set: StudioTranslationCharacterCardSet;
}): readonly StudioTranslationEffectiveCard[] {
  const { bible, narrative, set } = input;
  const recordById = new Map(set.cards.map((card) => [card.characterId, card]));
  const used = new Set<string>();
  const cards: StudioTranslationEffectiveCard[] = [];

  if (bible !== null) {
    const nameById = new Map(bible.characters.map((character) => [character.id, character.name]));
    for (const character of bible.characters) {
      used.add(character.id);
      const view =
        narrative === null ? null : characterSheetView(bible, narrative, character.id);
      const relations: StudioTranslationSheetRelation[] = [];
      const seenListeners = new Set<string>();
      for (const relation of view?.outgoing ?? []) {
        if (seenListeners.has(relation.toCharacterId)) continue;
        seenListeners.add(relation.toCharacterId);
        relations.push(
          Object.freeze({
            listenerId: relation.toCharacterId,
            listenerName: nameById.get(relation.toCharacterId) ?? relation.toCharacterId,
            label: relation.label.trim() || relation.kind,
          }),
        );
      }
      cards.push(
        buildEffectiveCard({
          characterId: character.id,
          name: character.name,
          aliases: character.aliases,
          origin: "story-bible",
          sheetSpeechNote: cleanStudioTranslationCardTerm(view?.profile?.speechStyle ?? ""),
          sheetRelations: Object.freeze(relations),
          record: recordById.get(character.id) ?? null,
        }),
      );
    }
  }

  for (const wanted of ["manual", "orphan"] as const) {
    for (const record of set.cards) {
      if (used.has(record.characterId)) continue;
      const isManual = record.origin === "manual";
      if ((wanted === "manual") !== isManual) continue;
      cards.push(
        buildEffectiveCard({
          characterId: record.characterId,
          name: record.name.trim() || record.characterId,
          aliases: Object.freeze([]),
          origin: wanted,
          sheetSpeechNote: "",
          sheetRelations: Object.freeze([]),
          record,
        }),
      );
    }
  }
  return Object.freeze(cards);
}
