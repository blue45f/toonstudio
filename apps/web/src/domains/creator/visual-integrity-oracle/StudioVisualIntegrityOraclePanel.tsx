/**
 * 렌더링 파이프라인 시각적 무결성 검증 오라클 패널.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건 · 브라우저 Web Storage 미사용 · props 없이 단독 렌더 · KO/EN).
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Grid2x2,
  Layers,
  Play,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import type { BrushQualityFamilyId } from "../drawing/brush-quality-soak-guard";

import {
  evaluate12MediaTextureIntegrityGate,
  evaluateLiveVsCommittedParity,
  type LiveCommittedParityReport,
  type Media12RegressionGateReport,
  type OracleGateStatus,
  type RgbaTileBuffer,
  type VisualFaultScenarioId,
} from "./visual-integrity-oracle-engine";

export interface StudioVisualIntegrityOraclePanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialScenario?: VisualFaultScenarioId;
  readonly initialMediumId?: BrushQualityFamilyId;
  readonly tileSize?: number;
  readonly customLivePreview?: RgbaTileBuffer;
  readonly customCommittedCanvas?: RgbaTileBuffer;
  readonly onAuditComplete?: (report: Media12RegressionGateReport) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const SCENARIOS: readonly {
  readonly id: VisualFaultScenarioId;
  readonly ko: string;
  readonly en: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
}[] = [
  {
    id: "clean-parity",
    ko: "정상 패리티",
    en: "Clean Parity",
    summaryKo: "라이브 프리뷰와 커밋 캔버스가 비트 단위로 일치하는 기준 상태",
    summaryEn: "Bit-exact baseline where live preview matches committed canvas",
  },
  {
    id: "premultiplied-alpha-halo",
    ko: "알파 헤일로 변조",
    en: "Alpha Halo Fault",
    summaryKo: "반투명 경계 이중 프리멀티플라이로 어두운 테두리 아티팩트 주입",
    summaryEn: "Injects double-premultiplied dark fringe along semi-transparent edges",
  },
  {
    id: "color-gamut-shift",
    ko: "색역 ΔE 드리프트",
    en: "Gamut ΔE Shift",
    summaryKo: "sRGB·Display-P3 오매핑에 의한 지각 색차 드리프트 주입",
    summaryEn: "Injects perceptual sRGB/Display-P3 color gamut mismatch",
  },
  {
    id: "texture-grain-blur",
    ko: "매체 질감 블러",
    en: "Grain Blur Fault",
    summaryKo: "3×3 블러로 종이결·브러시 미세 입자 질감 평탄화 주입",
    summaryEn: "Injects 3x3 blur attenuating paper tooth and dry-media grain",
  },
  {
    id: "commit-tile-offset",
    ko: "커밋 2px 어긋남",
    en: "2px Commit Offset",
    summaryKo: "라이브 프리뷰 대비 커밋 캔버스 2px 좌표 시프트 주입",
    summaryEn: "Injects 2px spatial alignment shift between live preview and commit",
  },
];

function statusBadgeClass(status: OracleGateStatus): string {
  if (status === "pass") return "border-good/40 bg-good/15 text-good";
  if (status === "warn") return "border-warn/40 bg-warn/15 text-warn";
  return "border-bad/40 bg-bad/15 text-bad";
}

function statusTextClass(status: OracleGateStatus): string {
  if (status === "pass") return "text-good";
  if (status === "warn") return "text-warn";
  return "text-bad";
}

function formatStatusLabel(status: OracleGateStatus, isEn: boolean): string {
  if (status === "pass") return isEn ? "PASS" : "통과 (PASS)";
  if (status === "warn") return isEn ? "WARN" : "경고 (WARN)";
  return isEn ? "FAIL" : "실패 (FAIL)";
}

function formatPsnr(psnrDb: number, isEn: boolean): string {
  if (!Number.isFinite(psnrDb)) return isEn ? "∞ dB (Lossless)" : "∞ dB (무손실)";
  return `${psnrDb.toFixed(2)} dB`;
}

/** 시각적 무결성 검증 오라클 단독 패널 (SSIM · CIEDE2000 · PSNR · 알파 헤일로 · 12대 매체 패리티). */
export function StudioVisualIntegrityOraclePanel({
  locale,
  className,
  initialScenario = "clean-parity",
  initialMediumId = "crayon",
  tileSize = 32,
  customLivePreview,
  customCommittedCanvas,
  onAuditComplete,
}: StudioVisualIntegrityOraclePanelProps = {}): ReactElement {
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [scenarioId, setScenarioId] = useState<VisualFaultScenarioId>(initialScenario);
  const [selectedMediumId, setSelectedMediumId] = useState<BrushQualityFamilyId>(initialMediumId);
  const [auditRevision, setAuditRevision] = useState<number>(1);

  const baselineReport = useMemo<Media12RegressionGateReport>(() => {
    void auditRevision;
    return evaluate12MediaTextureIntegrityGate({ tileSize, faultScenario: "clean-parity" });
  }, [auditRevision, tileSize]);

  const activeReport = useMemo<Media12RegressionGateReport>(() => {
    void auditRevision;
    if (scenarioId === "clean-parity") return baselineReport;
    return evaluate12MediaTextureIntegrityGate({ tileSize, faultScenario: scenarioId });
  }, [auditRevision, baselineReport, scenarioId, tileSize]);

  const customParity = useMemo<LiveCommittedParityReport | null>(() => {
    if (!customLivePreview || !customCommittedCanvas) return null;
    return evaluateLiveVsCommittedParity({
      livePreview: customLivePreview,
      committedCanvas: customCommittedCanvas,
      mediumId: selectedMediumId,
    });
  }, [customCommittedCanvas, customLivePreview, selectedMediumId]);

  const selectedEntry = useMemo(() => {
    const found = activeReport.mediaResults.find((entry) => entry.familyId === selectedMediumId);
    return found ?? activeReport.mediaResults[0];
  }, [activeReport.mediaResults, selectedMediumId]);

  const baselineEntry = useMemo(() => {
    const found = baselineReport.mediaResults.find((entry) => entry.familyId === selectedMediumId);
    return found ?? baselineReport.mediaResults[0];
  }, [baselineReport.mediaResults, selectedMediumId]);

  const focusedAudit = customParity ?? selectedEntry?.audit ?? null;
  const activeScenarioMeta = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  const handleRunFullAudit = useCallback(() => {
    setAuditRevision((rev) => rev + 1);
    const fresh = evaluate12MediaTextureIntegrityGate({ tileSize, faultScenario: scenarioId });
    onAuditComplete?.(fresh);
  }, [onAuditComplete, scenarioId, tileSize]);

  const overallStatus = customParity ? customParity.status : activeReport.overallStatus;
  const StatusIcon = overallStatus === "pass" ? CheckCircle2 : overallStatus === "warn" ? AlertTriangle : ShieldAlert;

  return (
    <section
      data-testid="visual-integrity-oracle-panel"
      aria-label={pick("시각적 무결성 검증 오라클", "Visual Integrity Verification Oracle")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Eye className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("시각적 무결성 검증 오라클", "Visual Integrity Verification Oracle")}
            </h2>
            <span
              data-testid="visual-oracle-status-badge"
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${statusBadgeClass(overallStatus)}`}
            >
              <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {formatStatusLabel(overallStatus, isEn)}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "실측 RGBA 타일 기반 SSIM · CIEDE2000 ΔE · PSNR · 알파 헤일로 · 12대 매체 커밋 패리티 검증",
              "Real RGBA tile audit for SSIM, CIEDE2000 ΔE, PSNR, premultiplied alpha halo, and 12-media parity",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="visual-oracle-gate-summary"
            className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 tabular-nums"
          >
            {pick(
              `12매체 통과 ${activeReport.passCount} · 경고 ${activeReport.warnCount} · 실패 ${activeReport.failCount}`,
              `12 Media: ${activeReport.passCount} Pass · ${activeReport.warnCount} Warn · ${activeReport.failCount} Fail`,
            )}
          </span>
          <button
            type="button"
            data-testid="visual-oracle-run-audit-btn"
            className={BTN_PRIMARY}
            onClick={handleRunFullAudit}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("전체 감사 실행", "Run Full Audit")}
          </button>
        </div>
      </header>

      <div className="space-y-2 rounded-lg border border-line bg-card p-3" data-testid="visual-oracle-scenario-bar">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-fg">
            {pick("정상 · 변조 시나리오 비교", "Clean vs Fault Scenario Comparison")}
          </span>
          <span className="text-fg-2 tabular-nums">
            {pick(`타일 ${activeReport.tileSize}×${activeReport.tileSize} · 감사 #${auditRevision}`, `Tile ${activeReport.tileSize}×${activeReport.tileSize} · Run #${auditRevision}`)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((item) => {
            const active = scenarioId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                data-testid={`visual-oracle-scenario-${item.id}`}
                onClick={() => setScenarioId(item.id)}
                className={`${CHIP_BASE} ${
                  active ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2 hover:text-fg"
                }`}
              >
                {isEn ? item.en : item.ko}
              </button>
            );
          })}
        </div>
        {activeScenarioMeta ? (
          <p className="text-xs text-fg-2">{isEn ? activeScenarioMeta.summaryEn : activeScenarioMeta.summaryKo}</p>
        ) : null}

        {focusedAudit && baselineEntry ? (
          <div
            data-testid="visual-oracle-baseline-compare"
            className="grid grid-cols-2 gap-2 rounded-md border border-line bg-raised p-2 text-xs tabular-nums sm:grid-cols-4"
          >
            <div>
              <div className="text-fg-3">{pick("기준 vs 현재 SSIM", "Baseline vs Active SSIM")}</div>
              <div className="font-semibold text-fg">
                {baselineEntry.audit.ssim.score.toFixed(4)} →{" "}
                <span className={statusTextClass(focusedAudit.status)}>{focusedAudit.ssim.score.toFixed(4)}</span>
              </div>
            </div>
            <div>
              <div className="text-fg-3">{pick("기준 vs 현재 ΔE00 평균", "Baseline vs Active Mean ΔE00")}</div>
              <div className="font-semibold text-fg">
                {baselineEntry.audit.ciede2000.meanDeltaE.toFixed(2)} → {focusedAudit.ciede2000.meanDeltaE.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-fg-3">{pick("기준 vs 현재 p95 ΔE00", "Baseline vs Active p95 ΔE00")}</div>
              <div className="font-semibold text-fg">
                {baselineEntry.audit.ciede2000.p95DeltaE.toFixed(2)} → {focusedAudit.ciede2000.p95DeltaE.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-fg-3">{pick("알파 헤일로 픽셀", "Alpha Halo Pixels")}</div>
              <div className="font-semibold text-fg">
                {baselineEntry.audit.alphaHalo.haloPixelCount} →{" "}
                <span className={focusedAudit.alphaHalo.detected ? "text-bad" : "text-good"}>
                  {focusedAudit.alphaHalo.haloPixelCount} px
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {focusedAudit ? (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4" data-testid="visual-oracle-metrics-grid">
            <article className="space-y-1.5 rounded-lg border border-line bg-card p-3" data-testid="visual-oracle-ssim-card">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span className="font-semibold text-fg">{pick("① SSIM (구조 유사도)", "1. SSIM (Structural)")}</span>
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              </div>
              <div className="text-lg font-bold text-fg tabular-nums" data-testid="visual-oracle-ssim-value">
                {focusedAudit.ssim.score.toFixed(4)}
              </div>
              <div className="text-[11px] text-fg-2 tabular-nums">
                {`L ${focusedAudit.ssim.luminance.toFixed(3)} · C ${focusedAudit.ssim.contrast.toFixed(3)} · S ${focusedAudit.ssim.structure.toFixed(3)}`}
              </div>
            </article>

            <article className="space-y-1.5 rounded-lg border border-line bg-card p-3" data-testid="visual-oracle-ciede2000-card">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span className="font-semibold text-fg">{pick("② CIEDE2000 ΔE", "2. CIEDE2000 ΔE")}</span>
                <Activity className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
              </div>
              <div className="text-lg font-bold text-fg tabular-nums" data-testid="visual-oracle-deltae-value">
                {focusedAudit.ciede2000.meanDeltaE.toFixed(2)}
              </div>
              <div className="text-[11px] text-fg-2 tabular-nums">
                {`p95 ${focusedAudit.ciede2000.p95DeltaE.toFixed(2)} · max ${focusedAudit.ciede2000.maxDeltaE.toFixed(2)}`}
              </div>
            </article>

            <article className="space-y-1.5 rounded-lg border border-line bg-card p-3" data-testid="visual-oracle-psnr-card">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span className="font-semibold text-fg">{pick("③ PSNR · 픽셀 오차", "3. PSNR & Pixel Error")}</span>
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              </div>
              <div className="text-lg font-bold text-fg tabular-nums" data-testid="visual-oracle-psnr-value">
                {formatPsnr(focusedAudit.psnr.psnrDb, isEn)}
              </div>
              <div className="text-[11px] text-fg-2 tabular-nums">
                {`RMSE ${focusedAudit.psnr.rmse.toFixed(2)} · maxAbs ${focusedAudit.psnr.maxAbsDiff}`}
              </div>
            </article>

            <article className="space-y-1.5 rounded-lg border border-line bg-card p-3" data-testid="visual-oracle-halo-card">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span className="font-semibold text-fg">{pick("④ 프리멀티플라이 헤일로", "4. Premultiplied Halo")}</span>
                <ShieldAlert className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
              </div>
              <div
                className={`text-lg font-bold tabular-nums ${focusedAudit.alphaHalo.detected ? "text-bad" : "text-good"}`}
                data-testid="visual-oracle-halo-value"
              >
                {focusedAudit.alphaHalo.detected
                  ? pick(`탐지 (${focusedAudit.alphaHalo.haloPixelCount}px)`, `Detected (${focusedAudit.alphaHalo.haloPixelCount}px)`)
                  : pick("결함 없음 (0px)", "Clean (0px)")}
              </div>
              <div className="text-[11px] text-fg-2 tabular-nums">
                {pick(
                  `경계 ${focusedAudit.alphaHalo.edgePixelCount}px · 함몰 ${focusedAudit.alphaHalo.maxLuminanceDip.toFixed(1)}`,
                  `Edge ${focusedAudit.alphaHalo.edgePixelCount}px · Dip ${focusedAudit.alphaHalo.maxLuminanceDip.toFixed(1)}`,
                )}
              </div>
            </article>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="visual-oracle-hotspot-card">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-fg">
                  <Grid2x2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick("타일별 오류 핫스팟 좌표 맵", "Tile Error Hotspot Coordinate Map")}</span>
                </div>
                <span className="text-fg-2 tabular-nums">
                  {pick(
                    `질감 보존 ${(focusedAudit.grainRetentionRatio * 100).toFixed(1)}%`,
                    `Grain ${(focusedAudit.grainRetentionRatio * 100).toFixed(1)}%`,
                  )}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
                <svg
                  viewBox={`0 0 ${focusedAudit.tileGridCols * 40} ${focusedAudit.tileGridRows * 40}`}
                  className="h-28 w-28 shrink-0 rounded-md border border-line bg-canvas"
                  role="img"
                  aria-label={pick("타일 오류 핫스팟 공간 그리드", "Spatial tile error hotspot grid")}
                >
                  {focusedAudit.tileHotspots.map((tile) => {
                    const tone =
                      tile.status === "fail" ? "text-bad/55" : tile.status === "warn" ? "text-warn/45" : "text-good/25";
                    return (
                      <g key={`${tile.tileX}-${tile.tileY}`}>
                        <rect
                          x={tile.tileX * 40 + 2}
                          y={tile.tileY * 40 + 2}
                          width={36}
                          height={36}
                          rx={4}
                          fill="currentColor"
                          className={tone}
                        />
                        <text
                          x={tile.tileX * 40 + 20}
                          y={tile.tileY * 40 + 23}
                          textAnchor="middle"
                          fontSize={10}
                          fill="currentColor"
                          className="text-fg"
                        >
                          {`${tile.tileX},${tile.tileY}`}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div className="space-y-1.5 text-xs">
                  {focusedAudit.flaggedHotspots.length === 0 ? (
                    <p className="rounded-md border border-good/40 bg-good/10 p-2 text-good" data-testid="visual-oracle-hotspots-empty">
                      {pick("전 타일 영역 패리티 통과 — 오류 핫스팟이 없습니다.", "All tiles passed parity — no error hotspots.")}
                    </p>
                  ) : (
                    <ul className="space-y-1" data-testid="visual-oracle-hotspots-list">
                      {focusedAudit.flaggedHotspots.slice(0, 4).map((tile) => (
                        <li
                          key={`hot-${tile.tileX}-${tile.tileY}`}
                          className="flex flex-wrap items-center justify-between gap-1 rounded-md border border-line bg-raised px-2 py-1 tabular-nums"
                        >
                          <span className="font-semibold text-fg">
                            {`Tile(${tile.tileX},${tile.tileY}) @ (${tile.peakErrorPixel.x},${tile.peakErrorPixel.y})`}
                          </span>
                          <span className={statusTextClass(tile.status)}>
                            {`SSIM ${tile.ssim.toFixed(3)} · ΔE ${tile.meanDeltaE.toFixed(1)} · abs ${tile.maxAbsDiff}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {focusedAudit.reasons.length > 0 ? (
                    <ul className="space-y-1 pt-1 text-[11px] text-fg-2">
                      {focusedAudit.reasons.slice(0, 3).map((reason) => (
                        <li key={`${reason.metric}-${reason.severity}`}>
                          {`· ${isEn ? reason.messageEn : reason.messageKo}`}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="visual-oracle-media12-card">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-fg">
                  {pick("⑤ 12대 매체 텍스처 무결성 회귀 게이트", "5. 12-Media Texture Integrity Regression Gate")}
                </span>
                <span className="text-fg-2 tabular-nums">
                  {`${activeReport.elapsedMs.toFixed(1)} ms`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-testid="visual-oracle-media12-grid">
                {activeReport.mediaResults.map((entry) => {
                  const selected = entry.familyId === selectedMediumId;
                  return (
                    <button
                      key={entry.familyId}
                      type="button"
                      aria-pressed={selected}
                      data-testid={`visual-oracle-medium-${entry.familyId}`}
                      onClick={() => setSelectedMediumId(entry.familyId)}
                      className={`flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                        selected ? "border-accent bg-accent/10" : "border-line bg-raised hover:border-line-strong"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-1">
                        <span className="truncate font-semibold text-fg">{isEn ? entry.labelEn : entry.labelKo}</span>
                        <span className={`text-[10px] font-bold uppercase ${statusTextClass(entry.status)}`}>
                          {entry.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-fg-2 tabular-nums">
                        {`SSIM ${entry.audit.ssim.score.toFixed(3)} · ΔE ${entry.audit.ciede2000.meanDeltaE.toFixed(1)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
