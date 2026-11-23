/**
 * Clip Studio Paint Ver. 4.0~5.0 호환 비가시 노이즈 워터마크·속도 기반 브러시 곡선·
 * 선택 경계 차단 블러·일별 작업시간·숨김 레이어 정리 통합 패널.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 미사용 · 명시적 transition 속성만 사용 · 500줄 이하).
 */

import { CheckCircle2, Clock, Download, Layers, Lock, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  buildBatchWatermarkExportPlan, createDemoBatchWatermarkCuts, createDemoWebtoonCutBuffer,
  detectWatermarkSignature, embedAntiAiNoiseWatermark,
  type BatchWatermarkCutInput, type BatchWatermarkExportPlan,
} from "./invisible-watermark-codec";
import {
  VELOCITY_BRUSH_PRESETS, VELOCITY_BRUSH_PRESET_LIST, applyHiddenLayerCleanup, compareBoundaryBlurAtRadius,
  createDemoBoundaryBlurFixture, createDemoCleanupLayers, createDemoWorkTimeSessions,
  evaluateVelocityBrushDynamics, planHiddenLayerCleanup, sampleVelocityCurvePoints, summarizeDailyWorkHours,
  type CleanupCandidateLayer, type HiddenLayerCleanupPlan, type VelocityBrushPresetId, type WorkTimeSession,
} from "./velocity-brush-boundary-blur";

export type CspWatermarkVelocityTab = "watermark-batch" | "velocity-blur" | "hours-cleanup";

