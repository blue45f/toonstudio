/**
 * Wave 54A — 상위 5% 핫스팟 Rust WASM 점진 전환 · 0-diff 동치 증명 스튜디오 패널.
 *
 * - 6종 상위 5% 핫스팟 카드(KM16 · 종이 요철 · 희소 타일 12종 · VRM 4-본 · 모턴 BVH · MLS 퍼펫 워프)
 * - Scan → Record → Port → Verify → Enable 5단계 상태 머신 스텝퍼 및 원클릭 검증·롤백
 * - 의도적 오차 주입 토글(Fail-Closed 차단 실시간 체감)
 * - 순수 시맨틱 SVG 파레토 5% 병목 집중도 & 0-diff 동치 검증 게이지(oklch/currentColor 전용, 바이올렛 휴 0%)
 * - 골든 I/O 픽스처 검증표 및 JSON/Markdown 증명 영수증 내보내기
 */

import {
  AlertTriangle, Bug, CheckCircle2, ClipboardCopy, Cpu, Eye, FileJson,
  FileText, Gauge, Play, RotateCcw, ShieldAlert, ShieldCheck, Undo2,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  PORTER_PIPELINE_STAGES, TOP_5PCT_HOTSPOT_TARGETS,
  createInitialHotspotSession, enableRustHotspotKernel, exportHotspotParityMarkdown,
  exportHotspotParityReportJson, getHotspotTarget, rollbackToTsReference,
  runFullVerifiedPortFlow, runPortStep, runRecordStep, runScanStep, runVerifyStep,
  summarizeParetoConcentration,
  type FixtureCategory, type HotspotParityProofReceipt, type HotspotPorterSession,
  type HotspotTargetId, type KernelRoutingMode, type ParetoConcentrationSummary,
  type ParityGateDecision, type PorterPipelineStage,
} from "./rust-hotspot-porter-engine";

export interface HotspotGateChangeEvent {
  readonly hotspotId: HotspotTargetId;
  readonly stage: PorterPipelineStage;
  readonly routingMode: KernelRoutingMode;
  readonly gateDecision: ParityGateDecision;
  readonly mismatchCount: number;
  readonly maxAbsErr: number;
}

