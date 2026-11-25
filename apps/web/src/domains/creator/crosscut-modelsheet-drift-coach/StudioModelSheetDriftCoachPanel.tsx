/**
 * Wave 48E — 화차 간 작화·비율 흔들림 감지 및 교정 제안 스튜디오 패널.
 *
 * - 4종 캐릭터 설정집 기준 프리셋 + 1~60컷 타임라인 스트립(정상·주의·흔들림 하이라이트)
 * - 순수 시맨틱 SVG 붉은 펜 오버레이 비교 도해(oklch 및 currentColor 전용, 바이올렛 휴 270~320도 0%)
 * - 컷 비율 편차 시뮬레이션 슬라이더 · 가르마/필수 장신구 토글 · Top-3 비파괴 교정 카드(미리보기·적용·원복)
 * - 컷별 승인 이력 + Markdown/JSON 검수 리포트 복사 및 미리보기
 */

import {
  AlertTriangle, Check, CheckCircle2, ClipboardCopy, Eye, FileJson,
  FileText, History, RotateCcw, Ruler, ScanSearch, ShieldCheck, SlidersHorizontal, Undo2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  DRIFT_METRIC_KEYS, DRIFT_METRIC_META, HAIR_PART_OPTIONS, MODEL_SHEET_ARCHETYPES,
  applyCutCorrection, auditEpisodeModelSheetDrift, auditSingleCutDrift, createDriftCoachSession,
  exportDriftReportJson, exportDriftReportMarkdown, getAccessoryMeta, getHairPartMeta,
  getModelSheetSpec, previewCutCorrection, proposeCutDriftCorrectionsTop3,
  revertAllCutCorrections, revertCutCorrection, selectDriftCoachCut, simulateCutMetricUpdate,
  type CutCorrectionCandidate, type CutDriftAudit, type CutDriftSeverity,
  type DriftCoachSessionState, type EpisodeCutMetric,
  type EpisodeModelSheetAuditReport, type HairPartSide, type ModelSheetAccessoryId,
  type ModelSheetArchetypeId, type ModelSheetSpec,
} from "./modelsheet-drift-engine";

export interface StudioModelSheetDriftCoachPanelProps {
  readonly initialArchetypeId?: ModelSheetArchetypeId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApplyFix?: (candidate: CutCorrectionCandidate, session: DriftCoachSessionState) => void;
  readonly onRevertFix?: (cutNumber: number | "all", session: DriftCoachSessionState) => void;
  readonly onExportReport?: (
    format: "markdown" | "json",
    content: string,
    audit: EpisodeModelSheetAuditReport,
  ) => void;
}

type CutFilterMode = "all" | "flagged" | "applied";
type ReportPreviewMode = "hidden" | "markdown" | "json";

// 탈-바이올렛 OKLCH 붉은 펜 도해 전용 색(블루프린트 215°, 붉은 펜 25°, 주의 72°, 정상 155°)
const SVG_INK_SPEC = "oklch(0.56 0.11 215)";
const SVG_INK_REDPEN = "oklch(0.57 0.21 25)";
const SVG_INK_NOTICE = "oklch(0.68 0.15 72)";
const SVG_INK_OK = "oklch(0.56 0.14 155)";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const ACCESSORY_ANCHORS: Readonly<Record<ModelSheetAccessoryId, { readonly x: number; readonly y: number }>> = {
  "earring-left": { x: 274, y: 186 }, "cheek-scar": { x: 372, y: 178 },
  "uniform-badge": { x: 300, y: 266 }, "cloak-brooch": { x: 332, y: 254 },
  glasses: { x: 332, y: 152 }, hairpin: { x: 376, y: 98 },
};