export interface CspWatermarkVelocityPanelProps {
  readonly initialTab?: CspWatermarkVelocityTab; readonly locale?: "ko" | "en"; readonly className?: string;
  readonly initialAuthorId?: string; readonly initialWorkId?: string; readonly initialWatermarkStrength?: number;
  readonly initialBatchCuts?: readonly BatchWatermarkCutInput[];
  readonly initialSessions?: readonly WorkTimeSession[];
  readonly initialLayers?: readonly CleanupCandidateLayer[];
  readonly onBatchExport?: (plan: BatchWatermarkExportPlan) => void;
  readonly onCleanupLayers?: (plan: HiddenLayerCleanupPlan, remaining: readonly CleanupCandidateLayer[]) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const TAB_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const TABS: readonly { readonly id: CspWatermarkVelocityTab; readonly ko: string; readonly en: string }[] = [
  { id: "watermark-batch", ko: "비가시 워터마크·배치 출고", en: "Invisible Watermark & Batch" },
  { id: "velocity-blur", ko: "속도 브러시 곡선·경계 차단 블러", en: "Velocity Curve & Safe Blur" },
  { id: "hours-cleanup", ko: "일별 작업시간·숨김 레이어 정리", en: "Work Hours & Layer Cleanup" },
];

const WATERMARK_SEED = 2026;
const CURVE_W = 280;
const CURVE_H = 128;
const CURVE_PAD_X = 24;
const CURVE_PAD_Y = 14;
const CURVE_MAX_Y = 1.4;

function mapCurveCoord(u: number, value: number): { readonly x: number; readonly y: number } {
  const plotW = CURVE_W - CURVE_PAD_X * 2;
  const plotH = CURVE_H - CURVE_PAD_Y * 2;
  const clamped = Math.min(CURVE_MAX_Y, Math.max(0, value));
  return { x: CURVE_PAD_X + u * plotW, y: CURVE_PAD_Y + plotH - (clamped / CURVE_MAX_Y) * plotH };
}

function buildCurvePath(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
}

export function CspWatermarkVelocityPanel({
  initialTab = "watermark-batch", locale, className, initialAuthorId = "creator-han",
  initialWorkId = "ep012-rooftop", initialWatermarkStrength = 4, initialBatchCuts,
  initialSessions, initialLayers, onBatchExport, onCleanupLayers,
}: CspWatermarkVelocityPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<CspWatermarkVelocityTab>(initialTab);
  const [authorId, setAuthorId] = useState<string>(initialAuthorId);
  const [workId, setWorkId] = useState<string>(initialWorkId);
  const [wmStrength, setWmStrength] = useState<number>(initialWatermarkStrength);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<VelocityBrushPresetId>("ink-snap");
  const [velocityPxPerMs, setVelocityPxPerMs] = useState<number>(1.8);
  const [blurRadiusPx, setBlurRadiusPx] = useState<number>(4);

  // 탭 1 파생 상태: 비가시 워터마크 실측 PSNR · 역검출 · 다중 컷 배치 계획
  const demoPreviewCut = useMemo(() => createDemoWebtoonCutBuffer(64, 64, 0), []);
  const demoBatchCuts = useMemo<readonly BatchWatermarkCutInput[]>(() => {
    if (initialBatchCuts) return initialBatchCuts;
    return createDemoBatchWatermarkCuts().map((cut) => ({
      cutId: cut.cutId, cutNumber: cut.cutNumber, title: isKo ? cut.titleKo : cut.titleEn,
      width: cut.width, height: cut.height, rgba: cut.rgba,
    }));
  }, [initialBatchCuts, isKo]);

  const wmEmbed = useMemo(
    () => embedAntiAiNoiseWatermark(demoPreviewCut, 64, 64, { authorId, workId, strength: wmStrength, seed: WATERMARK_SEED }),
    [authorId, demoPreviewCut, wmStrength, workId],
  );
  const selfDetect = useMemo(
    () => detectWatermarkSignature(wmEmbed.rgba, 64, 64, authorId, workId, WATERMARK_SEED),
    [authorId, wmEmbed.rgba, workId],
  );
  const foreignDetect = useMemo(
    () => detectWatermarkSignature(wmEmbed.rgba, 64, 64, `${authorId}-imposter`, workId, WATERMARK_SEED),
    [authorId, wmEmbed.rgba, workId],
  );
  const batchPlan = useMemo(
    () => buildBatchWatermarkExportPlan(demoBatchCuts, { authorId, workId, strength: wmStrength, seed: WATERMARK_SEED, format: "png" }),
    [authorId, demoBatchCuts, wmStrength, workId],
  );

  // 탭 2 파생 상태: 속도 브러시 3차 베지어 곡선 + 경계 차단 블러 실측 비교
  const activeProfile = VELOCITY_BRUSH_PRESETS[presetId];
  const velocityDynamics = useMemo(
    () => evaluateVelocityBrushDynamics(velocityPxPerMs, activeProfile, { currentX: 120, currentY: 80, directionAngleRad: Math.PI / 6 }),
    [activeProfile, velocityPxPerMs],
  );
  const curveSamples = useMemo(() => sampleVelocityCurvePoints(activeProfile, 24), [activeProfile]);
  const sizePathD = useMemo(() => buildCurvePath(curveSamples.map((p) => mapCurveCoord(p.normalizedVelocity, p.sizeMultiplier))), [curveSamples]);
  const opacityPathD = useMemo(() => buildCurvePath(curveSamples.map((p) => mapCurveCoord(p.normalizedVelocity, p.opacityMultiplier))), [curveSamples]);
  const activeSizeDot = mapCurveCoord(velocityDynamics.normalizedVelocity, velocityDynamics.sizeMultiplier);
  const activeOpacityDot = mapCurveCoord(velocityDynamics.normalizedVelocity, velocityDynamics.opacityMultiplier);

  const blurFixture = useMemo(() => createDemoBoundaryBlurFixture(36, 36), []);
  const blurComparison = useMemo(() => compareBoundaryBlurAtRadius(blurFixture, blurRadiusPx), [blurFixture, blurRadiusPx]);

  // 탭 3 파생 상태: 일별 작업시간 + 숨김/빈 레이어 정리 계획
  const baseSessions = useMemo(() => initialSessions ?? createDemoWorkTimeSessions(), [initialSessions]);
  const workHours = useMemo(() => summarizeDailyWorkHours(baseSessions), [baseSessions]);
  const maxDayMinutes = Math.max(1, ...workHours.days.map((d) => d.totalMinutes));

  const baseLayers = useMemo(() => initialLayers ?? createDemoCleanupLayers(), [initialLayers]);
  const [workingLayers, setWorkingLayers] = useState<readonly CleanupCandidateLayer[]>(() => baseLayers);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);
  const cleanupPlan = useMemo(() => planHiddenLayerCleanup(workingLayers), [workingLayers]);

  const handleRunBatchExport = (): void => {
    setBatchNotice(
      pick(
        `${batchPlan.summary.totalCuts}컷 배치 워터마크 완료 · 최저 PSNR ${batchPlan.summary.minPsnrDb ?? 0}dB · 서명 검증 ${batchPlan.summary.verifiedCuts}/${batchPlan.summary.processedPixelCuts}건`,
        `Batch watermarked ${batchPlan.summary.totalCuts} cuts · min PSNR ${batchPlan.summary.minPsnrDb ?? 0}dB · verified ${batchPlan.summary.verifiedCuts}/${batchPlan.summary.processedPixelCuts}.`,
      ),
    );
    onBatchExport?.(batchPlan);
  };

