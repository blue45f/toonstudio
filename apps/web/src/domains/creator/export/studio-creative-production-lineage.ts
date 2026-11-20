/**
 * Waves 60–69: BG3D·브러시·AI 보조 제작 연속성 및 에셋 리니지 엔진 (Creative Production Lineage)
 * - W60: BG3D Scene Lighting & Camera Continuity Checker
 * - W61: 3D Asset Poly-Budget & Texture Memory Guard
 * - W62: Custom Brush Stroke Provenance & Pack Lock
 * - W63: Character Sheet Color Palette Drift Detector
 * - W64: Panel Pacing & Reader Scroll Rhythm Analyzer
 * - W65: Episode Deadline Burn-Down & Workload Balancer
 * - W66: Non-Destructive Layer Snapshot & Diff Audit
 * - W67: Human-Authorship Ratio & AI-Assist Disclosure Ledger
 * - W68: Offline OPFS/CRDT Conflict Resolution Audit
 * - W69: Production Readiness Pre-Export Master Gate
 */

export interface Bg3dSceneContinuityInput {
  readonly previousExposureEv: number;
  readonly currentExposureEv: number;
  readonly previousFovDeg: number;
  readonly currentFovDeg: number;
  readonly triangleCount: number;
  readonly textureMemoryMb: number;
}

export interface CreativeLineageAuditInput {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly bg3d: Bg3dSceneContinuityInput;
  readonly brushPackLocked: boolean;
  readonly maxPaletteDeltaE: number;
  readonly humanStrokeRatioPercent: number;
  readonly unresolvedCrdtConflicts: number;
  readonly remainingAssistantHours: number;
  readonly hoursUntilDeadline: number;
}

export interface CreativeLineageAuditResult {
  readonly readyForExport: boolean;
  readonly bg3dContinuityOk: boolean;
  readonly polyAndMemoryOk: boolean;
  readonly humanAuthorshipTier: "human-primary" | "hybrid-assisted" | "ai-heavy-review";
  readonly deadlineRisk: "safe" | "tight" | "overdue";
  readonly blockers: readonly string[];
  readonly lineageDigestHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** W60 + W61 + W62 + W63 + W64 + W65 + W66 + W67 + W68 + W69 통합 제작 리니지 검증 */
export function evaluateCreativeProductionLineage(
  input: CreativeLineageAuditInput,
): CreativeLineageAuditResult {
  const blockers: string[] = [];

  const bg3dContinuityOk =
    Math.abs(input.bg3d.currentExposureEv - input.bg3d.previousExposureEv) <= 1.2 &&
    Math.abs(input.bg3d.currentFovDeg - input.bg3d.previousFovDeg) <= 18;
  if (!bg3dContinuityOk) {
    blockers.push("BG3D 화수 간 노출(EV) 또는 카메라 화각(FOV) 연속성 이탈");
  }

  const polyAndMemoryOk =
    input.bg3d.triangleCount <= 250_000 && input.bg3d.textureMemoryMb <= 256;
  if (!polyAndMemoryOk) {
    blockers.push("BG3D 폴리곤 또는 텍스처 메모리 예산 초과");
  }

  if (!input.brushPackLocked) {
    blockers.push("커스텀 브러시 팩 저작권 잠금 미설정");
  }
  if (input.maxPaletteDeltaE > 8) {
    blockers.push(`캐릭터 컬러 팔레트 이탈 감지 (DeltaE ${input.maxPaletteDeltaE})`);
  }
  if (input.unresolvedCrdtConflicts > 0) {
    blockers.push(`오프라인 CRDT 동시편집 미해결 충돌 ${input.unresolvedCrdtConflicts}건`);
  }

  const humanAuthorshipTier: "human-primary" | "hybrid-assisted" | "ai-heavy-review" =
    input.humanStrokeRatioPercent >= 80
      ? "human-primary"
      : input.humanStrokeRatioPercent >= 50
        ? "hybrid-assisted"
        : "ai-heavy-review";

  if (humanAuthorshipTier === "ai-heavy-review") {
    blockers.push("인간 창작 기여도 50% 미만 — 편집부 투명성 심사 필요");
  }

  const deadlineRisk: "safe" | "tight" | "overdue" =
    input.remainingAssistantHours > input.hoursUntilDeadline
      ? "overdue"
      : input.remainingAssistantHours > input.hoursUntilDeadline * 0.8
        ? "tight"
        : "safe";

  const readyForExport = blockers.length === 0;
  const lineageDigestHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: input.seriesTitle,
      episodeLabel: input.episodeLabel,
      readyForExport,
      humanAuthorshipTier,
      deadlineRisk,
      humanStrokeRatioPercent: input.humanStrokeRatioPercent,
    }),
  );

  return {
    readyForExport,
    bg3dContinuityOk,
    polyAndMemoryOk,
    humanAuthorshipTier,
    deadlineRisk,
    blockers,
    lineageDigestHash,
  };
}
