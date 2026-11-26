/**
 * 로컬-클라우드 지능형 3-Way 스튜디오 문서 충돌 해결기.
 *
 * - 레이어, 말풍선, 카메라 레일, 문서 메타데이터에 대해 결정적 3-Way 구조 병합을 수행한다.
 * - 동일 엔티티의 겹치지 않는 필드 편집과 수렴 편집은 자동 병합하며, 실제 동시 충돌과
 *   수정-삭제 충돌만 명시적 필드별 선택지(`use-local` / `use-cloud` / `use-base`)로 보고한다.
 */

export interface StudioDocumentMetadata {
  readonly title: string;
  readonly episodeNumber: number;
  readonly readingDirection: "vertical-scroll" | "ltr" | "rtl";
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tags: readonly string[];
}

export interface StudioLayerNode {
  readonly id: string;
  readonly name: string;
  readonly kind: "raster" | "vector-ink" | "tone" | "3d-bg" | "fx";
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly zIndex: number;
  readonly contentHash: string;
}

export interface StudioBalloonNode {
  readonly id: string;
  readonly cutId: string;
  readonly speaker: string;
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSizePx: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly style: "speech" | "thought" | "shout" | "narration";
}

export interface CameraRailKeyframe {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly rotationDeg: number;
}

export interface StudioCameraRailNode {
  readonly id: string;
  readonly cutId: string;
  readonly easing: "linear" | "ease-in-out" | "cubic-bezier";
  readonly durationMs: number;
  readonly keyframes: readonly CameraRailKeyframe[];
}

export interface StudioDocumentSnapshot {
  readonly documentId: string;
  readonly revision: number;
  readonly metadata: StudioDocumentMetadata;
  readonly layers: readonly StudioLayerNode[];
  readonly balloons: readonly StudioBalloonNode[];
  readonly cameraRails: readonly StudioCameraRailNode[];
}

export type DocumentSectionName = "metadata" | "layers" | "balloons" | "cameraRails";
export type ConflictKind =
  | "value-divergence"
  | "modify-vs-delete"
  | "delete-vs-modify"
  | "concurrent-add-divergence";
export type ConflictResolutionChoice = "use-local" | "use-cloud" | "use-base";

export interface AutoMergedChangeRecord {
  readonly section: DocumentSectionName;
  readonly entityId: string;
  readonly fieldPath: string;
  readonly source: "local" | "cloud" | "convergent";
}

export interface DocumentFieldConflict {
  readonly conflictId: string;
  readonly section: DocumentSectionName;
  readonly entityId: string;
  readonly fieldPath: string;
  readonly kind: ConflictKind;
  readonly baseValue: unknown;
  readonly localValue: unknown;
  readonly cloudValue: unknown;
  readonly resolutionChoices: readonly ConflictResolutionChoice[];
  readonly recommendedChoice: ConflictResolutionChoice;
  readonly reasonKo: string;
}

export interface ConflictResolverOptions {
  readonly defaultPolicy?: "prefer-local" | "prefer-cloud" | "prefer-base";
}

