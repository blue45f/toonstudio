/**
 * Wave 49E — 세로 스크롤 감정 곡선 · 컷 호흡 오토 디렉터 스튜디오 패널.
 *
 * - 4종 대표 회차 리듬 프리셋 + 순수 시맨틱 SVG 감정 곡선 그래프(현재 vs 제안 점선 오버레이)
 * - 순수 시맨틱 SVG 미니 세로 원고 리듬 바(여백·컷 높이 비례 + 경고 마커, oklch/currentColor 전용)
 * - 컷 선택 스트립 · 여백(px)/긴장도/컷높이/대사량 미세 슬라이더 · 샷 스케일 조정
 * - 비파괴 Top-3 호흡 연출 개선안(미리보기·적용·원복) + 리듬 시트 Markdown/JSON 내보내기
 */

import {
  Activity, AlertTriangle, Check, CheckCircle2, ClipboardCopy, Eye,
  FileJson, FileText, History, Layers, RotateCcw, SlidersHorizontal, Undo2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";
import { usePacingNotification } from "./use-pacing-notification";
import { usePacingCopy } from "./use-pacing-copy";

import {
  BEAT_ROLE_LABELS, MAX_DIALOGUE_CHARS, MAX_GUTTER_PX, MAX_PANEL_HEIGHT_PX, MAX_TENSION_SCORE,
  MIN_DIALOGUE_CHARS, MIN_GUTTER_PX, MIN_PANEL_HEIGHT_PX, MIN_TENSION_SCORE,
  SCROLL_PACING_PRESETS, SHOT_SCALE_OPTIONS, applyScrollPacingProposal, auditScrollTensionCurve,
  createScrollPacingSession, exportScrollPacingJson, exportScrollPacingMarkdown,
  getScrollPacingPreset, getShotScaleMeta, previewScrollPacingProposal,
  proposeScrollPacingAdjustmentsTop3, revertAllPacingAdjustments, revertLastPacingAdjustment,
  selectScrollPacingCut, updateCutPacingMetrics,
  type ScrollPacingCut, type ScrollPacingPresetId, type ScrollPacingProposal,
  type ScrollPacingSessionState, type ScrollPacingSeverity, type ScrollShotScale,
  type ScrollTensionAuditReport,
} from "./scroll-pacing-composer-engine";

export interface StudioScrollPacingComposerPanelProps {
  readonly initialPresetId?: ScrollPacingPresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (
    proposal: ScrollPacingProposal,
    session: ScrollPacingSessionState,
    projectedAudit: ScrollTensionAuditReport,
  ) => void | Promise<void>;
  readonly onExportJson?: (
    jsonContent: string,
    audit: ScrollTensionAuditReport,
    session: ScrollPacingSessionState,
  ) => void | Promise<void>;
}

type ExportPreviewMode = "hidden" | "markdown" | "json";

// 탈-바이올렛 OKLCH 시맨틱 팔레트(기준 곡선 215°, 제안·정상 155°, 평탄·주의 72°, 과밀·클라이맥스 경고 28°)
const SVG_INK_CURRENT = "oklch(0.55 0.12 215)";
const SVG_INK_PROPOSED = "oklch(0.58 0.16 155)";
const SVG_INK_WARN = "oklch(0.68 0.15 72)";
const SVG_INK_CRITICAL = "oklch(0.58 0.20 28)";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function scoreToneClass(score: number): string {
  return score >= 82 ? "text-good" : score >= 68 ? "text-warn" : "text-bad";
}

function severityBadgeClass(status: ScrollPacingSeverity): string {
  if (status === "critical") return "border-bad bg-bad-soft text-bad";
  return status === "warn" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function tensionToOklch(tension: number): string {
  if (tension >= 84) return SVG_INK_CRITICAL;
  if (tension >= 66) return SVG_INK_WARN;
  return tension >= 48 ? SVG_INK_PROPOSED : SVG_INK_CURRENT;
}

function buildPolylinePoints(
  cuts: readonly ScrollPacingCut[],
  xForIndex: (index: number) => number,
  yForTension: (tension: number) => number,
): string {
  return cuts.map((cut, idx) => `${xForIndex(idx).toFixed(1)},${yForTension(cut.tensionScore).toFixed(1)}`).join(" ");
}

function TensionCurveGraphSvg(props: {
  readonly currentCuts: readonly ScrollPacingCut[];
  readonly previewCuts: readonly ScrollPacingCut[] | null;
  readonly audit: ScrollTensionAuditReport;
  readonly selectedCutNumber: number;
  readonly presetId: ScrollPacingPresetId;
  readonly isEn: boolean;
  readonly onSelectCut: (cutNumber: number) => void;
}): ReactElement {
  const { currentCuts, previewCuts, audit, selectedCutNumber, presetId, isEn, onSelectCut } = props;
  const width = 520;
  const height = 276;
  const padL = 42;
  const padR = 20;
  const padT = 32;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const count = Math.max(1, currentCuts.length);

  const xAt = (idx: number): number => (count <= 1 ? padL + plotW / 2 : padL + (idx / (count - 1)) * plotW);
  const yAt = (t: number): number => padT + ((100 - t) / 100) * plotH;

  const currentPoints = buildPolylinePoints(currentCuts, xAt, yAt);
  const areaPath = currentCuts.length > 0
    ? `M ${xAt(0).toFixed(1)} ${(padT + plotH).toFixed(1)} ` +
      currentCuts.map((c, i) => `L ${xAt(i).toFixed(1)} ${yAt(c.tensionScore).toFixed(1)}`).join(" ") +
      ` L ${xAt(currentCuts.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
    : "";
  const previewPoints = previewCuts ? buildPolylinePoints(previewCuts, xAt, yAt) : "";
  const denseCutSet = new Set<number>(audit.denseDialogueZones.flatMap((z) => [...z.cutNumbers]));
  const narrowClimaxSet = new Set<number>(audit.climaxGutterShortfalls.map((item) => item.cutNumber));
  const selectedIndex = Math.max(0, currentCuts.findIndex((c) => c.cutNumber === selectedCutNumber));

  return (
    <svg
      data-testid="scroll-tension-curve-svg" data-preset-id={presetId}
      data-selected-cut={selectedCutNumber} data-preview-active={String(Boolean(previewCuts))}
      data-issue-count={audit.issues.length} viewBox={`0 0 ${width} ${height}`} role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn ? `Vertical scroll tension curve for ${currentCuts.length} cuts` : `${currentCuts.length}컷 세로 스크롤 감정 곡선 및 경고 구간 그래프`}
    >
      <text x={padL} y={18} fill="currentColor" fillOpacity={0.78} fontSize="11" fontWeight="700">
        {isEn ? "TENSION CURVE (0-100)" : "세로 스크롤 감정 곡선 (0~100)"}
      </text>
      <line x1={270} y1={14} x2={292} y2={14} stroke={SVG_INK_CURRENT} strokeWidth="2.5" />
      <text x={297} y={18} fill="currentColor" fillOpacity={0.72} fontSize="10">{isEn ? "Current" : "현재"}</text>
      <line x1={345} y1={14} x2={367} y2={14} stroke={SVG_INK_PROPOSED} strokeWidth="2.4" strokeDasharray="5 3" />
      <text x={372} y={18} fill="currentColor" fillOpacity={0.72} fontSize="10">{isEn ? "Proposed" : "제안"}</text>
      <circle cx={426} cy={14} r={4} fill={SVG_INK_CRITICAL} />
      <text x={435} y={18} fill="currentColor" fillOpacity={0.72} fontSize="10">{isEn ? "Warning" : "경고"}</text>

      {[0, 25, 50, 75, 100].map((tick) => {
        const y = yAt(tick);
        return (
          <g key={tick}>
            <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="currentColor" strokeOpacity={tick === 0 ? 0.28 : 0.11} strokeDasharray={tick === 0 ? undefined : "3 3"} />
            <text x={padL - 8} y={y + 3} textAnchor="end" fill="currentColor" fillOpacity={0.55} fontSize="9">{tick}</text>
          </g>
        );
      })}

      {audit.flatZones.map((zone) => {
        const x1 = Math.max(padL, xAt(zone.startCut - 1) - 10);
        const x2 = Math.min(padL + plotW, xAt(zone.endCut - 1) + 10);
        return (
          <g key={`flat-${zone.startCut}-${zone.endCut}`} data-testid="svg-flat-zone-band">
            <rect x={x1} y={padT} width={Math.max(18, x2 - x1)} height={plotH} rx={6} fill={SVG_INK_WARN} fillOpacity={0.14} stroke={SVG_INK_WARN} strokeOpacity={0.48} strokeDasharray="3 3" />
            <text x={(x1 + x2) / 2} y={padT + 13} textAnchor="middle" fill={SVG_INK_WARN} fontSize="9" fontWeight="700">
              {isEn ? "FLAT" : "평탄 경고"}
            </text>
          </g>
        );
      })}

      {currentCuts[selectedIndex] && (
        <line x1={xAt(selectedIndex)} y1={padT} x2={xAt(selectedIndex)} y2={padT + plotH} stroke="currentColor" strokeOpacity={0.28} strokeDasharray="2 2" />
      )}

      {areaPath && <path d={areaPath} fill={SVG_INK_CURRENT} fillOpacity={0.11} />}
      {currentPoints && (
        <polyline data-testid="svg-current-curve-line" points={currentPoints} fill="none" stroke={SVG_INK_CURRENT} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {previewPoints && (
        <polyline data-testid="svg-proposed-curve-line" points={previewPoints} fill="none" stroke={SVG_INK_PROPOSED} strokeWidth="2.8" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {currentCuts.map((cut, idx) => {
        const cx = xAt(idx);
        const cy = yAt(cut.tensionScore);
        const isSelected = cut.cutNumber === selectedCutNumber;
        const isDense = denseCutSet.has(cut.cutNumber);
        const isNarrowClimax = narrowClimaxSet.has(cut.cutNumber);
        const previewCut = previewCuts?.[idx];

        return (
          <g key={cut.cutId} onClick={() => onSelectCut(cut.cutNumber)} className="cursor-pointer">
            {previewCut && previewCut.tensionScore !== cut.tensionScore && (
              <>
                <line x1={cx} y1={cy} x2={cx} y2={yAt(previewCut.tensionScore)} stroke={SVG_INK_PROPOSED} strokeWidth="1.4" strokeDasharray="2 2" />
                <circle cx={cx} cy={yAt(previewCut.tensionScore)} r={3.8} fill={SVG_INK_PROPOSED} />
              </>
            )}
            {isDense && (
              <circle data-testid={`svg-dense-marker-${cut.cutNumber}`} cx={cx} cy={cy} r={9} fill={SVG_INK_CRITICAL} fillOpacity={0.16} stroke={SVG_INK_CRITICAL} strokeWidth="1.4" />
            )}
            {isNarrowClimax && (
              <polygon data-testid={`svg-climax-marker-${cut.cutNumber}`} points={`${cx},${Math.max(padT + 4, cy - 16)} ${cx - 6},${Math.max(padT + 14, cy - 6)} ${cx + 6},${Math.max(padT + 14, cy - 6)}`} fill={SVG_INK_CRITICAL} />
            )}
            <circle cx={cx} cy={cy} r={isSelected ? 5.6 : 3.8} fill={isNarrowClimax || isDense ? SVG_INK_CRITICAL : SVG_INK_CURRENT} stroke="currentColor" strokeOpacity={isSelected ? 0.95 : 0.35} strokeWidth={isSelected ? 2 : 1} />
            {(idx === 0 || idx === currentCuts.length - 1 || (idx + 1) % 3 === 0 || isSelected) && (
              <text x={cx} y={height - 12} textAnchor="middle" fill="currentColor" fillOpacity={isSelected ? 0.95 : 0.55} fontSize="9" fontWeight={isSelected ? "700" : "500"}>
                {cut.cutNumber}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function MiniManuscriptRhythmStripSvg(props: {
  readonly cuts: readonly ScrollPacingCut[];
  readonly baselineCuts: readonly ScrollPacingCut[];
  readonly selectedCutNumber: number;
  readonly isPreviewing: boolean;
  readonly isEn: boolean;
  readonly onSelectCut: (cutNumber: number) => void;
}): ReactElement {
  const { cuts, baselineCuts, selectedCutNumber, isPreviewing, isEn, onSelectCut } = props;
  const width = 186;
  const height = 276;
  const topPad = 28;
  const usableH = height - topPad - 14;
  const totalPx = Math.max(1, cuts.reduce((sum, cut) => sum + cut.gutterPx + cut.panelHeightPx, 0));
  const scaleY = usableH / totalPx;

  const blocks: {
    readonly cut: ScrollPacingCut; readonly gutterY: number; readonly gutterH: number;
    readonly panelY: number; readonly panelH: number; readonly gutterExpandedPx: number;
  }[] = [];
  let cursor = topPad;
  for (let idx = 0; idx < cuts.length; idx += 1) {
    const cut = cuts[idx];
    const gutterH = Math.max(2, cut.gutterPx * scaleY);
    const panelH = Math.max(5, cut.panelHeightPx * scaleY);
    const gutterY = cursor;
    const panelY = cursor + gutterH;
    cursor = panelY + panelH;
    const baseGutter = baselineCuts[idx]?.gutterPx ?? cut.gutterPx;
    blocks.push({ cut, gutterY, gutterH, panelY, panelH, gutterExpandedPx: cut.gutterPx - baseGutter });
  }

  return (
    <svg
      data-testid="scroll-manuscript-strip-svg" data-preview-mode={String(isPreviewing)}
      data-cut-count={cuts.length} viewBox={`0 0 ${width} ${height}`} role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn ? "Miniature vertical scroll manuscript rhythm bar" : "미니 세로 웹툰 원고 여백·컷 높이 리듬 바"}
    >
      <text x="12" y="18" fill="currentColor" fillOpacity={0.78} fontSize="10" fontWeight="700">
        {isEn ? "SCROLL STRIP" : "세로 원고 리듬 바"}
      </text>
      <rect x="44" y={topPad - 2} width="98" height={usableH + 4} rx="8" fill="none" stroke="currentColor" strokeOpacity={0.18} />

      {blocks.map(({ cut, gutterY, gutterH, panelY, panelH, gutterExpandedPx }) => {
        const isSelected = cut.cutNumber === selectedCutNumber;
        const fillInk = tensionToOklch(cut.tensionScore);
        return (
          <g key={cut.cutId} onClick={() => onSelectCut(cut.cutNumber)} className="cursor-pointer">
            {gutterExpandedPx >= 60 && (
              <rect x="52" y={gutterY} width="82" height={gutterH} fill={SVG_INK_PROPOSED} fillOpacity={0.22} stroke={SVG_INK_PROPOSED} strokeWidth="0.9" strokeDasharray="2 2" />
            )}
            <rect x="52" y={panelY} width="82" height={panelH} rx="2.5" fill={fillInk} fillOpacity={isSelected ? 0.42 : 0.22} stroke={isSelected ? "currentColor" : fillInk} strokeWidth={isSelected ? 1.8 : 1} />
            {cut.dialogueChars >= 52 && (
              <line x1="58" y1={panelY + panelH * 0.5} x2="128" y2={panelY + panelH * 0.5} stroke={SVG_INK_CRITICAL} strokeWidth="1.6" strokeDasharray="3 2" />
            )}
            {isSelected && (
              <text x="148" y={panelY + panelH * 0.65} fill="currentColor" fontSize="9" fontWeight="700">#{cut.cutNumber}</text>
            )}
            {gutterExpandedPx >= 120 && (
              <text x="12" y={gutterY + Math.max(6, gutterH * 0.7)} fill={SVG_INK_PROPOSED} fontSize="8" fontWeight="700">+{gutterExpandedPx}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function StudioScrollPacingComposerPanel(props: StudioScrollPacingComposerPanelProps): ReactElement {
  const { initialPresetId = "romance-ep1", locale = "ko", className, onApply, onExportJson } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [session, setSession] = useState<ScrollPacingSessionState>(() => createScrollPacingSession(initialPresetId));
  const [exportPreview, setExportPreview] = useState<ExportPreviewMode>("hidden");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const preset = useMemo(() => getScrollPacingPreset(session.presetId), [session.presetId]);
  const audit = useMemo(() => auditScrollTensionCurve(session.workingCuts), [session.workingCuts]);
  const proposals = useMemo(() => proposeScrollPacingAdjustmentsTop3(session.workingCuts), [session.workingCuts]);
  const previewProposal = useMemo<ScrollPacingProposal | null>(
    () => proposals.find((item) => item.id === session.previewProposalId) ?? null,
    [proposals, session.previewProposalId],
  );

  const activeCuts = previewProposal ? previewProposal.proposedCuts : session.workingCuts;
  const activeAudit = previewProposal ? previewProposal.projectedAudit : audit;
  const selectedCut = useMemo<ScrollPacingCut>(
    () => activeCuts.find((c) => c.cutNumber === session.selectedCutNumber) ?? activeCuts[0] ?? preset.cuts[0],
    [activeCuts, preset.cuts, session.selectedCutNumber],
  );
  const selectedDiag = useMemo(
    () => activeAudit.cutDiagnostics.find((d) => d.cutNumber === selectedCut.cutNumber),
    [activeAudit.cutDiagnostics, selectedCut.cutNumber],
  );

  const markdownSheet = useMemo(() => exportScrollPacingMarkdown({ preset, cuts: session.workingCuts, audit, session, locale }), [preset, session, audit, locale]);
  const jsonSheet = useMemo(() => exportScrollPacingJson({ preset, cuts: session.workingCuts, audit, session }), [preset, session, audit]);

  const handleSelectPreset = (nextPresetId: ScrollPacingPresetId): void => {
    const nextSession = createScrollPacingSession(nextPresetId);
    const nextPreset = getScrollPacingPreset(nextPresetId);
    setSession(nextSession);
    setStatusMessage(pick(`'${nextPreset.titleKo}'(${nextPreset.cuts.length}컷) 세로 스크롤 감정 곡선을 불러왔습니다.`, `Loaded '${nextPreset.titleEn}' (${nextPreset.cuts.length} cuts).`));
  };

  const handleSelectCut = (cutNumber: number): void => {
    setSession((prev) => selectScrollPacingCut(prev, cutNumber));
  };

  const handleUpdateSelectedCut = (
    patch: Partial<Pick<ScrollPacingCut, "gutterPx" | "panelHeightPx" | "tensionScore" | "dialogueChars" | "shotScale">>,
  ): void => {
    setSession((prev) => updateCutPacingMetrics(prev, prev.selectedCutNumber, patch));
  };

  const handleTogglePreview = (proposal: ScrollPacingProposal): void => {
    const next = previewScrollPacingProposal(session, proposal.id);
    setSession(next);
    setStatusMessage(
      next.previewProposalId
        ? pick(`'${proposal.titleKo}' 점선 곡선을 미리보기 중입니다. 원본 컷은 그대로 유지됩니다.`, `Previewing '${proposal.titleEn}' dashed curve overlay. Baseline cuts remain untouched.`)
        : pick("제안 곡선 미리보기를 닫았습니다.", "Closed proposal curve preview."),
    );
  };

  const applyDelivery = usePacingNotification<{ proposal: ScrollPacingProposal; session: ScrollPacingSessionState; audit: ScrollTensionAuditReport }>(onApply ? value => onApply(value.proposal, value.session, value.audit) : undefined);
  const copyDelivery = usePacingCopy<{ audit: ScrollTensionAuditReport; session: ScrollPacingSessionState }, "markdown" | "json">({
    json: onExportJson ? (text, value) => onExportJson(text, value.audit, value.session) : undefined,
  });
  const pending = applyDelivery.status === "pending" || copyDelivery.state === "pending";
  const isPending = (): boolean => applyDelivery.isPending() || copyDelivery.isPending();

  const handleApplyProposal = (proposal: ScrollPacingProposal): void => {
    if (isPending()) return;
    const nextSession = applyScrollPacingProposal(session, proposal);
    const nextAudit = auditScrollTensionCurve(nextSession.workingCuts);
    setSession(nextSession);
    applyDelivery.notify({ proposal, session: nextSession, audit: nextAudit });
    setStatusMessage(
      pick(
        `'${proposal.titleKo}' 메모리 예제를 선택했습니다. 규칙 기반 리듬 점수 ${nextAudit.immersionScore}점(${nextAudit.grade}등급), 클리프행어 ${nextAudit.cliffhangerStrength}점.`,
        `Selected '${proposal.titleEn}' in-memory example. Rule-based rhythm ${nextAudit.immersionScore} (${nextAudit.grade}), cliffhanger ${nextAudit.cliffhangerStrength}.`,
      ),
    );
  };

  const handleRevertLast = (): void => {
    if (isPending() || session.undoStack.length === 0) return;
    setSession(revertLastPacingAdjustment(session));
    setStatusMessage(pick("메모리 예제의 직전 컷 호흡 조정을 되돌렸습니다.", "Reverted the last pacing change."));
  };

  const handleRevertAll = (): void => {
    if (isPending()) return;
    setSession(revertAllPacingAdjustments(session));
    setStatusMessage(pick(`'${preset.titleKo}' 프리셋 원본 여백·긴장도로 모두 복구했습니다.`, `Restored '${preset.titleEn}' cuts to original baseline.`));
  };

  const handleExport = (format: "markdown" | "json"): void => {
    if (isPending()) return;
    const content = format === "markdown" ? markdownSheet : jsonSheet;
    setExportPreview(format);
    copyDelivery.copy(format, content, { audit, session });
    setStatusMessage("");
  };

  return (
    <section
      data-testid="studio-scroll-pacing-composer-panel"
      aria-label={pick("세로 스크롤 감정 곡선 · 컷 호흡 오토 디렉터", "Scroll Pacing & Tension Curve Composer")}
      className={`space-y-4 rounded-2xl border border-line bg-canvas p-4 text-fg shadow-sm ${className ?? ""}`}
    >
      <p data-testid="pacing-example-scope" className="text-xs text-fg-2">{pick("CPU·메모리 컷 수치 예제입니다. 실제 원고·대사 원문을 읽거나 수정·저장하지 않습니다. 읽기 시간은 고정 속도 가정이며 몰입·독자 반응의 실측값이 아닙니다. 직전 원복은 최근 24단계, 전체 원복은 처음 예제까지 지원합니다. 전략 표시는 선택 기록입니다.", "CPU and in-memory cut metrics example. No artwork or dialogue text is read, edited or saved. Reading time uses fixed rates; engagement and reader response are not measured. Undo keeps 24 steps; reset restores the initial example. Strategy labels record selections.")}</p>
      {applyDelivery.status !== "idle" ? <div data-testid="pacing-delivery-apply" role={applyDelivery.status === "failed" ? "alert" : "status"} className="space-y-2 text-xs text-fg-2">
        <p>{applyDelivery.status === "local-only" ? pick("수신자 미연결. 메모리 예제만 바뀌었습니다.", "No receiver connected. Only the in-memory example changed.") : applyDelivery.status === "pending" ? pick("예제 수신자 응답 대기 중입니다.", "Waiting for the example receiver.") : applyDelivery.status === "failed" ? pick("예제 알림 실패. 같은 결과를 다시 알릴 수 있습니다.", "Example notification failed. Retry the same result.") : pick("예제 알림 완료. 실제 원고 반영·저장은 확인하지 않습니다.", "Example notified; artwork changes and storage were not verified.")}</p>
        {applyDelivery.status === "failed" ? <button type="button" data-testid="pacing-retry-apply" disabled={pending} onClick={applyDelivery.retry} className={BTN_OUTLINE}>{pick("같은 예제 알림 재시도", "Retry the same notification")}</button> : null}
      </div> : null}
      {copyDelivery.state !== "idle" ? <div data-testid="pacing-copy-status" role={copyDelivery.state === "error" ? "alert" : "status"} className="space-y-2 text-xs text-fg-2">
        <p>{copyDelivery.state === "pending" ? pick("클립보드·예제 알림 응답 대기 중입니다.", "Waiting for clipboard and example notification.") : copyDelivery.state === "error" ? pick("복사 또는 예제 알림 실패. 완료된 복사는 반복하지 않습니다.", "Copy or notification failed; completed copies are not repeated.") : pick(`클립보드 복사 완료 (${copyDelivery.bytes.toLocaleString("ko-KR")} B). 실제 원고 저장은 확인하지 않습니다.`, `Clipboard copy completed (${copyDelivery.bytes.toLocaleString("en-US")} B). Artwork storage was not verified.`)}</p>
        {copyDelivery.state === "error" ? <button type="button" data-testid="pacing-copy-retry" disabled={pending} onClick={copyDelivery.retry} className={BTN_OUTLINE}>{pick("같은 시트 복사·알림 재시도", "Retry the same sheet")}</button> : null}
      </div> : null}
      <fieldset disabled={pending} className="contents">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("세로 스크롤 감정 곡선 · 컷 호흡 오토 디렉터", "Scroll Pacing & Tension Curve Composer")}
            </h2>
            <span
              data-testid="pacing-mode-badge"
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${previewProposal ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised text-fg-2"}`}
            >
              {previewProposal ? pick("제안 곡선 미리보기 중", "Previewing Proposal") : pick("비파괴 편집 · 원복 가능", "Non-Destructive · Reversible")}
            </span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? preset.rhythmGoalEn : preset.rhythmGoalKo}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-card px-3 py-2 text-right">
            <div className="text-[10px] font-medium text-fg-3 [word-break:keep-all]">{pick("몰입 리듬 점수", "Immersion")}</div>
            <div data-testid="kpi-immersion-score" className={`text-sm font-bold tabular-nums ${scoreToneClass(activeAudit.immersionScore)}`}>
              {activeAudit.immersionScore}<span className="ml-1 text-xs text-fg-3">({activeAudit.grade})</span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2 text-right">
            <div className="text-[10px] font-medium text-fg-3 [word-break:keep-all]">{pick("클리프행어 강도", "Cliffhanger")}</div>
            <div data-testid="kpi-cliffhanger-strength" className={`text-sm font-bold tabular-nums ${scoreToneClass(activeAudit.cliffhangerStrength)}`}>
              {activeAudit.cliffhangerStrength}<span className="ml-0.5 text-[11px] text-fg-3">/100</span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2 text-right">
            <div className="text-[10px] font-medium text-fg-3 [word-break:keep-all]">{pick("호흡 경고", "Warnings")}</div>
            <div data-testid="kpi-issue-count" className={`text-sm font-bold tabular-nums ${activeAudit.issues.length === 0 ? "text-good" : "text-warn"}`}>
              {activeAudit.issues.length}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2 text-right">
            <div className="text-[10px] font-medium text-fg-3 [word-break:keep-all]">{pick("세로 길이 · 정독", "Scroll · Read")}</div>
            <div data-testid="kpi-scroll-length" className="text-xs font-bold text-fg tabular-nums">
              {activeAudit.totalScrollHeightPx.toLocaleString()}px · {activeAudit.estimatedTotalReadSec}s
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label={pick("회차 리듬 프리셋", "Episode Rhythm Presets")}>
        {SCROLL_PACING_PRESETS.map((item) => {
          const isCurrent = item.id === session.presetId;
          return (
            <button
              key={item.id} type="button" data-testid={`preset-btn-${item.id}`} aria-pressed={isCurrent}
              onClick={() => handleSelectPreset(item.id)}
              className={`${isCurrent ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-center px-3 py-2 text-left`}
            >
              <span className="text-xs font-bold">{isEn ? item.titleEn : item.titleKo}</span>
              <span className="text-[11px] font-normal text-fg-3 tabular-nums">{isEn ? item.episodeLabelEn : item.episodeLabelKo}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-8">
              <TensionCurveGraphSvg
                currentCuts={session.workingCuts} previewCuts={previewProposal ? previewProposal.proposedCuts : null}
                audit={audit} selectedCutNumber={selectedCut.cutNumber} presetId={session.presetId}
                isEn={isEn} onSelectCut={handleSelectCut}
              />
            </div>
            <div className="md:col-span-4">
              <MiniManuscriptRhythmStripSvg
                cuts={activeCuts} baselineCuts={session.baselineCuts} selectedCutNumber={selectedCut.cutNumber}
                isPreviewing={Boolean(previewProposal)} isEn={isEn} onSelectCut={handleSelectCut}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick(`회차 컷 타임라인 (${activeCuts.length}컷)`, `Episode Cut Strip (${activeCuts.length} cuts)`)}</span>
              </div>
              <span className="text-[11px] text-fg-3 tabular-nums">
                {pick(`피크 긴장도: #${activeAudit.peakTensionCutNumber}컷 (${activeAudit.peakTensionScore})`, `Peak: Cut #${activeAudit.peakTensionCutNumber} (${activeAudit.peakTensionScore})`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("컷 선택 목록", "Cut Selector List")}>
              {activeCuts.map((cut) => {
                const status = activeAudit.cutDiagnostics.find((item) => item.cutNumber === cut.cutNumber)?.status ?? "ok";
                const isSelected = cut.cutNumber === selectedCut.cutNumber;
                const statusTone = isSelected
                  ? "border-accent bg-accent-soft text-accent"
                  : status === "critical" ? "border-bad bg-bad-soft text-bad"
                    : status === "warn" ? "border-warn bg-warning-soft text-warn"
                      : "border-line bg-raised text-fg";
                return (
                  <button
                    key={cut.cutId} type="button" data-testid={`cut-select-btn-${cut.cutNumber}`} aria-pressed={isSelected}
                    onClick={() => handleSelectCut(cut.cutNumber)} className={`${BTN_BASE} border px-2.5 py-1.5 tabular-nums ${statusTone}`}
                  >
                    <span>#{cut.cutNumber}</span>
                    <span className="text-[10px] opacity-80">{cut.tensionScore}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span data-testid="selected-cut-heading" className="tabular-nums">
                    {pick(`#${selectedCut.cutNumber}컷 · ${selectedCut.sceneLabelKo}`, `Cut #${selectedCut.cutNumber} · ${selectedCut.sceneLabelEn}`)}
                  </span>
                </div>
                <p className="text-[11px] text-fg-3 [word-break:keep-all]">
                  {isEn ? BEAT_ROLE_LABELS[selectedCut.beatRole].en : BEAT_ROLE_LABELS[selectedCut.beatRole].ko} · {isEn ? getShotScaleMeta(selectedCut.shotScale).labelEn : getShotScaleMeta(selectedCut.shotScale).labelKo}
                </p>
              </div>
              <span data-testid="selected-cut-status-badge" className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${severityBadgeClass(selectedDiag?.status ?? "ok")}`}>
                {selectedDiag?.status === "critical" ? pick("즉시 보정 권장", "Critical") : selectedDiag?.status === "warn" ? pick("호흡 주의", "Notice") : pick("호흡 안정", "Balanced")}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-medium text-fg-2">
                  <label htmlFor={`${uid}-gutter`}>{pick("직전 세로 여백", "Pre-Cut Gutter")}</label>
                  <span data-testid="selected-cut-gutter-value" className="font-mono font-bold text-fg tabular-nums">{selectedCut.gutterPx}px</span>
                </div>
                <input id={`${uid}-gutter`} data-testid="cut-gutter-slider" type="range" min={MIN_GUTTER_PX} max={MAX_GUTTER_PX} step={5} value={selectedCut.gutterPx} onChange={(e) => handleUpdateSelectedCut({ gutterPx: Number(e.target.value) })} className="w-full accent-accent" />
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-medium text-fg-2">
                  <label htmlFor={`${uid}-tension`}>{pick("컷 긴장도", "Tension Score")}</label>
                  <span data-testid="selected-cut-tension-value" className="font-mono font-bold text-fg tabular-nums">{selectedCut.tensionScore} / 100</span>
                </div>
                <input id={`${uid}-tension`} data-testid="cut-tension-slider" type="range" min={MIN_TENSION_SCORE} max={MAX_TENSION_SCORE} step={1} value={selectedCut.tensionScore} onChange={(e) => handleUpdateSelectedCut({ tensionScore: Number(e.target.value) })} className="w-full accent-accent" />
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-medium text-fg-2">
                  <label htmlFor={`${uid}-height`}>{pick("컷 세로 높이", "Panel Height")}</label>
                  <span data-testid="selected-cut-height-value" className="font-mono font-bold text-fg tabular-nums">{selectedCut.panelHeightPx}px</span>
                </div>
                <input id={`${uid}-height`} data-testid="cut-height-slider" type="range" min={MIN_PANEL_HEIGHT_PX} max={MAX_PANEL_HEIGHT_PX} step={20} value={selectedCut.panelHeightPx} onChange={(e) => handleUpdateSelectedCut({ panelHeightPx: Number(e.target.value) })} className="w-full accent-accent" />
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-medium text-fg-2">
                  <label htmlFor={`${uid}-dialogue`}>{pick("대사 글자 수", "Dialogue Chars")}</label>
                  <span data-testid="selected-cut-dialogue-value" className="font-mono font-bold text-fg tabular-nums">{selectedCut.dialogueChars}{pick("자", " ch")}</span>
                </div>
                <input id={`${uid}-dialogue`} data-testid="cut-dialogue-slider" type="range" min={MIN_DIALOGUE_CHARS} max={MAX_DIALOGUE_CHARS} step={2} value={selectedCut.dialogueChars} onChange={(e) => handleUpdateSelectedCut({ dialogueChars: Number(e.target.value) })} className="w-full accent-accent" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{pick("카메라 샷 스케일", "Shot Scale")}</div>
              <div className="flex flex-wrap gap-1.5">
                {SHOT_SCALE_OPTIONS.map((option) => {
                  const active = selectedCut.shotScale === option.id;
                  return (
                    <button key={option.id} type="button" data-testid={`shot-scale-btn-${option.id}`} aria-pressed={active} onClick={() => handleUpdateSelectedCut({ shotScale: option.id as ScrollShotScale })} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                      <span>{isEn ? option.labelEn : option.labelKo}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("호흡 정체 · 이탈 구간 진단", "Pacing Stall & Drop-off Audit")}</h3>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{pick(`평균 여백 ${activeAudit.averageGutterPx}px`, `Avg gutter ${activeAudit.averageGutterPx}px`)}</span>
            </div>
            {activeAudit.issues.length === 0 ? (
              <div data-testid="audit-clean-banner" className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs text-good [word-break:keep-all]">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{pick("호흡 정체나 여백 부족 경고 없이 매끄러운 스크롤 곡선입니다.", "Smooth scroll pacing with zero stall or gutter warnings.")}</span>
              </div>
            ) : (
              <ul data-testid="audit-issues-list" className="space-y-1.5">
                {activeAudit.issues.map((issue) => (
                  <li key={issue.id} data-issue-code={issue.code} className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${severityBadgeClass(issue.severity)}`}>
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{isEn ? issue.titleEn : issue.titleKo}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] opacity-90 tabular-nums">{isEn ? issue.detailEn : issue.detailKo}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("비파괴 Top-3 컷 호흡 연출 개선안", "Non-Destructive Top-3 Pacing Proposals")}</h3>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="revert-last-btn" disabled={session.undoStack.length === 0} onClick={handleRevertLast} className={BTN_OUTLINE}>
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("직전 원복", "Undo")}</span>
                </button>
                <button type="button" data-testid="revert-all-btn" disabled={session.revision === 0 && session.appliedStrategyIds.length === 0} onClick={handleRevertAll} className={BTN_OUTLINE}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("원본 복구", "Reset")}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {proposals.map((proposal) => {
                const isPreviewing = session.previewProposalId === proposal.id;
                const isApplied = session.appliedStrategyIds.includes(proposal.strategyId);
                const changes = isEn ? proposal.changesEn : proposal.changesKo;
                return (
                  <article
                    key={proposal.id} data-testid={`proposal-card-${proposal.rank}`} data-strategy={proposal.strategyId}
                    className={`space-y-2 rounded-xl border p-3 ${isApplied ? "border-good bg-good-soft" : isPreviewing ? "border-accent bg-accent-soft" : "border-line bg-raised"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                          <span className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-accent">#{proposal.rank}</span>
                          <span>{isEn ? proposal.titleEn : proposal.titleKo}</span>
                        </div>
                        <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? proposal.summaryEn : proposal.summaryKo}</p>
                      </div>
                      <div className="rounded-lg bg-card px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                        <span className="text-fg-3">{audit.immersionScore} → </span>
                        <span className={scoreToneClass(proposal.projectedAudit.immersionScore)}>{proposal.projectedAudit.immersionScore}</span>
                        <span className="ml-1 text-good">({proposal.scoreGain >= 0 ? "+" : ""}{proposal.scoreGain})</span>
                      </div>
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
                      {changes.map((line, idx) => <li key={idx}>· {line}</li>)}
                    </ul>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" data-testid={`proposal-preview-btn-${proposal.rank}`} aria-pressed={isPreviewing} onClick={() => handleTogglePreview(proposal)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isPreviewing ? pick("미리보기 끄기", "Stop Preview") : pick("곡선 미리보기", "Preview Curve")}</span>
                      </button>
                      <button type="button" data-testid={`proposal-apply-btn-${proposal.rank}`} onClick={() => handleApplyProposal(proposal)} className={BTN_SOLID}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isApplied ? pick("예제 다시 선택", "Select Example Again") : pick("메모리 예제 선택", "Select Example")}</span>
                      </button>
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
                <span>{pick("연출 이력 · 리듬 시트 내보내기", "Revision Log & Rhythm Sheet Export")}</span>
              </div>
              <span data-testid="pacing-revision-counter" className="font-mono text-[11px] text-fg-3 tabular-nums">
                r{session.revision} · {session.history.length}
              </span>
            </div>
            <div data-testid="pacing-history-list" className="max-h-24 space-y-1 overflow-y-auto rounded-lg bg-raised px-3 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
              {session.history.length === 0 ? (
                <p className="text-fg-3">{pick("아직 반영된 호흡 수정이 없습니다. 곡선을 미리본 뒤 적용하세요.", "No pacing edits yet. Preview a proposal before applying.")}</p>
              ) : (
                session.history.map((entry) => (
                  <div key={entry.entryId} className="tabular-nums">[r{entry.revision}] {isEn ? entry.summaryEn : entry.summaryKo}</div>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="export-markdown-btn" onClick={() => handleExport("markdown")} className={BTN_OUTLINE}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("Markdown 내보내기", "Export Markdown")}</span>
              </button>
              <button type="button" data-testid="export-json-btn" onClick={() => handleExport("json")} className={BTN_OUTLINE}>
                <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("JSON 내보내기", "Export JSON")}</span>
              </button>
              <button type="button" data-testid="toggle-export-preview-btn" onClick={() => setExportPreview((prev) => (prev === "hidden" ? "markdown" : "hidden"))} className={BTN_OUTLINE}>
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{exportPreview === "hidden" ? pick("시트 보기", "Show Sheet") : pick("시트 닫기", "Hide Sheet")}</span>
              </button>
            </div>
            {exportPreview !== "hidden" && (
              <pre data-testid="pacing-export-preview" data-format={exportPreview} className="max-h-48 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
                {exportPreview === "markdown" ? markdownSheet : jsonSheet}
              </pre>
            )}
          </div>
        </div>
      </div>

      </fieldset>
      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="scroll-pacing-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusMessage}
        </div>
      )}
    </section>
  );
}
