import {
  CheckCircle2,
  Layers,
  Mic,
  RefreshCw,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import {
  canApproveAfterAdReview,
  formatOklchCss,
  type AdRedlineReviewSession,
  type AdRegulationQaInput,
  type AdRegulationQaReport,
  type CompareViewMode,
  type QaSeverity,
} from "./ad-regulation-qa-engine";
import type {
  CutSlicePacket,
  MasterEpisodeStitchResult,
  PartitionStrategy,
} from "./cut-slice-partition-stitch";
import {
  PIPELINE_STAGE_DEFINITIONS,
  type DelayRippleReport,
  type MultiEpisodePipelineMatrix,
  type PipelineBottleneckReport,
  type ReassignmentRecommendation,
} from "./multi-episode-pipeline-scheduler";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

function severityTone(severity: QaSeverity): "good" | "warn" | "bad" {
  if (severity === "pass") return "good";
  if (severity === "warn") return "warn";
  return "bad";
}

function sliceStatusTone(status: CutSlicePacket["status"]): "good" | "warn" | "bad" | "accent" {
  if (status === "approved") return "good";
  if (status === "retake") return "bad";
  if (status === "submitted") return "accent";
  return "warn";
}

export interface PdControlTowerViewProps {
  readonly partitionStrategy: PartitionStrategy;
  readonly totalEpisodeCuts: number;
  readonly slices: readonly CutSlicePacket[];
  readonly stitchResult: MasterEpisodeStitchResult | null;
  readonly matrix: MultiEpisodePipelineMatrix;
  readonly delayHours: number;
  readonly delayReport: DelayRippleReport | null;
  readonly bottleneckReport: PipelineBottleneckReport;
  readonly onPartition: (strategy: PartitionStrategy) => void;
  readonly onApproveSlice: (sliceId: string) => void;
  readonly onRetakeSlice: (sliceId: string) => void;
  readonly onApproveAllAndStitch: () => void;
  readonly onRunStitch: () => void;
  readonly onSimulateDelay: (hours: number) => void;
  readonly onApplyReassignment: (recommendation: ReassignmentRecommendation) => void;
}

export function PdControlTowerView({
  partitionStrategy,
  totalEpisodeCuts,
  slices,
  stitchResult,
  matrix,
  delayHours,
  delayReport,
  bottleneckReport,
  onPartition,
  onApproveSlice,
  onRetakeSlice,
  onApproveAllAndStitch,
  onRunStitch,
  onSimulateDelay,
  onApplyReassignment,
}: PdControlTowerViewProps) {
  const bt = useBilingual("DivisionOsPdView");
  const approvedCount = slices.filter((slice) => slice.status === "approved").length;
  const impactedKeys = new Set(
    (delayReport?.impactedCells ?? []).map((cell) => `${cell.episodeId}::${cell.stageId}`),
  );

  return (
    <div className="space-y-4" data-testid="divos-panel-pd">
      {/* 1. Cut-Slice 분할 & 무손실 마스터 자동 합본 */}
      <section className="divos-card space-y-3" aria-label={bt("컷 슬라이스 분할과 마스터 합본", "Cut-Slice partition and master stitch")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
              {bt("1화 Cut-Slice 분할 · 무손실 자동 합본", "Episode Cut-Slice Partition & Lossless Stitch")}
            </h3>
            <p className="text-xs text-fg-2 [word-break:keep-all]">
              {bt(
                `총 ${totalEpisodeCuts}컷 · 슬라이스 ${slices.length}개 (승인 ${approvedCount}/${slices.length})`,
                `${totalEpisodeCuts} cuts · ${slices.length} slices (${approvedCount}/${slices.length} approved)`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="divos-action-btn"
              data-variant={partitionStrategy === "by-cut-count" ? "primary" : undefined}
              onClick={() => onPartition("by-cut-count")}
            >
              <Scissors className="size-4" aria-hidden="true" />
              {bt("20컷 균등 분할", "Split by 20 Cuts")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              data-variant={partitionStrategy === "by-scene" ? "primary" : undefined}
              onClick={() => onPartition("by-scene")}
            >
              <Layers className="size-4" aria-hidden="true" />
              {bt("씬 기준 분할", "Split by Scene")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              data-variant="good"
              onClick={onApproveAllAndStitch}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {bt("일괄 승인 후 마스터 합본", "Approve All & Auto-Stitch")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              onClick={onRunStitch}
            >
              {bt("합본 검증", "Verify Stitch")}
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {slices.map((slice) => (
            <article key={slice.sliceId} className="rounded-xl border border-line bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="divos-num text-xs font-bold text-fg">{slice.label}</strong>
                <span className="divos-pill" data-tone={sliceStatusTone(slice.status)}>
                  <span className="divos-pill-dot" aria-hidden="true" />
                  {slice.status.toUpperCase()}
                </span>
              </div>
              <p className="divos-num mt-1 text-xs text-fg-2">
                {bt(
                  `씬 ${slice.sceneIds.join(", ")} · ${slice.cuts.length}컷 · Rev.${slice.revision}`,
                  `Scenes ${slice.sceneIds.join(", ")} · ${slice.cuts.length} cuts · Rev.${slice.revision}`,
                )}
              </p>
              <p className="mt-1 text-[11px] text-fg-3">
                {bt("컨텍스트:", "Context:")}{" "}
                {slice.previousCutContext ? `#${slice.previousCutContext.cutIndex}` : bt("없음", "None")}
                {" ← · → "}
                {slice.nextCutContext ? `#${slice.nextCutContext.cutIndex}` : bt("없음", "None")}
              </p>
              {slice.retakeNote ? (
                <p className="mt-1 text-xs text-bad [word-break:keep-all]">{slice.retakeNote}</p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="divos-action-btn"
                  data-variant="good"
                  aria-label={`${slice.label} ${bt("슬라이스 승인", "Approve Slice")}`}
                  onClick={() => onApproveSlice(slice.sliceId)}
                >
                  {bt("슬라이스 승인", "Approve Slice")}
                </button>
                <button
                  type="button"
                  className="divos-action-btn"
                  data-variant="warn"
                  aria-label={`${slice.label} ${bt("리테이크 요청", "Request Retake")}`}
                  onClick={() => onRetakeSlice(slice.sliceId)}
                >
                  {bt("리테이크", "Retake")}
                </button>
              </div>
            </article>
          ))}
        </div>

        {stitchResult ? (
          <div
            data-testid="divos-stitch-result"
            className="rounded-xl border border-line bg-canvas p-3 text-xs"
            role="status"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="divos-pill" data-tone={stitchResult.ok ? "good" : "bad"}>
                <span className="divos-pill-dot" aria-hidden="true" />
                {stitchResult.ok ? bt("무손실 합본 PASS", "LOSSLESS PASS") : bt("합본 차단", "STITCH BLOCKED")}
              </span>
              <span className="divos-num font-semibold text-fg">
                {bt(stitchResult.summaryKo, stitchResult.summaryEn)}
              </span>
            </div>
            {stitchResult.manuscript ? (
              <p className="divos-num mt-1 text-[11px] text-fg-2">
                Checksum: <code>{stitchResult.manuscript.manuscriptChecksum}</code>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 2. 5주 병렬 멀티 에피소드 매트릭스 & 지연 파급 시뮬레이터 */}
      <section className="divos-card space-y-3" aria-label={bt("5주 멀티 에피소드 공정 매트릭스", "5-week multi-episode pipeline matrix")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
              {bt("5주 병렬 멀티 에피소드 매트릭스 (5화 × 9공정)", "5-Week Multi-Episode Matrix (5 Eps × 9 Stages)")}
            </h3>
            <p className="text-xs text-fg-2 [word-break:keep-all]">
              {bt(
                "마감 지연 시간을 주입해 후행 DAG·동일 담당자 자원 경합 파급을 즉시 확인합니다.",
                "Inject stage delay hours to simulate downstream DAG & assignee contention ripple.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="divos-action-btn"
              data-variant={delayHours === 12 ? "warn" : undefined}
              onClick={() => onSimulateDelay(12)}
            >
              {bt("13화 명암 +12h 지연 시뮬레이션", "Simulate Ep.13 Shade +12h")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              data-variant={delayHours === 24 ? "danger" : undefined}
              onClick={() => onSimulateDelay(24)}
            >
              {bt("+24h 심각 지연", "+24h Severe Delay")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              onClick={() => onSimulateDelay(0)}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {bt("지연 초기화", "Reset Delay")}
            </button>
          </div>
        </div>

        {delayReport && delayReport.injectedDelayHours > 0 ? (
          <div data-testid="divos-delay-report" className="rounded-xl border border-line bg-canvas p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="divos-pill"
                data-tone={delayReport.riskLevel === "critical" ? "bad" : delayReport.riskLevel === "watch" ? "warn" : "good"}
              >
                <span className="divos-pill-dot" aria-hidden="true" />
                {delayReport.riskLevel.toUpperCase()}
              </span>
              <span className="divos-num font-semibold text-fg">
                {bt(delayReport.summaryKo, delayReport.summaryEn)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="divos-table-wrap">
          <table className="divos-matrix-table">
            <thead>
              <tr>
                <th scope="col">{bt("회차", "Episode")}</th>
                {PIPELINE_STAGE_DEFINITIONS.map((stage) => (
                  <th key={stage.id} scope="col">{bt(stage.labelKo, stage.labelEn)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.episodes.map((episode) => (
                <tr key={episode.episodeId}>
                  <th scope="row" className="divos-num whitespace-nowrap font-bold text-fg">
                    {bt(`${episode.episodeNumber}화`, `Ep.${episode.episodeNumber}`)}
                  </th>
                  {episode.cells.map((cell) => {
                    const isRippled = impactedKeys.has(`${cell.episodeId}::${cell.stageId}`);
                    return (
                      <td key={`${cell.episodeId}-${cell.stageId}`}>
                        <div
                          className="divos-cell-chip"
                          data-status={cell.status}
                          data-rippled={isRippled ? "true" : "false"}
                        >
                          <span className="truncate font-semibold text-fg">{cell.assigneeName}</span>
                          <span className="text-[11px] text-fg-2">
                            {cell.status === "done"
                              ? bt("완료", "Done")
                              : isRippled
                                ? bt("파급 위험", "Ripple!")
                                : `${cell.remainingHours}h`}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bottleneckReport.recommendations.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-line bg-canvas p-3">
            <h4 className="text-xs font-bold text-fg [word-break:keep-all]">
              {bt("병목 탐지 & 인력 재배정 추천", "Detected Bottlenecks & Reassignment")}
            </h4>
            {bottleneckReport.recommendations.slice(0, 2).map((rec) => (
              <div key={rec.recommendationId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="min-w-0 flex-1 text-fg-2 [word-break:keep-all]">
                  {bt(rec.rationaleKo, rec.rationaleEn)}
                </p>
                <button
                  type="button"
                  className="divos-action-btn"
                  data-variant="primary"
                  onClick={() => onApplyReassignment(rec)}
                >
                  {bt("재배정 적용", "Apply Reassignment")}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export interface AdQaRoomViewProps {
  readonly qaInput: AdRegulationQaInput;
  readonly qaReport: AdRegulationQaReport;
  readonly reviewSession: AdRedlineReviewSession;
  readonly onRunQa: () => void;
  readonly onReplaceNcAsset: () => void;
  readonly onAddRedlinePin: () => void;
  readonly onResolvePin: (pinId: string) => void;
  readonly onSetCompareMode: (mode: CompareViewMode) => void;
  readonly onSetWipePercent: (percent: number) => void;
  readonly onStepBlink: () => void;
}

export function AdQaRoomView({
  qaInput,
  qaReport,
  reviewSession,
  onRunQa,
  onReplaceNcAsset,
  onAddRedlinePin,
  onResolvePin,
  onSetCompareMode,
  onSetWipePercent,
  onStepBlink,
}: AdQaRoomViewProps) {
  const bt = useBilingual("DivisionOsAdView");
  const approvalGate = canApproveAfterAdReview(qaReport, reviewSession);

  return (
    <div className="space-y-4" data-testid="divos-panel-ad">
      <section className="divos-card space-y-3" aria-label={bt("AD 5종 자동 레귤레이션 검수", "AD 5-point automated regulation QA")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
              {bt("AD 5종 자동 레귤레이션 검수", "AD 5-Point Automated Regulation QA")}
            </h3>
            <p className="divos-num text-xs text-fg-2">
              {bt(
                `통과 ${qaReport.passCount} · 경고 ${qaReport.warnCount} · 차단 ${qaReport.failCount}`,
                `Pass ${qaReport.passCount} · Warn ${qaReport.warnCount} · Fail ${qaReport.failCount}`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="divos-action-btn" data-variant="primary" onClick={onRunQa}>
              <Sparkles className="size-4" aria-hidden="true" />
              {bt("AD 5종 검사 실행", "Run 5-Point AD QA")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              data-variant="good"
              disabled={qaReport.blockedRightsAssetIds.length === 0}
              onClick={onReplaceNcAsset}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {bt("NC 브러시를 CC0로 교체", "Swap NC Brush to CC0")}
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {qaReport.checks.map((check) => (
            <article key={check.id} className="rounded-xl border border-line bg-canvas p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs font-bold text-fg [word-break:keep-all]">
                  {bt(check.titleKo, check.titleEn)}
                </strong>
                <span className="divos-pill" data-tone={severityTone(check.severity)}>
                  <span className="divos-pill-dot" aria-hidden="true" />
                  {check.severity.toUpperCase()}
                </span>
              </div>
              <p className="divos-num mt-1 text-xs font-semibold text-fg">{check.metricLabel}</p>
              <p className="mt-1 text-xs text-fg-2 [word-break:keep-all]">{bt(check.detailKo, check.detailEn)}</p>
            </article>
          ))}
        </div>

        {/* 아트바이블 OKLCH 컬러 칩 대조 */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-canvas p-3 text-xs">
          {qaInput.colorChips.map((chip) => (
            <div key={chip.chipId} className="flex items-center gap-2">
              <span
                className="divos-swatch"
                style={{ backgroundColor: formatOklchCss(chip.targetOklch) }}
                aria-hidden="true"
              />
              <span
                className="divos-swatch"
                style={{ backgroundColor: formatOklchCss(chip.sampledOklch) }}
                aria-hidden="true"
              />
              <span className="text-fg-2 [word-break:keep-all]">
                {bt(`${chip.characterNameKo} · ${chip.partLabelKo}`, `${chip.characterNameEn} · ${chip.partLabelEn}`)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 비동기 레드라인 · 음성 핀 · v1↔v2 와이프/블링크 비교 */}
      <section className="divos-card space-y-3" aria-label={bt("비동기 레드라인 및 버전 비교", "Async redline and version compare")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
              {bt(`비동기 레드라인 · 음성 핀 · v1↔v2 비교 (Cut #${reviewSession.activeCutIndex})`, `Async Redline · Voice Pins · v1↔v2 Compare (Cut #${reviewSession.activeCutIndex})`)}
            </h3>
            <p className="divos-num text-xs text-fg-2">
              {bt(
                `스트로크 ${reviewSession.strokes.length}개 · 미해결 블로커 핀 ${approvalGate.openBlockerPins}개`,
                `${reviewSession.strokes.length} strokes · ${approvalGate.openBlockerPins} open blocker pins`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="divos-action-btn"
              data-variant={reviewSession.compare.mode === "wipe" ? "primary" : undefined}
              onClick={() => onSetCompareMode("wipe")}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {bt("와이프 비교", "Wipe Compare")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              data-variant={reviewSession.compare.mode === "blink" ? "primary" : undefined}
              onClick={() => onSetCompareMode("blink")}
            >
              {bt("블링크 비교", "Blink Compare")}
            </button>
            <button type="button" className="divos-action-btn" onClick={onAddRedlinePin}>
              <Mic className="size-4" aria-hidden="true" />
              {bt("레드라인 음성 핀 추가", "Add Voice Pin")}
            </button>
          </div>
        </div>

        <div className="divos-compare-stage" data-testid="divos-compare-stage">
          {reviewSession.compare.mode === "wipe" ? (
            <div
              className="divos-compare-overlay flex items-end p-3"
              style={{ width: `${reviewSession.compare.wipePercent}%` }}
            >
              <span className="divos-pill" data-tone="good">{reviewSession.compare.rightVersionLabel}</span>
            </div>
          ) : (
            <div className="flex h-full items-center justify-between p-3">
              <span className="divos-pill" data-tone={reviewSession.compare.activeBlinkVersion === "v2" ? "good" : "warn"}>
                {reviewSession.compare.activeBlinkVersion === "v2"
                  ? reviewSession.compare.rightVersionLabel
                  : reviewSession.compare.leftVersionLabel}
              </span>
              <button type="button" className="divos-action-btn" onClick={onStepBlink}>
                {bt("v1 ↔ v2 전환", "Flip v1 ↔ v2")}
              </button>
            </div>
          )}
          <div className="pointer-events-none absolute right-3 bottom-3">
            <span className="divos-pill" data-tone="accent">
              {reviewSession.compare.mode === "wipe"
                ? `${reviewSession.compare.wipePercent}%`
                : reviewSession.compare.activeBlinkVersion.toUpperCase()}
            </span>
          </div>
        </div>

        {reviewSession.compare.mode === "wipe" ? (
          <label className="flex items-center gap-3 text-xs text-fg-2">
            <span className="shrink-0 font-semibold">{bt("와이프 위치", "Wipe Split")}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={reviewSession.compare.wipePercent}
              aria-label={bt("v1 v2 와이프 비교 슬라이더", "v1 v2 wipe comparison slider")}
              onChange={(event) => onSetWipePercent(Number(event.target.value))}
              className="min-h-11 w-full accent-accent"
            />
            <span className="divos-num w-10 text-right font-bold text-fg">{reviewSession.compare.wipePercent}%</span>
          </label>
        ) : null}

        <ul className="space-y-2">
          {reviewSession.voicePins.map((pin) => (
            <li key={pin.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3 text-xs">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="divos-pill" data-tone={pin.status === "resolved" ? "good" : "bad"}>
                    {pin.status === "resolved" ? bt("해결됨", "Resolved") : bt("블로커", "Blocker")}
                  </span>
                  <strong className="text-fg">{pin.authorName}</strong>
                  <span className="divos-num text-fg-3">Cut #{pin.cutIndex} · {pin.durationSec}s</span>
                </div>
                <p className="text-fg-2 [word-break:keep-all]">{bt(pin.transcriptKo, pin.transcriptEn)}</p>
              </div>
              {pin.status === "open" ? (
                <button type="button" className="divos-action-btn" data-variant="good" onClick={() => onResolvePin(pin.id)}>
                  {bt("핀 해결 완료", "Resolve Pin")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas p-3 text-xs" data-testid="divos-ad-gate">
          <span className="divos-pill" data-tone={approvalGate.allowed ? "good" : "bad"}>
            <span className="divos-pill-dot" aria-hidden="true" />
            {approvalGate.allowed ? bt("AD 최종 승인 가능", "READY FOR AD APPROVAL") : bt("승인 보류", "APPROVAL LOCKED")}
          </span>
          <span className="divos-num text-fg-2">
            {bt(
              `QA 차단 ${approvalGate.qaFailCount}건 · 미해결 블로커 핀 ${approvalGate.openBlockerPins}건`,
              `${approvalGate.qaFailCount} QA fail(s) · ${approvalGate.openBlockerPins} open blocker pin(s)`,
            )}
          </span>
        </div>
      </section>
    </div>
  );
}