export interface StudioDocumentMergeReport {
  readonly documentId: string;
  readonly cleanAutoMerge: boolean;
  readonly autoMergedChanges: readonly AutoMergedChangeRecord[];
  readonly conflicts: readonly DocumentFieldConflict[];
  readonly provisionalDocument: StudioDocumentSnapshot;
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function defaultChoiceForPolicy(
  policy: "prefer-local" | "prefer-cloud" | "prefer-base",
): ConflictResolutionChoice {
  if (policy === "prefer-cloud") return "use-cloud";
  if (policy === "prefer-base") return "use-base";
  return "use-local";
}

function mergeRecordFields<TRecord extends object>(params: {
  readonly section: DocumentSectionName;
  readonly entityId: string;
  readonly keys: readonly (keyof TRecord)[];
  readonly base: TRecord;
  readonly local: TRecord;
  readonly cloud: TRecord;
  readonly policy: "prefer-local" | "prefer-cloud" | "prefer-base";
  readonly autoMerged: AutoMergedChangeRecord[];
  readonly conflicts: DocumentFieldConflict[];
}): TRecord {
  const merged = { ...params.base } as Record<string, unknown>;
  const baseRec = params.base as Record<string, unknown>;
  const localRec = params.local as Record<string, unknown>;
  const cloudRec = params.cloud as Record<string, unknown>;
  const fallbackChoice = defaultChoiceForPolicy(params.policy);

  for (let i = 0; i < params.keys.length; i += 1) {
    const key = String(params.keys[i]);
    const bVal = baseRec[key];
    const lVal = localRec[key];
    const cVal = cloudRec[key];
    const localChanged = !stableEqual(bVal, lVal);
    const cloudChanged = !stableEqual(bVal, cVal);

    if (!localChanged && !cloudChanged) {
      merged[key] = bVal;
    } else if (localChanged && !cloudChanged) {
      merged[key] = lVal;
      params.autoMerged.push({ section: params.section, entityId: params.entityId, fieldPath: key, source: "local" });
    } else if (!localChanged && cloudChanged) {
      merged[key] = cVal;
      params.autoMerged.push({ section: params.section, entityId: params.entityId, fieldPath: key, source: "cloud" });
    } else if (stableEqual(lVal, cVal)) {
      merged[key] = lVal;
      params.autoMerged.push({ section: params.section, entityId: params.entityId, fieldPath: key, source: "convergent" });
    } else {
      merged[key] = fallbackChoice === "use-cloud" ? cVal : fallbackChoice === "use-base" ? bVal : lVal;
      params.conflicts.push({
        conflictId: `${params.section}:${params.entityId}:${key}`,
        section: params.section,
        entityId: params.entityId,
        fieldPath: key,
        kind: "value-divergence",
        baseValue: bVal,
        localValue: lVal,
        cloudValue: cVal,
        resolutionChoices: ["use-local", "use-cloud", "use-base"],
        recommendedChoice: fallbackChoice,
        reasonKo: `로컬과 클라우드가 '${params.entityId}.${key}' 필드를 서로 다른 값으로 동시 수정했습니다.`,
      });
    }
  }
  return merged as TRecord;
}

function mergeEntityCollection<TEntity extends { readonly id: string }>(params: {
  readonly section: Exclude<DocumentSectionName, "metadata">;
  readonly keys: readonly (keyof TEntity)[];
  readonly baseList: readonly TEntity[];
  readonly localList: readonly TEntity[];
  readonly cloudList: readonly TEntity[];
  readonly policy: "prefer-local" | "prefer-cloud" | "prefer-base";
  readonly autoMerged: AutoMergedChangeRecord[];
  readonly conflicts: DocumentFieldConflict[];
}): readonly TEntity[] {
  const baseMap = new Map<string, TEntity>();
  const localMap = new Map<string, TEntity>();
  const cloudMap = new Map<string, TEntity>();
  const orderedIds: string[] = [];

  const register = (list: readonly TEntity[], target: Map<string, TEntity>): void => {
    for (let i = 0; i < list.length; i += 1) {
      target.set(list[i].id, list[i]);
      if (!orderedIds.includes(list[i].id)) orderedIds.push(list[i].id);
    }
  };
  register(params.baseList, baseMap);
  register(params.localList, localMap);
  register(params.cloudList, cloudMap);

  const fallbackChoice = defaultChoiceForPolicy(params.policy);
  const result: TEntity[] = [];

  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    const bItem = baseMap.get(id);
    const lItem = localMap.get(id);
    const cItem = cloudMap.get(id);

    if (bItem && lItem && cItem) {
      result.push(
        mergeRecordFields({
          section: params.section,
          entityId: id,
          keys: params.keys,
          base: bItem,
          local: lItem,
          cloud: cItem,
          policy: params.policy,
          autoMerged: params.autoMerged,
          conflicts: params.conflicts,
        }),
      );
    } else if (!bItem && lItem && !cItem) {
      result.push(lItem);
      params.autoMerged.push({ section: params.section, entityId: id, fieldPath: "*", source: "local" });
    } else if (!bItem && !lItem && cItem) {
      result.push(cItem);
      params.autoMerged.push({ section: params.section, entityId: id, fieldPath: "*", source: "cloud" });
    } else if (!bItem && lItem && cItem) {
      if (stableEqual(lItem, cItem)) {
        result.push(lItem);
        params.autoMerged.push({ section: params.section, entityId: id, fieldPath: "*", source: "convergent" });
      } else {
        if (fallbackChoice === "use-cloud") result.push(cItem);
        else if (fallbackChoice === "use-local") result.push(lItem);
        params.conflicts.push({
          conflictId: `${params.section}:${id}:*`,
          section: params.section,
          entityId: id,
          fieldPath: "*",
          kind: "concurrent-add-divergence",
          baseValue: null,
          localValue: lItem,
          cloudValue: cItem,
          resolutionChoices: ["use-local", "use-cloud", "use-base"],
          recommendedChoice: fallbackChoice,
          reasonKo: `로컬과 클라우드가 동일한 ID('${id}')로 서로 다른 신규 항목을 추가했습니다.`,
        });
      }
    } else if (bItem && !lItem && !cItem) {
      params.autoMerged.push({ section: params.section, entityId: id, fieldPath: "*", source: "convergent" });
    } else if (bItem && lItem && !cItem) {
      if (stableEqual(bItem, lItem)) {
        params.autoMerged.push({ section: params.section, entityId: id, fieldPath: "*", source: "cloud" });
      } else {
        if (fallbackChoice === "use-local") result.push(lItem);
        else if (fallbackChoice === "use-base") result.push(bItem);
        params.conflicts.push({
          conflictId: `${params.section}:${id}:*`,
          section: params.section,
          entityId: id,
          fieldPath: "*",
          kind: "modify-vs-delete",
          baseValue: bItem,
          localValue: lItem,
          cloudValue: null,
          resolutionChoices: ["use-local", "use-cloud", "use-base"],
          recommendedChoice: "use-local",
          reasonKo: `로컬에서 수정한 '${id}' 항목이 클라우드에서 삭제되었습니다.`,
        });
      }
    } else if (bItem && !lItem && cItem) {
      if (stableEqual(bItem, cItem)) {
        params.autoMerged.push({ section: params.section, entityId: id, fieldPath: "*", source: "local" });
      } else {
        if (fallbackChoice === "use-cloud") result.push(cItem);
        else if (fallbackChoice === "use-base") result.push(bItem);
        params.conflicts.push({
          conflictId: `${params.section}:${id}:*`,
          section: params.section,
          entityId: id,
          fieldPath: "*",
          kind: "delete-vs-modify",
          baseValue: bItem,
          localValue: null,
          cloudValue: cItem,
          resolutionChoices: ["use-local", "use-cloud", "use-base"],
          recommendedChoice: "use-cloud",
          reasonKo: `로컬에서 삭제한 '${id}' 항목이 클라우드에서 수정되었습니다.`,
        });
      }
    }
  }
  return result;
}

