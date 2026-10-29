/** 파일 decoder 결과를 검증된 편집 자산 한 묶음으로 확정한다. 원본 자산을 덮어쓰지 않는다. */
import { importStudioGradeAAsset } from "../../studio-grade-a-import-pipeline";
import { importStudioMeshByExtension } from "../../studio-mesh-format-adapters";
import { sha256HexPortable } from "../../studio-sha256";
import { hashStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { hybridDccRegisterAssets } from "../studio-hybrid-dcc-document";
import { createStudioHybridDccIdentityTransform } from "../studio-hybrid-dcc-object-transform";
import { synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "../studio-hybrid-dcc-workspace";

import { STUDIO_NATIVE_IMPORT_MAX_ASSETS, STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES, type StudioNativeImportAsset, type StudioNativeImportIssue } from "./studio-hybrid-dcc-native-import-contracts";
import { decodeStudioNativeGlb } from "./studio-hybrid-dcc-native-glb";
import { decodeStudioNativeObj } from "./studio-hybrid-dcc-native-obj";

export interface StudioNativeWorkspaceImportReport {
  readonly kind: "studio-native-editable-import";
  readonly revision: 1;
  readonly format: string;
  readonly sourceName: string;
  readonly sourceHash: string;
  readonly committed: boolean;
  readonly outcome: "registered" | "metadata-only" | "unsupported";
  readonly assets: readonly {
    readonly assetId: string; readonly name: string; readonly meshHash: string;
    readonly vertexCount: number; readonly faceCount: number; readonly uvCornerCount: number;
    readonly sourceNodeIndex?: number; readonly sourceMeshIndex?: number; readonly sourcePrimitiveIndex?: number;
  }[];
  readonly issues: readonly StudioNativeImportIssue[];
}

export class StudioNativeWorkspaceImportError extends Error {
  constructor(readonly issues: readonly StudioNativeImportIssue[]) {
    super(issues.find(({ severity }) => severity === "error")?.detail ?? "모델을 편집 가능한 메시로 가져오지 못했습니다.");
    this.name = "StudioNativeWorkspaceImportError";
  }
}
function fail(code: string, detail: string): never {
  throw new StudioNativeWorkspaceImportError([{ severity: "error", code, detail }]);
}

function uniqueAssetId(prefix: string, ids: Set<string>): string {
  for (let ordinal = 1; ordinal <= STUDIO_NATIVE_IMPORT_MAX_ASSETS + 1; ordinal += 1) {
    const id = ordinal === 1 ? prefix : `${prefix}-${ordinal}`;
    if (!ids.has(id)) { ids.add(id); return id; }
  }
  return fail("asset-budget", "가져온 모델에 사용할 고유 자산 ID를 만들 수 없습니다.");
}

export function workspaceImportStudioNativeBytes(workspace: StudioHybridDccWorkspace, fileName: string, bytes: Uint8Array): StudioHybridDccWorkspace {
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 512) fail("file-name", "모델 파일 이름이 비어 있거나 너무 깁니다.");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES) fail("file-size", "모델 파일이 비어 있거나 128 MiB 한도를 넘었습니다.");
  const extension = fileName.toLowerCase().split(".").at(-1) ?? "";
  let assets: readonly StudioNativeImportAsset[] = [];
  let issues: readonly StudioNativeImportIssue[] = [];
  let format = extension;
  let legacy: Readonly<Record<string, unknown>> = {};
  if (extension === "glb" || extension === "gltf" || extension === "vrm" || extension === "obj") {
    const decoded = extension === "obj" ? decodeStudioNativeObj(bytes) : decodeStudioNativeGlb(bytes, extension);
    if (!decoded.ok) throw new StudioNativeWorkspaceImportError(decoded.issues);
    assets = decoded.value.assets; issues = decoded.value.issues; format = decoded.value.format;
    if (!assets.length) fail("empty-geometry", "파일에 등록할 수 있는 편집 메시가 없습니다.");
  } else {
    const adapter = importStudioMeshByExtension(fileName, bytes);
    if (adapter) {
      assets = adapter.meshes.map((mesh, index) => ({ name: `${fileName} ${index + 1}`, mesh, initialTransform: createStudioHybridDccIdentityTransform() }));
      issues = adapter.report.unsupportedEntities.map(({ kind, reason }) => ({ severity: "warning", code: `adapter-${kind}`, detail: reason }));
      format = adapter.format;
      legacy = { ...adapter.report, adapterFormat: adapter.format, extras: adapter.extras ?? null };
    } else {
      const result = importStudioGradeAAsset({ fileName, bytes });
      legacy = { ...result.report };
      format = result.format;
      issues = [{ severity: "error", code: "report-only", detail: "이 형식은 정밀 작업대의 편집 메시로 등록할 수 없습니다. 지원하는 모델 형식으로 변환해 가져오세요." }];
    }
  }
  const sourceHash = `sha256:${sha256HexPortable(bytes)}`;
  const report = (registered: StudioNativeWorkspaceImportReport["assets"], outcome: StudioNativeWorkspaceImportReport["outcome"]): StudioNativeWorkspaceImportReport => ({
    ...legacy, kind: "studio-native-editable-import", revision: 1, format, sourceName: fileName, sourceHash,
    committed: outcome === "registered", outcome, assets: registered, issues,
  });
  if (!assets.length) {
    if (!issues.some(({ severity }) => severity === "error")) issues = [...issues, { severity: "warning", code: "metadata-only", detail: "파일의 분석 정보만 읽었습니다. 편집 가능한 메시를 등록하지 않았습니다." }];
    return { ...workspace, lastImportReport: report([], issues.some(({ severity }) => severity === "error") ? "unsupported" : "metadata-only") };
  }
  if (issues.some(({ severity }) => severity === "error")) throw new StudioNativeWorkspaceImportError(issues);
  if (assets.length > STUDIO_NATIVE_IMPORT_MAX_ASSETS || Object.keys(workspace.session.state.geometry.records).length + assets.length > STUDIO_NATIVE_IMPORT_MAX_ASSETS) fail("asset-budget", "현재 문서에 등록할 수 있는 편집 자산 수를 넘었습니다. 다른 작업파일로 가져오세요.");
  if (assets.some(({ mesh }) => !mesh.faces.length || !mesh.vertices.length)) fail("empty-geometry", "등록할 메시의 정점이나 면이 비어 있습니다.");
  const ids = new Set(Object.keys(workspace.session.state.geometry.records));
  const prefix = `import-${fileName.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 40) || "model"}`;
  const prepared = assets.map((asset) => ({
    ...asset, assetId: uniqueAssetId(prefix, ids),
    rights: { source: fileName, creator: "import", license: "unknown", useScope: "editorial", derivative: `imported:${format}:${sourceHash}` },
  }));
  let session: StudioHybridDccWorkspace["session"];
  try { session = hybridDccRegisterAssets(workspace.session, prepared); }
  catch { return fail("registration-failed", "가져온 메시·변환을 모두 검증하지 못해 등록하지 않았습니다. 원본 파일을 확인하세요."); }
  const registered = prepared.map((asset) => ({
    assetId: asset.assetId, name: asset.name, meshHash: hashStudioEditableMesh(asset.mesh),
    vertexCount: asset.mesh.vertices.length, faceCount: asset.mesh.faces.length, uvCornerCount: asset.mesh.uvLayer?.corners.length ?? 0,
    ...(asset.sourceNodeIndex === undefined ? {} : { sourceNodeIndex: asset.sourceNodeIndex }),
    ...(asset.sourceMeshIndex === undefined ? {} : { sourceMeshIndex: asset.sourceMeshIndex }),
    ...(asset.sourcePrimitiveIndex === undefined ? {} : { sourcePrimitiveIndex: asset.sourcePrimitiveIndex }),
  }));
  return { ...synchronizeWorkspaceGeometryAuthority(workspace, session), activeAssetId: registered[0]?.assetId ?? null, lastImportReport: report(registered, "registered") };
}

