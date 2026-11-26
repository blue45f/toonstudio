/**
 * #16 제로-트러스트 서브캔버스 컷/레이어 부분 위임 & 어시스턴트 정산 BOM.
 *
 * - 메인 작가가 허용한 컷·레이어 부분집합만 추출해 WebCrypto AES-GCM-256으로 암호화 패키징한다.
 * - 미허용 컷·미공개 대사·잠긴 선화 레이어는 패키지에 아예 포함되지 않으며,
 *   어시스턴트가 제출 페이로드를 변조해 범위 밖 레이어 수정을 시도해도 병합 단계에서 원자적으로 전면 거부한다.
 * - 정상 병합 시 레이어별 해시 변경량·스트로크 수·작업 시간 기반 검증 가능 정산/권리 BOM을 자동 산출한다.
 */

import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJsonBytes,
  decryptAesGcm256,
  encryptAesGcm256,
  randomBytes,
  sha256Hex,
  utf8Decode,
  utf8Encode,
  type AesGcmCipherEnvelope,
} from "./crypto-binary-utils";

export type SubCanvasLayerRole =
  | "lineart"
  | "flatting"
  | "bg"
  | "shading"
  | "effects"
  | "lettering";

export interface MasterCanvasLayer {
  readonly layerId: string;
  readonly name: string;
  readonly role: SubCanvasLayerRole;
  readonly contentBytes: Uint8Array;
}

export interface MasterCanvasCut {
  readonly cutId: string;
  readonly layers: readonly MasterCanvasLayer[];
}

export interface MasterCanvasDocument {
  readonly workId: string;
  readonly episodeId: string;
  readonly cuts: readonly MasterCanvasCut[];
}

export interface DelegationSettlementRates {
  /** 시간당 정산 단가(KRW). */
  readonly hourlyRateKrw: number;
  /** 완료 레이어당 고정 단가(KRW, 기본 0). */
  readonly perLayerBonusKrw?: number;
}

export interface CreateDelegationRequest {
  readonly delegationId?: string;
  readonly assistantId: string;
  readonly assistantDisplayName: string;
  readonly allowedCutIds: readonly string[];
  /** 컷별 수정 허용 레이어 ID 목록. */
  readonly allowedLayerIdsByCut: Readonly<Record<string, readonly string[]>>;
  /** 컷별 읽기 전용 참고 레이어 ID 목록(예: 선화 가이드). */
  readonly readOnlyReferenceLayerIdsByCut?: Readonly<Record<string, readonly string[]>>;
  readonly expiresAtMs: number;
  readonly rates: DelegationSettlementRates;
  readonly nowMs?: number;
}

export interface ScopedDelegatedLayer {
  readonly layerId: string;
  readonly name: string;
  readonly role: SubCanvasLayerRole;
  readonly access: "editable" | "readonly";
  readonly contentBase64Url: string;
  readonly baselineSha256Hex: string;
}

export interface ScopedDelegatedCut {
  readonly cutId: string;
  readonly layers: readonly ScopedDelegatedLayer[];
}

export interface ScopedSubCanvasWorkspace {
  readonly delegationId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly assistantId: string;
  readonly expiresAtMs: number;
  readonly cuts: readonly ScopedDelegatedCut[];
}

export interface EncryptedDelegationPackage {
  readonly delegationId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly assistantId: string;
  readonly allowedCutCount: number;
  readonly editableLayerCount: number;
  readonly readOnlyLayerCount: number;
  readonly expiresAtMs: number;
  readonly scopeHashHex: string;
  readonly envelope: AesGcmCipherEnvelope;
  readonly packageSha256Hex: string;
}

export interface IssuedDelegationBundle {
  readonly encryptedPackage: EncryptedDelegationPackage;
  /** 어시스턴트에게 P2P/QR 등으로 별도 전달할 32바이트 일회성 세션 키. */
  readonly sessionKey32: Uint8Array;
}

export interface AssistantLayerEditInput {
  readonly cutId: string;
  readonly layerId: string;
  readonly stage: SubCanvasLayerRole;
  readonly updatedBytes: Uint8Array;
  readonly strokeCount: number;
  readonly activeMinutes: number;
  readonly startedAtIso: string;
  readonly endedAtIso: string;
}