const METADATA_KEYS: readonly (keyof StudioDocumentMetadata)[] = [
  "title", "episodeNumber", "readingDirection", "canvasWidth", "canvasHeight", "tags",
];
const LAYER_KEYS: readonly (keyof StudioLayerNode)[] = [
  "name", "kind", "visible", "locked", "opacity", "blendMode", "zIndex", "contentHash",
];
const BALLOON_KEYS: readonly (keyof StudioBalloonNode)[] = [
  "cutId", "speaker", "text", "fontFamily", "fontSizePx", "x", "y", "width", "height", "style",
];
const CAMERA_RAIL_KEYS: readonly (keyof StudioCameraRailNode)[] = [
  "cutId", "easing", "durationMs", "keyframes",
];

/** 기준(base) · 로컬(local) · 클라우드(cloud) 스튜디오 문서를 결정적으로 3-Way 병합한다. */
export function resolveStudioDocumentConflict(
  base: StudioDocumentSnapshot,
  local: StudioDocumentSnapshot,
  cloud: StudioDocumentSnapshot,
  options?: ConflictResolverOptions,
): StudioDocumentMergeReport {
  const policy = options?.defaultPolicy ?? "prefer-local";
  const autoMergedChanges: AutoMergedChangeRecord[] = [];
  const conflicts: DocumentFieldConflict[] = [];

  const mergedMetadata = mergeRecordFields({
    section: "metadata",
    entityId: "metadata",
    keys: METADATA_KEYS,
    base: base.metadata,
    local: local.metadata,
    cloud: cloud.metadata,
    policy,
    autoMerged: autoMergedChanges,
    conflicts,
  });
  const mergedLayers = mergeEntityCollection({
    section: "layers",
    keys: LAYER_KEYS,
    baseList: base.layers,
    localList: local.layers,
    cloudList: cloud.layers,
    policy,
    autoMerged: autoMergedChanges,
    conflicts,
  });
  const mergedBalloons = mergeEntityCollection({
    section: "balloons",
    keys: BALLOON_KEYS,
    baseList: base.balloons,
    localList: local.balloons,
    cloudList: cloud.balloons,
    policy,
    autoMerged: autoMergedChanges,
    conflicts,
  });
  const mergedCameraRails = mergeEntityCollection({
    section: "cameraRails",
    keys: CAMERA_RAIL_KEYS,
    baseList: base.cameraRails,
    localList: local.cameraRails,
    cloudList: cloud.cameraRails,
    policy,
    autoMerged: autoMergedChanges,
    conflicts,
  });

  return {
    documentId: base.documentId,
    cleanAutoMerge: conflicts.length === 0,
    autoMergedChanges,
    conflicts,
    provisionalDocument: {
      documentId: base.documentId,
      revision: Math.max(base.revision, local.revision, cloud.revision) + 1,
      metadata: mergedMetadata,
      layers: mergedLayers,
      balloons: mergedBalloons,
      cameraRails: mergedCameraRails,
    },
  };
}

