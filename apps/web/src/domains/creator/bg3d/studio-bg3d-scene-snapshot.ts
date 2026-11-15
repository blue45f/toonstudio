import {
  cloneBgCustomModelInstances,
  type BgCustomModelInstance,
} from "../studio-background-3d-model";
import {
  clonePrimitives,
  type BgPrimitive,
} from "../studio-background-3d-primitives";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dBackgroundSettings,
  type StudioBg3dCameraSettings,
  type StudioBg3dLightingSettings,
  type StudioBg3dModelAttachment,
  type StudioBg3dRenderSettings,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

export const STUDIO_BG3D_SCENE_SNAPSHOT_MAX = 16;

export interface StudioBg3dSceneStateSummaryInput {
  readonly camera: StudioBg3dCameraSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly background: StudioBg3dBackgroundSettings;
  readonly render: StudioBg3dRenderSettings;
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
}

export interface StudioBg3dSceneSettingsSnapshot extends StudioBg3dSceneStateSummaryInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly clonedFromId?: string;
  readonly hiddenTags?: readonly string[];
}

export type StudioBg3dSceneSnapshotRestorePlan =
  | {
      readonly ok: true;
      readonly primitives: BgPrimitive[];
      readonly customModels: BgCustomModelInstance[];
      readonly document: StudioBg3dSceneDocument;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-snapshot"
        | "missing-model-attachment"
        | "document-adaptation-failed";
    };

let bg3dSnapshotSeq = 0;

function nextBg3dSnapshotId(): string {
  bg3dSnapshotSeq += 1;
  return `bg3d-snap-${Date.now().toString(36)}-${bg3dSnapshotSeq}`;
}

function deepCloneJsonFrozen<T>(value: T): T {
  const cloned = JSON.parse(JSON.stringify(value)) as T;
  return deepFreeze(cloned);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    if (Array.isArray(value)) {
      for (const item of value) deepFreeze(item);
    } else {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        deepFreeze(entry);
      }
    }
  }
  return value;
}

function round2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function summarizeStudioBg3dSceneState(
  input: StudioBg3dSceneStateSummaryInput,
): string {
  const [cx, cy, cz] = input.camera.position;
  const lensTag =
    input.camera.projection === "orthographic"
      ? `직교(${round2(input.camera.orthographicHeight ?? 8)})`
      : `FOV ${Math.round(input.camera.fovDegrees)}°`;
  const keyColor = input.lighting.key.color.toLowerCase();
  const keyIntensity = round2(input.lighting.key.intensity);
  const exposure = round2(input.render.exposure);
  const sky = input.background.skyPresetId;
  const totalNodes = input.primitives.length + input.customModels.length;
  const firstPos =
    input.primitives[0]?.position ?? input.customModels[0]?.position ?? null;
  const firstTag = firstPos
    ? ` · 첫배치(${round2(firstPos[0])},${round2(firstPos[1])},${round2(firstPos[2])})`
    : "";
  return `카메라 (${round2(cx)},${round2(cy)},${round2(cz)}) ${lensTag} · 조명 ${keyColor}(${keyIntensity})/노출${exposure}/${sky} · 가구·오브젝트 ${totalNodes}개${firstTag}`;
}

export function createStudioBg3dSceneSnapshot(
  input: {
    readonly document: Pick<
      StudioBg3dSceneDocument,
      "camera" | "lighting" | "background" | "render"
    > & {
      readonly meta?: StudioBg3dSceneDocument["meta"];
    };
    readonly primitives: readonly BgPrimitive[];
    readonly customModels: readonly BgCustomModelInstance[];
  },
  options: {
    readonly id?: string;
    readonly name?: string;
    readonly createdAt?: string;
    readonly existingCount?: number;
    readonly clonedFromId?: string;
  } = {},
): StudioBg3dSceneSettingsSnapshot {
  const index = (options.existingCount ?? 0) + 1;
  const name = (options.name?.trim() || `씬 스냅샷 ${index}`).slice(0, 60);
  const frozenPrimitives = deepFreeze(
    clonePrimitives([...input.primitives]),
  );
  const frozenCustomModels = deepFreeze(
    cloneBgCustomModelInstances([...input.customModels]),
  );
  const inputHiddenTags = input.document.meta?.hiddenTags;
  const normalizedSettings = normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    camera: input.document.camera,
    lighting: input.document.lighting,
    background: input.document.background,
    render: input.document.render,
    ...(inputHiddenTags
      ? { meta: { hiddenTags: inputHiddenTags } }
      : {}),
  });
  return Object.freeze({
    id: options.id ?? nextBg3dSnapshotId(),
    name,
    createdAt: options.createdAt ?? new Date().toISOString(),
    ...(options.clonedFromId ? { clonedFromId: options.clonedFromId } : {}),
    camera: deepCloneJsonFrozen(normalizedSettings.camera),
    lighting: deepCloneJsonFrozen(normalizedSettings.lighting),
    background: deepCloneJsonFrozen(normalizedSettings.background),
    render: deepCloneJsonFrozen(normalizedSettings.render),
    ...(normalizedSettings.meta?.hiddenTags
      ? { hiddenTags: deepCloneJsonFrozen(normalizedSettings.meta.hiddenTags) }
      : {}),
    primitives: frozenPrimitives,
    customModels: frozenCustomModels,
  });
}

