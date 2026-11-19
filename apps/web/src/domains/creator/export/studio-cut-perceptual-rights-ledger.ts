import type { StudioWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

export interface CutPerceptualRightsEntry {
  readonly cutId: string;
  readonly episodeLabel: string;
  readonly dHash64: string;
  readonly receiptIntegrityHash: string;
  readonly packId: string;
  readonly packName: string;
  readonly clearedForCommercialExport: boolean;
  readonly recordedAtIso: string;
}

export interface CutPerceptualRightsLedger {
  readonly ledgerSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly entries: readonly CutPerceptualRightsEntry[];
}

export interface CutPerceptualMatchResult {
  readonly matched: boolean;
  readonly hammingDistance: number;
  readonly confidencePercent: number;
  readonly entry: CutPerceptualRightsEntry | null;
}

const HEX_64_PATTERN = /^[0-9a-f]{16}$/;

/**
 * 9×8 그레이스케일 휘도 배열(길이 72)로부터 결정적 64비트 dHash(16자리 16진수)를 계산한다.
 * 플랫폼 업로드 과정에서 PNG tEXt 청크가 제거되거나 WebP/JPEG로 재압축되어도
 * 원본 Rights BOM 증명서를 역추적할 수 있는 경량 퍼셉추얼 지문이다.
 */
export function computeLumaDHash64(luma9x8: Uint8Array | readonly number[]): string {
  if (luma9x8.length !== 72) {
    throw new Error(`computeLumaDHash64는 정확히 72개(9×8) 휘도 샘플이 필요합니다 (입력: ${luma9x8.length}).`);
  }

  let hi = 0;
  let lo = 0;
  let bitIndex = 0;

  for (let row = 0; row < 8; row += 1) {
    const rowStart = row * 9;
    for (let col = 0; col < 8; col += 1) {
      const left = luma9x8[rowStart + col];
      const right = luma9x8[rowStart + col + 1];
      const bit = left > right ? 1 : 0;
      if (bitIndex < 32) {
        hi = ((hi << 1) | bit) >>> 0;
      } else {
        lo = ((lo << 1) | bit) >>> 0;
      }
      bitIndex += 1;
    }
  }

  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}

function popcount32(value: number): number {
  let v = value >>> 0;
  let count = 0;
  while (v !== 0) {
    v &= v - 1;
    count += 1;
  }
  return count;
}

/**
 * 두 64비트 16진수 dHash 간의 비트 해밍 거리(0~64)를 반환한다.
 */
export function hammingDistanceHex64(hashA: string, hashB: string): number {
  const a = hashA.toLowerCase();
  const b = hashB.toLowerCase();
  if (!HEX_64_PATTERN.test(a) || !HEX_64_PATTERN.test(b)) {
    throw new Error("유효한 16자리 16진수 64비트 해시가 아닙니다.");
  }

  const hiA = Number.parseInt(a.slice(0, 8), 16) >>> 0;
  const loA = Number.parseInt(a.slice(8, 16), 16) >>> 0;
  const hiB = Number.parseInt(b.slice(0, 8), 16) >>> 0;
  const loB = Number.parseInt(b.slice(8, 16), 16) >>> 0;

  return popcount32(hiA ^ hiB) + popcount32(loA ^ loB);
}

/**
 * 컷의 9×8 휘도 샘플과 Rights BOM 증명서를 하나의 퍼셉추얼 원장 항목으로 결합한다.
 */
export function buildCutPerceptualRightsEntry(params: {
  readonly cutId: string;
  readonly episodeLabel: string;
  readonly luma9x8: Uint8Array | readonly number[];
  readonly receipt: StudioWorkflowPackRightsReceipt;
  readonly recordedAtIso?: string;
}): CutPerceptualRightsEntry {
  return {
    cutId: params.cutId,
    episodeLabel: params.episodeLabel,
    dHash64: computeLumaDHash64(params.luma9x8),
    receiptIntegrityHash: params.receipt.integrityHash,
    packId: params.receipt.packId,
    packName: params.receipt.packName,
    clearedForCommercialExport: params.receipt.clearedForCommercialExport,
    recordedAtIso: params.recordedAtIso ?? new Date().toISOString(),
  };
}

/**
 * 재압축·메타데이터 제거된 배포본 컷의 dHash를 원장과 대조해 가장 가까운 원본 Rights BOM 항목을 찾는다.
 */
export function matchCutAgainstRightsLedger(
  queryDHash64: string,
  ledger: CutPerceptualRightsLedger,
  maxHammingDistance = 8,
): CutPerceptualMatchResult {
  let bestEntry: CutPerceptualRightsEntry | null = null;
  let bestDistance = 65;

  for (const entry of ledger.entries) {
    const distance = hammingDistanceHex64(queryDHash64, entry.dHash64);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEntry = entry;
    }
  }

  if (!bestEntry || bestDistance > maxHammingDistance) {
    return {
      matched: false,
      hammingDistance: bestDistance <= 64 ? bestDistance : 64,
      confidencePercent: bestDistance <= 64 ? Math.round(((64 - bestDistance) / 64) * 100) : 0,
      entry: null,
    };
  }

  return {
    matched: true,
    hammingDistance: bestDistance,
    confidencePercent: Math.round(((64 - bestDistance) / 64) * 100),
    entry: bestEntry,
  };
}

export function serializeCutPerceptualRightsLedger(ledger: CutPerceptualRightsLedger): string {
  return JSON.stringify(ledger, null, 2);
}

export function parseCutPerceptualRightsLedger(raw: string): CutPerceptualRightsLedger | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.ledgerSchemaVersion !== 1) return null;
    if (typeof obj.seriesTitle !== "string" || obj.seriesTitle.trim().length === 0) return null;
    if (!Array.isArray(obj.entries)) return null;

    for (const item of obj.entries) {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      if (
        typeof entry.cutId !== "string" ||
        typeof entry.episodeLabel !== "string" ||
        typeof entry.dHash64 !== "string" ||
        !HEX_64_PATTERN.test(entry.dHash64) ||
        typeof entry.receiptIntegrityHash !== "string" ||
        typeof entry.clearedForCommercialExport !== "boolean"
      ) {
        return null;
      }
    }
    return parsed as CutPerceptualRightsLedger;
  } catch {
    return null;
  }
}
