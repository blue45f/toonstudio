/**
 * 공유 3D 장면에서 캐릭터 레이어의 정규화·식별자(sourceHash·modelRuntimeKey·stageTransform)만
 * 계산하는 경량 모듈. 옷장·소품·아바타 포지 호환성 투영(vrm/*)은 끌어오지 않는다.
 */
import { isEffectivelyHidden, type LayerGroup } from "./studio-layers";
import { sha256HexPortable } from "./studio-sha256";
import { studioShared3dCharacterWorldTransform } from "./studio-shared-3d-scene-runtime";
import {
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
  type StudioVrmSceneDocument,
} from "./vrm/studio-vrm-scene-document";

import type {
  StudioShared3dCharacterStageTransform,
  StudioShared3dElementSource,
  StudioShared3dSceneSession,
} from "./studio-shared-3d-scene-bridge";

export const STUDIO_SHARED_3D_MAX_CHARACTERS_CORE = 12;

export const EMPTY_STUDIO_SHARED_3D_SCENE_SESSION: StudioShared3dSceneSession = Object.freeze({
  kind: "toonstudio.shared-3d-scene-session" as const,
  version: 2 as const,
  authority: "background-stage-with-linked-character-sources" as const,
  characters: Object.freeze([]),
  omittedCharacterCount: 0,
});

export interface StudioShared3dCharacterIdentity {
  readonly elementId: string;
  readonly sourceHash: `sha256:${string}`;
  readonly modelRuntimeKey: string;
  readonly runtimeKey: string;
  readonly stageTransform: StudioShared3dCharacterStageTransform;
  readonly label: string;
  readonly scene: StudioVrmSceneDocument;
}

const SAFE_ELEMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const FORBIDDEN_IDS = new Set(["__proto__", "constructor", "prototype"]);
const TEXT_ENCODER = new TextEncoder();

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) return true;
  }
  return false;
}

function safeElementId(value: unknown): string | null {
  if (typeof value !== "string" || containsControlCharacter(value)) return null;
  if (!SAFE_ELEMENT_ID_PATTERN.test(value) || FORBIDDEN_IDS.has(value.toLowerCase())) return null;
  return value;
}

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string" || containsControlCharacter(value)) return fallback;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? Array.from(normalized).slice(0, 80).join("") : fallback;
}

function canonicalScene(scene: unknown): StudioVrmSceneDocument | null {
  const serialized = serializeStudioVrmSceneDocument(scene);
  return serialized ? parseStudioVrmSceneDocument(serialized) : null;
}

function sha256Text(value: string): `sha256:${string}` {
  return `sha256:${sha256HexPortable(TEXT_ENCODER.encode(value))}`;
}

export function resolveStudioShared3dCharacterIdentitiesFromElements(
  elements: readonly StudioShared3dElementSource[],
): readonly StudioShared3dCharacterIdentity[] {
  const seen = new Set<string>();
  const characters: StudioShared3dCharacterIdentity[] = [];
  for (const element of elements) {
    if (element.type !== "image" || !element.vrmScene) continue;
    const elementId = safeElementId(element.id);
    const scene = canonicalScene(element.vrmScene);
    if (!elementId || !scene || seen.has(elementId)) continue;
    seen.add(elementId);
    if (characters.length >= STUDIO_SHARED_3D_MAX_CHARACTERS_CORE) continue;
    const canonicalJson = serializeStudioVrmSceneDocument(scene);
    if (!canonicalJson) continue;
    const sourceHash = sha256Text(canonicalJson);
    const modelHash = sha256Text(JSON.stringify(scene.model));
    const sourceWorld = studioShared3dCharacterWorldTransform(scene);
    const stageTransform = Object.freeze({
      position: sourceWorld.position,
      rotationY: sourceWorld.rotation[1],
    });
    characters.push(Object.freeze({
      elementId,
      sourceHash,
      modelRuntimeKey: `${elementId}:${modelHash}`,
      runtimeKey: `${elementId}:${sourceHash}`,
      stageTransform,
      label: safeLabel(element.name || scene.model.name, scene.model.name || "3D 캐릭터"),
      scene,
    }));
  }
  return Object.freeze(characters);
}

export function resolveExactStudioShared3dCharacterIdentity(
  elements: readonly StudioShared3dElementSource[],
  elementId: string,
): StudioShared3dCharacterIdentity | null {
  const matches = elements.filter((element) => element.id === elementId);
  if (matches.length !== 1) return null;
  const resolved = resolveStudioShared3dCharacterIdentitiesFromElements(matches);
  return resolved.length === 1 && resolved[0]?.elementId === elementId
    ? resolved[0]
    : null;
}

export function selectStudioShared3dVisibleSceneElements<
  T extends StudioShared3dElementSource,
>(elements: readonly T[], groups: LayerGroup[]): readonly T[] {
  return elements.filter((element) => !isEffectivelyHidden(element, groups));
}
