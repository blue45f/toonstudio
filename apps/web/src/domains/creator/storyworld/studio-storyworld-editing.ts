/**
 * 스토리월드 설정 관리 편집 연산.
 *
 * 원본 데이터(JSON) 탭만 있던 요소 편집을 구조화 폼이 쓸 수 있게 순수 함수로 분리한다.
 * 모든 연산은 원본 프로젝트를 변형하지 않고 새 프로젝트를 반환하며, 식별자·참조 무결성은
 * 분석 엔진이 아니라 이 층이 지킨다 (삭제 시 참조 정리, 생성 시 id 유일성).
 *
 * 설명·태그 같은 자유 서술 필드는 분석 입력이 아니다. 엔진은 선언된 구조 필드만 계산한다.
 */
import type {
  StoryworldCharacter,
  StoryworldCharacterMotionProfile,
  StoryworldFactDefinition,
  StoryworldProject,
  StoryworldScene,
} from "./studio-storyworld-causality";

export type StoryworldEditableKind = "character" | "fact" | "scene";

export interface StoryworldCharacterPatch {
  readonly name?: string;
  readonly aliases?: readonly string[];
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly goal?: string;
  readonly initialFactIds?: readonly string[];
  readonly secretFactIds?: readonly string[];
  readonly motion?: StoryworldCharacterMotionProfile | null;
}

export interface StoryworldFactPatch {
  readonly label?: string;
  readonly description?: string;
  readonly subjectId?: string;
  readonly key?: string;
  readonly tags?: readonly string[];
  readonly canonical?: boolean;
}

export interface StoryworldScenePatch {
  readonly title?: string;
  readonly description?: string;
  readonly order?: number;
  readonly timeIndex?: number | null;
  readonly locationId?: string | null;
  readonly participantIds?: readonly string[];
  readonly dependsOnSceneIds?: readonly string[];
  readonly disabled?: boolean;
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanList(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined) return undefined;
  const cleaned = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  return cleaned.length > 0 ? cleaned : undefined;
}

/** 쉼표·줄바꿈으로 구분한 태그 입력 문자열을 정규화된 태그 목록으로 바꾼다. */
export function parseStoryworldTagInput(text: string): readonly string[] {
  return cleanList(text.split(/[,\n]/)) ?? [];
}

function cleanMotion(
  motion: StoryworldCharacterMotionProfile | null | undefined,
): StoryworldCharacterMotionProfile | undefined {
  if (motion === null || motion === undefined) return undefined;
  const cleaned: StoryworldCharacterMotionProfile = {
    reveal: cleanText(motion.reveal),
    emphasis: cleanText(motion.emphasis),
    expressionNotes: cleanText(motion.expressionNotes),
    voiceNote: cleanText(motion.voiceNote),
  };
  return Object.values(cleaned).some((value) => value !== undefined) ? cleaned : undefined;
}

export function updateStoryworldCharacter(
  project: StoryworldProject,
  characterId: string,
  patch: StoryworldCharacterPatch,
): StoryworldProject {
  if (!project.characters.some((character) => character.id === characterId)) return project;
  const factIds = new Set(project.facts.map((fact) => fact.id));
  const onlyKnownFacts = (ids: readonly string[] | undefined) =>
    ids === undefined ? undefined : ids.filter((id) => factIds.has(id));
  return {
    ...project,
    characters: project.characters.map((character) => {
      if (character.id !== characterId) return character;
      const next: StoryworldCharacter = {
        ...character,
        name: patch.name !== undefined ? patch.name.trim() || character.name : character.name,
        aliases: patch.aliases !== undefined ? cleanList(patch.aliases) : character.aliases,
        description: patch.description !== undefined ? cleanText(patch.description) : character.description,
        tags: patch.tags !== undefined ? cleanList(patch.tags) : character.tags,
        goal: patch.goal !== undefined ? cleanText(patch.goal) : character.goal,
        initialFactIds: patch.initialFactIds !== undefined
          ? cleanList(onlyKnownFacts(patch.initialFactIds))
          : character.initialFactIds,
        secretFactIds: patch.secretFactIds !== undefined
          ? cleanList(onlyKnownFacts(patch.secretFactIds))
          : character.secretFactIds,
        motion: patch.motion !== undefined ? cleanMotion(patch.motion) : character.motion,
      };
      return next;
    }),
  };
}

export function updateStoryworldFact(
  project: StoryworldProject,
  factId: string,
  patch: StoryworldFactPatch,
): StoryworldProject {
  if (!project.facts.some((fact) => fact.id === factId)) return project;
  return {
    ...project,
    facts: project.facts.map((fact) => {
      if (fact.id !== factId) return fact;
      const next: StoryworldFactDefinition = {
        ...fact,
        label: patch.label !== undefined ? patch.label.trim() || fact.label : fact.label,
        description: patch.description !== undefined ? cleanText(patch.description) : fact.description,
        subjectId: patch.subjectId !== undefined ? patch.subjectId.trim() || fact.subjectId : fact.subjectId,
        key: patch.key !== undefined ? patch.key.trim() || fact.key : fact.key,
        tags: patch.tags !== undefined ? cleanList(patch.tags) : fact.tags,
        canonical: patch.canonical !== undefined ? patch.canonical : fact.canonical,
      };
      return next;
    }),
  };
}

