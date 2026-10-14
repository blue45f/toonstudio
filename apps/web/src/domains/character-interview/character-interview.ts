/**
 * 캐릭터 인터뷰(작가판 캐릭터 챗) — 순수 코어.
 *
 * 팬이 캐릭터와 대화하는 character-chat과 목적이 다르다. 여기는 작가가
 * 자기 캐릭터를 불러 앉혀 놓고 설정·말투가 시트대로 살아 있는지를 직접
 * 물어 검증하는 창작 동선이다.
 *
 * 완료 기준 세 가지가 이 모듈의 계약이다:
 *  1. 엔진 재사용 — 대화 생성은 character-chat 엔진을 그대로 쓴다
 *     (`character-interview-engine.ts` 어댑터). 이 모듈은 엔진 입력이 되는
 *     `CharacterChatProfile`을 만들 뿐, LLM 경로는 새로 만들지 않는다.
 *  2. 캐논 시트 근거 고정 — 프로필의 성격·말투·세계관은 전부 스토리
 *     바이블의 서술형 캐릭터 시트(`StudioStoryCharacterProfile`)와 바이블
 *     사실·관계에서만 조립한다. 시트에 없는 값은 지어내지 않고
 *     `grounding.missingFields`로 그대로 드러낸다. 성격·말투 중 하나라도
 *     비면 `grounded=false`이며 표면은 인터뷰 시작을 막고 시트 쓰기를
 *     먼저 안내한다(근거 없는 인터뷰는 검증이 아니라 환각이다).
 *  3. 대화 → 설정 메모 저장 — 캐릭터 답변 한 건을 종류가 있는 설정
 *     메모로 바꾸는 빌더와, 그 메모를 시트 필드에 덧붙이는 패치 계산을
 *     제공한다. 패치는 "제안"까지만 만들고 시트를 직접 고치지 않는다 —
 *     반영 여부는 작가가 정한다(말투 지문 레인의 "제안으로만" 규율과 동일).
 *
 * 정직성 규칙:
 *  - 인터뷰 프로필은 `chatEnabled: false`로 고정한다. 작가 검증용 대화가
 *    팬 공개 목록에 섞이면 안 된다.
 *  - `canonSheetId`에는 바이블 캐릭터 ID를 넣어 근거 시트를 역추적할 수
 *    있게 한다(character-chat 타입의 "시트 ID 메타데이터" 계약 그대로).
 *  - 입력 객체는 변형하지 않는다.
 */

import type { CharacterChatProfile } from "../character-chat/character-chat-types";
import type {
  StudioStoryBibleNarrative,
  StudioStoryCharacterProfile,
} from "../creator/planning/studio-character-profile";
import { characterSheetView } from "../creator/planning/studio-character-profile";
import type { StudioStoryBible } from "../creator/studio-story-bible";

// ── 대화 메시지 ─────────────────────────────────────────────────────────

/** 작가와 캐릭터가 주고받는 인터뷰 한 턴. 팬 챗의 fan/character와 역할 이름만 다르다. */
export interface CharacterInterviewMessage {
  readonly id: string;
  readonly role: "author" | "character";
  readonly text: string;
  readonly createdAt: string;
}

// ── 캐논 근거 고정 ──────────────────────────────────────────────────────

/** 시트에서 근거로 고정할 수 있는 필드 — grounding의 sourced/missing이 이 단위다. */
export type InterviewGroundingField =
  | "personality"
  | "speechStyle"
  | "background"
  | "motivation"
  | "signatureLines"
  | "appearanceNotes"
  | "facts"
  | "relations";

export const INTERVIEW_GROUNDING_FIELD_LABELS: Record<InterviewGroundingField, string> = {
  personality: "성격",
  speechStyle: "말투",
  background: "배경 서사",
  motivation: "욕망·목표",
  signatureLines: "대표 대사",
  appearanceNotes: "외형 메모",
  facts: "작품 사실",
  relations: "관계",
};

