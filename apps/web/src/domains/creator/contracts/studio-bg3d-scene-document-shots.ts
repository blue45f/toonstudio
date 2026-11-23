/**
 * Studio BG3D 씬 문서의 스토리보드 컷(Shot) 캡처·복제·삭제·이동·적용 순수 헬퍼.
 */
import {
  normalizeStudioBg3dDocumentText as normalizedText,
  withStudioBg3dHiddenTags,
} from "./studio-bg3d-hierarchy";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS,
  STUDIO_BG3D_SHOT_ID_MAX_LENGTH,
  STUDIO_BG3D_SHOT_NAME_MAX_LENGTH,
} from "./studio-bg3d-scene-document-constants";
import { normalizeDecodedCurrentDocument } from "./studio-bg3d-scene-document-core";
import { withoutActiveShot, withoutShotEnvironment } from "./studio-bg3d-scene-document-graph";
import {
  decodeBoundedJson,
  isRecord,
  jsonStructuresEqual,
  normalizedId,
} from "./studio-bg3d-scene-document-primitives";
import {
  normalizeBackground,
  normalizeCamera,
  normalizeLighting,
  normalizeOutput,
  normalizeRender,
} from "./studio-bg3d-scene-document-sections";

import type {
  StudioBg3dSceneDocument,
  StudioBg3dShot,
  StudioBg3dShotCreateRequest,
} from "../bg3d/studio-bg3d-scene-document-types";

function normalizeShotCreateRequest(value: unknown): StudioBg3dShotCreateRequest | null {
  const decoded = decodeBoundedJson(value);
  if (!isRecord(decoded)) return null;
  const id = normalizedId(decoded.id);
  const name = normalizedText(decoded.name, STUDIO_BG3D_SHOT_NAME_MAX_LENGTH, true);
  const normalized = id && id.length <= STUDIO_BG3D_SHOT_ID_MAX_LENGTH && name
    ? { id, name }
    : null;
  return normalized && jsonStructuresEqual(decoded, normalized) ? normalized : null;
}

function canonicalDocumentForShotHelper(raw: unknown): StudioBg3dSceneDocument | null {
  return normalizeDecodedCurrentDocument(decodeBoundedJson(raw), "strict");
}

/**
 * Captures the current camera, presentation, LT output, and every node's visibility as a new shot.
 * The source document is never mutated. A duplicate id, the 64-shot cap, or the document byte
 * ceiling returns null rather than discarding an existing shot or scene element.
 */
export function captureStudioBg3dShot(
  raw: unknown,
  request: StudioBg3dShotCreateRequest,
): StudioBg3dSceneDocument | null {
  const document = canonicalDocumentForShotHelper(raw);
  const normalizedRequest = normalizeShotCreateRequest(request);
  if (
    !document ||
    !normalizedRequest ||
    (document.shots?.length ?? 0) >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS ||
    document.shots?.some((shot) => shot.id === normalizedRequest.id)
  ) {
    return null;
  }

  // 컷은 문서 공통 캡처 비율을 소유하지 않는다(조명 environment 와 같은 이유): 넣으면 엄격 정규화가 컷 저장을 거부한다.
  const { exportAspectRatio: _documentWideRatio, ...shotOutput } = document.output;
  const shot: StudioBg3dShot = {
    ...normalizedRequest,
    camera: { ...document.camera },
    nodeVisibility: document.nodes.map(({ id: nodeId, visible }) => ({ nodeId, visible })),
    render: { ...document.render },
    background: { ...document.background },
    lighting: {
      ...withoutShotEnvironment(document.lighting),
      key: { ...document.lighting.key },
      fill: { ...document.lighting.fill },
    },
    output: { ...shotOutput, line: { ...shotOutput.line }, tone: { ...shotOutput.tone } },
    // 태그를 쓰는 장면의 컷은 숨긴 태그도 기억한다. 태그가 없는 장면의 컷은 예전과 바이트가 같다.
    ...(document.meta?.hiddenTags || document.nodes.some((node) => node.tags)
      ? { hiddenTags: [...(document.meta?.hiddenTags ?? [])] }
      : {}),
  };
  return canonicalDocumentForShotHelper({
    ...withoutActiveShot(document),
    shots: [...(document.shots ?? []), shot],
    activeShotId: shot.id,
  });
}

/** Creates an independent storyboard entry whose overrides initially match an existing shot. */
export function duplicateStudioBg3dShot(
  raw: unknown,
  sourceShotId: string,
  request: StudioBg3dShotCreateRequest,
): StudioBg3dSceneDocument | null {
  const document = canonicalDocumentForShotHelper(raw);
  const normalizedRequest = normalizeShotCreateRequest(request);
  const normalizedSourceShotId = normalizedId(sourceShotId);
  if (
    !document ||
    !normalizedRequest ||
    !normalizedSourceShotId ||
    normalizedSourceShotId !== sourceShotId ||
    (document.shots?.length ?? 0) >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS ||
    document.shots?.some((shot) => shot.id === normalizedRequest.id)
  ) {
    return null;
  }
  const source = document.shots?.find((shot) => shot.id === normalizedSourceShotId);
  if (!source) return null;
  const duplicate: StudioBg3dShot = {
    ...source,
    ...normalizedRequest,
  };
  return canonicalDocumentForShotHelper({
    ...withoutActiveShot(document),
    shots: [...(document.shots ?? []), duplicate],
    activeShotId: duplicate.id,
  });
}

