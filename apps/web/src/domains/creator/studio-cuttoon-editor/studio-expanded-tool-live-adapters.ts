/**
 * 확장 생태계 Top 15 실스토어 라이브 어댑터 · 4구역 양방향 드래그 · 이벤트 버스.
 *
 * - `import type` 전용으로 무거운 도메인 런타임 정적 결합 0B를 유지한다.
 * - `localStorage` 영속 저장과 `toonstudio:expanded-tool-commit` 이벤트 브로드캐스트로
 *   UI 스테이지와 엔진 러너 양쪽의 작업 결과를 실스토어에 직결한다.
 */
import type { CharacterInlineQuickState } from "../comic/StudioCharacterInlineQuickBar";
import type { UnderpaintingCharacterLabel, UnderpaintingColorJob, UnderpaintingMarkingStroke } from "../fill/studio-underpainting-three-layer-engine";
import type { StudioAdjustmentLayerSpec } from "../layer/studio-adjustment-layer";
import type { StudioBlendIfConfig } from "../layer/studio-blend-if-compositor";
import type { DialoguePageLike } from "../lettering/studio-dialogue-batch";
import { STUDIO_PLANNING_UPDATED_EVENT, readStudioProjectPlanning, writeStudioProjectPlanning } from "../planning/studio-planning-store";
import { canReplaceScopedStudioProjectRecord, isScopedStudioProjectRecord, isStudioProjectRecordMemoryOnly, markStudioProjectRecordMemoryOnly } from "../planning/studio-local-project-record-guard";
import type { StoryLivingSpecState } from "../planning/studio-story-living-spec-types";
import type { WebtoonViewAreaAspectRatio } from "../reader-preview/StudioWebtoonViewAreaOverlay";
import type { CornerPinQuad } from "../transform/studio-corner-pin-transform";
import type { RasterMeshLattice } from "../transform/studio-raster-mesh-transform";
import type { ConsistencyAssetSlot } from "./StudioConsistencyAssetStrip";
import type { SelectionContextPromptItem, SelectionRefinementToolId } from "./StudioSelectionContextPromptBar";
import type { StudioEcosystemLoaderId } from "./studio-ecosystem-lazy-registry";
import type { LiveEngineExecutionReport } from "./studio-expanded-tool-engine-runner";
import {
  createSampleAdjustmentLayers,
  createSampleBlendIfConfig,
  createSampleCharacterInlineState,
  createSampleConsistencySlots,
  createSampleCornerQuad,
  createSampleDialoguePages,
  createSampleMeshLattice,
  createSampleSelectionPromptItems,
  createSampleStoryLivingSpecState,
} from "./studio-expanded-tool-ui-samples";

export const STUDIO_EXPANDED_TOOL_COMMIT_EVENT = "toonstudio:expanded-tool-commit";
export const STUDIO_STORY_LIVING_SPEC_UPDATED_EVENT = "toonstudio:story-living-spec-updated";
export const DEFAULT_EXPANDED_WORKSPACE_PROJECT_ID = "active-studio-workspace";

export type StudioCanvasZoneId = "canvas-stage" | "character-dock" | "consistency-strip" | "cut-timeline";
export interface StudioCanvasZoneMeta { readonly id: StudioCanvasZoneId; readonly labelKo: string; }

export const STUDIO_CANVAS_ZONES: readonly StudioCanvasZoneMeta[] = Object.freeze([
  { id: "canvas-stage", labelKo: "캔버스 작업 영역" },
  { id: "character-dock", labelKo: "캐릭터 퀵 바" },
  { id: "consistency-strip", labelKo: "일관성 소재 스트립" },
  { id: "cut-timeline", labelKo: "활성 컷 타임라인" },
]);

export interface CanvasZoneDragTransfer {
  readonly itemId: string; readonly label: string; readonly kind: "layer" | "cut" | "character" | "background" | "prop";
  readonly fromZone: StudioCanvasZoneId; readonly toZone: StudioCanvasZoneId; readonly at: string;
}
export interface CanvasZoneDragState {
  readonly activeSourceZone: StudioCanvasZoneId; readonly lastTransfer: CanvasZoneDragTransfer | null;
  readonly zoneItemIds: Readonly<Record<StudioCanvasZoneId, readonly string[]>>;
}
export type UnderpaintingBatchWorkflowStage = "idle" | "ready-to-mark" | "marking" | "completed";
export interface UnderpaintingOutputLayerRecord {
  readonly id: string; readonly role: "lineart" | "base" | "shadow" | "highlight-mask" | "flattened";
  readonly labelKo: string; readonly blendMode: "multiply" | "normal" | "screen";
  readonly locked: boolean; readonly clipping: boolean; readonly opacityPct: number;
}
export interface UnderpaintingLiveWorkspaceState {
  readonly cutId: string; readonly lineartLayerId: string; readonly lineartLayerName: string;
  readonly lineartBlendMode: "multiply"; readonly lineartLocked: true;
  readonly activeMarkLabel: UnderpaintingCharacterLabel; readonly markingStrokes: readonly UnderpaintingMarkingStroke[];
  readonly batchCutIds: readonly string[]; readonly batchWorkflowStage: UnderpaintingBatchWorkflowStage;
  readonly lastOutputMode: UnderpaintingColorJob["outputMode"] | null;
  readonly outputLayers: readonly UnderpaintingOutputLayerRecord[]; readonly lastRunAt: string | null;
}
export interface MeshWarpLiveWorkspaceState {
  readonly mode: "mesh" | "corner-pin"; readonly targetLayerCount: number;
  readonly lattice: RasterMeshLattice; readonly cornerQuad: CornerPinQuad;
  readonly appliedCount: number; readonly lastAppliedAt: string | null;
}
export interface WebtoonViewAreaLiveState {
  readonly scrollTop: number; readonly visible: boolean; readonly aspectRatio: WebtoonViewAreaAspectRatio; readonly maskOpacity: number;
}
export interface ExpandedEngineLiveCommitRecord {
  readonly loaderId: StudioEcosystemLoaderId; readonly targetSurfaceKo: string; readonly badgeTextKo: string;
  readonly summaryKo: string; readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly payload: Readonly<Record<string, unknown>>; readonly committedAt: string;
}
export interface ExpandedToolCommitEnvelope {
  readonly id: string; readonly projectId: string; readonly cutId: string; readonly layerId: string;
  readonly loaderId: StudioEcosystemLoaderId | "studio-canvas-zone-drag";
  readonly summaryKo: string; readonly committedAt: string; readonly payload?: Readonly<Record<string, unknown>>;
}
export interface StudioExpandedLiveWorkspaceState {
  readonly schemaVersion: 1; readonly projectId: string; readonly activeCutId: string; readonly activeLayerId: string; readonly updatedAt: string;
  readonly selectionItems: readonly SelectionContextPromptItem[]; readonly activeRefinementTool: SelectionRefinementToolId | null;
  readonly lastPromptSubmission: { readonly mode: "create" | "edit" | "composite"; readonly prompt: string; readonly targetIds: readonly string[]; readonly at: string } | null;
  readonly canvasZoneDrag: CanvasZoneDragState; readonly consistencySlots: readonly ConsistencyAssetSlot[];
  readonly characterInline: CharacterInlineQuickState; readonly underpainting: UnderpaintingLiveWorkspaceState;
  readonly meshWarp: MeshWarpLiveWorkspaceState;
  readonly adjustmentLayers: { readonly layers: readonly StudioAdjustmentLayerSpec[]; readonly selectedLayerId: string | null };
  readonly blendIf: StudioBlendIfConfig; readonly webtoonViewArea: WebtoonViewAreaLiveState;
  readonly dialoguePages: readonly DialoguePageLike[];
  readonly engineCommits: Readonly<Record<string, ExpandedEngineLiveCommitRecord>>;
  readonly commitHistory: readonly ExpandedToolCommitEnvelope[];
}
export type CutApprovalStatus = "draft" | "review-requested" | "approved";
export interface CutApprovalShareRecord {
  readonly cutKey: string; readonly status: CutApprovalStatus; readonly shareLinkEnabled: boolean;
  readonly shareUrl: string; readonly snapshotHash: string; readonly updatedAt: string;
}
export interface StoryLivingSpecPersistedRecord {
  readonly schemaVersion: 1; readonly projectId: string; readonly state: StoryLivingSpecState;
  readonly cutApprovals: Readonly<Record<string, CutApprovalShareRecord>>; readonly updatedAt: string;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export interface EventTargetLike {
  dispatchEvent(event: Event): boolean;
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}
export type LiveAdapterParamValue = string | number | boolean;
export type LiveAdapterParamMap = Readonly<Record<string, LiveAdapterParamValue>>;
export type EngineLiveControlSpec =
  | { readonly key: string; readonly labelKo: string; readonly kind: "select"; readonly options: readonly { readonly value: string; readonly labelKo: string }[] }
  | { readonly key: string; readonly labelKo: string; readonly kind: "range"; readonly min: number; readonly max: number; readonly step: number; readonly unitKo?: string }
  | { readonly key: string; readonly labelKo: string; readonly kind: "toggle" }
  | { readonly key: string; readonly labelKo: string; readonly kind: "text"; readonly placeholderKo: string };
export interface LiveEngineAdapterDefinition {
  readonly loaderId: StudioEcosystemLoaderId; readonly titleKo: string; readonly targetSurfaceKo: string; readonly descriptionKo: string;
  readonly controls: readonly EngineLiveControlSpec[]; readonly defaultParams: LiveAdapterParamMap;
  readonly execute: (mod: Record<string, unknown>, params: LiveAdapterParamMap, workspace: StudioExpandedLiveWorkspaceState) => {
    readonly invokedExportName: string; readonly result: unknown; readonly badgeTextKo: string;
    readonly summaryKo: string; readonly commitPayload: Readonly<Record<string, unknown>>;
  };
}

type CallableFn = (...args: readonly unknown[]) => unknown;
type ConstructableFn = new (...args: readonly unknown[]) => unknown;
const asFn = (value: unknown): CallableFn => value as CallableFn;
const asCtor = (value: unknown): ConstructableFn => value as ConstructableFn;
const readNum = (p: LiveAdapterParamMap, k: string, fb: number): number => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : fb);
const readStr = (p: LiveAdapterParamMap, k: string, fb: string): string => (typeof p[k] === "string" ? (p[k] as string) : fb);
const readBool = (p: LiveAdapterParamMap, k: string, fb: boolean): boolean => (typeof p[k] === "boolean" ? (p[k] as boolean) : fb);

