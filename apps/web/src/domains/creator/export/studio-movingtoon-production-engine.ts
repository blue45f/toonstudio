/**
 * Waves 50–59: 무빙툰·오디오비주얼 합성·인터랙티브 에피소드 파이프라인 (MovingToon Production Engine)
 * - W50: Panel-to-Keyframe Camera Motion Sequencer
 * - W51: Voice Actor Lip-Sync & Timing Cue Manifest
 * - W52: BGM & Foley Stem License Clearance Ledger
 * - W53: Shortform 9:16 Vertical Trailer Auto-Slicer Spec
 * - W54: Accessibility Captions & Audio Description Compliance
 * - W55: Adaptive Bitrate & WebP/AVIF Motion Budget Validator
 * - W56: Interactive Choice-Branch Episode State Graph
 * - W57: Haptic & Scroll-Trigger Event Sync Ledger
 * - W58: MovingToon Residual & Streaming Royalty Engine
 * - W59: MovingToon Master Delivery Package Verifier
 */

export interface CameraKeyframe {
  readonly cutId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly zoomScale: number;
  readonly panX: number;
  readonly panY: number;
}

export interface AudioStemEntry {
  readonly stemId: string;
  readonly kind: "bgm" | "foley" | "voice";
  readonly licenseCleared: boolean;
  readonly durationMs: number;
}

export interface InteractiveBranchNode {
  readonly nodeId: string;
  readonly nextNodeIds: readonly string[];
  readonly isEnding: boolean;
}

export interface MovingToonMasterPackageResult {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly readyForMasterDelivery: boolean;
  readonly totalDurationMs: number;
  readonly shortformEligible: boolean;
  readonly estimatedStreamingRoyaltyKrw: number;
  readonly blockers: readonly string[];
  readonly masterPackageDigestHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** W50 + W53: 카메라 키프레임 타임라인 정합성 및 9:16 숏폼 추출 적격성 검증 */
export function validateCameraKeyframeSequence(keyframes: readonly CameraKeyframe[]): {
  readonly valid: boolean;
  readonly totalDurationMs: number;
  readonly shortformEligible: boolean;
} {
  if (keyframes.length === 0) {
    return { valid: false, totalDurationMs: 0, shortformEligible: false };
  }
  let maxEnd = 0;
  for (const kf of keyframes) {
    if (kf.endMs <= kf.startMs || kf.zoomScale < 0.5 || kf.zoomScale > 4.0) {
      return { valid: false, totalDurationMs: 0, shortformEligible: false };
    }
    if (kf.endMs > maxEnd) maxEnd = kf.endMs;
  }
  return {
    valid: true,
    totalDurationMs: maxEnd,
    shortformEligible: maxEnd >= 15_000,
  };
}

/** W56: 인터랙티브 분기형 에피소드 그래프의 데드엔드(막다른 노드) 검증 */
export function validateInteractiveBranchGraph(
  nodes: readonly InteractiveBranchNode[],
): { readonly valid: boolean; readonly deadEndNodeIds: readonly string[] } {
  const idSet = new Set(nodes.map((n) => n.nodeId));
  const deadEndNodeIds: string[] = [];
  for (const node of nodes) {
    if (!node.isEnding) {
      const hasValidNext =
        node.nextNodeIds.length > 0 && node.nextNodeIds.every((id) => idSet.has(id));
      if (!hasValidNext) {
        deadEndNodeIds.push(node.nodeId);
      }
    }
  }
  return { valid: deadEndNodeIds.length === 0, deadEndNodeIds };
}

/** W58: 스트리밍 조회수 기반 성우·작곡가 러닝개런티 산출 */
export function computeMovingToonStreamingRoyaltyKrw(params: {
  readonly monthlyViews: number;
  readonly krwPerThousandViews: number;
  readonly audioPoolSharePercent: number;
}): number {
  const gross = (Math.max(0, params.monthlyViews) / 1000) * Math.max(0, params.krwPerThousandViews);
  return Math.round((gross * Math.max(0, params.audioPoolSharePercent)) / 100);
}

/** W51 + W52 + W54 + W55 + W57 + W59: 무빙툰 마스터 납품 패키지 통합 검증 */
export function verifyMovingToonMasterDelivery(params: {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly keyframes: readonly CameraKeyframe[];
  readonly audioStems: readonly AudioStemEntry[];
  readonly captionsIncluded: boolean;
  readonly audioDescriptionIncluded: boolean;
  readonly bundleSizeMb: number;
  readonly maxMobileBudgetMb: number;
  readonly hapticEventsSynced: boolean;
  readonly branchNodes?: readonly InteractiveBranchNode[];
  readonly projectedMonthlyViews: number;
}): MovingToonMasterPackageResult {
  const blockers: string[] = [];
  const seq = validateCameraKeyframeSequence(params.keyframes);
  if (!seq.valid) blockers.push("카메라 키프레임 타임라인 오류");

  const unclearedStems = params.audioStems.filter((s) => !s.licenseCleared);
  if (unclearedStems.length > 0) {
    blockers.push(`미승인 오디오 스템 ${unclearedStems.length}건`);
  }
  if (!params.captionsIncluded || !params.audioDescriptionIncluded) {
    blockers.push("WCAG 자막 또는 화면해설 누락");
  }
  if (params.bundleSizeMb > params.maxMobileBudgetMb) {
    blockers.push(
      `모바일 데이터 예산 초과 (${params.bundleSizeMb}MB > ${params.maxMobileBudgetMb}MB)`,
    );
  }
  if (!params.hapticEventsSynced) {
    blockers.push("스크롤·햅틱 이벤트 동기화 미검증");
  }
  if (params.branchNodes && params.branchNodes.length > 0) {
    const graphCheck = validateInteractiveBranchGraph(params.branchNodes);
    if (!graphCheck.valid) {
      blockers.push(`인터랙티브 분기 데드엔드 감지: ${graphCheck.deadEndNodeIds.join(", ")}`);
    }
  }

  const estimatedStreamingRoyaltyKrw = computeMovingToonStreamingRoyaltyKrw({
    monthlyViews: params.projectedMonthlyViews,
    krwPerThousandViews: 4_500,
    audioPoolSharePercent: 18,
  });

  const readyForMasterDelivery = blockers.length === 0;
  const masterPackageDigestHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: params.seriesTitle,
      episodeLabel: params.episodeLabel,
      readyForMasterDelivery,
      totalDurationMs: seq.totalDurationMs,
      estimatedStreamingRoyaltyKrw,
    }),
  );

  return {
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    readyForMasterDelivery,
    totalDurationMs: seq.totalDurationMs,
    shortformEligible: seq.shortformEligible,
    estimatedStreamingRoyaltyKrw,
    blockers,
    masterPackageDigestHash,
  };
}
