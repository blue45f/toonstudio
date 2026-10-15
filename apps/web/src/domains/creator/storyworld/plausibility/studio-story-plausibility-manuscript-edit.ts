/**
 * 원고 미리보기에서 작가가 고친 값을 해석하는 순수 함수.
 *
 * 초안 만들기(buildProjectFromManuscript)와 같은 규칙을 화면에도 쓰기 위해 한곳에 둔다:
 * 작가가 정한 값(override)이 있으면 그것이 최종이고, 없으면 추출기가 확정한 값만 쓴다.
 * 이름이 같은 사람이 여러 명 등록된 경우는 작가가 고르기 전까지 확정하지 않는다.
 */
import type {
  ManuscriptCharacterMatch,
  ManuscriptNameEntry,
  ManuscriptSceneDraft,
} from "./studio-story-manuscript-extractor";
import type { ManuscriptDraftOverride } from "./studio-story-manuscript-project";

/** 추출기가 하나로 확정한 인물(refId). 동명이인 후보가 둘 이상인 이름은 뺀다. */
export function autoParticipantRefs(draft: ManuscriptSceneDraft, register: readonly ManuscriptNameEntry[]): readonly string[] {
  const byId = new Map(register.map((entry) => [entry.id, entry]));
  const refs: string[] = [];
  for (const match of draft.characters) {
    if (match.candidateIds.length !== 1) continue;
    const entry = byId.get(match.candidateIds[0] ?? "");
    if (entry && !refs.includes(entry.refId)) refs.push(entry.refId);
  }
  return refs;
}

/** 지금 화면에 확정된 등장인물(refId). 작가가 정한 값이 있으면 그것이다. */
export function effectiveParticipantRefs(
  draft: ManuscriptSceneDraft,
  register: readonly ManuscriptNameEntry[],
  override: ManuscriptDraftOverride | undefined,
): readonly string[] {
  return override?.participantRefIds ?? autoParticipantRefs(draft, register);
}

/** 작가가 아직 고르지 않은 동명이인 이름. 작가가 등장인물을 직접 정했으면 더 묻지 않는다. */
export function unresolvedMatches(
  draft: ManuscriptSceneDraft,
  override: ManuscriptDraftOverride | undefined,
): readonly ManuscriptCharacterMatch[] {
  if (override?.participantRefIds !== undefined) return [];
  return draft.characters.filter((match) => match.candidateIds.length > 1);
}

/** 장소 이름. 작가가 정한 값(null이면 장소 없음)이 있으면 그것, 없으면 추출기가 확정한 장소다. */
export function effectiveLocationName(
  draft: ManuscriptSceneDraft,
  register: readonly ManuscriptNameEntry[],
  override: ManuscriptDraftOverride | undefined,
): string | null {
  if (override && "locationName" in override) return override.locationName ?? null;
  if (!draft.locationEntryId) return null;
  return register.find((entry) => entry.id === draft.locationEntryId)?.refId ?? null;
}

export const MANUSCRIPT_BOUNDARY_LABELS = {
  start: "글의 처음",
  "scene-number": "장면 번호 줄",
  separator: "구분선",
  "blank-lines": "빈 줄",
  heading: "제목 줄",
  manual: "직접 나눔",
} as const;