/** 인터뷰가 실제로 무엇에 근거하는지의 읽기 모델 — 표면이 그대로 보여준다. */
export interface CharacterInterviewGrounding {
  readonly characterId: string;
  readonly characterName: string;
  /** 값이 있어 프롬프트 근거로 고정된 필드. */
  readonly sourcedFields: readonly InterviewGroundingField[];
  /** 시트 필드 중 비어 있는 것(사실·관계는 보조 근거라 missing에 넣지 않는다). */
  readonly missingFields: readonly InterviewGroundingField[];
  readonly signatureLines: readonly string[];
  readonly factLabels: readonly string[];
  readonly relationLabels: readonly string[];
  /** 성격·말투가 모두 고정됐을 때만 true — 인터뷰 시작 가능 조건. */
  readonly grounded: boolean;
  /** 시트 자체가 없거나 핵심(성격·배경·욕망)이 비어 있는 상태. */
  readonly needsProfile: boolean;
}

export interface CharacterInterviewCanon {
  /** character-chat 엔진에 그대로 넘기는 프로필 — 근거는 전부 캐논 시트다. */
  readonly profile: CharacterChatProfile;
  readonly grounding: CharacterInterviewGrounding;
}

const SHEET_FIELDS: readonly InterviewGroundingField[] = [
  "personality",
  "speechStyle",
  "background",
  "motivation",
  "signatureLines",
  "appearanceNotes",
];

function sheetFieldValue(
  profile: StudioStoryCharacterProfile | null,
  field: InterviewGroundingField,
): string {
  if (!profile) return "";
  switch (field) {
    case "personality":
      return profile.personality.trim();
    case "speechStyle":
      return profile.speechStyle.trim();
    case "background":
      return profile.background.trim();
    case "motivation":
      return profile.motivation.trim();
    case "appearanceNotes":
      return profile.appearanceNotes.trim();
    case "signatureLines":
      return profile.signatureLines.filter((line) => line.trim()).join("\n");
    default:
      return "";
  }
}

/**
 * 바이블 캐릭터 + 서술 시트로 인터뷰용 캐논을 조립한다.
 * 모르는 캐릭터면 null(지어내지 않는다). 시트가 없어도 캐논 객체는 만들되
 * grounded=false·needsProfile=true로 돌려 표면이 시트 쓰기를 안내하게 한다.
 */
export function buildCharacterInterviewCanon(
  bible: StudioStoryBible,
  narrative: StudioStoryBibleNarrative,
  characterId: string,
  options: {
    readonly workTitle?: string;
    readonly authorName?: string;
    readonly now?: string;
  } = {},
): CharacterInterviewCanon | null {
  const view = characterSheetView(bible, narrative, characterId);
  if (!view) return null;
  const { character, profile } = view;
  const nameById = new Map(bible.characters.map((entry) => [entry.id, entry.name]));

  const sourcedFields: InterviewGroundingField[] = [];
  const missingFields: InterviewGroundingField[] = [];
  for (const field of SHEET_FIELDS) {
    if (sheetFieldValue(profile, field)) sourcedFields.push(field);
    else missingFields.push(field);
  }

  const factLabels = bible.facts
    .filter((fact) => fact.characterIds.includes(characterId))
    .map((fact) => fact.label.trim())
    .filter(Boolean);
  if (factLabels.length > 0) sourcedFields.push("facts");

  const relationLabels: string[] = [];
  for (const rel of [...view.outgoing, ...view.incoming]) {
    const otherId = rel.fromCharacterId === characterId ? rel.toCharacterId : rel.fromCharacterId;
    const otherName = nameById.get(otherId) ?? otherId;
    const label = (rel.label || rel.kind).trim();
    if (label) relationLabels.push(`${otherName} — ${label}`);
  }
  if (relationLabels.length > 0) sourcedFields.push("relations");

  const signatureLines = (profile?.signatureLines ?? [])
    .map((line) => line.trim())
    .filter(Boolean);

  // 엔진 프로필 조립 — 값은 전부 시트·바이블에서만 온다.
  const personalityParts: string[] = [];
  if (profile?.personality.trim()) personalityParts.push(profile.personality.trim());
  if (profile?.motivation.trim()) personalityParts.push(`[욕망·목표]\n${profile.motivation.trim()}`);

  const worldviewParts: string[] = [];
  if (profile?.background.trim()) worldviewParts.push(profile.background.trim());
  if (signatureLines.length > 0) {
    worldviewParts.push(`[대표 대사 — 말투 표본]\n${signatureLines.join("\n")}`);
  }
  if (factLabels.length > 0) worldviewParts.push(`[작품 사실]\n${factLabels.join("\n")}`);
  if (relationLabels.length > 0) worldviewParts.push(`[관계]\n${relationLabels.join("\n")}`);

  const now = options.now ?? new Date().toISOString();
  const chatProfile: CharacterChatProfile = {
    id: `interview-${characterId}`,
    characterName: character.name,
    workTitle: (options.workTitle ?? "").trim(),
    workSlug: null,
    authorName: (options.authorName ?? "").trim(),
    description: "작가 인터뷰용 프로필 — 공개되지 않아요.",
    personality: personalityParts.join("\n\n"),
    speechStyle: profile?.speechStyle.trim() ?? "",
    worldview: worldviewParts.join("\n\n"),
    greeting: "",
    forbiddenTopics: [],
    appearanceHint: profile?.appearanceNotes.trim() ?? "",
    avatarUrl: null,
    canonSheetId: characterId,
    chatEnabled: false,
    isDemo: false,
    ownerId: null,
    createdAt: now,
    updatedAt: now,
  };

  const grounding: CharacterInterviewGrounding = {
    characterId,
    characterName: character.name,
    sourcedFields,
    missingFields,
    signatureLines,
    factLabels,
    relationLabels,
    grounded: Boolean(profile?.personality.trim() && profile?.speechStyle.trim()),
    needsProfile: view.needsProfile,
  };
  return { profile: chatProfile, grounding };
}

