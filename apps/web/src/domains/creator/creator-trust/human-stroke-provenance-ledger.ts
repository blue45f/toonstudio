/**
 * 64-bit dHash 지각 지문 및 C2PA 스타일 인간 작화 비중 투명 배지(`humanStrokeRatio`, 보조 도구 공개) 원장.
 *
 * - 외부 네트워크 및 브라우저 스토리지 호출 0건(100% 온디바이스 순수 연산).
 * - 수작업 스트로크 비중과 보조 도구(3D 선화 변환·원근 자·밑색 보조·생성형 AI 등)의
 *   기여도를 투명하게 기록하고 SHA-256 클레임 다이제스트로 위변조를 탐지한다.
 */

import {
  computeDHash64,
  dHashSimilarityScore,
  hammingDistance64,
  parseDHash64Hex,
  type DHash64,
  type PixelSurfaceInput,
} from "../local-render-cache/perceptual-copyright-fingerprint";
import {
  canonicalJsonStringify,
  computeSha256Hex,
  type ByteSequence,
} from "./creator-trust-sha256";

export const HUMAN_PROVENANCE_LEDGER_SCHEMA = "toonstudio.human-provenance-ledger/1" as const;

const HEX_SHA256_REGEX = /^[0-9a-f]{64}$/u;
const HEX_DHASH64_REGEX = /^[0-9a-f]{16}$/u;

export type AssistToolCategory =
  | "3d-background-lt"
  | "perspective-ruler"
  | "color-flatting-assist"
  | "pose-reference-3d"
  | "screentone-pattern"
  | "stroke-stabilizer"
  | "generative-fill"
  | "other-assist";

export const ASSIST_TOOL_CATEGORY_LABELS_KO: Readonly<Record<AssistToolCategory, string>> =
  Object.freeze({
    "3d-background-lt": "3D 배경 선화 변환",
    "perspective-ruler": "원근·소실점 자",
    "color-flatting-assist": "밑색 자동 채움 보조",
    "pose-reference-3d": "3D 포즈 참고",
    "screentone-pattern": "스크린톤·패턴 에셋",
    "stroke-stabilizer": "손떨림 보정",
    "generative-fill": "생성형 AI 보조",
    "other-assist": "기타 보조 도구",
  });

export interface AssistToolUsageRecord {
  readonly toolId: string;
  readonly category: AssistToolCategory;
  readonly labelKo?: string;
  /** 이 보조 도구가 기여한 레이어·스트로크·면적 가중 단위(0 이상 유한수). */
  readonly contributedUnits: number;
  /** 생성형 AI 모델 관여 여부(투명 공개 필수). */
  readonly generativeAiInvolved: boolean;
  readonly appliedCutIds?: readonly string[];
  readonly notesKo?: string;
}

export interface NormalizedAssistToolUsageRecord {
  readonly toolId: string;
  readonly category: AssistToolCategory;
  readonly labelKo: string;
  readonly contributedUnits: number;
  readonly generativeAiInvolved: boolean;
  readonly appliedCutIds: readonly string[];
  readonly notesKo: string | null;
}

export type HumanAuthorshipBadgeTier =
  | "pure-human-hand"
  | "human-primary-assisted"
  | "human-ai-hybrid"
  | "assist-majority"
  | "unverified-empty";

export type C2paDigitalSourceTypeUri =
  | "http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt"
  | "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia"
  | "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
  | "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation";

export interface HumanAuthorshipBadge {
  readonly tier: HumanAuthorshipBadgeTier;
  readonly tierLabelKo: string;
  readonly headlineKo: string;
  readonly assistSummaryKo: string;
  readonly c2paDigitalSourceType: C2paDigitalSourceTypeUri;
}