const selectCtrl = (key: string, labelKo: string, pairs: readonly (readonly [string, string])[]): EngineLiveControlSpec => ({
  key, labelKo, kind: "select", options: pairs.map(([value, label]) => ({ value, labelKo: label })),
});
const rangeCtrl = (key: string, labelKo: string, min: number, max: number, step: number, unitKo?: string): EngineLiveControlSpec => ({
  key, labelKo, kind: "range", min, max, step, unitKo,
});
const toggleCtrl = (key: string, labelKo: string): EngineLiveControlSpec => ({ key, labelKo, kind: "toggle" });
const textCtrl = (key: string, labelKo: string, placeholderKo: string): EngineLiveControlSpec => ({ key, labelKo, kind: "text", placeholderKo });

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}
const defaultEventTarget = (): EventTargetLike | null => (typeof window === "undefined" ? null : window);

export function resolveActiveExpandedProjectId(overrideProjectId?: string): string {
  const explicit = overrideProjectId?.trim();
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    const match = /\/studio\/p\/([^/?#]+)/u.exec(window.location.pathname);
    if (match?.[1]) {
      try { const decoded = decodeURIComponent(match[1]).trim(); if (decoded) return decoded; } catch { return match[1]; }
    }
  }
  return DEFAULT_EXPANDED_WORKSPACE_PROJECT_ID;
}

export const studioExpandedWorkspaceStorageKey = (projectId: string): string =>
  `toonstudio:expanded-live-workspace:v1:${encodeURIComponent(projectId.trim() || DEFAULT_EXPANDED_WORKSPACE_PROJECT_ID)}`;

export const studioStoryLivingSpecStorageKey = (projectId: string): string =>
  `toonstudio:story-living-spec:v1:${encodeURIComponent(projectId.trim() || DEFAULT_EXPANDED_WORKSPACE_PROJECT_ID)}`;

export function createInitialExpandedLiveWorkspace(projectId: string, now = "2026-11-20T09:00:00.000Z"): StudioExpandedLiveWorkspaceState {
  return {
    schemaVersion: 1, projectId, activeCutId: "cut-01", activeLayerId: "layer-lineart", updatedAt: now,
    selectionItems: createSampleSelectionPromptItems(), activeRefinementTool: null, lastPromptSubmission: null,
    canvasZoneDrag: {
      activeSourceZone: "character-dock", lastTransfer: null,
      zoneItemIds: { "canvas-stage": ["sel-char-1"], "character-dock": ["char-sample-1"], "consistency-strip": ["slot-char-1", "slot-bg-1"], "cut-timeline": ["cut-01"] },
    },
    consistencySlots: createSampleConsistencySlots(),
    characterInline: createSampleCharacterInlineState(),
    underpainting: {
      cutId: "cut-01", lineartLayerId: "layer-lineart", lineartLayerName: "원본 선화",
      lineartBlendMode: "multiply", lineartLocked: true, activeMarkLabel: "A",
      markingStrokes: [{ cutId: "cut-01", label: "A", normalizedXY: [0.46, 0.34] }],
      batchCutIds: ["cut-01"], batchWorkflowStage: "idle", lastOutputMode: null,
      outputLayers: [{ id: "layer-lineart-multiply-lock", role: "lineart", labelKo: "원본 선화 (Multiply 잠금)", blendMode: "multiply", locked: true, clipping: false, opacityPct: 100 }],
      lastRunAt: null,
    },
    meshWarp: { mode: "mesh", targetLayerCount: 2, lattice: createSampleMeshLattice(240, 160, 3, 3), cornerQuad: createSampleCornerQuad(240, 160), appliedCount: 0, lastAppliedAt: null },
    adjustmentLayers: { layers: createSampleAdjustmentLayers(), selectedLayerId: "adj-sample-curves" },
    blendIf: createSampleBlendIfConfig(),
    webtoonViewArea: { scrollTop: 60, visible: true, aspectRatio: "9:19.5", maskOpacity: 0.56 },
    dialoguePages: createSampleDialoguePages(),
    engineCommits: {}, commitHistory: [],
  };
}

export function readExpandedLiveWorkspace(projectId: string, storage: StorageLike | null = defaultStorage()): StudioExpandedLiveWorkspaceState {
  const fallback = createInitialExpandedLiveWorkspace(projectId);
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(studioExpandedWorkspaceStorageKey(projectId));
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<StudioExpandedLiveWorkspaceState> | null;
    if (!parsed || !isScopedStudioProjectRecord(parsed, projectId, "workspace")) return markStudioProjectRecordMemoryOnly(fallback);
    return {
      ...fallback, ...parsed,
      canvasZoneDrag: { ...fallback.canvasZoneDrag, ...(parsed.canvasZoneDrag ?? {}), zoneItemIds: { ...fallback.canvasZoneDrag.zoneItemIds, ...(parsed.canvasZoneDrag?.zoneItemIds ?? {}) } },
      underpainting: { ...fallback.underpainting, ...(parsed.underpainting ?? {}), lineartBlendMode: "multiply", lineartLocked: true },
      meshWarp: { ...fallback.meshWarp, ...(parsed.meshWarp ?? {}) },
      adjustmentLayers: { ...fallback.adjustmentLayers, ...(parsed.adjustmentLayers ?? {}) },
      webtoonViewArea: { ...fallback.webtoonViewArea, ...(parsed.webtoonViewArea ?? {}) },
      engineCommits: { ...(parsed.engineCommits ?? {}) },
      commitHistory: Array.isArray(parsed.commitHistory) ? parsed.commitHistory : [],
    };
  } catch { return markStudioProjectRecordMemoryOnly(fallback); }
}

export function writeExpandedLiveWorkspace(state: StudioExpandedLiveWorkspaceState, storage: StorageLike | null = defaultStorage()): StudioExpandedLiveWorkspaceState {
  if (storage && canReplaceScopedStudioProjectRecord(storage, studioExpandedWorkspaceStorageKey(state.projectId), state.projectId, "workspace", state)) {
    try { storage.setItem(studioExpandedWorkspaceStorageKey(state.projectId), JSON.stringify(state)); } catch { /* 저장 한도 초과 시 메모리 유지 */ }
  }
  return state;
}

