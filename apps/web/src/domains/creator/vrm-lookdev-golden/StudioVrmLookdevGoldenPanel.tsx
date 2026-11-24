/**
 * Wave 37G — Headless WebGL 골든 SSIM 회귀 오라클 · 표정-헤어 간섭 회피 · 포즈 주름맵 · 1클릭 3면 설정집 패널.
 * Calm Atelier 시맨틱 토큰 전용 · 원시 색상 코드 0건 · 브라우저 스토리지 0건 · 모든 props 선택형 · KO/EN.
 */

import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Layers,
  RotateCcw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Shirt,
  Smile,
  Sparkles,
} from "lucide-react";
import { useCallback, useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  buildOfficialCharacterTurnaroundSheet,
  computePoseSpaceWrinkleMap,
  createExpressionWeightsFromPreset,
  solveHairExpressionAvoidance,
  type CharacterTurnaroundSheetBundle,
  type GarmentFabricType,
  type VrmExpressionPresetId,
} from "./hair-expression-wrinkle-rig";
import {
  applyGoldenRegressionFault,
  evaluateWebGlGoldenSsimGate,
  synthesizeVrmLookdevFrame,
  type GoldenFrameBuffer,
  type GoldenGateVerdict,
  type GoldenRegressionFaultId,
  type GoldenSsimGateReport,
  type WebGlShaderCompileRecord,
} from "./webgl-golden-ssim-gate";

export interface StudioVrmLookdevGoldenPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialFaultId?: GoldenRegressionFaultId;
  readonly initialExpressionId?: VrmExpressionPresetId;
  readonly initialHeightCm?: number;
  readonly customReferenceFrame?: GoldenFrameBuffer;
  readonly customCandidateFrame?: GoldenFrameBuffer;
  readonly customShaderRecords?: readonly WebGlShaderCompileRecord[];
  readonly onGateEvaluate?: (report: GoldenSsimGateReport) => void;
  readonly onSheetGenerate?: (bundle: CharacterTurnaroundSheetBundle) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_PRIMARY = `${BTN_BASE} border-accent bg-accent text-on-accent hover:bg-accent-2`;
const BTN_ACTIVE = `${BTN_BASE} border-accent bg-accent-soft text-accent`;
const BTN_IDLE = `${BTN_BASE} border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg`;

const FAULT_SCENARIOS: readonly {
  readonly id: GoldenRegressionFaultId;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "clean-golden", ko: "정상 골든", en: "Clean Golden" },
  { id: "milky-washout", ko: "밀키 백화", en: "Milky Washout" },
  { id: "dark-collapse", ko: "암부 뭉개짐", en: "Dark Collapse" },
  { id: "silhouette-dropout", ko: "실루엣 결손", en: "Silhouette Loss" },
  { id: "shader-compile-error", ko: "셰이더 오류", en: "Shader Error" },
  { id: "subtle-tone-drift", ko: "미세 톤 드리프트", en: "Subtle Drift" },
];

const EXPRESSION_PRESETS: readonly {
  readonly id: VrmExpressionPresetId;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "neutral", ko: "기본", en: "Neutral" },
  { id: "surprised", ko: "놀람", en: "Surprised" },
  { id: "angry", ko: "화남", en: "Angry" },
  { id: "winkLeft", ko: "왼쪽 윙크", en: "Wink L" },
  { id: "winkRight", ko: "오른쪽 윙크", en: "Wink R" },
  { id: "happy", ko: "미소", en: "Smile" },
  { id: "sad", ko: "슬픔", en: "Sad" },
];

const FABRIC_OPTIONS: readonly {
  readonly id: GarmentFabricType;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "cotton", ko: "면 셔츠", en: "Cotton" },
  { id: "denim", ko: "데님", en: "Denim" },
  { id: "silk", ko: "실크", en: "Silk" },
  { id: "knit", ko: "니트", en: "Knit" },
  { id: "blazer", ko: "블레이저", en: "Blazer" },
];

const HEAD_RATIO_OPTIONS: readonly number[] = [6.5, 7.5, 8.0];

function verdictBadgeClass(verdict: GoldenGateVerdict): string {
  if (verdict === "pass") return "border-good/40 bg-good-soft text-good";
  if (verdict === "warn") return "border-warn/40 bg-warning-soft text-warn";
  return "border-bad/40 bg-bad-soft text-bad";
}

