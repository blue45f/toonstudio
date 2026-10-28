/**
 * Deterministic GLB 2.0 export for the Hybrid DCC authoring mesh.
 *
 * The editable half-edge mesh is the only geometry authority accepted here. Three.js and its
 * BufferGeometry are intentionally absent: a render cache must never become an authoring source.
 * Polygon faces are validated and ear-clipped in stable-ID order, then encoded as a self-contained
 * GLB with POSITION, NORMAL, and uint32 indices. ToonStudio stable IDs and provenance survive in
 * glTF `extras`, so an imported derivative can be related back to its authoring revision.
 */

import {
  hashStudioEditableMesh,
  STUDIO_EDITABLE_MESH_REVISION,
} from "../studio-editable-half-edge-mesh";
import {
  STUDIO_VRM_EXPORT_BIN_CHUNK_TYPE,
  STUDIO_VRM_EXPORT_GLB_MAGIC,
  STUDIO_VRM_EXPORT_GLB_VERSION,
  STUDIO_VRM_EXPORT_JSON_CHUNK_TYPE,
  STUDIO_VRM_EXPORT_MIME_TYPE,
  writeStudioVrmExportGlb,
} from "../vrm/studio-vrm-export-glb-container";

import {
  STUDIO_HYBRID_DCC_GLB_EXPORT_MAX_ISSUE_IDS,
  STUDIO_HYBRID_DCC_GLB_EXPORT_MAX_REPORT_ISSUES,
} from "./studio-hybrid-dcc-glb-export-diagnostic-limits";
import { buildStudioHybridDccGltfJson } from "./materials/studio-hybrid-dcc-glb-json";
import { hashStudioHybridDccToonMaterialSlots, normalizeStudioHybridDccToonMaterialSlots, planStudioHybridDccGlbMaterials, type StudioHybridDccToonMaterialSlots } from "./materials/studio-hybrid-dcc-toon-export";
import { encodeStudioHybridDccGlbBinary, type StudioHybridDccGlbBinaryGeometry } from "./studio-hybrid-dcc-glb-binary";
import { validateStudioMeshUvLayer } from "../mesh-uv/studio-mesh-uv-authority";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { validateStudioMeshSurface, buildStudioMeshSurface, type StudioMeshSurfaceValidated, type StudioMeshSurfaceGeometry as BuiltGeometry } from "../mesh-surface/studio-mesh-surface-plan";
import { STUDIO_MESH_SURFACE_MAX_FACE_CORNERS } from "../mesh-surface/studio-mesh-surface-contracts";
import type { StudioGeometryAuthorityRecord } from "../studio-geometry-authority";

export const STUDIO_HYBRID_DCC_GLB_EXPORT_REVISION = 1 as const;
export const STUDIO_HYBRID_DCC_GLB_EXPORT_FORMAT =
  "toonstudio.hybrid-dcc-glb-export" as const;
export const STUDIO_HYBRID_DCC_GLB_EXPORT_GENERATOR =
  "ToonStudio Hybrid DCC deterministic editable-mesh exporter/1" as const;
export const STUDIO_HYBRID_DCC_GLB_MIME_TYPE = STUDIO_VRM_EXPORT_MIME_TYPE;
/** Bounds the synchronous deterministic n-gon checks before this path moves to a Worker. */
export const STUDIO_HYBRID_DCC_GLB_MAX_FACE_CORNERS = STUDIO_MESH_SURFACE_MAX_FACE_CORNERS;

export type StudioHybridDccGlbIssueSeverity = "warning" | "loss" | "error";