export interface StudioRustHotspotPorterPanelProps {
  readonly initialHotspotId?: HotspotTargetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onGateChange?: (event: HotspotGateChangeEvent) => void;
  readonly onExportJson?: (json: string, receipt: HotspotParityProofReceipt) => void;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(블루프린트 215°, 동치통과 155°, 대기/참조 72°, 차단 25°, 파레토 190°)
const SVG_INK_HOTSPOT = "oklch(0.56 0.12 215)";
const SVG_INK_VERIFIED = "oklch(0.55 0.14 155)";
const SVG_INK_STAGE = "oklch(0.67 0.14 72)";
const SVG_INK_BLOCKED = "oklch(0.57 0.21 25)";
const SVG_INK_PARETO = "oklch(0.55 0.11 190)";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const BTN_DANGER = `${BTN_BASE} border border-bad bg-bad-soft px-3 py-2 text-bad hover:bg-raised`;
const BTN_GOOD = `${BTN_BASE} border border-good bg-good-soft px-3 py-2 text-good hover:bg-raised`;

const STAGE_ORDER: Record<PorterPipelineStage, number> = { scan: 1, record: 2, port: 3, verify: 4, enable: 5 };

function createSessionMap(): Record<HotspotTargetId, HotspotPorterSession> {
  return {
    "km16-pigment-mix": createInitialHotspotSession("km16-pigment-mix"),
    "tactile-bristle-stamp": createInitialHotspotSession("tactile-bristle-stamp"),
    "tile-blend-composite": createInitialHotspotSession("tile-blend-composite"),
    "vrm-4bone-skinning": createInitialHotspotSession("vrm-4bone-skinning"),
    "morton-bvh-cull": createInitialHotspotSession("morton-bvh-cull"),
    "mls-puppet-warp": createInitialHotspotSession("mls-puppet-warp"),
  };
}

function formatErr(val: number): string {
  if (val === 0) return "0";
  if (val >= 0.001) return val.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
  return val.toExponential(1);
}

function categoryBadgeText(cat: FixtureCategory, isEn: boolean): string {
  switch (cat) {
    case "nominal": return isEn ? "Nominal" : "표준";
    case "zero": return isEn ? "Zero (0)" : "경계 0";
    case "one": return isEn ? "One (1)" : "경계 1";
    case "negative": return isEn ? "Negative" : "음수 방어";
    case "nan-guard": return "NaN";
    case "inf-guard": return "±Inf";
    case "boundary-edge": return isEn ? "Edge" : "특이 엣지";
  }
}

function gateToneClass(decision: ParityGateDecision): string {
  if (decision === "approved") return "border-good bg-good-soft text-good";
  if (decision === "blocked-fail-closed") return "border-bad bg-bad-soft text-bad";
  if (decision === "rolled-back") return "border-warn bg-warning-soft text-warn";
  return "border-line bg-card text-fg";
}

function ParetoAndParityGaugeSvg(props: {
  readonly session: HotspotPorterSession; readonly pareto: ParetoConcentrationSummary; readonly isEn: boolean;
}): ReactElement {
  const { session, pareto, isEn } = props;
  const sortedHotspots = [...TOP_5PCT_HOTSPOT_TARGETS].sort((a, b) => a.paretoRank - b.paretoRank);
  const v = session.verification;
  const isEnabled = session.routingMode === "rust-wasm-enabled";
  const isBlocked = session.gateDecision === "blocked-fail-closed";
  const gaugeInk = isBlocked ? SVG_INK_BLOCKED : v?.parityPassed ? SVG_INK_VERIFIED : SVG_INK_STAGE;
  const routeInk = isEnabled ? SVG_INK_VERIFIED : isBlocked ? SVG_INK_BLOCKED : SVG_INK_STAGE;

  const [chartLeft, chartTop, chartHeight, barWidth, barGap, maxBarPct] = [28, 44, 104, 68, 18, 26];
  const barMeta = sortedHotspots.map((item, idx) => {
    const runningPct = sortedHotspots
      .slice(0, idx + 1)
      .reduce((acc, entry) => acc + entry.frameTimeWeightPct, 0);
    const x = chartLeft + idx * (barWidth + barGap);
    const barH = Math.round(((item.frameTimeWeightPct / maxBarPct) * chartHeight) * 10) / 10;
    const y = chartTop + chartHeight - barH;
    const cx = x + barWidth / 2;
    const cy = Math.round((chartTop + chartHeight - (Math.min(100, runningPct) / 100) * chartHeight) * 10) / 10;
    return { item, x, y, barH, cx, cy };
  });

  const coldX = chartLeft + sortedHotspots.length * (barWidth + barGap);
  const coldH = Math.round(((pareto.coldCodeFrameTimeSharePct / maxBarPct) * chartHeight) * 10) / 10;
  const coldY = chartTop + chartHeight - coldH;
  const coldCx = coldX + barWidth / 2;
  const cumPoints = [...barMeta.map((b) => `${b.cx},${b.cy}`), `${coldCx},${chartTop}`];

  const [gaugeX, gaugeY, gaugeW, gaugeH] = [28, 244, 624, 26];
  const tolMarkerX = gaugeX + Math.round(gaugeW * 0.42);
  let errFillW = 0;
  if (v) {
    if (v.maxAbsErr === 0) errFillW = 14;
    else if (v.tolerance === 0) errFillW = v.parityPassed ? 14 : Math.round(gaugeW * 0.88);
    else {
      const ratio = v.maxAbsErr / v.tolerance;
      errFillW = ratio <= 1 ? Math.max(18, Math.round(ratio * gaugeW * 0.42)) : Math.min(gaugeW, Math.round(gaugeW * (0.46 + Math.min(0.52, Math.log10(ratio + 1) * 0.25))));
    }
  }

  return (
    <svg
      data-testid="hotspot-pareto-parity-svg" data-hotspot-id={session.hotspotId} data-stage={session.stage}
      data-routing-mode={session.routingMode} data-gate-decision={session.gateDecision}
      data-mismatch-count={v ? String(v.mismatchCount) : "unverified"}
      viewBox="0 0 680 332" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn ? `Pareto top-5% bottleneck concentration and 0-diff parity gauge for ${session.hotspotId}` : `${session.hotspotId} 파레토 상위 5% 병목 집중도 및 0-diff 동치 검증 게이지`}
    >
      <rect x="10" y="10" width="660" height="176" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="30" fill="currentColor" fillOpacity={0.78} fontSize="11" fontWeight="700">
        {isEn ? "PARETO TOP-5% HOTSPOT CONCENTRATION (4.42% LOC -> 89.0% COMPUTE)" : "파레토 상위 5% 병목 집중도 (상위 4.42% LOC → 89.0% 핫 프레임 연산)"}
      </text>
      <text x="656" y="30" textAnchor="end" fill={SVG_INK_PARETO} fontSize="10" fontWeight="700">
        {isEn ? `COLD CODE ${pareto.coldCodeLocSharePct}% LOC` : `콜드 코드 ${pareto.coldCodeLocSharePct}% 유지`}
      </text>
      <line x1={chartLeft} y1={chartTop + chartHeight} x2={652} y2={chartTop + chartHeight} stroke="currentColor" strokeOpacity={0.22} />

      {barMeta.map(({ item, x, y, barH, cx, cy }) => {
        const isCurrent = item.id === session.hotspotId;
        const fill = isCurrent ? SVG_INK_HOTSPOT : SVG_INK_PARETO;
        return (
          <g key={item.id}>
            <rect x={x} y={y} width={barWidth} height={barH} rx="4" fill={fill} fillOpacity={isCurrent ? 0.88 : 0.34} stroke={fill} strokeWidth={isCurrent ? 2 : 1} />
            <text x={cx} y={y - 5} textAnchor="middle" fill={isCurrent ? SVG_INK_HOTSPOT : "currentColor"} fontSize="9.5" fontWeight="700">{item.frameTimeWeightPct}%</text>
            <text x={cx} y={chartTop + chartHeight + 14} textAnchor="middle" fill="currentColor" fillOpacity={isCurrent ? 0.95 : 0.68} fontSize="8.5" fontWeight={isCurrent ? "700" : "500"}>{item.id.split("-")[0]}</text>
            <text x={cx} y={chartTop + chartHeight + 25} textAnchor="middle" fill="currentColor" fillOpacity={0.55} fontSize="8">{item.codebaseLocSharePct}% LOC</text>
            <circle cx={cx} cy={cy} r={isCurrent ? 4 : 3} fill={isCurrent ? SVG_INK_HOTSPOT : SVG_INK_PARETO} />
          </g>
        );
      })}

      <rect x={coldX} y={coldY} width={barWidth} height={coldH} rx="4" fill={SVG_INK_STAGE} fillOpacity={0.24} stroke={SVG_INK_STAGE} strokeWidth="1.2" strokeDasharray="3 2" />
      <text x={coldCx} y={coldY - 5} textAnchor="middle" fill={SVG_INK_STAGE} fontSize="9.5" fontWeight="700">{pareto.coldCodeFrameTimeSharePct}%</text>
      <text x={coldCx} y={chartTop + chartHeight + 14} textAnchor="middle" fill={SVG_INK_STAGE} fontSize="8.5" fontWeight="600">{isEn ? "cold-95%" : "콜드 95%"}</text>
      <text x={coldCx} y={chartTop + chartHeight + 25} textAnchor="middle" fill="currentColor" fillOpacity={0.55} fontSize="8">{pareto.coldCodeLocSharePct}% LOC</text>
      <polyline fill="none" stroke={SVG_INK_PARETO} strokeWidth="1.8" strokeDasharray="4 2" points={cumPoints.join(" ")} />

      <rect x="10" y="196" width="660" height="126" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="216" fill="currentColor" fillOpacity={0.78} fontSize="11" fontWeight="700">
        {isEn ? "0-DIFF PARITY VERIFICATION GAUGE & FAIL-CLOSED GATE" : "0-diff 동치 검증 게이지 및 Fail-Closed 승격 게이트"}
      </text>
      <text x="656" y="216" textAnchor="end" fill={routeInk} fontSize="10" fontWeight="700">
        {isEnabled ? (isEn ? "ROUTE: RUST WASM ACTIVE" : "활성 경로: RUST WASM") : (isEn ? "ROUTE: TS REFERENCE" : "활성 경로: TS 참조 유지")}
      </text>
      <rect x={gaugeX} y={gaugeY} width={gaugeW} height={gaugeH} rx="6" fill="currentColor" fillOpacity={0.08} />
      {v && errFillW > 0 && <rect x={gaugeX} y={gaugeY} width={errFillW} height={gaugeH} rx="5" fill={gaugeInk} fillOpacity={0.86} />}
      <line x1={tolMarkerX} y1={gaugeY - 10} x2={tolMarkerX} y2={gaugeY + gaugeH + 10} stroke={SVG_INK_HOTSPOT} strokeWidth="2" strokeDasharray="3 2" />
      <text x={tolMarkerX + 6} y={gaugeY - 12} fill={SVG_INK_HOTSPOT} fontSize="9" fontWeight="700">
        {isEn ? `Tolerance Limit (${formatErr(session.tolerance)})` : `허용오차 상한 (${formatErr(session.tolerance)})`}
      </text>
      <text x={gaugeX} y={gaugeY + gaugeH + 24} fill={gaugeInk} fontSize="10" fontWeight="700">
        {!v ? (isEn ? "Awaiting Verify step — Fail-Closed gate locked" : "Verify 실행 전 — Fail-Closed 게이트 잠금")
          : v.parityPassed ? (isEn ? `PASS: 0 mismatches · maxAbsErr ${formatErr(v.maxAbsErr)} · ${v.proofDigest}` : `통과: 불일치 0건 · maxAbsErr ${formatErr(v.maxAbsErr)} · ${v.proofDigest}`)
            : (isEn ? `BLOCKED: ${v.mismatchCount} mismatches · maxAbsErr ${formatErr(v.maxAbsErr)} > tol` : `차단: 불일치 ${v.mismatchCount}건 · maxAbsErr ${formatErr(v.maxAbsErr)} > 허용오차`)}
      </text>
    </svg>
  );
}

