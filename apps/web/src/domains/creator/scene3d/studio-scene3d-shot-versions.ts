import { parseStudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { parseCharacterDocumentV3, type CharacterDocumentV3 } from "../character-platform/document/character-document-v3";
import { hashStudioScene3dCutValue as hash } from "@toonstudio/contracts/studio-scene3d-cut-canonical";
import {
  parseStudioScene3dCutLinkedVrm,
  parseStudioScene3dCutSourceWithBg3dParser,
  parseStudioScene3dVersionedCutWithBg3dParser,
  validateStudioScene3dShotVersionCollectionWithBg3dParser,
  type StudioScene3dCutCorrection,
  type StudioScene3dCutLinkedVrm,
  type StudioScene3dCutPerformance,
  type StudioScene3dCutSource,
  type StudioScene3dShotVersionCollection,
  type StudioScene3dVersionedCut,
} from "../contracts/studio-scene3d-shot-version-validator";

import type { StudioScene3dCamera, StudioScene3dDocumentV1 } from "./studio-scene3d-document";

export {
  parseStudioScene3dCutLinkedVrm,
  type StudioScene3dCutCorrection,
  type StudioScene3dCutLinkedVrm,
  type StudioScene3dCutPerformance,
  type StudioScene3dCutSource,
  type StudioScene3dShotVersionCollection,
  type StudioScene3dVersionedCut,
};

function fail(message: string): never {
  throw new Error(`3D 컷: ${message}`);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function owned<T>(value: T): T {
  return freeze(structuredClone(value));
}

export function parseStudioScene3dCutSource(value: unknown): StudioScene3dCutSource {
  return parseStudioScene3dCutSourceWithBg3dParser(value, parseStudioBg3dSceneDocument);
}

function parseCut(value: unknown): StudioScene3dVersionedCut {
  return parseStudioScene3dVersionedCutWithBg3dParser(value, parseStudioBg3dSceneDocument);
}

export function validateStudioScene3dShotVersionCollection(value: unknown): StudioScene3dShotVersionCollection {
  return validateStudioScene3dShotVersionCollectionWithBg3dParser(value, parseStudioBg3dSceneDocument);
}

export function createStudioScene3dVersionedCut(input: StudioScene3dCutSource & {
  readonly id: string; readonly name: string; readonly corrections?: readonly StudioScene3dCutCorrection[];
}): StudioScene3dVersionedCut {
  const source = parseStudioScene3dCutSource(input);
  const camera = source.scene.cameras.find((entry) => entry.id === source.scene.activeCameraId);
  const performances = Object.fromEntries(source.scene.entities.flatMap((entity) => {
    if (entity.kind !== "character") return [];
    const character = source.characters[entity.characterDocumentId];
    return [[entity.id, { pose: character.pose, expression: character.expression }]];
  }));
  return parseCut({ id: input.id, name: input.name, revision: 0, status: "draft", source, sourceHash: hash(source), camera, performances, corrections: input.corrections ?? [] });
}

export function materializeStudioScene3dVersionedCut(input: StudioScene3dVersionedCut): {
  readonly scene: StudioScene3dDocumentV1;
  readonly charactersByEntityId: Readonly<Record<string, CharacterDocumentV3>>;
} {
  const cut = parseCut(input);
  const charactersByEntityId = Object.fromEntries(cut.source.scene.entities.flatMap((entity) => {
    if (entity.kind !== "character") return [];
    const character = cut.source.characters[entity.characterDocumentId];
    return [[entity.id, parseCharacterDocumentV3({ ...character, ...cut.performances[entity.id] })]];
  }));
  return owned({ scene: { ...cut.source.scene, cameras: [cut.camera], activeCameraId: cut.camera.id, shots: [] }, charactersByEntityId });
}

export function compareStudioScene3dCutSource(cut: StudioScene3dVersionedCut, input: StudioScene3dCutSource) {
  const current = parseCut(cut);
  const candidate = parseStudioScene3dCutSource(input);
  if (candidate.scene.documentId !== current.source.scene.documentId) fail("다른 장면의 원본으로 컷을 바꿀 수 없습니다.");
  const characterIds = new Set([...Object.keys(current.source.characters), ...Object.keys(candidate.characters)]);
  return owned({
    sceneChanged: hash(current.source.scene) !== hash(candidate.scene) || hash(current.source.legacyBg3d) !== hash(candidate.legacyBg3d)
      || hash(current.source.linkedVrm) !== hash(candidate.linkedVrm),
    changedCharacterIds: [...characterIds].filter((key) => hash(current.source.characters[key]) !== hash(candidate.characters[key])).sort(),
    sourceHash: hash(candidate),
  });
}

export function editStudioScene3dCutPerformance(cut: StudioScene3dVersionedCut, input: {
  readonly camera?: StudioScene3dCamera;
  readonly performances?: Readonly<Record<string, StudioScene3dCutPerformance>>;
}): StudioScene3dVersionedCut {
  parseCut(cut);
  const camera = input.camera ?? cut.camera;
  const performances = { ...cut.performances, ...input.performances };
  if (hash(camera) === hash(cut.camera) && hash(performances) === hash(cut.performances)) return cut;
  return parseCut({ ...cut, camera, performances, revision: cut.revision + 1, status: "needs-review", corrections: cut.corrections.map((entry) => entry.kind === "screen-space" ? { ...entry, status: "needs-review" } : entry) });
}

export function updateStudioScene3dCutSource(cut: StudioScene3dVersionedCut, input: StudioScene3dCutSource, selection: {
  readonly scene: boolean; readonly characterIds: readonly string[];
}): StudioScene3dVersionedCut {
  compareStudioScene3dCutSource(cut, input);
  const candidate = parseStudioScene3dCutSource(input);
  const selected = new Set(selection.characterIds);
  for (const key of selected) if (!candidate.characters[key]) fail("선택한 캐릭터 원본이 없습니다.");
  if (selection.scene && candidate.scene.revision < cut.source.scene.revision) fail("장면 원본 버전을 되돌릴 수 없습니다.");
  for (const key of selected) {
    const previous = cut.source.characters[key];
    const next = candidate.characters[key];
    if (previous && (next.revision < previous.revision || (next.revision === previous.revision && hash(next) !== hash(previous)))) fail("캐릭터 원본 버전이 이전이거나 같은 버전에 다른 내용이 있습니다.");
  }
  const characters = { ...cut.source.characters };
  for (const key of selected) characters[key] = candidate.characters[key];
  const baseScene = selection.scene ? candidate.scene : cut.source.scene;
  const entities = baseScene.entities.map((entity) => {
    if (entity.kind !== "character") return entity;
    const character = characters[entity.characterDocumentId];
    if (!character) fail("새 캐릭터 원본도 함께 선택해야 합니다.");
    return { ...entity, characterRevision: character.revision };
  });
  const assets = baseScene.assets.map((asset) => {
    const references = entities.filter((entry) => entry.kind !== "primitive" && entry.assetId === asset.id);
    const required = references.map((entity) => {
      if (entity.kind !== "character") return asset;
      const owner = selected.has(entity.characterDocumentId) ? candidate.scene : cut.source.scene;
      const sourceEntity = owner.entities.find((entry) => entry.id === entity.id && entry.kind === "character" && entry.characterDocumentId === entity.characterDocumentId);
      const pinnedAsset = sourceEntity?.kind === "character" ? owner.assets.find((entry) => entry.id === sourceEntity.assetId) : undefined;
      if (!pinnedAsset) fail("캐릭터의 고정된 원본 asset을 찾지 못했습니다.");
      return { ...pinnedAsset, id: asset.id };
    });
    if (new Set(required.map(hash)).size > 1) fail("공유 asset의 버전 선택이 충돌합니다. 원본 asset을 분리하거나 같은 버전을 함께 선택하세요.");
    return required[0] ?? asset;
  });
  const chosenStage = selection.scene ? candidate : cut.source;
  const source = parseStudioScene3dCutSource({ scene: { ...baseScene, entities, assets }, characters, legacyBg3d: chosenStage.legacyBg3d, linkedVrm: chosenStage.linkedVrm });
  if (hash(source) === cut.sourceHash) return cut;
  const performances = Object.fromEntries(entities.flatMap((entity) => {
    if (entity.kind !== "character") return [];
    const character = source.characters[entity.characterDocumentId];
    const previous = cut.source.scene.entities.find((entry) => entry.id === entity.id);
    const retained = previous?.kind === "character" && previous.characterDocumentId === entity.characterDocumentId
      ? cut.performances[entity.id] : undefined;
    return [[entity.id, retained ?? { pose: character.pose, expression: character.expression }]];
  }));
  return parseCut({ ...cut, source, sourceHash: hash(source), performances, revision: cut.revision + 1, status: "needs-review", corrections: cut.corrections.map((entry) => ({ ...entry, status: "needs-review" })) });
}

export function approveStudioScene3dVersionedCut(cut: StudioScene3dVersionedCut): StudioScene3dVersionedCut {
  return parseCut({ ...cut, revision: cut.revision + 1, status: "approved" });
}

/** 표면을 다시 부착한 결과 또는 화면 보정의 명시적 검토만 기록한다. 자동 재투영하지 않는다. */
export function reviewStudioScene3dCutCorrection(cut: StudioScene3dVersionedCut, correction: StudioScene3dCutCorrection): StudioScene3dVersionedCut {
  parseCut(cut);
  const previous = cut.corrections.find((entry) => entry.id === correction.id);
  if (!previous || previous.elementId !== correction.elementId || previous.kind !== correction.kind) fail("검토할 원본 보정을 찾지 못했습니다.");
  return parseCut({ ...cut, revision: cut.revision + 1, status: "needs-review", corrections: cut.corrections.map((entry) => entry.id === correction.id ? correction : entry) });
}