export type StudioHybridDccGlbIssueCode =
  | "invalid-input"
  | "invalid-source-id"
  | "invalid-source-revision"
  | "invalid-source-hash"
  | "source-hash-mismatch"
  | "authority-not-editable-mesh"
  | "modifier-stack-unapplied"
  | "mesh-revision-unsupported"
  | "mesh-budget-exceeded"
  | "empty-mesh"
  | "duplicate-stable-id"
  | "stable-id-invalid"
  | "stable-id-counter-invalid"
  | "position-non-finite"
  | "position-float32-overflow"
  | "position-float32-collapse"
  | "crease-invalid"
  | "crease-unsupported"
  | "face-property-invalid"
  | "vertex-half-edge-invalid"
  | "half-edge-reference-invalid"
  | "half-edge-link-mismatch"
  | "half-edge-twin-mismatch"
  | "half-edge-face-mismatch"
  | "face-loop-open"
  | "face-loop-incomplete"
  | "face-loop-too-small"
  | "face-corner-budget-exceeded"
  | "face-loop-duplicate-vertex"
  | "edge-zero-length"
  | "edge-orientation-mismatch"
  | "non-manifold-edge"
  | "bow-tie-vertex"
  | "isolated-vertex"
  | "face-zero-area"
  | "face-non-planar"
  | "face-self-intersection"
  | "face-degenerate-corner"
  | "face-collinear-corner-omitted"
  | "triangulation-failed"
  | "normal-unresolved"
  | "uv-coordinate-invalid"
  | "index-overflow"
  | "material-slot-metadata-only"
  | "diagnostic-overflow"
  | "container-write-failed"
  | "container-validation-failed"
  | "surface-budget-exceeded";

export interface StudioHybridDccGlbIssue {
  readonly severity: StudioHybridDccGlbIssueSeverity;
  readonly code: StudioHybridDccGlbIssueCode;
  readonly message: string;
  /** Compatibility alias for handoff/preflight surfaces that render diagnostic detail. */
  readonly detail: string;
  readonly vertexIds?: readonly number[];
  readonly halfEdgeIds?: readonly number[];
  readonly faceIds?: readonly number[];
}

export interface StudioHybridDccGlbExportSource {
  readonly authority: "editable-half-edge-mesh";
  readonly assetId: string;
  readonly sourceRevision: number;
  readonly sourceHash: string;
  readonly meshSchemaRevision: typeof STUDIO_EDITABLE_MESH_REVISION;
  readonly toonMaterialsHash?: string;
}

export interface StudioHybridDccGlbExportReport {
  readonly format: typeof STUDIO_HYBRID_DCC_GLB_EXPORT_FORMAT;
  readonly revision: typeof STUDIO_HYBRID_DCC_GLB_EXPORT_REVISION;
  readonly status: "exported" | "blocked";
  readonly source: StudioHybridDccGlbExportSource;
  readonly errors: readonly StudioHybridDccGlbIssue[];
  readonly losses: readonly StudioHybridDccGlbIssue[];
  readonly warnings: readonly StudioHybridDccGlbIssue[];
  /** Stable aggregate in severity order: errors, losses, warnings. */
  readonly issues: readonly StudioHybridDccGlbIssue[];
}

export interface StudioHybridDccGlbExportMetrics {
  readonly sourceVertexCount: number;
  readonly sourceHalfEdgeCount: number;
  readonly sourceFaceCount: number;
  readonly outputVertexCount: number;
  readonly triangleCount: number;
  /** Compact handoff aliases. */
  readonly vertices: number;
  readonly triangles: number;
  readonly positionByteLength: number;
  readonly normalByteLength: number;
  readonly indexByteLength: number;
  readonly binaryByteLength: number;
  readonly glbByteLength: number;
}

export interface StudioHybridDccMeshGlbExportInput {
  readonly assetId: string;
  readonly mesh: StudioEditableMesh;
  /** Workspace geometry-authority revision, not the mesh schema revision. */
  readonly sourceRevision: number;
  /** Must be the current `hashStudioEditableMesh(mesh)` value. */
  readonly sourceHash: string;
  readonly toonMaterials?: StudioHybridDccToonMaterialSlots;
}

export type StudioHybridDccMeshGlbExportResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly fileName: string;
      readonly mimeType: typeof STUDIO_HYBRID_DCC_GLB_MIME_TYPE;
      readonly metrics: StudioHybridDccGlbExportMetrics;
      readonly report: StudioHybridDccGlbExportReport & { readonly status: "exported" };
    }
  | {
      readonly ok: false;
      readonly report: StudioHybridDccGlbExportReport & { readonly status: "blocked" };
    };

type InternalResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: StudioHybridDccGlbIssue };

function issue(
  severity: StudioHybridDccGlbIssueSeverity,
  code: StudioHybridDccGlbIssueCode,
  message: string,
  ids: Pick<StudioHybridDccGlbIssue, "vertexIds" | "halfEdgeIds" | "faceIds"> = {},
): StudioHybridDccGlbIssue {
  const boundedIds: {
    vertexIds?: readonly number[];
    halfEdgeIds?: readonly number[];
    faceIds?: readonly number[];
  } = {};
  const truncation: string[] = [];
  for (const key of ["vertexIds", "halfEdgeIds", "faceIds"] as const) {
    const values = ids[key];
    if (values === undefined) continue;
    const retained = values.slice(0, STUDIO_HYBRID_DCC_GLB_EXPORT_MAX_ISSUE_IDS);
    boundedIds[key] = retained;
    if (retained.length < values.length) {
      truncation.push(
        `${key} total=${values.length} retained=${retained.length} omitted=${values.length - retained.length}`,
      );
    }
  }
  const boundedMessage = truncation.length > 0
    ? `${message} [diagnostic IDs bounded: ${truncation.join("; ")}]`
    : message;
  return { severity, code, message: boundedMessage, detail: boundedMessage, ...boundedIds };
}

interface BoundedDiagnostics {
  readonly errors: readonly StudioHybridDccGlbIssue[];
  readonly losses: readonly StudioHybridDccGlbIssue[];
  readonly warnings: readonly StudioHybridDccGlbIssue[];
  readonly issues: readonly StudioHybridDccGlbIssue[];
}

function boundedDiagnostics(
  errors: readonly StudioHybridDccGlbIssue[],
  losses: readonly StudioHybridDccGlbIssue[],
  warnings: readonly StudioHybridDccGlbIssue[],
  totals: {
    readonly errors?: number;
    readonly losses?: number;
    readonly warnings?: number;
  } = {},
): BoundedDiagnostics {
  const totalErrors = Math.max(errors.length, totals.errors ?? errors.length);
  const totalLosses = Math.max(losses.length, totals.losses ?? losses.length);
  const totalWarnings = Math.max(warnings.length, totals.warnings ?? warnings.length);
  const total = totalErrors + totalLosses + totalWarnings;
  if (
    total <= STUDIO_HYBRID_DCC_GLB_EXPORT_MAX_REPORT_ISSUES
    && errors.length === totalErrors
    && losses.length === totalLosses
    && warnings.length === totalWarnings
  ) {
    return { errors, losses, warnings, issues: [...errors, ...losses, ...warnings] };
  }

  let remaining = STUDIO_HYBRID_DCC_GLB_EXPORT_MAX_REPORT_ISSUES - 1;
  const boundedErrors = errors.slice(0, remaining);
  remaining -= boundedErrors.length;
  const boundedLosses = losses.slice(0, remaining);
  remaining -= boundedLosses.length;
  const boundedWarnings = warnings.slice(0, remaining);
  const omittedErrors = totalErrors - boundedErrors.length;
  const omittedLosses = totalLosses - boundedLosses.length;
  const omittedWarnings = totalWarnings - boundedWarnings.length;
  const retained = boundedErrors.length + boundedLosses.length + boundedWarnings.length;
  const summarySeverity: StudioHybridDccGlbIssueSeverity = omittedErrors > 0
    ? "error"
    : omittedLosses > 0
      ? "loss"
      : "warning";
  const summary = issue(
    summarySeverity,
    "diagnostic-overflow",
    `Export diagnostics bounded: total=${total} retained=${retained} omitted=${total - retained} `
      + `(errors=${omittedErrors}, losses=${omittedLosses}, warnings=${omittedWarnings})`,
  );
  if (summarySeverity === "error") boundedErrors.push(summary);
  else if (summarySeverity === "loss") boundedLosses.push(summary);
  else boundedWarnings.push(summary);
  return {
    errors: boundedErrors,
    losses: boundedLosses,
    warnings: boundedWarnings,
    issues: [...boundedErrors, ...boundedLosses, ...boundedWarnings],
  };
}