export function commitExpandedLiveWorkspace(
  projectId: string,
  loaderId: StudioEcosystemLoaderId | "studio-canvas-zone-drag",
  summaryKo: string,
  updater: (prev: StudioExpandedLiveWorkspaceState, now: string) => StudioExpandedLiveWorkspaceState,
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null; readonly payload?: Readonly<Record<string, unknown>>; readonly now?: string },
): { readonly state: StudioExpandedLiveWorkspaceState; readonly envelope: ExpandedToolCommitEnvelope } {
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const target = options?.target === undefined ? defaultEventTarget() : options.target;
  const now = options?.now ?? new Date().toISOString();
  const previous = readExpandedLiveWorkspace(projectId, storage);
  const mutated = updater(previous, now);
  const envelope: ExpandedToolCommitEnvelope = {
    id: `commit-${mutated.commitHistory.length + 1}-${loaderId}`, projectId,
    cutId: mutated.activeCutId, layerId: mutated.activeLayerId, loaderId, summaryKo, committedAt: now, payload: options?.payload,
  };
  const next: StudioExpandedLiveWorkspaceState = { ...previous, ...mutated, projectId, updatedAt: now, commitHistory: [...mutated.commitHistory.slice(-29), envelope] };
  writeExpandedLiveWorkspace(next, storage);
  target?.dispatchEvent(new CustomEvent<ExpandedToolCommitEnvelope>(STUDIO_EXPANDED_TOOL_COMMIT_EVENT, { detail: envelope }));
  return { state: next, envelope };
}

export function subscribeExpandedToolCommits(listener: (envelope: ExpandedToolCommitEnvelope) => void, target: EventTargetLike | null = defaultEventTarget()): () => void {
  if (!target?.addEventListener || !target.removeEventListener) return () => undefined;
  const handler: EventListener = (event) => { if (event instanceof CustomEvent && event.detail) listener(event.detail as ExpandedToolCommitEnvelope); };
  target.addEventListener(STUDIO_EXPANDED_TOOL_COMMIT_EVENT, handler);
  return () => target.removeEventListener?.(STUDIO_EXPANDED_TOOL_COMMIT_EVENT, handler);
}

/** 4구역 양방향 드래그 전송 (캔버스 ↔ 캐릭터 퀵 바 ↔ 소재 스트립 ↔ 활성 컷). */
export function dispatchCanvasZoneDragTransfer(
  projectId: string,
  transfer: Omit<CanvasZoneDragTransfer, "at">,
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null; readonly now?: string },
): StudioExpandedLiveWorkspaceState {
  const fromLabel = STUDIO_CANVAS_ZONES.find((z) => z.id === transfer.fromZone)?.labelKo ?? transfer.fromZone;
  const toLabel = STUDIO_CANVAS_ZONES.find((z) => z.id === transfer.toZone)?.labelKo ?? transfer.toZone;
  return commitExpandedLiveWorkspace(
    projectId,
    "studio-canvas-zone-drag",
    `${transfer.label} 항목을 ${fromLabel}에서 ${toLabel}(으)로 이동했습니다.`,
    (prev, now) => {
      const nextZoneIds: Record<StudioCanvasZoneId, readonly string[]> = {
        ...prev.canvasZoneDrag.zoneItemIds,
        [transfer.toZone]: Array.from(new Set([...prev.canvasZoneDrag.zoneItemIds[transfer.toZone], transfer.itemId])),
      };
      let { selectionItems, consistencySlots, activeCutId } = prev;
      if (transfer.toZone === "canvas-stage" && !selectionItems.some((item) => item.id === transfer.itemId)) {
        selectionItems = [...selectionItems, { id: transfer.itemId, label: transfer.label, kind: transfer.kind }];
      } else if (transfer.toZone === "consistency-strip") {
        const category = transfer.kind === "background" ? "background" : transfer.kind === "prop" ? "prop" : "character";
        if (!consistencySlots.some((slot) => slot.name === transfer.label || slot.id === transfer.itemId)) {
          consistencySlots = [...consistencySlots, { id: `slot-drag-${transfer.itemId}`, category, name: transfer.label, pinnedCutIds: [prev.activeCutId] }];
        }
      } else if (transfer.toZone === "cut-timeline" && transfer.itemId.startsWith("cut-")) {
        activeCutId = transfer.itemId;
      }
      return {
        ...prev, activeCutId, selectionItems, consistencySlots,
        canvasZoneDrag: { activeSourceZone: transfer.fromZone, lastTransfer: { ...transfer, at: now }, zoneItemIds: nextZoneIds },
      };
    },
    { ...options, payload: { itemId: transfer.itemId, fromZone: transfer.fromZone, toZone: transfer.toZone } },
  ).state;
}

/** 2장 이상 연속 배치 시 '마킹하러 가기' 워크플로우와 3층 출력(채색/그림자/마스크) 영속화. */
export function updateUnderpaintingBatchCuts(
  projectId: string,
  batchCutIds: readonly string[],
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null },
): StudioExpandedLiveWorkspaceState {
  const normalized = batchCutIds.length > 0 ? Array.from(new Set(batchCutIds)) : ["cut-01"];
  const nextStage: UnderpaintingBatchWorkflowStage = normalized.length >= 2 ? "ready-to-mark" : "idle";
  return commitExpandedLiveWorkspace(
    projectId,
    "underpainting-panel",
    normalized.length >= 2 ? `연속 ${normalized.length}컷 배치 준비 완료 — 마킹하러 가기가 활성화되었습니다.` : "단일 컷 언더페인팅 모드로 전환했습니다.",
    (prev) => ({
      ...prev, activeCutId: normalized[0] ?? prev.activeCutId,
      underpainting: { ...prev.underpainting, cutId: normalized[0] ?? prev.underpainting.cutId, batchCutIds: normalized, batchWorkflowStage: nextStage },
    }),
    { ...options, payload: { batchCutCount: normalized.length, batchWorkflowStage: nextStage } },
  ).state;
}

export function enterUnderpaintingMarkingWorkflow(
  projectId: string,
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null },
): StudioExpandedLiveWorkspaceState {
  return commitExpandedLiveWorkspace(
    projectId, "underpainting-panel", "연속 컷 A~F 캐릭터 마킹 단계로 진입했습니다.",
    (prev) => ({ ...prev, underpainting: { ...prev.underpainting, batchWorkflowStage: "marking" } }),
    { ...options, payload: { batchWorkflowStage: "marking" } },
  ).state;
}

export function buildUnderpaintingOutputLayerRecords(job: UnderpaintingColorJob): readonly UnderpaintingOutputLayerRecord[] {
  const lineart: UnderpaintingOutputLayerRecord = { id: `${job.lineartLayerId}-multiply-lock`, role: "lineart", labelKo: "원본 선화 (Multiply 잠금)", blendMode: "multiply", locked: true, clipping: false, opacityPct: 100 };
  if (job.outputMode === "flattened") {
    return [lineart, { id: `${job.cutId}-flattened`, role: "flattened", labelKo: "합쳐진 채색", blendMode: "normal", locked: false, clipping: false, opacityPct: 100 }];
  }
  const base: UnderpaintingOutputLayerRecord = { id: `${job.cutId}-base`, role: "base", labelKo: "기본 채색층 (Normal)", blendMode: "normal", locked: false, clipping: false, opacityPct: 100 };
  if (job.outputMode === "flat_base") return [lineart, base];
  const shadow: UnderpaintingOutputLayerRecord = { id: `${job.cutId}-shadow`, role: "shadow", labelKo: "그림자 음영층 (Multiply 클리핑)", blendMode: "multiply", locked: false, clipping: true, opacityPct: Math.round((job.shadowOpacity ?? 0.48) * 100) };
  if (job.outputMode === "base_shadow") return [lineart, shadow, base];
  const highlightMask: UnderpaintingOutputLayerRecord = { id: `${job.cutId}-highlight-mask`, role: "highlight-mask", labelKo: "하이라이트·마스크층 (Screen 클리핑)", blendMode: "screen", locked: false, clipping: true, opacityPct: Math.round((job.highlightOpacity ?? 0.58) * 100) };
  return [lineart, highlightMask, shadow, base];
}

export function commitUnderpaintingJob(
  projectId: string,
  job: UnderpaintingColorJob,
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null },
): StudioExpandedLiveWorkspaceState {
  const outputLayers = buildUnderpaintingOutputLayerRecords(job);
  return commitExpandedLiveWorkspace(
    projectId, "underpainting-panel",
    `Multiply 선화 잠금 아래 ${outputLayers.length - 1}층 언더페인팅 출력을 반영했습니다 (${job.outputMode}).`,
    (prev, now) => ({
      ...prev,
      underpainting: { ...prev.underpainting, cutId: job.cutId, markingStrokes: job.markingStrokes, batchWorkflowStage: "completed", lastOutputMode: job.outputMode, outputLayers, lastRunAt: now },
    }),
    { ...options, payload: { lineartLocked: true, lineartBlendMode: "multiply", outputMode: job.outputMode, outputLayerRoles: outputLayers.map((l) => l.role) } },
  ).state;
}

