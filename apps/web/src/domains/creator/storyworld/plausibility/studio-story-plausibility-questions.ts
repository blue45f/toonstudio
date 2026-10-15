/**
 * 개연성 질문지: 장면마다 다섯 가지를 묻고, 답을 문서에 기록하는 순수 함수들.
 *
 * 질문
 * 1. 장면 성격   이 장면은 인물이 중요한 선택을 하는 장면인가, 문제가 풀리는 장면인가, 회상인가?
 * 2. 동기       인물은 왜 그렇게 행동했나?
 * 3. 원인       이 장면은 무엇 때문에 일어났나?
 * 4. 정보       인물이 아는 사실을 어떻게 알았나?
 * 5. 우연·단서   우연이라면 앞에 단서가 있었나?
 * 6. 결과       그래서 무엇이 달라졌나?
 *
 * 저장 규칙: 답은 가능한 한 기존 필드(선행 장면, 전제, 효과, 지식 사용, 공개, 복선 계약)에 기록해서
 * 인과 엔진이 그대로 쓰게 한다. 기존 필드에 없는 값(장면 성격, 동기, 우연의 단서 여부, 답 상태)만
 * `scene.plausibility`에 둔다. 답하지 않은 칸은 건드리지 않으므로 "점검 불가"로 남는다.
 *
 * 모든 함수는 원본을 바꾸지 않고 새 프로젝트를 돌려준다. 바뀐 것이 없으면 같은 객체를 돌려준다.
 */
import type {
  StoryworldAnswerState,
  StoryworldCoincidence,
  StoryworldMotive,
  StoryworldProject,
  StoryworldQuestionId,
  StoryworldScene,
  StoryworldSceneRole,
} from "../studio-storyworld-causality";
import {
  PLAUSIBILITY_QUESTION_IDS,
  plausibilityQuestionStatus,
  type PlausibilityQuestionStatus,
} from "./studio-story-plausibility-status";

export interface PlausibilityQuestionDefinition {
  readonly id: StoryworldQuestionId;
  readonly label: string;
  readonly prompt: string;
  readonly help: string;
}

export const PLAUSIBILITY_QUESTIONS: readonly PlausibilityQuestionDefinition[] = Object.freeze([
  {
    id: "roles",
    label: "장면 성격",
    prompt: "이 장면은 어떤 장면인가요?",
    help: "중요한 선택을 하는 장면이면 동기를, 문제가 풀리는 장면이면 준비된 단서를, 회상이면 시간 점검 예외를 확인합니다.",
  },
  {
    id: "motive",
    label: "동기",
    prompt: "인물은 왜 그렇게 행동했나요?",
    help: "바라는 것, 앞선 사건, 감정 중 무엇에서 나온 행동인지 고릅니다. 아직 모르면 '모름'으로 두세요.",
  },
  {
    id: "cause",
    label: "원인",
    prompt: "이 장면은 무엇 때문에 일어났나요?",
    help: "원인이 된 앞 장면이나 이미 성립한 일을 고릅니다.",
  },
  {
    id: "information",
    label: "정보",
    prompt: "인물이 아는 사실을 어떻게 알았나요?",
    help: "이 장면에서 인물이 알고 행동하는 사실마다, 처음부터 알았는지 앞 장면에서 알게 됐는지 정합니다.",
  },
  {
    id: "coincidence",
    label: "우연·단서",
    prompt: "우연에 기대는 장면인가요? 그렇다면 앞에 단서가 있었나요?",
    help: "독자가 미리 볼 수 있었던 단서가 있으면 그 장면을 고릅니다.",
  },
  {
    id: "consequence",
    label: "결과",
    prompt: "이 장면 뒤에 무엇이 달라지나요?",
    help: "새로 성립하거나 사라지는 일, 독자에게 새로 알려지는 일을 고릅니다.",
  },
]);

export const PLAUSIBILITY_ROLE_LABELS: Readonly<Record<StoryworldSceneRole, string>> = Object.freeze({
  decision: "인물이 중요한 선택을 하는 장면",
  resolution: "문제가 풀리는 장면",
  flashback: "과거를 보여 주는 회상 장면",
});

export const PLAUSIBILITY_ROLE_ORDER: readonly StoryworldSceneRole[] = Object.freeze(["decision", "resolution", "flashback"]);

// ── 진행 상태 ─────────────────────────────────────────────────────────

export interface PlausibilitySceneProgress {
  readonly sceneId: string;
  readonly statuses: Readonly<Record<StoryworldQuestionId, PlausibilityQuestionStatus>>;
  /** 답을 남긴 질문 수(미답이 아닌 것). 모름·건너뜀도 답으로 센다. */
  readonly handled: number;
  readonly total: number;
  readonly complete: boolean;
}

