/**
 * 인간 작화 증명서 · 비가시적 포렌식 워터마크 · 작가 손목/마감 건강 페이스 코치 엔진.
 */

export interface CraftContributionInput {
  readonly episodeTitle: string;
  readonly creatorName: string;
  readonly handDrawnStrokeCount: number;
  readonly handDrawnMinutes: number;
  readonly scene3dMinutes: number;
  readonly aiAssistMinutes: number;
  readonly issuedAtIso?: string;
}

export type HumanCraftGradeId =
  | "pure-handcraft"
  | "human-led-hybrid"
  | "assisted-production"
  | "ai-heavy-disclosed";

export interface HumanCraftCertificate {
  readonly certificateId: string;
  readonly episodeTitle: string;
  readonly creatorName: string;
  readonly issuedAtIso: string;
  readonly handDrawnPercent: number;
  readonly scene3dPercent: number;
  readonly aiAssistPercent: number;
  readonly handDrawnStrokeCount: number;
  readonly totalProductionMinutes: number;
  readonly gradeId: HumanCraftGradeId;
  readonly gradeBadgeKo: string;
  readonly transparencyStatementKo: string;
  readonly verificationFingerprint: string;
}

export type WatermarkSessionPurpose = "outsource-handoff" | "editor-preview" | "press-screener";

export interface StealthWatermarkInput {
  readonly workId: string;
  readonly episodeNumber: number;
  readonly recipientLabel: string;
  readonly sessionId: string;
  readonly purpose: WatermarkSessionPurpose;
  readonly issuedAtIso?: string;
}

export interface StealthWatermarkSignature {
  readonly watermarkCode: string;
  readonly sessionHashHex: string;
  readonly purpose: WatermarkSessionPurpose;
  readonly purposeLabelKo: string;
  readonly embeddingStrategyKo: string;
  readonly imperceptibleDeltaE: number;
  readonly traceableMetadataSummaryKo: string;
  readonly issuedAtIso: string;
}

export interface ErgonomicCoachInput {
  readonly continuousDrawingMinutes: number;
  readonly stylusPressureStiffness: number;
  readonly dailyHoursWorked: number;
  readonly leftHandShortcutActive: boolean;
  readonly deadlineHoursRemaining?: number;
}

export type ErgonomicRiskLevel = "steady" | "caution" | "break-now";

export interface ErgonomicStretchStep {
  readonly stepNumber: number;
  readonly durationSec: number;
  readonly titleKo: string;
  readonly instructionKo: string;
}

export interface ErgonomicCoachEvaluation {
  readonly riskLevel: ErgonomicRiskLevel;
  readonly riskLabelKo: string;
  readonly fatigueIndex: number;
  readonly recommendedBreakSeconds: number;
  readonly suggestLeftHandSwitch: boolean;
  readonly leftHandShortcutGuideKo: string;
  readonly stretchRoutine90s: readonly ErgonomicStretchStep[];
  readonly coachMessageKo: string;
}

const WATERMARK_PURPOSE_LABELS_KO: Readonly<Record<WatermarkSessionPurpose, string>> = {
  "outsource-handoff": "외주 전달본 추적",
  "editor-preview": "편집부 미리보기",
  "press-screener": "사전 시사·제휴 스크리너",
};

