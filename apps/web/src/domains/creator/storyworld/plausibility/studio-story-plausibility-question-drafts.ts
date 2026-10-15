/**
 * 질문지 폼의 작업용 초안.
 *
 * 화면의 폼은 문서에 이미 있는 값에서 시작하고(문서 → 초안), 작가가 저장을 누를 때만 문서에 쓴다
 * (초안 → 문서). 이 파일은 그 두 방향의 변환을 순수 함수로 담는다. 문서에 쓰는 일은 모두 질문지
 * 기록 함수(studio-story-plausibility-questions)가 하므로, 여기서는 폼 값을 그 함수의 입력으로 바꾸기만 한다.
 */
import type {
  StoryworldMotive,
  StoryworldProject,
  StoryworldScene,
  StoryworldSceneRole,
} from "../studio-storyworld-causality";
import {
  isToggleFact,
  setSceneCause,
  setSceneCoincidence,
  setSceneConsequence,
  setSceneInformation,
  setSceneMotives,
  setSceneRoles,
  type InformationRow,
} from "./studio-story-plausibility-questions";

/** 동기 질문 한 줄에 보여 줄 수 있는 인물 수의 상한(참여자가 없을 때 전체 인물에서 고른다). */
export const PLAUSIBILITY_MOTIVE_ROW_LIMIT = 12;

export function sceneById(project: StoryworldProject, sceneId: string): StoryworldScene | undefined {
  return project.scenes.find((scene) => scene.id === sceneId);
}

