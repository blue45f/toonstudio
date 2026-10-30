import { readStudioBg3dModelSourceSnapshotV12 } from "./bg3d-model-library";
import {
  fingerprintStudioBg3dModelSourceRestriction,
  readStudioBg3dEffectiveModelSourceRestriction,
} from "./studio-bg3d-model-source-restriction";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";
import type { StudioBg3dGlbValidationExecutionBackend } from "./studio-bg3d-glb-validation-worker-client";

export type StudioBg3dModelExportProvenanceErrorCode = "aborted" | "source-changed" | "asset-invalid"
  | "rights-restricted" | "rights-unavailable";
const MESSAGES: Readonly<Record<StudioBg3dModelExportProvenanceErrorCode, string>> = {
  aborted: "모델 출처 확인을 취소했습니다.",
  "source-changed": "파일 준비 중 모델 원본이나 출처 제한이 바뀌었습니다. 현재 상태에서 다시 시도해 주세요.",
  "asset-invalid": "표시 중인 모델과 저장된 원본의 검증 정보가 다릅니다.",
  "rights-restricted": "서비스 안에서만 사용할 수 있는 자산이 포함되어 모델 파일을 저장하지 않았습니다. 장면 안의 편집과 적용은 계속할 수 있습니다.",
  "rights-unavailable": "모델의 출처와 파일 내보내기 조건을 확인하지 못했습니다. 연결 상태와 자산 등록 정보를 확인한 뒤 다시 시도해 주세요.",
};
export class StudioBg3dModelExportProvenanceError extends Error {
  constructor(readonly code: StudioBg3dModelExportProvenanceErrorCode, options?: ErrorOptions) {
    super(MESSAGES[code], options);
    this.name = "StudioBg3dModelExportProvenanceError";
  }
}
export interface StudioBg3dModelExportProvenanceReceipt {
  readonly modelFileExport: StudioBg3dModelSourceRestrictionV1["modelFileExport"];
  readonly sourceRestriction: StudioBg3dModelSourceRestrictionV1;
}
export interface StudioBg3dModelExportProvenanceOptions {
  readonly signal?: AbortSignal;
  readonly assertCurrent?: () => void;
  readonly authority?: StudioBg3dLibrariesAuthority;
  readonly executionBackend?: StudioBg3dGlbValidationExecutionBackend;
}
type SourceSnapshot = NonNullable<Awaited<ReturnType<typeof readStudioBg3dModelSourceSnapshotV12>>>;
interface ReceiptState {
  readonly options: StudioBg3dModelExportProvenanceOptions;
  readonly sourceId: string;
  readonly recordIdentity: string;
  readonly sourceKind: SourceSnapshot["sourceKind"];
  readonly manifestRevision: number | null;
  readonly catalogIdentity: string | null;
}
const receipts = new WeakMap<StudioBg3dModelExportProvenanceReceipt, ReceiptState>();

function check(options: StudioBg3dModelExportProvenanceOptions): void {
  if (options.signal?.aborted) throw new StudioBg3dModelExportProvenanceError("aborted", { cause: options.signal.reason });
  options.assertCurrent?.();
}
function recordIdentity(record: Bg3dVerifiedStoredRecord, includeRestriction = true): string {
  const { id, storageVersion, format, contentHash, byteSize, mime, validationVersion, rights } = record;
  return JSON.stringify({ id, storageVersion, format, contentHash, byteSize, mime, validationVersion,
    rights: [rights.status, rights.commercialUse, rights.attributionRequired, rights.attribution ?? null, rights.licenseName ?? null],
    restriction: includeRestriction ? fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(record)) : null });
}
async function readSource(id: string, options: StudioBg3dModelExportProvenanceOptions): Promise<SourceSnapshot | null> {
  check(options);
  let source: SourceSnapshot | null;
  try {
    source = await readStudioBg3dModelSourceSnapshotV12(id,
      { signal: options.signal, authority: options.authority, executionBackend: options.executionBackend });
  } catch (error) {
    if (options.signal?.aborted) throw new StudioBg3dModelExportProvenanceError("aborted", { cause: error });
    throw new StudioBg3dModelExportProvenanceError("rights-unavailable", { cause: error });
  }
  check(options);
  return source;
}

/** 현재 저장·카탈로그 권위로 출처를 확인한다. 제한 자산의 서비스 내 가공에도 같은 결과를 쓴다. */
export async function resolveStudioBg3dModelExportProvenance(record: Bg3dVerifiedStoredRecord,
  options: StudioBg3dModelExportProvenanceOptions = {}): Promise<StudioBg3dModelExportProvenanceReceipt> {
  const source = await readSource(record.id, options);
  if (!source) throw new StudioBg3dModelExportProvenanceError("rights-unavailable");
  // 번들 제한의 권위는 현재 exact catalog다. 예전 렌더 캐시에 없던 제한도 허가로 바꾸지 않는다.
  const compareRestriction = source.sourceKind === "local-library";
  if (recordIdentity(record, compareRestriction) !== recordIdentity(source.record, compareRestriction)) {
    throw new StudioBg3dModelExportProvenanceError("asset-invalid");
  }
  const sourceRestriction = readStudioBg3dEffectiveModelSourceRestriction(source.record);
  const receipt = Object.freeze({ modelFileExport: sourceRestriction.modelFileExport, sourceRestriction });
  receipts.set(receipt, { options: { ...options }, sourceId: record.id, recordIdentity: recordIdentity(source.record),
    sourceKind: source.sourceKind, manifestRevision: source.manifestRevision, catalogIdentity: source.catalogIdentity });
  return receipt;
}

/** DTO를 복사하거나 권리 라벨을 바꿔 만든 객체를 내보내기 허가로 받지 않는다. */
export function assertStudioBg3dModelFileExportAllowed(receipt: StudioBg3dModelExportProvenanceReceipt): void {
  if (!receipts.has(receipt)) throw new StudioBg3dModelExportProvenanceError("rights-unavailable");
  if (receipt.modelFileExport === "service-only") throw new StudioBg3dModelExportProvenanceError("rights-restricted");
  if (receipt.modelFileExport !== "allowed") throw new StudioBg3dModelExportProvenanceError("rights-unavailable");
}

/** 비동기 준비 뒤 실제 파일 인계 직전에 원본·제한·저장 revision·catalog를 다시 읽는다. */
export async function assertStudioBg3dModelExportReceiptCurrent(receipt: StudioBg3dModelExportProvenanceReceipt): Promise<void> {
  const state = receipts.get(receipt);
  if (!state) throw new StudioBg3dModelExportProvenanceError("rights-unavailable");
  const source = await readSource(state.sourceId, state.options);
  // 다른 모델·썸네일의 정상 저장은 허가를 폐기하지 않는다. 현재 exact row는 아래에서 다시 대조한다.
  const revisionRegressed = source?.manifestRevision !== null && source?.manifestRevision !== undefined && state.manifestRevision !== null
    && source.manifestRevision < state.manifestRevision;
  if (!source || source.sourceKind !== state.sourceKind || revisionRegressed
    || source.catalogIdentity !== state.catalogIdentity || recordIdentity(source.record) !== state.recordIdentity) {
    throw new StudioBg3dModelExportProvenanceError("source-changed");
  }
}