function pass<T>(value: T): InternalResult<T> {
  return { ok: true, value };
}

function stop<T>(entry: StudioHybridDccGlbIssue): InternalResult<T> {
  return { ok: false, issue: entry };
}

function reportSource(input: Partial<StudioHybridDccMeshGlbExportInput>): StudioHybridDccGlbExportSource {
  const source: StudioHybridDccGlbExportSource = {
    authority: "editable-half-edge-mesh",
    assetId: typeof input.assetId === "string" ? input.assetId : "",
    sourceRevision: Number.isSafeInteger(input.sourceRevision) ? input.sourceRevision! : 0,
    sourceHash: typeof input.sourceHash === "string" ? input.sourceHash : "",
    meshSchemaRevision: STUDIO_EDITABLE_MESH_REVISION,
  };
  if (input.toonMaterials === undefined) return source;
  try { return { ...source, toonMaterialsHash: hashStudioHybridDccToonMaterialSlots(input.toonMaterials) }; }
  catch { return source; }
}

function blockedReport(
  input: Partial<StudioHybridDccMeshGlbExportInput>,
  error: StudioHybridDccGlbIssue,
  losses: readonly StudioHybridDccGlbIssue[] = [],
  warnings: readonly StudioHybridDccGlbIssue[] = [],
  warningCount: number = warnings.length,
): StudioHybridDccMeshGlbExportResult {
  const diagnostics = boundedDiagnostics([error], losses, warnings, { warnings: warningCount });
  return {
    ok: false,
    report: {
      format: STUDIO_HYBRID_DCC_GLB_EXPORT_FORMAT,
      revision: STUDIO_HYBRID_DCC_GLB_EXPORT_REVISION,
      status: "blocked",
      source: reportSource(input),
      ...diagnostics,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 검증과 재질 손실 보고를 분리하여 순수 표면 planner에 DTO 의존성을 넣지 않는다. */
function validateMesh(mesh: StudioEditableMesh, toonMaterials?: StudioHybridDccToonMaterialSlots): InternalResult<StudioMeshSurfaceValidated & { readonly losses: readonly StudioHybridDccGlbIssue[]; readonly surface: StudioMeshSurfaceValidated }> {
  const validated = validateStudioMeshSurface(mesh);
  if (!validated.ok) return validated;
  const materialFaces = validated.value.faces.filter(({ face }) => face.materialSlot !== 0 && !toonMaterials?.[String(face.materialSlot)]).map(({ face }) => face.id);
  const losses = materialFaces.length > 0 ? [issue("loss", "material-slot-metadata-only", "Material slots are preserved in extras but no glTF material payload is authored", { faceIds: materialFaces })] : [];
  return pass({ ...validated.value, losses, surface: validated.value });
}

function encodeBinary(geometry: BuiltGeometry): InternalResult<StudioHybridDccGlbBinaryGeometry> {
  const encoded = encodeStudioHybridDccGlbBinary(geometry);
  return encoded.ok ? encoded : stop(issue("error", encoded.code, encoded.detail));
}

function fileNameForAsset(assetId: string): string {
  let sanitized = "";
  for (const character of assetId.normalize("NFC")) {
    sanitized += character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character)
      ? "-"
      : character;
  }
  const base = sanitized
    .replace(/[. ]+$/g, "")
    .slice(0, 120)
    .replace(/\.glb$/i, "");
  return `${base || "studio-editable-mesh"}.glb`;
}

function containerIssue(bytes: Uint8Array, expectedBinaryByteLength: number): StudioHybridDccGlbIssue | null {
  if (bytes.byteLength < 28 || bytes.byteLength % 4 !== 0) {
    return issue("error", "container-validation-failed", "GLB size is not a complete four-byte-aligned container");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== STUDIO_VRM_EXPORT_GLB_MAGIC ||
    view.getUint32(4, true) !== STUDIO_VRM_EXPORT_GLB_VERSION ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    return issue("error", "container-validation-failed", "GLB header does not match the 2.0 container contract");
  }
  const jsonByteLength = view.getUint32(12, true);
  if (
    jsonByteLength % 4 !== 0 ||
    view.getUint32(16, true) !== STUDIO_VRM_EXPORT_JSON_CHUNK_TYPE
  ) {
    return issue("error", "container-validation-failed", "GLB JSON chunk is missing or misaligned");
  }
  const binChunkOffset = 20 + jsonByteLength;
  if (binChunkOffset % 4 !== 0 || binChunkOffset + 8 > bytes.byteLength) {
    return issue("error", "container-validation-failed", "GLB BIN chunk header is missing or misaligned");
  }
  const paddedBinaryByteLength = view.getUint32(binChunkOffset, true);
  if (
    paddedBinaryByteLength % 4 !== 0 ||
    paddedBinaryByteLength < expectedBinaryByteLength ||
    paddedBinaryByteLength - expectedBinaryByteLength > 3 ||
    view.getUint32(binChunkOffset + 4, true) !== STUDIO_VRM_EXPORT_BIN_CHUNK_TYPE ||
    binChunkOffset + 8 + paddedBinaryByteLength !== bytes.byteLength
  ) {
    return issue("error", "container-validation-failed", "GLB BIN chunk bounds or alignment are invalid");
  }
  return null;
}

/**
 * Export an authoring half-edge mesh to a deterministic, self-contained GLB 2.0 byte snapshot.
 * Invalid or unsupported topology never yields partial bytes.
 */
export function exportStudioHybridDccMeshGlb(
  input: StudioHybridDccMeshGlbExportInput,
): StudioHybridDccMeshGlbExportResult {
  const partial = isRecord(input) ? input as Partial<StudioHybridDccMeshGlbExportInput> : {};
  if (!isRecord(input)) {
    return blockedReport(partial, issue("error", "invalid-input", "GLB export input is required"));
  }
  if (typeof input.assetId !== "string" || input.assetId.length === 0 || input.assetId.length > 160) {
    return blockedReport(partial, issue("error", "invalid-source-id", "assetId must contain 1-160 characters"));
  }
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision <= 0) {
    return blockedReport(partial, issue("error", "invalid-source-revision", "sourceRevision must be a positive safe integer"));
  }
  if (typeof input.sourceHash !== "string" || input.sourceHash.length === 0 || input.sourceHash.length > 160) {
    return blockedReport(partial, issue("error", "invalid-source-hash", "sourceHash must contain 1-160 characters"));
  }

  try {
    if (input.toonMaterials !== undefined) input = { ...input, toonMaterials: normalizeStudioHybridDccToonMaterialSlots(input.toonMaterials) };
    const validated = validateMesh(input.mesh, input.toonMaterials);
    if (!validated.ok) return blockedReport(input, validated.issue);
    const invalidUv = validateStudioMeshUvLayer(input.mesh);
    if (invalidUv) return blockedReport(input, issue("error", "uv-coordinate-invalid", invalidUv));
    const actualHash = hashStudioEditableMesh(input.mesh);
    if (actualHash !== input.sourceHash) {
      return blockedReport(
        input,
        issue("error", "source-hash-mismatch", "sourceHash does not identify the supplied authoring mesh"),
        validated.value.losses,
        validated.value.warnings,
        validated.value.warningCount,
      );
    }
    const surface = buildStudioMeshSurface(validated.value.surface);
    const geometry: InternalResult<BuiltGeometry> = surface.ok ? pass(surface.value.geometry) : surface;
    if (!geometry.ok) {
      return blockedReport(
        input,
        geometry.issue,
        validated.value.losses,
        validated.value.warnings,
        validated.value.warningCount,
      );
    }
    const materials = input.toonMaterials === undefined ? undefined : planStudioHybridDccGlbMaterials(input.toonMaterials, input.mesh.faces, geometry.value.indices, geometry.value.triangleSourceFaceIds);
    const exportGeometry = materials ? { ...geometry.value, indices: materials.indices, triangleSourceFaceIds: materials.sourceFaceIds } : geometry.value;
    const binary = encodeBinary(exportGeometry);
    if (!binary.ok) {
      return blockedReport(
        input,
        binary.issue,
        validated.value.losses,
        validated.value.warnings,
        validated.value.warningCount,
      );
    }
    const json = buildStudioHybridDccGltfJson(input, validated.value, exportGeometry, binary.value, STUDIO_HYBRID_DCC_GLB_EXPORT_GENERATOR, materials);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = writeStudioVrmExportGlb({ json, binary: binary.value.bytes });
    } catch (error) {
      const writerCode = isRecord(error) && typeof error.code === "string" ? error.code : "unknown";
      return blockedReport(
        input,
        issue("error", "container-write-failed", `GLB container writer rejected the export (${writerCode})`),
        validated.value.losses,
        validated.value.warnings,
        validated.value.warningCount,
      );
    }
    const invalidContainer = containerIssue(bytes, binary.value.bytes.byteLength);
    if (invalidContainer) {
      return blockedReport(
        input,
        invalidContainer,
        validated.value.losses,
        validated.value.warnings,
        validated.value.warningCount,
      );
    }
    const metrics: StudioHybridDccGlbExportMetrics = {
      sourceVertexCount: input.mesh.vertices.length,
      sourceHalfEdgeCount: input.mesh.halfEdges.length,
      sourceFaceCount: input.mesh.faces.length,
      outputVertexCount: geometry.value.outputSourceVertexIds.length,
      triangleCount: geometry.value.indices.length / 3,
      vertices: geometry.value.outputSourceVertexIds.length,
      triangles: geometry.value.indices.length / 3,
      positionByteLength: binary.value.positionByteLength,
      normalByteLength: binary.value.normalByteLength,
      indexByteLength: binary.value.indexByteLength,
      binaryByteLength: binary.value.bytes.byteLength,
      glbByteLength: bytes.byteLength,
    };
    const diagnostics = boundedDiagnostics([], validated.value.losses, validated.value.warnings, {
      warnings: validated.value.warningCount,
    });
    return {
      ok: true,
      bytes,
      fileName: fileNameForAsset(input.assetId),
      mimeType: STUDIO_HYBRID_DCC_GLB_MIME_TYPE,
      metrics,
      report: {
        format: STUDIO_HYBRID_DCC_GLB_EXPORT_FORMAT,
        revision: STUDIO_HYBRID_DCC_GLB_EXPORT_REVISION,
        status: "exported",
        source: reportSource(input),
        ...diagnostics,
      },
    };
  } catch {
    return blockedReport(
      input,
      issue("error", "invalid-input", "Editable mesh export failed before a complete GLB could be produced"),
    );
  }
}