export interface EncryptedAssistantSubmission {
  readonly delegationId: string;
  readonly assistantId: string;
  readonly submittedAtMs: number;
  readonly envelope: AesGcmCipherEnvelope;
  readonly submissionSha256Hex: string;
}

export type DelegationViolationCode =
  | "DELEGATION_NOT_FOUND"
  | "DELEGATION_EXPIRED"
  | "DECRYPTION_FAILED"
  | "OUT_OF_SCOPE_CUT"
  | "OUT_OF_SCOPE_LAYER"
  | "READONLY_LAYER_MODIFIED"
  | "UNKNOWN_TARGET_LAYER"
  | "INVALID_EFFORT_METRICS";

export interface DelegationScopeViolation {
  readonly code: DelegationViolationCode;
  readonly cutId?: string;
  readonly layerId?: string;
  readonly message: string;
}

export interface SettlementBomLayerEntry {
  readonly cutId: string;
  readonly layerId: string;
  readonly stage: SubCanvasLayerRole;
  readonly strokeCount: number;
  readonly activeMinutes: number;
  readonly previousSha256Hex: string;
  readonly updatedSha256Hex: string;
  readonly previousByteLength: number;
  readonly updatedByteLength: number;
  readonly contentChanged: boolean;
  readonly hourlyAllocationKrw: number;
  readonly layerBonusKrw: number;
}

export interface AssistantSettlementBom {
  readonly schemaVersion: "toonstudio-assistant-settlement-bom-v1";
  readonly delegationId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly assistantId: string;
  readonly assistantDisplayName: string;
  readonly licenseScope: "work-for-hire-scoped-contribution";
  readonly mergedAtIso: string;
  readonly entries: readonly SettlementBomLayerEntry[];
  readonly totalActiveMinutes: number;
  readonly totalStrokeCount: number;
  readonly modifiedLayerCount: number;
  readonly hourlySettlementKrw: number;
  readonly perLayerBonusTotalKrw: number;
  readonly totalSettlementKrw: number;
  readonly bomDigestSha256Hex: string;
}

export interface SubCanvasMergeResult {
  readonly merged: boolean;
  readonly mergedDocument: MasterCanvasDocument;
  readonly violations: readonly DelegationScopeViolation[];
  readonly settlementBom: AssistantSettlementBom | null;
}

interface StoredDelegationRecord {
  readonly delegationId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly assistantId: string;
  readonly assistantDisplayName: string;
  readonly allowedCutIds: ReadonlySet<string>;
  readonly editableLayersByCut: ReadonlyMap<string, ReadonlySet<string>>;
  readonly readOnlyLayersByCut: ReadonlyMap<string, ReadonlySet<string>>;
  readonly baselineDigestByKey: ReadonlyMap<string, string>;
  readonly expiresAtMs: number;
  readonly scopeHashHex: string;
  readonly rates: DelegationSettlementRates;
}

interface SerializedAssistantEdit {
  readonly cutId: string;
  readonly layerId: string;
  readonly stage: SubCanvasLayerRole;
  readonly updatedBase64Url: string;
  readonly updatedSha256Hex: string;
  readonly strokeCount: number;
  readonly activeMinutes: number;
  readonly startedAtIso: string;
  readonly endedAtIso: string;
}

interface DecryptedSubmissionPayload {
  readonly delegationId: string;
  readonly assistantId: string;
  readonly edits: readonly SerializedAssistantEdit[];
}

function makeLayerKey(cutId: string, layerId: string): string {
  return `${cutId}::${layerId}`;
}

function buildPackageAad(delegationId: string, assistantId: string, scopeHashHex: string): string {
  return `subcanvas-pkg|${delegationId}|${assistantId}|${scopeHashHex}`;
}

function buildReturnAad(delegationId: string, assistantId: string, scopeHashHex: string): string {
  return `subcanvas-return|${delegationId}|${assistantId}|${scopeHashHex}`;
}

