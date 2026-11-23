/**
 * 작화·픽셀 자동 검수 스캐너 + 붉은펜 수정 전/후 픽셀 자동 재검수 + 2D↔3D 이질감 진단 패널.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 미사용 · 명시적 transition 속성만 사용 · 500줄 이하).
 */

import { AlertTriangle, CheckCircle2, RotateCcw, ScanSearch, SlidersHorizontal, Sparkles } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  autoSealPinholesAndTrimBleed,
  createDemoCutPixelBuffers,
  scanPinholeAndColorBleed,
  type AutoRedlinePinPayload,
  type AutoSealTrimResult,
} from "./pinhole-bleed-scanner";
import {
  COHESION_DEMO_PRESETS,
  DEFAULT_BG_3D_METRICS,
  DEFAULT_CUT_2D_METRICS,
  applySimulatedFixAtRedlinePin,
  createDemoRedlineReverifyFixture,
  diagnose2d3dVisualCohesion,
  reverifyRedlinePinsByPixelDiff,
  type Bg3dVisualMetrics,
  type CohesionGrade,
  type Cut2dVisualMetrics,
  type DemoRedlineReverifyFixture,
  type RedlinePinTarget,
  type RedlineReverifyVerdict,
} from "./redline-pixel-reverify-and-cohesion";

export type AutoQaScannerTab = "pinhole-bleed" | "redline-reverify" | "cohesion-2d3d";

export interface AutoQaCutBufferInput {
  readonly width: number;
  readonly height: number;
  readonly lineartRgba: Uint8ClampedArray;
  readonly flatRgba: Uint8ClampedArray;
}