export interface HumanProvenanceAssertion {
  readonly label:
    | "c2pa.actions"
    | "toonstudio.dhash-64.v1"
    | "toonstudio.human-stroke-ratio.v1"
    | "toonstudio.assist-tools.v1";
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

export interface BuildHumanStrokeProvenanceInput {
  readonly workId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly creatorDisplayName: string;
  readonly creatorHandle?: string;
  readonly surface: PixelSurfaceInput;
  readonly contentBytes?: ByteSequence;
  readonly humanStrokeCount: number;
  /** 미지정 시 `humanStrokeCount`를 인간 작화 단위로 사용한다. */
  readonly humanContributedUnits?: number;
  readonly manualDrawingDurationSec?: number;
  readonly assistTools?: readonly AssistToolUsageRecord[];
  readonly issuedAtIso?: string;
}

export interface HumanStrokeProvenanceRecord {
  readonly schema: typeof HUMAN_PROVENANCE_LEDGER_SCHEMA;
  readonly schemaVersion: 1;
  readonly standardReference: "C2PA-style-human-ratio-v1";
  readonly ledgerId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly creatorDisplayName: string;
  readonly creatorHandle: string | null;
  readonly issuedAtIso: string;
  readonly dHashAlgorithm: "dhash-64-9x8-rec709";
  readonly dHash64: DHash64;
  readonly contentSha256: string;
  readonly humanStrokeCount: number;
  readonly humanUnits: number;
  readonly assistUnits: number;
  readonly generativeAiUnits: number;
  readonly manualDrawingDurationSec: number;
  /** 인간 직접 작화 비중(0.0000 ~ 1.0000). */
  readonly humanStrokeRatio: number;
  /** 인간 직접 작화 백분율(0.0 ~ 100.0). */
  readonly humanStrokePercent: number;
  readonly assistToolRatio: number;
  readonly generativeAiRatio: number;
  readonly generativeAiDisclosed: boolean;
  readonly assistTools: readonly NormalizedAssistToolUsageRecord[];
  readonly badge: HumanAuthorshipBadge;
  readonly c2paAssertions: readonly HumanProvenanceAssertion[];
  readonly claimDigestSha256: string;
}

export type HumanProvenanceVerificationStatus =
  | "verified"
  | "invalid-schema"
  | "claim-tampered"
  | "content-tampered"
  | "dhash-mismatch";

export interface HumanProvenanceVerificationResult {
  readonly valid: boolean;
  readonly status: HumanProvenanceVerificationStatus;
  readonly claimIntegrityValid: boolean;
  readonly contentHashMatched: boolean | null;
  readonly dHashHammingDistance: number | null;
  readonly dHashSimilarity: number | null;
  readonly summaryKo: string;
}

function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new RangeError(`${fieldName} 값은 비어 있을 수 없습니다.`);
  }
  return trimmed;
}