export interface PlausibilityQuestionnaireProgress {
  readonly scenes: readonly PlausibilitySceneProgress[];
  readonly completeScenes: number;
  readonly totalScenes: number;
  readonly percent: number;
  /** 아직 끝내지 못한 첫 장면. 모두 끝났으면 null. */
  readonly nextSceneId: string | null;
}

function orderedActiveScenes(project: StoryworldProject): readonly StoryworldScene[] {
  return project.scenes
    .filter((scene) => scene.disabled !== true)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function plausibilitySceneProgress(scene: StoryworldScene): PlausibilitySceneProgress {
  const statuses = {} as Record<StoryworldQuestionId, PlausibilityQuestionStatus>;
  let handled = 0;
  for (const question of PLAUSIBILITY_QUESTION_IDS) {
    const status = plausibilityQuestionStatus(scene, question);
    statuses[question] = status;
    if (status !== "unanswered") handled += 1;
  }
  const total = PLAUSIBILITY_QUESTION_IDS.length;
  return { sceneId: scene.id, statuses, handled, total, complete: handled === total };
}

export function plausibilityQuestionnaireProgress(project: StoryworldProject): PlausibilityQuestionnaireProgress {
  const scenes = orderedActiveScenes(project).map(plausibilitySceneProgress);
  const completeScenes = scenes.filter((scene) => scene.complete).length;
  return {
    scenes,
    completeScenes,
    totalScenes: scenes.length,
    percent: scenes.length === 0 ? 0 : Math.round((completeScenes / scenes.length) * 100),
    nextSceneId: scenes.find((scene) => !scene.complete)?.sceneId ?? null,
  };
}

// ── 문서 갱신 도우미 ──────────────────────────────────────────────────

/** 값이 undefined인 키를 지운다. undefined 키가 남으면 같은 내용의 문서가 다른 지문을 갖게 된다. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function mapScene(
  project: StoryworldProject,
  sceneId: string,
  update: (scene: StoryworldScene) => StoryworldScene,
): StoryworldProject {
  let changed = false;
  const scenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    const next = update(scene);
    if (next !== scene) changed = true;
    return next === scene ? scene : compact(next);
  });
  return changed ? { ...project, scenes } : project;
}

type PlausibilityPatch = Partial<NonNullable<StoryworldScene["plausibility"]>>;

function withPlausibility(
  scene: StoryworldScene,
  patch: PlausibilityPatch,
  answer?: { readonly question: StoryworldQuestionId; readonly state: StoryworldAnswerState },
): StoryworldScene {
  const current = scene.plausibility ?? {};
  const answers = answer ? { ...current.answers, [answer.question]: answer.state } : current.answers;
  return {
    ...scene,
    plausibility: compact({ ...current, ...patch, answers }),
  };
}

function withoutCoincidence(scene: StoryworldScene): StoryworldScene {
  const current = scene.plausibility;
  if (!current?.coincidence) return scene;
  return { ...scene, plausibility: compact({ ...current, coincidence: undefined }) };
}

function earlierSceneIds(project: StoryworldProject, sceneId: string): ReadonlySet<string> {
  const ordered = orderedActiveScenes(project);
  const index = ordered.findIndex((scene) => scene.id === sceneId);
  return new Set(index < 0 ? [] : ordered.slice(0, index).map((scene) => scene.id));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

// ── 1. 장면 성격 ──────────────────────────────────────────────────────

export function setSceneRoles(
  project: StoryworldProject,
  sceneId: string,
  roles: readonly StoryworldSceneRole[],
): StoryworldProject {
  const cleaned = PLAUSIBILITY_ROLE_ORDER.filter((role) => roles.includes(role));
  return mapScene(project, sceneId, (scene) => {
    const current = scene.plausibility?.roles;
    const same = current !== undefined
      && current.length === cleaned.length
      && current.every((role, index) => role === cleaned[index])
      && scene.plausibility?.answers?.roles === "answered";
    return same ? scene : withPlausibility(scene, { roles: cleaned }, { question: "roles", state: "answered" });
  });
}

// ── 2. 동기 ───────────────────────────────────────────────────────────

export function setSceneMotives(
  project: StoryworldProject,
  sceneId: string,
  motives: readonly StoryworldMotive[],
): StoryworldProject {
  const characterIds = new Set(project.characters.map((character) => character.id));
  const earlier = earlierSceneIds(project, sceneId);
  const seen = new Set<string>();
  const cleaned: StoryworldMotive[] = [];
  for (const motive of motives) {
    if (!characterIds.has(motive.characterId) || seen.has(motive.characterId)) continue;
    seen.add(motive.characterId);
    const note = motive.note?.trim();
    cleaned.push({
      characterId: motive.characterId,
      basis: motive.basis,
      ...(motive.basis === "event" && motive.causeSceneId && motive.causeSceneId !== sceneId ? { causeSceneId: motive.causeSceneId } : {}),
      ...(note ? { note: note.slice(0, 500) } : {}),
    });
  }
  const state: StoryworldAnswerState = cleaned.length > 0 && cleaned.every((motive) => motive.basis === "unknown")
    ? "unknown"
    : "answered";
  return mapScene(project, sceneId, (scene) => {
    // 동기가 된 앞 장면은 원인으로도 이어 준다(뒤에 있는 장면은 이어 주지 않고 탐지기가 알린다).
    const causeIds = cleaned
      .map((motive) => motive.causeSceneId)
      .filter((id): id is string => id !== undefined && earlier.has(id));
    const dependsOn = unique([...(scene.dependsOnSceneIds ?? []), ...causeIds]);
    const withCause: StoryworldScene = dependsOn.length === (scene.dependsOnSceneIds ?? []).length
      ? scene
      : { ...scene, dependsOnSceneIds: dependsOn };
    return withPlausibility(withCause, { motives: cleaned }, { question: "motive", state });
  });
}

// ── 3. 원인 ───────────────────────────────────────────────────────────

export interface SceneCauseAnswer {
  readonly sceneIds: readonly string[];
  readonly factIds: readonly string[];
}

export function setSceneCause(
  project: StoryworldProject,
  sceneId: string,
  answer: SceneCauseAnswer,
): StoryworldProject {
  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const factIds = new Set(project.facts.map((fact) => fact.id));
  const causeScenes = unique(answer.sceneIds.filter((id) => id !== sceneId && sceneIds.has(id)));
  const causeFacts = unique(answer.factIds.filter((id) => factIds.has(id)));
  return mapScene(project, sceneId, (scene) => {
    // 폼이 다루는 사실의 전제만 다시 만들고, 사실이 아닌 참조(끊어진 id)는 남겨 엔진이 계속 알리게 한다.
    const keptPredicates = (scene.preconditions ?? []).filter((predicate) => !factIds.has(predicate.factId) || causeFacts.includes(predicate.factId));
    const known = new Set(keptPredicates.map((predicate) => predicate.factId));
    const added = causeFacts
      .filter((factId) => !known.has(factId))
      .map((factId) => ({ factId, comparator: "equals" as const, value: true }));
    const preconditions = [...keptPredicates, ...added];
    const next: StoryworldScene = {
      ...scene,
      dependsOnSceneIds: causeScenes.length > 0 ? causeScenes : undefined,
      preconditions: preconditions.length > 0 ? preconditions : undefined,
    };
    return withPlausibility(next, {}, { question: "cause", state: "answered" });
  });
}

// ── 4. 정보 ───────────────────────────────────────────────────────────

export type InformationSource =
  | { readonly kind: "initial" }
  | { readonly kind: "scene"; readonly sceneId: string }
  | { readonly kind: "here" }
  | { readonly kind: "unknown" };

export interface InformationRow {
  readonly characterId: string;
  readonly factId: string;
  readonly source: InformationSource;
}

type Reveals = NonNullable<StoryworldScene["reveals"]>;

function addAudience(reveals: Reveals, factId: string, audience: string): Reveals {
  const existing = reveals.find((reveal) => reveal.factId === factId);
  if (!existing) return [...reveals, { factId, audiences: [audience] }];
  if (existing.audiences.includes(audience)) return reveals;
  return reveals.map((reveal) => reveal === existing ? { ...reveal, audiences: [...reveal.audiences, audience] } : reveal);
}

/**
 * 이 장면에서 인물이 쓰는 지식 목록을 폼 행 기준으로 다시 정하고, 알게 된 경로를 기존 필드에 기록한다.
 * - 처음부터 알았다: 인물의 처음 아는 사실에 추가
 * - 앞 장면에서 알게 됐다: 그 장면의 공개(reveals) 대상에 인물 추가
 * - 이 장면에서 알게 된다: 이 장면의 공개 대상에 인물 추가(지식 사용으로 세지 않음)
 * - 모르겠다: 지식 사용만 남겨 엔진이 "알 수 없는 사실 사용"으로 계속 알리게 한다
 */
export function setSceneInformation(
  project: StoryworldProject,
  sceneId: string,
  rows: readonly InformationRow[],
): StoryworldProject {
  const characterIds = new Set(project.characters.map((character) => character.id));
  const factIds = new Set(project.facts.map((fact) => fact.id));
  const earlier = earlierSceneIds(project, sceneId);
  const keys = new Set<string>();
  const valid = rows.filter((row) => {
    if (!characterIds.has(row.characterId) || !factIds.has(row.factId)) return false;
    const key = `${row.characterId}\u0000${row.factId}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });

  let next = project;
  for (const row of valid) {
    if (row.source.kind === "initial") {
      next = {
        ...next,
        characters: next.characters.map((character) => character.id === row.characterId
          ? { ...character, initialFactIds: unique([...(character.initialFactIds ?? []), row.factId]) }
          : character),
      };
    } else if (row.source.kind === "scene" && earlier.has(row.source.sceneId)) {
      next = mapScene(next, row.source.sceneId, (scene) => ({
        ...scene,
        reveals: addAudience(scene.reveals ?? [], row.factId, row.characterId),
      }));
    }
  }
  return mapScene(next, sceneId, (scene) => {
    const dangling = (scene.knowledgeUses ?? []).filter((use) => !characterIds.has(use.characterId) || !factIds.has(use.factId));
    const uses = valid
      .filter((row) => row.source.kind !== "here")
      .map((row) => (scene.knowledgeUses ?? []).find((use) => use.characterId === row.characterId && use.factId === row.factId)
        ?? { characterId: row.characterId, factId: row.factId });
    let reveals: Reveals = scene.reveals ?? [];
    for (const row of valid) if (row.source.kind === "here") reveals = addAudience(reveals, row.factId, row.characterId);
    const knowledgeUses = [...dangling, ...uses];
    const updated: StoryworldScene = {
      ...scene,
      knowledgeUses: knowledgeUses.length > 0 ? knowledgeUses : undefined,
      reveals: reveals.length > 0 ? reveals : undefined,
    };
    return withPlausibility(updated, {}, { question: "information", state: "answered" });
  });
}

// ── 5. 우연·단서 ──────────────────────────────────────────────────────

export type CoincidenceAnswer =
  | { readonly kind: "not-coincidence" }
  | { readonly kind: "clue"; readonly clue: StoryworldCoincidence["clue"]; readonly clueSceneIds: readonly string[] };

const clueContractId = (sceneId: string) => `clue:${sceneId}`;

function removeClueContract(project: StoryworldProject, sceneId: string): StoryworldProject {
  const id = clueContractId(sceneId);
  const hasContract = (project.setupContracts ?? []).some((contract) => contract.id === id);
  const touchesScene = project.scenes.some((scene) => scene.setupIds?.includes(id) || scene.payoffIds?.includes(id));
  if (!hasContract && !touchesScene) return project;
  const setupContracts = (project.setupContracts ?? []).filter((contract) => contract.id !== id);
  return compact({
    ...project,
    setupContracts: setupContracts.length > 0 ? setupContracts : undefined,
    scenes: project.scenes.map((scene) => {
      if (!scene.setupIds?.includes(id) && !scene.payoffIds?.includes(id)) return scene;
      const setupIds = (scene.setupIds ?? []).filter((value) => value !== id);
      const payoffIds = (scene.payoffIds ?? []).filter((value) => value !== id);
      return compact({
        ...scene,
        setupIds: setupIds.length > 0 ? setupIds : undefined,
        payoffIds: payoffIds.length > 0 ? payoffIds : undefined,
      });
    }),
  });
}

/**
 * 우연·단서 답. 앞에 단서가 있다고 답하면 단서 장면에 복선 설치, 이 장면에 회수를 기록하는
 * 복선 계약(`clue:<장면 id>`)을 만들어 엔진의 복선 규칙이 순서를 계속 지켜보게 한다.
 */
export function setSceneCoincidence(
  project: StoryworldProject,
  sceneId: string,
  answer: CoincidenceAnswer,
): StoryworldProject {
  const base = removeClueContract(project, sceneId);
  const target = base.scenes.find((scene) => scene.id === sceneId);
  if (!target) return project;
  if (answer.kind === "not-coincidence") {
    return mapScene(base, sceneId, (scene) =>
      withPlausibility(withoutCoincidence(scene), {}, { question: "coincidence", state: "not-applicable" }));
  }
  const knownSceneIds = new Set(base.scenes.map((scene) => scene.id));
  const clueSceneIds = answer.clue === "foreshadowed"
    ? unique(answer.clueSceneIds.filter((id) => id !== sceneId && knownSceneIds.has(id)))
    : [];
  const coincidence: StoryworldCoincidence = {
    clue: answer.clue,
    ...(clueSceneIds.length > 0 ? { clueSceneIds } : {}),
  };
  let next = mapScene(base, sceneId, (scene) => withPlausibility(
    scene,
    { coincidence },
    { question: "coincidence", state: answer.clue === "unknown" ? "unknown" : "answered" },
  ));
  if (answer.clue === "foreshadowed" && clueSceneIds.length > 0) {
    const id = clueContractId(sceneId);
    next = {
      ...next,
      setupContracts: [...(next.setupContracts ?? []), { id, label: `‘${target.title}’의 단서` }],
      scenes: next.scenes.map((scene) => {
        if (scene.id === sceneId) return { ...scene, payoffIds: unique([...(scene.payoffIds ?? []), id]) };
        if (clueSceneIds.includes(scene.id)) return { ...scene, setupIds: unique([...(scene.setupIds ?? []), id]) };
        return scene;
      }),
    };
  }
  return next;
}

// ── 6. 결과 ───────────────────────────────────────────────────────────

export interface ConsequenceAnswer {
  /** 이 장면 뒤에 성립하는 사실(참으로 설정). */
  readonly established: readonly string[];
  /** 이 장면 뒤에 사라지는 사실(거짓으로 설정). */
  readonly ended: readonly string[];
  /** 이 장면에서 독자에게 새로 알려지는 사실. */
  readonly revealedToReader: readonly string[];
}

/** 질문지가 다루는 사실: 처음 값이 참/거짓이거나 아직 없는 사실. 숫자·문자 사실은 설정 파일에서 고친다. */
export function isToggleFact(project: StoryworldProject, factId: string): boolean {
  const fact = project.facts.find((candidate) => candidate.id === factId);
  if (!fact) return false;
  return !("initialValue" in fact) || typeof fact.initialValue === "boolean" || fact.initialValue === undefined;
}

export function setSceneConsequence(
  project: StoryworldProject,
  sceneId: string,
  answer: ConsequenceAnswer,
): StoryworldProject {
  const toggleFacts = new Set(project.facts.filter((fact) => isToggleFact(project, fact.id)).map((fact) => fact.id));
  const established = unique(answer.established.filter((id) => toggleFacts.has(id)));
  const ended = unique(answer.ended.filter((id) => toggleFacts.has(id) && !established.includes(id)));
  const revealed = unique(answer.revealedToReader.filter((id) => project.facts.some((fact) => fact.id === id)));
  return mapScene(project, sceneId, (scene) => {
    const effects = [
      ...(scene.effects ?? []).filter((effect) => !toggleFacts.has(effect.factId)),
      ...established.map((factId) => ({ factId, op: "set" as const, value: true })),
      ...ended.map((factId) => ({ factId, op: "set" as const, value: false })),
    ];
    // 독자 공개만 이 폼이 다룬다. 인물에게 알려지는 공개는 그대로 둔다.
    const withoutReader: Reveals = (scene.reveals ?? [])
      .map((reveal) => ({ ...reveal, audiences: reveal.audiences.filter((audience) => audience !== "reader") }))
      .filter((reveal) => reveal.audiences.length > 0);
    let reveals: Reveals = withoutReader;
    for (const factId of revealed) reveals = addAudience(reveals, factId, "reader");
    const updated: StoryworldScene = {
      ...scene,
      effects: effects.length > 0 ? effects : undefined,
      reveals: reveals.length > 0 ? reveals : undefined,
    };
    return withPlausibility(updated, {}, { question: "consequence", state: "answered" });
  });
}

// ── 공통: 해당 없음·모름·건너뜀 ────────────────────────────────────────

/** 질문 하나의 답 상태만 기록한다(구조 필드는 건드리지 않는다). */
export function markQuestion(
  project: StoryworldProject,
  sceneId: string,
  question: StoryworldQuestionId,
  state: StoryworldAnswerState,
): StoryworldProject {
  return mapScene(project, sceneId, (scene) =>
    scene.plausibility?.answers?.[question] === state ? scene : withPlausibility(scene, {}, { question, state }));
}

/** 아직 답하지 않은 질문을 모두 "건너뜀"으로 표시한다. 이미 답한 질문은 그대로 둔다. */
export function skipScene(project: StoryworldProject, sceneId: string): StoryworldProject {
  return mapScene(project, sceneId, (scene) => {
    let next = scene;
    for (const question of PLAUSIBILITY_QUESTION_IDS) {
      if (plausibilityQuestionStatus(next, question) === "unanswered") {
        next = withPlausibility(next, {}, { question, state: "skipped" });
      }
    }
    return next;
  });
}
