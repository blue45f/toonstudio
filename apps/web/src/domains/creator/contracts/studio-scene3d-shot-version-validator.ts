/**
 * Parameterized Scene3D versioned-cut validator leaf.
 * Extracted from `scene3d/studio-scene3d-shot-versions.ts` so `bg3d/studio-bg3d-scene-document.ts`
 * and `bg3d/studio-bg3d-hierarchy.ts` can validate `pinnedVersionedCut` without a circular import
 * back through `scene3d/studio-scene3d-shot-versions.ts`.
 */

import { hashStudioScene3dCutValue as hash } from "@toonstudio/contracts/studio-scene3d-cut-canonical";

import { parseCharacterDocumentV3, type CharacterDocumentV3 } from "../character-platform/document/character-document-v3";
import { assertStudioScene3dDocument, type StudioScene3dCamera, type StudioScene3dDocumentV1 } from "@toonstudio/contracts/studio-scene3d-document";
import type { StudioShared3dCharacterSource } from "../studio-shared-3d-scene-bridge";
import { parseStudioShared3dCharacterStageTransform } from "../studio-shared-3d-scene-runtime";
import { parseStudioVrmSceneDocument, serializeStudioVrmSceneDocument, type StudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";

import type { StudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document-types";

export type StudioLegacyBg3dSceneDocumentParser = (raw: string) => StudioBg3dSceneDocument | null;

export interface StudioScene3dCutLinkedVrm {
  readonly version: 1;
  readonly documentScope: string;
  readonly characters: readonly {
    readonly elementId: string;
    readonly label: string;
    readonly stageTransform: StudioShared3dCharacterSource["stageTransform"];
    readonly vrmScene: StudioVrmSceneDocument;
  }[];
}

export function parseStudioScene3dCutLinkedVrm(raw: unknown): StudioScene3dCutLinkedVrm {
  const invalid = () => new Error("컷에 보관한 VRM 원본이나 무대 배치가 올바르지 않습니다.");
  if (!raw || typeof raw !== "object" || !("version" in raw) || raw.version !== 1
    || !("documentScope" in raw) || typeof raw.documentScope !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(raw.documentScope)
    || !("characters" in raw) || !Array.isArray(raw.characters) || !raw.characters.length || raw.characters.length > 12) throw invalid();
  const ids = new Set<string>();
  const characters = raw.characters.map((entry: unknown) => {
    if (!entry || typeof entry !== "object"
      || !("elementId" in entry) || typeof entry.elementId !== "string" || !/^[a-z0-9][a-z0-9._~-]{0,127}$/iu.test(entry.elementId)
      || /^(?:constructor|prototype|__proto__)$/iu.test(entry.elementId) || ids.has(entry.elementId)
      || !("label" in entry) || typeof entry.label !== "string" || !entry.label.trim() || Array.from(entry.label).length > 80
      || !("stageTransform" in entry) || !("vrmScene" in entry)) throw invalid();
    const stageTransform = parseStudioShared3dCharacterStageTransform(entry.stageTransform);
    const serialized = serializeStudioVrmSceneDocument(entry.vrmScene);
    const vrmScene = serialized && parseStudioVrmSceneDocument(serialized);
    if (!stageTransform || !vrmScene) throw invalid();
    ids.add(entry.elementId);
    return { elementId: entry.elementId, label: entry.label, stageTransform, vrmScene };
  });
  return { version: 1, documentScope: raw.documentScope, characters };
}

export interface StudioScene3dCutSource {
  readonly scene: StudioScene3dDocumentV1;
  readonly characters: Readonly<Record<string, CharacterDocumentV3>>;
  readonly legacyBg3d?: StudioBg3dSceneDocument;
  readonly linkedVrm?: StudioScene3dCutLinkedVrm;
}
export interface StudioScene3dCutPerformance {
  readonly pose: CharacterDocumentV3["pose"];
  readonly expression: CharacterDocumentV3["expression"];
}
export type StudioScene3dCutCorrection = {
  readonly id: string;
  readonly elementId: string;
  readonly status: "current" | "needs-review";
} & (
  | { readonly kind: "screen-space" }
  | { readonly kind: "surface-attached"; readonly entityId: string; readonly topologyRevision: string; readonly surfaceId: string }
);
export interface StudioScene3dVersionedCut {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly status: "draft" | "approved" | "needs-review";
  readonly source: StudioScene3dCutSource;
  readonly sourceHash: string;
  readonly camera: StudioScene3dCamera;
  readonly performances: Readonly<Record<string, StudioScene3dCutPerformance>>;
  readonly corrections: readonly StudioScene3dCutCorrection[];
}
export interface StudioScene3dShotVersionCollection {
  readonly version: 1;
  readonly cuts: readonly StudioScene3dVersionedCut[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === "string" && ID.test(value) && !FORBIDDEN.has(value);
}
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

export function parseStudioScene3dCutSourceWithBg3dParser(
  value: unknown,
  parseLegacyBg3d: StudioLegacyBg3dSceneDocumentParser,
): StudioScene3dCutSource {
  if (!record(value) || !record(value.characters)) fail("원본 문서가 없습니다.");
  assertStudioScene3dDocument(value.scene);
  const characters: Record<string, CharacterDocumentV3> = {};
  for (const entity of value.scene.entities) {
    if (entity.kind !== "character") continue;
    if (!id(entity.characterDocumentId)) fail("캐릭터 식별자가 올바르지 않습니다.");
    const character = parseCharacterDocumentV3(value.characters[entity.characterDocumentId]);
    if (character.documentId !== entity.characterDocumentId || character.revision !== entity.characterRevision) {
      fail("캐릭터 원본 버전이 장면 참조와 다릅니다.");
    }
    characters[character.documentId] = character;
  }
  let legacyBg3d: StudioBg3dSceneDocument | undefined;
  if (value.legacyBg3d !== undefined) {
    if (!record(value.legacyBg3d) || value.legacyBg3d.pinnedVersionedCut !== undefined) fail("컷 원본에 중첩된 컷 참조를 넣을 수 없습니다.");
    const parsed = parseLegacyBg3d(JSON.stringify(value.legacyBg3d));
    if (!parsed) fail("BG3D 원본을 복원할 수 없습니다.");
    legacyBg3d = parsed;
  }
  const linkedVrm = value.linkedVrm === undefined ? undefined : parseStudioScene3dCutLinkedVrm(value.linkedVrm);
  return owned({ scene: value.scene, characters, ...(legacyBg3d ? { legacyBg3d } : {}), ...(linkedVrm ? { linkedVrm } : {}) });
}

export function parseStudioScene3dVersionedCutWithBg3dParser(
  value: unknown,
  parseLegacyBg3d: StudioLegacyBg3dSceneDocumentParser,
): StudioScene3dVersionedCut {
  if (!record(value) || !id(value.id) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 160
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !["draft", "approved", "needs-review"].includes(String(value.status))) fail("컷 식별자·상태가 올바르지 않습니다.");
  const source = parseStudioScene3dCutSourceWithBg3dParser(value.source, parseLegacyBg3d);
  if (value.sourceHash !== hash(source)) fail("고정한 원본 해시가 저장 내용과 다릅니다.");
  // 카메라 검증은 Scene3D의 동일한 계약을 사용합니다.
  const cameraDocument = { ...source.scene, cameras: [value.camera], activeCameraId: record(value.camera) ? value.camera.id : null, shots: [] };
  assertStudioScene3dDocument(cameraDocument);
  const camera = cameraDocument.cameras[0];
  if (!camera || !record(value.performances)) fail("컷 카메라·연기 정보가 없습니다.");
  const performances: Record<string, StudioScene3dCutPerformance> = {};
  for (const [entityId, performance] of Object.entries(value.performances)) {
    const entity = source.scene.entities.find((entry) => entry.id === entityId && entry.kind === "character");
    if (!id(entityId) || !entity || entity.kind !== "character" || !record(performance)) fail("연기 대상 캐릭터가 없습니다.");
    const character = parseCharacterDocumentV3({ ...source.characters[entity.characterDocumentId], pose: performance.pose, expression: performance.expression });
    if (!record(performance.expression) || !record(performance.expression.weights)
      || !Object.values(performance.expression.weights).every((weight) => typeof weight === "number" && Number.isFinite(weight) && weight >= 0 && weight <= 1)) fail("표정 가중치가 올바르지 않습니다.");
    performances[entityId] = { pose: character.pose, expression: character.expression };
  }
  for (const entity of source.scene.entities) {
    if (entity.kind === "character" && !Object.hasOwn(performances, entity.id)) fail("캐릭터의 컷 연기 정보가 누락되었습니다.");
  }
  if (!Array.isArray(value.corrections) || value.corrections.length > 512) fail("보정 개수가 허용 범위를 벗어났습니다.");
  const corrections: StudioScene3dCutCorrection[] = value.corrections.map((entry: unknown) => {
    if (!record(entry) || !id(entry.id) || !id(entry.elementId) || (entry.status !== "current" && entry.status !== "needs-review")) fail("보정 참조가 올바르지 않습니다.");
    const common: Pick<StudioScene3dCutCorrection, "id" | "elementId" | "status"> = { id: entry.id, elementId: entry.elementId, status: entry.status };
    if (entry.kind === "screen-space") return { ...common, kind: "screen-space" };
    if (entry.kind !== "surface-attached" || !id(entry.entityId) || !id(entry.topologyRevision) || !id(entry.surfaceId)) fail("표면 부착 참조가 올바르지 않습니다.");
    const entity = source.scene.entities.find((candidate) => candidate.id === entry.entityId);
    if ((!entity || entity.kind !== "character") && entry.status === "current") fail("표면 보정 대상이 없습니다.");
    if (entity?.kind === "character" && source.characters[entity.characterDocumentId].topology.revision !== entry.topologyRevision && entry.status === "current") fail("표면 보정의 원본 버전을 재검토해야 합니다.");
    if (entity?.kind === "character" && !source.characters[entity.characterDocumentId].topology.stableSurfaceIds.includes(entry.surfaceId) && entry.status === "current") fail("원본에 없는 표면 보정은 다시 부착해야 합니다.");
    return { ...common, kind: "surface-attached", entityId: entry.entityId, topologyRevision: entry.topologyRevision, surfaceId: entry.surfaceId };
  });
  if (new Set(corrections.map((entry) => entry.id)).size !== corrections.length) fail("보정 식별자가 중복되었습니다.");
  if (value.status === "approved" && corrections.some((entry) => entry.status === "needs-review")) fail("보정 재검토를 마친 후 승인하세요.");
  const status = value.status;
  if (status !== "draft" && status !== "approved" && status !== "needs-review") fail("컷 상태가 올바르지 않습니다.");
  return owned({ id: value.id, name: value.name, revision: Number(value.revision), status, source, sourceHash: String(value.sourceHash), camera, performances, corrections });
}

export function validateStudioScene3dShotVersionCollectionWithBg3dParser(
  value: unknown,
  parseLegacyBg3d: StudioLegacyBg3dSceneDocumentParser,
): StudioScene3dShotVersionCollection {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.cuts) || value.cuts.length > 128) fail("컷 모음이 올바르지 않습니다.");
  const cuts = value.cuts.map((entry) => parseStudioScene3dVersionedCutWithBg3dParser(entry, parseLegacyBg3d));
  if (new Set(cuts.map((cut) => cut.id)).size !== cuts.length) fail("컷 식별자가 중복되었습니다.");
  return owned({ version: 1, cuts });
}