function orderedActive(project: StoryworldProject): readonly StoryworldScene[] {
  return project.scenes
    .filter((scene) => scene.disabled !== true)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** 이 장면보다 앞에 있는 사용 중인 장면. 원인·단서·정보 출처는 앞 장면에서만 고른다. */
export function earlierScenes(project: StoryworldProject, sceneId: string): readonly StoryworldScene[] {
  const ordered = orderedActive(project);
  const index = ordered.findIndex((scene) => scene.id === sceneId);
  return index < 0 ? [] : ordered.slice(0, index);
}

// ── 1. 장면 성격 ──────────────────────────────────────────────────────

export function rolesDraftFromScene(scene: StoryworldScene): readonly StoryworldSceneRole[] {
  return scene.plausibility?.roles ?? [];
}

export function applyRolesDraft(project: StoryworldProject, sceneId: string, roles: readonly StoryworldSceneRole[]): StoryworldProject {
  return setSceneRoles(project, sceneId, roles);
}

// ── 2. 동기 ───────────────────────────────────────────────────────────

export interface MotiveRowDraft {
  readonly characterId: string;
  /** 비어 있으면 아직 고르지 않은 줄이다. */
  readonly basis: StoryworldMotive["basis"] | "";
  readonly causeSceneId: string;
  readonly note: string;
}

export function motiveRowsFromScene(project: StoryworldProject, scene: StoryworldScene): readonly MotiveRowDraft[] {
  const known = new Set(project.characters.map((character) => character.id));
  const participants = (scene.participantIds ?? []).filter((id) => known.has(id));
  const recorded = scene.plausibility?.motives ?? [];
  const ids = [...new Set([
    ...participants,
    ...recorded.map((motive) => motive.characterId),
    ...(participants.length === 0 ? project.characters.map((character) => character.id) : []),
  ])].filter((id) => known.has(id)).slice(0, PLAUSIBILITY_MOTIVE_ROW_LIMIT);
  return ids.map((characterId) => {
    const motive = recorded.find((item) => item.characterId === characterId);
    return {
      characterId,
      basis: motive?.basis ?? "",
      causeSceneId: motive?.causeSceneId ?? "",
      note: motive?.note ?? "",
    };
  });
}

export function motiveRowsToMotives(rows: readonly MotiveRowDraft[]): readonly StoryworldMotive[] {
  const motives: StoryworldMotive[] = [];
  for (const row of rows) {
    if (row.basis === "") continue;
    motives.push({
      characterId: row.characterId,
      basis: row.basis,
      ...(row.basis === "event" && row.causeSceneId ? { causeSceneId: row.causeSceneId } : {}),
      ...(row.note.trim() ? { note: row.note.trim() } : {}),
    });
  }
  return motives;
}

export function applyMotiveRows(project: StoryworldProject, sceneId: string, rows: readonly MotiveRowDraft[]): StoryworldProject {
  return setSceneMotives(project, sceneId, motiveRowsToMotives(rows));
}

// ── 3. 원인 ───────────────────────────────────────────────────────────

export interface CauseDraft {
  readonly sceneIds: readonly string[];
  readonly factIds: readonly string[];
  /** 이 폼이 다루지 못하는 전제(값 비교가 '참'이 아닌 것)의 수. 설정 관리에서 고친다. */
  readonly otherPreconditionCount: number;
}

export function causeDraftFromScene(scene: StoryworldScene): CauseDraft {
  const preconditions = scene.preconditions ?? [];
  const simple = preconditions.filter((predicate) => (predicate.comparator ?? "equals") === "equals" && predicate.value === true);
  return {
    sceneIds: scene.dependsOnSceneIds ?? [],
    factIds: simple.map((predicate) => predicate.factId),
    otherPreconditionCount: preconditions.length - simple.length,
  };
}

export function applyCauseDraft(project: StoryworldProject, sceneId: string, draft: Pick<CauseDraft, "sceneIds" | "factIds">): StoryworldProject {
  return setSceneCause(project, sceneId, draft);
}

// ── 4. 정보 ───────────────────────────────────────────────────────────

export type InformationSourceKind = "initial" | "scene" | "here" | "unknown";

export interface InformationRowDraft {
  readonly characterId: string;
  readonly factId: string;
  readonly source: InformationSourceKind;
  /** source가 scene일 때 인물이 알게 된 앞 장면. */
  readonly sceneId: string;
}

export function informationRowsFromScene(project: StoryworldProject, scene: StoryworldScene): readonly InformationRowDraft[] {
  const earlier = earlierScenes(project, scene.id);
  const characterIds = new Set(project.characters.map((character) => character.id));
  const rows: InformationRowDraft[] = [];
  const seen = new Set<string>();
  const push = (row: InformationRowDraft) => {
    const key = `${row.characterId}\u0000${row.factId}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  for (const use of scene.knowledgeUses ?? []) {
    const character = project.characters.find((item) => item.id === use.characterId);
    if (character?.initialFactIds?.includes(use.factId)) {
      push({ characterId: use.characterId, factId: use.factId, source: "initial", sceneId: "" });
      continue;
    }
    const revealing = [...earlier].reverse().find((candidate) =>
      (candidate.reveals ?? []).some((reveal) => reveal.factId === use.factId && reveal.audiences.includes(use.characterId)));
    push(revealing
      ? { characterId: use.characterId, factId: use.factId, source: "scene", sceneId: revealing.id }
      : { characterId: use.characterId, factId: use.factId, source: "unknown", sceneId: "" });
  }
  for (const reveal of scene.reveals ?? []) {
    for (const audience of reveal.audiences) {
      if (characterIds.has(audience)) push({ characterId: audience, factId: reveal.factId, source: "here", sceneId: "" });
    }
  }
  return rows;
}

export function informationRowsToRows(rows: readonly InformationRowDraft[]): readonly InformationRow[] {
  const result: InformationRow[] = [];
  for (const row of rows) {
    if (!row.characterId || !row.factId) continue;
    if (row.source === "scene") {
      if (row.sceneId) result.push({ characterId: row.characterId, factId: row.factId, source: { kind: "scene", sceneId: row.sceneId } });
      else result.push({ characterId: row.characterId, factId: row.factId, source: { kind: "unknown" } });
    } else {
      result.push({ characterId: row.characterId, factId: row.factId, source: { kind: row.source } });
    }
  }
  return result;
}

export function applyInformationRows(project: StoryworldProject, sceneId: string, rows: readonly InformationRowDraft[]): StoryworldProject {
  return setSceneInformation(project, sceneId, informationRowsToRows(rows));
}

// ── 5. 우연·단서 ──────────────────────────────────────────────────────

export type CoincidenceChoice = "unset" | "not-coincidence" | "foreshadowed" | "none" | "unknown";

export interface CoincidenceDraft {
  readonly choice: CoincidenceChoice;
  readonly clueSceneIds: readonly string[];
}

export function coincidenceDraftFromScene(scene: StoryworldScene): CoincidenceDraft {
  const coincidence = scene.plausibility?.coincidence;
  if (coincidence) return { choice: coincidence.clue, clueSceneIds: coincidence.clueSceneIds ?? [] };
  if (scene.plausibility?.answers?.coincidence === "not-applicable") return { choice: "not-coincidence", clueSceneIds: [] };
  return { choice: "unset", clueSceneIds: [] };
}

/** 고른 답이 없으면 문서를 바꾸지 않는다(미답을 답한 것으로 만들지 않는다). */
export function applyCoincidenceDraft(project: StoryworldProject, sceneId: string, draft: CoincidenceDraft): StoryworldProject {
  switch (draft.choice) {
    case "unset":
      return project;
    case "not-coincidence":
      return setSceneCoincidence(project, sceneId, { kind: "not-coincidence" });
    case "foreshadowed":
      return setSceneCoincidence(project, sceneId, { kind: "clue", clue: "foreshadowed", clueSceneIds: draft.clueSceneIds });
    case "none":
      return setSceneCoincidence(project, sceneId, { kind: "clue", clue: "none", clueSceneIds: [] });
    case "unknown":
      return setSceneCoincidence(project, sceneId, { kind: "clue", clue: "unknown", clueSceneIds: [] });
  }
}

// ── 6. 결과 ───────────────────────────────────────────────────────────

export interface ConsequenceDraft {
  readonly established: readonly string[];
  readonly ended: readonly string[];
  readonly revealedToReader: readonly string[];
}

export function consequenceDraftFromScene(project: StoryworldProject, scene: StoryworldScene): ConsequenceDraft {
  const toggle = (factId: string) => isToggleFact(project, factId);
  const effects = scene.effects ?? [];
  return {
    established: effects.filter((effect) => effect.op === "set" && effect.value === true && toggle(effect.factId)).map((effect) => effect.factId),
    ended: effects.filter((effect) => effect.op === "set" && effect.value === false && toggle(effect.factId)).map((effect) => effect.factId),
    revealedToReader: (scene.reveals ?? []).filter((reveal) => reveal.audiences.includes("reader")).map((reveal) => reveal.factId),
  };
}

export function applyConsequenceDraft(project: StoryworldProject, sceneId: string, draft: ConsequenceDraft): StoryworldProject {
  return setSceneConsequence(project, sceneId, draft);
}

// ── 저장할 수 있는지 ──────────────────────────────────────────────────

/** 동기 폼: 한 줄도 고르지 않았으면 저장할 수 없다. 문제가 없으면 null. */
export function motiveFormIssue(rows: readonly MotiveRowDraft[]): string | null {
  return rows.some((row) => row.basis !== "") ? null : "한 명 이상 이유를 고르거나, 아래 ‘모르겠어요’를 눌러 주세요.";
}

/** 우연·단서 폼: 고르지 않았거나 단서 장면 없이 ‘단서 있음’을 고른 경우. 문제가 없으면 null. */
export function coincidenceFormIssue(draft: CoincidenceDraft): string | null {
  if (draft.choice === "unset") return "하나를 고르거나 아래 ‘모르겠어요’를 눌러 주세요.";
  if (draft.choice === "foreshadowed" && draft.clueSceneIds.length === 0) return "단서가 있는 앞 장면을 하나 이상 골라 주세요.";
  return null;
}

