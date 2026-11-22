import { collectSceneMaterialBindings, copyTextureSampling, type BaseColorMaterial } from "./studio-vrm-texture-paint-material-bindings";
import { StudioVrmPaintMaterialView } from "./studio-vrm-paint-material-view";
import * as THREE from "three";

import { runStudioVrmTextureFillWorker, type StudioVrmTextureFillWorkerClientOptions, type StudioVrmTextureFillWorkerClientResult } from "./studio-vrm-texture-fill-worker-client";
import {
  precomputeStudioVrmTextureGeometryIndex,
  type StudioVrmTextureGeometryIndex,
  type StudioVrmTextureGeometryLike,
  type StudioVrmTextureGeometryPrecomputeOptions,
} from "./studio-vrm-texture-geometry-index";
import {
  isCanonicalStudioVrmTexturePaintBindingDescriptor as isCanonicalBindingDescriptor,
  type StudioVrmTexturePaintBindingDescriptor,
} from "./studio-vrm-texture-paint-binding";
import {
  canonicalizeStudioVrmTexturePaintChannel,
  type StudioVrmTexturePaintChannel,
} from "./studio-vrm-texture-paint-channel";
import {
  applyTextureFillHistoryPixels,
  bakeSurfaceBrushOperations,
  isTextureFillTransientAdmissible,
  isValidTextureFillRect,
  normalizeScalarOrEmissiveChannelRegion,
  prepareTextureFillSelection,
  snapshotFillBeforeRgb,
  textureFillHistoryBytes,
  textureFillResultMatchesSeed,
  type PreparedFillSelection,
} from "./studio-vrm-texture-paint-fill-bake";
import {
  DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS,
  RGBA_CHANNELS,
  STUDIO_VRM_TEXTURE_PAINT_STANDARD_GEOMETRY_MAX_TRIANGLES,
  STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES,
  StudioVrmTexturePaintFault,
  admitHistoryPeakStack,
  boundedByteBudget,
  boundedInteger,
  buildTexturePaintRuntimeSnapshot,
  canonicalizeStudioVrmSurfaceIslandId,
  captureHistoryCheckpointStack,
  clearFutureHistoryStack,
  estimateStudioVrmTexturePaintTargetResidentBytes,
  evictHistoryStack,
  failure,
  frozenError,
  logicalRgbaToResidentBytes,
  removeTargetHistoryStack,
  restoreHistoryCheckpointStack,
  saturatedByteSum,
  success,
  type FillHistoryRecordBase,
  type HistoryCheckpointState,
  type HistoryStackState,
  type StrokeHistoryRecordBase,
  type StudioVrmTexturePaintHistorySnapshot,
  type StudioVrmTexturePaintRuntimeError,
  type StudioVrmTexturePaintRuntimeErrorCode,
  type StudioVrmTexturePaintRuntimeGuidance,
  type StudioVrmTexturePaintRuntimeGuidanceCode,
  type StudioVrmTexturePaintRuntimeResult,
  type StudioVrmTexturePaintRuntimeSnapshot,
  type StudioVrmTexturePaintRuntimeStatus,
  type StudioVrmTexturePaintTargetSnapshot,
} from "./studio-vrm-texture-paint-history-snapshot";
import {
  StudioVrmTexturePaintMaterialChannels,
  studioVrmMaterialSupportsPaintChannel,
} from "./studio-vrm-texture-paint-material";
import {
  applyStudioVrmTexturePaintOp,
  EMPTY_STUDIO_VRM_TEXTURE_RECT,
  parseStudioVrmTextureColor,
  studioVrmTexturePaintOpRects,
  unionStudioVrmTextureRect,
  type StudioVrmTexturePaintApplyOptions,
  type StudioVrmTexturePaintOp,
} from "./studio-vrm-texture-paint-ops";
import {
  buildSurfaceProjectionFromHit,
  canCoalesceStrokeSample,
  collectGeometryPrewarmJobs,
  copyStrokeStyle,
  createDefaultImageReader,
  defaultCanvasFactory,
  disposeCanvas,
  finiteUv,
  finiteWorld,
  flipRgbaRowsInPlace,
  isCompressedTexture,
  isUsableFaceIndex,
  isValidStrokeStyle,
  isValidSurfacePaintOperation,
  markMaterialChanged,
  materialAtHit,
  objectBelongsToScene,
  paintWrapOptions,
  pixelsEqual,
  resolveHitIslandAndDensity,
  sameResolvedBaseColorHit,
  sampleResolvedTextureColor,
  sourceTargetId,
  textureImageDimensions,
  textureSamplingSignature,
  textureWrapMode,
  type GeometryPrewarmJob,
  type StudioVrmTexturePaintCanvasFactory,
  type StudioVrmTexturePaintColorSample,
  type StudioVrmTexturePaintImageReader,
  type StudioVrmTexturePaintReadableImage,
  type StudioVrmTexturePaintSurfaceProjection,
  type TextureSamplingSignature,
} from "./studio-vrm-texture-paint-projection";
import { createStudioVrmTextureStrokeWalker, type StudioVrmTextureStrokeWalker } from "./studio-vrm-texture-stroke-walker";
import { applyStudioVrmTextureUndoEntry, createStudioVrmTextureUndoRecorder, studioVrmTextureUndoEntryBytes, type StudioVrmTextureUndoRecorder } from "./studio-vrm-texture-undo";
import {
  isStudioVrmTextureSize,
  resolveStudioVrmTexelIndex,
  type StudioVrmTextureSize,
  type StudioVrmTextureRect,
  type StudioVrmUvPoint,
  type StudioVrmTextureWrapMode,
} from "./studio-vrm-texture-uv";

import type {
  StudioVrmTextureFillRequest,
  StudioVrmTextureFillScope,
} from "./studio-vrm-texture-fill";
import type {
  StudioVrmTextureStrokePlanOptions,
  StudioVrmTextureStrokeSample,
  StudioVrmTextureStrokeStyle,
} from "./studio-vrm-texture-stroke";
import type { StudioVrmSurfacePaintSettings } from "./studio-vrm-scene-document";
import type { StudioVrmPaintPresentation } from "./studio-vrm-texture-paint-presentation";

type PresentedLease = NonNullable<ReturnType<StudioVrmPaintPresentation["release"]>>;

export {
  DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS,
  STUDIO_VRM_TEXTURE_PAINT_STANDARD_GEOMETRY_MAX_TRIANGLES,
  STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES,
  canonicalizeStudioVrmSurfaceIslandId,
  estimateStudioVrmTexturePaintTargetResidentBytes,
};
export type {
  StudioVrmTexturePaintCanvasFactory,
  StudioVrmTexturePaintColorSample,
  StudioVrmTexturePaintHistorySnapshot,
  StudioVrmTexturePaintImageReader,
  StudioVrmTexturePaintReadableImage,
  StudioVrmTexturePaintRuntimeError,
  StudioVrmTexturePaintRuntimeErrorCode,
  StudioVrmTexturePaintRuntimeGuidance,
  StudioVrmTexturePaintRuntimeGuidanceCode,
  StudioVrmTexturePaintRuntimeResult,
  StudioVrmTexturePaintRuntimeSnapshot,
  StudioVrmTexturePaintRuntimeStatus,
  StudioVrmTexturePaintSurfaceProjection,
  StudioVrmTexturePaintTargetSnapshot,
};

export interface StudioVrmTexturePaintRayHit {
  readonly object: THREE.Object3D;
  readonly uv?: THREE.Vector2 | Readonly<{ x: number; y: number }>;
  readonly uv1?: THREE.Vector2 | Readonly<{ x: number; y: number }>;
  readonly face?: Readonly<{ materialIndex: number }> | null;
  /** Raycaster가 제공하는 geometry triangle index. */
  readonly faceIndex?: number | null;
  readonly point?: THREE.Vector3 | Readonly<{ x: number; y: number; z: number }>;
}

/**
 * Opaque lease for one externally planned surface-brush transaction.
 *
 * The runtime validates object identity, not only these diagnostic fields, so
 * callers cannot forge a lease and mutate an unrelated texture target.
 */
export interface StudioVrmTexturePaintSurfaceSession {
  readonly id: string;
  readonly targetId: string;
  readonly width: number;
  readonly height: number;
  readonly wrapU: StudioVrmTextureWrapMode;
  readonly wrapV: StudioVrmTextureWrapMode;
}

export interface StudioVrmTexturePaintSurfacePrepareInput {
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly pressure?: number;
  readonly signal?: AbortSignal;
}

export interface StudioVrmTexturePaintPreparedSurface {
  readonly session: StudioVrmTexturePaintSurfaceSession;
  readonly projection: StudioVrmTexturePaintSurfaceProjection;
}

export interface StudioVrmTexturePaintSurfaceCommitInput {
  readonly operations: readonly StudioVrmTexturePaintOp[];
  readonly signal?: AbortSignal;
}

export interface StudioVrmTexturePaintSurfaceCommitReceipt {
  readonly appliedOperations: number;
  readonly changedTexels: number;
  readonly revision: number;
}

export interface StudioVrmTexturePaintStrokeBegin {
  readonly pointerId: number;
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly pressure?: number;
  readonly style: StudioVrmTextureStrokeStyle;
  readonly planOptions?: Omit<
    StudioVrmTextureStrokePlanOptions,
    "flipV" | "wrapU" | "wrapV"
  >;
}

export interface StudioVrmTexturePaintStrokeMove {
  readonly pointerId: number;
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly pressure?: number;
}

export interface StudioVrmTexturePaintColorSampleInput {
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly signal?: AbortSignal;
}

export interface StudioVrmTexturePaintFillInput {
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly color: string;
  readonly tolerance: number;
  readonly scope: StudioVrmTextureFillScope;
  readonly signal?: AbortSignal;
}

export {
  STUDIO_VRM_TEXTURE_PAINT_BASE_COLOR_SLOT,
  STUDIO_VRM_TEXTURE_PAINT_MATERIAL_LOCATOR_USER_DATA_KEY,
  stampStudioVrmTexturePaintMaterialLocator,
} from "./studio-vrm-texture-paint-binding";
export type { StudioVrmTexturePaintBindingDescriptor } from "./studio-vrm-texture-paint-binding";

export interface StudioVrmTexturePaintExportTarget {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /**
   * Caller-owned RGBA8 copy. The runtime never transfers or mutates this buffer after return.
   * Exporters should encode one target at a time and release the buffer promptly.
   */
  readonly pixels: Uint8ClampedArray;
  readonly bindings: readonly StudioVrmTexturePaintBindingDescriptor[];
}

export interface StudioVrmTexturePaintRehydrateTarget {
  readonly binding: StudioVrmTexturePaintBindingDescriptor;
  /** Ownership of the RGBA buffer is transferred for the duration of this call. */
  readonly image: StudioVrmTexturePaintReadableImage;
  readonly signal?: AbortSignal;
}

export type StudioVrmTexturePaintGeometryPrecomputer = (
  geometry: StudioVrmTextureGeometryLike,
  options: StudioVrmTextureGeometryPrecomputeOptions,
) => Promise<StudioVrmTextureGeometryIndex>;

export type StudioVrmTextureFillRunner = (
  request: StudioVrmTextureFillRequest,
  options?: StudioVrmTextureFillWorkerClientOptions,
) => Promise<StudioVrmTextureFillWorkerClientResult>;