const STRETCH_ROUTINE_90S: readonly ErgonomicStretchStep[] = [
  {
    stepNumber: 1,
    durationSec: 30,
    titleKo: "손목 굽힘근 이완 (30초)",
    instructionKo: "펜을 내려놓고 오른팔을 앞으로 편 뒤, 왼손으로 손가락을 몸쪽으로 부드럽게 당겨 전완근 긴장을 풉니다.",
  },
  {
    stepNumber: 2,
    durationSec: 30,
    titleKo: "엄지·손등 신전근 풀기 (30초)",
    instructionKo: "주먹을 가볍게 쥐었다 펴기 10회 후, 손등을 아래로 부드럽게 눌러 필압 경직 부위를 이완합니다.",
  },
  {
    stepNumber: 3,
    durationSec: 30,
    titleKo: "승모근·눈 20-20-20 원거리 휴식 (30초)",
    instructionKo: "어깨를 뒤로 크게 5회 돌리고 6m 이상 먼 곳을 바라보며 호흡을 정리한 뒤 작업을 이어갑니다.",
  },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** 결정론적 64비트 해시(브라우저·Node 공용, WebCrypto/Node 의존 없음). */
export function computeDeterministicHex64(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i + 1) * 31;
    h2 = Math.imul(h2, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}`;
}

function allocateNormalizedPercents(
  values: readonly [number, number, number],
): readonly [number, number, number] {
  const safe = values.map((v) => Math.max(0, Number.isFinite(v) ? v : 0)) as [number, number, number];
  const total = safe[0] + safe[1] + safe[2];
  if (total <= 0) return [100, 0, 0];

  const exact = safe.map((v) => (v / total) * 100);
  const floors = exact.map((v) => Math.floor(v)) as [number, number, number];
  let remainder = 100 - (floors[0] + floors[1] + floors[2]);

  const rankedIndices = [0, 1, 2].sort(
    (a, b) => (exact[b]! - floors[b]!) - (exact[a]! - floors[a]!),
  );
  for (const idx of rankedIndices) {
    if (remainder <= 0) break;
    floors[idx] = (floors[idx] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}

/** 손그림·3D·AI 보조 작업 비중을 투명하게 집계해 인간 작화 증명서를 발급한다. */
export function generateHumanCraftCertificate(input: CraftContributionInput): HumanCraftCertificate {
  const episodeTitle = input.episodeTitle.trim() || "무제 회차";
  const creatorName = input.creatorName.trim() || "작가 미지정";
  const handMin = Math.max(0, Math.round(input.handDrawnMinutes));
  const scene3dMin = Math.max(0, Math.round(input.scene3dMinutes));
  const aiMin = Math.max(0, Math.round(input.aiAssistMinutes));
  const handDrawnStrokeCount = Math.max(0, Math.round(input.handDrawnStrokeCount));
  const issuedAtIso = input.issuedAtIso?.trim() || "2026-11-23T12:00:00+09:00";

  const [handDrawnPercent, scene3dPercent, aiAssistPercent] = allocateNormalizedPercents([
    handMin,
    scene3dMin,
    aiMin,
  ]);
  const totalProductionMinutes = handMin + scene3dMin + aiMin;

  let gradeId: HumanCraftGradeId;
  let gradeBadgeKo: string;
  if (aiAssistPercent === 0 && handDrawnPercent >= 75) {
    gradeId = "pure-handcraft";
    gradeBadgeKo = "순수 수작업 작화 인증 (AI 0%)";
  } else if (handDrawnPercent >= 60 && aiAssistPercent <= 20) {
    gradeId = "human-led-hybrid";
    gradeBadgeKo = "인간 주도 하이브리드 작화 인증";
  } else if (aiAssistPercent <= 45) {
    gradeId = "assisted-production";
    gradeBadgeKo = "AI 보조 공정 투명 공개 인증";
  } else {
    gradeId = "ai-heavy-disclosed";
    gradeBadgeKo = "AI 고비중 협업 표기 대상";
  }

  const fingerprint = computeDeterministicHex64(
    `${episodeTitle}|${creatorName}|${handDrawnStrokeCount}|${handMin}|${scene3dMin}|${aiMin}|${issuedAtIso}`,
  );
  const certificateId = `HCERT-${fingerprint.slice(0, 4).toUpperCase()}-${fingerprint.slice(4, 8).toUpperCase()}`;

  return {
    certificateId,
    episodeTitle,
    creatorName,
    issuedAtIso,
    handDrawnPercent,
    scene3dPercent,
    aiAssistPercent,
    handDrawnStrokeCount,
    totalProductionMinutes,
    gradeId,
    gradeBadgeKo,
    transparencyStatementKo:
      `손그림 ${handDrawnPercent}%(${handDrawnStrokeCount.toLocaleString("ko-KR")}획) · ` +
      `3D 배치 ${scene3dPercent}% · AI 보조 ${aiAssistPercent}% 공정 기록 집계`,
    verificationFingerprint: fingerprint,
  };
}

/** 외주/미리보기 유출 방지를 위한 비가시적 포렌식 워터마크 서명을 생성한다. */
export function buildStealthWatermarkSignature(input: StealthWatermarkInput): StealthWatermarkSignature {
  const workId = input.workId.trim() || "work-default";
  const episodeNumber = Math.max(1, Math.round(input.episodeNumber));
  const recipientLabel = input.recipientLabel.trim() || "내부 검수자";
  const sessionId = input.sessionId.trim() || "sess-local";
  const issuedAtIso = input.issuedAtIso?.trim() || "2026-11-23T12:00:00+09:00";

  const sessionHashHex = computeDeterministicHex64(
    `${workId}|ep:${episodeNumber}|${recipientLabel}|${sessionId}|${input.purpose}|${issuedAtIso}`,
  );
  const upper = sessionHashHex.toUpperCase();
  const watermarkCode = `TSWM-${upper.slice(0, 4)}-${upper.slice(4, 8)}-${upper.slice(8, 12)}`;
  const purposeLabelKo = WATERMARK_PURPOSE_LABELS_KO[input.purpose];

  return {
    watermarkCode,
    sessionHashHex,
    purpose: input.purpose,
    purposeLabelKo,
    embeddingStrategyKo: "DCT 중역대 주파수 + 미소 루마 위상 분산 삽입 (크롭·JPEG 재압축 내성)",
    imperceptibleDeltaE: 0.42,
    traceableMetadataSummaryKo: `${workId} · ${episodeNumber}화 · 수신:${recipientLabel} · 용도:${purposeLabelKo}`,
    issuedAtIso,
  };
}

/** 연속 작화 시간과 필압 경직도를 평가해 90초 스트레칭과 왼손 단축키 전환을 안내한다. */
export function evaluateErgonomicBurnoutCoach(input: ErgonomicCoachInput): ErgonomicCoachEvaluation {
  const continuousMinutes = Math.max(0, Math.round(input.continuousDrawingMinutes));
  const stiffness = Math.round(clamp(input.stylusPressureStiffness, 0, 100));
  const dailyHours = Math.max(0, roundTo(input.dailyHoursWorked, 1));
  const deadlineHours =
    input.deadlineHoursRemaining !== undefined
      ? Math.max(0, roundTo(input.deadlineHoursRemaining, 1))
      : undefined;

  const durationScore = clamp((continuousMinutes / 90) * 50, 0, 50);
  const stiffnessScore = clamp((stiffness / 100) * 35, 0, 35);
  const dailyLoadScore = clamp((dailyHours / 10) * 15, 0, 15);
  const fatigueIndex = Math.round(clamp(durationScore + stiffnessScore + dailyLoadScore, 0, 100));

  let riskLevel: ErgonomicRiskLevel = "steady";
  let riskLabelKo = "안정 페이스";
  let recommendedBreakSeconds = 0;

  if (continuousMinutes >= 75 || stiffness >= 75 || fatigueIndex >= 72) {
    riskLevel = "break-now";
    riskLabelKo = "즉시 90초 휴식 권장";
    recommendedBreakSeconds = 90;
  } else if (continuousMinutes >= 45 || stiffness >= 50 || fatigueIndex >= 48) {
    riskLevel = "caution";
    riskLabelKo = "손목 경직 주의";
    recommendedBreakSeconds = 90;
  }

  const suggestLeftHandSwitch = !input.leftHandShortcutActive && (stiffness >= 45 || continuousMinutes >= 45);
  const leftHandShortcutGuideKo = input.leftHandShortcutActive
    ? "왼손 단축키·다이얼 분담이 활성화되어 오른손 필압 부담을 줄이고 있습니다."
    : "실행 취소(Z)·브러시 크기([ / ])·화면 회전(R)을 왼손 단축키·한손 패드로 옮겨 오른손 반복 클릭을 분산하세요.";

  const deadlineNote =
    deadlineHours !== undefined && deadlineHours <= 12
      ? ` 마감 ${deadlineHours}시간 전이지만 90초 회복이 후반 선화 떨림을 막아 전체 속도를 지켜줍니다.`
      : "";

  const coachMessageKo =
    riskLevel === "break-now"
      ? `연속 ${continuousMinutes}분 작화 · 필압 경직도 ${stiffness}/100입니다. 지금 90초 스트레칭을 완료하고 이어서 작업하세요.${deadlineNote}`
      : riskLevel === "caution"
        ? `연속 ${continuousMinutes}분 경과 · 손목 피로가 쌓이는 구간입니다. 다음 컷 마무리 후 90초 스트레칭과 왼손 단축키 분담을 권장합니다.${deadlineNote}`
        : `현재 연속 ${continuousMinutes}분 · 필압 경직도 ${stiffness}/100으로 안정적인 페이스입니다. 45분마다 짧은 이완을 유지하세요.`;

  return {
    riskLevel,
    riskLabelKo,
    fatigueIndex,
    recommendedBreakSeconds,
    suggestLeftHandSwitch,
    leftHandShortcutGuideKo,
    stretchRoutine90s: STRETCH_ROUTINE_90S,
    coachMessageKo,
  };
}