/** 인터뷰를 열 때 작가가 바로 눌러 볼 수 있는 검증 질문 — 고정된 근거가 있을 때만 해당 칩을 낸다. */
export function buildInterviewQuestionChips(
  canon: CharacterInterviewCanon,
): readonly string[] {
  const { grounding } = canon;
  const chips: string[] = ["자기소개를 네 말투로 해 줘."];
  if (grounding.sourcedFields.includes("motivation")) {
    chips.push("네가 제일 지키고 싶은 건 뭐야? 왜 그렇게까지 해?");
  }
  if (grounding.sourcedFields.includes("background")) {
    chips.push("과거 일 중에 아직도 마음에 걸리는 일을 말해 줘.");
  }
  if (grounding.signatureLines.length > 0) {
    chips.push("네 대표 대사처럼, 지금 심정을 한마디로 말해 줘.");
  }
  chips.push("화가 났을 때는 어떻게 말해? 실제로 한 번 보여 줘.");
  return chips;
}

// ── 설정 메모 ───────────────────────────────────────────────────────────

export const INTERVIEW_MEMO_KINDS = [
  "speech",
  "personality",
  "background",
  "motivation",
  "appearance",
  "free",
] as const;

export type InterviewMemoKind = (typeof INTERVIEW_MEMO_KINDS)[number];

export const INTERVIEW_MEMO_KIND_LABELS: Record<InterviewMemoKind, string> = {
  speech: "말투",
  personality: "성격",
  background: "배경",
  motivation: "욕망·목표",
  appearance: "외형",
  free: "자유 메모",
};

/** 메모 종류 → 시트 필드. free는 시트에 대응 필드가 없어 null(메모로만 남는다). */
const MEMO_KIND_TO_SHEET_FIELD: Record<
  InterviewMemoKind,
  keyof Pick<
    StudioStoryCharacterProfile,
    "personality" | "speechStyle" | "background" | "motivation" | "appearanceNotes"
  > | null
> = {
  speech: "speechStyle",
  personality: "personality",
  background: "background",
  motivation: "motivation",
  appearance: "appearanceNotes",
  free: null,
};

/** 대화에서 건진 설정 메모 한 건 — 원천 답변을 추적할 수 있게 메시지 ID를 남긴다. */
export interface CharacterInterviewMemo {
  readonly id: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly kind: InterviewMemoKind;
  /** 한 줄 제목 — 종류 + 캐릭터 이름으로 만든다(작가가 따로 쓰지 않아도 목록에서 읽힌다). */
  readonly title: string;
  /** 메모 본문 — 캐릭터 답변 원문(정규화·상한 적용). */
  readonly body: string;
  /** 이 답변을 끌어낸 작가 질문. 없으면 빈 문자열. */
  readonly questionText: string;
  readonly sourceAnswerId: string;
  readonly createdAt: string;
}