/** 상위 5% 핫스팟 Rust WASM 점진 전환 · 0-diff 동치 증명 스튜디오 패널. */
export function StudioRustHotspotPorterPanel(props: StudioRustHotspotPorterPanelProps): ReactElement {
  const { initialHotspotId = "km16-pigment-mix", locale = "ko", className, onGateChange, onExportJson } = props;
  const headingId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [selectedId, setSelectedId] = useState<HotspotTargetId>(initialHotspotId);
  const [sessions, setSessions] = useState<Record<HotspotTargetId, HotspotPorterSession>>(createSessionMap);
  const [previewMode, setPreviewMode] = useState<"none" | "json" | "markdown">("none");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const copyRequest = useRef(0);

  const paretoSummary = useMemo(() => summarizeParetoConcentration(TOP_5PCT_HOTSPOT_TARGETS), []);
  const session = sessions[selectedId];
  const activeTarget = useMemo(() => getHotspotTarget(selectedId), [selectedId]);
  const { json: receiptJson, receipt } = useMemo(() => exportHotspotParityReportJson(session), [session]);
  const receiptMarkdown = useMemo(() => exportHotspotParityMarkdown(session, locale), [session, locale]);

  const updateActiveSession = (next: HotspotPorterSession, noticeKo: string, noticeEn: string, notifyGate = false): void => {
    copyRequest.current += 1;
    setSessions((prev) => ({ ...prev, [next.hotspotId]: next }));
    setStatusMessage(pick(noticeKo, noticeEn));
    if (notifyGate) {
      onGateChange?.({
        hotspotId: next.hotspotId, stage: next.stage, routingMode: next.routingMode,
        gateDecision: next.gateDecision, mismatchCount: next.verification?.mismatchCount ?? -1, maxAbsErr: next.verification?.maxAbsErr ?? 0,
      });
    }
  };

  const handleSelectHotspot = (hotspotId: HotspotTargetId): void => {
    copyRequest.current += 1;
    const target = getHotspotTarget(hotspotId);
    setSelectedId(hotspotId);
    setStatusMessage(pick(`핫스팟 대상을 '${target.shortLabelKo}'로 전환했다.`, `Switched active hotspot to '${target.shortLabelEn}'.`));
  };

  const handleStageAction = (stageId: PorterPipelineStage): void => {
    if (stageId === "scan") {
      const next = runScanStep(session);
      updateActiveSession(next, `Scan 완료: ${next.scanResult?.summaryKo ?? ""}`, `Scan complete: ${next.scanResult?.summaryEn ?? ""}`);
      return;
    }
    if (stageId === "record") {
      const next = runRecordStep(session);
      updateActiveSession(next, `Record 완료: 골든 I/O ${next.fixtures.length}건을 녹화했다.`, `Record complete: captured ${next.fixtures.length} golden fixtures.`);
      return;
    }
    if (stageId === "port") {
      const next = runPortStep(session);
      updateActiveSession(next, "이식 예제의 후보 모형을 준비했습니다.", "The candidate model is ready for the porting exercise.");
      return;
    }
    if (stageId === "verify") {
      const next = runVerifyStep(session);
      const notify = next.routingMode !== session.routingMode || next.gateDecision !== session.gateDecision;
      updateActiveSession(next, `Verify 완료: ${next.verification?.summaryKo ?? ""}`, `Verify complete: ${next.verification?.summaryEn ?? ""}`, notify);
      return;
    }
    const next = enableRustHotspotKernel(session);
    const ok = next.routingMode === "rust-wasm-enabled";
    updateActiveSession(
      next,
      ok ? "예제에서 후보 모형으로 전환했습니다." : next.blockedReasonKo ?? "검증에 실패해 TS 참조 모형을 유지합니다.",
      ok ? "The exercise switched to the candidate model." : next.blockedReasonEn ?? "Verification failed. The exercise kept the TS reference model.",
      true,
    );
  };

  const handleRunFullFlow = (): void => {
    const next = runFullVerifiedPortFlow(selectedId, {
      injectErrorEnabled: session.injectErrorEnabled, injectedErrorMagnitude: session.injectedErrorMagnitude, tolerance: session.tolerance,
    });
    const ok = next.routingMode === "rust-wasm-enabled";
    updateActiveSession(
      next,
      ok ? "예제의 다섯 단계를 통과해 후보 모형으로 전환했습니다." : next.blockedReasonKo ?? "오차를 발견해 전환을 중단했습니다.",
      ok ? "All five exercise stages passed. The exercise switched to the candidate model." : next.blockedReasonEn ?? "The exercise detected drift and blocked the switch.",
      true,
    );
  };

  const handleRollback = (): void => {
    const next = rollbackToTsReference(session);
    updateActiveSession(next, `즉시 롤백 완료: ${activeTarget.shortLabelKo} 실행 경로를 TS 참조 구현으로 복귀했다.`, `Rolled back ${activeTarget.shortLabelEn} to TS reference immediately.`, true);
  };

  const handleToggleErrorInjection = (): void => {
    const nextInject = !session.injectErrorEnabled;
    let next = runPortStep(session, { injectErrorEnabled: nextInject });
    const autoReverify = STAGE_ORDER[session.stage] >= 4 || session.verification !== null;
    if (autoReverify) next = runVerifyStep(next);
    const notify = next.routingMode !== session.routingMode || next.gateDecision !== session.gateDecision;
    updateActiveSession(
      next,
      nextInject
        ? `의도적 오차(+${next.injectedErrorMagnitude}) 주입을 켰다.${autoReverify ? " 즉시 재검증에서 Fail-Closed 차단이 작동했다." : ""}`
        : `의도적 오차 주입을 껐다.${autoReverify ? " 0-diff 재검증 통과 상태로 복구되었다." : ""}`,
      nextInject
        ? `Enabled intentional +${next.injectedErrorMagnitude} error injection.${autoReverify ? " Auto-reverify triggered Fail-Closed block." : ""}`
        : `Disabled intentional error injection.${autoReverify ? " Auto-reverify restored 0-diff pass." : ""}`,
      notify,
    );
  };

  const handleReset = (): void => {
    updateActiveSession(createInitialHotspotSession(selectedId), `'${activeTarget.shortLabelKo}' 세션을 Scan 초기 상태로 되돌렸다.`, `Reset '${activeTarget.shortLabelEn}' session to Scan stage.`, true);
  };

  const copyReport = async (report: string): Promise<void> => {
    const request = ++copyRequest.current;
    setStatusMessage("");
    const copied = await copyText(report);
    if (request !== copyRequest.current) return;
    setStatusMessage(copied
      ? pick("보고서를 복사했습니다.", "Copied the report.")
      : pick("복사할 수 없습니다. 화면의 보고서를 직접 복사해 주세요.", "Could not copy. Copy the displayed report manually."));
  };

  const handleExportJson = (): void => {
    setPreviewMode("json");
    onExportJson?.(receiptJson, receipt);
    void copyReport(receiptJson);
  };

  const handleExportMarkdown = (): void => {
    setPreviewMode("markdown");
    void copyReport(receiptMarkdown);
  };

  const currentStageOrder = STAGE_ORDER[session.stage];

  return (
    <section aria-labelledby={headingId} data-testid="studio-rust-hotspot-porter-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold text-fg [word-break:keep-all]">
              {pick("Rust WASM 이식과 결과 비교 예제", "Rust WASM Porting and Parity Exercise")}
            </h2>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "후보를 TS로 모의 실행하고 예제 6개의 허용오차 판정과 전환 절차를 연습합니다.",
              "Practice tolerance checks and the switch procedure on six examples using a TypeScript simulation of the candidate.",
            )}
          </p>
        </div>
        <button type="button" data-testid="reset-porter-panel-btn" onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("세션 초기화", "Reset Session")}</span>
        </button>
      </header>

      {/* 6종 상위 5% 핫스팟 카탈로그 카드 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-fg [word-break:keep-all]">{pick("상위 5% 핫스팟 대상 6종 (TOP_5PCT_HOTSPOT_TARGETS)", "Top-5% Hotspot Targets (6 Kernels)")}</span>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {pick(`커널 구축 ${paretoSummary.builtRustKernelCount}종 · 이식 후보 ${paretoSummary.portCandidateCount}종 · 합계 ${paretoSummary.hotspotLocSharePct}% LOC`, `${paretoSummary.builtRustKernelCount} Built · ${paretoSummary.portCandidateCount} Candidates · ${paretoSummary.hotspotLocSharePct}% LOC`)}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TOP_5PCT_HOTSPOT_TARGETS.map((target) => {
            const itemSession = sessions[target.id];
            const isSelected = selectedId === target.id;
            const routeText = itemSession.routingMode === "rust-wasm-enabled" ? pick("Rust 활성", "Rust ON") : itemSession.gateDecision === "blocked-fail-closed" ? pick("차단됨", "Blocked") : pick("TS 참조", "TS Ref");
            const routeBadgeClass = itemSession.routingMode === "rust-wasm-enabled" ? "border-good bg-good-soft text-good" : itemSession.gateDecision === "blocked-fail-closed" ? "border-bad bg-bad-soft text-bad" : "border-line bg-canvas text-fg-2";
            return (
              <button
                key={target.id} type="button" data-testid={`hotspot-card-${target.id}`} aria-pressed={isSelected}
                onClick={() => handleSelectHotspot(target.id)}
                className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-stretch justify-between p-3 text-left`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? target.shortLabelEn : target.shortLabelKo}</span>
                  <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${routeBadgeClass}`}>{routeText}</span>
                </div>
                <div className="mt-1 flex w-full items-center justify-between text-[11px] font-normal text-fg-2 tabular-nums">
                  <span>{pick(`연산 ${target.frameTimeWeightPct}%`, `Weight ${target.frameTimeWeightPct}%`)} · {target.codebaseLocSharePct}% LOC</span>
                  <span className="font-mono text-[10px] text-fg-3">tol {formatErr(target.defaultTolerance)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5단계 파이프라인 스텝퍼 + 의도적 오차 주입 테스트 + Enable/롤백 */}
      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("5단계 점진 포팅 파이프라인 (Scan → Record → Port → Verify → Enable)", "5-Stage Incremental Porting Pipeline")}</div>
          <button
            type="button" role="switch" aria-checked={session.injectErrorEnabled} data-testid="toggle-error-injection"
            onClick={handleToggleErrorInjection} className={session.injectErrorEnabled ? BTN_DANGER : BTN_OUTLINE}
          >
            <Bug className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick(`의도적 오차 주입 (+${session.injectedErrorMagnitude})`, `Inject Error (+${session.injectedErrorMagnitude})`)}</span>
            <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] tabular-nums">{session.injectErrorEnabled ? "ON" : "OFF"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {PORTER_PIPELINE_STAGES.map((stage) => {
            const isCurrent = session.stage === stage.id;
            const isBlockedStep = stage.id === "enable" && session.gateDecision === "blocked-fail-closed";
            const styleClass = isBlockedStep ? BTN_DANGER : isCurrent ? BTN_ACTIVE : currentStageOrder > stage.order ? BTN_GOOD : BTN_OUTLINE;
            return (
              <button
                key={stage.id} type="button" data-testid={`stage-step-${stage.id}`} aria-current={isCurrent ? "step" : undefined}
                onClick={() => handleStageAction(stage.id)} className={`${styleClass} flex-col items-start justify-start p-2.5 text-left`}
              >
                <span className="text-[11px] font-bold">{isEn ? stage.labelEn : stage.labelKo}</span>
                <span className="text-[10px] font-normal text-fg-2 [word-break:keep-all]">{isEn ? stage.detailEn : stage.detailKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" data-testid="run-full-flow-btn" onClick={handleRunFullFlow} className={BTN_SOLID}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("5단계 일괄 검증 · 전환", "Run Full 5-Stage Flow")}</span>
          </button>
          <button type="button" data-testid="run-verify-btn" onClick={() => handleStageAction("verify")} className={BTN_OUTLINE}>
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("Verify 동치 검증", "Verify Parity")}</span>
          </button>
          <button type="button" data-testid="enable-rust-btn" onClick={() => handleStageAction("enable")} className={BTN_GOOD}>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("Enable (Rust 무중단 승격)", "Enable Rust Kernel")}</span>
          </button>
          <button type="button" data-testid="rollback-ts-btn" disabled={session.routingMode !== "rust-wasm-enabled"} onClick={handleRollback} className={BTN_DANGER}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("TS 참조 즉시 롤백", "Rollback to TS")}</span>
          </button>
        </div>
      </div>

      {/* 핵심 4대 검증 지표 카드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("예제 실행 상태", "Exercise Routing State")}</div>
          <div data-testid="active-routing-mode" className="mt-1 font-mono text-xs font-bold text-fg">{session.routingMode}</div>
          <div className="mt-0.5 text-[10px] text-fg-3 [word-break:keep-all]">
            {session.routingMode === "rust-wasm-enabled" ? pick("후보 모형", "Candidate model") : pick("TS 참조 모형", "TS reference model")}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("불일치 건수 (mismatchCount)", "Mismatch Count")}</div>
          <div data-testid="verify-mismatch-count" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {session.verification ? `${session.verification.mismatchCount} / ${session.verification.totalCases}` : pick("미검증", "Unverified")}
          </div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">
            {session.verification ? pick(`통과 ${session.verification.passedCases}건 · 비유한 ${session.verification.nonFiniteOutputCount}건`, `Passed ${session.verification.passedCases} · Non-finite ${session.verification.nonFiniteOutputCount}`) : pick("Record/Verify 후 집계", "Computed after Verify")}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("최대 절대오차 (maxAbsErr)", "Max Abs Error")}</div>
          <div data-testid="verify-max-abs-err" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
            {session.verification ? formatErr(session.verification.maxAbsErr) : "-"}
          </div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">{pick(`허용오차 상한 <= ${formatErr(session.tolerance)}`, `Tolerance <= ${formatErr(session.tolerance)}`)}</div>
        </div>
        <div className={`rounded-xl border p-3 ${gateToneClass(session.gateDecision)}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {session.gateDecision === "blocked-fail-closed" ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("Fail-Closed 게이트 판정", "Fail-Closed Gate")}</span>
          </div>
          <div data-testid="gate-decision-badge" className="mt-1 font-mono text-xs font-bold">{session.gateDecision}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] opacity-85">{session.verification ? session.verification.proofDigest : pick("증명 대기", "pending-proof")}</div>
        </div>
      </div>

      {session.gateDecision === "blocked-fail-closed" && (
        <div role="alert" data-testid="fail-closed-banner" className="flex items-start gap-2 rounded-xl border border-bad bg-bad-soft px-3.5 py-2.5 text-xs text-bad [word-break:keep-all]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{isEn ? session.blockedReasonEn : session.blockedReasonKo}</span>
        </div>
      )}

      {/* 순수 시맨틱 SVG 파레토 5% 병목 집중도 & 0-diff 검증 게이지 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <ParetoAndParityGaugeSvg session={session} pareto={paretoSummary} isEn={isEn} />
        <p data-testid="pareto-disclosure" className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{isEn ? paretoSummary.disclosureEn : paretoSummary.disclosureKo}</p>
      </div>

      {/* 선택 핫스팟 현재 vs 목표 경계 및 골든 I/O 검증표 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? activeTarget.titleEn : activeTarget.titleKo}</div>
            <div className="mt-0.5 font-mono text-[10px] text-fg-3">TS: {activeTarget.tsReferenceModule} → Rust: {activeTarget.rustTargetCrate} ({activeTarget.wasmExportSymbol})</div>
          </div>
          <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] text-fg-2">{activeTarget.rustPortReadiness}</span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 text-[11px] text-fg-2 sm:grid-cols-2 [word-break:keep-all]">
          <div className="rounded-lg bg-raised px-2.5 py-2">{isEn ? activeTarget.currentStateEn : activeTarget.currentStateKo}</div>
          <div className="rounded-lg bg-raised px-2.5 py-2">{isEn ? activeTarget.targetStateEn : activeTarget.targetStateKo}</div>
        </div>

        {session.fixtures.length === 0 ? (
          <div data-testid="fixtures-empty-notice" className="rounded-lg border border-line bg-canvas px-3 py-2.5 text-xs text-fg-2 [word-break:keep-all]">
            {pick("아직 골든 I/O 스냅샷을 녹화하지 않았다. 상단의 '2. Record' 또는 '5단계 일괄 검증'을 눌러 경계값 픽스처를 생성한다.", "No golden I/O fixtures recorded yet. Run '2. Record' or 'Run Full 5-Stage Flow' to capture edge cases.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="golden-fixtures-table" className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[11px] text-fg-3">
                  <th scope="col" className="px-2 py-1.5 font-semibold">{pick("분류", "Category")}</th>
                  <th scope="col" className="px-2 py-1.5 font-semibold">{pick("골든 케이스", "Golden Fixture")}</th>
                  <th scope="col" className="px-2 py-1.5 font-semibold">{pick("TS 참조 출력", "TS Expected")}</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">{pick("절대오차", "absErr")}</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">{pick("판정", "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {session.fixtures.map((fixture, idx) => {
                  const detail = session.verification?.details[idx];
                  return (
                    <tr key={fixture.id} data-testid={`fixture-row-${fixture.category}-${idx}`}>
                      <td className="px-2 py-2"><span className="inline-block rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{categoryBadgeText(fixture.category, isEn)}</span></td>
                      <td className="px-2 py-2 text-fg [word-break:keep-all]">{isEn ? fixture.labelEn : fixture.labelKo}</td>
                      <td className="px-2 py-2 font-mono text-[10px] text-fg-3 tabular-nums">[{fixture.expectedOutput.map((n) => formatErr(n)).join(", ")}]</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px] tabular-nums">{detail ? formatErr(detail.absErr) : "-"}</td>
                      <td className="px-2 py-2 text-right font-mono text-[10px] font-bold">
                        {!detail ? <span className="text-fg-3">{pick("대기", "WAIT")}</span> : detail.passed ? <span className="text-good">PASS</span> : <span className="text-bad">FAIL</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 증명 영수증 JSON / Markdown 내보내기 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <ClipboardCopy className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("0-diff 증명 영수증 내보내기 (JSON · Markdown)", "Parity Proof Receipt Export (JSON · Markdown)")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="export-parity-json-btn" onClick={handleExportJson} className={BTN_SOLID}>
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 영수증 내보내기", "Export JSON")}</span>
            </button>
            <button type="button" data-testid="export-parity-md-btn" onClick={handleExportMarkdown} className={BTN_OUTLINE}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("Markdown 복사", "Copy Markdown")}</span>
            </button>
            <button type="button" data-testid="toggle-receipt-preview-btn" onClick={() => setPreviewMode((prev) => (prev === "none" ? "json" : "none"))} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{previewMode === "none" ? pick("영수증 미리보기", "Preview") : pick("미리보기 닫기", "Hide")}</span>
            </button>
          </div>
        </div>
        {previewMode !== "none" && (
          <pre data-testid="parity-receipt-preview" data-preview-format={previewMode} className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {previewMode === "json" ? receiptJson : receiptMarkdown}
          </pre>
        )}
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="porter-panel-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusMessage}
        </div>
      )}
    </section>
  );
}