export interface CreateStudioVrmTexturePaintRuntimeOptions {
  /**
   * Conservative resident footprint per target: original RGBA, editable ImageData,
   * Canvas backing store, and GPU texture backing.
   */
  readonly maxTargetResidentBytes?: number;
  /** Prepared target resident bytes plus the reserved undo-history budget. */
  readonly maxAggregateResidentBytes?: number;
  /**
   * Worker UV-island indexing hard cap. Pointer input consumes only a completed Worker cache and
   * otherwise keeps the face-local identity; it never rebuilds topology synchronously.
   */
  readonly maxGeometryIndexTriangles?: number;
  /** @deprecated Logical RGBA compatibility alias. Prefer maxTargetResidentBytes. */
  readonly maxTargetRgbaBytes?: number;
  /** @deprecated Logical RGBA compatibility alias. Prefer maxAggregateResidentBytes. */
  readonly maxAggregateRgbaBytes?: number;
  /** Hard cap for concurrently unsettled source-image reads. One read per source is always enforced. */
  readonly maxConcurrentReads?: number;
  readonly maxHistoryEntries?: number;
  readonly maxHistoryBytes?: number;
  /** Hard cap for samples retained by one pointer stroke after duplicate coalescing. */
  readonly maxStrokeSamples?: number;
  readonly undoTileSize?: number;
  readonly createCanvas?: StudioVrmTexturePaintCanvasFactory;
  readonly readTextureImage?: StudioVrmTexturePaintImageReader;
  /** Test/host integration seam. Production uses the fail-closed one-shot module Worker. */
  readonly runTextureFill?: StudioVrmTextureFillRunner;
  /** Test/host integration seam. The default uses the browser module Worker implementation. */
  readonly precomputeGeometryIndex?: StudioVrmTexturePaintGeometryPrecomputer;
}

export type StudioVrmTexturePaintRuntimeListener = (
  snapshot: StudioVrmTexturePaintRuntimeSnapshot,
) => void;

interface MaterialBinding {
  readonly material: BaseColorMaterial;
  readonly originalMap: THREE.Texture | null;
  readonly descriptor: StudioVrmTexturePaintBindingDescriptor;
}

interface PaintTarget {
  readonly channel: StudioVrmTexturePaintChannel;
  readonly id: string;
  readonly originalTexture: THREE.Texture;
  readonly paintedTexture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly imageData: ImageData;
  readonly originalPixels: Uint8ClampedArray;
  readonly size: StudioVrmTextureSize;
  readonly rgbaBytes: number;
  readonly residentBytes: number;
  readonly bindings: Map<BaseColorMaterial, MaterialBinding>;
  valid: boolean;
  invalidReason: "canvas-unavailable" | null;
}

interface ResolvedBaseColorHit {
  readonly material: BaseColorMaterial;
  readonly sourceTexture: THREE.Texture;
  readonly effectiveTexture: THREE.Texture;
  readonly target: PaintTarget | null;
  readonly uv: StudioVrmUvPoint;
  readonly wrapU: StudioVrmTextureWrapMode;
  readonly wrapV: StudioVrmTextureWrapMode;
  /** Captured only for asynchronous color sampling stale checks, never for hot brush moves. */
  readonly samplingSignature: TextureSamplingSignature | null;
}

interface ResolvedPaintHit extends ResolvedBaseColorHit {
  readonly sample: StudioVrmTextureStrokeSample;
  readonly paintWrap: StudioVrmTexturePaintApplyOptions;
}

interface PendingStroke {
  readonly pointerId: number;
  readonly channel: StudioVrmTexturePaintChannel;
  readonly originMaterial: BaseColorMaterial;
  readonly sourceTexture: THREE.Texture;
  readonly style: StudioVrmTextureStrokeStyle;
  readonly planOptions: Omit<
    StudioVrmTextureStrokePlanOptions,
    "flipV" | "wrapU" | "wrapV"
  >;
  readonly samples: StudioVrmTextureStrokeSample[];
  readonly wrapU: StudioVrmTextureWrapMode;
  readonly wrapV: StudioVrmTextureWrapMode;
  readonly paintWrap: StudioVrmTexturePaintApplyOptions;
  readonly readController: AbortController | null;
  target: PaintTarget | null;
  terminal: "commit" | null;
}

interface ActiveStroke {
  readonly pointerId: number;
  readonly target: PaintTarget;
  readonly paintWrap: StudioVrmTexturePaintApplyOptions;
  readonly recorder: StudioVrmTextureUndoRecorder;
  readonly walker: StudioVrmTextureStrokeWalker;
  lastSample: StudioVrmTextureStrokeSample | null;
  sampleCount: number;
  changedTexels: number;
}

interface SurfacePaintSessionState {
  readonly id: string;
  readonly channel: StudioVrmTexturePaintChannel;
  readonly originMaterial: BaseColorMaterial;
  readonly sourceTexture: THREE.Texture;
  readonly paintWrap: StudioVrmTexturePaintApplyOptions;
  readonly controller: AbortController | null;
  target: PaintTarget | null;
  token: StudioVrmTexturePaintSurfaceSession | null;
}

interface PendingColorSample {
  readonly controller: AbortController;
}

interface PendingFill {
  readonly controller: AbortController;
}

type StrokeHistoryRecord = StrokeHistoryRecordBase<PaintTarget>;
type FillHistoryRecord = FillHistoryRecordBase<PaintTarget>;
type HistoryRecord = StrokeHistoryRecord | FillHistoryRecord;
type HistoryCheckpoint = HistoryCheckpointState<HistoryRecord>;

interface NormalizedRuntimeOptions {
  readonly maxTargetResidentBytes: number;
  readonly maxAggregateResidentBytes: number;
  readonly maxGeometryIndexTriangles: number;
  readonly maxConcurrentReads: number;
  readonly maxHistoryEntries: number;
  readonly maxHistoryBytes: number;
  readonly maxStrokeSamples: number;
  readonly undoTileSize: number;
  readonly createCanvas: StudioVrmTexturePaintCanvasFactory;
  readonly readTextureImage: StudioVrmTexturePaintImageReader;
  readonly runTextureFill: StudioVrmTextureFillRunner;
  readonly precomputeGeometryIndex: StudioVrmTexturePaintGeometryPrecomputer;
}

function normalizeOptions(
  options: CreateStudioVrmTexturePaintRuntimeOptions,
): NormalizedRuntimeOptions {
  const createCanvas = options.createCanvas ?? defaultCanvasFactory;
  const maxHistoryBytes = boundedByteBudget(
    options.maxHistoryBytes,
    DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxHistoryBytes,
  );
  const legacyTargetRgbaBytes = boundedByteBudget(
    options.maxTargetRgbaBytes,
    DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxTargetRgbaBytes,
  );
  const maxTargetResidentBytes =
    options.maxTargetResidentBytes === undefined
      ? logicalRgbaToResidentBytes(legacyTargetRgbaBytes)
      : boundedByteBudget(
          options.maxTargetResidentBytes,
          DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxTargetResidentBytes,
        );
  const legacyAggregateRgbaBytes = boundedByteBudget(
    options.maxAggregateRgbaBytes,
    DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxAggregateRgbaBytes,
  );
  const aggregateResidentFallback = options.maxAggregateRgbaBytes === undefined
    ? saturatedByteSum(maxTargetResidentBytes, maxTargetResidentBytes, maxHistoryBytes)
    : saturatedByteSum(logicalRgbaToResidentBytes(legacyAggregateRgbaBytes), maxHistoryBytes);
  return Object.freeze({
    maxTargetResidentBytes,
    maxAggregateResidentBytes: boundedByteBudget(
      options.maxAggregateResidentBytes,
      aggregateResidentFallback,
    ),
    maxGeometryIndexTriangles: boundedInteger(
      options.maxGeometryIndexTriangles,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxGeometryIndexTriangles,
      0,
    ),
    maxConcurrentReads: boundedInteger(
      options.maxConcurrentReads,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxConcurrentReads,
      1,
    ),
    maxHistoryEntries: boundedInteger(
      options.maxHistoryEntries,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxHistoryEntries,
      1,
    ),
    maxHistoryBytes,
    maxStrokeSamples: boundedInteger(
      options.maxStrokeSamples,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxStrokeSamples,
      2,
    ),
    undoTileSize: boundedInteger(
      options.undoTileSize,
      DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.undoTileSize,
      1,
    ),
    createCanvas,
    readTextureImage: options.readTextureImage ?? createDefaultImageReader(createCanvas),
    runTextureFill: options.runTextureFill ?? runStudioVrmTextureFillWorker,
    precomputeGeometryIndex:
      options.precomputeGeometryIndex ?? precomputeStudioVrmTextureGeometryIndex,
  });
}

export class StudioVrmTexturePaintRuntime {
  private readonly scene: THREE.Object3D;
  private readonly materialChannels = new StudioVrmTexturePaintMaterialChannels();
  private selectedChannel: StudioVrmTexturePaintChannel = "baseColor";
  private readonly supportedPaintChannels: readonly StudioVrmTexturePaintChannel[];
  private readonly options: NormalizedRuntimeOptions;
  private presentation: StudioVrmPaintPresentation | null = null;
  private restoredPaint: StudioVrmSurfacePaintSettings | null = null;
  private readonly promotedBindings = new Set<string>();
  private readonly promoting = new Map<THREE.Texture, PresentedLease>();
  private readonly targetsByOriginal = new Map<THREE.Texture, PaintTarget>();
  private readonly targetsByPainted = new Map<THREE.Texture, PaintTarget>();
  private readonly targets: PaintTarget[] = [];
  private readonly listeners = new Set<StudioVrmTexturePaintRuntimeListener>();
  private readonly geometryPrewarmController = new AbortController();
  private readonly inFlightReadControllers = new Set<AbortController>();
  private readonly inFlightReadsBySource = new Map<THREE.Texture, number>();
  private inFlightReadCount = 0;
  private readonly history: HistoryStackState<HistoryRecord> = {
    past: [],
    future: [],
    bytes: 0,
  };
  private aggregateRgbaBytes = 0;
  private aggregateTargetResidentBytes = 0;
  private readonly materialView: StudioVrmPaintMaterialView;
  private selectedTarget: PaintTarget | null = null;
  private sampling: PendingColorSample | null = null;
  private filling: PendingFill | null = null;
  private pending: PendingStroke | null = null;
  private active: ActiveStroke | null = null;
  private surfaceSession: SurfacePaintSessionState | null = null;
  private surfaceSessionSequence = 0;
  private lastError: StudioVrmTexturePaintRuntimeError | null = null;
  private lastGuidance: StudioVrmTexturePaintRuntimeGuidance | null = null;
  private disposed = false;
  private contentRevision = 0;
  private snapshot: StudioVrmTexturePaintRuntimeSnapshot;

  constructor(
    scene: THREE.Object3D,
    options: CreateStudioVrmTexturePaintRuntimeOptions = {},
  ) {
    this.scene = scene;
    this.materialView = new StudioVrmPaintMaterialView(collectSceneMaterialBindings(scene));
    this.options = normalizeOptions(options);
    this.supportedPaintChannels = Object.freeze([...this.materialChannels.supportedChannels(scene)]);
    this.snapshot = this.createSnapshot();
    void this.prewarmSceneGeometry();
  }

  /** 같은 모델 세션에서 검증된 PNG만 재사용한다. 작성 중인 세션 위에는 다른 문서를 덮지 않는다. */
  attachPaintPresentation(presentation: StudioVrmPaintPresentation, settings: StudioVrmSurfacePaintSettings) {
    if (this.disposed || this.presentation || this.targets.length || this.inFlightReadCount
      || this.pending || this.active || this.filling || this.surfaceSession || this.sampling) {
      presentation.dispose();
      throw new Error("채색을 복원하는 동안 모델이나 편집 세션이 바뀌었습니다.");
    }
    this.presentation = presentation;
    this.restoredPaint = settings;
    this.publish();
  }