export const INTERVIEW_MEMO_BODY_MAX = 800;

function normalizeMemoText(value: string, max: number): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

/** 답변 메시지 앞의 가장 가까운 작가 질문과 짝을 찾는다. 답변 ID가 없거나 캐릭터 답변이 아니면 null. */
export function findInterviewExchange(
  messages: readonly CharacterInterviewMessage[],
  answerId: string,
): { readonly question: CharacterInterviewMessage | null; readonly answer: CharacterInterviewMessage } | null {
  const index = messages.findIndex((message) => message.id === answerId);
  if (index < 0) return null;
  const answer = messages[index];
  if (!answer || answer.role !== "character") return null;
  let question: CharacterInterviewMessage | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "author") {
      question = messages[i] ?? null;
      break;
    }
  }
  return { question, answer };
}

/**
 * 캐릭터 답변 한 건을 설정 메모로 만든다.
 * 답변이 비었거나 캐릭터 답변이 아니면 null — 빈 메모를 만들지 않는다.
 * id는 호출부가 줄 수 있고(테스트 결정성), 없으면 시각+메시지 ID로 만든다.
 */
export function buildInterviewMemo(input: {
  readonly characterId: string;
  readonly characterName: string;
  readonly kind: InterviewMemoKind;
  readonly answer: CharacterInterviewMessage;
  readonly question?: CharacterInterviewMessage | null;
  readonly now?: string;
  readonly id?: string;
}): CharacterInterviewMemo | null {
  if (input.answer.role !== "character") return null;
  const body = normalizeMemoText(input.answer.text, INTERVIEW_MEMO_BODY_MAX);
  if (!body) return null;
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? `memo-${input.answer.id}`,
    characterId: input.characterId,
    characterName: input.characterName,
    kind: input.kind,
    title: `${input.characterName} · ${INTERVIEW_MEMO_KIND_LABELS[input.kind]} 메모`,
    body,
    questionText: input.question
      ? normalizeMemoText(input.question.text, INTERVIEW_MEMO_BODY_MAX)
      : "",
    sourceAnswerId: input.answer.id,
    createdAt: now,
  };
}

/** 시트 필드 → 사람이 읽는 라벨. */
const SHEET_FIELD_LABELS: Record<
  NonNullable<(typeof MEMO_KIND_TO_SHEET_FIELD)[InterviewMemoKind]>,
  string
> = {
  speechStyle: "말투",
  personality: "성격",
  background: "배경 서사",
  motivation: "욕망·목표",
  appearanceNotes: "외형 메모",
};

export interface InterviewMemoSheetPatch {
  /** 덧붙일 시트 필드 이름. */
  readonly field: NonNullable<(typeof MEMO_KIND_TO_SHEET_FIELD)[InterviewMemoKind]>;
  readonly fieldLabel: string;
  /** 기존 값에 메모를 덧붙인 결과 — 호스트가 이 값으로 시트를 저장하면 반영된다. */
  readonly nextValue: string;
  /** 메모 내용이 이미 시트에 있으면 true — 이때 nextValue는 기존 값과 같다(중복 반영 방지). */
  readonly alreadyReflected: boolean;
}

/**
 * 메모를 시트에 반영하는 패치를 계산한다(적용은 하지 않는다).
 * free 종류거나 대응 필드가 없으면 null. 이미 같은 내용이 있으면
 * alreadyReflected=true로 돌려 중복 덧붙임을 막는다.
 */
export function interviewMemoSheetPatch(
  memo: CharacterInterviewMemo,
  profile: StudioStoryCharacterProfile | null,
): InterviewMemoSheetPatch | null {
  const field = MEMO_KIND_TO_SHEET_FIELD[memo.kind];
  if (!field) return null;
  const existing = (profile?.[field] ?? "").trim();
  const alreadyReflected = existing.includes(memo.body);
  return {
    field,
    fieldLabel: SHEET_FIELD_LABELS[field],
    nextValue: alreadyReflected || !existing ? (alreadyReflected ? existing : memo.body) : `${existing}\n${memo.body}`,
    alreadyReflected,
  };
}
