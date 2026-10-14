/**
 * 서술형 캐릭터 시트 + 캐릭터 관계 레코드.
 *
 * 원칙:
 * - 기존 연속성 레코드(StudioStoryCharacter: id·name·aliases·defaultCostumeId·defaultAppearanceId)는
 *   한 필드도 바꾸지 않는다. 서술 정보는 characterId 로 붙는 별도 레코드에 둔다.
 * - 바이블 본체(StudioStoryBible)에 optional 컬렉션으로 붙으므로, 확장이 없는 기존 바이블도
 *   그대로 유효하고 연속성 엔진(analyzeStudioStoryContinuity)은 이 파일을 몰라도 된다.
 * - 관계는 fact(사실)의 characterIds 연결과 별개의 "명시 관계" 레코드다.
 *   관계도(그래프)는 1차에서 보기 전용으로, 간선 원천은 이 레코드 + fact 연결의 합집합이다.
 */
import type { StudioStoryBible, StudioStoryCharacter } from "../studio-story-bible";

/** 작가용 캐릭터 시트 — 연속성 검사가 아니라 "어떤 인물인가"를 적는 자리. 전부 자유 서술. */
export interface StudioStoryCharacterProfile {
  readonly characterId: string;
  /** 성격 — 한두 문장. 예: "겁이 많지만 책임감 하나로 버틴다." */
  readonly personality: string;
  /** 말투 — 어미·버릇말·금기 표현. 대사 일관성 검수 때 사람이 읽는 기준. */
  readonly speechStyle: string;
  /** 배경 서사 — 과거·상처·비밀처럼 이야기 안에서 작동하는 내력. */
  readonly background: string;
  /** 욕망·목표 — 회차 목표를 짤 때 끌어다 쓰는 동기의 정본. */
  readonly motivation: string;
  /** 대표 대사 — 말투의 표본이 되는 실제 대사 0~3개. */
  readonly signatureLines: readonly string[];
  /** 외형 메모 — 연속성 appearanceId(상태 추적용)와 별개의 서술형 메모. */
  readonly appearanceNotes: string;
}

export const STUDIO_CHARACTER_RELATION_KINDS = [
  "family",
  "friend",
  "rival",
  "lover",
  "mentor",
  "enemy",
  "colleague",
  "other",
] as const;

export type StudioCharacterRelationKind =
  (typeof STUDIO_CHARACTER_RELATION_KINDS)[number];

/** 명시 관계 레코드 — 방향이 있는 간선. label 은 작가 말로 적는 자유 라벨("짝사랑", "형·동생"). */
export interface StudioStoryCharacterRelation {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly kind: StudioCharacterRelationKind;
  readonly label: string;
  readonly note: string;
}

/** 바이블 확장 묶음 — StudioStoryBible 에 optional 로 합류시키는 형태. */
export interface StudioStoryBibleNarrative {
  readonly profiles: readonly StudioStoryCharacterProfile[];
  readonly relations: readonly StudioStoryCharacterRelation[];
}

export const EMPTY_STORY_BIBLE_NARRATIVE: StudioStoryBibleNarrative = Object.freeze({
  profiles: Object.freeze([]),
  relations: Object.freeze([]),
});

/** 시트 카드 한 장의 읽기 모델 — 캐릭터 본체 + 시트 + 나가는/들어오는 관계. */
export interface CharacterSheetView {
  readonly character: StudioStoryCharacter;
  readonly profile: StudioStoryCharacterProfile | null;
  readonly outgoing: readonly StudioStoryCharacterRelation[];
  readonly incoming: readonly StudioStoryCharacterRelation[];
  /** 시트가 비어 있으면 true — "시트 쓰기" 유도 표시용. */
  readonly needsProfile: boolean;
}

