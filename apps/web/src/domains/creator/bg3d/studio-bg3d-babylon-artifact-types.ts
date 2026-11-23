/**
 * Shared types, error class, numeric bounds, and abort/deadline utilities
 * for Studio BG3D Babylon artifact capture.
 */

import type { StudioBg3dStableIdLegendEntry } from "./studio-bg3d-artifact-capture-v2";
import type { StudioBg3dBabylonSpecialistExecutionContext } from "./studio-bg3d-babylon-specialist-runtime";
import type { StudioBg3dBabylonTexturePlan } from "./studio-bg3d-babylon-texture-preflight";
import type { StudioBg3dSceneBudgets, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { ISceneLoaderAsyncResult, ImportMeshOptions } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";

export const MAX_CAPTURE_WAIT_MS = 60_000;
export const FLOAT_TOLERANCE = 1e-5;

export type StudioBg3dBabylonCaptureErrorCode =
  | "aborted"
  | "asset-mismatch"
  | "capture-failed"
  | "invalid-snapshot"
  | "renderer-unavailable"
  | "resource-budget-exceeded"
  | "timeout"
  | "unsafe-glb"
  | "unsupported-artifact"
  | "unsupported-scene-feature";

export type StudioBg3dBabylonReadbackStage = "beauty" | "depth";

export class StudioBg3dBabylonCaptureError extends Error {
  constructor(
    readonly code: StudioBg3dBabylonCaptureErrorCode,
    cause?: unknown,
    readonly stage?: StudioBg3dBabylonReadbackStage,
  ) {
    super(
      `Studio Babylon capture failed: ${code}${stage ? ` (${stage} readback)` : ""}`,
      cause === undefined ? undefined : { cause },
    );
    this.name = "StudioBg3dBabylonCaptureError";
  }
}

export interface StudioBg3dBabylonSerializedReadbackOptions<TBeauty, TDepth> {
  readonly beauty?: () => Promise<TBeauty>;
  readonly deadlineMs?: number;
  readonly depth?: () => Promise<TDepth>;
  readonly release: () => void;
  readonly signal: AbortSignal;
}

export interface StudioBg3dBabylonSerializedReadbackResult<TBeauty, TDepth> {
  readonly beauty?: TBeauty;
  readonly depth?: TDepth;
}

export interface GlbBudgetFootprint {
  readonly accessorElements: number;
  readonly animationChannels: number;
  readonly animationKeyframes: number;
  readonly animationValues: number;
  readonly animations: number;
  readonly decodedGeometryBytes: number;
  readonly drawCalls: number;
  readonly joints: number;
  readonly lights: number;
  /** Babylon material instances keyed by the glTF material/default slot and primitive draw mode. */
  readonly materialSlots: number;
  readonly materials: number;
  readonly morphTargets: number;
  readonly nodes: number;
  readonly skins: number;
  readonly textures: number;
  readonly triangles: number;
}

export interface StudioBg3dBabylonCaptureAsset {
  readonly attachmentId: string;
  readonly bytes: Uint8Array;
  readonly footprint: GlbBudgetFootprint;
  readonly glbJson: Record<string, unknown>;
  readonly texturePlan: StudioBg3dBabylonTexturePlan;
}

export type StudioBg3dBabylonMeshImporter = (
  source: Uint8Array,
  scene: Scene,
  options: ImportMeshOptions,
) => Promise<ISceneLoaderAsyncResult>;

export interface StudioBg3dBabylonPostParseReceipt {
  readonly accessorElements: number;
  readonly animationChannels: number;
  readonly animationKeyframes: number;
  readonly animationValues: number;
  readonly animations: number;
  readonly cameras: number;
  readonly decodedGeometryBytes: number;
  readonly drawCalls: number;
  readonly geometries: number;
  readonly joints: number;
  readonly lights: number;
  readonly materials: number;
  readonly meshes: number;
  readonly morphTargets: number;
  /** Logical glTF nodes after removing Babylon's one synthetic loader root. */
  readonly nodes: number;
  readonly particleSystems: number;
  readonly runtimeNodes: number;
  readonly skeletons: number;
  readonly spriteManagers: number;
  readonly textureBytes: number;
  readonly textureMipLevels: number;
  readonly textures: number;
  readonly maxTextureDimension: number;
  readonly triangles: number;
}

export interface StudioBg3dBabylonBoundedImportResult {
  readonly imported: ISceneLoaderAsyncResult;
  readonly receipt: StudioBg3dBabylonPostParseReceipt;
}

export interface RunStudioBg3dBabylonBoundedImportInput {
  readonly bytes: Uint8Array;
  readonly budgets: StudioBg3dSceneBudgets;
  readonly importMesh?: StudioBg3dBabylonMeshImporter;
  readonly name: string;
  readonly preflight: GlbBudgetFootprint;
  readonly texturePlan?: StudioBg3dBabylonTexturePlan;
  readonly scene: Scene;
  readonly signal: AbortSignal;
}

export interface StudioBg3dBabylonCapturePlan {
  readonly assets: readonly StudioBg3dBabylonCaptureAsset[];
  readonly backend: StudioBg3dBabylonSpecialistExecutionContext["backend"];
  readonly document: StudioBg3dSceneDocument;
  readonly height: number;
  readonly includeBeauty: boolean;
  readonly includeDepth: boolean;
  readonly includeMaterialId: boolean;
  readonly includeNormal: boolean;
  readonly includeObjectId: boolean;
  readonly width: number;
}

export interface StudioBg3dBabylonStableIdFrame {
  readonly data: Uint32Array;
  readonly legend: readonly StudioBg3dStableIdLegendEntry[];
}

export interface StudioBg3dBabylonCaptureFrame {
  /** Straight-alpha sRGB RGBA8 in top-down row order. */
  readonly rgba?: Uint8Array;
  /** Linear normalized view depth in top-down row order. */
  readonly depth?: Float32Array;
  /** Stable logical material IDs in top-down row order; zero is background. */
  readonly materialId?: StudioBg3dBabylonStableIdFrame;
  /** View-space right-handed octahedral RG8 in top-down row order. */
  readonly normal?: Uint8Array;
  /** Stable logical object IDs in top-down row order; zero is background. */
  readonly objectId?: StudioBg3dBabylonStableIdFrame;
}

export type StudioBg3dBabylonCaptureRenderer = (
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
) => Promise<StudioBg3dBabylonCaptureFrame>;

export interface RequestedCapture {
  readonly format: "artifact-v2" | "capture";
  readonly height: number;
  readonly includeBeauty: boolean;
  readonly includeDepth: boolean;
  readonly includeMaterialId: boolean;
  readonly includeNormal: boolean;
  readonly includeObjectId: boolean;
  readonly width: number;
}

export function captureError(
  code: StudioBg3dBabylonCaptureErrorCode,
  cause?: unknown,
): StudioBg3dBabylonCaptureError {
  return new StudioBg3dBabylonCaptureError(code, cause);
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw captureError("aborted");
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function recordArray(value: unknown): readonly Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isPlainRecord)) {
    throw captureError("unsafe-glb");
  }
  return value;
}

export function safeNonNegativeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw captureError("unsafe-glb");
  }
  return value;
}

export function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw captureError("resource-budget-exceeded");
  }
  return result;
}

export function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw captureError("resource-budget-exceeded");
  }
  return result;
}

export function withAbortAndDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  deadlineMs = MAX_CAPTURE_WAIT_MS,
): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      clearTimeout(timeout);
      callback();
    };
    const onAbort = () => finish(() => reject(captureError("aborted")));
    const timeout = setTimeout(
      () => finish(() => reject(captureError("timeout"))),
      deadlineMs,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}