function pickConflictValue(conflict: DocumentFieldConflict, choice: ConflictResolutionChoice): unknown {
  if (choice === "use-cloud") return conflict.cloudValue;
  if (choice === "use-base") return conflict.baseValue;
  return conflict.localValue;
}

/** 사용자가 선택한 충돌 해결안(`conflictId -> choice`)을 반영해 최종 확정 문서를 생성한다. */
export function applyDocumentConflictResolutions(
  report: StudioDocumentMergeReport,
  selections: Readonly<Record<string, ConflictResolutionChoice>>,
): StudioDocumentSnapshot {
  const metadata = { ...report.provisionalDocument.metadata } as Record<string, unknown>;
  const layers = report.provisionalDocument.layers.map((l) => ({ ...l }));
  const balloons = report.provisionalDocument.balloons.map((b) => ({ ...b }));
  const cameraRails = report.provisionalDocument.cameraRails.map((r) => ({ ...r }));

  const applyToCollection = <T extends { readonly id: string }>(
    list: T[],
    conflict: DocumentFieldConflict,
    chosenValue: unknown,
  ): void => {
    const idx = list.findIndex((item) => item.id === conflict.entityId);
    if (conflict.fieldPath === "*") {
      if (chosenValue === null || chosenValue === undefined) {
        if (idx >= 0) list.splice(idx, 1);
      } else if (idx >= 0) {
        list[idx] = chosenValue as T;
      } else {
        list.push(chosenValue as T);
      }
      return;
    }
    if (idx >= 0) {
      const updated = { ...(list[idx] as Record<string, unknown>) };
      updated[conflict.fieldPath] = chosenValue;
      list[idx] = updated as T;
    }
  };

  for (let i = 0; i < report.conflicts.length; i += 1) {
    const conflict = report.conflicts[i];
    const choice = selections[conflict.conflictId] ?? conflict.recommendedChoice;
    const chosenValue = pickConflictValue(conflict, choice);
    if (conflict.section === "metadata") metadata[conflict.fieldPath] = chosenValue;
    else if (conflict.section === "layers") applyToCollection(layers, conflict, chosenValue);
    else if (conflict.section === "balloons") applyToCollection(balloons, conflict, chosenValue);
    else applyToCollection(cameraRails, conflict, chosenValue);
  }

  return {
    documentId: report.provisionalDocument.documentId,
    revision: report.provisionalDocument.revision,
    metadata: metadata as unknown as StudioDocumentMetadata,
    layers,
    balloons,
    cameraRails,
  };
}