function assertNonNegativeFinite(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${fieldName} 값은 0 이상의 유한수여야 합니다: ${String(value)}`);
  }
  return value;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function classifyHumanAuthorshipBadge(params: {
  readonly totalUnits: number;
  readonly humanUnits: number;
  readonly humanStrokeRatio: number;
  readonly humanStrokePercent: number;
  readonly generativeAiUnits: number;
  readonly assistTools: readonly NormalizedAssistToolUsageRecord[];
}): HumanAuthorshipBadge {
  const assistLabels = params.assistTools.map((tool) => tool.labelKo);
  const assistSummaryKo =
    assistLabels.length > 0 ? assistLabels.join(", ") : "보조 도구 미사용";

  if (params.totalUnits === 0) {
    return Object.freeze({
      tier: "unverified-empty",
      tierLabelKo: "작화 이력 미기록",
      headlineKo: "작화 스트로크 및 보조 도구 기록이 아직 없습니다",
      assistSummaryKo,
      c2paDigitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation",
    });
  }

  const c2paDigitalSourceType: C2paDigitalSourceTypeUri =
    params.generativeAiUnits === 0
      ? "http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt"
      : params.humanUnits > 0
        ? "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia"
        : "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

  const pctText = `${params.humanStrokePercent.toFixed(1)}%`;

  if (params.humanStrokeRatio >= 0.95 && params.generativeAiUnits === 0) {
    return Object.freeze({
      tier: "pure-human-hand",
      tierLabelKo: "순수 수작업 작화",
      headlineKo: `인간 작화 ${pctText} · 순수 수작업(생성형 AI 미사용)`,
      assistSummaryKo,
      c2paDigitalSourceType,
    });
  }

  if (params.humanStrokeRatio >= 0.7 && params.generativeAiUnits === 0) {
    return Object.freeze({
      tier: "human-primary-assisted",
      tierLabelKo: "인간 중심 작화 (제작 보조 병행)",
      headlineKo: `인간 작화 ${pctText} · 제작 보조 도구 ${params.assistTools.length}종 공개`,
      assistSummaryKo,
      c2paDigitalSourceType,
    });
  }

  if (params.humanStrokeRatio >= 0.3) {
    const suffix =
      params.generativeAiUnits > 0
        ? `생성형 AI 포함 보조 도구 ${params.assistTools.length}종 공개`
        : `보조 도구 ${params.assistTools.length}종 공개`;
    return Object.freeze({
      tier: "human-ai-hybrid",
      tierLabelKo: "인간·보조 도구 혼합 작화",
      headlineKo: `인간 작화 ${pctText} · ${suffix}`,
      assistSummaryKo,
      c2paDigitalSourceType,
    });
  }

  return Object.freeze({
    tier: "assist-majority",
    tierLabelKo: "보조 도구 비중 우세",
    headlineKo: `인간 작화 ${pctText} · 보조 도구 비중 우세(${params.assistTools.length}종 공개)`,
    assistSummaryKo,
    c2paDigitalSourceType,
  });
}

/**
 * 64-bit dHash 지각 지문과 C2PA 스타일 인간 작화 비중(`humanStrokeRatio`)·보조 도구 공개 원장을
 * 결정론적으로 생성하고 SHA-256 클레임 다이제스트로 봉인한다.
 */
export function buildHumanStrokeProvenanceRecord(
  input: BuildHumanStrokeProvenanceInput,
): HumanStrokeProvenanceRecord {
  const workId = requireNonEmpty(input.workId, "workId");
  const episodeId = requireNonEmpty(input.episodeId, "episodeId");
  const cutId = requireNonEmpty(input.cutId, "cutId");
  const creatorDisplayName = requireNonEmpty(input.creatorDisplayName, "creatorDisplayName");
  const creatorHandle = input.creatorHandle?.trim() || null;
  const issuedAtIso = input.issuedAtIso ?? "2026-11-22T00:00:00.000Z";

  const humanStrokeCount = Math.trunc(
    assertNonNegativeFinite(input.humanStrokeCount, "humanStrokeCount"),
  );
  const humanUnits = assertNonNegativeFinite(
    input.humanContributedUnits ?? humanStrokeCount,
    "humanContributedUnits",
  );
  const manualDrawingDurationSec = assertNonNegativeFinite(
    input.manualDrawingDurationSec ?? 0,
    "manualDrawingDurationSec",
  );

  const assistTools: readonly NormalizedAssistToolUsageRecord[] = Object.freeze(
    (input.assistTools ?? []).map((tool) => {
      const toolId = requireNonEmpty(tool.toolId, "assistTool.toolId");
      const contributedUnits = assertNonNegativeFinite(
        tool.contributedUnits,
        `assistTool(${toolId}).contributedUnits`,
      );
      const labelKo = tool.labelKo?.trim() || ASSIST_TOOL_CATEGORY_LABELS_KO[tool.category];
      const generativeAiInvolved =
        tool.category === "generative-fill" ? true : Boolean(tool.generativeAiInvolved);
      return Object.freeze({
        toolId,
        category: tool.category,
        labelKo,
        contributedUnits,
        generativeAiInvolved,
        appliedCutIds: Object.freeze([...(tool.appliedCutIds ?? [])]),
        notesKo: tool.notesKo?.trim() || null,
      });
    }),
  );

  const assistUnits = assistTools.reduce((acc, item) => acc + item.contributedUnits, 0);
  const generativeAiUnits = assistTools.reduce(
    (acc, item) => acc + (item.generativeAiInvolved ? item.contributedUnits : 0),
    0,
  );
  const totalUnits = humanUnits + assistUnits;

  const humanStrokeRatio = totalUnits > 0 ? round4(Math.min(1, humanUnits / totalUnits)) : 0;
  const assistToolRatio = totalUnits > 0 ? round4(Math.min(1, assistUnits / totalUnits)) : 0;
  const generativeAiRatio =
    totalUnits > 0 ? round4(Math.min(1, generativeAiUnits / totalUnits)) : 0;
  const humanStrokePercent = round1(humanStrokeRatio * 100);
  const generativeAiDisclosed = generativeAiUnits > 0;

  const dHash64 = Object.freeze(computeDHash64(input.surface, "0deg"));
  const contentSha256 = computeSha256Hex(input.contentBytes ?? input.surface.data);

  const badge = classifyHumanAuthorshipBadge({
    totalUnits,
    humanUnits,
    humanStrokeRatio,
    humanStrokePercent,
    generativeAiUnits,
    assistTools,
  });

  const c2paAssertions: readonly HumanProvenanceAssertion[] = Object.freeze([
    Object.freeze({
      label: "c2pa.actions" as const,
      data: Object.freeze({
        action: "c2pa.created",
        digitalSourceType: badge.c2paDigitalSourceType,
        softwareAgent: "ToonStudio/2.0",
      }),
    }),
    Object.freeze({
      label: "toonstudio.dhash-64.v1" as const,
      data: Object.freeze({
        algorithm: "dhash-64-9x8-rec709",
        hex: dHash64.hex,
        width: input.surface.width,
        height: input.surface.height,
      }),
    }),
    Object.freeze({
      label: "toonstudio.human-stroke-ratio.v1" as const,
      data: Object.freeze({
        humanStrokeCount,
        humanUnits,
        assistUnits,
        humanStrokeRatio,
        humanStrokePercent,
        generativeAiDisclosed,
        badgeTier: badge.tier,
      }),
    }),
    Object.freeze({
      label: "toonstudio.assist-tools.v1" as const,
      data: Object.freeze({
        toolCount: assistTools.length,
        assistSummaryKo: badge.assistSummaryKo,
        generativeAiRatio,
      }),
    }),
  ]);

  const ledgerId = `ts-hprov-${computeSha256Hex(`${workId}:${episodeId}:${cutId}:${contentSha256}:${dHash64.hex}`).slice(0, 16)}`;

  const claimBody: Omit<HumanStrokeProvenanceRecord, "claimDigestSha256"> = {
    schema: HUMAN_PROVENANCE_LEDGER_SCHEMA,
    schemaVersion: 1,
    standardReference: "C2PA-style-human-ratio-v1",
    ledgerId,
    workId,
    episodeId,
    cutId,
    creatorDisplayName,
    creatorHandle,
    issuedAtIso,
    dHashAlgorithm: "dhash-64-9x8-rec709",
    dHash64,
    contentSha256,
    humanStrokeCount,
    humanUnits,
    assistUnits,
    generativeAiUnits,
    manualDrawingDurationSec,
    humanStrokeRatio,
    humanStrokePercent,
    assistToolRatio,
    generativeAiRatio,
    generativeAiDisclosed,
    assistTools,
    badge,
    c2paAssertions,
  };

  return Object.freeze({
    ...claimBody,
    claimDigestSha256: computeSha256Hex(canonicalJsonStringify(claimBody)),
  });
}

/**
 * 인간 작화 비중 원장의 클레임 무결성·콘텐츠 SHA-256·64-bit dHash 해밍 거리 일치를 검증한다.
 */
export function verifyHumanStrokeProvenanceRecord(
  record: unknown,
  options?: {
    readonly contentBytes?: ByteSequence;
    readonly surface?: PixelSurfaceInput;
    readonly maxDHashHammingDistance?: number;
  },
): HumanProvenanceVerificationResult {
  const invalid = (summaryKo: string): HumanProvenanceVerificationResult =>
    Object.freeze({
      valid: false,
      status: "invalid-schema",
      claimIntegrityValid: false,
      contentHashMatched: null,
      dHashHammingDistance: null,
      dHashSimilarity: null,
      summaryKo,
    });

  if (!record || typeof record !== "object") {
    return invalid("인간 작화 원장이 유효한 객체 형식이 아닙니다.");
  }

  const candidate = record as Partial<HumanStrokeProvenanceRecord>;
  if (
    candidate.schema !== HUMAN_PROVENANCE_LEDGER_SCHEMA ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.contentSha256 !== "string" ||
    !HEX_SHA256_REGEX.test(candidate.contentSha256) ||
    typeof candidate.claimDigestSha256 !== "string" ||
    !HEX_SHA256_REGEX.test(candidate.claimDigestSha256) ||
    !candidate.dHash64 ||
    typeof candidate.dHash64.hex !== "string" ||
    !HEX_DHASH64_REGEX.test(candidate.dHash64.hex) ||
    typeof candidate.humanStrokeRatio !== "number" ||
    !Array.isArray(candidate.assistTools) ||
    !Array.isArray(candidate.c2paAssertions)
  ) {
    return invalid("인간 작화 원장의 스키마·SHA-256·64-bit dHash 형식이 올바르지 않습니다.");
  }

  const { claimDigestSha256, ...claimBody } = candidate as HumanStrokeProvenanceRecord;
  const expectedDigest = computeSha256Hex(canonicalJsonStringify(claimBody));
  const contentHashMatched =
    options?.contentBytes !== undefined
      ? computeSha256Hex(options.contentBytes) === candidate.contentSha256
      : null;

  let dHashHammingDistance: number | null = null;
  let dHashSimilarity: number | null = null;
  if (options?.surface !== undefined) {
    const computedDHash = computeDHash64(options.surface, "0deg");
    dHashHammingDistance = hammingDistance64(candidate.dHash64, computedDHash);
    dHashSimilarity = dHashSimilarityScore(dHashHammingDistance);
  }

  if (expectedDigest !== claimDigestSha256) {
    return Object.freeze({
      valid: false,
      status: "claim-tampered",
      claimIntegrityValid: false,
      contentHashMatched,
      dHashHammingDistance,
      dHashSimilarity,
      summaryKo: "인간 작화 비중·보조 도구 목록 또는 dHash 메타데이터가 발급 이후 변조되었습니다.",
    });
  }

  if (contentHashMatched === false) {
    return Object.freeze({
      valid: false,
      status: "content-tampered",
      claimIntegrityValid: true,
      contentHashMatched: false,
      dHashHammingDistance,
      dHashSimilarity,
      summaryKo: "원고 바이트 SHA-256이 인간 작화 원장에 기록된 해시와 일치하지 않습니다.",
    });
  }

  const maxDistance = options?.maxDHashHammingDistance ?? 5;
  if (dHashHammingDistance !== null && dHashHammingDistance > maxDistance) {
    return Object.freeze({
      valid: false,
      status: "dhash-mismatch",
      claimIntegrityValid: true,
      contentHashMatched,
      dHashHammingDistance,
      dHashSimilarity,
      summaryKo: `64-bit dHash 해밍 거리(${dHashHammingDistance})가 허용 한계(${maxDistance})를 초과했습니다.`,
    });
  }

  return Object.freeze({
    valid: true,
    status: "verified",
    claimIntegrityValid: true,
    contentHashMatched,
    dHashHammingDistance,
    dHashSimilarity,
    summaryKo: `인간 작화 비중(${candidate.humanStrokePercent.toFixed(1)}%) 및 64-bit dHash 원장 무결성 검증을 통과했습니다.`,
  });
}

/** 두 원장 또는 16자리 64-bit dHash 16진수 간 해밍 거리와 지각 유사도를 계산한다. */
export function compareProvenanceDHash(
  left: Pick<HumanStrokeProvenanceRecord, "dHash64"> | DHash64 | string,
  right: Pick<HumanStrokeProvenanceRecord, "dHash64"> | DHash64 | string,
): { readonly hammingDistance: number; readonly similarityScore: number } {
  const resolveHash = (
    input: Pick<HumanStrokeProvenanceRecord, "dHash64"> | DHash64 | string,
  ): DHash64 => {
    if (typeof input === "string") return parseDHash64Hex(input);
    return "dHash64" in input ? input.dHash64 : input;
  };
  const hammingDistance = hammingDistance64(resolveHash(left), resolveHash(right));
  return Object.freeze({
    hammingDistance,
    similarityScore: dHashSimilarityScore(hammingDistance),
  });
}