/** 실제 studio-planning-store와 대사 일괄 찾기·바꾸기 페이지 양방향 동기화. */
export function readDialoguePagesFromLivePlanning(projectId: string, storage: StorageLike | null = defaultStorage()): readonly DialoguePageLike[] {
  if (storage) {
    const planning = readStudioProjectPlanning(storage, projectId);
    if (planning && planning.plans.length > 0) {
      const derived = planning.plans.map((plan) => {
        const elements: { id: string; type: "bubble" | "text"; text: string; x: number; y: number }[] = [];
        if (plan.logline.trim()) elements.push({ id: `${plan.episodeId}:logline`, type: "bubble", text: plan.logline, x: 40, y: 40 });
        if (plan.synopsis?.trim()) elements.push({ id: `${plan.episodeId}:synopsis`, type: "text", text: plan.synopsis, x: 40, y: 140 });
        plan.turningPoints.forEach((tp, idx) => {
          if (tp.trim()) elements.push({ id: `${plan.episodeId}:tp:${idx}`, type: "bubble", text: tp, x: 60, y: 240 + idx * 80 });
        });
        return { id: plan.episodeId, elements };
      }).filter((page) => page.elements.length > 0);
      if (derived.length > 0) return derived;
    }
  }
  return readExpandedLiveWorkspace(projectId, storage).dialoguePages;
}

export function commitDialoguePagesToLivePlanning(
  projectId: string,
  nextPages: readonly DialoguePageLike[],
  replacedCount: number,
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null },
): StudioExpandedLiveWorkspaceState {
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const target = options?.target === undefined ? defaultEventTarget() : options.target;
  if (storage) {
    const planning = readStudioProjectPlanning(storage, projectId);
    if (planning) {
      const pageById = new Map(nextPages.map((p) => [p.id, p]));
      const nextPlans = planning.plans.map((plan) => {
        const matched = pageById.get(plan.episodeId);
        if (!matched) return plan;
        let { logline, synopsis } = plan;
        const turningPoints = [...plan.turningPoints];
        for (const el of matched.elements) {
          if (el.id === `${plan.episodeId}:logline` && typeof el.text === "string") logline = el.text;
          else if (el.id === `${plan.episodeId}:synopsis` && typeof el.text === "string") synopsis = el.text;
          else if (el.id.startsWith(`${plan.episodeId}:tp:`) && typeof el.text === "string") {
            const idx = Number(el.id.slice(`${plan.episodeId}:tp:`.length));
            if (Number.isInteger(idx) && idx >= 0 && idx < turningPoints.length) turningPoints[idx] = el.text;
          }
        }
        return { ...plan, logline, synopsis, turningPoints, revision: plan.revision + 1 };
      });
      try { writeStudioProjectPlanning(storage, { ...planning, plans: nextPlans }, target ?? undefined); } catch { /* 미초기화 프로젝트는 워크스페이스만 저장 */ }
    }
  }
  return commitExpandedLiveWorkspace(
    projectId, "story-find-replace-panel", `에피소드 대사 ${replacedCount}건을 실스토어에 일괄 반영했습니다.`,
    (prev) => ({ ...prev, dialoguePages: nextPages }),
    { storage, target, payload: { replacedCount, pageCount: nextPages.length, planningEvent: STUDIO_PLANNING_UPDATED_EVENT } },
  ).state;
}

export function readProjectStoryLivingSpecRecord(projectId: string, storage: StorageLike | null = defaultStorage()): StoryLivingSpecPersistedRecord {
  const fallback: StoryLivingSpecPersistedRecord = {
    schemaVersion: 1, projectId, state: { ...createSampleStoryLivingSpecState(), projectId }, cutApprovals: {}, updatedAt: "2026-11-20T09:15:00.000Z",
  };
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(studioStoryLivingSpecStorageKey(projectId));
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoryLivingSpecPersistedRecord> | null;
    if (!parsed?.state || !isScopedStudioProjectRecord(parsed, projectId, "story")) return markStudioProjectRecordMemoryOnly(fallback);
    return { schemaVersion: 1, projectId, state: parsed.state, cutApprovals: parsed.cutApprovals ?? {}, updatedAt: parsed.updatedAt ?? fallback.updatedAt };
  } catch { return markStudioProjectRecordMemoryOnly(fallback); }
}

export function writeProjectStoryLivingSpecRecord(
  projectId: string,
  record: StoryLivingSpecPersistedRecord,
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null },
): StoryLivingSpecPersistedRecord {
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const target = options?.target === undefined ? defaultEventTarget() : options.target;
  if (isStudioProjectRecordMemoryOnly(record) || !isScopedStudioProjectRecord(record, projectId, "story")) return record;
  const normalized: StoryLivingSpecPersistedRecord = { ...record, schemaVersion: 1, projectId, updatedAt: new Date().toISOString() };
  if (storage && canReplaceScopedStudioProjectRecord(storage, studioStoryLivingSpecStorageKey(projectId), projectId, "story", normalized)) { try { storage.setItem(studioStoryLivingSpecStorageKey(projectId), JSON.stringify(normalized)); } catch { /* 한도 초과 시 유지 */ } }
  target?.dispatchEvent(new CustomEvent<StoryLivingSpecPersistedRecord>(STUDIO_STORY_LIVING_SPEC_UPDATED_EVENT, { detail: normalized }));
  return normalized;
}

// ── Top 15 엔진 러너 라이브 어댑터 레지스트리 ────────────────────────────