/**
 * 제로-트러스트 서브캔버스 부분 위임 및 어시스턴트 정산 BOM 관리자.
 */
export class SubCanvasDelegationManager {
  private readonly records = new Map<string, StoredDelegationRecord>();

  /** 허용된 컷·레이어만 추출해 AES-GCM-256 암호화 위임 패키지 발급. */
  async createDelegationPackage(
    masterDoc: MasterCanvasDocument,
    request: CreateDelegationRequest,
  ): Promise<IssuedDelegationBundle> {
    const nowMs = request.nowMs ?? Date.now();
    if (request.expiresAtMs <= nowMs) {
      throw new Error("위임 만료 시각은 현재 시각 이후여야 합니다.");
    }
    const delegationId =
      request.delegationId ?? `dlg-${bytesToBase64Url(randomBytes(9)).replace(/[-_]/gu, "")}`;

    const allowedCutSet = new Set(request.allowedCutIds);
    const editableLayersByCut = new Map<string, Set<string>>();
    const readOnlyLayersByCut = new Map<string, Set<string>>();
    const baselineDigestByKey = new Map<string, string>();
    const scopedCuts: ScopedDelegatedCut[] = [];

    let editableLayerCount = 0;
    let readOnlyLayerCount = 0;

    for (let c = 0; c < masterDoc.cuts.length; c += 1) {
      const cut = masterDoc.cuts[c];
      if (!allowedCutSet.has(cut.cutId)) {
        continue;
      }
      const editableSet = new Set(request.allowedLayerIdsByCut[cut.cutId] ?? []);
      const readOnlySet = new Set(request.readOnlyReferenceLayerIdsByCut?.[cut.cutId] ?? []);
      editableLayersByCut.set(cut.cutId, editableSet);
      readOnlyLayersByCut.set(cut.cutId, readOnlySet);

      const scopedLayers: ScopedDelegatedLayer[] = [];
      for (let l = 0; l < cut.layers.length; l += 1) {
        const layer = cut.layers[l];
        const isEditable = editableSet.has(layer.layerId);
        const isReadOnly = !isEditable && readOnlySet.has(layer.layerId);
        if (!isEditable && !isReadOnly) {
          continue;
        }
        const baselineSha256Hex = sha256Hex(layer.contentBytes);
        baselineDigestByKey.set(makeLayerKey(cut.cutId, layer.layerId), baselineSha256Hex);
        scopedLayers.push({
          layerId: layer.layerId,
          name: layer.name,
          role: layer.role,
          access: isEditable ? "editable" : "readonly",
          contentBase64Url: bytesToBase64Url(layer.contentBytes),
          baselineSha256Hex,
        });
        if (isEditable) {
          editableLayerCount += 1;
        } else {
          readOnlyLayerCount += 1;
        }
      }

      scopedCuts.push({
        cutId: cut.cutId,
        layers: scopedLayers,
      });
    }

    if (editableLayerCount === 0) {
      throw new Error("수정 허용된 위임 대상 레이어가 최소 1개 이상 필요합니다.");
    }

    const scopeHashHex = sha256Hex(
      canonicalJsonBytes({
        workId: masterDoc.workId,
        episodeId: masterDoc.episodeId,
        assistantId: request.assistantId,
        allowedCutIds: [...allowedCutSet].sort(),
        allowedLayerIdsByCut: request.allowedLayerIdsByCut,
        readOnlyReferenceLayerIdsByCut: request.readOnlyReferenceLayerIdsByCut ?? {},
        expiresAtMs: request.expiresAtMs,
      }),
    );

    const workspace: ScopedSubCanvasWorkspace = {
      delegationId,
      workId: masterDoc.workId,
      episodeId: masterDoc.episodeId,
      assistantId: request.assistantId,
      expiresAtMs: request.expiresAtMs,
      cuts: scopedCuts,
    };

    const sessionKey32 = randomBytes(32);
    const aad = buildPackageAad(delegationId, request.assistantId, scopeHashHex);
    const envelope = await encryptAesGcm256(
      utf8Encode(JSON.stringify(workspace)),
      sessionKey32,
      aad,
    );

    const packageSha256Hex = sha256Hex(
      canonicalJsonBytes({
        delegationId,
        scopeHashHex,
        envelope,
      }),
    );

    this.records.set(delegationId, {
      delegationId,
      workId: masterDoc.workId,
      episodeId: masterDoc.episodeId,
      assistantId: request.assistantId,
      assistantDisplayName: request.assistantDisplayName,
      allowedCutIds: allowedCutSet,
      editableLayersByCut,
      readOnlyLayersByCut,
      baselineDigestByKey,
      expiresAtMs: request.expiresAtMs,
      scopeHashHex,
      rates: request.rates,
    });

    return {
      encryptedPackage: {
        delegationId,
        workId: masterDoc.workId,
        episodeId: masterDoc.episodeId,
        assistantId: request.assistantId,
        allowedCutCount: scopedCuts.length,
        editableLayerCount,
        readOnlyLayerCount,
        expiresAtMs: request.expiresAtMs,
        scopeHashHex,
        envelope,
        packageSha256Hex,
      },
      sessionKey32,
    };
  }

