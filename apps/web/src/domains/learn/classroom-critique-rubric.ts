/**
 * 교실(/learn/classroom) 과제 배포 → 학생 제출 → 붉은펜·음성 첨삭 → 5축 실기 루브릭 →
 * 학기 포트폴리오 패키지 폐루프 평가·변환 엔진.
 */

import {
  FIVE_AXIS_RUBRIC_SPECS,
  RUBRIC_AXIS_ORDER,
  createInitialClassroomSubmissions,
  type ClassroomSubmissionRecord,
  type ClassroomSubmissionStatus,
  type RedlineCritiquePin,
  type RedlineVoiceNote,
  type RubricAxisId,
  type RubricAxisSpec,
  type RubricGrade,
  type RubricScoreMap,
  type RubricScoreValue,
} from "./classroom-critique-catalog";

export { FIVE_AXIS_RUBRIC_SPECS, RUBRIC_AXIS_ORDER, createInitialClassroomSubmissions };
export type {
  ClassroomSubmissionRecord,
  ClassroomSubmissionStatus,
  RedlineCritiquePin,
  RedlineVoiceNote,
  RubricAxisId,
  RubricAxisSpec,
  RubricGrade,
  RubricScoreMap,
  RubricScoreValue,
};

export interface RubricImprovementGuide {
  readonly axisId: RubricAxisId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly score: RubricScoreValue;
  readonly priority: "critical" | "recommended" | "polish";
  readonly guideKo: string;
  readonly guideEn: string;
  readonly suggestedLessonId: string;
}