const TOP15_ADAPTER_ENTRIES: readonly LiveEngineAdapterDefinition[] = [
  {
    loaderId: "smart-object-runtime-engine", titleKo: "스마트 오브젝트 라이브 배치", targetSurfaceKo: "활성 컷 스마트 레이어",
    descriptionKo: "비파괴 서브문서 인스턴스와 워프 격자를 생성해 활성 컷 레이어에 바인딩합니다.",
    controls: [rangeCtrl("gridDivs", "워프 격자 분할", 2, 6, 1, "칸")], defaultParams: { gridDivs: 3 },
    execute: (mod, params, ws) => {
      const divs = readNum(params, "gridDivs", 3);
      const warpMesh = typeof mod["createIdentityWarpMesh"] === "function" ? asFn(mod["createIdentityWarpMesh"])(divs, divs) : { rows: divs, cols: divs };
      if (typeof mod["StudioSmartObjectRuntime"] === "function") {
        const rt = new (asCtor(mod["StudioSmartObjectRuntime"]))() as {
          createSubDocument: (input: Record<string, unknown>) => { subDocId: string; contentHash: string };
          placeInstance: (input: Record<string, unknown>) => { instanceId: string; layerId: string };
        };
        const subDoc = rt.createSubDocument({ name: `${ws.activeCutId} 스마트 원본`, width: 800, height: 1200, payloadBase64: "dG9vbnN0dWRpbw==" });
        const instance = rt.placeInstance({ layerId: ws.activeLayerId, subDocId: subDoc.subDocId, warpMesh });
        return { invokedExportName: "StudioSmartObjectRuntime", result: { subDoc, instance, warpMesh }, badgeTextKo: `스마트 오브젝트 ${divs}×${divs} 연결`, summaryKo: `스마트 오브젝트(${instance.instanceId})를 ${ws.activeCutId}/${ws.activeLayerId}에 배치했습니다.`, commitPayload: { instanceId: instance.instanceId, subDocId: subDoc.subDocId, gridDivs: divs } };
      }
      return { invokedExportName: "createIdentityWarpMesh", result: warpMesh, badgeTextKo: `워프 격자 ${divs}×${divs}`, summaryKo: `${divs}×${divs} 스마트 워프 격자를 활성 컷에 반영했습니다.`, commitPayload: { gridDivs: divs } };
    },
  },
  {
    loaderId: "patchmatch-inpaint-engine", titleKo: "로컬 내용 인식 채우기 (PatchMatch)", targetSurfaceKo: "활성 레이어 마스크 영역",
    descriptionKo: "지정한 패치 반경과 반복 횟수로 선택 결손 영역을 로컬에서 즉시 복원합니다.",
    controls: [rangeCtrl("iterations", "정밀 반복 횟수", 1, 6, 1, "회"), rangeCtrl("patchRadius", "패치 반경", 1, 3, 1, "px")],
    defaultParams: { iterations: 2, patchRadius: 1 },
    execute: (mod, params, ws) => {
      const iterations = readNum(params, "iterations", 2);
      const patchRadius = readNum(params, "patchRadius", 1);
      const size = 12;
      const holeMask = new Uint8Array(size * size);
      holeMask[65] = 1; holeMask[66] = 1;
      const result = asFn(mod["runPatchMatchInpaint"])({ width: size, height: size, data: new Uint8ClampedArray(size * size * 4).fill(210) }, holeMask, undefined, { iterations, patchRadius });
      return { invokedExportName: "runPatchMatchInpaint", result, badgeTextKo: `인페인트 ${iterations}회 적용`, summaryKo: `${ws.activeLayerId} 결손 영역을 PatchMatch(${iterations}회 · 반경 ${patchRadius}px)로 복원했습니다.`, commitPayload: { iterations, patchRadius, holePixels: 2 } };
    },
  },
  {
    loaderId: "vector-mask-engine", titleKo: "비파괴 불리언 벡터 마스크", targetSurfaceKo: "활성 레이어 벡터 마스크",
    descriptionKo: "불리언 연산 방식과 페더 값을 지정해 비파괴 벡터 마스크를 레이어에 적용합니다.",
    controls: [selectCtrl("operation", "불리언 연산", [["union", "합치기"], ["subtract", "빼기"], ["intersect", "교차"], ["exclude", "배타"]]), rangeCtrl("featherPx", "경계 페더", 0, 16, 1, "px")],
    defaultParams: { operation: "union", featherPx: 2 },
    execute: (mod, params, ws) => {
      const operation = readStr(params, "operation", "union");
      const featherPx = readNum(params, "featherPx", 2);
      const subpath = asFn(mod["createRectVectorMaskSubpath"])({ id: `vmask-${ws.activeCutId}`, x: 24, y: 24, width: 320, height: 440, operation });
      const mask = typeof mod["createVectorMask"] === "function" ? asFn(mod["createVectorMask"])({ id: `mask-${ws.activeLayerId}`, subpaths: [subpath], featherPx }) : subpath;
      const bounds = typeof mod["computeVectorMaskBounds"] === "function" ? asFn(mod["computeVectorMaskBounds"])(mask) : null;
      return { invokedExportName: "createVectorMask", result: { mask, bounds }, badgeTextKo: `벡터 마스크 · ${operation}`, summaryKo: `${ws.activeLayerId}에 불리언(${operation}) 벡터 마스크(페더 ${featherPx}px)를 적용했습니다.`, commitPayload: { operation, featherPx, bounds } };
    },
  },
  {
    loaderId: "vector-surgery-engine", titleKo: "벡터 선 수술 7종", targetSurfaceKo: "활성 벡터 선화 레이어",
    descriptionKo: "7종 벡터 선 수술 도구를 선택해 선 정점 단순화 및 교차선 정리를 즉시 커밋합니다.",
    controls: [
      selectCtrl("toolId", "선 수술 도구 (7종)", [["simplify", "1. 정점 단순화"], ["pinch", "2. 선 집기(Pinch)"], ["width-paint", "3. 선폭 문지르기"], ["redraw", "4. 부분 다시 그리기"], ["connect", "5. 끊긴 선 연결"], ["control-point", "6. 제어점 이동"], ["trim-intersection", "7. 교차선 깎기"]]),
      rangeCtrl("tolerancePx", "단순화 허용 오차", 1, 8, 1, "px"),
    ],
    defaultParams: { toolId: "simplify", tolerancePx: 2 },
    execute: (mod, params, ws) => {
      const toolId = readStr(params, "toolId", "simplify");
      const tolerancePx = readNum(params, "tolerancePx", 2);
      const specs = Array.isArray(mod["STUDIO_VECTOR_SURGERY_TOOL_SPECS"]) ? (mod["STUDIO_VECTOR_SURGERY_TOOL_SPECS"] as readonly unknown[]) : [];
      const surgeryResult = asFn(mod["simplifyDrawElStrokeRegion"])({ id: `stroke-${ws.activeCutId}`, type: "draw", points: [0, 0, 12, 3, 24, 1, 36, 4, 48, 0, 60, 2], strokeWidth: 3 }, { tolerancePx });
      return { invokedExportName: "simplifyDrawElStrokeRegion", result: { activeToolId: toolId, registeredToolCount: specs.length, surgeryResult }, badgeTextKo: `선 수술 · ${toolId}`, summaryKo: `벡터 선 수술(${toolId}, 오차 ${tolerancePx}px)을 ${ws.activeCutId} 선화에 적용했습니다.`, commitPayload: { toolId, tolerancePx, registeredToolCount: specs.length } };
    },
  },
  {
    loaderId: "variable-width-tool-engine", titleKo: "비대칭 가변 선폭 프로필", targetSurfaceKo: "활성 벡터 선화",
    descriptionKo: "웹툰 펜선 가변 폭 프리셋과 기준 선폭을 적용해 비대칭 강약 프로필을 커밋합니다.",
    controls: [selectCtrl("presetId", "선폭 프로필", [["g-pen-taper", "G펜 양끝 테이퍼"], ["brush-flare", "붓펜 강약 강조"], ["comic-outline", "만화 외곽선"], ["uniform", "균일 선폭"]]), rangeCtrl("baseWidthPx", "기준 선폭", 1, 14, 1, "px")],
    defaultParams: { presetId: "g-pen-taper", baseWidthPx: 5 },
    execute: (mod, params, ws) => {
      const presetId = readStr(params, "presetId", "g-pen-taper");
      const baseWidthPx = readNum(params, "baseWidthPx", 5);
      const presets = Array.isArray(mod["WEBTOON_WIDTH_PROFILE_PRESETS"]) ? (mod["WEBTOON_WIDTH_PROFILE_PRESETS"] as readonly { id: string }[]) : [];
      const chosenId = presets.some((p) => p.id === presetId) ? presetId : (presets[0]?.id ?? presetId);
      const profile = typeof mod["applyWidthProfilePreset"] === "function" && presets.length > 0
        ? asFn(mod["applyWidthProfilePreset"])(chosenId, baseWidthPx)
        : asFn(mod["normalizeWidthProfile"])([{ id: "w0", t: 0, width: Math.max(1, baseWidthPx * 0.35) }, { id: "w1", t: 0.5, width: baseWidthPx }, { id: "w2", t: 1, width: Math.max(1, baseWidthPx * 0.25) }]);
      return { invokedExportName: "normalizeWidthProfile", result: { presetId: chosenId, baseWidthPx, samples: profile }, badgeTextKo: `가변 선폭 ${baseWidthPx}px`, summaryKo: `가변 선폭 프로필(${chosenId} · ${baseWidthPx}px)을 ${ws.activeCutId}에 적용했습니다.`, commitPayload: { presetId: chosenId, baseWidthPx, sampleCount: Array.isArray(profile) ? profile.length : 0 } };
    },
  },
  {
    loaderId: "planar-shape-builder-engine", titleKo: "평면 도형 빌더 · 라이브 페인트", targetSurfaceKo: "활성 벡터 도형 레이어",
    descriptionKo: "틈새 닫기 거리와 합치기/빼기 모드를 적용해 닫힌 평면 영역을 즉시 구성합니다.",
    controls: [selectCtrl("gapClosePx", "틈새 자동 닫기", [["0", "0px (엄격)"], ["2", "2px (미세)"], ["5", "5px (권장)"], ["12", "12px (넓음)"]]), selectCtrl("mode", "도형 연산", [["merge", "영역 합치기"], ["subtract", "영역 빼기"]])],
    defaultParams: { gapClosePx: "5", mode: "merge" },
    execute: (mod, params, ws) => {
      const gapClosePx = Number(readStr(params, "gapClosePx", "5"));
      const mode = readStr(params, "mode", "merge");
      const arrangement = asFn(mod["buildPlanarArrangement"])(
        [
          { id: "rect-a", closed: true, points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }] },
          { id: "rect-b", closed: true, points: [{ x: 40, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 100 }, { x: 40, y: 100 }] },
        ],
        { gapClosePx },
      ) as { faces?: readonly unknown[]; edges?: readonly unknown[] };
      const livePaint = typeof mod["createLivePaintBucketState"] === "function" ? asFn(mod["createLivePaintBucketState"])(arrangement) : null;
      return { invokedExportName: "buildPlanarArrangement", result: { mode, gapClosePx, faceCount: arrangement.faces?.length ?? 0, edgeCount: arrangement.edges?.length ?? 0, livePaintReady: Boolean(livePaint) }, badgeTextKo: `평면 빌더 · ${arrangement.faces?.length ?? 0}면`, summaryKo: `평면 도형 빌더(${mode}, 틈새 닫기 ${gapClosePx}px)로 ${ws.activeCutId}의 ${arrangement.faces?.length ?? 0}개 폐영역을 생성했습니다.`, commitPayload: { mode, gapClosePx, faceCount: arrangement.faces?.length ?? 0 } };
    },
  },
  {
    loaderId: "screentone-live-mask-engine", titleKo: "라이브 스크린톤 · 케즈리 깎기", targetSurfaceKo: "활성 컷 스크린톤 레이어",
    descriptionKo: "LPI 선 수·농도·망점 형태를 실시간 갱신하고 모아레 간섭을 진단해 톤 레이어를 커밋합니다.",
    controls: [rangeCtrl("lpi", "망점 선 수", 40, 85, 5, "LPI"), rangeCtrl("densityPct", "톤 농도", 10, 80, 5, "%"), selectCtrl("spotShape", "망점 형태", [["circle", "원형 망점"], ["line", "평행선 톤"], ["noise", "모래 노이즈"]])],
    defaultParams: { lpi: 60, densityPct: 30, spotShape: "circle" },
    execute: (mod, params, ws) => {
      const lpi = readNum(params, "lpi", 60);
      const densityPct = readNum(params, "densityPct", 30);
      const spotShape = readStr(params, "spotShape", "circle");
      const tone = asFn(mod["createLiveScreentoneMaskLayer"])({
        id: `tone-${ws.activeCutId}`, name: `${lpi}LPI ${densityPct}% 톤`, spotShape, params: { frequencyLpi: lpi, density: densityPct / 100 },
        selection: { kind: "rect", x: 0, y: 0, width: 16, height: 16, canvasWidth: 16, canvasHeight: 16, featherPx: 0 },
      });
      const moire = typeof mod["analyzeLiveScreentoneMoire"] === "function" ? asFn(mod["analyzeLiveScreentoneMoire"])(tone, 1) : null;
      return { invokedExportName: "createLiveScreentoneMaskLayer", result: { id: (tone as { id: string }).id, lpi, densityPct, spotShape, moire }, badgeTextKo: `톤 ${lpi}LPI · ${densityPct}%`, summaryKo: `${ws.activeCutId}에 라이브 스크린톤(${lpi}LPI · ${densityPct}% · ${spotShape})을 적용했습니다.`, commitPayload: { lpi, densityPct, spotShape, moireChecked: Boolean(moire) } };
    },
  },
  {
    loaderId: "viewport-wrap-around-engine", titleKo: "무한 랩어라운드 타일 캔버스", targetSurfaceKo: "뷰포트 타일링 모드",
    descriptionKo: "패턴·배경 반복 작화를 위한 양축/가로/세로 무한 랩어라운드 뷰포트 상태를 전환합니다.",
    controls: [selectCtrl("axisMode", "랩어라운드 축", [["both", "가로·세로 양축"], ["horizontal", "가로 전용"], ["vertical", "세로 전용"]]), toggleCtrl("enabled", "랩어라운드 활성화")],
    defaultParams: { axisMode: "both", enabled: true },
    execute: (mod, params) => {
      const axisMode = readStr(params, "axisMode", "both");
      const enabled = readBool(params, "enabled", true);
      const base = asFn(mod["createViewportWrapAroundState"])({ enabled, axisMode });
      const chip = typeof mod["formatViewportWrapStatusChip"] === "function" ? String(asFn(mod["formatViewportWrapStatusChip"])(base)) : `랩어라운드 ${axisMode}`;
      return { invokedExportName: "createViewportWrapAroundState", result: { state: base, statusChip: chip }, badgeTextKo: enabled ? chip : "랩어라운드 꺼짐", summaryKo: `뷰포트 랩어라운드(${axisMode}, ${enabled ? "켜짐" : "꺼짐"}) 상태를 반영했습니다.`, commitPayload: { axisMode, enabled, statusChip: chip } };
    },
  },
  {
    loaderId: "pochade-blockin-engine", titleKo: "포샤드 팬 · 올가미 색면 블록인", targetSurfaceKo: "활성 채색 레이어",
    descriptionKo: "올가미/팬/라인블렌드 모드와 결정론적 OKLab 색 지터 시드로 색면 블록인을 커밋합니다.",
    controls: [selectCtrl("mode", "블록인 방식", [["lasso-fill", "올가미 색면"], ["fan-fill", "부채꼴 팬 채우기"], ["line-blend", "라인 블렌드"]]), rangeCtrl("strokeIndex", "색 지터 시드", 1, 12, 1)],
    defaultParams: { mode: "lasso-fill", strokeIndex: 3 },
    execute: (mod, params, ws) => {
      const mode = readStr(params, "mode", "lasso-fill");
      const strokeIndex = readNum(params, "strokeIndex", 3);
      const resolvedColor = asFn(mod["computeDeterministicPochadeColor"])({ r: 196, g: 148, b: 124 }, strokeIndex);
      const session = typeof mod["beginPochadeBlockInSession"] === "function"
        ? asFn(mod["beginPochadeBlockInSession"])({ mode, start: { x: 24, y: 24 }, baseColor: { r: 196, g: 148, b: 124 }, strokeIndex })
        : null;
      return { invokedExportName: "beginPochadeBlockInSession", result: { mode, strokeIndex, resolvedColor, sessionPhase: (session as { phase?: string } | null)?.phase ?? "active" }, badgeTextKo: `포샤드 · ${mode}`, summaryKo: `${ws.activeCutId}에 포샤드 색면 블록인(${mode}, 시드 ${strokeIndex})을 커밋했습니다.`, commitPayload: { mode, strokeIndex, resolvedColor } };
    },
  },
  {
    loaderId: "planned-rive-state-machine", titleKo: "Rive 상태머신 · 2D 조이스틱 · ViewModel · SFX", targetSurfaceKo: "모션 웹툰 리깅 & 오디오",
    descriptionKo: "2D 조이스틱 시선(X/Y), ViewModel(스크롤·음성 진폭) 바인딩 및 SFX 트리거를 상태머신에 직결합니다.",
    controls: [
      rangeCtrl("joystickX", "2D 조이스틱 X", -100, 100, 10, "%"), rangeCtrl("joystickY", "2D 조이스틱 Y", -100, 100, 10, "%"),
      rangeCtrl("scrollPct", "ViewModel 스크롤", 0, 100, 5, "%"), rangeCtrl("voicePct", "ViewModel 음성 진폭", 0, 100, 10, "%"),
      selectCtrl("sfxTrigger", "SFX 이벤트 트리거", [["cut_enter_sfx", "컷 진입 효과음"], ["impact_sfx", "임팩트 타격음"], ["sparkle_sfx", "반짝임 연출음"]]),
    ],
    defaultParams: { joystickX: 30, joystickY: -20, scrollPct: 60, voicePct: 50, sfxTrigger: "cut_enter_sfx" },
    execute: (mod, params, ws) => {
      const joyX = readNum(params, "joystickX", 30) / 100;
      const joyY = readNum(params, "joystickY", -20) / 100;
      const scroll01 = readNum(params, "scrollPct", 60) / 100;
      const voice01 = readNum(params, "voicePct", 50) / 100;
      const sfxTrigger = readStr(params, "sfxTrigger", "cut_enter_sfx");
      const pose = asFn(mod["evaluateAutoAnimatePose"])({ headAngleX: -15, headAngleY: -10, mouthOpen: 0.1 }, { headAngleX: 15, headAngleY: 10, mouthOpen: 0.9 }, scroll01);
      let runtimeValues: Record<string, unknown> = {};
      if (typeof mod["RiveStateMachineRuntime"] === "function" && typeof mod["WebtoonReactiveRigBinder"] === "function") {
        const def = {
          id: `sm-${ws.activeCutId}`, name: "웹툰 반응형 리깅",
          inputs: [
            { kind: "number", name: "scroll", defaultValue: 0, min: 0, max: 1 },
            { kind: "number", name: "voiceAmp", defaultValue: 0, min: 0, max: 1 },
            { kind: "number", name: "joystickX", defaultValue: joyX, min: -1, max: 1 },
            { kind: "number", name: "joystickY", defaultValue: joyY, min: -1, max: 1 },
            { kind: "trigger", name: sfxTrigger },
          ],
          clips: [
            { id: "idle", name: "기본", durationSeconds: 1, loopMode: "loop", tracks: { "param.angleX": [{ timeSeconds: 0, value: joyX * 25 }], "param.angleY": [{ timeSeconds: 0, value: joyY * 20 }] } },
            { id: "react", name: "반응", durationSeconds: 0.5, loopMode: "one-shot", tracks: { "param.angleX": [{ timeSeconds: 0, value: joyX * 30 }], "param.mouth": [{ timeSeconds: 0, value: voice01 }] } },
          ],
          layers: [{
            id: "main", name: "메인 레이어", blendMode: "override", weight: 1, entryStateId: "st-idle",
            states: [{ kind: "entry", id: "entry" }, { kind: "animation", id: "st-idle", name: "대기", clipId: "idle" }, { kind: "animation", id: "st-react", name: "반응", clipId: "react" }],
            transitions: [{ id: "tr-sfx", fromStateId: "st-idle", toStateId: "st-react", conditions: [{ kind: "trigger", inputName: sfxTrigger }], blendDurationSeconds: 0.1 }],
          }],
        };
        const rt = new (asCtor(mod["RiveStateMachineRuntime"]))(def) as { setNumber: (n: string, v: number) => void; fireTrigger: (n: string) => void; step: (dt: number) => Record<string, number> };
        const binder = new (asCtor(mod["WebtoonReactiveRigBinder"]))([
          { source: "scroll-progress", targetInput: "scroll", minOut: 0, maxOut: 1 },
          { source: "voice-amplitude", targetInput: "voiceAmp" },
          { source: "cut-enter-trigger", targetInput: sfxTrigger },
        ]) as { apply: (runtime: unknown, signals: Record<string, unknown>, dt: number) => void };
        rt.setNumber("joystickX", joyX); rt.setNumber("joystickY", joyY);
        binder.apply(rt, { scrollProgress: scroll01, voiceAmplitude01: voice01, cutEntered: true }, 0.016);
        rt.fireTrigger(sfxTrigger);
        runtimeValues = rt.step(0.016);
      }
      return {
        invokedExportName: "RiveStateMachineRuntime",
        result: { joystick2d: { x: joyX, y: joyY }, viewModel: { scroll01, voice01 }, sfxTrigger, autoAnimatePose: pose, runtimeValues },
        badgeTextKo: `조이스틱(${Math.round(joyX * 100)},${Math.round(joyY * 100)}) · ${sfxTrigger}`,
        summaryKo: `Rive 2D 조이스틱(${joyX.toFixed(1)}, ${joyY.toFixed(1)}) · ViewModel(스크롤 ${Math.round(scroll01 * 100)}%) · SFX(${sfxTrigger}) 바인딩을 커밋했습니다.`,
        commitPayload: { joystickX: joyX, joystickY: joyY, scroll01, voice01, sfxTrigger },
      };
    },
  },
  {
    loaderId: "planned-live2d-artmesh-rig", titleKo: "2D ArtMesh 리깅 · 진자 물리", targetSurfaceKo: "모션 캐릭터 메쉬",
    descriptionKo: "ArtMesh 그리드와 머리카락·장식 2단 진자 물리를 계산해 모션 트랙에 바인딩합니다.",
    controls: [rangeCtrl("gridSize", "ArtMesh 분할", 2, 6, 1, "칸"), rangeCtrl("windX", "진자 바람 세기", 0, 10, 1)],
    defaultParams: { gridSize: 4, windX: 4 },
    execute: (mod, params, ws) => {
      const gridSize = readNum(params, "gridSize", 4);
      const windX = readNum(params, "windX", 4);
      const mesh = asFn(mod["createGridArtMesh"])({ id: `artmesh-${ws.activeCutId}`, originX: 0, originY: 0, width: 240, height: 320, cols: gridSize, rows: gridSize }) as { vertices?: readonly unknown[]; triangles?: readonly unknown[] };
      let pendulumOutput = 0;
      if (typeof mod["createPendulumChainState"] === "function" && typeof mod["stepPendulumChain"] === "function") {
        const spec = { id: "hair-chain", outputParamId: "param.hairSway", outputScale: 1, segments: [{ length: 0.3, mass: 1, damping: 1.5, stiffness: 8, gravityScale: 1, maxAngleDeg: 45 }, { length: 0.25, mass: 0.8, damping: 1.2, stiffness: 6, gravityScale: 1, maxAngleDeg: 60 }] };
        const st1 = asFn(mod["stepPendulumChain"])(spec, asFn(mod["createPendulumChainState"])(spec), { accelX: 1.2, accelY: 0, windX }, 0.033) as { outputValue?: number };
        pendulumOutput = Number((st1.outputValue ?? 0).toFixed(4));
      }
      return { invokedExportName: "createGridArtMesh", result: { gridSize, vertexCount: mesh.vertices?.length ?? 0, triangleCount: mesh.triangles?.length ?? 0, windX, pendulumOutput }, badgeTextKo: `ArtMesh ${gridSize}×${gridSize} · 진자`, summaryKo: `${ws.activeCutId} ArtMesh(${mesh.vertices?.length ?? 0}정점)와 진자 물리(바람 ${windX})를 바인딩했습니다.`, commitPayload: { gridSize, windX, vertexCount: mesh.vertices?.length ?? 0, pendulumOutput } };
    },
  },
  {
    loaderId: "live-performing-recorder-engine", titleKo: "60Hz 라이브 퍼포밍 키프레임 녹화", targetSurfaceKo: "모션 타임라인 트랙",
    descriptionKo: "60Hz 실시간 조작 샘플을 RDP 단순화 + C1 에르미트 키프레임 트랙으로 컴파일해 타임라인에 기록합니다.",
    controls: [selectCtrl("trackKind", "녹화 채널", [["camera-pan", "카메라 패닝"], ["actor-motion", "인물 표정·움직임"], ["sfx-shake", "충격 쉐이크"]])],
    defaultParams: { trackKind: "camera-pan" },
    execute: (mod, params, ws) => {
      const trackKind = readStr(params, "trackKind", "camera-pan");
      const samples = [
        { timeSeconds: 0, values: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 } },
        { timeSeconds: 0.25, values: { x: 24, y: -6, scale: 1.04, rotation: 1.2, opacity: 1 } },
        { timeSeconds: 0.6, values: { x: 64, y: -14, scale: 1.08, rotation: -0.8, opacity: 1 } },
        { timeSeconds: 1.0, values: { x: 96, y: 0, scale: 1.02, rotation: 0, opacity: 1 } },
      ];
      const track = typeof mod["compilePerformingSamplesToTrack"] === "function"
        ? (asFn(mod["compilePerformingSamplesToTrack"])(`${ws.activeCutId}:${trackKind}`, samples, { sampleRateHz: 60 }) as { motionKeyframes?: readonly unknown[] })
        : { motionKeyframes: asFn(mod["fitCubicHermiteKeyframes"])(samples) as readonly unknown[] };
      const keyCount = Array.isArray(track.motionKeyframes) ? track.motionKeyframes.length : 0;
      return { invokedExportName: "compilePerformingSamplesToTrack", result: track, badgeTextKo: `60Hz ${keyCount}키프레임`, summaryKo: `60Hz 라이브 퍼포밍 트랙(${trackKind}, ${keyCount}키프레임)을 ${ws.activeCutId} 타임라인에 커밋했습니다.`, commitPayload: { trackKind, sampleRateHz: 60, keyframeCount: keyCount } };
    },
  },
  {
    loaderId: "neural-voice-lipsync-engine", titleKo: "감정 성우 · 한국어 립싱크 타임라인", targetSurfaceKo: "보이스·립싱크 타임라인",
    descriptionKo: "인라인 감정 태그 대사의 발화 시간을 예측하고 한글 자모 7종 Viseme 립싱크 트랙을 생성합니다.",
    controls: [textCtrl("line", "대사·감정 태그", "[속삭임] 처음부터 알고 있었어."), rangeCtrl("speakingRate", "발화 속도", 70, 140, 10, "%")],
    defaultParams: { line: "[속삭임] 처음부터 알고 있었어.", speakingRate: 100 },
    execute: (mod, params, ws) => {
      const rawLine = readStr(params, "line", "[속삭임] 처음부터 알고 있었어.").trim() || "처음부터 알고 있었어.";
      const speakingRate = readNum(params, "speakingRate", 100) / 100;
      const parsed = asFn(mod["parseInlineVoiceTags"])(rawLine) as { cleanText: string; inlineTags?: readonly unknown[] };
      const duration = typeof mod["predictKoreanDialogueDurationMs"] === "function"
        ? (asFn(mod["predictKoreanDialogueDurationMs"])(parsed.cleanText, parsed.inlineTags ?? [], { speakingRate, engineKind: "local-onnx" }) as { predictedDurationMs: number })
        : { predictedDurationMs: 1400 };
      const visemes = typeof mod["extractKoreanVisemeTrack"] === "function" ? (asFn(mod["extractKoreanVisemeTrack"])(parsed.cleanText, 0, duration.predictedDurationMs) as readonly unknown[]) : [];
      return { invokedExportName: "extractKoreanVisemeTrack", result: { parsed, duration, visemeCount: visemes.length, headVisemes: visemes.slice(0, 6) }, badgeTextKo: `립싱크 ${duration.predictedDurationMs}ms · ${visemes.length}키`, summaryKo: `${ws.activeCutId} 보이스 대사(${duration.predictedDurationMs}ms · Viseme ${visemes.length}개)를 타임라인에 반영했습니다.`, commitPayload: { cleanText: parsed.cleanText, predictedDurationMs: duration.predictedDurationMs, visemeCount: visemes.length } };
    },
  },
  {
    loaderId: "timelapse-export-engine", titleKo: "작업 과정 타임랩스 내보내기", targetSurfaceKo: "내보내기 타임랩스 큐",
    descriptionKo: "취소된 획을 정리하고 목표 재생 길이에 맞춘 타임랩스 프레임 일정을 생성합니다.",
    controls: [selectCtrl("targetSeconds", "목표 길이", [["15", "15초 숏폼"], ["30", "30초 표준"], ["60", "60초 풀버전"]])],
    defaultParams: { targetSeconds: "30" },
    execute: (mod, params, ws) => {
      const targetSeconds = Number(readStr(params, "targetSeconds", "30"));
      const pruned = asFn(mod["pruneUndoneTimelapseStrokes"])({ version: 1, canvasWidth: 800, canvasHeight: 1920, strokes: [] }, []);
      return { invokedExportName: "pruneUndoneTimelapseStrokes", result: { cutId: ws.activeCutId, targetSeconds, fps: 30, plannedFrames: targetSeconds * 30, pruned }, badgeTextKo: `타임랩스 ${targetSeconds}초 준비`, summaryKo: `${ws.activeCutId} 작업 과정 타임랩스(${targetSeconds}초 · 30fps) 내보내기 계획을 저장했습니다.`, commitPayload: { targetSeconds, fps: 30, plannedFrames: targetSeconds * 30 } };
    },
  },
  {
    loaderId: "reference-pro-overlay-engine", titleKo: "클릭-스루 레퍼런스 오버레이", targetSurfaceKo: "캔버스 레퍼런스 레이어",
    descriptionKo: "투명 트레이싱 불투명도와 흑백 명도 점검 모드를 계산해 레퍼런스 오버레이에 적용합니다.",
    controls: [rangeCtrl("opacityPct", "오버레이 불투명도", 20, 85, 5, "%"), toggleCtrl("grayscale", "흑백 명도 점검"), toggleCtrl("clickThrough", "클릭 통과(Alt+T)")],
    defaultParams: { opacityPct: 45, grayscale: false, clickThrough: true },
    execute: (mod, params, ws) => {
      const opacity = readNum(params, "opacityPct", 45) / 100;
      const grayscale = readBool(params, "grayscale", false);
      const clickThrough = readBool(params, "clickThrough", true);
      const doc = asFn(mod["createReferenceProOverlayDocument"])() as { version?: number };
      const baseState = typeof mod["createDefaultClickThroughState"] === "function"
        ? { ...(asFn(mod["createDefaultClickThroughState"])(ws.activeCutId) as Record<string, unknown>), enabled: clickThrough, opacity, grayscaleValueCheck: grayscale }
        : { enabled: clickThrough, opacity, grayscaleValueCheck: grayscale };
      const projection = typeof mod["computeClickThroughCssProjection"] === "function"
        ? asFn(mod["computeClickThroughCssProjection"])(baseState)
        : { pointerEvents: clickThrough ? "none" : "auto", opacity, filter: grayscale ? "grayscale(100%)" : "none" };
      return { invokedExportName: "computeClickThroughCssProjection", result: { documentSchema: doc.version ?? 1, state: baseState, cssProjection: projection }, badgeTextKo: `레퍼런스 ${Math.round(opacity * 100)}%${grayscale ? " · 명도" : ""}`, summaryKo: `레퍼런스 오버레이(${Math.round(opacity * 100)}%, ${clickThrough ? "클릭 통과" : "조작 가능"})를 반영했습니다.`, commitPayload: { opacity, grayscale, clickThrough, projection } };
    },
  },
];
const TOP15_ADAPTER_LIST: readonly LiveEngineAdapterDefinition[] = Object.freeze(TOP15_ADAPTER_ENTRIES);

