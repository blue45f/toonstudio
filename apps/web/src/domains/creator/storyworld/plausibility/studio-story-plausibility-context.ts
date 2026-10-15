/**
 * 개연성 리포트를 만들 때 모든 탐지기 어댑터가 공유하는 조회 맥락.
 *
 * 인물 이름·사실 라벨·장면 제목을 한곳에서 찾고, 발견(finding)을 만드는 팩토리를 제공한다.
 * 팩토리는 id를 입력에서 도출하고(같은 입력 → 같은 id), 근거 수와 글자 수에 상한을 둔다.
 */
import {
  fingerprintStoryworldValue,
  type StoryworldCharacter,
  type StoryworldFactDefinition,
  type StoryworldProject,
  type StoryworldQuestionId,
  type StoryworldScene,
} from "../studio-storyworld-causality";
import type {
  PlausibilityCategoryId,
  PlausibilityConfidence,
  PlausibilityEvidence,
  PlausibilityFinding,
  PlausibilityOptionAction,
  PlausibilityResolutionOption,
  PlausibilitySource,
} from "./studio-story-plausibility-types";

export const PLAUSIBILITY_MAX_EVIDENCE = 8;
export const PLAUSIBILITY_MAX_LABEL_LENGTH = 80;
export const PLAUSIBILITY_MAX_TEXT_LENGTH = 320;

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

export function compareScenes(a: StoryworldScene, b: StoryworldScene): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

export interface PlausibilityContext {
  readonly project: StoryworldProject;
  /** 사용 중(disabled가 아닌) 장면. 순서(order)와 id로 정렬되어 있다. */
  readonly activeScenes: readonly StoryworldScene[];
  readonly scene: (id: string) => StoryworldScene | undefined;
  readonly fact: (id: string) => StoryworldFactDefinition | undefined;
  readonly character: (id: string) => StoryworldCharacter | undefined;
  /** 사용 중 장면 안에서의 위치(0부터). 사용 중이 아니면 -1. */
  readonly indexOf: (sceneId: string) => number;
  sceneTitle(id: string): string;
  factLabel(id: string): string;
  characterName(id: string): string;
  setupLabel(id: string): string;
  locationName(id: string): string;
  sceneEvidence(id: string, detail?: string): PlausibilityEvidence;
  factEvidence(id: string, detail?: string): PlausibilityEvidence;
  characterEvidence(id: string, detail?: string): PlausibilityEvidence;
  /** 장면 id들을 중복 없이 장면 순서대로 정렬한다. 모르는 id는 맨 뒤에 id순으로 둔다. */
  sortSceneIds(ids: readonly string[]): readonly string[];
}

export function createPlausibilityContext(project: StoryworldProject): PlausibilityContext {
  const scenesById = new Map(project.scenes.map((scene) => [scene.id, scene]));
  const factsById = new Map(project.facts.map((fact) => [fact.id, fact]));
  const charactersById = new Map(project.characters.map((character) => [character.id, character]));
  const setupLabels = new Map((project.setupContracts ?? []).map((contract) => [contract.id, contract.label]));
  const activeScenes = project.scenes.filter((scene) => scene.disabled !== true).sort(compareScenes);
  const indexById = new Map(activeScenes.map((scene, index) => [scene.id, index]));
  const sceneRank = new Map([...project.scenes].sort(compareScenes).map((scene, index) => [scene.id, index]));

  const context: PlausibilityContext = {
    project,
    activeScenes,
    scene: (id) => scenesById.get(id),
    fact: (id) => factsById.get(id),
    character: (id) => charactersById.get(id),
    indexOf: (sceneId) => indexById.get(sceneId) ?? -1,
    sceneTitle: (id) => scenesById.get(id)?.title ?? id,
    factLabel: (id) => factsById.get(id)?.label ?? id,
    characterName: (id) => charactersById.get(id)?.name ?? id,
    setupLabel: (id) => setupLabels.get(id) ?? id,
    locationName: (id) => id,
    sceneEvidence: (id, detail) => {
      const scene = scenesById.get(id);
      const base = {
        kind: "scene" as const,
        id,
        label: clip(scene ? scene.title : id, PLAUSIBILITY_MAX_LABEL_LENGTH),
        sceneId: id,
      };
      const text = detail ?? (scene ? `순서 ${scene.order}` : undefined);
      return text === undefined ? base : { ...base, detail: clip(text, PLAUSIBILITY_MAX_TEXT_LENGTH) };
    },
    factEvidence: (id, detail) => {
      const base = { kind: "fact" as const, id, label: clip(factsById.get(id)?.label ?? id, PLAUSIBILITY_MAX_LABEL_LENGTH) };
      return detail === undefined ? base : { ...base, detail: clip(detail, PLAUSIBILITY_MAX_TEXT_LENGTH) };
    },
    characterEvidence: (id, detail) => {
      const base = { kind: "character" as const, id, label: clip(charactersById.get(id)?.name ?? id, PLAUSIBILITY_MAX_LABEL_LENGTH) };
      return detail === undefined ? base : { ...base, detail: clip(detail, PLAUSIBILITY_MAX_TEXT_LENGTH) };
    },
    sortSceneIds: (ids) => {
      const unique = [...new Set(ids)];
      return unique.sort((a, b) => {
        const rankA = sceneRank.get(a);
        const rankB = sceneRank.get(b);
        if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
        if (rankA !== undefined) return -1;
        if (rankB !== undefined) return 1;
        return a.localeCompare(b);
      });
    },
  };
  return context;
}