/** Removes one storyboard entry; the immutable scene graph and every other shot stay untouched. */
export function removeStudioBg3dShot(
  raw: unknown,
  shotId: string,
): StudioBg3dSceneDocument | null {
  const document = canonicalDocumentForShotHelper(raw);
  const normalizedShotId = normalizedId(shotId);
  if (!document || !normalizedShotId || normalizedShotId !== shotId) return null;
  const shots = document.shots ?? [];
  if (!shots.some((shot) => shot.id === normalizedShotId)) return null;

  const remaining = shots.filter((shot) => shot.id !== normalizedShotId);
  const {
    shots: _discardedShots,
    activeShotId: _discardedActiveShotId,
    ...scene
  } = document;
  return canonicalDocumentForShotHelper({
    ...scene,
    ...(remaining.length > 0 ? { shots: remaining } : {}),
    ...(document.activeShotId && document.activeShotId !== normalizedShotId
      ? { activeShotId: document.activeShotId }
      : {}),
  });
}

/** Moves one shot to an exact bounded storyboard index without changing any shot payload. */
export function moveStudioBg3dShot(
  raw: unknown,
  shotId: string,
  targetIndex: number,
): StudioBg3dSceneDocument | null {
  const document = canonicalDocumentForShotHelper(raw);
  const normalizedShotId = normalizedId(shotId);
  if (
    !document ||
    !normalizedShotId ||
    normalizedShotId !== shotId ||
    !Number.isSafeInteger(targetIndex)
  ) {
    return null;
  }
  const shots = [...(document.shots ?? [])];
  const sourceIndex = shots.findIndex((shot) => shot.id === normalizedShotId);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= shots.length) return null;
  if (sourceIndex === targetIndex) return document;
  const [shot] = shots.splice(sourceIndex, 1);
  if (!shot) return null;
  shots.splice(targetIndex, 0, shot);
  return canonicalDocumentForShotHelper({ ...document, shots });
}

/** Applies one shot's partial overrides and marks it active without changing asset or geometry data. */
export function applyStudioBg3dShot(
  raw: unknown,
  shotId: string,
): StudioBg3dSceneDocument | null {
  const document = canonicalDocumentForShotHelper(raw);
  const normalizedShotId = normalizedId(shotId);
  if (!document || !normalizedShotId || normalizedShotId !== shotId) return null;
  const shot = document.shots?.find((candidate) => candidate.id === normalizedShotId);
  if (!shot) return null;

  const visibleByNodeId = new Map(
    shot.nodeVisibility?.map(({ nodeId, visible }) => [nodeId, visible] as const) ?? [],
  );
  const lighting = shot.lighting
    ? normalizeLighting({
        ...document.lighting,
        ...shot.lighting,
        key: shot.lighting.key
          ? { ...document.lighting.key, ...shot.lighting.key }
          : document.lighting.key,
        fill: shot.lighting.fill
          ? { ...document.lighting.fill, ...shot.lighting.fill }
          : document.lighting.fill,
        // 샷 단위 환경 전환은 이번 범위가 아니므로, 저장된 샷 값에 environment가
        // 섞여 있어도 문서 환경을 그대로 고정합니다(평면 객체라 스프레드 복제로 충분).
        environment: document.lighting.environment
          ? { ...document.lighting.environment }
          : undefined,
      })
    : document.lighting;
  const output = shot.output
    ? normalizeOutput({
        ...document.output,
        ...shot.output,
        line: shot.output.line
          ? { ...document.output.line, ...shot.output.line }
          : document.output.line,
        tone: shot.output.tone
          ? { ...document.output.tone, ...shot.output.tone }
          : document.output.tone,
      })
    : document.output;
  return canonicalDocumentForShotHelper({
    ...document,
    camera: shot.camera
      ? normalizeCamera({ ...document.camera, ...shot.camera })
      : document.camera,
    render: shot.render
      ? normalizeRender({ ...document.render, ...shot.render })
      : document.render,
    background: shot.background
      ? normalizeBackground({ ...document.background, ...shot.background })
      : document.background,
    lighting,
    output,
    nodes: document.nodes.map((node) => {
      const visible = visibleByNodeId.get(node.id);
      return visible === undefined ? node : { ...node, visible };
    }),
    // 컷이 숨긴 태그를 기억하면 그대로 되돌린다(없으면 지금의 태그 가시성을 건드리지 않는다).
    ...(shot.hiddenTags ? { meta: withStudioBg3dHiddenTags(document.meta, shot.hiddenTags) } : {}),
    activeShotId: shot.id,
  });
}