function verdictLabel(verdict: GoldenGateVerdict, isEn: boolean): string {
  if (verdict === "pass") return isEn ? "PASS" : "통과 (PASS)";
  if (verdict === "warn") return isEn ? "WARN" : "주의 (WARN)";
  return isEn ? "FAIL" : "실패 (FAIL)";
}

function TurnaroundSilhouette({ viewId }: { readonly viewId: "front" | "side" | "back" }): ReactElement {
  const isSide = viewId === "side";
  return (
    <svg
      viewBox="0 0 80 144"
      className="h-28 w-16 text-fg-2"
      aria-hidden="true"
    >
      <line x1="40" y1="6" x2="40" y2="138" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="3 3" />
      <circle cx="40" cy="24" r={isSide ? 11 : 12} fill="none" stroke="currentColor" strokeWidth="1.6" />
      {viewId === "front" ? (
        <>
          <circle cx="36" cy="24" r="1.2" fill="currentColor" />
          <circle cx="44" cy="24" r="1.2" fill="currentColor" />
        </>
      ) : null}
      {viewId === "back" ? (
        <path d="M29 22 Q40 34 51 22" fill="none" stroke="currentColor" strokeWidth="1.4" />
      ) : null}
      <rect
        x={isSide ? 32 : 25}
        y="38"
        width={isSide ? 16 : 30}
        height="46"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line x1={isSide ? 37 : 33} y1="84" x2={isSide ? 37 : 32} y2="134" stroke="currentColor" strokeWidth="1.6" />
      <line x1={isSide ? 43 : 47} y1="84" x2={isSide ? 43 : 48} y2="134" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Headless WebGL 골든 SSIM 오라클 · 표정-헤어·주름 · 1클릭 3면 캐릭터 설정집 패널. */
export function StudioVrmLookdevGoldenPanel({
  locale,
  className = "",
  initialFaultId = "clean-golden",
  initialExpressionId = "surprised",
  initialHeightCm = 168,
  customReferenceFrame,
  customCandidateFrame,
  customShaderRecords,
  onGateEvaluate,
  onSheetGenerate,
}: StudioVrmLookdevGoldenPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [faultId, setFaultId] = useState<GoldenRegressionFaultId>(initialFaultId);
  const [expressionId, setExpressionId] = useState<VrmExpressionPresetId>(initialExpressionId);
  const [expressionPct, setExpressionPct] = useState<number>(85);
  const [fabricType, setFabricType] = useState<GarmentFabricType>("cotton");
  const [elbowDeg, setElbowDeg] = useState<number>(75);
  const [kneeDeg, setKneeDeg] = useState<number>(50);
  const [shoulderDeg, setShoulderDeg] = useState<number>(40);
  const [heightCm, setHeightCm] = useState<number>(initialHeightCm);
  const [headRatio, setHeadRatio] = useState<number>(7.5);
  const [sheetBuildCount, setSheetBuildCount] = useState<number>(1);

  const syntheticGolden = useMemo<GoldenFrameBuffer>(
    () => synthesizeVrmLookdevFrame({ width: 48, height: 48, transparentBackdrop: true }),
    [],
  );

  const referenceFrame = customReferenceFrame ?? syntheticGolden;

  const gateReport = useMemo<GoldenSsimGateReport>(() => {
    if (customCandidateFrame) {
      return evaluateWebGlGoldenSsimGate({
        width: referenceFrame.width,
        height: referenceFrame.height,
        referenceRgba: referenceFrame.data,
        candidateRgba: customCandidateFrame.data,
        candidateWidth: customCandidateFrame.width,
        candidateHeight: customCandidateFrame.height,
        shaderRecords: customShaderRecords,
      });
    }
    const injected = applyGoldenRegressionFault(referenceFrame, faultId);
    return evaluateWebGlGoldenSsimGate({
      width: referenceFrame.width,
      height: referenceFrame.height,
      referenceRgba: referenceFrame.data,
      candidateRgba: injected.candidate.data,
      shaderRecords: customShaderRecords ?? injected.shaderRecords,
    });
  }, [customCandidateFrame, customShaderRecords, faultId, referenceFrame]);

  const hairAvoidance = useMemo(
    () =>
      solveHairExpressionAvoidance({
        weights: createExpressionWeightsFromPreset(expressionId, expressionPct / 100),
      }),
    [expressionId, expressionPct],
  );

  const wrinkleMap = useMemo(
    () =>
      computePoseSpaceWrinkleMap({
        fabricType,
        angles: {
          leftElbowDeg: elbowDeg,
          rightElbowDeg: Math.round(elbowDeg * 0.72),
          leftKneeDeg: kneeDeg,
          rightKneeDeg: Math.round(kneeDeg * 0.8),
          leftShoulderDeg: shoulderDeg,
          rightShoulderDeg: Math.round(shoulderDeg * 0.85),
        },
      }),
    [elbowDeg, fabricType, kneeDeg, shoulderDeg],
  );

  const sheetBundle = useMemo<CharacterTurnaroundSheetBundle>(
    () =>
      buildOfficialCharacterTurnaroundSheet({
        characterName: isEn ? "Seoyeon (Atelier Lead)" : "서연(아틀리에 주인공)",
        seriesTitle: isEn ? "ToonStudio Official Lookdev" : "툰스튜디오 공식 룩뎁",
        characterCode: "TS-VRM-37G",
        heightCm,
        headRatio,
      }),
    [headRatio, heightCm, isEn],
  );

  const handleSelectFault = useCallback(
    (nextFault: GoldenRegressionFaultId) => {
      setFaultId(nextFault);
      if (!onGateEvaluate) return;
      const injected = applyGoldenRegressionFault(referenceFrame, nextFault);
      onGateEvaluate(
        evaluateWebGlGoldenSsimGate({
          width: referenceFrame.width,
          height: referenceFrame.height,
          referenceRgba: referenceFrame.data,
          candidateRgba: injected.candidate.data,
          shaderRecords: customShaderRecords ?? injected.shaderRecords,
        }),
      );
    },
    [customShaderRecords, onGateEvaluate, referenceFrame],
  );

  const handleBuildSheet = useCallback(() => {
    setSheetBuildCount((c) => c + 1);
    onSheetGenerate?.(sheetBundle);
  }, [onSheetGenerate, sheetBundle]);

  const handleReset = useCallback(() => {
    setFaultId("clean-golden");
    setExpressionId("surprised");
    setExpressionPct(85);
    setFabricType("cotton");
    setElbowDeg(75);
    setKneeDeg(50);
    setShoulderDeg(40);
    setHeightCm(168);
    setHeadRatio(7.5);
  }, []);

  const histMax = Math.max(0.01, ...gateReport.candidateHistogram.luminanceBins);
  const inputSourceLabel = customReferenceFrame && customCandidateFrame
    ? pick("외부 기준·후보 RGBA · 렌더러와 GPU 출처는 미검증", "External reference/candidate RGBA · Renderer/GPU provenance unverified")
    : customReferenceFrame
      ? pick("외부 기준 RGBA · 후보는 기준에서 만든 결함 예제 · 렌더러와 GPU 출처는 미검증", "External reference RGBA · Candidate is a derived fault example · Renderer/GPU provenance unverified")
      : customCandidateFrame
        ? pick("합성 기준·외부 후보 RGBA · 렌더러와 GPU 출처는 미검증", "Synthetic reference/external candidate RGBA · Renderer/GPU provenance unverified")
        : pick("합성 RGBA 예제 검사 · 실제 캐릭터의 검증 결과가 아닙니다", "Synthetic RGBA example · Not a live character verification");

  return (
    <section
      data-testid="studio-vrm-lookdev-golden-panel"
      aria-label={pick("RGBA SSIM 검사와 예제 3면 캐릭터 시트", "RGBA SSIM Check and Example Character Turnaround")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-bold text-fg">
              {pick("RGBA SSIM 검사 · 표정-헤어·주름 · 예제 3면 시트", "RGBA SSIM Check · Hair/Wrinkle · Example Turnaround")}
            </h2>
            <span
              data-testid="vrm-golden-verdict-badge"
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${verdictBadgeClass(gateReport.verdict)}`}
            >
              {gateReport.verdict === "pass" ? (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              ) : gateReport.verdict === "warn" ? (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{verdictLabel(gateReport.verdict, isEn)}</span>
              <span>SSIM {gateReport.ssim.toFixed(4)}</span>
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "입력 RGBA와 셰이더 로그를 검사하고 예제 수치로 표정·주름·3면 도식을 계산합니다. WebGL 캡처·실제 VRM 검증과 3D 씬 반영은 실행하지 않습니다.",
              "Checks supplied RGBA/logs and calculates example hair, wrinkle, and turnaround diagrams. No WebGL capture, live VRM verification, or scene changes.",
            )}
          </p>
          <p data-testid="vrm-golden-input-source" className="text-xs text-fg-2">{inputSourceLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="vrm-golden-reset-btn"
            onClick={handleReset}
            className={BTN_IDLE}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("기본값", "Reset")}</span>
          </button>
          <button
            type="button"
            data-testid="vrm-golden-build-sheet-btn"
            onClick={handleBuildSheet}
            className={BTN_PRIMARY}
          >
            <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("예제 3면 시트 계산", "Calculate Example Turnaround")}</span>
          </button>
        </div>
      </header>

      {/* ① Headless WebGL 골든 SSIM 자동 회귀 게이트 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-golden-ssim-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("① 입력 RGBA 골든 SSIM 검사", "1. Supplied RGBA Golden SSIM Check")}</span>
          </div>
          <span className="text-[11px] text-fg-2 tabular-nums">
            {`${referenceFrame.width}×${referenceFrame.height} RGBA · ${gateReport.windowCount} windows`}
          </span>
        </div>

        {!customCandidateFrame ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("회귀 결함 시나리오 선택", "Select Regression Fault Scenario")}>
            {FAULT_SCENARIOS.map((item) => {
              const active = faultId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`vrm-golden-fault-${item.id}`}
                  onClick={() => handleSelectFault(item.id)}
                  className={active ? BTN_ACTIVE : BTN_IDLE}
                >
                  {pick(item.ko, item.en)}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-line bg-raised p-2.5">
            <div className="text-[11px] text-fg-2">{pick("지각 SSIM", "Perceptual SSIM")}</div>
            <div data-testid="vrm-golden-ssim-value" className="mt-0.5 text-base font-bold text-fg tabular-nums">
              {gateReport.ssim.toFixed(4)}
            </div>
            <div className="text-[11px] text-fg-3 tabular-nums">
              {`Y ${gateReport.lumaSsim.toFixed(3)} · C ${gateReport.chromaSsim.toFixed(3)}`}
            </div>
          </div>

          <div className="rounded-md border border-line bg-raised p-2.5">
            <div className="text-[11px] text-fg-2">{pick("밀키 백화 비율", "Milky Washout")}</div>
            <div data-testid="vrm-golden-washout-value" className="mt-0.5 text-base font-bold text-fg tabular-nums">
              {`${(gateReport.washoutRatio * 100).toFixed(1)}%`}
            </div>
            <div className="text-[11px] text-fg-3 tabular-nums">
              {`Δ +${(gateReport.washoutDelta * 100).toFixed(1)}%p`}
            </div>
          </div>

          <div className="rounded-md border border-line bg-raised p-2.5">
            <div className="text-[11px] text-fg-2">{pick("암부 뭉개짐", "Dark Collapse")}</div>
            <div data-testid="vrm-golden-dark-value" className="mt-0.5 text-base font-bold text-fg tabular-nums">
              {`${(gateReport.darkCollapseRatio * 100).toFixed(1)}%`}
            </div>
            <div className="text-[11px] text-fg-3 tabular-nums">
              {pick(`실루엣 결손 ${(gateReport.silhouetteLossRatio * 100).toFixed(1)}%`, `Silhouette -${(gateReport.silhouetteLossRatio * 100).toFixed(1)}%`)}
            </div>
          </div>

          <div className="rounded-md border border-line bg-raised p-2.5">
            <div className="text-[11px] text-fg-2">{pick("입력 셰이더 로그 오류", "Supplied Shader Log Errors")}</div>
            <div
              data-testid="vrm-golden-shader-error-value"
              className={`mt-0.5 text-base font-bold tabular-nums ${gateReport.shaderErrorCount > 0 ? "text-bad" : "text-good"}`}
            >
              {pick(`${gateReport.shaderErrorCount}건`, `${gateReport.shaderErrorCount}`)}
            </div>
            <div className="text-[11px] text-fg-3 tabular-nums">
              {`IoU ${gateReport.silhouetteIoU.toFixed(3)}`}
            </div>
          </div>
        </div>

        {/* 휘도 히스토그램 16구간 바 */}
        <div className="space-y-1.5 rounded-md border border-line bg-canvas p-2.5">
          <div className="flex items-center justify-between text-[11px] text-fg-2">
            <span>{pick("휘도 16구간 분포(암부 ← → 백화)", "16-Bin Luminance Histogram (Dark → Washout)")}</span>
            <span className="tabular-nums">
              {pick(
                `평균 휘도 ${(gateReport.candidateHistogram.meanLuminance * 100).toFixed(0)}% · 채도 ${(gateReport.candidateHistogram.meanSaturation * 100).toFixed(0)}%`,
                `Mean Y ${(gateReport.candidateHistogram.meanLuminance * 100).toFixed(0)}% · Sat ${(gateReport.candidateHistogram.meanSaturation * 100).toFixed(0)}%`,
              )}
            </span>
          </div>
          <div className="flex h-12 items-end gap-1" aria-hidden="true">
            {gateReport.candidateHistogram.luminanceBins.map((bin, idx) => {
              const heightPct = Math.max(4, Math.round((bin / histMax) * 100));
              const barTone = idx <= 1 ? "bg-cool" : idx >= 14 ? "bg-warn" : "bg-accent";
              return (
                <div key={idx} className="flex h-full flex-1 items-end">
                  <div className={`w-full rounded-t-sm ${barTone}`} style={{ height: `${heightPct}%` }} />
                </div>
              );
            })}
          </div>
        </div>

        <div data-testid="vrm-golden-diagnostics" className="space-y-1.5">
          {gateReport.diagnostics.length === 0 ? (
            <div className="flex items-center gap-1.5 rounded-md border border-good/40 bg-good-soft px-3 py-2 text-xs text-good">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{pick(gateReport.summaryKo, gateReport.summaryEn)}</span>
            </div>
          ) : (
            gateReport.diagnostics.map((diag) => (
              <div
                key={`${diag.code}-${diag.severity}`}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                  diag.severity === "fail"
                    ? "border-bad/40 bg-bad-soft text-bad"
                    : "border-warn/40 bg-warning-soft text-warn"
                }`}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{pick(diag.messageKo, diag.messageEn)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ② 표정-헤어 간섭 회피 & 포즈 공간 의상 주름맵 */}
      <div className="grid gap-3 lg:grid-cols-2" data-testid="vrm-golden-hair-wrinkle-section">
        <div className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Smile className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("② 표정-앞머리 Z 간섭 회피 솔버", "2. Expression-Hair Z-Avoidance Solver")}</span>
            </div>
            <span data-testid="vrm-golden-max-z-value" className="text-xs font-bold text-accent tabular-nums">
              {`+${hairAvoidance.maxZOffsetMm.toFixed(2)} mm`}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("표정 프리셋 선택", "Select Expression Preset")}>
            {EXPRESSION_PRESETS.map((expr) => {
              const active = expressionId === expr.id;
              return (
                <button
                  key={expr.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`vrm-golden-expr-${expr.id}`}
                  onClick={() => setExpressionId(expr.id)}
                  className={active ? BTN_ACTIVE : BTN_IDLE}
                >
                  {pick(expr.ko, expr.en)}
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`${uid}-expr-intensity`} className="font-medium text-fg-2">
                {pick("표정 블렌드셰이프 강도", "Expression Blendshape Weight")}
              </label>
              <span className="font-semibold text-fg tabular-nums">{expressionPct}%</span>
            </div>
            <input
              id={`${uid}-expr-intensity`}
              data-testid="vrm-golden-expr-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={expressionPct}
              onChange={(e) => setExpressionPct(Number(e.target.value))}
              className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />
          </div>

          <div className="space-y-1.5" data-testid="vrm-golden-bangs-zones">
            {hairAvoidance.zones.map((zone) => {
              const barPct = Math.min(100, Math.round((zone.zOffsetMm / 10) * 100));
              return (
                <div key={zone.zoneId} className="space-y-0.5 rounded-md border border-line bg-raised px-2.5 py-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-fg">{pick(zone.labelKo, zone.labelEn)}</span>
                    <span className="font-semibold text-fg-2 tabular-nums">
                      {`Z +${zone.zOffsetMm.toFixed(2)}mm · 여유 ${zone.residualClearanceMm.toFixed(1)}mm`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${barPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-fg-2">{pick(hairAvoidance.summaryKo, hairAvoidance.summaryEn)}</p>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Shirt className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("③ 포즈 공간 의상 주름맵 매퍼", "3. Pose-Space Clothing Wrinkle Mapper")}</span>
            </div>
            <span data-testid="vrm-golden-wrinkle-peak" className="text-xs font-bold text-accent tabular-nums">
              {pick(
                `노멀 ${(wrinkleMap.peakNormalStrength * 100).toFixed(0)}% · ${wrinkleMap.totalActiveFoldLines}선`,
                `Normal ${(wrinkleMap.peakNormalStrength * 100).toFixed(0)}% · ${wrinkleMap.totalActiveFoldLines} folds`,
              )}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("의상 원단 재질 선택", "Select Fabric Type")}>
            {FABRIC_OPTIONS.map((fab) => {
              const active = fabricType === fab.id;
              return (
                <button
                  key={fab.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`vrm-golden-fabric-${fab.id}`}
                  onClick={() => setFabricType(fab.id)}
                  className={active ? BTN_ACTIVE : BTN_IDLE}
                >
                  {pick(fab.ko, fab.en)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={`${uid}-elbow`} className="text-fg-2">{pick("팔꿈치 굴곡", "Elbow")}</label>
                <span className="font-semibold text-fg tabular-nums">{elbowDeg}°</span>
              </div>
              <input
                id={`${uid}-elbow`}
                data-testid="vrm-golden-elbow-slider"
                type="range"
                min={0}
                max={150}
                step={5}
                value={elbowDeg}
                onChange={(e) => setElbowDeg(Number(e.target.value))}
                className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={`${uid}-knee`} className="text-fg-2">{pick("무릎 굴곡", "Knee")}</label>
                <span className="font-semibold text-fg tabular-nums">{kneeDeg}°</span>
              </div>
              <input
                id={`${uid}-knee`}
                data-testid="vrm-golden-knee-slider"
                type="range"
                min={0}
                max={150}
                step={5}
                value={kneeDeg}
                onChange={(e) => setKneeDeg(Number(e.target.value))}
                className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <label htmlFor={`${uid}-shoulder`} className="text-fg-2">{pick("어깨 거상", "Shoulder")}</label>
                <span className="font-semibold text-fg tabular-nums">{shoulderDeg}°</span>
              </div>
              <input
                id={`${uid}-shoulder`}
                data-testid="vrm-golden-shoulder-slider"
                type="range"
                min={0}
                max={180}
                step={5}
                value={shoulderDeg}
                onChange={(e) => setShoulderDeg(Number(e.target.value))}
                className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5" data-testid="vrm-golden-wrinkle-joints">
            {wrinkleMap.joints.map((joint) => (
              <div key={joint.jointId} className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center justify-between font-medium text-fg">
                  <span>{pick(joint.labelKo, joint.labelEn)}</span>
                  <span className="tabular-nums">{joint.angleDeg}°</span>
                </div>
                <div className="mt-0.5 text-fg-2 tabular-nums">
                  {pick(
                    `노멀 ${(joint.normalStrength * 100).toFixed(0)}% · 선화 ${(joint.inkLineStrength * 100).toFixed(0)}% · ${joint.estimatedFoldLines}선`,
                    `N ${(joint.normalStrength * 100).toFixed(0)}% · Ink ${(joint.inkLineStrength * 100).toFixed(0)}% · ${joint.estimatedFoldLines}`,
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-fg-2">{pick(wrinkleMap.summaryKo, wrinkleMap.summaryEn)}</p>
        </div>
      </div>

      {/* ④ 원클릭 웹툰 공식 3면 캐릭터 설정집 미리보기 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-golden-turnaround-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Ruler className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("④ 1클릭 웹툰 공식 3면 캐릭터 설정집 미리보기", "4. 1-Click Official 3-View Character Sheet Preview")}</span>
          </div>
          <span data-testid="vrm-golden-sheet-meta" className="text-[11px] text-fg-2 tabular-nums">
            {pick(
              `${sheetBundle.spec.ruler.heightCm}cm · ${sheetBundle.spec.ruler.headRatio}등신 · SVG ${sheetBundle.svg.length}B · JSON ${sheetBundle.json.length}B · #${sheetBuildCount}`,
              `${sheetBundle.spec.ruler.heightCm}cm · ${sheetBundle.spec.ruler.headRatio}H · SVG ${sheetBundle.svg.length}B · JSON ${sheetBundle.json.length}B · #${sheetBuildCount}`,
            )}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <label htmlFor={`${uid}-height-cm`} className="font-medium text-fg-2">
                {pick("미터법 캐릭터 신장(cm)", "Metric Character Height (cm)")}
              </label>
              <span data-testid="vrm-golden-height-value" className="font-semibold text-fg tabular-nums">
                {`${heightCm} cm`}
              </span>
            </div>
            <input
              id={`${uid}-height-cm`}
              data-testid="vrm-golden-height-slider"
              type="range"
              min={145}
              max={195}
              step={1}
              value={heightCm}
              onChange={(e) => setHeightCm(Number(e.target.value))}
              className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("등신비 선택", "Select Head Ratio")}>
            {HEAD_RATIO_OPTIONS.map((ratio) => {
              const active = headRatio === ratio;
              return (
                <button
                  key={ratio}
                  type="button"
                  aria-pressed={active}
                  data-testid={`vrm-golden-ratio-${ratio}`}
                  onClick={() => setHeadRatio(ratio)}
                  className={active ? BTN_ACTIVE : BTN_IDLE}
                >
                  {pick(`${ratio}등신`, `${ratio} Heads`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 신장 눈금자 + 3면 뷰(정면·측면·후면) */}
        <div className="grid gap-2 md:grid-cols-4">
          <div
            data-testid="vrm-golden-metric-ruler"
            className="flex flex-col justify-between rounded-md border border-line bg-canvas p-2.5 text-[11px]"
          >
            <div className="font-semibold text-fg">{pick("미터법 눈금자", "Metric Ruler")}</div>
            <div className="mt-1.5 space-y-1">
              {sheetBundle.spec.ruler.landmarks.map((lm) => (
                <div key={lm.id} className="flex items-center justify-between border-b border-line/60 pb-0.5 tabular-nums">
                  <span className="text-fg-2">{pick(lm.labelKo, lm.labelEn)}</span>
                  <span className="font-semibold text-fg">{`${lm.cm}cm`}</span>
                </div>
              ))}
            </div>
          </div>

          {sheetBundle.spec.views.map((view) => (
            <div
              key={view.id}
              data-testid={`vrm-golden-view-${view.id}`}
              className="flex flex-col items-center justify-between rounded-md border border-line bg-canvas p-2.5"
            >
              <span className="text-[11px] font-semibold text-fg">
                {`${pick(view.labelKo, view.labelEn)} (${view.cameraYawDeg}°)`}
              </span>
              <TurnaroundSilhouette viewId={view.id} />
              <span className="text-[11px] text-fg-3 tabular-nums">
                {`${view.rect.width}×${view.rect.height}px`}
              </span>
            </div>
          ))}
        </div>

        {/* 12종 공식 표정 슬롯 */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-fg-2">
            {pick("공식 12종 표정 슬롯 (앞머리 Z 회피 연동)", "12 Official Expression Slots (Auto Hair Z-Avoidance)")}
          </div>
          <div data-testid="vrm-golden-expression-slots" className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {sheetBundle.spec.expressions.map((slot) => (
              <div key={slot.id} className="rounded-md border border-line bg-raised px-2 py-1.5 text-[11px]">
                <div className="font-semibold text-fg">
                  {`${String(slot.index).padStart(2, "0")} ${pick(slot.labelKo, slot.labelEn)}`}
                </div>
                <div className="text-fg-3 tabular-nums">{`Z +${slot.hairAvoidanceZMm.toFixed(1)}mm`}</div>
              </div>
            ))}
          </div>
        </div>

        {/* OKLCH 공식 컬러 칩 */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-fg-2">
            {pick("OKLCH 공식 컬러 팔레트 (8칩)", "Official OKLCH Color Chips (8)")}
          </div>
          <div data-testid="vrm-golden-oklch-palette" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {sheetBundle.spec.palette.map((chip) => (
              <div key={chip.id} className="flex items-center gap-2 rounded-md border border-line bg-raised p-2">
                <span
                  aria-hidden="true"
                  className="h-7 w-7 shrink-0 rounded-md border border-line-strong"
                  style={{ backgroundColor: chip.oklchCss }}
                />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-fg">{pick(chip.roleKo, chip.roleEn)}</div>
                  <div className="truncate text-[10px] text-fg-3 tabular-nums">{chip.oklchCss}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