export interface FiveAxisRubricEvaluation {
  readonly scores: RubricScoreMap;
  readonly totalScore: number;
  readonly maxScore: 25;
  readonly averageScore: number;
  readonly grade: RubricGrade;
  readonly gradeLabelKo: string;
  readonly gradeLabelEn: string;
  readonly portfolioEligible: boolean;
  readonly weakestAxisId: RubricAxisId;
  readonly strongestAxisId: RubricAxisId;
  readonly improvementGuides: readonly RubricImprovementGuide[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface NonExportableOverlayAnnotation {
  readonly id: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly axisId: RubricAxisId;
  readonly severity: "must-fix" | "polish";
  readonly resolved: boolean;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hasVoiceNote: boolean;
  readonly voiceDurationSec: number;
  readonly voiceTranscriptKo: string;
  readonly voiceTranscriptEn: string;
}

export interface NonExportableCanvasOverlayModel {
  readonly schemaVersion: "toonstudio.redline-overlay.v1";
  readonly submissionId: string;
  readonly cutLabel: string;
  readonly layerName: "99_NONPRINT_INSTRUCTOR_REDLINE";
  readonly exportable: false;
  readonly printVisible: false;
  readonly blendMode: "normal";
  readonly opacity: number;
  readonly totalPinCount: number;
  readonly unresolvedPinCount: number;
  readonly voiceNoteCount: number;
  readonly annotations: readonly NonExportableOverlayAnnotation[];
}

export interface PortfolioWorkItem {
  readonly submissionId: string;
  readonly week: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly cutLabel: string;
  readonly totalScore: number;
  readonly maxScore: 25;
  readonly grade: RubricGrade;
  readonly resolvedPinCount: number;
  readonly totalPinCount: number;
  readonly strongestAxisId: RubricAxisId;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface StudentPortfolioBundle {
  readonly bundleVersion: "toonstudio.classroom-portfolio.v1";
  readonly studentId: string;
  readonly studentNameKo: string;
  readonly studentNameEn: string;
  readonly classroomNameKo: string;
  readonly classroomNameEn: string;
  readonly termLabelKo: string;
  readonly termLabelEn: string;
  readonly generatedAtIso: string;
  readonly minimumPassingGrade: "B";
  readonly includedWorks: readonly PortfolioWorkItem[];
  readonly excludedSubmissionIds: readonly string[];
  readonly axisAverages: Readonly<Record<RubricAxisId, number>>;
  readonly overallAverageScore: number;
  readonly overallGrade: RubricGrade;
  readonly webSummaryKo: string;
  readonly webSummaryEn: string;
  readonly printableMarkdownKo: string;
  readonly printableMarkdownEn: string;
  readonly jsonPayload: string;
}

export interface AddRedlinePinInput {
  readonly id: string;
  readonly cutId: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly axisId: RubricAxisId;
  readonly severity: "must-fix" | "polish";
  readonly noteKo: string;
  readonly noteEn: string;
  readonly checklistItemKo: string;
  readonly checklistItemEn: string;
  readonly voiceNote?: RedlineVoiceNote;
}

export interface BuildStudentPortfolioOptions {
  readonly studentId: string;
  readonly studentNameKo: string;
  readonly studentNameEn: string;
  readonly classroomNameKo: string;
  readonly classroomNameEn: string;
  readonly termLabelKo?: string;
  readonly termLabelEn?: string;
  readonly generatedAtIso?: string;
}

const GRADE_LABELS: Readonly<Record<RubricGrade, { readonly ko: string; readonly en: string }>> = Object.freeze({
  S: { ko: "S등급 · 연재 대표작 수준", en: "Grade S · Portfolio Showcase Ready" },
  A: { ko: "A등급 · 실기 우수 통과", en: "Grade A · Strong Studio Quality" },
  B: { ko: "B등급 · 학기 통과 (포트폴리오 수록 가능)", en: "Grade B · Passed (Portfolio Eligible)" },
  C: { ko: "C등급 · 보완 후 재제출 권장", en: "Grade C · Revision Required" },
});

function clampRubricScore(value: number): RubricScoreValue {
  const rounded = Math.round(Number.isFinite(value) ? value : 3);
  if (rounded <= 1) return 1;
  if (rounded === 2) return 2;
  if (rounded === 3) return 3;
  if (rounded === 4) return 4;
  return 5;
}

function clampPercent(value: number): number {
  const safe = Number.isFinite(value) ? value : 50;
  return Math.round(Math.max(0, Math.min(100, safe)) * 10) / 10;
}

export function getRubricAxisSpec(axisId: RubricAxisId): RubricAxisSpec {
  return FIVE_AXIS_RUBRIC_SPECS.find((spec) => spec.id === axisId) ?? FIVE_AXIS_RUBRIC_SPECS[0];
}

export function scoreToRubricGrade(totalScore: number): RubricGrade {
  if (totalScore >= 23) return "S";
  if (totalScore >= 19) return "A";
  if (totalScore >= 15) return "B";
  return "C";
}

/** 5축 실기 루브릭(25점 만점)을 평가해 S/A/B/C 등급, 포트폴리오 통과 여부, 자동 보완 가이드를 생성한다. */
export function evaluateFiveAxisRubric(rawScores: Readonly<Record<RubricAxisId, number>>): FiveAxisRubricEvaluation {
  const scores: RubricScoreMap = {
    "direction-composition": clampRubricScore(rawScores["direction-composition"]),
    "perspective-anatomy": clampRubricScore(rawScores["perspective-anatomy"]),
    "lineart-pressure": clampRubricScore(rawScores["lineart-pressure"]),
    "balloon-readability": clampRubricScore(rawScores["balloon-readability"]),
    "finish-polish": clampRubricScore(rawScores["finish-polish"]),
  };

  let totalScore = 0;
  let weakestAxisId: RubricAxisId = RUBRIC_AXIS_ORDER[0];
  let strongestAxisId: RubricAxisId = RUBRIC_AXIS_ORDER[0];
  for (const axisId of RUBRIC_AXIS_ORDER) {
    totalScore += scores[axisId];
    if (scores[axisId] < scores[weakestAxisId]) weakestAxisId = axisId;
    if (scores[axisId] > scores[strongestAxisId]) strongestAxisId = axisId;
  }

  const grade = scoreToRubricGrade(totalScore);
  const portfolioEligible = grade !== "C";
  const weakSpecs = FIVE_AXIS_RUBRIC_SPECS.filter((spec) => scores[spec.id] <= 3).sort(
    (a, b) => scores[a.id] - scores[b.id],
  );
  const weakestSpec = getRubricAxisSpec(weakestAxisId);
  const improvementGuides: RubricImprovementGuide[] =
    weakSpecs.length > 0
      ? weakSpecs.map((spec) => ({
          axisId: spec.id,
          labelKo: spec.labelKo,
          labelEn: spec.labelEn,
          score: scores[spec.id],
          priority: scores[spec.id] <= 2 ? "critical" : "recommended",
          guideKo: spec.lowGuideKo,
          guideEn: spec.lowGuideEn,
          suggestedLessonId: spec.suggestedLessonId,
        }))
      : [
          {
            axisId: weakestSpec.id,
            labelKo: weakestSpec.labelKo,
            labelEn: weakestSpec.labelEn,
            score: scores[weakestSpec.id],
            priority: "polish",
            guideKo: weakestSpec.polishGuideKo,
            guideEn: weakestSpec.polishGuideEn,
            suggestedLessonId: weakestSpec.suggestedLessonId,
          },
        ];

  return {
    scores,
    totalScore,
    maxScore: 25,
    averageScore: Math.round((totalScore / 5) * 10) / 10,
    grade,
    gradeLabelKo: GRADE_LABELS[grade].ko,
    gradeLabelEn: GRADE_LABELS[grade].en,
    portfolioEligible,
    weakestAxisId,
    strongestAxisId,
    improvementGuides,
    summaryKo: `${totalScore}/25점 (${grade}등급) · ${portfolioEligible ? "포트폴리오 수록 가능" : "재제출 보완 필요"}`,
    summaryEn: `${totalScore}/25 (Grade ${grade}) · ${portfolioEligible ? "Eligible for portfolio" : "Revision recommended"}`,
  };
}

export function addRedlinePin(
  pins: readonly RedlineCritiquePin[],
  input: AddRedlinePinInput,
): readonly RedlineCritiquePin[] {
  return [
    ...pins,
    {
      id: input.id,
      cutId: input.cutId,
      xPct: clampPercent(input.xPct),
      yPct: clampPercent(input.yPct),
      axisId: input.axisId,
      severity: input.severity,
      noteKo: input.noteKo.trim(),
      noteEn: input.noteEn.trim(),
      checklistItemKo: input.checklistItemKo.trim() || input.noteKo.trim(),
      checklistItemEn: input.checklistItemEn.trim() || input.noteEn.trim(),
      voiceNote: input.voiceNote,
      resolved: false,
    },
  ];
}

export function toggleRedlinePinResolved(
  pins: readonly RedlineCritiquePin[],
  pinId: string,
  resolvedAtIso: string,
): readonly RedlineCritiquePin[] {
  return pins.map((pin) =>
    pin.id !== pinId
      ? pin
      : { ...pin, resolved: !pin.resolved, resolvedAtIso: !pin.resolved ? resolvedAtIso : undefined },
  );
}

/** 붉은펜 핀과 음성 첨삭 노트를 상업 출고에서 자동 제외되는 비출력 캔버스 오버레이 모델로 변환한다. */
export function buildNonExportableOverlayModel(
  submission: ClassroomSubmissionRecord,
): NonExportableCanvasOverlayModel {
  const annotations: NonExportableOverlayAnnotation[] = submission.redlinePins.map((pin) => ({
    id: pin.id,
    xPct: clampPercent(pin.xPct),
    yPct: clampPercent(pin.yPct),
    axisId: pin.axisId,
    severity: pin.severity,
    resolved: pin.resolved,
    labelKo: pin.noteKo,
    labelEn: pin.noteEn,
    hasVoiceNote: Boolean(pin.voiceNote),
    voiceDurationSec: pin.voiceNote?.durationSec ?? 0,
    voiceTranscriptKo: pin.voiceNote?.transcriptKo ?? "",
    voiceTranscriptEn: pin.voiceNote?.transcriptEn ?? "",
  }));
  return {
    schemaVersion: "toonstudio.redline-overlay.v1",
    submissionId: submission.id,
    cutLabel: submission.cutLabel,
    layerName: "99_NONPRINT_INSTRUCTOR_REDLINE",
    exportable: false,
    printVisible: false,
    blendMode: "normal",
    opacity: 0.9,
    totalPinCount: annotations.length,
    unresolvedPinCount: annotations.filter((item) => !item.resolved).length,
    voiceNoteCount: annotations.filter((item) => item.hasVoiceNote).length,
    annotations,
  };
}

/** B등급 이상(15/25점 이상) 통과 과제만 선별해 웹·JSON·인쇄용 학생 학기 포트폴리오 번들을 생성한다. */
export function buildStudentPortfolioBundle(
  submissions: readonly ClassroomSubmissionRecord[],
  options: BuildStudentPortfolioOptions,
): StudentPortfolioBundle {
  const studentSubs = submissions.filter((item) => item.studentId === options.studentId);
  const includedWorks: PortfolioWorkItem[] = [];
  const excludedSubmissionIds: string[] = [];
  const axisTotals: Record<RubricAxisId, number> = {
    "direction-composition": 0,
    "perspective-anatomy": 0,
    "lineart-pressure": 0,
    "balloon-readability": 0,
    "finish-polish": 0,
  };

  for (const sub of studentSubs) {
    const evaluated = evaluateFiveAxisRubric(sub.rubricScores);
    if (!evaluated.portfolioEligible) {
      excludedSubmissionIds.push(sub.id);
      continue;
    }
    for (const axisId of RUBRIC_AXIS_ORDER) axisTotals[axisId] += evaluated.scores[axisId];
    includedWorks.push({
      submissionId: sub.id,
      week: sub.week,
      titleKo: sub.titleKo,
      titleEn: sub.titleEn,
      cutLabel: sub.cutLabel,
      totalScore: evaluated.totalScore,
      maxScore: 25,
      grade: evaluated.grade,
      resolvedPinCount: sub.redlinePins.filter((pin) => pin.resolved).length,
      totalPinCount: sub.redlinePins.length,
      strongestAxisId: evaluated.strongestAxisId,
      summaryKo: evaluated.summaryKo,
      summaryEn: evaluated.summaryEn,
    });
  }

  includedWorks.sort((a, b) => b.totalScore - a.totalScore || a.week - b.week);
  const count = includedWorks.length;
  const roundAvg = (sum: number): number => (count ? Math.round((sum / count) * 10) / 10 : 0);
  const axisAverages: Record<RubricAxisId, number> = {
    "direction-composition": roundAvg(axisTotals["direction-composition"]),
    "perspective-anatomy": roundAvg(axisTotals["perspective-anatomy"]),
    "lineart-pressure": roundAvg(axisTotals["lineart-pressure"]),
    "balloon-readability": roundAvg(axisTotals["balloon-readability"]),
    "finish-polish": roundAvg(axisTotals["finish-polish"]),
  };
  const overallAverageScore = roundAvg(includedWorks.reduce((sum, item) => sum + item.totalScore, 0));
  const overallGrade = count ? scoreToRubricGrade(Math.round(overallAverageScore)) : "C";
  const termLabelKo = options.termLabelKo ?? "2026 학기 실기 포트폴리오";
  const termLabelEn = options.termLabelEn ?? "2026 Term Practical Portfolio";
  const generatedAtIso = options.generatedAtIso ?? "2026-11-23T12:00:00Z";

  const printableMarkdownKo = [
    `# ${options.studentNameKo} — ${termLabelKo}`,
    `- 과정: ${options.classroomNameKo} · 기준: B등급(15/25) 이상 · 수록 ${count}편 / 보류 ${excludedSubmissionIds.length}편`,
    `- 평균 성취: ${overallAverageScore}/25점 (${overallGrade}등급)`,
    ...(count
      ? includedWorks.map((w) => `- W${String(w.week).padStart(2, "0")} [${w.grade}] ${w.titleKo} (${w.cutLabel}) ${w.totalScore}/25점 · 첨삭 ${w.resolvedPinCount}/${w.totalPinCount}`)
      : ["- 수록 가능한 통과 작품이 아직 없습니다."]),
  ].join("\n");

  const printableMarkdownEn = [
    `# ${options.studentNameEn} — ${termLabelEn}`,
    `- Course: ${options.classroomNameEn} · Pass: Grade B (15/25)+ · Included ${count} / Excluded ${excludedSubmissionIds.length}`,
    `- Average Score: ${overallAverageScore}/25 (Grade ${overallGrade})`,
    ...(count
      ? includedWorks.map((w) => `- W${String(w.week).padStart(2, "0")} [${w.grade}] ${w.titleEn} (${w.cutLabel}) ${w.totalScore}/25 · Pins ${w.resolvedPinCount}/${w.totalPinCount}`)
      : ["- No passing works included yet."]),
  ].join("\n");

  const core = {
    bundleVersion: "toonstudio.classroom-portfolio.v1" as const,
    studentId: options.studentId,
    studentNameKo: options.studentNameKo,
    studentNameEn: options.studentNameEn,
    classroomNameKo: options.classroomNameKo,
    classroomNameEn: options.classroomNameEn,
    termLabelKo,
    termLabelEn,
    generatedAtIso,
    minimumPassingGrade: "B" as const,
    includedWorks,
    excludedSubmissionIds,
    axisAverages,
    overallAverageScore,
    overallGrade,
  };
  return {
    ...core,
    webSummaryKo: count
      ? `${options.studentNameKo} 학생 · 통과 작품 ${count}편 수록 (평균 ${overallAverageScore}/25점 · ${overallGrade}등급, 보류 ${excludedSubmissionIds.length}편 제외)`
      : `${options.studentNameKo} 학생 · B등급 이상 통과 과제가 아직 없습니다.`,
    webSummaryEn: count
      ? `${options.studentNameEn} · ${count} passed work(s) included (Avg ${overallAverageScore}/25 · Grade ${overallGrade}, ${excludedSubmissionIds.length} excluded)`
      : `${options.studentNameEn} · No Grade B or higher works ready for portfolio yet.`,
    printableMarkdownKo,
    printableMarkdownEn,
    jsonPayload: JSON.stringify(core, null, 2),
  };
}