export function appendStudioBg3dSceneSnapshot(
  list: readonly StudioBg3dSceneSettingsSnapshot[],
  snapshot: StudioBg3dSceneSettingsSnapshot,
): readonly StudioBg3dSceneSettingsSnapshot[] {
  const next = [...list, snapshot];
  return Object.freeze(
    next.length > STUDIO_BG3D_SCENE_SNAPSHOT_MAX
      ? next.slice(next.length - STUDIO_BG3D_SCENE_SNAPSHOT_MAX)
      : next,
  );
}

export function duplicateStudioBg3dSceneSnapshot(
  list: readonly StudioBg3dSceneSettingsSnapshot[],
  sourceId: string,
  options: { readonly id?: string; readonly createdAt?: string } = {},
): readonly StudioBg3dSceneSettingsSnapshot[] | null {
  const idx = list.findIndex((entry) => entry.id === sourceId);
  if (idx < 0 || list.length >= STUDIO_BG3D_SCENE_SNAPSHOT_MAX) return null;
  const source = list[idx]!;
  const clone = createStudioBg3dSceneSnapshot(
    {
      document: {
        camera: source.camera,
        lighting: source.lighting,
        background: source.background,
        render: source.render,
        ...(source.hiddenTags ? { meta: { hiddenTags: source.hiddenTags } } : {}),
      },
      primitives: source.primitives,
      customModels: source.customModels,
    },
    {
      ...(options.id ? { id: options.id } : {}),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      name: `${source.name} 복제본`.slice(0, 60),
      clonedFromId: source.id,
    },
  );
  return Object.freeze([
    ...list.slice(0, idx + 1),
    clone,
    ...list.slice(idx + 1),
  ]);
}

export function removeStudioBg3dSceneSnapshot(
  list: readonly StudioBg3dSceneSettingsSnapshot[],
  id: string,
): readonly StudioBg3dSceneSettingsSnapshot[] {
  return Object.freeze(list.filter((entry) => entry.id !== id));
}

export function planStudioBg3dSceneSnapshotRestore(input: {
  readonly snapshot: StudioBg3dSceneSettingsSnapshot | null | undefined;
  readonly currentDocument: StudioBg3dSceneDocument;
  readonly attachmentByStorageModelId: ReadonlyMap<
    string,
    StudioBg3dModelAttachment
  >;
}): StudioBg3dSceneSnapshotRestorePlan {
  const { snapshot, currentDocument, attachmentByStorageModelId } = input;
  if (!snapshot) {
    return { ok: false, reason: "invalid-snapshot" };
  }
  for (const model of snapshot.customModels) {
    if (!attachmentByStorageModelId.has(model.modelId)) {
      return { ok: false, reason: "missing-model-attachment" };
    }
  }
  const nextPrimitives = clonePrimitives([...snapshot.primitives]);
  const nextCustomModels = cloneBgCustomModelInstances([
    ...snapshot.customModels,
  ]);
  const { hiddenTags: _prevHiddenTags, ...restMeta } = currentDocument.meta ?? {};
  const nextMeta =
    snapshot.hiddenTags && snapshot.hiddenTags.length > 0
      ? { ...restMeta, hiddenTags: [...snapshot.hiddenTags] }
      : Object.keys(restMeta).length > 0
        ? restMeta
        : undefined;
  const { meta: _prevMeta, ...restCurrent } = currentDocument;
  let candidateBase: StudioBg3dSceneDocument;
  try {
    candidateBase = normalizeStudioBg3dSceneDocument({
      ...restCurrent,
      nodes: [],
      attachments: [],
      camera: JSON.parse(
        JSON.stringify(snapshot.camera),
      ) as StudioBg3dCameraSettings,
      lighting: JSON.parse(
        JSON.stringify(snapshot.lighting),
      ) as StudioBg3dLightingSettings,
      background: JSON.parse(
        JSON.stringify(snapshot.background),
      ) as StudioBg3dBackgroundSettings,
      render: JSON.parse(
        JSON.stringify(snapshot.render),
      ) as StudioBg3dRenderSettings,
      ...(nextMeta ? { meta: nextMeta } : {}),
    });
  } catch {
    return { ok: false, reason: "document-adaptation-failed" };
  }
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({
    primitives: nextPrimitives,
    customModels: nextCustomModels,
    attachmentByStorageModelId,
    baseDocument: candidateBase,
  });
  if (
    !adapted.ok ||
    adapted.value.diagnostics.length > 0 ||
    adapted.value.counts.droppedPrimitives > 0 ||
    adapted.value.counts.droppedCustomModels > 0
  ) {
    return { ok: false, reason: "document-adaptation-failed" };
  }
  return {
    ok: true,
    primitives: nextPrimitives,
    customModels: nextCustomModels,
    document: adapted.value.document,
  };
}