  /** 어시스턴트 측 암호화 위임 패키지 복호화(만료·키·AAD 검증 포함). */
  async openDelegationPackage(
    encryptedPackage: EncryptedDelegationPackage,
    sessionKey32: Uint8Array,
    nowMs = Date.now(),
  ): Promise<ScopedSubCanvasWorkspace> {
    if (nowMs > encryptedPackage.expiresAtMs) {
      throw new Error("만료된 서브캔버스 위임 패키지입니다.");
    }
    const expectedAad = buildPackageAad(
      encryptedPackage.delegationId,
      encryptedPackage.assistantId,
      encryptedPackage.scopeHashHex,
    );
    const plainBytes = await decryptAesGcm256(encryptedPackage.envelope, sessionKey32, expectedAad);
    return JSON.parse(utf8Decode(plainBytes)) as ScopedSubCanvasWorkspace;
  }

  /** 어시스턴트 작업 결과를 AES-GCM-256으로 암호화해 제출 패킷 생성. */
  async createAssistantSubmission(
    encryptedPackage: EncryptedDelegationPackage,
    sessionKey32: Uint8Array,
    edits: readonly AssistantLayerEditInput[],
    submittedAtMs = Date.now(),
  ): Promise<EncryptedAssistantSubmission> {
    const serializedEdits: SerializedAssistantEdit[] = edits.map((edit) => ({
      cutId: edit.cutId,
      layerId: edit.layerId,
      stage: edit.stage,
      updatedBase64Url: bytesToBase64Url(edit.updatedBytes),
      updatedSha256Hex: sha256Hex(edit.updatedBytes),
      strokeCount: edit.strokeCount,
      activeMinutes: edit.activeMinutes,
      startedAtIso: edit.startedAtIso,
      endedAtIso: edit.endedAtIso,
    }));

    const payload: DecryptedSubmissionPayload = {
      delegationId: encryptedPackage.delegationId,
      assistantId: encryptedPackage.assistantId,
      edits: serializedEdits,
    };

    const aad = buildReturnAad(
      encryptedPackage.delegationId,
      encryptedPackage.assistantId,
      encryptedPackage.scopeHashHex,
    );
    const envelope = await encryptAesGcm256(
      utf8Encode(JSON.stringify(payload)),
      sessionKey32,
      aad,
    );

    return {
      delegationId: encryptedPackage.delegationId,
      assistantId: encryptedPackage.assistantId,
      submittedAtMs,
      envelope,
      submissionSha256Hex: sha256Hex(canonicalJsonBytes({ envelope, submittedAtMs })),
    };
  }