export function characterSheetView(
  bible: StudioStoryBible,
  narrative: StudioStoryBibleNarrative,
  characterId: string,
): CharacterSheetView | null {
  const character = bible.characters.find((entry) => entry.id === characterId);
  if (!character) return null;
  const profile = narrative.profiles.find((entry) => entry.characterId === characterId) ?? null;
  return Object.freeze({
    character,
    profile,
    outgoing: Object.freeze(narrative.relations.filter((rel) => rel.fromCharacterId === characterId)),
    incoming: Object.freeze(narrative.relations.filter((rel) => rel.toCharacterId === characterId)),
    needsProfile:
      profile === null
      || (!profile.personality.trim() && !profile.background.trim() && !profile.motivation.trim()),
  });
}

/** 캐릭터 시트 하나를 서술 묶음에 넣는다 — 같은 characterId 시트가 있으면 교체, 없으면 끝에 붙인다. */
export function upsertStoryCharacterProfile(
  narrative: StudioStoryBibleNarrative,
  profile: StudioStoryCharacterProfile,
): StudioStoryBibleNarrative {
  const exists = narrative.profiles.some((entry) => entry.characterId === profile.characterId);
  const profiles = exists
    ? narrative.profiles.map((entry) => (entry.characterId === profile.characterId ? profile : entry))
    : [...narrative.profiles, profile];
  return Object.freeze({
    profiles: Object.freeze(profiles),
    relations: narrative.relations,
  });
}

/** 관계 하나를 서술 묶음에 넣는다 — 같은 id 관계가 있으면 교체, 없으면 끝에 붙인다. */
export function upsertStoryCharacterRelation(
  narrative: StudioStoryBibleNarrative,
  relation: StudioStoryCharacterRelation,
): StudioStoryBibleNarrative {
  const exists = narrative.relations.some((entry) => entry.id === relation.id);
  const relations = exists
    ? narrative.relations.map((entry) => (entry.id === relation.id ? relation : entry))
    : [...narrative.relations, relation];
  return Object.freeze({
    profiles: narrative.profiles,
    relations: Object.freeze(relations),
  });
}

/** 관계도(보기 전용) 간선 — 명시 관계 + fact 의 characterIds 쌍을 한 목록으로. */
export interface CharacterGraphEdge {
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly label: string;
  readonly source: "relation" | "fact";
}

export function characterGraphEdges(
  bible: StudioStoryBible,
  narrative: StudioStoryBibleNarrative,
): readonly CharacterGraphEdge[] {
  const edges: CharacterGraphEdge[] = [];
  for (const rel of narrative.relations) {
    edges.push(Object.freeze({
      fromCharacterId: rel.fromCharacterId,
      toCharacterId: rel.toCharacterId,
      label: rel.label || rel.kind,
      source: "relation" as const,
    }));
  }
  for (const fact of bible.facts) {
    const ids = fact.characterIds;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const from = ids[i];
        const to = ids[j];
        if (!from || !to) continue;
        edges.push(Object.freeze({
          fromCharacterId: from,
          toCharacterId: to,
          label: fact.label,
          source: "fact" as const,
        }));
      }
    }
  }
  return Object.freeze(edges);
}

/**
 * 확장 검증 — 기존 validateStudioStoryBible 의 결과를 깨지 않게 별도 함수로 둔다.
 * 반환 형식은 StudioStoryBibleIssue 와 같은 모양(code·severity·message·affectedIds).
 */
export function validateStoryBibleNarrative(
  bible: StudioStoryBible,
  narrative: StudioStoryBibleNarrative,
): readonly { code: string; severity: "warning" | "error"; message: string; affectedIds: readonly string[] }[] {
  const issues: { code: string; severity: "warning" | "error"; message: string; affectedIds: readonly string[] }[] = [];
  const known = new Set(bible.characters.map((character) => character.id));
  const seenProfiles = new Set<string>();
  for (const profile of narrative.profiles) {
    if (!known.has(profile.characterId)) {
      issues.push({
        code: "profile-character-reference",
        severity: "error",
        message: "A character sheet references an unknown character.",
        affectedIds: [profile.characterId],
      });
    }
    if (seenProfiles.has(profile.characterId)) {
      issues.push({
        code: "profile-duplicate",
        severity: "error",
        message: "Each character can have only one narrative sheet.",
        affectedIds: [profile.characterId],
      });
    }
    seenProfiles.add(profile.characterId);
  }
  const relationIds = new Set<string>();
  for (const rel of narrative.relations) {
    if (!rel.id.trim() || relationIds.has(rel.id)) {
      issues.push({
        code: "relation-id",
        severity: "error",
        message: "Relation ids must be present and unique.",
        affectedIds: [rel.id],
      });
    }
    relationIds.add(rel.id);
    const unknown = [rel.fromCharacterId, rel.toCharacterId].filter((id) => !known.has(id));
    if (unknown.length > 0) {
      issues.push({
        code: "relation-character-reference",
        severity: "error",
        message: "A relation references an unknown character.",
        affectedIds: unknown,
      });
    }
    if (rel.fromCharacterId === rel.toCharacterId) {
      issues.push({
        code: "relation-self",
        severity: "warning",
        message: "A relation points to the same character.",
        affectedIds: [rel.fromCharacterId],
      });
    }
  }
  return Object.freeze(issues);
}