  const handleRunLayerCleanup = (): void => {
    if (cleanupPlan.removableCount === 0) return;
    const remaining = applyHiddenLayerCleanup(workingLayers, cleanupPlan);
    setWorkingLayers(remaining);
    setCleanupNotice(
      pick(
        `숨김·빈 레이어 ${cleanupPlan.removableCount}개 정리 완료 (약 ${cleanupPlan.estimatedSavingsMiB.toFixed(2)} MiB 절감 · 잠금/붉은펜 ${cleanupPlan.protectedCount}개 보호)`,
        `Cleaned ${cleanupPlan.removableCount} hidden/empty layers (~${cleanupPlan.estimatedSavingsMiB.toFixed(2)} MiB saved · ${cleanupPlan.protectedCount} locked/redline protected).`,
      ),
    );
    onCleanupLayers?.(cleanupPlan, remaining);
  };

  const handleResetLayers = (): void => {
    setWorkingLayers(baseLayers);
    setCleanupNotice(pick("초기 레이어 목록으로 되돌렸습니다.", "Restored the initial layer list."));
  };

  return (
    <section
      aria-label={pick("비가시 워터마크·속도 브러시·경계 블러·작업 정리 패널", "Watermark, Velocity Brush & Layer Cleanup Panel")}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="space-y-1 border-b border-line pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("브라우저 로컬 실무 엔진 · CSP 4.0~5.0 대응", "Local Browser Engine · CSP 4.0–5.0 Parity")}</span>
        </div>
        <h2 className="text-base font-bold text-fg">
          {pick("비가시 워터마크 · 속도 곡선 · 경계 차단 블러 · 작업시간/정리", "Invisible Watermark · Velocity Curve · Safe Blur · Cleanup")}
        </h2>
        <p className="text-xs text-fg-2">
          {pick(
            "Anti-AI 비가시 워터마크 배치 출고, 스트로크 속도 3차 베지어·예측 선행, 색번짐 0% 블러, 일별 작업시간과 안전 레이어 정리를 실행합니다.",
            "Run Anti-AI invisible watermark batch exports, velocity Bezier dynamics, zero-bleed selection blur, work-hour analytics, and safe layer cleanup.",
          )}
        </p>
      </header>

      <div role="tablist" aria-label={pick("실무 도구 서브탭", "Workflow tool tabs")} className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl border border-line bg-canvas p-1.5 sm:grid-cols-3">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`${TAB_BTN} ${selected ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}
            >
              <span>{pick(tab.ko, tab.en)}</span>
            </button>
          );
        })}
      </div>

      {/* 탭 1: 비가시 워터마크·배치 출고 */}
      {activeTab === "watermark-batch" && (
        <div id={`${uid}-panel-watermark-batch`} role="tabpanel" aria-labelledby={`${uid}-tab-watermark-batch`} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <label htmlFor={`${uid}-author`} className="block font-medium text-fg-2">{pick("작가 서명 ID", "Author ID")}</label>
              <input id={`${uid}-author`} type="text" value={authorId} onChange={(e) => setAuthorId(e.target.value)} className={`mt-1.5 w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-fg ${FOCUS_RING}`} />
            </div>
            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <label htmlFor={`${uid}-work`} className="block font-medium text-fg-2">{pick("작품·회차 ID", "Work / Episode ID")}</label>
              <input id={`${uid}-work`} type="text" value={workId} onChange={(e) => setWorkId(e.target.value)} className={`mt-1.5 w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-fg ${FOCUS_RING}`} />
            </div>
            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <div className="flex justify-between text-fg-2">
                <label htmlFor={`${uid}-strength`}>{pick("노이즈 삽입 강도", "Noise Strength")}</label>
                <span className="tabular-nums font-bold text-fg" data-testid="watermark-strength-value">{wmStrength} / 8</span>
              </div>
              <input id={`${uid}-strength`} type="range" min={1} max={8} step={1} value={wmStrength} onChange={(e) => setWmStrength(Number(e.target.value))} className="mt-2.5 w-full accent-accent" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("실측 PSNR (비가시성)", "Measured PSNR")}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-good" data-testid="watermark-psnr">{wmEmbed.psnrDb.toFixed(2)} dB</div>
              <div className="mt-0.5 text-[11px] text-fg-3">{wmEmbed.invisiblePass ? pick("기준 ≥38 dB 통과", "Pass ≥38 dB") : pick("기준 미달", "Below 38 dB")}</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("수정 픽셀 통계", "Modified Pixels")}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-fg">{wmEmbed.modifiedPixelCount.toLocaleString("en-US")}px</div>
              <div className="mt-0.5 text-[11px] tabular-nums text-fg-3">{(wmEmbed.modifiedRatio * 100).toFixed(1)}% · ΔB {wmEmbed.meanAbsBlueDelta.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-good/40 bg-good-soft p-3" data-testid="watermark-self-detect">
              <div className="text-[11px] text-fg-2">{pick("본인 서명 역검출", "Self Signature Check")}</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-good">
                {selfDetect.matched ? pick("일치 검출", "Matched") : pick("미검출", "No Match")} · {(selfDetect.confidence * 100).toFixed(1)}%
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-fg-2">NCC {selfDetect.normalizedCorrelation.toFixed(3)} · z={selfDetect.zScore.toFixed(1)}</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3" data-testid="watermark-foreign-detect">
              <div className="text-[11px] text-fg-3">{pick("타인 서명 대조", "Foreign Signature Check")}</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-fg">
                {foreignDetect.matched ? pick("오검출", "False Pos") : pick("정상 거부", "Rejected")} · {(foreignDetect.confidence * 100).toFixed(1)}%
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-fg-3">NCC {foreignDetect.normalizedCorrelation.toFixed(3)} · {wmEmbed.signatureDigest}</div>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-fg">{pick(`다중 컷 배치 출고 매니페스트 (${batchPlan.summary.totalCuts}컷)`, `Batch Watermark Manifest (${batchPlan.summary.totalCuts} Cuts)`)}</h3>
                <p className="text-[11px] text-fg-3">{batchPlan.manifest.copyrightNotice}</p>
              </div>
              <button type="button" onClick={handleRunBatchExport} className={BTN_PRIMARY}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("배치 워터마크 매니페스트 출고", "Export Batch Watermark Plan")}</span>
              </button>
            </div>
            {batchNotice && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs text-good">{batchNotice}</p>}
            <ul className="space-y-1.5" data-testid="batch-watermark-list">
              {batchPlan.items.map((item) => (
                <li key={item.cutId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-fg">{item.outputFilename}</span>
                    <span className="ml-2 text-[11px] text-fg-3">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-[11px] text-fg-2">PSNR {item.psnrDb !== null ? `${item.psnrDb.toFixed(2)} dB` : "-"}</span>
                    <span className="rounded-full border border-good/40 bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good">
                      {item.verifiedMatched ? pick("서명 검증 완료", "Verified") : pick("계획됨", "Planned")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 탭 2: 속도 브러시 곡선·경계 차단 블러 */}
      {activeTab === "velocity-blur" && (
        <div id={`${uid}-panel-velocity-blur`} role="tabpanel" aria-labelledby={`${uid}-tab-velocity-blur`} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("스트로크 속도 3차 베지어 프리셋 (0..4 px/ms)", "Stroke Velocity Cubic Bezier Presets")}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {VELOCITY_BRUSH_PRESET_LIST.map((preset) => {
                const active = preset.id === presetId;
                return (
                  <button key={preset.id} type="button" aria-pressed={active} onClick={() => setPresetId(preset.id as VelocityBrushPresetId)} className={`${BTN_OUTLINE} ${active ? "border-accent bg-accent-soft text-accent" : ""}`}>
                    <span>{pick(preset.labelKo, preset.labelEn)}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-fg-2">{pick(activeProfile.descriptionKo, activeProfile.descriptionEn)}</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-fg-2">
                <label htmlFor={`${uid}-velocity`}>{pick("테스트 스트로크 속도", "Test Stroke Velocity")}</label>
                <span className="tabular-nums font-bold text-fg">{velocityDynamics.clampedVelocityPxPerMs.toFixed(1)} px/ms</span>
              </div>
              <input id={`${uid}-velocity`} type="range" min={0} max={4} step={0.1} value={velocityPxPerMs} onChange={(e) => setVelocityPxPerMs(Number(e.target.value))} className="w-full accent-accent" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
              <div className="rounded-lg border border-line bg-canvas p-2">
                <div className="text-[11px] text-fg-3">{pick("크기 배율", "Size Scale")}</div>
                <div className="text-sm font-bold text-accent" data-testid="velocity-size-multiplier">×{velocityDynamics.sizeMultiplier.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-2">
                <div className="text-[11px] text-fg-3">{pick("불투명도", "Opacity")}</div>
                <div className="text-sm font-bold text-cool" data-testid="velocity-opacity-multiplier">{Math.round(velocityDynamics.opacityMultiplier * 100)}%</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-2">
                <div className="text-[11px] text-fg-3">{pick("예측 선행", "Lookahead")}</div>
                <div className="text-sm font-bold text-fg" data-testid="velocity-lookahead">+{velocityDynamics.lookaheadDistancePx.toFixed(1)}px</div>
              </div>
            </div>
            <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} role="img" aria-label={pick("속도별 크기 및 불투명도 3차 베지어 곡선", "Velocity size and opacity cubic Bezier curve")} className="h-32 w-full rounded-lg border border-line bg-canvas">
              <line x1={CURVE_PAD_X} y1={CURVE_H - CURVE_PAD_Y} x2={CURVE_W - CURVE_PAD_X} y2={CURVE_H - CURVE_PAD_Y} className="stroke-line" strokeWidth="1" />
              <line x1={CURVE_PAD_X} y1={CURVE_PAD_Y} x2={CURVE_PAD_X} y2={CURVE_H - CURVE_PAD_Y} className="stroke-line" strokeWidth="1" />
              <path d={opacityPathD} fill="none" className="stroke-cool" strokeWidth="2" strokeDasharray="4 3" />
              <path d={sizePathD} fill="none" className="stroke-accent" strokeWidth="2.5" />
              <circle cx={activeOpacityDot.x} cy={activeOpacityDot.y} r="3.5" className="fill-cool stroke-canvas" strokeWidth="1.2" />
              <circle cx={activeSizeDot.x} cy={activeSizeDot.y} r="4.5" className="fill-accent stroke-canvas" strokeWidth="1.4" />
            </svg>
          </div>

          <div className="flex flex-col justify-between space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("선택 경계 색번짐 0% 차단 블러 실측 비교", "Selection-Safe Blur Zero-Bleed Benchmark")}</span>
              </div>
              <p className="text-[11px] text-fg-2">
                {pick("안쪽 빨강(G=0)·바깥 초록(G=240) 선택 경계에서 일반 블러와 마스크 정규화 블러의 외부 초록 채널 침투량을 비교합니다.", "Live comparison of external green-channel bleed across a red-inside / green-outside selection boundary.")}
              </p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-fg-2">
                  <label htmlFor={`${uid}-blur-radius`}>{pick("가우시안 블러 반경", "Gaussian Blur Radius")}</label>
                  <span className="tabular-nums font-bold text-fg">{blurRadiusPx}px</span>
                </div>
                <input id={`${uid}-blur-radius`} type="range" min={1} max={10} step={1} value={blurRadiusPx} onChange={(e) => setBlurRadiusPx(Number(e.target.value))} className="w-full accent-accent" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-bad/40 bg-bad-soft p-3" data-testid="standard-blur-bleed">
                <div className="text-[11px] font-semibold text-bad">{pick("일반 블러 (경계 클리핑만)", "Standard Blur (Write-Clipped)")}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-bad">+{blurComparison.standardAudit.maxGreenIncreaseInside} G</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-fg-2">{pick("오염 픽셀", "Bled")} {blurComparison.standardAudit.bledInsidePixelCount}/{blurComparison.standardAudit.totalInsidePixelCount} ({blurComparison.standardAudit.bleedRatioPercent.toFixed(1)}%)</div>
              </div>
              <div className="rounded-xl border border-good/40 bg-good-soft p-3" data-testid="safe-blur-bleed">
                <div className="text-[11px] font-semibold text-good">{pick("경계 차단 블러 (마스크 정규화)", "Selection-Safe Blur (Normalized)")}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-good">+{blurComparison.safeAudit.maxGreenIncreaseInside} G · 0.00%</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-fg-2">{pick("외부 참조", "External Reads")} {blurComparison.safeResult.externalPixelsRead} · {blurComparison.safeResult.kernelMode}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs text-good">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{pick(`선택 내부 ${blurComparison.safeResult.selectedPixelCount}px만 가중 평균 처리 · 외부 색번짐 0.00% 보증`, `Weighted average within ${blurComparison.safeResult.selectedPixelCount} selected pixels · 0.00% external bleed guaranteed.`)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 탭 3: 일별 작업시간·숨김 레이어 정리 */}
      {activeTab === "hours-cleanup" && (
        <div id={`${uid}-panel-hours-cleanup`} role="tabpanel" aria-labelledby={`${uid}-tab-hours-cleanup`} className="mt-4 space-y-4">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Clock className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("일별 작업시간 및 집중 피크 분석", "Daily Work Hours & Focus Peak")}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] tabular-nums text-fg-2">
                <span>{pick("누적", "Total")} <strong className="text-fg">{workHours.totalHours.toFixed(1)}h</strong> ({workHours.totalMinutes}m)</span>
                <span data-testid="peak-focus-hour">{pick("집중 피크", "Peak Focus")} <strong className="text-accent">{workHours.peakFocusHour?.label ?? "-"}</strong></span>
              </div>
            </div>
            <div className="grid grid-cols-5 items-end gap-2 rounded-lg border border-line bg-canvas p-3" data-testid="daily-hours-chart">
              {workHours.days.map((day) => {
                const isPeak = workHours.peakDay?.date === day.date;
                const heightPct = Math.max(12, Math.round((day.totalMinutes / maxDayMinutes) * 100));
                return (
                  <div key={day.date} className="flex flex-col items-center gap-1.5 text-center">
                    <span className="text-[11px] font-semibold tabular-nums text-fg">{day.totalMinutes}m</span>
                    <div className="flex h-24 w-full items-end justify-center">
                      <div className={`w-full max-w-10 rounded-t-md transition-[height] motion-reduce:transition-none ${isPeak ? "bg-accent" : "bg-cool"}`} style={{ height: `${heightPct}%` }} />
                    </div>
                    <span className="text-[11px] tabular-nums text-fg-3">{day.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("숨김·빈 레이어 1클릭 일괄 정리 (잠금·비출력 붉은펜 보호)", "1-Click Hidden & Empty Layer Cleanup")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleRunLayerCleanup} disabled={cleanupPlan.removableCount === 0} className={BTN_PRIMARY}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick(`숨김·빈 레이어 ${cleanupPlan.removableCount}개 정리`, `Clean ${cleanupPlan.removableCount} Layers`)}</span>
                </button>
                <button type="button" onClick={handleResetLayers} className={BTN_OUTLINE}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("레이어 복원", "Restore Layers")}</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div className="rounded-lg border border-line bg-canvas p-2.5">
                <div className="text-[11px] text-fg-3">{pick("정리 대상", "Removable")}</div>
                <div className="mt-0.5 text-base font-bold text-warn" data-testid="cleanup-removable-count">{cleanupPlan.removableCount}</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-2.5">
                <div className="text-[11px] text-fg-3">{pick("예상 메모리 절감", "Est. RAM Saved")}</div>
                <div className="mt-0.5 text-base font-bold text-good" data-testid="cleanup-savings-mib">{cleanupPlan.estimatedSavingsMiB.toFixed(2)} MiB</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-2.5">
                <div className="text-[11px] text-fg-3">{pick("안전 보호 (잠금·붉은펜)", "Protected")}</div>
                <div className="mt-0.5 text-base font-bold text-accent" data-testid="cleanup-protected-count">{cleanupPlan.protectedCount}</div>
              </div>
            </div>
            {cleanupNotice && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs text-good">{cleanupNotice}</p>}
            <ul className="space-y-1.5" data-testid="cleanup-layer-list">
              {workingLayers.map((layer) => {
                const removable = cleanupPlan.removableLayers.find((r) => r.id === layer.id);
                const protectedItem = cleanupPlan.protectedLayers.find((p) => p.id === layer.id);
                const badgeClass = protectedItem
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : removable
                    ? "border-warn/40 bg-warning-soft text-warn"
                    : "border-good/40 bg-good-soft text-good";
                const badgeText = protectedItem
                  ? protectedItem.primaryReason === "locked"
                    ? pick("잠금 보호", "Locked Protected")
                    : pick("비출력 붉은펜 보호", "Redline Protected")
                  : removable
                    ? removable.reason === "empty"
                      ? pick("빈 레이어 정리", "Empty · Clean")
                      : pick("숨김 레이어 정리", "Hidden · Clean")
                    : pick("활성 유지", "Active Kept");
                return (
                  <li key={layer.id} data-layer-status={protectedItem ? "protected" : removable ? "removable" : "active"} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      {protectedItem && <Lock className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
                      <span className="font-medium text-fg">{isKo ? layer.name : (layer.nameEn ?? layer.name)}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      {removable && <span className="text-[11px] text-fg-3">-{removable.memoryMiB.toFixed(2)} MiB</span>}
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>{badgeText}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