  hasPaintPresentation() { return this.presentation !== null; }

  hasExportablePaintSurface() { return this.hasPaintPresentation() || this.targets.length > 0; }

  getRestoredPaintBindings() {
    return this.restoredPaint?.textures.map(texture => ({
      texture,
      promoted: this.promotedBindings.has(texture.materialLocator + "\0" + texture.textureSlot),
    })) ?? [];
  }

  private get presentationBytes(): number {
    return this.presentation?.residentBytes ?? 0;
  }

  /** 실제 hit에서만 기존 PNG를 브러시 대상으로 전환한다. 준비·취소 실패 시 원래 표시를 복원한다. */
  private async editPresentedSurface<T>(hit: StudioVrmTexturePaintRayHit,
    edit: () => Promise<StudioVrmTexturePaintRuntimeResult<T>>): Promise<StudioVrmTexturePaintRuntimeResult<T>> {
    if (!this.presentation || this.disposed || this.pending || this.active || this.surfaceSession || this.filling || this.sampling) return edit();
    const validated = this.resolveBaseColorHit(hit);
    if (!validated.ok) return this.fail(validated.error.code);
    const { material } = validated.value;
    const lease = this.presentation.release(material, this.selectedChannel);
    if (!lease) return edit();
    let source: THREE.Texture | null = null;
    try {
      source = this.materialChannels.get(material, this.selectedChannel);
      if (!source) return this.fail("map-missing");
      this.promoting.set(source, lease);
      return await edit();
    } finally {
      if (source) this.promoting.delete(source);
      if (source && this.targetsByOriginal.has(source)) {
        for (const binding of lease.bindings) this.promotedBindings.add(binding.materialLocator + "\0" + binding.textureSlot);
        lease.commit();
      } else {
        lease.restore();
      }
      if (!this.disposed) this.publish();
    }
  }

  getSnapshot = (): StudioVrmTexturePaintRuntimeSnapshot => this.snapshot;

  setChannel(channel: StudioVrmTexturePaintChannel): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot> {
    if (this.disposed) return this.fail("disposed");
    if (!canonicalizeStudioVrmTexturePaintChannel(channel)) return this.fail("channel-unsupported");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    const selectedMaterial = this.materialView.selectedMaterial();
    if (!this.supportedPaintChannels.includes(channel)
      || (selectedMaterial && !studioVrmMaterialSupportsPaintChannel(selectedMaterial, channel))) {
      return this.fail("channel-unsupported");
    }
    this.selectedChannel = channel;
    this.selectedTarget = this.targets.find((target) => target.channel === channel
      && (!selectedMaterial || target.bindings.has(selectedMaterial as BaseColorMaterial))) ?? null;
    this.lastError = null;
    this.publish();
    return success(this.snapshot);
  }