/**
 * 캐릭터 시트 인용 — 비트 작성(콘티)·대사 입력(식자) 표면이 소비하는 읽기 모델.
 *
 * 원칙:
 * - 인용은 "보여주기" 전용이다. 시트 원본을 복사·변형해 새 원천을 만들지 않고,
 *   trim 한 표시용 값만 돌려준다 (대사 단일 원천 원칙과 충돌하지 않게).
 * - 없는 캐릭터는 지어내지 않는다 — 모르는 id 는 null/제외로 정직하게 드러낸다.
 * - 시트가 비어 있어도 캐릭터 자체는 인용 대상이다: hasCitation=false 로 돌려줘
 *   표면이 "시트 쓰기" 유도를 표시할 수 있게 한다 (빈 인용을 있는 것처럼 보이지 않기).
 */
export interface CharacterSheetCitation {
  readonly characterId: string;
  readonly characterName: string;
  /** 말투 — 공백 정리된 표시용 문자열. 비어 있으면 "". */
  readonly speechStyle: string;
  /** 대표 대사 — 빈 줄을 뺀 표시용 목록. */
  readonly signatureLines: readonly string[];
  /** 외형 메모 — 공백 정리된 표시용 문자열. 비어 있으면 "". */
  readonly appearanceNotes: string;
  /** 인용할 내용(말투·대표 대사·외형 메모 중 하나라도)이 있으면 true. */
  readonly hasCitation: boolean;
}

export function characterSheetCitation(
  bible: StudioStoryBible,
  narrative: StudioStoryBibleNarrative,
  characterId: string,
): CharacterSheetCitation | null {
  const character = bible.characters.find((entry) => entry.id === characterId);
  if (!character) return null;
  const profile = narrative.profiles.find((entry) => entry.characterId === characterId) ?? null;
  const speechStyle = profile?.speechStyle.trim() ?? "";
  const signatureLines = Object.freeze(
    (profile?.signatureLines ?? []).map((line) => line.trim()).filter((line) => line.length > 0),
  );
  const appearanceNotes = profile?.appearanceNotes.trim() ?? "";
  return Object.freeze({
    characterId: character.id,
    characterName: character.name,
    speechStyle,
    signatureLines,
    appearanceNotes,
    hasCitation: speechStyle.length > 0 || signatureLines.length > 0 || appearanceNotes.length > 0,
  });
}

/**
 * 여러 캐릭터(예: 한 비트의 characterIds, 한 회차 비트 전체의 등장 캐릭터)를
 * 입력 순서대로·중복 없이 인용한다. 모르는 id 는 건너뛴다.
 */
export function characterSheetCitations(
  bible: StudioStoryBible,
  narrative: StudioStoryBibleNarrative,
  characterIds: readonly string[],
): readonly CharacterSheetCitation[] {
  const seen = new Set<string>();
  const citations: CharacterSheetCitation[] = [];
  for (const characterId of characterIds) {
    if (seen.has(characterId)) continue;
    seen.add(characterId);
    const citation = characterSheetCitation(bible, narrative, characterId);
    if (citation) citations.push(citation);
  }
  return Object.freeze(citations);
}