type SeverityConfidence =
  | { readonly severity: "error"; readonly confidence: "certain" }
  | { readonly severity: "warning" | "suggestion"; readonly confidence: PlausibilityConfidence };

export type PlausibilityFindingSpec = SeverityConfidence & {
  readonly source: PlausibilitySource;
  /** id를 만드는 재료. 같은 재료면 같은 id가 된다. */
  readonly idParts: readonly (string | number | undefined)[];
  readonly category: PlausibilityCategoryId;
  readonly title: string;
  readonly message: string;
  readonly question: string;
  readonly evidence: readonly PlausibilityEvidence[];
  readonly options: readonly PlausibilityResolutionOption[];
  readonly sceneIds: readonly string[];
  /** 처리 기록의 열쇠. 기존 이슈에서 온 것은 원래 이슈 id를 넘긴다. */
  readonly dispositionKey?: string;
};

export function createPlausibilityFinding(
  ctx: PlausibilityContext,
  spec: PlausibilityFindingSpec,
): PlausibilityFinding {
  const id = `pl:${spec.source.module}:${spec.source.code}:${fingerprintStoryworldValue(spec.idParts)}`;
  const sceneIds = ctx.sortSceneIds(spec.sceneIds);
  const firstScene = sceneIds.map((sceneId) => ctx.scene(sceneId)).find((scene) => scene !== undefined);
  const evidence = spec.evidence.slice(0, PLAUSIBILITY_MAX_EVIDENCE);
  return {
    id,
    dispositionKey: spec.dispositionKey ?? id,
    source: spec.source,
    category: spec.category,
    severity: spec.severity,
    confidence: spec.confidence,
    title: clip(spec.title, PLAUSIBILITY_MAX_LABEL_LENGTH),
    message: clip(spec.message, PLAUSIBILITY_MAX_TEXT_LENGTH * 2),
    question: clip(spec.question, PLAUSIBILITY_MAX_TEXT_LENGTH),
    evidence,
    options: spec.options,
    sceneIds,
    sortOrder: firstScene ? firstScene.order : Number.MAX_SAFE_INTEGER,
  };
}

// ── 해결 선택지 빌더: 어떤 것도 문서를 바꾸지 않는다 ──────────────────────

function option(id: string, label: string, description: string, action: PlausibilityOptionAction): PlausibilityResolutionOption {
  return { id, label, description, action };
}

export function optionAnswerQuestion(
  sceneId: string,
  question: StoryworldQuestionId,
  label: string,
  description: string,
): PlausibilityResolutionOption {
  return option(`questionnaire:${question}:${sceneId}`, label, description, {
    kind: "open-questionnaire",
    sceneId,
    question,
  });
}

export function optionOpenSettings(
  target: "scene" | "fact" | "character",
  id: string,
  label: string,
  description: string,
): PlausibilityResolutionOption {
  return option(`settings:${target}:${id}`, label, description, { kind: "open-settings", target, id });
}

export function optionCopyAdvice(id: string, label: string, text: string): PlausibilityResolutionOption {
  return option(`copy:${id}`, label, "클립보드에 복사해 직접 적용할 수 있는 안내문입니다. 문서는 바뀌지 않습니다.", {
    kind: "copy",
    text,
  });
}

export function optionInfo(id: string, label: string, description: string): PlausibilityResolutionOption {
  return option(`info:${id}`, label, description, { kind: "info" });
}