/** 저장된 report도 표시 전에 최소 구조를 확인한다. 임의 코드·경로를 실행하지 않는다. */
export function readStudioNativeWorkspaceImportReport(value: unknown): StudioNativeWorkspaceImportReport | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Partial<StudioNativeWorkspaceImportReport>;
  if (report.kind !== "studio-native-editable-import" || report.revision !== 1
    || typeof report.format !== "string" || typeof report.sourceName !== "string" || typeof report.sourceHash !== "string"
    || typeof report.committed !== "boolean" || report.committed !== (report.outcome === "registered") || !["registered", "metadata-only", "unsupported"].includes(report.outcome ?? "")
    || !Array.isArray(report.assets) || !Array.isArray(report.issues)
    || report.issues.some((issue: unknown) => !issue || typeof issue !== "object"
      || typeof (issue as Partial<StudioNativeImportIssue>).code !== "string" || typeof (issue as Partial<StudioNativeImportIssue>).detail !== "string"
      || !["warning", "error"].includes((issue as Partial<StudioNativeImportIssue>).severity ?? ""))
    || report.assets.some((asset: unknown) => {
      if (!asset || typeof asset !== "object") return true;
      const item = asset as Partial<StudioNativeWorkspaceImportReport["assets"][number]>;
      return typeof item.assetId !== "string" || typeof item.name !== "string" || typeof item.meshHash !== "string"
        || !Number.isSafeInteger(item.vertexCount) || !Number.isSafeInteger(item.faceCount) || !Number.isSafeInteger(item.uvCornerCount);
    })) return null;
  return report as StudioNativeWorkspaceImportReport;
}