export function updateStoryworldScene(
  project: StoryworldProject,
  sceneId: string,
  patch: StoryworldScenePatch,
): StoryworldProject {
  if (!project.scenes.some((scene) => scene.id === sceneId)) return project;
  const characterIds = new Set(project.characters.map((character) => character.id));
  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  return {
    ...project,
    scenes: project.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const next: StoryworldScene = {
        ...scene,
        title: patch.title !== undefined ? patch.title.trim() || scene.title : scene.title,
        description: patch.description !== undefined ? cleanText(patch.description) : scene.description,
        order: patch.order !== undefined && Number.isFinite(patch.order) ? patch.order : scene.order,
        timeIndex: patch.timeIndex !== undefined
          ? (patch.timeIndex === null ? undefined : patch.timeIndex)
          : scene.timeIndex,
        locationId: patch.locationId !== undefined
          ? (cleanText(patch.locationId ?? undefined) ?? undefined)
          : scene.locationId,
        participantIds: patch.participantIds !== undefined
          ? cleanList(patch.participantIds.filter((id) => characterIds.has(id)))
          : scene.participantIds,
        dependsOnSceneIds: patch.dependsOnSceneIds !== undefined
          ? cleanList(patch.dependsOnSceneIds.filter((id) => sceneIds.has(id) && id !== sceneId))
          : scene.dependsOnSceneIds,
        disabled: patch.disabled !== undefined ? patch.disabled : scene.disabled,
      };
      return next;
    }),
  };
}

function nextElementId(kind: StoryworldEditableKind, existing: ReadonlySet<string>): string {
  let index = 1;
  while (existing.has(`${kind}-${index}`)) index += 1;
  return `${kind}-${index}`;
}

export function addStoryworldCharacter(
  project: StoryworldProject,
  name: string,
): { readonly project: StoryworldProject; readonly id: string } {
  const id = nextElementId("character", new Set(project.characters.map((character) => character.id)));
  const character: StoryworldCharacter = { id, name: name.trim() || "새 캐릭터" };
  return { project: { ...project, characters: [...project.characters, character] }, id };
}

export function addStoryworldFact(
  project: StoryworldProject,
  label: string,
): { readonly project: StoryworldProject; readonly id: string } {
  const id = nextElementId("fact", new Set(project.facts.map((fact) => fact.id)));
  const subjectId = project.characters[0]?.id ?? "world";
  const fact: StoryworldFactDefinition = { id, label: label.trim() || "새 사실", subjectId, key: id };
  return { project: { ...project, facts: [...project.facts, fact] }, id };
}

export function addStoryworldScene(
  project: StoryworldProject,
  title: string,
): { readonly project: StoryworldProject; readonly id: string } {
  const id = nextElementId("scene", new Set(project.scenes.map((scene) => scene.id)));
  const order = project.scenes.reduce((max, scene) => Math.max(max, scene.order), 0) + 10;
  const scene: StoryworldScene = { id, title: title.trim() || "새 장면", order };
  return { project: { ...project, scenes: [...project.scenes, scene] }, id };
}

/**
 * 캐릭터를 지우고 그 캐릭터를 가리키던 장면 참조(참여자·지식 사용·감정 비트·공개 대상·담당자)를
 * 함께 정리한다. 사실의 subjectId는 세계 주체일 수도 있어 건드리지 않는다 — 끊긴 주체는
 * 보드·검사가 그대로 드러낸다.
 */
export function removeStoryworldCharacter(
  project: StoryworldProject,
  characterId: string,
): StoryworldProject {
  if (!project.characters.some((character) => character.id === characterId)) return project;
  return {
    ...project,
    characters: project.characters.filter((character) => character.id !== characterId),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      participantIds: scene.participantIds?.filter((id) => id !== characterId),
      knowledgeUses: scene.knowledgeUses?.filter((use) => use.characterId !== characterId),
      emotionalBeats: scene.emotionalBeats?.filter((beat) => beat.characterId !== characterId),
      reveals: scene.reveals?.map((reveal) => ({
        ...reveal,
        audiences: reveal.audiences.filter((audience) => audience !== characterId),
      })).filter((reveal) => reveal.audiences.length > 0),
      production: scene.production
        ? { ...scene.production, assigneeIds: scene.production.assigneeIds?.filter((id) => id !== characterId) }
        : scene.production,
    })),
  };
}

/** 사실을 지우고 전제·효과·지식 사용·공개·인물 지식 목록에서 그 사실 참조를 정리한다. */
export function removeStoryworldFact(
  project: StoryworldProject,
  factId: string,
): StoryworldProject {
  if (!project.facts.some((fact) => fact.id === factId)) return project;
  return {
    ...project,
    facts: project.facts.filter((fact) => fact.id !== factId),
    characters: project.characters.map((character) => ({
      ...character,
      initialFactIds: character.initialFactIds?.filter((id) => id !== factId),
      secretFactIds: character.secretFactIds?.filter((id) => id !== factId),
    })),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      preconditions: scene.preconditions?.filter((predicate) => predicate.factId !== factId),
      effects: scene.effects?.filter((mutation) => mutation.factId !== factId),
      knowledgeUses: scene.knowledgeUses?.filter((use) => use.factId !== factId),
      reveals: scene.reveals?.filter((reveal) => reveal.factId !== factId),
    })),
  };
}

/** 장면을 지우고 다른 장면의 선행 의존에서 그 장면을 정리한다. */
export function removeStoryworldScene(
  project: StoryworldProject,
  sceneId: string,
): StoryworldProject {
  if (!project.scenes.some((scene) => scene.id === sceneId)) return project;
  return {
    ...project,
    scenes: project.scenes
      .filter((scene) => scene.id !== sceneId)
      .map((scene) => ({
        ...scene,
        dependsOnSceneIds: scene.dependsOnSceneIds?.filter((id) => id !== sceneId),
      })),
  };
}