  /**
   * 어시스턴트 제출 패킷 복호화 + 제로-트러스트 범위 검증 + 원자적 병합 및 정산 BOM 생성.
   * 범위 밖 컷/레이어 또는 읽기 전용 레이어 변경이 1건이라도 있으면 병합을 전면 거부한다.
   */
  async verifyAndMergeSubmission(
    masterDoc: MasterCanvasDocument,
    delegationId: string,
    submission: EncryptedAssistantSubmission,
    sessionKey32: Uint8Array,
    nowMs = Date.now(),
  ): Promise<SubCanvasMergeResult> {
    const record = this.records.get(delegationId);
    if (!record) {
      return {
        merged: false,
        mergedDocument: masterDoc,
        violations: [
          {
            code: "DELEGATION_NOT_FOUND",
            message: `등록되지 않은 위임 ID입니다(${delegationId}).`,
          },
        ],
        settlementBom: null,
      };
    }

    if (nowMs > record.expiresAtMs || submission.submittedAtMs > record.expiresAtMs) {
      return {
        merged: false,
        mergedDocument: masterDoc,
        violations: [
          {
            code: "DELEGATION_EXPIRED",
            message: "위임 유효 기간이 만료되어 제출 결과를 병합할 수 없습니다.",
          },
        ],
        settlementBom: null,
      };
    }

    let decrypted: DecryptedSubmissionPayload;
    try {
      const expectedAad = buildReturnAad(
        record.delegationId,
        record.assistantId,
        record.scopeHashHex,
      );
      const plainBytes = await decryptAesGcm256(submission.envelope, sessionKey32, expectedAad);
      decrypted = JSON.parse(utf8Decode(plainBytes)) as DecryptedSubmissionPayload;
    } catch {
      return {
        merged: false,
        mergedDocument: masterDoc,
        violations: [
          {
            code: "DECRYPTION_FAILED",
            message: "제출 패킷 복호화 또는 인증 태그 검증에 실패했습니다.",
          },
        ],
        settlementBom: null,
      };
    }

    const masterCutMap = new Map<string, MasterCanvasCut>();
    for (let i = 0; i < masterDoc.cuts.length; i += 1) {
      masterCutMap.set(masterDoc.cuts[i].cutId, masterDoc.cuts[i]);
    }

    const violations: DelegationScopeViolation[] = [];
    const validatedUpdates = new Map<
      string,
      { readonly edit: SerializedAssistantEdit; readonly bytes: Uint8Array }
    >();

    for (let i = 0; i < decrypted.edits.length; i += 1) {
      const edit = decrypted.edits[i];
      if (!record.allowedCutIds.has(edit.cutId)) {
        violations.push({
          code: "OUT_OF_SCOPE_CUT",
          cutId: edit.cutId,
          layerId: edit.layerId,
          message: `허용 범위를 벗어난 컷(${edit.cutId}) 수정이 차단되었습니다.`,
        });
        continue;
      }

      const editableSet = record.editableLayersByCut.get(edit.cutId);
      const readOnlySet = record.readOnlyLayersByCut.get(edit.cutId);
      if (readOnlySet && readOnlySet.has(edit.layerId)) {
        violations.push({
          code: "READONLY_LAYER_MODIFIED",
          cutId: edit.cutId,
          layerId: edit.layerId,
          message: `읽기 전용 참고 레이어(${edit.cutId}/${edit.layerId}) 변조 시도가 차단되었습니다.`,
        });
        continue;
      }
      if (!editableSet || !editableSet.has(edit.layerId)) {
        violations.push({
          code: "OUT_OF_SCOPE_LAYER",
          cutId: edit.cutId,
          layerId: edit.layerId,
          message: `허용 범위를 벗어난 레이어(${edit.cutId}/${edit.layerId}) 수정이 차단되었습니다.`,
        });
        continue;
      }

      const masterCut = masterCutMap.get(edit.cutId);
      const targetLayer = masterCut?.layers.find((layer) => layer.layerId === edit.layerId);
      if (!targetLayer) {
        violations.push({
          code: "UNKNOWN_TARGET_LAYER",
          cutId: edit.cutId,
          layerId: edit.layerId,
          message: `원본 문서에 존재하지 않는 대상 레이어입니다(${edit.cutId}/${edit.layerId}).`,
        });
        continue;
      }

      if (
        !Number.isFinite(edit.activeMinutes) ||
        edit.activeMinutes < 0 ||
        !Number.isFinite(edit.strokeCount) ||
        edit.strokeCount < 0
      ) {
        violations.push({
          code: "INVALID_EFFORT_METRICS",
          cutId: edit.cutId,
          layerId: edit.layerId,
          message: "작업 시간 또는 스트로크 수 기록이 유효하지 않습니다.",
        });
        continue;
      }

      const updatedBytes = base64UrlToBytes(edit.updatedBase64Url);
      validatedUpdates.set(makeLayerKey(edit.cutId, edit.layerId), {
        edit,
        bytes: updatedBytes,
      });
    }

    if (violations.length > 0) {
      return {
        merged: false,
        mergedDocument: masterDoc,
        violations,
        settlementBom: null,
      };
    }

    // 검증 완료: 허용 레이어만 원자적으로 새 문서 스냅샷에 반영 + 정산 BOM 계산
    const bomEntries: SettlementBomLayerEntry[] = [];
    const perLayerBonus = record.rates.perLayerBonusKrw ?? 0;

    const mergedCuts: MasterCanvasCut[] = masterDoc.cuts.map((cut) => {
      const nextLayers = cut.layers.map((layer) => {
        const key = makeLayerKey(cut.cutId, layer.layerId);
        const update = validatedUpdates.get(key);
        if (!update) {
          return layer;
        }
        const previousSha256Hex =
          record.baselineDigestByKey.get(key) ?? sha256Hex(layer.contentBytes);
        const updatedSha256Hex = sha256Hex(update.bytes);
        const contentChanged = previousSha256Hex !== updatedSha256Hex;
        const hourlyAllocationKrw = Math.round(
          (update.edit.activeMinutes / 60) * record.rates.hourlyRateKrw,
        );
        const layerBonusKrw = contentChanged ? perLayerBonus : 0;

        bomEntries.push({
          cutId: cut.cutId,
          layerId: layer.layerId,
          stage: update.edit.stage,
          strokeCount: Math.round(update.edit.strokeCount),
          activeMinutes: Number(update.edit.activeMinutes.toFixed(2)),
          previousSha256Hex,
          updatedSha256Hex,
          previousByteLength: layer.contentBytes.byteLength,
          updatedByteLength: update.bytes.byteLength,
          contentChanged,
          hourlyAllocationKrw,
          layerBonusKrw,
        });

        return {
          ...layer,
          contentBytes: update.bytes,
        };
      });
      return {
        cutId: cut.cutId,
        layers: nextLayers,
      };
    });

    const totalActiveMinutes = Number(
      bomEntries.reduce((acc, item) => acc + item.activeMinutes, 0).toFixed(2),
    );
    const totalStrokeCount = bomEntries.reduce((acc, item) => acc + item.strokeCount, 0);
    const hourlySettlementKrw = bomEntries.reduce((acc, item) => acc + item.hourlyAllocationKrw, 0);
    const perLayerBonusTotalKrw = bomEntries.reduce((acc, item) => acc + item.layerBonusKrw, 0);
    const totalSettlementKrw = hourlySettlementKrw + perLayerBonusTotalKrw;
    const mergedAtIso = new Date(nowMs).toISOString();

    const bomCore = {
      schemaVersion: "toonstudio-assistant-settlement-bom-v1" as const,
      delegationId: record.delegationId,
      workId: record.workId,
      episodeId: record.episodeId,
      assistantId: record.assistantId,
      assistantDisplayName: record.assistantDisplayName,
      licenseScope: "work-for-hire-scoped-contribution" as const,
      mergedAtIso,
      entries: bomEntries,
      totalActiveMinutes,
      totalStrokeCount,
      modifiedLayerCount: bomEntries.length,
      hourlySettlementKrw,
      perLayerBonusTotalKrw,
      totalSettlementKrw,
    };

    const settlementBom: AssistantSettlementBom = {
      ...bomCore,
      bomDigestSha256Hex: sha256Hex(canonicalJsonBytes(bomCore)),
    };

    return {
      merged: true,
      mergedDocument: {
        workId: masterDoc.workId,
        episodeId: masterDoc.episodeId,
        cuts: mergedCuts,
      },
      violations: [],
      settlementBom,
    };
  }
}
