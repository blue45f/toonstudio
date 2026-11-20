/**
 * Cross-Labs Fresh Ideas v2.2 Serialized DTO Codec & Unified Synthesizer.
 * Connects BG3D, Brush-Lab, and Character-Lab telemetry via pure JSON DTOs (zero cross-app imports).
 */

import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
  type FreshIdeasSourceItem,
} from "./fresh-ideas-ingest-deconstruct";
import {
  generateFiveOrthogonalLenses,
  type FreshIdeaLensCardV2,
} from "./fresh-ideas-lenses-engine";
import {
  auditFreshIdeasQualityAndSafety,
  runFreshIdeasModeCWorkflow,
  type ModeCEcosystemBundle,
  type QualitySafetyAuditReport,
} from "./fresh-ideas-quality-ecosystem";

export interface CrossLabFreshIdeasEnvelopeV2 {
  readonly schemaVersion: 2;
  readonly episodeTitleKo: string;
  readonly bg3d: {
    readonly overallScore100: number;
    readonly weeklyHoursSaved: number;
    readonly contrastRatio: number;
    readonly lineThicknessPx: number;
  };
  readonly brushLab: {
    readonly overallScore100: number;
    readonly taperSharpness100: number;
    readonly averageStrokePx: number;
    readonly presetNameKo: string;
  };
  readonly characterLab: {
    readonly overallScore100: number;
    readonly turnaroundScore100: number;
    readonly faceSdfScore100: number;
    readonly outlineWidthMm: number;
  };
}

export interface CrossLabsUnifiedRemixSynthesis {
  readonly envelope: CrossLabFreshIdeasEnvelopeV2;
  readonly coherenceScore100: number;
  readonly lenses: readonly FreshIdeaLensCardV2[];
  readonly modeC: ModeCEcosystemBundle;
  readonly audit: QualitySafetyAuditReport;
  readonly summaryBadgeKo: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function parseCrossLabFreshIdeasEnvelope(
  raw: unknown,
): CrossLabFreshIdeasEnvelopeV2 | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 2 || typeof obj.episodeTitleKo !== "string") return null;

  const bg3d = obj.bg3d as Record<string, unknown> | undefined;
  const brush = obj.brushLab as Record<string, unknown> | undefined;
  const char = obj.characterLab as Record<string, unknown> | undefined;
  if (!bg3d || !brush || !char) return null;

  if (
    !isFiniteNumber(bg3d.overallScore100) ||
    !isFiniteNumber(bg3d.weeklyHoursSaved) ||
    !isFiniteNumber(bg3d.contrastRatio) ||
    !isFiniteNumber(bg3d.lineThicknessPx) ||
    !isFiniteNumber(brush.overallScore100) ||
    !isFiniteNumber(brush.taperSharpness100) ||
    !isFiniteNumber(brush.averageStrokePx) ||
    typeof brush.presetNameKo !== "string" ||
    !isFiniteNumber(char.overallScore100) ||
    !isFiniteNumber(char.turnaroundScore100) ||
    !isFiniteNumber(char.faceSdfScore100) ||
    !isFiniteNumber(char.outlineWidthMm)
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 2,
    episodeTitleKo: obj.episodeTitleKo.trim() || "통합 에피소드",
    bg3d: Object.freeze({
      overallScore100: bg3d.overallScore100,
      weeklyHoursSaved: bg3d.weeklyHoursSaved,
      contrastRatio: bg3d.contrastRatio,
      lineThicknessPx: bg3d.lineThicknessPx,
    }),
    brushLab: Object.freeze({
      overallScore100: brush.overallScore100,
      taperSharpness100: brush.taperSharpness100,
      averageStrokePx: brush.averageStrokePx,
      presetNameKo: brush.presetNameKo,
    }),
    characterLab: Object.freeze({
      overallScore100: char.overallScore100,
      turnaroundScore100: char.turnaroundScore100,
      faceSdfScore100: char.faceSdfScore100,
      outlineWidthMm: char.outlineWidthMm,
    }),
  });
}

export function synthesizeCrossLabsUnifiedRemix(
  envelope: CrossLabFreshIdeasEnvelopeV2,
): CrossLabsUnifiedRemixSynthesis {
  const coherenceScore100 = Number(
    (
      envelope.bg3d.overallScore100 * 0.35 +
      envelope.brushLab.overallScore100 * 0.32 +
      envelope.characterLab.overallScore100 * 0.33
    ).toFixed(1),
  );

  const sources: readonly FreshIdeasSourceItem[] = [
    {
      id: "lab-bg3d",
      title: `${envelope.episodeTitleKo} 3D 배경 룩데브`,
      kind: "sheet-csv",
      content: `BG3D 종합 ${envelope.bg3d.overallScore100}점, 주간 절감 ${envelope.bg3d.weeklyHoursSaved}시간, 대비율 ${envelope.bg3d.contrastRatio}:1, 선굵기 ${envelope.bg3d.lineThicknessPx}px.`,
    },
    {
      id: "lab-brush",
      title: `브러시 랩 (${envelope.brushLab.presetNameKo})`,
      kind: "changelog-pr",
      content: `브러시 종합 ${envelope.brushLab.overallScore100}점, 테이퍼 선명도 ${envelope.brushLab.taperSharpness100}점, 평균 필압 선폭 ${envelope.brushLab.averageStrokePx}px. 하지만 선폭 불일치 시 배경과 인물 레이어가 겉도는 문제가 생긴다.`,
    },
    {
      id: "lab-character",
      title: "캐릭터 랩 VRM·SDF 턴어라운드",
      kind: "meeting-transcript",
      content: `캐릭터 종합 ${envelope.characterLab.overallScore100}점, 4방향 턴어라운드 ${envelope.characterLab.turnaroundScore100}점, 얼굴 SDF ${envelope.characterLab.faceSdfScore100}점, 외곽선 ${envelope.characterLab.outlineWidthMm}mm.`,
    },
  ];

  const bundle = ingestFreshIdeasSources(sources);
  const deconstruction = deconstructFreshIdeasThesis(bundle);
  const lenses = generateFiveOrthogonalLenses(bundle, deconstruction, {
    preferredLensId: "data-evidence-angle",
  });
  const modeC = runFreshIdeasModeCWorkflow({
    sourceTitle: envelope.episodeTitleKo,
    targetPersonaKo: bundle.targetPersonaKo,
    lenses,
    preferredChannel: "linkedin-kr",
  });
  const audit = auditFreshIdeasQualityAndSafety(
    lenses,
    modeC.osmuPackage.linkedInFeedCut.bodySectionsKo.join("\n"),
  );

  return Object.freeze({
    envelope,
    coherenceScore100,
    lenses,
    modeC,
    audit,
    summaryBadgeKo: `3대 랩스 통합 리믹스 ${coherenceScore100}점 · Unslop ${audit.score100}점`,
  });
}