/**
 * Synchronous authority convenience. Non-empty modifier stacks fail closed because this API cannot
 * evaluate asynchronous Boolean backends; callers must apply the stack or use the BG3D handoff.
 */
export function exportStudioHybridDccAuthorityRecordGlb(
  record: Pick<
    StudioGeometryAuthorityRecord,
    "assetId" | "kernel" | "mesh" | "meshHash" | "modifierStack" | "revision"
  >,
): StudioHybridDccMeshGlbExportResult {
  if (record.kernel !== "half-edge") {
    const input = {
      assetId: record.assetId,
      mesh: record.mesh,
      sourceRevision: record.revision,
      sourceHash: record.meshHash,
    };
    return blockedReport(
      input,
      issue("error", "authority-not-editable-mesh", "Only the editable half-edge authority can be exported"),
    );
  }
  if (record.modifierStack.modifiers.length > 0) {
    const input = {
      assetId: record.assetId,
      mesh: record.mesh,
      sourceRevision: record.revision,
      sourceHash: record.meshHash,
    };
    return blockedReport(
      input,
      issue(
        "error",
        "modifier-stack-unapplied",
        "Non-empty modifier stacks require evaluation or explicit application before synchronous export",
      ),
    );
  }
  return exportStudioHybridDccMeshGlb({
    assetId: record.assetId,
    mesh: record.mesh,
    sourceRevision: record.revision,
    sourceHash: record.meshHash,
  });
}