function severityToneClass(severity: CutDriftSeverity): string {
  if (severity === "drift") return "border-bad bg-bad-soft text-bad";
  return severity === "notice" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function scoreToneClass(score: number): string {
  return score >= 88 ? "text-good" : score >= 72 ? "text-warn" : "text-bad";
}

function severitySvgStroke(severity: CutDriftSeverity): string {
  return severity === "drift" ? SVG_INK_REDPEN : severity === "notice" ? SVG_INK_NOTICE : SVG_INK_OK;
}

function severityLabel(severity: CutDriftSeverity, isEn: boolean): string {
  if (severity === "drift") return isEn ? "Drift" : "흔들림";
  return severity === "notice" ? (isEn ? "Notice" : "주의") : (isEn ? "OK" : "정상");
}

function hairPartX(side: HairPartSide): number | null {
  return side === "left" ? 302 : side === "right" ? 362 : side === "center" ? 332 : null;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function RedPenOverlaySvg(props: {
  readonly spec: ModelSheetSpec; readonly cut: EpisodeCutMetric;
  readonly audit: CutDriftAudit; readonly isPreviewing: boolean; readonly isEn: boolean;
}): ReactElement {
  const { spec, cut, audit, isPreviewing, isEn } = props;
  const activeStroke = severitySvgStroke(audit.severity);

  const figTop = 44;
  const figHeight = 240;
  const specHeadH = figHeight / spec.headToBodyRatio;
  const curHeadH = figHeight / cut.headToBodyRatio;
  const headDeltaPx = curHeadH - specHeadH;
  const tickCount = Math.ceil(spec.headToBodyRatio);

  const faceCx = 332;
  const faceTop = 64;
  const faceH = 172;
  const headHalfW = 54;
  const specEyeY = Math.round((faceTop + faceH * spec.eyeHeightRatio) * 10) / 10;
  const curEyeY = Math.round((faceTop + faceH * cut.eyeHeightRatio) * 10) / 10;
  const specEyeHalfSpan = Math.round(23 * spec.eyeSpacingRatio * 10) / 10;
  const curEyeHalfSpan = Math.round(23 * cut.eyeSpacingRatio * 10) / 10;
  const specJawHalfW = Math.round(headHalfW * spec.jawWidthRatio * 10) / 10;
  const curJawHalfW = Math.round(headHalfW * cut.jawWidthRatio * 10) / 10;
  const specPartX = hairPartX(spec.hairPartSide);
  const curPartX = hairPartX(cut.hairPartSide);

  const specJawPath = `M ${faceCx - headHalfW} 138 Q ${faceCx - specJawHalfW - 8} 206 ${faceCx} 236 Q ${faceCx + specJawHalfW + 8} 206 ${faceCx + headHalfW} 138`;
  const curJawPath = `M ${faceCx - headHalfW} 138 Q ${faceCx - curJawHalfW - 8} 206 ${faceCx} 236 Q ${faceCx + curJawHalfW + 8} 206 ${faceCx + headHalfW} 138`;
  const missingSet = new Set<ModelSheetAccessoryId>(audit.missingAccessories);

  return (
    <svg
      data-testid="modelsheet-redpen-svg" data-cut-number={cut.cutNumber} data-severity={audit.severity}
      data-preview-mode={String(isPreviewing)} data-missing-count={audit.missingAccessories.length}
      data-head-ratio={cut.headToBodyRatio.toFixed(2)} viewBox="0 0 460 320" role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn ? `Model sheet red-pen overlay comparison for Cut ${cut.cutNumber}` : `${cut.cutNumber}컷 설정집 기준선 및 붉은 펜 비교 도해`}
    >
      <rect x="8" y="8" width="194" height="304" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <rect x="212" y="8" width="240" height="304" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="20" y="28" fill="currentColor" fillOpacity={0.72} fontSize="11" fontWeight="700">
        {isEn ? `BODY RATIO (${spec.headToBodyRatio.toFixed(1)}H SPEC)` : `전신 등신 대조 (${spec.headToBodyRatio.toFixed(1)}등신)`}
      </text>
      <text x="224" y="28" fill="currentColor" fillOpacity={0.72} fontSize="11" fontWeight="700">
        {isEn ? "FACE & PROPS RED-PEN" : "안면 비율 · 소품 붉은 펜"}
      </text>

      {Array.from({ length: tickCount + 1 }, (_, idx) => {
        const y = Math.min(figTop + figHeight, figTop + idx * specHeadH);
        return (
          <g key={idx}>
            <line x1="22" y1={y} x2="188" y2={y} stroke="currentColor" strokeOpacity={idx === 0 ? 0.25 : 0.1} strokeDasharray="3 3" />
            <text x="22" y={y - 3} fill="currentColor" fillOpacity={0.45} fontSize="9">{idx}H</text>
          </g>
        );
      })}

      {/* 설정집 기준 실루엣(점선 블루프린트) */}
      <g stroke={SVG_INK_SPEC} fill="none" strokeWidth="1.8" strokeDasharray="4 3">
        <ellipse cx="106" cy={figTop + specHeadH * 0.5} rx={specHeadH * 0.36} ry={specHeadH * 0.48} />
        <path d={`M ${106 - specHeadH * 0.65} ${figTop + specHeadH * 1.2} L ${106 + specHeadH * 0.65} ${figTop + specHeadH * 1.2} L ${106 + specHeadH * 0.44} ${figTop + specHeadH * 2.9} L ${106 - specHeadH * 0.44} ${figTop + specHeadH * 2.9} Z`} />
        <line x1={106 - specHeadH * 0.22} y1={figTop + specHeadH * 2.9} x2={106 - specHeadH * 0.26} y2={figTop + figHeight} />
        <line x1={106 + specHeadH * 0.22} y1={figTop + specHeadH * 2.9} x2={106 + specHeadH * 0.26} y2={figTop + figHeight} />
      </g>

      {/* 현재/미리보기 컷 측정 실루엣 */}
      <g stroke={activeStroke} fill="none" strokeWidth="2.2">
        <ellipse cx="106" cy={figTop + curHeadH * 0.5} rx={curHeadH * 0.36} ry={curHeadH * 0.48} fill={activeStroke} fillOpacity={0.09} />
        <line x1="74" y1={figTop + curHeadH} x2="152" y2={figTop + curHeadH} strokeDasharray="2 2" />
        <path d={`M ${106 - curHeadH * 0.62} ${figTop + curHeadH * 1.22} L ${106 + curHeadH * 0.62} ${figTop + curHeadH * 1.22} L ${106 + curHeadH * 0.42} ${figTop + curHeadH * 2.85} L ${106 - curHeadH * 0.42} ${figTop + curHeadH * 2.85} Z`} />
      </g>

      {Math.abs(headDeltaPx) > 1.8 && (
        <g data-testid="redpen-head-arrow">
          <line x1="164" y1={figTop + specHeadH} x2="164" y2={figTop + curHeadH} stroke={SVG_INK_REDPEN} strokeWidth="2.2" />
          <circle cx="164" cy={figTop + curHeadH} r="3.2" fill={SVG_INK_REDPEN} />
          <text x="150" y={Math.max(58, figTop + curHeadH + 13)} fill={SVG_INK_REDPEN} fontSize="9.5" fontWeight="700">{cut.headToBodyRatio.toFixed(1)}H</text>
        </g>
      )}
      <text x="20" y="302" fill={activeStroke} fontSize="10" fontWeight="700">
        {isEn ? `Now ${cut.headToBodyRatio.toFixed(2)}H (${formatSigned(audit.metrics.headToBodyRatio.signedPct)})` : `현재 ${cut.headToBodyRatio.toFixed(2)}등신 (${formatSigned(audit.metrics.headToBodyRatio.signedPct)})`}
      </text>

      {/* 우측 안면 설정집 블루프린트 */}
      <g stroke={SVG_INK_SPEC} fill="none" strokeWidth="1.6" strokeDasharray="4 3">
        <path d={`M ${faceCx - headHalfW} 138 A ${headHalfW} 72 0 0 1 ${faceCx + headHalfW} 138`} />
        <path d={specJawPath} />
        <line x1="258" y1={specEyeY} x2="406" y2={specEyeY} />
        <ellipse cx={faceCx - specEyeHalfSpan} cy={specEyeY} rx="12" ry="7" />
        <ellipse cx={faceCx + specEyeHalfSpan} cy={specEyeY} rx="12" ry="7" />
        {specPartX !== null && <line x1={specPartX} y1="62" x2={specPartX} y2="96" strokeWidth="2" />}
      </g>

      {/* 우측 현재/미리보기 측정 윤곽 */}
      <g stroke={activeStroke} fill="none" strokeWidth="2.2">
        <path d={curJawPath} fill={activeStroke} fillOpacity={0.05} />
        <line x1="264" y1={curEyeY} x2="400" y2={curEyeY} strokeOpacity={0.55} />
        <ellipse cx={faceCx - curEyeHalfSpan} cy={curEyeY} rx="11.5" ry="6.5" fill={activeStroke} fillOpacity={0.12} />
        <ellipse cx={faceCx + curEyeHalfSpan} cy={curEyeY} rx="11.5" ry="6.5" fill={activeStroke} fillOpacity={0.12} />
        <circle cx={faceCx - curEyeHalfSpan} cy={curEyeY} r="2.6" fill={activeStroke} />
        <circle cx={faceCx + curEyeHalfSpan} cy={curEyeY} r="2.6" fill={activeStroke} />
        {curPartX !== null && <line x1={curPartX} y1="62" x2={curPartX} y2="98" strokeWidth="2.5" />}
      </g>

      {audit.metrics.eyeSpacingRatio.severity !== "ok" && (
        <g data-testid="redpen-eye-arrow">
          <line x1={faceCx - curEyeHalfSpan + 12} y1={curEyeY - 14} x2={faceCx + curEyeHalfSpan - 12} y2={curEyeY - 14} stroke={SVG_INK_REDPEN} strokeWidth="1.8" />
          <text x={faceCx - 16} y={curEyeY - 19} fill={SVG_INK_REDPEN} fontSize="9.5" fontWeight="700">{formatSigned(audit.metrics.eyeSpacingRatio.signedPct)}</text>
        </g>
      )}
      {audit.hairPartMismatch && (
        <text data-testid="redpen-hair-flag" x="224" y="54" fill={SVG_INK_REDPEN} fontSize="9.5" fontWeight="700">
          {isEn ? "Hair Part Flipped" : "가르마 반전"}
        </text>
      )}

      {spec.requiredAccessories.map((accId) => {
        const anchor = ACCESSORY_ANCHORS[accId];
        const isMissing = missingSet.has(accId);
        const accMeta = getAccessoryMeta(accId);
        const markerColor = isMissing ? SVG_INK_REDPEN : SVG_INK_OK;
        return (
          <g key={accId} data-testid={`redpen-acc-${accId}`} data-missing={String(isMissing)}>
            <circle cx={anchor.x} cy={anchor.y} r="9" fill={markerColor} fillOpacity={isMissing ? 0.16 : 0.12} stroke={markerColor} strokeWidth="1.8" strokeDasharray={isMissing ? "3 2" : undefined} />
            <text x={anchor.x} y={anchor.y + 3.5} textAnchor="middle" fill={markerColor} fontSize="10" fontWeight="700">{isMissing ? "!" : "✓"}</text>
            <text x={anchor.x} y={anchor.y + 20} textAnchor="middle" fill={markerColor} fontSize="8.5" fontWeight="600">{isEn ? accMeta.labelEn : accMeta.labelKo}</text>
          </g>
        );
      })}

      <text x="224" y="302" fill={activeStroke} fontSize="10" fontWeight="700">
        {isPreviewing
          ? (isEn ? `PREVIEW · Cut #${cut.cutNumber} → ${audit.cutScore}/100` : `미리보기 반영 · ${cut.cutNumber}컷 예상 ${audit.cutScore}점`)
          : (isEn ? `Cut #${cut.cutNumber} · ${severityLabel(audit.severity, true)} · ${audit.cutScore}/100` : `${cut.cutNumber}컷 · ${severityLabel(audit.severity, false)} · ${audit.cutScore}점`)}
      </text>
    </svg>
  );
}

/** 화차 간 캐릭터 작화·비율 흔들림 감지 및 비파괴 교정 제안 스튜디오 패널. */
export function StudioModelSheetDriftCoachPanel(
  props: StudioModelSheetDriftCoachPanelProps,
): ReactElement {
  const {
    initialArchetypeId = "romance-lead",
    locale = "ko",
    className,
    onApplyFix,
    onRevertFix,
    onExportReport,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [session, setSession] = useState<DriftCoachSessionState>(() => createDriftCoachSession(initialArchetypeId, 60));
  const [cutFilter, setCutFilter] = useState<CutFilterMode>("all");
  const [reportPreview, setReportPreview] = useState<ReportPreviewMode>("hidden");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const spec = useMemo(() => getModelSheetSpec(session.archetypeId), [session.archetypeId]);
  const auditReport = useMemo(() => auditEpisodeModelSheetDrift({ spec, cuts: session.workingCuts }), [spec, session.workingCuts]);

  const selectedCut = useMemo<EpisodeCutMetric>(
    () =>
      session.workingCuts.find((cut) => cut.cutNumber === session.selectedCutNumber) ??
      session.workingCuts[0] ?? {
        cutId: "cut-01", cutNumber: 1, sceneTagKo: "도입 컷", sceneTagEn: "Intro Cut", cameraShot: "bust",
        headToBodyRatio: spec.headToBodyRatio, eyeSpacingRatio: spec.eyeSpacingRatio,
        eyeHeightRatio: spec.eyeHeightRatio, jawWidthRatio: spec.jawWidthRatio,
        hairPartSide: spec.hairPartSide, presentAccessories: spec.requiredAccessories,
      },
    [session.workingCuts, session.selectedCutNumber, spec],
  );

  const selectedAudit = useMemo(() => auditSingleCutDrift(spec, selectedCut), [spec, selectedCut]);
  const top3Candidates = useMemo(() => proposeCutDriftCorrectionsTop3(spec, selectedCut), [spec, selectedCut]);
  const previewCandidate = useMemo<CutCorrectionCandidate | null>(
    () => top3Candidates.find((item) => item.id === session.previewCandidateId) ?? null,
    [top3Candidates, session.previewCandidateId],
  );

  const displayedCut = previewCandidate ? previewCandidate.proposedMetrics : selectedCut;
  const displayedAudit = previewCandidate ? previewCandidate.projectedAudit : selectedAudit;
  const appliedRecord = session.appliedFixByCut[selectedCut.cutNumber];
  const appliedCount = Object.keys(session.appliedFixByCut).length;

  const visibleCuts = useMemo(() => {
    if (cutFilter === "flagged") return auditReport.cutAudits.filter((item) => item.severity !== "ok");
    if (cutFilter === "applied") return auditReport.cutAudits.filter((item) => Boolean(session.appliedFixByCut[item.cutNumber]));
    return auditReport.cutAudits;
  }, [auditReport.cutAudits, cutFilter, session.appliedFixByCut]);

  const markdownReport = useMemo(() => exportDriftReportMarkdown({ audit: auditReport, session, locale }), [auditReport, session, locale]);
  const jsonReport = useMemo(() => exportDriftReportJson({ audit: auditReport, session }), [auditReport, session]);

  const handleChangeArchetype = (archetypeId: ModelSheetArchetypeId): void => {
    const nextSession = createDriftCoachSession(archetypeId, 60);
    const nextSpec = getModelSheetSpec(archetypeId);
    setSession(nextSession);
    setStatusMessage(pick(`설정집 기준을 '${nextSpec.nameKo}(${nextSpec.headToBodyRatio.toFixed(1)}등신)'으로 바꾸고 60컷을 다시 스캔했습니다.`, `Switched model sheet to '${nextSpec.nameEn} (${nextSpec.headToBodyRatio.toFixed(1)}H)' and re-scanned 60 cuts.`));
  };

  const handleToggleAccessory = (accId: ModelSheetAccessoryId): void => {
    const exists = selectedCut.presentAccessories.includes(accId);
    const nextList = exists ? selectedCut.presentAccessories.filter((item) => item !== accId) : [...selectedCut.presentAccessories, accId];
    setSession((prev) => simulateCutMetricUpdate(prev, selectedCut.cutNumber, { presentAccessories: nextList }));
  };

  const handleTogglePreview = (candidate: CutCorrectionCandidate): void => {
    const next = previewCutCorrection(session, candidate.id);
    setSession(next);
    setStatusMessage(
      next.previewCandidateId
        ? pick(`'${candidate.titleKo}' 결과를 붉은 펜 도해에 미리보기 중입니다. 원본은 그대로 유지됩니다.`, `Previewing '${candidate.titleEn}' on red-pen diagram. Original cut untouched.`)
        : pick("교정 미리보기를 닫았습니다.", "Closed correction preview."),
    );
  };

  const handleApplyCandidate = (candidate: CutCorrectionCandidate): void => {
    const next = applyCutCorrection(session, selectedCut.cutNumber, candidate);
    setSession(next);
    onApplyFix?.(candidate, next);
    setStatusMessage(pick(`${selectedCut.cutNumber}컷에 '${candidate.titleKo}'를 비파괴 반영했습니다. 원복 버튼으로 언제든 되돌릴 수 있습니다.`, `Applied '${candidate.titleEn}' non-destructively to Cut #${selectedCut.cutNumber}.`));
  };

  const handleRevertSelected = (): void => {
    if (!appliedRecord) return;
    const next = revertCutCorrection(session, selectedCut.cutNumber);
    setSession(next);
    onRevertFix?.(selectedCut.cutNumber, next);
    setStatusMessage(pick(`${selectedCut.cutNumber}컷을 보정 전 원본 비율로 되돌렸습니다.`, `Reverted Cut #${selectedCut.cutNumber} to its pre-fix baseline.`));
  };

  const handleRevertAll = (): void => {
    const next = revertAllCutCorrections(session);
    setSession(next);
    onRevertFix?.("all", next);
    setStatusMessage(pick("전체 60컷을 초기 스캔 상태로 원복했습니다.", "Reverted all 60 cuts to initial scan baseline."));
  };

  const handleCopyReport = (format: "markdown" | "json"): void => {
    const content = format === "markdown" ? markdownReport : jsonReport;
    setReportPreview(format);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(content).catch(() => undefined);
    }
    onExportReport?.(format, content, auditReport);
    setStatusMessage(format === "markdown" ? pick("Markdown 검수 리포트를 클립보드에 복사했습니다.", "Copied Markdown QA report to clipboard.") : pick("JSON 검수 리포트를 클립보드에 복사했습니다.", "Copied JSON QA report to clipboard."));
  };

  return (
    <section
      data-testid="modelsheet-drift-coach-panel"
      aria-label={pick("화차 간 캐릭터 작화·비율 흔들림 감지기", "Cross-Cut Model Sheet Drift Coach")}
      className={`space-y-5 rounded-2xl border border-line bg-panel p-4 text-fg sm:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ScanSearch className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("화차 간 작화·비율 흔들림 감지기", "Cross-Cut Model Sheet Drift Coach")}
            </h2>
            <span data-testid="drift-approval-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
              {pick("작가 승인 후 적용", "Author Approval Required")}
            </span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? auditReport.summaryEn : auditReport.summaryKo}</p>
        </div>

        <div data-testid="episode-consistency-badge" data-grade={auditReport.grade} className="rounded-xl border border-line-strong bg-card px-3.5 py-2 text-right">
          <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{pick("회차 일관성 점수", "Episode Score")}</div>
          <div className={`text-lg font-bold tabular-nums ${scoreToneClass(auditReport.consistencyScore)}`}>
            {auditReport.consistencyScore}<span className="text-xs font-medium text-fg-3"> / 100</span>
          </div>
        </div>
      </header>

      {/* 캐릭터 설정집 4종 프리셋 + 핵심 KPI */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODEL_SHEET_ARCHETYPES.map((item) => {
            const active = item.id === spec.id;
            return (
              <button
                key={item.id} type="button" data-testid={`archetype-btn-${item.id}`} aria-pressed={active}
                onClick={() => handleChangeArchetype(item.id)}
                className={`${active ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-between text-left`}
              >
                <span className="flex w-full items-center justify-between gap-2 text-xs font-bold">
                  <span>{isEn ? item.nameEn : item.nameKo}</span>
                  <span className="font-mono text-[11px] tabular-nums">{item.headToBodyRatio.toFixed(1)}H</span>
                </span>
                <span className="line-clamp-1 text-[11px] font-normal text-fg-3">{isEn ? item.roleSummaryEn : item.roleSummaryKo}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("정상 컷", "OK Cuts")}</div>
            <div data-testid="kpi-ok-count" className="text-base font-bold text-good tabular-nums">{auditReport.counts.ok}</div>
          </div>
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("미세 주의", "Notice")}</div>
            <div data-testid="kpi-notice-count" className="text-base font-bold text-warn tabular-nums">{auditReport.counts.notice}</div>
          </div>
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("비율 흔들림", "Drift Cuts")}</div>
            <div data-testid="kpi-drift-count" className="text-base font-bold text-bad tabular-nums">{auditReport.counts.drift}</div>
          </div>
          <div className="rounded-xl bg-raised px-3 py-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("비파괴 보정 적용", "Applied Fixes")}</div>
            <div data-testid="kpi-applied-count" className="text-base font-bold text-accent tabular-nums">{appliedCount}</div>
          </div>
        </div>
      </div>

      {/* 1~60컷 타임라인 스트립 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Ruler className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("1~60컷 회차 타임라인 스트립", "1–60 Cut Episode Strip")}</span>
            <span className="text-[11px] font-normal text-fg-3 tabular-nums">({visibleCuts.length}/{auditReport.totalCuts})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["all", pick("전체 60컷", "All 60")],
              ["flagged", pick(`문제 컷 (${auditReport.counts.drift + auditReport.counts.notice})`, `Flagged (${auditReport.counts.drift + auditReport.counts.notice})`)],
              ["applied", pick(`적용됨 (${appliedCount})`, `Applied (${appliedCount})`)],
            ] as const).map(([mode, label]) => (
              <button key={mode} type="button" data-testid={`cut-filter-${mode}`} aria-pressed={cutFilter === mode} onClick={() => setCutFilter(mode)} className={cutFilter === mode ? BTN_ACTIVE : BTN_OUTLINE}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div data-testid="cut-timeline-strip" className="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-10">
          {visibleCuts.map((item) => {
            const isSelected = item.cutNumber === selectedCut.cutNumber;
            const isApplied = Boolean(session.appliedFixByCut[item.cutNumber]);
            const tone =
              item.severity === "drift" ? "border-bad bg-bad-soft text-bad"
                : item.severity === "notice" ? "border-warn bg-warning-soft text-warn"
                  : "border-line bg-canvas text-fg-2 hover:bg-raised";
            return (
              <button
                key={item.cutId} type="button" data-testid={`drift-cut-btn-${item.cutNumber}`}
                data-severity={item.severity} data-applied={String(isApplied)} aria-pressed={isSelected}
                onClick={() => setSession((prev) => selectDriftCoachCut(prev, item.cutNumber))}
                className={`inline-flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg border px-1 py-1 text-[11px] font-semibold tabular-nums transition-colors motion-reduce:transition-none ${FOCUS_RING} ${tone} ${isSelected ? "ring-2 ring-accent ring-offset-1 ring-offset-card" : ""}`}
              >
                <span>#{item.cutNumber}</span>
                <span className="text-[10px] font-medium">{isApplied ? "✓" : `${item.cutScore}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 메인 대조 영역: 좌측 붉은 펜 도해 + 시뮬레이터 / 우측 Top-3 교정 + 이력/리포트 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-6">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span data-testid="selected-cut-heading" className="text-sm font-bold text-fg tabular-nums [word-break:keep-all]">
                  {pick(`${selectedCut.cutNumber}컷 · ${selectedCut.sceneTagKo}`, `Cut #${selectedCut.cutNumber} · ${selectedCut.sceneTagEn}`)}
                </span>
                <span data-testid="selected-cut-severity-badge" data-severity={displayedAudit.severity} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityToneClass(displayedAudit.severity)}`}>
                  {severityLabel(displayedAudit.severity, isEn)} · {displayedAudit.cutScore}
                </span>
              </div>
              {previewCandidate && (
                <span data-testid="redpen-preview-banner" className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
                  {pick(`미리보기 중: ${previewCandidate.titleKo}`, `Previewing: ${previewCandidate.titleEn}`)}
                </span>
              )}
            </div>

            <RedPenOverlaySvg spec={spec} cut={displayedCut} audit={displayedAudit} isPreviewing={Boolean(previewCandidate)} isEn={isEn} />

            <ul data-testid="redpen-callouts-list" className="space-y-1 rounded-lg bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
              {(isEn ? displayedAudit.redPenCalloutsEn : displayedAudit.redPenCalloutsKo).map((note, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  {displayedAudit.severity === "ok"
                    ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />
                    : <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-bad" aria-hidden="true" />}
                  <span className="tabular-nums">{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("컷 비율 편차 · 소품 시뮬레이터", "Cut Proportion & Prop Simulator")}</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {DRIFT_METRIC_KEYS.map((key) => {
                const meta = DRIFT_METRIC_META[key];
                const detail = selectedAudit.metrics[key];
                const sliderId = `${uid}-${key}`;
                return (
                  <div key={key} className="space-y-1 rounded-lg bg-raised px-3 py-2">
                    <label htmlFor={sliderId} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
                      <span>{isEn ? meta.labelEn : meta.labelKo}</span>
                      <span data-testid={`metric-readout-${key}`} className="font-mono text-[11px] font-bold tabular-nums text-fg">
                        {selectedCut[key].toFixed(2)} ({formatSigned(detail.signedPct)})
                      </span>
                    </label>
                    <input
                      id={sliderId} data-testid={`slider-${key}`} type="range" min={meta.min} max={meta.max} step={meta.step} value={selectedCut[key]}
                      onChange={(e) => setSession((prev) => simulateCutMetricUpdate(prev, selectedCut.cutNumber, { [key]: Number(e.target.value) }))}
                      className="min-h-11 w-full cursor-pointer accent-accent"
                    />
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-fg-3 [word-break:keep-all]">
                {pick(`가르마 방향 (기준: ${getHairPartMeta(spec.hairPartSide).labelKo})`, `Hair Part (Spec: ${getHairPartMeta(spec.hairPartSide).labelEn})`)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {HAIR_PART_OPTIONS.map((opt) => (
                  <button
                    key={opt.id} type="button" data-testid={`hairpart-btn-${opt.id}`} aria-pressed={selectedCut.hairPartSide === opt.id}
                    onClick={() => setSession((prev) => simulateCutMetricUpdate(prev, selectedCut.cutNumber, { hairPartSide: opt.id }))}
                    className={selectedCut.hairPartSide === opt.id ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {isEn ? opt.labelEn : opt.labelKo}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-fg-3 [word-break:keep-all]">
                {pick("필수 의상·장신구 체크리스트 (클릭해 누락 시뮬레이션)", "Required Accessories (Click to simulate omission)")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {spec.requiredAccessories.map((accId) => {
                  const meta = getAccessoryMeta(accId);
                  const present = selectedCut.presentAccessories.includes(accId);
                  return (
                    <button
                      key={accId} type="button" data-testid={`acc-toggle-${accId}`} aria-pressed={present}
                      onClick={() => handleToggleAccessory(accId)}
                      className={present ? BTN_ACTIVE : `${BTN_BASE} border border-bad bg-bad-soft px-3 py-2 text-bad`}
                    >
                      {present ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span>{isEn ? meta.labelEn : meta.labelKo}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 xl:col-span-6">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg [word-break:keep-all]">
                {pick("비파괴 Top-3 교정 후보", "Non-Destructive Top-3 Corrections")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="revert-selected-cut-btn" disabled={!appliedRecord} onClick={handleRevertSelected} className={BTN_OUTLINE}>
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("선택 컷 원복", "Revert Cut")}</span>
                </button>
                <button type="button" data-testid="revert-all-cuts-btn" onClick={handleRevertAll} className={BTN_OUTLINE}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("전체 원복", "Revert All")}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {top3Candidates.map((candidate) => {
                const isPreviewing = session.previewCandidateId === candidate.id;
                const isAppliedThis = appliedRecord?.strategy === candidate.strategy;
                const actions = isEn ? candidate.overlayActionsEn : candidate.overlayActionsKo;
                return (
                  <article
                    key={candidate.id} data-testid={`proposal-card-${candidate.rank}`} data-strategy={candidate.strategy}
                    className={`space-y-2 rounded-xl border p-3 ${isAppliedThis ? "border-good bg-good-soft" : isPreviewing ? "border-accent bg-accent-soft" : "border-line bg-raised"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                          <span className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-accent">#{candidate.rank}</span>
                          <span>{isEn ? candidate.titleEn : candidate.titleKo}</span>
                        </div>
                        <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? candidate.summaryEn : candidate.summaryKo}</p>
                      </div>
                      <div className="rounded-lg bg-card px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                        <span className="text-fg-3">{selectedAudit.cutScore} → </span>
                        <span className={scoreToneClass(candidate.projectedAudit.cutScore)}>{candidate.projectedAudit.cutScore}</span>
                        <span className="ml-1 text-good">({candidate.scoreGain >= 0 ? "+" : ""}{candidate.scoreGain})</span>
                      </div>
                    </div>

                    <ul className="space-y-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
                      {actions.map((act, idx) => <li key={idx}>· {act}</li>)}
                    </ul>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" data-testid={`proposal-preview-btn-${candidate.rank}`} aria-pressed={isPreviewing} onClick={() => handleTogglePreview(candidate)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isPreviewing ? pick("미리보기 끄기", "Stop Preview") : pick("미리보기", "Preview")}</span>
                      </button>
                      <button type="button" data-testid={`proposal-apply-btn-${candidate.rank}`} onClick={() => handleApplyCandidate(candidate)} className={BTN_SOLID}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isAppliedThis ? pick("다시 적용", "Re-apply") : pick("비파괴 적용", "Apply Fix")}</span>
                      </button>
                      {isAppliedThis && (
                        <button type="button" data-testid={`proposal-revert-btn-${candidate.rank}`} onClick={handleRevertSelected} className={BTN_OUTLINE}>
                          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{pick("원복", "Revert")}</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                <History className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("컷별 승인·원복 이력 & 리포트 내보내기", "Approval Log & QA Report Export")}</span>
              </div>
              <span data-testid="approval-history-count" className="font-mono text-[11px] text-fg-3 tabular-nums">
                r{session.revision} · {session.approvalHistory.length}
              </span>
            </div>

            <div data-testid="approval-history-list" className="max-h-28 space-y-1 overflow-y-auto rounded-lg bg-raised px-3 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
              {session.approvalHistory.length === 0 ? (
                <p className="text-fg-3">{pick("아직 반영된 보정이 없습니다. 위 후보를 미리본 뒤 승인·적용하세요.", "No fixes applied yet. Preview a candidate before applying.")}</p>
              ) : (
                session.approvalHistory.map((entry) => (
                  <div key={entry.entryId} className="tabular-nums">
                    [r{entry.revision}] {isEn ? entry.summaryEn : entry.summaryKo}
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="export-markdown-btn" onClick={() => handleCopyReport("markdown")} className={BTN_OUTLINE}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("Markdown 리포트 복사", "Copy Markdown Report")}</span>
              </button>
              <button type="button" data-testid="export-json-btn" onClick={() => handleCopyReport("json")} className={BTN_OUTLINE}>
                <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("JSON 리포트 복사", "Copy JSON Report")}</span>
              </button>
              <button type="button" data-testid="toggle-report-preview-btn" onClick={() => setReportPreview((prev) => (prev === "hidden" ? "markdown" : "hidden"))} className={BTN_OUTLINE}>
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{reportPreview === "hidden" ? pick("리포트 열기", "Show Report") : pick("리포트 닫기", "Hide Report")}</span>
              </button>
            </div>

            {reportPreview !== "hidden" && (
              <pre data-testid="drift-report-preview" data-format={reportPreview} className="max-h-48 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
                {reportPreview === "markdown" ? markdownReport : jsonReport}
              </pre>
            )}
          </div>
        </div>
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="drift-coach-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusMessage}
        </div>
      )}
    </section>
  );
}