  selectMaterial(id: string | null): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) return this.fail("pointer-active");
    if (!this.materialView.select(id)) return this.fail("material-missing");
    const material = this.materialView.selectedMaterial();
    if (material && !studioVrmMaterialSupportsPaintChannel(material, this.selectedChannel)) {
      this.selectedChannel = this.supportedPaintChannels.find((channel) =>
        studioVrmMaterialSupportsPaintChannel(material, channel)) ?? "baseColor";
    }
    this.selectedTarget = this.targets.find((target) => target.channel === this.selectedChannel
      && (!material || target.bindings.has(material as BaseColorMaterial))) ?? null;
    this.lastError = null;
    this.publish();
    return success(this.snapshot);
  }

  setMaterialSolo(solo: boolean): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) return this.fail("pointer-active");
    if (!this.materialView.setSolo(solo)) return this.fail("material-missing");
    this.lastError = null;
    this.publish();
    return success(this.snapshot);
  }

  setMaterialVisible(id: string, visible: boolean): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) return this.fail("pointer-active");
    if (!this.materialView.setVisible(id, visible)) return this.fail("material-missing");
    this.lastError = null;
    this.publish();
    return success(this.snapshot);
  }

  /**
   * Monotonic revision of canvas-visible/export-observable RGBA content. Unlike React snapshots,
   * this advances for every successful incremental dirty-rect upload, including pointer moves that
   * intentionally avoid publishing UI state.
   */
  getContentRevision = (): number => this.contentRevision;

  subscribe = (listener: StudioVrmTexturePaintRuntimeListener): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  };

  clearError(): StudioVrmTexturePaintRuntimeSnapshot {
    if (this.lastError || this.lastGuidance) {
      this.lastError = null;
      this.lastGuidance = null;
      this.publish();
    }
    return this.snapshot;
  }

  exportPaintedTargets():
    StudioVrmTexturePaintRuntimeResult<readonly StudioVrmTexturePaintExportTarget[]> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    const exported: StudioVrmTexturePaintExportTarget[] = [];
    const bindingOwners = new Map<string, string>();
    for (const target of this.targets) {
      if (!target.valid) return this.fail("target-invalid");
      if (pixelsEqual(target.imageData.data, target.originalPixels)) continue;
      const bindingsByIdentity = new Map<string, StudioVrmTexturePaintBindingDescriptor>();
      for (const { descriptor } of target.bindings.values()) {
        const identity = `${descriptor.materialLocator}\u0000${descriptor.textureSlot}`;
        const owner = bindingOwners.get(identity);
        if (owner !== undefined && owner !== target.id) return this.fail("binding-conflict");
        bindingOwners.set(identity, target.id);
        bindingsByIdentity.set(identity, descriptor);
      }
      const bindings = [...bindingsByIdentity.values()]
        .sort((left, right) => left.bindingKey.localeCompare(right.bindingKey));
      if (bindings.length === 0) return this.fail("binding-missing");
      exported.push(Object.freeze({
        id: target.id,
        width: target.size.width,
        height: target.size.height,
        pixels: target.imageData.data.slice(),
        bindings: Object.freeze(bindings),
      }));
    }
    exported.sort((left, right) =>
      (left.bindings[0]?.bindingKey ?? "").localeCompare(
        right.bindings[0]?.bindingKey ?? "",
      ));
    return success(Object.freeze(exported));
  }

  /** V3 문서의 전체 표면 버전을 교체한다. 모든 비동기 읽기가 끝난 뒤 한 번에 반영한다. */
  async replaceDocumentTargets(
    inputs: readonly StudioVrmTexturePaintRehydrateTarget[],
    signal?: AbortSignal,
  ): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot>> {
    const unavailable = () => this.disposed || this.sampling || this.filling || this.pending || this.active || this.surfaceSession;
    if (unavailable()) return this.fail(this.disposed ? "disposed" : "pointer-active");
    if (signal?.aborted) return this.fail("source-read-aborted");
    const revision = this.contentRevision;
    const prepared: { material: BaseColorMaterial; source: THREE.Texture; image: StudioVrmTexturePaintReadableImage;
      original: StudioVrmTexturePaintReadableImage; binding: StudioVrmTexturePaintBindingDescriptor }[] = [];
    const originals = new Map<THREE.Texture, StudioVrmTexturePaintReadableImage>();
    let transientBytes = this.targets.reduce((total, target) => total + target.rgbaBytes, 0);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      for (const input of inputs) {
        if (!isCanonicalBindingDescriptor(input.binding)) return this.fail("binding-missing");
        const image = input.image;
        if (!isStudioVrmTextureSize(image) || !(image.data instanceof Uint8ClampedArray)
          || image.data.byteLength !== image.width * image.height * RGBA_CHANNELS) return this.fail("invalid-dimensions");
        transientBytes += image.data.byteLength;
        if (this.snapshot.residentBytes + transientBytes > this.options.maxAggregateResidentBytes) return this.fail("aggregate-rgba-budget");
        const entries = [...collectSceneMaterialBindings(this.scene, input.binding.textureSlot)].filter(([, binding]) =>
          binding.materialLocator === input.binding.materialLocator && binding.textureSlot === input.binding.textureSlot);
        if (entries.length !== 1) return this.fail(entries.length ? "binding-conflict" : "binding-missing");
        const material = entries[0]![0];
        const current = this.materialChannels.get(material, input.binding.textureSlot);
        if (!current?.isTexture) return this.fail("map-missing");
        const existing = this.targetsByPainted.get(current) ?? this.targetsByOriginal.get(current);
        const source = existing?.originalTexture ?? current;
        let original = originals.get(source);
        if (!original) {
          if (existing) original = { ...existing.size, data: existing.originalPixels };
          else {
            const result = await this.readSourceTexture(source, controller);
            if (!result.ok) return this.fail(result.error.code);
            original = result.value;
          }
          originals.set(source, original);
        }
        if (this.contentRevision !== revision || unavailable() || signal?.aborted) return this.fail(this.disposed ? "disposed" : "stale-completion");
        if (original.width !== image.width || original.height !== image.height) return this.fail("binding-conflict");
        const duplicate = prepared.find((entry) => entry.source === source);
        if (duplicate && !pixelsEqual(duplicate.image.data, image.data)) return this.fail("binding-conflict");
        prepared.push({ material, source, original, image: { ...image, data: image.data.slice() }, binding: input.binding });
      }
      if (this.contentRevision !== revision || unavailable() || signal?.aborted) return this.fail(this.disposed ? "disposed" : "stale-completion");
      for (const entry of prepared) {
        const current = this.materialChannels.get(entry.material, entry.binding.textureSlot);
        const existing = current ? this.targetsByPainted.get(current) ?? this.targetsByOriginal.get(current) : null;
        if ((existing?.originalTexture ?? current) !== entry.source) return this.fail("source-changed");
      }
      const previousTargets = new Set(this.targets);
      const before = new Map(this.targets.map((target) => [target, target.imageData.data.slice()]));
      const requested = new Map<PaintTarget, Uint8ClampedArray>();
      const rollback = () => {
        for (const target of [...this.targets]) {
          if (!previousTargets.has(target)) { this.invalidateTarget(target); continue; }
          const pixels = before.get(target);
          if (pixels) {
            target.imageData.data.set(pixels);
            if (!this.syncTarget(target)) this.invalidateTarget(target);
          }
        }
      };
      try {
        for (const entry of prepared) {
          const created = this.createTarget(entry.source, entry.original);
          if (!created.ok) { rollback(); return this.fail(created.error.code); }
          const target = created.value;
          const descriptor = target.bindings.get(entry.material)?.descriptor;
          if (descriptor?.materialLocator !== entry.binding.materialLocator || descriptor.textureSlot !== entry.binding.textureSlot) {
            rollback(); return this.fail("binding-conflict");
          }
          requested.set(target, entry.image.data);
        }
        for (const target of this.targets) {
          const desired = requested.get(target) ?? target.originalPixels;
          if (pixelsEqual(target.imageData.data, desired)) continue;
          target.imageData.data.set(desired);
          if (!this.syncTarget(target)) { rollback(); return this.fail("canvas-unavailable"); }
        }
        // 표면 버전 이동의 이력은 V3가 소유한다. 과거 픽셀 patch를 새 버전에 다시 적용하지 않는다.
        this.history.past = [];
        this.history.future = [];
        this.history.bytes = 0;
        this.lastError = null;
        this.publish();
        return success(this.snapshot);
      } catch {
        rollback();
        return this.fail("source-changed");
      }
    } catch {
      return this.fail(signal?.aborted ? "source-read-aborted" : "source-unreadable");
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  async rehydrateTarget(
    input: StudioVrmTexturePaintRehydrateTarget,
  ): Promise<
    StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot>
  > {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    if (!isCanonicalBindingDescriptor(input.binding)) return this.fail("binding-missing");
    if (input.signal?.aborted) return this.fail("source-read-aborted");
    const size = {
      width: input.image?.width,
      height: input.image?.height,
    };
    if (
      !isStudioVrmTextureSize(size)
      || !(input.image?.data instanceof Uint8ClampedArray)
      || input.image.data.byteLength !== size.width * size.height * RGBA_CHANNELS
    ) {
      return this.fail("invalid-dimensions");
    }

    const materialEntries = [...collectSceneMaterialBindings(this.scene, input.binding.textureSlot)]
      .filter(([, descriptor]) =>
        descriptor.materialLocator === input.binding.materialLocator
        && descriptor.textureSlot === input.binding.textureSlot
      );
    if (materialEntries.length > 1) return this.fail("binding-conflict");
    const materialEntry = materialEntries[0];
    const material = materialEntry?.[0];
    if (!material) return this.fail("binding-missing");
    let currentMap: THREE.Texture | null;
    try {
      currentMap = this.materialChannels.get(material, input.binding.textureSlot);
    } catch {
      return this.fail("binding-missing");
    }
    if (!currentMap?.isTexture) return this.fail("map-missing");

    const existing =
      this.targetsByPainted.get(currentMap)
      ?? this.targetsByOriginal.get(currentMap)
      ?? null;
    if (existing) {
      const boundDescriptor = existing.bindings.get(material)?.descriptor;
      const ownsBinding =
        boundDescriptor?.materialLocator === input.binding.materialLocator
        && boundDescriptor.textureSlot === input.binding.textureSlot;
      if (
        !ownsBinding
        || existing.size.width !== size.width
        || existing.size.height !== size.height
        || !pixelsEqual(existing.imageData.data, input.image.data)
      ) {
        return this.fail("binding-conflict");
      }
      this.selectedTarget = existing;
      this.lastError = null;
      this.publish();
      return success(this.snapshot);
    }

    const controller = new AbortController();
    const handleAbort = () => controller.abort();
    input.signal?.addEventListener("abort", handleAbort, { once: true });
    try {
      const original = await this.readSourceTexture(currentMap, controller);
      if (!original.ok) return this.fail(original.error.code);
      if (input.signal?.aborted || this.disposed) {
        return this.fail(this.disposed ? "disposed" : "source-read-aborted");
      }
      if (
        original.value.width !== size.width
        || original.value.height !== size.height
      ) {
        return this.fail("binding-conflict");
      }
      const targetResult = this.createTarget(currentMap, original.value);
      if (!targetResult.ok) return this.fail(targetResult.error.code);
      const created = targetResult.value;
      const createdDescriptor = created.bindings.get(material)?.descriptor;
      if (
        createdDescriptor?.materialLocator !== input.binding.materialLocator
        || createdDescriptor.textureSlot !== input.binding.textureSlot
      ) {
        this.invalidateTarget(created);
        return this.fail("binding-missing");
      }
      if (input.signal?.aborted || this.disposed) {
        this.invalidateTarget(created);
        return this.fail(this.disposed ? "disposed" : "source-read-aborted");
      }
      created.imageData.data.set(input.image.data);
      if (!this.syncTarget(created)) {
        this.invalidateTarget(created);
        return this.fail("canvas-unavailable");
      }
      this.selectedTarget = created;
      this.lastError = null;
      this.publish();
      return success(this.snapshot);
    } finally {
      input.signal?.removeEventListener("abort", handleAbort);
    }
  }

  async sampleBaseColor(
    input: StudioVrmTexturePaintColorSampleInput,
  ): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintColorSample>> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    if (input.signal?.aborted) return this.fail("source-read-aborted");

    this.lastGuidance = null;
    const hitResult = this.resolveBaseColorHit(input.hit, true);
    if (!hitResult.ok) return this.fail(hitResult.error.code);
    const resolved = hitResult.value;
    const displayed = this.presentation?.peek(resolved.material, this.selectedChannel);
    if (resolved.target || displayed) {
      const sampled = sampleResolvedTextureColor(
        resolved,
        resolved.target?.imageData.data ?? displayed!.image.data,
        resolved.target?.size ?? displayed!.image,
      );
      if (!sampled.ok) return this.fail(sampled.error.code);
      this.lastError = null;
      this.lastGuidance = null;
      this.publish();
      return sampled;
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const request = Object.freeze({ controller });
    this.sampling = request;
    this.publish();
    try {
      const readable = await this.readSourceTexture(resolved.sourceTexture, controller);
      if (this.sampling !== request || this.disposed) {
        return failure(this.disposed ? "disposed" : "stale-completion");
      }
      if (!readable.ok) {
        this.sampling = null;
        return this.fail(readable.error.code);
      }
      const currentHit = this.resolveBaseColorHit(input.hit, true);
      if (!currentHit.ok || !sameResolvedBaseColorHit(resolved, currentHit.value)) {
        this.sampling = null;
        return this.fail("source-changed");
      }
      const sampled = sampleResolvedTextureColor(
        resolved,
        readable.value.data,
        readable.value,
      );
      this.sampling = null;
      if (!sampled.ok) return this.fail(sampled.error.code);
      this.lastError = null;
      this.lastGuidance = null;
      this.publish();
      return sampled;
    } finally {
      input.signal?.removeEventListener("abort", abortFromCaller);
      if (this.sampling === request) {
        this.sampling = null;
        this.publish();
      }
    }
  }

  async fillBaseColor(input: StudioVrmTexturePaintFillInput): Promise<StudioVrmTexturePaintRuntimeResult<boolean>> {
    return this.editPresentedSurface(input.hit, () => this.fillOnSurface(input));
  }

  private async fillOnSurface(
    input: StudioVrmTexturePaintFillInput,
  ): Promise<StudioVrmTexturePaintRuntimeResult<boolean>> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    if (input.signal?.aborted) return this.fail("source-read-aborted");
    const color = parseStudioVrmTextureColor(input.color);
    if (
      !color
      || !Number.isSafeInteger(input.tolerance)
      || input.tolerance < 0
      || input.tolerance > 255
      || (input.scope !== "contiguous" && input.scope !== "whole-material")
    ) {
      return this.fail("invalid-style");
    }

    this.lastGuidance = null;
    const hitResult = this.resolveBaseColorHit(input.hit, true);
    if (!hitResult.ok) return this.fail(hitResult.error.code);
    const resolved = hitResult.value;
    const initialContentRevision = this.contentRevision;
    const knownSize = resolved.target?.size ?? textureImageDimensions(resolved.sourceTexture);
    if (
      knownSize
      && !this.admitTextureFillTransient(knownSize, resolved.target === null)
    ) {
      return this.fail("fill-memory-budget");
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const request = Object.freeze({ controller });
    this.filling = request;
    this.publish();
    try {
      let authored: StudioVrmTexturePaintReadableImage | undefined;
      let readable: StudioVrmTexturePaintReadableImage;
      if (resolved.target) {
        readable = {
          width: resolved.target.size.width,
          height: resolved.target.size.height,
          data: resolved.target.imageData.data,
        };
      } else {
        const readResult = await this.readSourceTexture(resolved.sourceTexture, controller);
        if (this.filling !== request || this.disposed) {
          return failure(this.disposed ? "disposed" : "stale-completion");
        }
        if (!readResult.ok) return this.fail(readResult.error.code);
        authored = readResult.value;
        readable = this.promoting.get(resolved.sourceTexture)?.image ?? authored;
      }
      if (controller.signal.aborted) return this.fail("source-read-aborted");

      const size = { width: readable.width, height: readable.height };
      if (
        !isStudioVrmTextureSize(size)
        || !this.admitTextureFillTransient(size, resolved.target === null)
      ) {
        return this.fail("fill-memory-budget");
      }
      const currentBeforeWorker = this.resolveBaseColorHit(input.hit, true);
      if (
        !currentBeforeWorker.ok
        || !sameResolvedBaseColorHit(resolved, currentBeforeWorker.value)
        || this.contentRevision !== initialContentRevision
      ) {
        return this.fail("source-changed");
      }
      const seed = resolveStudioVrmTexelIndex(resolved.uv, size, {
        wrapU: resolved.wrapU,
        wrapV: resolved.wrapV,
        flipV: false,
      });
      if (!seed) return this.fail("uv-missing");

      let fillResult: StudioVrmTextureFillWorkerClientResult;
      try {
        let workerPixels: Uint8ClampedArray;
        try {
          workerPixels = readable.data.slice();
        } catch {
          return this.fail("fill-memory-budget");
        }
        fillResult = await this.options.runTextureFill({
          pixels: workerPixels,
          width: size.width,
          height: size.height,
          seed: { x: seed.x, y: seed.y },
          tolerance: input.tolerance,
          scope: input.scope,
        }, {
          signal: controller.signal,
        });
      } catch (error) {
        if (this.filling !== request || this.disposed) {
          return failure(this.disposed ? "disposed" : "stale-completion");
        }
        if (controller.signal.aborted) return this.fail("source-read-aborted");
        const name =
          typeof error === "object" && error !== null && "name" in error
            ? String((error as { readonly name?: unknown }).name)
            : "";
        return this.fail(
          name === "NotSupportedError"
            ? "fill-worker-unavailable"
            : "fill-worker-failed",
        );
      }
      if (this.filling !== request || this.disposed) {
        return failure(this.disposed ? "disposed" : "stale-completion");
      }
      if (controller.signal.aborted) return this.fail("source-read-aborted");

      const currentAfterWorker = this.resolveBaseColorHit(input.hit, true);
      if (
        !currentAfterWorker.ok
        || !sameResolvedBaseColorHit(resolved, currentAfterWorker.value)
        || this.contentRevision !== initialContentRevision
      ) {
        return this.fail("source-changed");
      }
      if (
        fillResult.execution !== "worker"
        || !textureFillResultMatchesSeed(readable.data, size, seed, fillResult.result)
      ) {
        return this.fail("fill-worker-failed");
      }
      const selection = prepareTextureFillSelection(
        readable.data,
        size,
        fillResult.result,
        color,
      );
      if (!selection) return this.fail("fill-worker-failed");
      if (selection.changedCount === 0) {
        this.selectedTarget = resolved.target;
        this.lastError = null;
        this.lastGuidance = null;
        this.publish();
        return success(false);
      }
      const historyBytes = textureFillHistoryBytes(selection);
      if (historyBytes === null) {
        return this.fail("history-budget");
      }

      const historyCheckpoint = this.captureHistoryCheckpoint();
      if (!this.admitHistoryPeak(historyBytes)) {
        this.restoreHistoryCheckpoint(historyCheckpoint);
        return this.fail("history-budget");
      }

      let target = resolved.target;
      let createdTarget: PaintTarget | null = null;
      if (!target) {
        const targetResult = this.createTarget(resolved.sourceTexture, authored ?? readable);
        if (!targetResult.ok) {
          this.restoreHistoryCheckpoint(historyCheckpoint);
          return this.fail(targetResult.error.code);
        }
        target = targetResult.value;
        createdTarget = target;
      } else {
        const rebound = this.bindUnownedSourceMaterials(target);
        if (!rebound.ok) {
          this.restoreHistoryCheckpoint(historyCheckpoint);
          return this.fail(rebound.error.code);
        }
      }
      if (!target.valid) {
        this.restoreHistoryCheckpoint(historyCheckpoint);
        return this.fail("target-invalid");
      }

      const history = this.applyInitialTextureFill(
        target,
        selection,
        color,
        historyBytes,
      );
      if (!history.ok) {
        if (createdTarget?.valid) this.invalidateTarget(createdTarget);
        this.restoreHistoryCheckpoint(historyCheckpoint);
        return this.fail(history.error.code);
      }
      this.clearFutureHistory();
      this.history.past.push(history.value);
      this.history.bytes += history.value.bytes;
      this.evictHistory();
      this.selectedTarget = target;
      this.lastError = null;
      this.lastGuidance = null;
      this.publish();
      return success(true);
    } finally {
      input.signal?.removeEventListener("abort", abortFromCaller);
      if (this.filling === request) {
        this.filling = null;
        this.publish();
      }
    }
  }

  /**
   * Prepare the runtime-owned atlas for a package-level surface brush.
   * Ray/triangle classification still runs through the same `resolveHit`
   * path as pointer painting; this seam only leases the resulting target.
   */
  async prepareSurfaceBrushSession(input: StudioVrmTexturePaintSurfacePrepareInput): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintPreparedSurface>> {
    return this.editPresentedSurface(input.hit, () => this.prepareBrushOnSurface(input));
  }

  private async prepareBrushOnSurface(
    input: StudioVrmTexturePaintSurfacePrepareInput,
  ): Promise<
    StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintPreparedSurface>
  > {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    if (input.signal?.aborted) return this.fail("source-read-aborted");
    if (
      input.pressure !== undefined
      && (!Number.isFinite(input.pressure) || input.pressure < 0 || input.pressure > 1)
    ) {
      return this.fail("invalid-style");
    }

    this.lastGuidance = null;
    const initialHit = this.resolveHit(input.hit, input.pressure);
    if (!initialHit.ok) return this.fail(initialHit.error.code);
    const resolved = initialHit.value;
    this.surfaceSessionSequence = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.surfaceSessionSequence + 1,
    );
    const controller = resolved.target ? null : new AbortController();
    const state: SurfacePaintSessionState = {
      id: `surface-${this.surfaceSessionSequence}`,
      channel: this.selectedChannel,
      originMaterial: resolved.material,
      sourceTexture: resolved.sourceTexture,
      paintWrap: resolved.paintWrap,
      controller,
      target: resolved.target,
      token: null,
    };
    this.surfaceSession = state;
    const abortFromCaller = () => controller?.abort();
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    this.publish();

    const failSession = <T>(
      code: StudioVrmTexturePaintRuntimeErrorCode,
    ): StudioVrmTexturePaintRuntimeResult<T> => {
      if (this.surfaceSession === state) this.surfaceSession = null;
      return this.fail(code);
    };

    try {
      if (!state.target) {
        if (!controller) return failSession("source-unreadable");
        const readable = await this.readSourceTexture(state.sourceTexture, controller);
        if (this.surfaceSession !== state || this.disposed) {
          return failure(this.disposed ? "disposed" : "stale-completion");
        }
        if (!readable.ok) return failSession(readable.error.code);
        try {
          if (this.materialChannels.get(state.originMaterial, state.channel) !== state.sourceTexture) {
            return failSession("source-changed");
          }
        } catch {
          return failSession("source-changed");
        }
        const target = this.createTarget(state.sourceTexture, readable.value);
        if (!target.ok) return failSession(target.error.code);
        state.target = target.value;
      } else {
        const rebound = this.bindUnownedSourceMaterials(state.target);
        if (!rebound.ok) return failSession(rebound.error.code);
      }
      if (
        input.signal?.aborted
        || controller?.signal.aborted
        || this.surfaceSession !== state
        || this.disposed
        || !state.target
      ) {
        return failSession(this.disposed ? "disposed" : "source-read-aborted");
      }

      // Re-resolve after target creation so cached geometry density can use
      // the exact runtime-owned atlas dimensions.
      const currentHit = this.resolveHit(input.hit, input.pressure);
      if (
        !currentHit.ok
        || currentHit.value.sourceTexture !== state.sourceTexture
        || currentHit.value.target !== state.target
      ) {
        return failSession(currentHit.ok ? "target-mismatch" : currentHit.error.code);
      }
      const projection = this.surfaceProjectionFromResolved(currentHit.value, input.hit);
      if (!projection.ok) return failSession(projection.error.code);
      const token = Object.freeze({
        id: state.id,
        targetId: state.target.id,
        width: state.target.size.width,
        height: state.target.size.height,
        wrapU: currentHit.value.wrapU,
        wrapV: currentHit.value.wrapV,
      });
      state.token = token;
      this.selectedTarget = state.target;
      this.lastError = null;
      this.lastGuidance = null;
      this.publish();
      return success(Object.freeze({ session: token, projection: projection.value }));
    } finally {
      input.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  /** Resolve another Three.js ray hit against an existing runtime-owned lease. */
  resolveSurfaceBrushHit(
    session: StudioVrmTexturePaintSurfaceSession,
    hit: StudioVrmTexturePaintRayHit,
    pressure?: number,
  ): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintSurfaceProjection> {
    if (this.disposed) return this.fail("disposed");
    const state = this.surfaceSession;
    if (!state?.token || state.token !== session || !state.target) {
      return this.fail("surface-session-invalid");
    }
    if (
      pressure !== undefined
      && (!Number.isFinite(pressure) || pressure < 0 || pressure > 1)
    ) {
      return this.fail("invalid-style");
    }
    const resolved = this.resolveHit(hit, pressure);
    if (!resolved.ok) return this.fail(resolved.error.code);
    if (
      resolved.value.sourceTexture !== state.sourceTexture
      || resolved.value.target !== state.target
    ) {
      return this.fail("target-mismatch");
    }
    const projection = this.surfaceProjectionFromResolved(resolved.value, hit);
    return projection.ok ? projection : this.fail(projection.error.code);
  }

  /**
   * Apply an exact package-generated operation list atomically to the primary
   * Canvas/ImageData owner. The only GPU action is the existing dirty upload;
   * no interactive GPU-to-CPU readback is introduced.
   */
  commitSurfaceBrushSession(
    session: StudioVrmTexturePaintSurfaceSession,
    input: StudioVrmTexturePaintSurfaceCommitInput,
  ): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintSurfaceCommitReceipt> {
    if (this.disposed) return this.fail("disposed");
    const state = this.surfaceSession;
    if (!state?.token || state.token !== session || !state.target) {
      return this.fail("surface-session-invalid");
    }
    const target = state.target;
    if (
      input.signal?.aborted
      || !Array.isArray(input.operations)
      || input.operations.length === 0
      || input.operations.length > 200_000
      || input.operations.some((operation) => !isValidSurfacePaintOperation(operation))
    ) {
      this.surfaceSession = null;
      return this.fail(input.signal?.aborted ? "source-read-aborted" : "surface-operation-invalid");
    }

    const checkpoint = this.captureHistoryCheckpoint();
    const recorder = createStudioVrmTextureUndoRecorder(
      target.imageData.data,
      target.size,
      this.options.undoTileSize,
      this.options.maxHistoryBytes,
      (requiredPeakBytes) => this.admitHistoryPeak(requiredPeakBytes),
    );
    if (!recorder) {
      this.surfaceSession = null;
      return this.fail("invalid-dimensions");
    }

    const rollbackBeforeFinish = (
      code: StudioVrmTexturePaintRuntimeErrorCode,
    ): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintSurfaceCommitReceipt> => {
      const restored = recorder.cancel();
      this.restoreHistoryCheckpoint(checkpoint);
      this.surfaceSession = null;
      if (restored > 0 && !this.syncTarget(target)) {
        this.invalidateTarget(target);
        return this.fail("target-invalid");
      }
      return this.fail(code);
    };

    const baked = bakeSurfaceBrushOperations({
      operations: input.operations,
      pixels: target.imageData.data,
      originalPixels: target.originalPixels,
      size: target.size,
      paintWrap: state.paintWrap,
      recorder,
      signal: input.signal,
    });
    if (!baked.ok) return rollbackBeforeFinish(baked.errorCode);
    const { changedTexels, dirtyRect } = baked;

    const entry = recorder.finish();
    if (recorder.budgetExceeded || !entry) {
      const restored = recorder.cancel();
      this.restoreHistoryCheckpoint(checkpoint);
      this.surfaceSession = null;
      if (restored === 0) {
        this.invalidateTarget(target);
        return this.fail("target-invalid");
      }
      return this.fail("history-budget");
    }
    const bytes = studioVrmTextureUndoEntryBytes(entry);
    if (!this.admitHistoryPeak(bytes)) {
      const restored = applyStudioVrmTextureUndoEntry(
        target.imageData.data,
        target.size,
        entry,
        "undo",
      );
      this.restoreHistoryCheckpoint(checkpoint);
      this.surfaceSession = null;
      if (!restored) {
        this.invalidateTarget(target);
        return this.fail("target-invalid");
      }
      return this.fail("history-budget");
    }
    if (!this.syncTarget(target, dirtyRect)) {
      const restored = applyStudioVrmTextureUndoEntry(
        target.imageData.data,
        target.size,
        entry,
        "undo",
      );
      this.restoreHistoryCheckpoint(checkpoint);
      this.surfaceSession = null;
      if (!restored || !this.syncTarget(target)) {
        this.invalidateTarget(target);
        return this.fail("target-invalid");
      }
      return this.fail("canvas-unavailable");
    }

    this.clearFutureHistory();
    this.history.past.push({ kind: "stroke", target, entry, bytes });
    this.history.bytes += bytes;
    this.evictHistory();
    this.selectedTarget = target;
    this.surfaceSession = null;
    this.lastError = null;
    this.lastGuidance = null;
    this.publish();
    return success(Object.freeze({
      appliedOperations: input.operations.length,
      changedTexels,
      revision: this.contentRevision,
    }));
  }

  cancelSurfaceBrushSession(
    session: StudioVrmTexturePaintSurfaceSession,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    const state = this.surfaceSession;
    if (!state) return success(false);
    if (!state.token || state.token !== session) return this.fail("surface-session-invalid");
    state.controller?.abort();
    this.surfaceSession = null;
    this.publish();
    return success(true);
  }

  async beginStroke(input: StudioVrmTexturePaintStrokeBegin): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot>> {
    return this.editPresentedSurface(input.hit, () => this.beginStrokeOnSurface(input));
  }

  private async beginStrokeOnSurface(
    input: StudioVrmTexturePaintStrokeBegin,
  ): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintRuntimeSnapshot>> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(input.pointerId)) return this.fail("invalid-pointer");
    if (!isValidStrokeStyle(input.style)) return this.fail("invalid-style");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }

    this.lastGuidance = null;
    const hitResult = this.resolveHit(input.hit, input.pressure);
    if (!hitResult.ok) return this.fail(hitResult.error.code);
    const resolved = hitResult.value;
    const request: PendingStroke = {
      pointerId: input.pointerId,
      channel: this.selectedChannel,
      originMaterial: resolved.material,
      sourceTexture: resolved.sourceTexture,
      style: copyStrokeStyle(input.style),
      planOptions: Object.freeze({ ...input.planOptions }),
      samples: [{ ...resolved.sample }],
      wrapU: resolved.wrapU,
      wrapV: resolved.wrapV,
      paintWrap: resolved.paintWrap,
      readController: resolved.target ? null : new AbortController(),
      target: resolved.target,
      terminal: null,
    };
    this.pending = request;
    this.publish();

    if (!request.target) {
      const readController = request.readController;
      if (!readController) {
        this.pending = null;
        return this.fail("source-unreadable");
      }
      const readableResult = await this.readSourceTexture(
        request.sourceTexture,
        readController,
      );
      if (this.pending !== request || this.disposed) return failure("stale-completion");
      if (!readableResult.ok) {
        this.pending = null;
        return this.fail(readableResult.error.code);
      }
      try {
        if (this.materialChannels.get(request.originMaterial, request.channel) !== request.sourceTexture) {
          this.pending = null;
          return this.fail("source-changed");
        }
      } catch {
        this.pending = null;
        return this.fail("source-changed");
      }
      const targetResult = this.createTarget(request.sourceTexture, readableResult.value);
      if (!targetResult.ok) {
        this.pending = null;
        return this.fail(targetResult.error.code);
      }
      request.target = targetResult.value;
    } else {
      const rebound = this.bindUnownedSourceMaterials(request.target);
      if (!rebound.ok) {
        this.pending = null;
        return this.fail(rebound.error.code);
      }
    }

    if (this.pending !== request || this.disposed || !request.target) {
      return failure("stale-completion");
    }
    const recorder = createStudioVrmTextureUndoRecorder(
      request.target.imageData.data,
      request.target.size,
      this.options.undoTileSize,
      this.options.maxHistoryBytes,
      (requiredPeakBytes) => this.admitHistoryPeak(requiredPeakBytes),
    );
    if (!recorder) {
      this.pending = null;
      return this.fail("invalid-dimensions");
    }

    const stroke: ActiveStroke = {
      pointerId: request.pointerId,
      target: request.target,
      paintWrap: request.paintWrap,
      recorder,
      walker: createStudioVrmTextureStrokeWalker(
        request.style,
        request.target.size,
        {
          ...request.planOptions,
          wrapU: request.wrapU,
          wrapV: request.wrapV,
          flipV: false,
        },
      ),
      lastSample: null,
      sampleCount: 0,
      changedTexels: 0,
    };
    const terminal = request.terminal;
    this.pending = null;
    this.active = stroke;
    this.selectedTarget = stroke.target;
    for (const sample of request.samples) {
      stroke.lastSample = { ...sample };
      stroke.sampleCount += 1;
      const applyResult = this.applyIncrementalSample(stroke, sample);
      if (!applyResult.ok) return applyResult;
    }
    if (terminal === "commit") {
      const commitResult = this.finishActiveStroke(stroke);
      if (!commitResult.ok) return failure(commitResult.error.code);
    } else {
      this.publish();
    }
    return success(this.snapshot);
  }

  moveStroke(
    input: StudioVrmTexturePaintStrokeMove,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(input.pointerId)) return this.fail("invalid-pointer");
    if (this.surfaceSession) return this.fail("pointer-active");

    if (this.pending) {
      if (this.pending.pointerId !== input.pointerId) return this.fail("pointer-mismatch");
      if (this.pending.terminal) return success(false);
      const hitResult = this.resolveHit(input.hit, input.pressure);
      if (!hitResult.ok) return this.fail(hitResult.error.code);
      if (hitResult.value.sourceTexture !== this.pending.sourceTexture) {
        return this.fail("target-mismatch");
      }
      const appended = this.appendStrokeSample(this.pending.samples, hitResult.value.sample);
      if (appended === "coalesced") return success(false);
      if (appended === "budget") return this.fail("stroke-sample-budget");
      return success(true);
    }

    if (!this.active) return success(false);
    if (this.active.pointerId !== input.pointerId) return this.fail("pointer-mismatch");
    const hitResult = this.resolveHit(input.hit, input.pressure);
    if (!hitResult.ok) return this.fail(hitResult.error.code);
    if (hitResult.value.sourceTexture !== this.active.target.originalTexture) {
      return this.fail("target-mismatch");
    }
    const appended = this.appendActiveStrokeSample(this.active, hitResult.value.sample);
    if (appended === "coalesced") return success(false);
    if (appended === "budget") return this.fail("stroke-sample-budget");
    const result = this.applyIncrementalSample(this.active, hitResult.value.sample);
    return result.ok ? success(true) : failure(result.error.code);
  }

  commitStroke(pointerId: number): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(pointerId)) return this.fail("invalid-pointer");
    if (this.surfaceSession) return this.fail("pointer-active");
    if (this.pending) {
      if (this.pending.pointerId !== pointerId) return this.fail("pointer-mismatch");
      if (this.pending.terminal) return success(false);
      this.pending.terminal = "commit";
      return success(true);
    }
    if (!this.active) return success(false);
    if (this.active.pointerId !== pointerId) return this.fail("pointer-mismatch");
    return this.finishActiveStroke(this.active);
  }

  cancelStroke(pointerId: number): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (!this.isPointerId(pointerId)) return this.fail("invalid-pointer");
    if (this.surfaceSession) return this.fail("pointer-active");
    if (this.pending) {
      if (this.pending.pointerId !== pointerId) return this.fail("pointer-mismatch");
      this.pending.readController?.abort();
      this.pending = null;
      this.publish();
      return success(true);
    }
    if (!this.active) return success(false);
    if (this.active.pointerId !== pointerId) return this.fail("pointer-mismatch");
    const stroke = this.active;
    this.active = null;
    const restored = stroke.recorder.cancel();
    if (restored > 0 && !this.syncTarget(stroke.target)) {
      this.invalidateTarget(stroke.target);
      return this.fail("target-invalid");
    }
    this.publish();
    return success(true);
  }

  undo(): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    const record = this.history.past.at(-1);
    if (!record) return success(false);
    if (!record.target.valid) return this.fail("target-invalid");
    if (!this.applyHistoryRecord(record, "undo")) {
      return this.fail("invalid-dimensions");
    }
    const dirtyRect = this.historyRecordDirtyRect(record);
    if (!this.syncTarget(record.target, dirtyRect)) {
      const rolledBack =
        this.applyHistoryRecord(record, "redo")
        && this.syncTarget(record.target, dirtyRect);
      if (!rolledBack) {
        this.invalidateTarget(record.target);
        return this.fail("target-invalid");
      }
      return this.fail("canvas-unavailable");
    }
    this.history.past.pop();
    this.history.future.push(record);
    this.selectedTarget = record.target;
    this.publish();
    return success(true);
  }

  redo(): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    const record = this.history.future.at(-1);
    if (!record) return success(false);
    if (!record.target.valid) return this.fail("target-invalid");
    if (!this.applyHistoryRecord(record, "redo")) {
      return this.fail("invalid-dimensions");
    }
    const dirtyRect = this.historyRecordDirtyRect(record);
    if (!this.syncTarget(record.target, dirtyRect)) {
      const rolledBack =
        this.applyHistoryRecord(record, "undo")
        && this.syncTarget(record.target, dirtyRect);
      if (!rolledBack) {
        this.invalidateTarget(record.target);
        return this.fail("target-invalid");
      }
      return this.fail("canvas-unavailable");
    }
    this.history.future.pop();
    this.history.past.push(record);
    this.selectedTarget = record.target;
    this.publish();
    return success(true);
  }

  resetActiveTarget(): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.disposed) return this.fail("disposed");
    if (this.sampling || this.filling || this.pending || this.active || this.surfaceSession) {
      return this.fail("pointer-active");
    }
    const target = this.selectedTarget;
    if (!target) return success(false);
    if (!target.valid) return this.fail("target-invalid");
    target.imageData.data.set(target.originalPixels);
    if (!this.syncTarget(target)) {
      this.invalidateTarget(target);
      return this.fail("target-invalid");
    }
    this.removeTargetHistory(target);
    this.publish();
    return success(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometryPrewarmController.abort();
    this.sampling?.controller.abort();
    this.filling?.controller.abort();
    this.surfaceSession?.controller?.abort();
    for (const controller of this.inFlightReadControllers) controller.abort();
    this.sampling = null;
    this.filling = null;
    this.pending = null;
    this.surfaceSession = null;
    if (this.active) {
      this.active.recorder.cancel();
      this.active = null;
    }

    for (const target of this.targets) {
      for (const binding of target.bindings.values()) {
        try {
          if (this.materialChannels.get(binding.material, target.channel) === target.paintedTexture) {
            this.materialChannels.set(binding.material, target.channel, binding.originalMap);
            markMaterialChanged(binding.material);
          }
        } catch {
          // Do not let one custom material prevent the remaining owned bindings from restoring.
        }
      }
      try {
        target.paintedTexture.dispose();
      } catch {
        // Continue releasing the canvas and the remaining targets.
      }
      disposeCanvas(target.canvas);
      target.bindings.clear();
    }

    this.materialView.dispose();
    this.materialChannels.dispose();
    this.presentation?.dispose();
    this.presentation = null;
    this.restoredPaint = null;
    this.promotedBindings.clear();
    this.promoting.clear();
    this.targetsByOriginal.clear();
    this.targetsByPainted.clear();
    this.targets.length = 0;
    this.history.past = [];
    this.history.future = [];
    this.history.bytes = 0;
    this.aggregateRgbaBytes = 0;
    this.aggregateTargetResidentBytes = 0;
    this.selectedTarget = null;
    this.lastError = null;
    this.lastGuidance = null;
    this.publish();
    this.listeners.clear();
  }

  private isPointerId(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
  }

  private async prewarmSceneGeometry(): Promise<void> {
    // Construction stays deterministic and cheap; geometry snapshotting starts after the runtime
    // is returned. Jobs are deliberately sequential to cap transferable copies and Worker memory.
    await Promise.resolve();
    const signal = this.geometryPrewarmController.signal;
    if (this.disposed || signal.aborted) return;
    let jobs: readonly GeometryPrewarmJob[];
    try {
      jobs = collectGeometryPrewarmJobs(
        this.scene,
        this.options.maxGeometryIndexTriangles,
      );
    } catch {
      return;
    }
    for (const job of jobs) {
      if (this.disposed || signal.aborted) return;
      try {
        await this.options.precomputeGeometryIndex(job.geometry, {
          uvAttribute: job.uvAttribute,
          maxTriangles: this.options.maxGeometryIndexTriangles,
          signal,
          executionBackend: "worker",
        });
      } catch {
        // Worker availability, abort, timeout, stale geometry, and malformed custom geometry all
        // fail closed. Pointer input keeps face-local identity without rebuilding topology.
      }
    }
  }

  private admitTextureFillTransient(
    size: StudioVrmTextureSize,
    includeUnpreparedTarget: boolean,
  ): boolean {
    return isTextureFillTransientAdmissible({
      size,
      includeUnpreparedTarget,
      presentationBytes: this.presentationBytes,
      aggregateTargetResidentBytes: this.aggregateTargetResidentBytes,
      historyBytes: this.history.bytes,
      maxAggregateResidentBytes: this.options.maxAggregateResidentBytes,
    });
  }

  private applyInitialTextureFill(
    target: PaintTarget,
    selection: PreparedFillSelection,
    color: Readonly<{ r: number; g: number; b: number }>,
    bytes: number,
  ): StudioVrmTexturePaintRuntimeResult<FillHistoryRecord> {
    if (
      !target.valid
      || !isValidTextureFillRect(selection.rect, target.size)
      || selection.bitMask.byteLength !== Math.ceil(
        (selection.rect.width * selection.rect.height) / 8,
      )
      || !Number.isSafeInteger(selection.changedCount)
      || selection.changedCount <= 0
    ) {
      return failure("fill-worker-failed");
    }
    let beforeRgb: Uint8Array;
    try {
      beforeRgb = new Uint8Array(selection.changedCount * 3);
    } catch {
      return failure("fill-memory-budget");
    }
    const record: FillHistoryRecord = {
      kind: "fill",
      target,
      bitMask: selection.bitMask,
      beforeRgb,
      fillRgb: Object.freeze({ r: color.r, g: color.g, b: color.b }),
      rect: selection.rect,
      bytes,
    };

    const snapshotStatus = snapshotFillBeforeRgb(
      target.imageData.data,
      target.size,
      selection,
      beforeRgb,
    );
    if (snapshotStatus !== "ok") return failure(snapshotStatus);
    if (!applyTextureFillHistoryPixels(record, "redo")) {
      const rolledBack = applyTextureFillHistoryPixels(record, "undo");
      if (!rolledBack) {
        this.invalidateTarget(target);
        return failure("target-invalid");
      }
      return failure("fill-worker-failed");
    }
    if (this.syncTarget(target, selection.rect)) return success(record);
    const rolledBack =
      applyTextureFillHistoryPixels(record, "undo")
      && this.syncTarget(target, selection.rect);
    if (!rolledBack) {
      this.invalidateTarget(target);
      return failure("target-invalid");
    }
    return failure("canvas-unavailable");
  }

  private applyHistoryRecord(
    record: HistoryRecord,
    direction: "redo" | "undo",
  ): boolean {
    if (record.kind === "stroke") {
      return applyStudioVrmTextureUndoEntry(
        record.target.imageData.data,
        record.target.size,
        record.entry,
        direction,
      );
    }
    return applyTextureFillHistoryPixels(record, direction);
  }

  private historyRecordDirtyRect(record: HistoryRecord): StudioVrmTextureRect {
    return record.kind === "stroke" ? record.entry.rect : record.rect;
  }

  private appendStrokeSample(
    samples: StudioVrmTextureStrokeSample[],
    sample: StudioVrmTextureStrokeSample,
  ): "appended" | "budget" | "coalesced" {
    if (canCoalesceStrokeSample(samples.at(-1), sample)) return "coalesced";
    if (samples.length >= this.options.maxStrokeSamples) return "budget";
    samples.push({ ...sample });
    return "appended";
  }

  private appendActiveStrokeSample(
    stroke: ActiveStroke,
    sample: StudioVrmTextureStrokeSample,
  ): "appended" | "budget" | "coalesced" {
    if (canCoalesceStrokeSample(stroke.lastSample ?? undefined, sample)) return "coalesced";
    if (stroke.sampleCount >= this.options.maxStrokeSamples) return "budget";
    stroke.lastSample = { ...sample };
    stroke.sampleCount += 1;
    return "appended";
  }

  private resolveBaseColorHit(
    hit: StudioVrmTexturePaintRayHit,
    captureSamplingSignature = false,
  ): StudioVrmTexturePaintRuntimeResult<ResolvedBaseColorHit> {
    const object = hit.object as THREE.Object3D & { readonly isMesh?: unknown };
    if (object?.isMesh !== true) return failure("mesh-missing");
    if (!objectBelongsToScene(object, this.scene)) return failure("hit-outside-scene");
    const material = materialAtHit(object as THREE.Mesh, hit);
    if (!material) return failure("material-missing");
    if (!this.materialView.accepts(material)) return failure("target-mismatch");

    let map: THREE.Texture | null;
    try {
      if (!studioVrmMaterialSupportsPaintChannel(material, this.selectedChannel)) return failure("channel-unsupported");
      map = this.presentation?.peek(material, this.selectedChannel)?.texture ?? this.materialChannels.get(material, this.selectedChannel);
    } catch {
      return failure("material-missing");
    }
    if (!map?.isTexture) return failure("map-missing");
    const target = this.targetsByPainted.get(map) ?? this.targetsByOriginal.get(map) ?? null;
    if (target && !target.valid) return failure("target-invalid");
    const sourceTexture = target?.originalTexture ?? map;
    const effectiveTexture = target?.paintedTexture ?? map;
    let textureChannel: number;
    try {
      textureChannel = effectiveTexture.channel;
    } catch {
      return failure("source-unreadable");
    }
    if (textureChannel !== 0 && textureChannel !== 1) {
      return failure("uv-missing");
    }
    const uv = finiteUv(textureChannel === 1 ? hit.uv1 : hit.uv);
    if (!uv) return failure("uv-missing");
    try {
      if (effectiveTexture.matrixAutoUpdate) effectiveTexture.updateMatrix();
      uv.applyMatrix3(effectiveTexture.matrix);
    } catch {
      return failure("uv-missing");
    }
    if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return failure("uv-missing");
    let samplingSignature: TextureSamplingSignature | null = null;
    let wrapS: THREE.Wrapping;
    let wrapT: THREE.Wrapping;
    try {
      if (captureSamplingSignature) {
        samplingSignature = textureSamplingSignature(effectiveTexture);
        wrapS = samplingSignature.wrapS;
        wrapT = samplingSignature.wrapT;
      } else {
        // A matrix-array signature is necessary only across an async sample read. Avoid allocating
        // it for every high-frequency brush pointermove.
        wrapS = effectiveTexture.wrapS;
        wrapT = effectiveTexture.wrapT;
      }
    } catch {
      return failure("source-unreadable");
    }
    return success({
      material,
      sourceTexture,
      effectiveTexture,
      target,
      uv: Object.freeze({ u: uv.x, v: uv.y }),
      wrapU: textureWrapMode(wrapS),
      wrapV: textureWrapMode(wrapT),
      samplingSignature,
    });
  }

  private resolveHit(
    hit: StudioVrmTexturePaintRayHit,
    pressure: number | undefined,
  ): StudioVrmTexturePaintRuntimeResult<ResolvedPaintHit> {
    const baseResult = this.resolveBaseColorHit(hit);
    if (!baseResult.ok) return baseResult;
    const base = baseResult.value;
    const object = hit.object as THREE.Mesh;
    const {
      effectiveTexture,
      material,
      sourceTexture,
      target,
      uv,
    } = base;
    const uvAttribute = effectiveTexture.channel === 1 ? "uv1" : "uv";

    const world = finiteWorld(hit.point);
    const faceIndexProvided = hit.faceIndex !== undefined && hit.faceIndex !== null;
    if (faceIndexProvided && !isUsableFaceIndex(hit.faceIndex)) {
      return failure("uv-missing");
    }
    const { islandId, texelsPerWorldUnit, guidance } = resolveHitIslandAndDensity({
      object,
      material,
      sourceTexture,
      effectiveTexture,
      targetSize: target?.size ?? null,
      faceIndex: hit.faceIndex,
      uvAttribute,
      maxGeometryIndexTriangles: this.options.maxGeometryIndexTriangles,
    });
    if (guidance) this.lastGuidance = guidance;
    return success({
      ...base,
      sample: {
        uv,
        ...(pressure === undefined ? {} : { pressure }),
        islandId,
        ...(world ? { world } : {}),
        ...(texelsPerWorldUnit === undefined ? {} : { texelsPerWorldUnit }),
      },
      paintWrap: paintWrapOptions(effectiveTexture),
    });
  }

  private surfaceProjectionFromResolved(
    resolved: ResolvedPaintHit,
    hit: StudioVrmTexturePaintRayHit,
  ): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintSurfaceProjection> {
    const target = resolved.target;
    if (!target) return failure("target-invalid");
    return buildSurfaceProjectionFromHit({
      targetSize: target.size,
      sample: resolved.sample,
      wrapU: resolved.wrapU,
      wrapV: resolved.wrapV,
      material: resolved.material,
      hit,
    });
  }

  private async readSourceTexture(
    texture: THREE.Texture,
    controller: AbortController,
  ): Promise<StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintReadableImage>> {
    if (isCompressedTexture(texture)) return failure("source-compressed");
    if (controller.signal.aborted) return failure("source-read-aborted");
    const knownSize = textureImageDimensions(texture);
    if (knownSize) {
      const admissionError = this.targetAdmissionError(knownSize);
      if (admissionError) return failure(admissionError);
    }
    if ((this.inFlightReadsBySource.get(texture) ?? 0) >= 1) {
      return failure("source-read-active");
    }
    if (this.inFlightReadCount >= this.options.maxConcurrentReads) {
      return failure("read-concurrency-budget");
    }
    this.inFlightReadCount += 1;
    this.inFlightReadsBySource.set(texture, 1);
    this.inFlightReadControllers.add(controller);
    try {
      const readable = await this.materialChannels.read(texture, controller.signal, this.options.readTextureImage);
      if (controller.signal.aborted) return failure("source-read-aborted");
      const size = { width: readable?.width, height: readable?.height };
      if (!isStudioVrmTextureSize(size)) return failure("invalid-dimensions");
      if (!(readable.data instanceof Uint8ClampedArray)) return failure("invalid-dimensions");
      const rgbaBytes = size.width * size.height * RGBA_CHANNELS;
      if (readable.data.byteLength !== rgbaBytes) return failure("invalid-dimensions");
      const admissionError = this.targetAdmissionError(size);
      if (admissionError) return failure(admissionError);
      if (controller.signal.aborted) return failure("source-read-aborted");
      if (texture.flipY) flipRgbaRowsInPlace(readable.data, size);
      return success({ ...size, data: readable.data });
    } catch (error) {
      if (controller.signal.aborted) return failure("source-read-aborted");
      if (error instanceof StudioVrmTexturePaintFault) return failure(error.code);
      return failure("source-unreadable");
    } finally {
      this.inFlightReadControllers.delete(controller);
      this.inFlightReadCount = Math.max(0, this.inFlightReadCount - 1);
      this.inFlightReadsBySource.delete(texture);
    }
  }

  private targetAdmissionError(
    size: StudioVrmTextureSize,
  ): "aggregate-rgba-budget" | "target-rgba-budget" | null {
    const residentBytes = estimateStudioVrmTexturePaintTargetResidentBytes(size);
    if (residentBytes === null || residentBytes > this.options.maxTargetResidentBytes) {
      return "target-rgba-budget";
    }
    const admittedTotal = saturatedByteSum(
      this.presentationBytes,
      this.aggregateTargetResidentBytes,
      residentBytes,
      this.options.maxHistoryBytes,
    );
    return admittedTotal > this.options.maxAggregateResidentBytes
      ? "aggregate-rgba-budget"
      : null;
  }

  private createTarget(
    source: THREE.Texture,
    readable: StudioVrmTexturePaintReadableImage,
  ): StudioVrmTexturePaintRuntimeResult<PaintTarget> {
    const existing = this.targetsByOriginal.get(source);
    if (existing) return success(existing);
    const rgbaBytes = readable.width * readable.height * RGBA_CHANNELS;
    const size = { width: readable.width, height: readable.height };
    if (!isStudioVrmTextureSize(size)) return failure("invalid-dimensions");
    const residentBytes = estimateStudioVrmTexturePaintTargetResidentBytes(size);
    if (residentBytes === null) return failure("invalid-dimensions");
    const admissionError = this.targetAdmissionError(size);
    if (admissionError) return failure(admissionError);

    let canvas: HTMLCanvasElement | null = null;
    let context: CanvasRenderingContext2D;
    let imageData: ImageData;
    try {
      canvas = this.options.createCanvas(readable.width, readable.height);
      canvas.width = readable.width;
      canvas.height = readable.height;
      const candidate = canvas.getContext("2d", { willReadFrequently: true });
      if (!candidate) {
        disposeCanvas(canvas);
        return failure("canvas-unavailable");
      }
      context = candidate;
      imageData = context.createImageData(readable.width, readable.height);
      if (imageData.data.byteLength !== rgbaBytes) {
        disposeCanvas(canvas);
        return failure("invalid-dimensions");
      }
      const restored = this.promoting.get(source)?.image;
      if (restored && (restored.width !== size.width || restored.height !== size.height)) {
        disposeCanvas(canvas);
        return failure("binding-conflict");
      }
      imageData.data.set(restored?.data ?? readable.data);
      context.putImageData(imageData, 0, 0);
    } catch {
      if (canvas) disposeCanvas(canvas);
      return failure("canvas-unavailable");
    }
    if (!canvas) return failure("canvas-unavailable");

    const paintedTexture = new THREE.CanvasTexture(canvas);
    try {
      copyTextureSampling(source, paintedTexture);
    } catch {
      paintedTexture.dispose();
      disposeCanvas(canvas);
      return failure("source-unreadable");
    }
    const target: PaintTarget = {
      channel: this.materialChannels.channelOf(source),
      id: sourceTargetId(source),
      originalTexture: source,
      paintedTexture,
      canvas,
      context,
      imageData,
      originalPixels: readable.data,
      size: Object.freeze(size),
      rgbaBytes,
      residentBytes,
      bindings: new Map(),
      valid: true,
      invalidReason: null,
    };
    const bindingResult = this.bindUnownedSourceMaterials(target);
    if (!bindingResult.ok || target.bindings.size === 0) {
      paintedTexture.dispose();
      disposeCanvas(canvas);
      return failure(bindingResult.ok ? "source-changed" : bindingResult.error.code);
    }

    this.targetsByOriginal.set(source, target);
    this.targetsByPainted.set(paintedTexture, target);
    this.targets.push(target);
    this.aggregateRgbaBytes += rgbaBytes;
    this.aggregateTargetResidentBytes += residentBytes;
    return success(target);
  }

  private bindUnownedSourceMaterials(
    target: PaintTarget,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (!target.valid) return failure("target-invalid");
    const candidates = new Map<
      BaseColorMaterial,
      StudioVrmTexturePaintBindingDescriptor
    >();
    for (const [material, descriptor] of collectSceneMaterialBindings(this.scene, target.channel)) {
      if (target.bindings.has(material) || this.presentation?.peek(material, target.channel)) continue;
      try {
        if (this.materialChannels.get(material, target.channel) === target.originalTexture) candidates.set(material, descriptor);
      } catch {
        // A throwing custom material is not a safe binding candidate.
      }
    }

    const changed: MaterialBinding[] = [];
    try {
      for (const [material, descriptor] of candidates) {
        const binding = {
          material,
          originalMap: this.materialChannels.get(material, target.channel),
          descriptor,
        } satisfies MaterialBinding;
        // Register rollback ownership before invoking a potentially hostile custom setter. A
        // setter may store the new map and then throw; recording afterwards would strand a
        // disposed CanvasTexture on the material.
        changed.push(binding);
        this.materialChannels.set(material, target.channel, target.paintedTexture);
        markMaterialChanged(material);
        target.bindings.set(material, binding);
      }
      return success(changed.length > 0);
    } catch {
      for (const binding of changed) {
        try {
          if (this.materialChannels.get(binding.material, target.channel) === target.paintedTexture) {
            this.materialChannels.set(binding.material, target.channel, binding.originalMap);
            markMaterialChanged(binding.material);
          }
        } catch {
          // Preserve the original binding failure.
        }
        target.bindings.delete(binding.material);
      }
      return failure("source-changed");
    }
  }

  private applyIncrementalSample(
    stroke: ActiveStroke,
    sample: StudioVrmTextureStrokeSample,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    const append = stroke.walker.append(sample);
    let changed = 0;
    let dirtyRect = EMPTY_STUDIO_VRM_TEXTURE_RECT;
    for (const op of append.ops) {
      const opRects = studioVrmTexturePaintOpRects(
        op,
        stroke.target.size,
        stroke.paintWrap,
      );
      if (!stroke.recorder.recordAll(opRects)) {
        const rolledBack = this.rollbackActiveStroke(stroke);
        return this.fail(rolledBack ? "history-budget" : "target-invalid");
      }
      for (const rect of opRects) {
        dirtyRect = unionStudioVrmTextureRect(dirtyRect, rect);
      }
      changed += applyStudioVrmTexturePaintOp(
        stroke.target.imageData.data,
        stroke.target.size,
        op,
        {
          ...stroke.paintWrap,
          originalPixels: stroke.target.originalPixels,
        },
      );
    }
    stroke.changedTexels += changed;
    if (changed > 0 && !this.syncTarget(stroke.target, dirtyRect)) {
      const rolledBack = this.rollbackActiveStroke(stroke);
      return this.fail(rolledBack ? "canvas-unavailable" : "target-invalid");
    }
    return success(changed > 0);
  }

  private rollbackActiveStroke(stroke: ActiveStroke): boolean {
    if (this.active === stroke) this.active = null;
    const restored = stroke.recorder.cancel();
    if (restored > 0 && !this.syncTarget(stroke.target)) {
      this.invalidateTarget(stroke.target);
      return false;
    }
    return true;
  }

  private finishActiveStroke(
    stroke: ActiveStroke,
  ): StudioVrmTexturePaintRuntimeResult<boolean> {
    if (this.active !== stroke) return success(false);
    const entry = stroke.recorder.finish();
    if (stroke.recorder.budgetExceeded) {
      const rolledBack = this.rollbackActiveStroke(stroke);
      return this.fail(rolledBack ? "history-budget" : "target-invalid");
    }
    this.active = null;
    if (!entry || stroke.changedTexels === 0) {
      this.publish();
      return success(true);
    }
    const bytes = studioVrmTextureUndoEntryBytes(entry);
    if (!this.admitHistoryPeak(bytes)) {
      const restored = applyStudioVrmTextureUndoEntry(
        stroke.target.imageData.data,
        stroke.target.size,
        entry,
        "undo",
      );
      if (!restored || !this.syncTarget(stroke.target)) {
        this.invalidateTarget(stroke.target);
        return this.fail("target-invalid");
      }
      return this.fail("history-budget");
    }

    this.clearFutureHistory();
    const record: StrokeHistoryRecord = {
      kind: "stroke",
      target: stroke.target,
      entry,
      bytes,
    };
    this.history.past.push(record);
    this.history.bytes += bytes;
    this.evictHistory();
    this.publish();
    return success(true);
  }

  private clearFutureHistory(): void {
    clearFutureHistoryStack(this.history);
  }

  private captureHistoryCheckpoint(): HistoryCheckpoint {
    return captureHistoryCheckpointStack(this.history);
  }

  private restoreHistoryCheckpoint(checkpoint: HistoryCheckpoint): void {
    restoreHistoryCheckpointStack(this.history, checkpoint);
  }

  private admitHistoryPeak(requiredPeakBytes: number): boolean {
    return admitHistoryPeakStack(this.history, requiredPeakBytes, this.options.maxHistoryBytes);
  }

  private evictHistory(): void {
    evictHistoryStack(this.history, this.options.maxHistoryEntries, this.options.maxHistoryBytes);
  }

  private removeTargetHistory(target: PaintTarget): void {
    removeTargetHistoryStack(this.history, target);
  }

  private invalidateTarget(target: PaintTarget): void {
    if (!target.valid) return;
    target.valid = false;
    target.invalidReason = "canvas-unavailable";
    if (this.active?.target === target) this.active = null;
    if (this.pending?.target === target) {
      this.pending.readController?.abort();
      this.pending = null;
    }
    if (this.surfaceSession?.target === target) {
      this.surfaceSession.controller?.abort();
      this.surfaceSession = null;
    }
    this.removeTargetHistory(target);
    for (const binding of target.bindings.values()) {
      try {
        if (this.materialChannels.get(binding.material, target.channel) === target.paintedTexture) {
          this.materialChannels.set(binding.material, target.channel, binding.originalMap);
          markMaterialChanged(binding.material);
        }
      } catch {
        // Continue releasing the remaining runtime-owned bindings and raster resources.
      }
    }
    target.bindings.clear();
    if (this.targetsByOriginal.get(target.originalTexture) === target) {
      this.targetsByOriginal.delete(target.originalTexture);
    }
    if (this.targetsByPainted.get(target.paintedTexture) === target) {
      this.targetsByPainted.delete(target.paintedTexture);
    }
    const targetIndex = this.targets.indexOf(target);
    if (targetIndex >= 0) this.targets.splice(targetIndex, 1);
    this.aggregateRgbaBytes = Math.max(0, this.aggregateRgbaBytes - target.rgbaBytes);
    this.aggregateTargetResidentBytes = Math.max(
      0,
      this.aggregateTargetResidentBytes - target.residentBytes,
    );
    if (this.selectedTarget === target) this.selectedTarget = null;
    try {
      target.paintedTexture.dispose();
    } catch {
      // Canvas release below is still required when a custom renderer wrapper throws.
    }
    disposeCanvas(target.canvas);
  }

  private syncTarget(
    target: PaintTarget,
    dirtyRect = EMPTY_STUDIO_VRM_TEXTURE_RECT,
  ): boolean {
    if (!target.valid) return false;
    try {
      normalizeScalarOrEmissiveChannelRegion(
        target.channel,
        target.imageData.data,
        target.size,
        dirtyRect,
      );
      if (dirtyRect.width > 0 && dirtyRect.height > 0) {
        target.context.putImageData(
          target.imageData,
          0,
          0,
          dirtyRect.x,
          dirtyRect.y,
          dirtyRect.width,
          dirtyRect.height,
        );
      } else {
        target.context.putImageData(target.imageData, 0, 0);
      }
      target.paintedTexture.needsUpdate = true;
      this.contentRevision = Math.min(
        Number.MAX_SAFE_INTEGER,
        this.contentRevision + 1,
      );
      return true;
    } catch {
      return false;
    }
  }

  private fail<T>(
    code: StudioVrmTexturePaintRuntimeErrorCode,
  ): StudioVrmTexturePaintRuntimeResult<T> {
    this.lastError = frozenError(code);
    this.publish();
    return Object.freeze({ ok: false as const, error: this.lastError });
  }

  private publish(): void {
    if (this.selectedTarget) {
      this.selectedChannel = this.selectedTarget.channel;
      this.materialView.reveal(this.selectedTarget.bindings.keys());
    }
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch {
        // State transitions must not be interrupted by a consumer listener.
      }
    }
  }

  private createSnapshot(): StudioVrmTexturePaintRuntimeSnapshot {
    return buildTexturePaintRuntimeSnapshot({
      selectedChannel: this.selectedChannel,
      supportedPaintChannels: this.supportedPaintChannels,
      materials: this.materialView.snapshot(),
      selectedMaterialId: this.materialView.selectedId,
      soloMaterialId: this.materialView.soloId,
      disposed: this.disposed,
      hasSampling: this.sampling !== null,
      hasFilling: this.filling !== null,
      pendingPointerId: this.pending?.pointerId ?? null,
      activePointerId: this.active?.pointerId ?? null,
      surfaceSessionState: !this.surfaceSession
        ? "none"
        : this.surfaceSession.token
          ? "active"
          : "reading",
      selectedTarget: this.selectedTarget,
      targets: this.targets,
      aggregateRgbaBytes: this.aggregateRgbaBytes,
      aggregateTargetResidentBytes: this.aggregateTargetResidentBytes,
      presentationBytes: this.presentationBytes,
      maxAggregateResidentBytes: this.options.maxAggregateResidentBytes,
      historyPastCount: this.history.past.length,
      historyFutureCount: this.history.future.length,
      historyBytes: this.history.bytes,
      maxHistoryEntries: this.options.maxHistoryEntries,
      maxHistoryBytes: this.options.maxHistoryBytes,
      lastError: this.lastError,
      lastGuidance: this.lastGuidance,
    });
  }
}

export function createStudioVrmTexturePaintRuntime(
  scene: THREE.Object3D,
  options: CreateStudioVrmTexturePaintRuntimeOptions = {},
): StudioVrmTexturePaintRuntime {
  return new StudioVrmTexturePaintRuntime(scene, options);
}
