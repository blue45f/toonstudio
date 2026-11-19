import type { CutPerceptualRightsLedger } from "./studio-cut-perceptual-rights-ledger";
import type { StudioWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

export type TdmReservationStatus = 0 | 1;

export interface StudioAiOptOutManifest {
  readonly optOutSchemaVersion: 1;
  readonly protocol: "W3C-TDMRep-1.0";
  readonly tdmReservation: TdmReservationStatus;
  readonly aiTrainingAllowed: boolean;
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly rightsHolder: string;
  readonly policyNotice: string;
  readonly receiptIntegrityHash: string;
  readonly clearedForCommercialExport: boolean;
  readonly cutCount: number;
  readonly perceptualDHashes: readonly string[];
  readonly issuedAtIso: string;
  readonly manifestIntegrityHash: string;
}

export interface TdmRepWellKnownRule {
  readonly location: string;
  readonly "tdm-reservation": TdmReservationStatus;
  readonly "tdm-policy"?: string;
}

export interface AiOptOutVerificationResult {
  readonly validFormat: boolean;
  readonly optOutEnforced: boolean;
  readonly integrityVerified: boolean;
  readonly summary: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeManifestCanonicalHash(payload: {
  readonly tdmReservation: TdmReservationStatus;
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly rightsHolder: string;
  readonly receiptIntegrityHash: string;
  readonly perceptualDHashes: readonly string[];
}): string {
  return fnv1aHex(JSON.stringify(payload));
}

/**
 * 연재작 컷의 퍼셉추얼 지문(dHash)과 Rights BOM 해시를 결합해
 * W3C TDM Reservation(tdm-reservation: 1) 기반 AI 학습 금지(Opt-Out) 매니페스트를 생성한다.
 */
export function buildStudioAiOptOutManifest(params: {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly rightsHolder?: string;
  readonly receipt: StudioWorkflowPackRightsReceipt;
  readonly ledger: CutPerceptualRightsLedger;
  readonly tdmReservation?: TdmReservationStatus;
  readonly issuedAtIso?: string;
}): StudioAiOptOutManifest {
  const tdmReservation: TdmReservationStatus = params.tdmReservation ?? 1;
  const rightsHolder = params.rightsHolder?.trim() || "ToonStudio Creator";
  const perceptualDHashes = params.ledger.entries.map((entry) => entry.dHash64);
  const issuedAtIso = params.issuedAtIso ?? new Date().toISOString();

  const manifestIntegrityHash = computeManifestCanonicalHash({
    tdmReservation,
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    rightsHolder,
    receiptIntegrityHash: params.receipt.integrityHash,
    perceptualDHashes,
  });

  return {
    optOutSchemaVersion: 1,
    protocol: "W3C-TDMRep-1.0",
    tdmReservation,
    aiTrainingAllowed: tdmReservation === 0,
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    rightsHolder,
    policyNotice:
      tdmReservation === 1
        ? "본 웹툰 원고 및 컷 이미지의 생성형 AI 학습·텍스트/데이터 마이닝(TDM) 수집을 명시적으로 금지합니다."
        : "권리자 사전 허가 범위 내에서 텍스트/데이터 마이닝을 허용합니다.",
    receiptIntegrityHash: params.receipt.integrityHash,
    clearedForCommercialExport: params.receipt.clearedForCommercialExport,
    cutCount: perceptualDHashes.length,
    perceptualDHashes,
    issuedAtIso,
    manifestIntegrityHash,
  };
}

export function serializeStudioAiOptOutManifest(manifest: StudioAiOptOutManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * 웹 호스팅 `/.well-known/tdmrep.json` 에 바로 배치할 수 있는 규칙 배열을 반환한다.
 */
export function buildTdmRepWellKnownRules(
  manifest: StudioAiOptOutManifest,
  locationPattern = "/episodes/*",
  policyUrl?: string,
): readonly TdmRepWellKnownRule[] {
  return [
    {
      location: locationPattern,
      "tdm-reservation": manifest.tdmReservation,
      ...(policyUrl ? { "tdm-policy": policyUrl } : {}),
    },
  ];
}

/**
 * 외부 크롤러·법무·에이전시가 `ai-training-optout.json` 의 스키마와 무결성 해시를 검증한다.
 */
export function verifyAiOptOutManifestJson(rawJson: string): AiOptOutVerificationResult {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object") {
      return {
        validFormat: false,
        optOutEnforced: false,
        integrityVerified: false,
        summary: "유효한 JSON 객체가 아닙니다.",
      };
    }
    const obj = parsed as Record<string, unknown>;
    if (
      obj.optOutSchemaVersion !== 1 ||
      (obj.tdmReservation !== 0 && obj.tdmReservation !== 1) ||
      typeof obj.seriesTitle !== "string" ||
      typeof obj.episodeLabel !== "string" ||
      typeof obj.rightsHolder !== "string" ||
      typeof obj.receiptIntegrityHash !== "string" ||
      typeof obj.manifestIntegrityHash !== "string" ||
      !Array.isArray(obj.perceptualDHashes)
    ) {
      return {
        validFormat: false,
        optOutEnforced: false,
        integrityVerified: false,
        summary: "ai-training-optout.json 필수 필드가 누락되었습니다.",
      };
    }

    const hashes = obj.perceptualDHashes.filter((h): h is string => typeof h === "string");
    const expected = computeManifestCanonicalHash({
      tdmReservation: obj.tdmReservation,
      seriesTitle: obj.seriesTitle,
      episodeLabel: obj.episodeLabel,
      rightsHolder: obj.rightsHolder,
      receiptIntegrityHash: obj.receiptIntegrityHash,
      perceptualDHashes: hashes,
    });
    const integrityVerified = expected === obj.manifestIntegrityHash;
    const optOutEnforced = obj.tdmReservation === 1;

    if (!integrityVerified) {
      return {
        validFormat: true,
        optOutEnforced,
        integrityVerified: false,
        summary: "AI 옵트아웃 매니페스트 해시가 변조되었습니다.",
      };
    }

    return {
      validFormat: true,
      optOutEnforced,
      integrityVerified: true,
      summary: optOutEnforced
        ? `AI 학습 금지(tdm-reservation: 1) 무결성 검증 완료 (${obj.manifestIntegrityHash})`
        : `TDM 허용 설정 무결성 검증 완료 (${obj.manifestIntegrityHash})`,
    };
  } catch {
    return {
      validFormat: false,
      optOutEnforced: false,
      integrityVerified: false,
      summary: "ai-training-optout.json 파싱에 실패했습니다.",
    };
  }
}