export interface AutoQaPixelScannerPanelProps {
  readonly initialTab?: AutoQaScannerTab;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialCut?: AutoQaCutBufferInput;
  readonly initialRedlineFixture?: DemoRedlineReverifyFixture;
  readonly initialCut2dMetrics?: Cut2dVisualMetrics;
  readonly initialBg3dMetrics?: Bg3dVisualMetrics;
  readonly onApplySealedCut?: (result: AutoSealTrimResult) => void;
  readonly onSendRedlinePins?: (pins: readonly AutoRedlinePinPayload[]) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const TAB_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const VERDICT_META: Readonly<Record<RedlineReverifyVerdict, { readonly ko: string; readonly en: string; readonly badge: string }>> = {
  "missed-unchanged": { ko: "수정 누락", en: "Missed", badge: "border-bad/40 bg-bad-soft text-bad" },
  "partial-change": { ko: "부분 수정", en: "Partial", badge: "border-warn/40 bg-warning-soft text-warn" },
  "verified-fixed": { ko: "수정 완료", en: "Verified", badge: "border-good/40 bg-good-soft text-good" },
};

const GRADE_META: Readonly<Record<CohesionGrade, { readonly ko: string; readonly en: string; readonly badge: string; readonly bar: string }>> = {
  harmonious: { ko: "조화 양호", en: "Harmonious", badge: "border-good/40 bg-good-soft text-good", bar: "bg-good" },
  "needs-tuning": { ko: "보정 권장", en: "Needs Tuning", badge: "border-warn/40 bg-warning-soft text-warn", bar: "bg-warn" },
  clashing: { ko: "이질감 주의", en: "Visual Clash", badge: "border-bad/40 bg-bad-soft text-bad", bar: "bg-bad" },
};

const TABS: readonly { readonly id: AutoQaScannerTab; readonly ko: string; readonly en: string }[] = [
  { id: "pinhole-bleed", ko: "미채색 구멍·삐져나옴 스캐너", en: "Pinhole & Bleed Scanner" },
  { id: "redline-reverify", ko: "붉은펜 자동 재검수", en: "Redline Pixel Re-Verify" },
  { id: "cohesion-2d3d", ko: "2D↔3D 이질감 진단", en: "2D↔3D Visual Cohesion" },
];

interface MetricSliderProps {
  readonly id: string;
  readonly label: string;
  readonly valueText: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}

function MetricSlider({ id, label, valueText, min, max, step, value, onChange }: MetricSliderProps): ReactElement {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between text-fg-2">
        <label htmlFor={id}>{label}</label>
        <span className="tabular-nums font-semibold text-fg">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

export function AutoQaPixelScannerPanel({
  initialTab = "pinhole-bleed",
  locale,
  className,
  initialCut,
  initialRedlineFixture,
  initialCut2dMetrics,
  initialBg3dMetrics,
  onApplySealedCut,
  onSendRedlinePins,
}: AutoQaPixelScannerPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const resolvedLocale: "ko" | "en" = locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en");
  const isKo = resolvedLocale === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<AutoQaScannerTab>(initialTab);

  // 탭 1: 미채색 구멍·삐져나옴 스캐너
  const baseCut = useMemo(() => initialCut ?? createDemoCutPixelBuffers(), [initialCut]);
  const [workingFlatRgba, setWorkingFlatRgba] = useState<Uint8ClampedArray>(() => new Uint8ClampedArray(baseCut.flatRgba));
  const [lastSealResult, setLastSealResult] = useState<AutoSealTrimResult | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const initialScan = useMemo(
    () => scanPinholeAndColorBleed(baseCut.lineartRgba, baseCut.flatRgba, baseCut.width, baseCut.height),
    [baseCut],
  );
  const liveScan = useMemo(
    () => scanPinholeAndColorBleed(baseCut.lineartRgba, workingFlatRgba, baseCut.width, baseCut.height),
    [baseCut.height, baseCut.lineartRgba, baseCut.width, workingFlatRgba],
  );

  // 탭 2: 붉은펜 수정 전/후 픽셀 자동 재검수
  const baseRedline = useMemo(() => initialRedlineFixture ?? createDemoRedlineReverifyFixture(), [initialRedlineFixture]);
  const [reverifyAfterRgba, setReverifyAfterRgba] = useState<Uint8ClampedArray>(
    () => new Uint8ClampedArray(baseRedline.afterRgba),
  );
  const reverifyReport = useMemo(
    () => reverifyRedlinePinsByPixelDiff(baseRedline.beforeRgba, reverifyAfterRgba, baseRedline.width, baseRedline.height, baseRedline.pins),
    [baseRedline, reverifyAfterRgba],
  );

  // 탭 3: 2D↔3D 이질감 진단
  const [cut2d, setCut2d] = useState<Cut2dVisualMetrics>(() => initialCut2dMetrics ?? DEFAULT_CUT_2D_METRICS);
  const [bg3d, setBg3d] = useState<Bg3dVisualMetrics>(() => initialBg3dMetrics ?? DEFAULT_BG_3D_METRICS);
  const cohesion = useMemo(() => diagnose2d3dVisualCohesion(cut2d, bg3d), [bg3d, cut2d]);
  const gradeMeta = GRADE_META[cohesion.grade];

  const handleApplyAutoSealTrim = (): void => {
    const result = autoSealPinholesAndTrimBleed(baseCut.lineartRgba, workingFlatRgba, baseCut.width, baseCut.height, liveScan);
    setWorkingFlatRgba(result.rgba);
    setLastSealResult(result);
    setScanNotice(
      pick(
        `구멍 ${result.sealedPinholeCount}건 봉합 · 삐져나옴 ${result.trimmedBleedCount}건 제거 (총 ${result.modifiedPixelCount}px 보정)`,
        `Sealed ${result.sealedPinholeCount} pinholes and trimmed ${result.trimmedBleedCount} bleeds (${result.modifiedPixelCount}px updated).`,
      ),
    );
    onApplySealedCut?.(result);
  };

  const handleResetDemoCut = (): void => {
    setWorkingFlatRgba(new Uint8ClampedArray(baseCut.flatRgba));
    setLastSealResult(null);
    setScanNotice(pick("초기 검수 대상 픽셀 버퍼로 되돌렸습니다.", "Restored the original cut pixel buffer."));
  };

  const handleSimulatePinFix = (pin: RedlinePinTarget): void => {
    setReverifyAfterRgba((prev) => applySimulatedFixAtRedlinePin(prev, baseRedline.width, baseRedline.height, pin));
  };

  const handleApplyRecommendedCohesion = (): void => {
    setBg3d({
      sunAngleDeg: cohesion.recommendedLightingPreset.targetSunAngleDeg,
      linePx: cohesion.recommendedOutlinePx,
      oklchChroma: cohesion.recommendedBgChroma,
    });
  };

  return (
    <section
      aria-label={pick("작화·픽셀 자동 검수 스캐너", "Artwork & Pixel Auto-QA Scanner")}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="space-y-1 border-b border-line pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
          <ScanSearch className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("브라우저 로컬 픽셀 자동 검수", "Local Browser Pixel QA")}</span>
        </div>
        <h2 className="text-base font-bold text-fg">
          {pick("작화·픽셀 자동 검수 및 2D↔3D 조화 진단", "Pixel Auto-QA & 2D↔3D Cohesion")}
        </h2>
        <p className="text-xs text-fg-2">
          {pick(
            "미채색 구멍·선화 삐져나옴 탐지, 붉은펜 수정 전/후 픽셀 차분 검증, 2D↔3D 이질감 진단을 즉시 실행합니다.",
            "Detect unfilled pinholes and color bleeds, re-verify PD redline pins via pixel diff, and diagnose 2D-to-3D cohesion locally.",
          )}
        </p>
      </header>

      <div role="tablist" aria-label={pick("자동 검수 도구 탭", "Auto-QA tool tabs")} className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl border border-line bg-canvas p-1.5 sm:grid-cols-3">
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

      {/* 탭 1: 미채색 구멍·삐져나옴 스캐너 */}
      {activeTab === "pinhole-bleed" && (
        <div id={`${uid}-panel-pinhole-bleed`} role="tabpanel" aria-labelledby={`${uid}-tab-pinhole-bleed`} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] font-medium text-fg-3">{pick("미채색 구멍", "Pinholes")}</div>
              <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-xl font-bold text-fg" data-testid="pinhole-count">{liveScan.pinholes.length}</span>
                <span className="text-xs text-fg-3">({pick("초기", "init")} {initialScan.pinholes.length} → {liveScan.pinholes.length})</span>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] font-medium text-fg-3">{pick("선화 삐져나옴", "Color Bleeds")}</div>
              <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-xl font-bold text-fg" data-testid="bleed-count">{liveScan.colorBleeds.length}</span>
                <span className="text-xs text-fg-3">({pick("초기", "init")} {initialScan.colorBleeds.length} → {liveScan.colorBleeds.length})</span>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] font-medium text-fg-3">{pick("보정된 픽셀", "Fixed Pixels")}</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-good" data-testid="modified-pixel-count">
                {lastSealResult ? `${lastSealResult.modifiedPixelCount}px` : "0px"}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] font-medium text-fg-3">{pick("검수 상태", "QA Status")}</div>
              <div className="mt-1">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${liveScan.totalDefectCount === 0 ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                  {liveScan.totalDefectCount === 0
                    ? pick("결함 0건 · 출고 가능", "0 Defects · Ready")
                    : pick(`결함 ${liveScan.totalDefectCount}건 검출`, `${liveScan.totalDefectCount} Defects Found`)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[176px_1fr]">
            <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-canvas p-3">
              <svg viewBox={`0 0 ${baseCut.width} ${baseCut.height}`} role="img" aria-label={pick("데모 컷 결함 위치 미리보기", "Demo cut defect overlay preview")} className="h-36 w-36 rounded-lg border border-line bg-card">
                <rect x="18" y="10" width="58" height="32" rx="4" className="fill-raised stroke-fg-2" strokeWidth="1.5" />
                <rect x="26" y="32" width="42" height="28" rx="4" className="fill-panel stroke-fg-2" strokeWidth="1.5" />
                <rect x="14" y="60" width="66" height="26" rx="4" className="fill-raised stroke-fg-2" strokeWidth="1.5" />
                {liveScan.pinholes.map((item) => (
                  <circle key={item.id} cx={item.centerX} cy={item.centerY} r={4} className="fill-bad stroke-canvas" strokeWidth="1.2" />
                ))}
                {liveScan.colorBleeds.map((item) => (
                  <rect key={item.id} x={Math.max(1, item.centerX - 3.5)} y={Math.max(1, item.centerY - 3.5)} width="7" height="7" rx="1.5" className="fill-warn stroke-canvas" strokeWidth="1.2" />
                ))}
              </svg>
              <span className="mt-2 text-[11px] tabular-nums text-fg-3">{baseCut.width}×{baseCut.height}px · {liveScan.elapsedMs}ms</span>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleApplyAutoSealTrim} disabled={liveScan.totalDefectCount === 0} className={BTN_PRIMARY}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("1클릭 Auto-Seal · Auto-Trim 적용", "Apply 1-Click Auto-Seal & Trim")}</span>
                </button>
                <button type="button" onClick={handleResetDemoCut} className={BTN_OUTLINE}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("데모 컷 초기화", "Reset Demo Cut")}</span>
                </button>
                {onSendRedlinePins && (
                  <button type="button" disabled={liveScan.redlinePins.length === 0} onClick={() => onSendRedlinePins(liveScan.redlinePins)} className={BTN_OUTLINE}>
                    <span>{pick(`자동 붉은펜 핀 ${liveScan.redlinePins.length}건 전송`, `Send ${liveScan.redlinePins.length} Auto Pins`)}</span>
                  </button>
                )}
              </div>

              {scanNotice && (
                <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs text-good">{scanNotice}</p>
              )}

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-fg-2">
                  {pick(`자동 붉은펜 핀 페이로드 (${liveScan.redlinePins.length}건)`, `Auto Redline Pin Payloads (${liveScan.redlinePins.length})`)}
                </div>
                {liveScan.redlinePins.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs text-good">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{pick("미채색 구멍과 선화 삐져나옴이 모두 0건으로 정리되었습니다.", "All pinholes and color bleeds are resolved (0 remaining).")}</span>
                  </div>
                ) : (
                  <ul className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {liveScan.redlinePins.map((pin) => (
                      <li key={pin.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs">
                        <span className="font-medium text-fg">{isKo ? pin.labelKo : pin.labelEn}</span>
                        <span className="tabular-nums text-fg-3">({pin.xPx}, {pin.yPx}) · r={pin.radiusPx}px</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 탭 2: 붉은펜 자동 재검수 */}
      {activeTab === "redline-reverify" && (
        <div id={`${uid}-panel-redline-reverify`} role="tabpanel" aria-labelledby={`${uid}-tab-redline-reverify`} className="mt-4 space-y-3">
          {reverifyReport.summary.missedUnchangedCount > 0 ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bad/40 bg-bad-soft px-3.5 py-2.5 text-xs text-bad">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {pick(
                    `수정 누락 핀 ${reverifyReport.summary.missedUnchangedCount}건 발견 — 최상단 항목을 먼저 확인하세요.`,
                    `${reverifyReport.summary.missedUnchangedCount} missed pin(s) detected — review top priority items first.`,
                  )}
                </span>
              </div>
              <span className="tabular-nums font-bold">
                {pick("완료율", "Completion")} {Math.round(reverifyReport.summary.completionRate * 100)}%
              </span>
            </div>
          ) : (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-good/40 bg-good-soft px-3.5 py-2.5 text-xs font-semibold text-good">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{pick("누락된 붉은펜 핀이 없습니다. 2차 재검수 승인 기준을 충족했습니다.", "No missed redline pins remain. Ready for second-pass approval.")}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 text-xs tabular-nums">
              <span className="rounded-lg border border-bad/40 bg-bad-soft px-2.5 py-1 font-semibold text-bad">{pick("누락", "Missed")} {reverifyReport.summary.missedUnchangedCount}</span>
              <span className="rounded-lg border border-warn/40 bg-warning-soft px-2.5 py-1 font-semibold text-warn">{pick("부분", "Partial")} {reverifyReport.summary.partialChangeCount}</span>
              <span className="rounded-lg border border-good/40 bg-good-soft px-2.5 py-1 font-semibold text-good">{pick("완료", "Verified")} {reverifyReport.summary.verifiedFixedCount}</span>
            </div>
            <button type="button" onClick={() => setReverifyAfterRgba(new Uint8ClampedArray(baseRedline.afterRgba))} className={BTN_OUTLINE}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("재검수 데모 초기화", "Reset Re-Verify Demo")}</span>
            </button>
          </div>

          <ul className="space-y-2" data-testid="redline-reverify-list">
            {reverifyReport.prioritizedResults.map((item) => {
              const meta = VERDICT_META[item.verdict];
              return (
                <li key={item.id} data-verdict={item.verdict} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>{pick(meta.ko, meta.en)}</span>
                      <span className="text-xs font-semibold text-fg">{isKo ? item.label : item.labelEn}</span>
                    </div>
                    <div className="text-[11px] tabular-nums text-fg-3">
                      {item.id} · ({item.xPx}, {item.yPx}) r={item.radiusPx}px · {pick("변화율", "Changed")} {(item.changedRatio * 100).toFixed(1)}% ({item.changedPixelCount}/{item.sampledPixelCount}px)
                    </div>
                  </div>
                  {item.verdict !== "verified-fixed" && (
                    <button
                      type="button"
                      onClick={() => handleSimulatePinFix({ id: item.id, xPx: item.xPx, yPx: item.yPx, radiusPx: item.radiusPx, label: item.label, labelEn: item.labelEn })}
                      className={BTN_OUTLINE}
                    >
                      <span>{pick("수정 반영 시뮬레이션", "Simulate Fix")}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 탭 3: 2D↔3D 이질감 진단 */}
      {activeTab === "cohesion-2d3d" && (
        <div id={`${uid}-panel-cohesion-2d3d`} role="tabpanel" aria-labelledby={`${uid}-tab-cohesion-2d3d`} className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {COHESION_DEMO_PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => { setCut2d(preset.cut2d); setBg3d(preset.bg3d); }} className={BTN_OUTLINE}>
                  <span>{pick(preset.labelKo, preset.labelEn)}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={handleApplyRecommendedCohesion} className={BTN_PRIMARY}>
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("추천 보정값 1클릭 적용", "Apply Recommended Fix")}</span>
            </button>
          </div>

          <div className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-medium text-fg-3">{pick("2D↔3D 시각 조화 점수", "2D↔3D Cohesion Score")}</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-fg" data-testid="cohesion-score">{cohesion.cohesionScore}</span>
                  <span className="text-xs text-fg-3">/ 100</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${gradeMeta.badge}`}>{pick(gradeMeta.ko, gradeMeta.en)}</span>
                </div>
              </div>
              <div className="text-right text-xs tabular-nums text-fg-2">
                <div>{pick("추천 프리셋", "Recommended Preset")}: <strong className="text-fg">{pick(cohesion.recommendedLightingPreset.labelKo, cohesion.recommendedLightingPreset.labelEn)}</strong></div>
                <div>{pick("추천 3D 라인 두께", "Recommended 3D Line")}: <strong className="text-fg">{cohesion.recommendedOutlinePx}px</strong> · {pick("추천 채도", "Chroma")} <strong className="text-fg">{cohesion.recommendedBgChroma}</strong></div>
              </div>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-raised">
              <div className={`h-full transition-[width] motion-reduce:transition-none ${gradeMeta.bar}`} style={{ width: `${cohesion.cohesionScore}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
              <h3 className="text-xs font-bold text-fg">{pick("2D 캐릭터 기준값", "2D Character Metrics")}</h3>
              <MetricSlider id={`${uid}-2d-angle`} label={pick("2D 주광원 각도", "2D Light Angle")} valueText={`${cut2d.lightAngleDeg}°`} min={0} max={360} step={5} value={cut2d.lightAngleDeg} onChange={(v) => setCut2d((p) => ({ ...p, lightAngleDeg: v }))} />
              <MetricSlider id={`${uid}-2d-outline`} label={pick("2D 외곽선 두께", "2D Outline Thickness")} valueText={`${cut2d.outlinePx.toFixed(1)}px`} min={0.5} max={6.0} step={0.1} value={cut2d.outlinePx} onChange={(v) => setCut2d((p) => ({ ...p, outlinePx: v }))} />
              <MetricSlider id={`${uid}-2d-chroma`} label={pick("2D OKLCH 채도", "2D OKLCH Chroma")} valueText={cut2d.oklchChroma.toFixed(2)} min={0} max={0.32} step={0.01} value={cut2d.oklchChroma} onChange={(v) => setCut2d((p) => ({ ...p, oklchChroma: v }))} />
            </div>
            <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
              <h3 className="text-xs font-bold text-fg">{pick("3D 배경 렌더값", "3D Background Metrics")}</h3>
              <MetricSlider id={`${uid}-3d-sun`} label={pick("3D 배경 태양각", "3D Sun Angle")} valueText={`${bg3d.sunAngleDeg}°`} min={0} max={360} step={5} value={bg3d.sunAngleDeg} onChange={(v) => setBg3d((p) => ({ ...p, sunAngleDeg: v }))} />
              <MetricSlider id={`${uid}-3d-line`} label={pick("3D 배경 라인 두께", "3D Line Thickness")} valueText={`${bg3d.linePx.toFixed(1)}px`} min={0.2} max={6.0} step={0.1} value={bg3d.linePx} onChange={(v) => setBg3d((p) => ({ ...p, linePx: v }))} />
              <MetricSlider id={`${uid}-3d-chroma`} label={pick("3D 배경 OKLCH 채도", "3D OKLCH Chroma")} valueText={bg3d.oklchChroma.toFixed(2)} min={0} max={0.32} step={0.01} value={bg3d.oklchChroma} onChange={(v) => setBg3d((p) => ({ ...p, oklchChroma: v }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            {cohesion.warnings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-good/40 bg-good-soft px-3 py-2 text-xs text-good">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{pick("광원 각도·선폭·OKLCH 채도 편차가 허용 범위 안입니다.", "Lighting angle, line weight, and OKLCH chroma are within harmonized bounds.")}</span>
              </div>
            ) : (
              cohesion.warnings.map((warning) => (
                <div key={warning.axis} className={`rounded-xl border px-3 py-2 text-xs ${warning.severity === "high" ? "border-bad/40 bg-bad-soft text-bad" : "border-warn/40 bg-warning-soft text-warn"}`}>
                  <div className="font-semibold">[{warning.deltaLabel}] {pick(warning.messageKo, warning.messageEn)}</div>
                  <div className="mt-0.5 text-fg-2">{pick(warning.actionKo, warning.actionEn)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