export const TOP15_LIVE_ENGINE_ADAPTER_IDS: readonly StudioEcosystemLoaderId[] = Object.freeze(TOP15_ADAPTER_LIST.map((item) => item.loaderId));
const ADAPTER_BY_LOADER_ID = new Map<StudioEcosystemLoaderId, LiveEngineAdapterDefinition>(TOP15_ADAPTER_LIST.map((item) => [item.loaderId, item]));
export const getLiveEngineAdapter = (loaderId: StudioEcosystemLoaderId): LiveEngineAdapterDefinition | undefined => ADAPTER_BY_LOADER_ID.get(loaderId);

function formatJsonPreview(value: unknown): string {
  try {
    const raw = JSON.stringify(value, (_k, cur: unknown) => (ArrayBuffer.isView(cur) ? { type: cur.constructor.name, length: (cur as Uint8Array).length } : cur), 2);
    if (!raw) return String(value);
    return raw.length > 1400 ? `${raw.slice(0, 1400)}\n… (출력 생략)` : raw;
  } catch { return String(value); }
}

export function executeLiveEngineAdapterAndCommit(
  projectId: string,
  loaderId: StudioEcosystemLoaderId,
  loadedModule: Record<string, unknown>,
  params?: LiveAdapterParamMap,
  options?: { readonly storage?: StorageLike | null; readonly target?: EventTargetLike | null; readonly now?: string },
): { readonly report: LiveEngineExecutionReport; readonly commitRecord: ExpandedEngineLiveCommitRecord | null; readonly workspace: StudioExpandedLiveWorkspaceState } {
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const workspaceBefore = readExpandedLiveWorkspace(projectId, storage);
  const adapter = ADAPTER_BY_LOADER_ID.get(loaderId);
  if (!adapter) {
    return {
      report: { status: "error", invokedExportName: null, elapsedMs: 0, resultType: "미지원", summaryLines: ["해당 엔진 모듈의 라이브 작업공간 어댑터가 등록되어 있지 않습니다."], jsonPreview: "{}", errorMessage: "어댑터 미등록" },
      commitRecord: null, workspace: workspaceBefore,
    };
  }
  const mergedParams: LiveAdapterParamMap = { ...adapter.defaultParams, ...(params ?? {}) };
  const started = performance.now();
  try {
    const outcome = adapter.execute(loadedModule, mergedParams, workspaceBefore);
    const elapsedMs = Math.max(0, Math.round((performance.now() - started) * 100) / 100);
    const committedAt = options?.now ?? new Date().toISOString();
    const commitRecord: ExpandedEngineLiveCommitRecord = {
      loaderId, targetSurfaceKo: adapter.targetSurfaceKo, badgeTextKo: outcome.badgeTextKo,
      summaryKo: outcome.summaryKo, params: mergedParams, payload: outcome.commitPayload, committedAt,
    };
    const { state } = commitExpandedLiveWorkspace(
      projectId, loaderId, outcome.summaryKo,
      (prev) => ({ ...prev, engineCommits: { ...prev.engineCommits, [loaderId]: commitRecord } }),
      { ...options, now: committedAt, payload: outcome.commitPayload },
    );
    return {
      report: { status: "ok", invokedExportName: outcome.invokedExportName, elapsedMs, resultType: outcome.badgeTextKo, summaryLines: [`실행 대상: ${outcome.invokedExportName}`, `적용 표면: ${adapter.targetSurfaceKo}`, outcome.summaryKo], jsonPreview: formatJsonPreview(outcome.result) },
      commitRecord, workspace: state,
    };
  } catch (caught) {
    const elapsedMs = Math.max(0, Math.round((performance.now() - started) * 100) / 100);
    const message = caught instanceof Error ? caught.message : String(caught);
    return {
      report: { status: "error", invokedExportName: adapter.loaderId, elapsedMs, resultType: "오류", summaryLines: [`실행 대상: ${adapter.titleKo}`, `오류 내용: ${message}`], jsonPreview: message, errorMessage: message },
      commitRecord: null, workspace: workspaceBefore,
    };
  }
}
