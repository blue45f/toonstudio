/**
 * Studio bg3d 런타임 어댑터 — 계약(상한·진단·오류·입출력 타입).
 *
 * `studio-bg3d-scene-runtime.ts`의 변환 본체에서 계약 계층만 분리했다.
 */

import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES } from "./studio-bg3d-scene-document";
import type {
  StudioBg3dModelAttachment,
  StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";

export const STUDIO_BG3D_RUNTIME_ADAPTER_MAX_SCAN_ITEMS =
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES * 4;
export const STUDIO_BG3D_RUNTIME_ADAPTER_MAX_DIAGNOSTICS = 128;

export type StudioBg3dRuntimeAdapterDirection =
  | "runtime-to-document"
  | "document-to-runtime";

export type StudioBg3dRuntimeAdapterDiagnosticCode =
  | "invalid-base-document"
  | "invalid-scene-document"
  | "invalid-runtime-collection"
  | "input-scan-limit-exceeded"
  | "invalid-primitive"
  | "invalid-custom-model"
  | "lossy-custom-model-normalization"
  | "duplicate-node-id"
  | "node-budget-exceeded"
  | "unresolved-storage-model"
  | "invalid-attachment-binding"
  | "unsafe-identity-binding"
  | "conflicting-attachment-id"
  | "conflicting-attachment-hash"
  | "attachment-budget-exceeded"
  | "model-byte-budget-exceeded"
  | "persistence-byte-budget-exceeded"
  | "lossy-shot-repair"
  | "unresolved-attachment"
  | "invalid-storage-binding"
  | "conflicting-storage-binding";

export interface StudioBg3dRuntimeAdapterDiagnostic {
  readonly direction: StudioBg3dRuntimeAdapterDirection;
  readonly code: StudioBg3dRuntimeAdapterDiagnosticCode;
  readonly source: "base" | "primitive" | "custom-model" | "document";
  /** Input-array index; intentionally absent for aggregate or document-level diagnostics. */
  readonly sourceIndex?: number;
  /** Included only when it is already a canonical-safe scene node id. */
  readonly nodeId?: string;
  /** Number of affected records represented by this bounded diagnostic. */
  readonly count: number;
}

/**
 * Runtime-to-document conversion never returns a persistence-safe prefix when a bounded workload
 * does not fit. Callers can distinguish the exact fail-closed reason without changing the success
 * return shape used by the editor.
 */
export class StudioBg3dRuntimeAdapterError extends Error {
  readonly code: StudioBg3dRuntimeAdapterDiagnosticCode;
  readonly source: StudioBg3dRuntimeAdapterDiagnostic["source"];
  readonly sourceIndex?: number;
  readonly nodeId?: string;

  constructor(
    code: StudioBg3dRuntimeAdapterDiagnosticCode,
    source: StudioBg3dRuntimeAdapterDiagnostic["source"],
    details: { readonly sourceIndex?: number; readonly nodeId?: string } = {},
    options?: ErrorOptions,
  ) {
    super(`Studio BG3D runtime adapter failed closed: ${code}.`, options);
    this.name = "StudioBg3dRuntimeAdapterError";
    this.code = code;
    this.source = source;
    this.sourceIndex = details.sourceIndex;
    this.nodeId = details.nodeId;
  }
}

export function failAdapter(
  code: StudioBg3dRuntimeAdapterDiagnosticCode,
  source: StudioBg3dRuntimeAdapterDiagnostic["source"],
  details: { readonly sourceIndex?: number; readonly nodeId?: string } = {},
  cause?: unknown,
): never {
  throw new StudioBg3dRuntimeAdapterError(
    code,
    source,
    details,
    cause === undefined ? undefined : { cause },
  );
}

export interface StudioBg3dRuntimeAdapterCounts {
  readonly inputPrimitives: number;
  readonly inputCustomModels: number;
  readonly emittedPrimitives: number;
  readonly emittedCustomModels: number;
  readonly droppedPrimitives: number;
  readonly droppedCustomModels: number;
}

export interface StudioBg3dRuntimeToDocumentInput {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  /** Ephemeral IndexedDB id -> verified, scene-local canonical attachment metadata. */
  readonly attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dModelAttachment>;
  /** Only settings are preserved; base nodes and attachments are intentionally replaced. */
  readonly baseDocument?: StudioBg3dSceneDocument;
}

export interface StudioBg3dRuntimeToDocumentResult {
  readonly document: StudioBg3dSceneDocument;
  readonly serialized: string;
  readonly diagnostics: readonly StudioBg3dRuntimeAdapterDiagnostic[];
  readonly omittedDiagnosticCount: number;
  readonly counts: StudioBg3dRuntimeAdapterCounts;
}

export type StudioBg3dRuntimeToDocumentAttempt =
  | {
      readonly ok: true;
      readonly value: StudioBg3dRuntimeToDocumentResult;
    }
  | {
      readonly ok: false;
      readonly error: StudioBg3dRuntimeAdapterError;
    };

export interface StudioBg3dDocumentToRuntimeInput {
  readonly document: StudioBg3dSceneDocument;
  /** Canonical attachment id -> ephemeral IndexedDB id for this device/session. */
  readonly storageModelIdByAttachmentId: ReadonlyMap<string, string>;
}

export interface StudioBg3dDocumentToRuntimeResult {
  readonly ok: boolean;
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
  readonly diagnostics: readonly StudioBg3dRuntimeAdapterDiagnostic[];
  readonly omittedDiagnosticCount: number;
  readonly counts: StudioBg3dRuntimeAdapterCounts;
}

