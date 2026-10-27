import { useMemo, useState, type ReactElement } from "react";

import {
  CSP_COMPANION_NAVIGATOR_COMMANDS,
  CSP_COMPANION_REMOTE_TAB_KINDS,
  CSP_TGCXS_DEFAULT_CONSTANTS,
  applyCspAiDisturbanceFilter,
  applyCspCompanionNavigatorCommand,
  convertCspVectorStrokeToRuler,
  createDefaultCspCompanionRemoteState,
  createDefaultCspCxsTextStyle,
  cutCspVectorStrokesAtIntersection,
  evaluateCspIccPcsPipeline,
  smoothCspVectorV4Stroke,
  thinCspRasterToCenterlineGraph,
  type CspCompanionNavigatorCommand,
  type CspCompanionRemoteTabKind,
  type CspVec4EraserMode,
  type CspVec4Stroke,
} from "../../../../../../packages/studio-format-gateway/src/csp-tgcxs-certmdul-mobile-companion";
import { CspPwEditSliderJoint } from "./StudioCspPwuiBentoToonSection";

const SAMPLE_INTERSECTING_STROKES: readonly CspVec4Stroke[] = [
  {
    id: "stroke_horiz",
    points: [
      { x: 10, y: 50, pressure: 0.55, width: 3 },
      { x: 35, y: 50, pressure: 0.78, width: 3 },
      { x: 50, y: 50, pressure: 0.85, width: 3 },
      { x: 65, y: 50, pressure: 0.8, width: 3 },
      { x: 90, y: 50, pressure: 0.45, width: 3 },
    ],
  },
  {
    id: "stroke_vert_left",
    points: [
      { x: 30, y: 15, pressure: 0.6, width: 2.5 },
      { x: 30, y: 50, pressure: 0.9, width: 2.5 },
      { x: 30, y: 85, pressure: 0.5, width: 2.5 },
    ],
  },
  {
    id: "stroke_vert_right",
    points: [
      { x: 70, y: 15, pressure: 0.6, width: 2.5 },
      { x: 70, y: 50, pressure: 0.9, width: 2.5 },
      { x: 70, y: 85, pressure: 0.5, width: 2.5 },
    ],
  },
] as const;

const SAMPLE_NAMED_SPOT_COLORS = [
  {
    name: "DIC-182s (Sakura Magenta)",
    prefix: "DIC",
    suffix: "s",
    pcsLab: [56.4, 68.2, -12.5] as const,
    deviceCmyk: [0.04, 0.88, 0.18, 0.0] as const,
  },
  {
    name: "TOYO-CF0492 (Cobalt Cyan)",
    prefix: "TOYO",
    suffix: "CF",
    pcsLab: [51.8, -18.4, -52.0] as const,
    deviceCmyk: [0.92, 0.34, 0.0, 0.02] as const,
  },
  {
    name: "PANTONE-116C (Manga Cover Gold)",
    prefix: "PANTONE",
    suffix: "C",
    pcsLab: [83.2, 8.5, 84.1] as const,
    deviceCmyk: [0.0, 0.16, 0.98, 0.0] as const,
  },
] as const;

export function StudioCspTgcxsCertMdulCompanionSection(): ReactElement {
  const [vecEraserMode, setVecEraserMode] = useState<CspVec4EraserMode>("up_to_intersection");
  const [vecSmoothLevel, setVecSmoothLevel] = useState<number>(4);
  const [cxsCompositePreset, setCxsCompositePreset] = useState<
    "ComicStudio-PGA" | "ComicStudio-GA" | "ComicStudio-EXP"
  >("ComicStudio-PGA");
  const [spotColorIdx, setSpotColorIdx] = useState<number>(0);
  const [spotTintPercent, setSpotTintPercent] = useState<number>(85);
  const [companionState, setCompanionState] = useState(createDefaultCspCompanionRemoteState);
  const [aiDisturbanceIntensity, setAiDisturbanceIntensity] = useState<number>(35);

  const vecCutSummary = useMemo(
    () =>
      cutCspVectorStrokesAtIntersection(
        SAMPLE_INTERSECTING_STROKES,
        { x: 50, y: 50, radius: 12 },
        vecEraserMode,
      ),
    [vecEraserMode],
  );

  const vecSmoothSummary = useMemo(
    () => smoothCspVectorV4Stroke(SAMPLE_INTERSECTING_STROKES[0]!, vecSmoothLevel, 1),
    [vecSmoothLevel],
  );

  const vecToRulerSummary = useMemo(
    () => convertCspVectorStrokeToRuler(vecSmoothSummary.stroke, 600, 600),
    [vecSmoothSummary.stroke],
  );

  const thinningSummary = useMemo(() => {
    const w = 9;
    const h = 9;
    const mask = new Uint8Array(w * h);
    for (let i = 1; i < 8; i += 1) {
      mask[4 * w + i] = 1; // horizontal bar
      mask[i * w + 4] = 1; // vertical bar -> cross at (4,4)
    }
    return thinCspRasterToCenterlineGraph(mask, w, h);
  }, []);

  const cxsStylePreview = useMemo(() => {
    const base = createDefaultCspCxsTextStyle("ja");
    return { ...base, compositePreset: cxsCompositePreset };
  }, [cxsCompositePreset]);

  const iccPcsResult = useMemo(() => {
    const cache = new Set<string>();
    const spot = SAMPLE_NAMED_SPOT_COLORS[spotColorIdx] ?? SAMPLE_NAMED_SPOT_COLORS[0]!;
    // First call populates MRU, second verifies hit on identical tint
    evaluateCspIccPcsPipeline(spot, spotTintPercent / 100, cache);
    return evaluateCspIccPcsPipeline(spot, spotTintPercent / 100, cache);
  }, [spotColorIdx, spotTintPercent]);

  const aiDisturbanceSummary = useMemo(() => {
    const w = 8;
    const h = 8;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      buf[i * 4] = 196;
      buf[i * 4 + 1] = 164;
      buf[i * 4 + 2] = 212;
      buf[i * 4 + 3] = 255;
    }
    return applyCspAiDisturbanceFilter(buf, w, h, aiDisturbanceIntensity);
  }, [aiDisturbanceIntensity]);

  return (
    <div
      data-testid="csp-tab-tgcxs-certmdul-companion"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      {/* Column 1: TGCxsPlugIn.cfpi Vector V4 Cut/Smooth/Thinning & .cxs TextStyle */}
      <div className="rounded border border-line bg-panel p-2.5">
        <div className="mb-1.5 font-semibold text-fg">
          1. TGCxsPlugIn.cfpi 벡터 교차 지우개·세선화·.cxs 서식
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {(["up_to_intersection", "touch_point", "whole_line"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`csp-vec4-cut-mode-${mode}`}
              onClick={() => setVecEraserMode(mode)}
              className={`rounded border px-2 py-0.5 text-[0.65rem] ${
                vecEraserMode === mode
                  ? "border-accent bg-accent/15 font-semibold text-accent"
                  : "border-line bg-card text-fg-2"
              }`}
            >
              {mode === "up_to_intersection"
                ? "교차점까지 (CutStrokeAtIntersect)"
                : mode === "touch_point"
                  ? "닿은 부분 (MakeEraserEdge)"
                  : "선 전체 (WholeLine)"}
            </button>
          ))}
        </div>
        <CspPwEditSliderJoint
          label="CSVec4Smooth 레벨 (0x3422e0=0.05)"
          value={vecSmoothLevel}
          min={1}
          max={10}
          unit="lv"
          onChange={setVecSmoothLevel}
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-[0.66rem]">
          <span>.cxs 합성 폰트 프리셋:</span>
          <select
            aria-label="CXS 합성 폰트 프리셋"
            value={cxsCompositePreset}
            onChange={(e) =>
              setCxsCompositePreset(
                e.target.value as "ComicStudio-PGA" | "ComicStudio-GA" | "ComicStudio-EXP",
              )
            }
            className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.65rem]"
          >
            {CSP_TGCXS_DEFAULT_CONSTANTS.comicStudioPresets.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </div>
        <div
          data-testid="csp-tgcxs-readout"
          className="mt-2 space-y-1 rounded bg-card p-2 text-[0.64rem]"
        >
          <div>
            CSVec4Cut 결과: 입력 {vecCutSummary.inputStrokeCount}선 → 출력{" "}
            <strong>{vecCutSummary.outputStrokes.length}선</strong> (교차점{" "}
            {vecCutSummary.intersectionCount}개 · 삭제 세그먼트 {vecCutSummary.erasedSegmentCount}개)
          </div>
          <div>
            CSVec4Smooth 계수: {vecSmoothSummary.params.smoothFactor} · CSRulerLayer 1/
            {vecToRulerSummary.subpixelScale} 고정소수점 제어점{" "}
            {vecToRulerSummary.fixedPointControlPoints.length}개 ({vecToRulerSummary.totalLengthPx}px)
          </div>
          <div>
            CSFilterThining(0x1114ec): 교차점(status=6) {thinningSummary.crossCount}개 · 끝점(status=2){" "}
            {thinningSummary.edgeCount}개
          </div>
          <div>
            CSTextStyle(0x24ff3c): 기본 {cxsStylePreview.fontSizePt}pt ·{" "}
            {cxsStylePreview.primaryFontName} ({cxsStylePreview.compositePreset})
          </div>
        </div>
      </div>

      {/* Column 2: CertMdul.app ICC v4 / Spectral PCS Multi-Step & MRU Cache */}
      <div className="rounded border border-line bg-panel p-2.5">
        <div className="mb-1.5 font-semibold text-fg">
          2. CertMdul.app ICC v4 NamedColor &amp; PCS Step 파이프라인
        </div>
        <select
          aria-label="ICC NamedColor 별색 선택"
          value={spotColorIdx}
          onChange={(e) => setSpotColorIdx(Number(e.target.value))}
          className="mb-2 w-full rounded border border-line bg-card px-2 py-1 text-[0.66rem]"
        >
          {SAMPLE_NAMED_SPOT_COLORS.map((sc, idx) => (
            <option key={sc.name} value={idx}>
              {sc.name} (L*{sc.pcsLab[0]} a*{sc.pcsLab[1]} b*{sc.pcsLab[2]})
            </option>
          ))}
        </select>
        <CspPwEditSliderJoint
          label="CIccArrayNamedColor 별색 농도 (Tint)"
          value={spotTintPercent}
          min={5}
          max={100}
          unit="%"
          onChange={setSpotTintPercent}
        />
        <div
          data-testid="csp-certmdul-pcs-readout"
          className="mt-2 space-y-1 rounded bg-card p-2 text-[0.64rem]"
        >
          <div>
            PCS 입력 Lab: L*{iccPcsResult.inputLab[0]} / a*{iccPcsResult.inputLab[1]} / b*
            {iccPcsResult.inputLab[2]}
          </div>
          <div>
            CIccPcsStepLabToXYZ (D50): X={iccPcsResult.pcsXyzD50[0]} · Y=
            {iccPcsResult.pcsXyzD50[1]} · Z={iccPcsResult.pcsXyzD50[2]}
          </div>
          <div>
            Device CMYK 분판: C {(iccPcsResult.spotTintCmyk[0] * 100).toFixed(1)}% · M{" "}
            {(iccPcsResult.spotTintCmyk[1] * 100).toFixed(1)}% · Y{" "}
            {(iccPcsResult.spotTintCmyk[2] * 100).toFixed(1)}% · K{" "}
            {(iccPcsResult.spotTintCmyk[3] * 100).toFixed(1)}%
          </div>
          <div>
            CIccMruCache&lt;float&gt;::Apply(0x100027128):{" "}
            <span className="font-semibold text-accent">
              {iccPcsResult.mruCacheHit ? "MRU HIT" : "MRU MISS"}
            </span>{" "}
            ({iccPcsResult.appliedSteps.length} PCS Steps)
          </div>
        </div>
      </div>

      {/* Column 3: PWTcpRemoteCommander Companion Mode (G#1:2022.12) & PWAiDisturbanceImageGenerator */}
      <div className="rounded border border-line bg-panel p-2.5">
        <div className="mb-1.5 font-semibold text-fg">
          3. 컴패니언 모드 (`G#1:2022.12`) &amp; AI 학습 교란 필터
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {CSP_COMPANION_REMOTE_TAB_KINDS.map((tab) => (
            <button
              key={tab}
              type="button"
              data-testid={`csp-companion-tab-${tab}`}
              onClick={() => setCompanionState((prev) => ({ ...prev, selectedTab: tab as CspCompanionRemoteTabKind }))}
              className={`rounded border px-1.5 py-0.5 text-[0.62rem] ${
                companionState.selectedTab === tab
                  ? "border-accent bg-accent/15 font-semibold text-accent"
                  : "border-line bg-card text-fg-2"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {(["ZoomIn", "ZoomOut", "RotateLeft", "RotateRight", "ReverseHorz", "ResetPosition"] as const).map(
            (cmd) => (
              <button
                key={cmd}
                type="button"
                data-testid={`csp-companion-nav-${cmd}`}
                onClick={() =>
                  setCompanionState((prev) =>
                    applyCspCompanionNavigatorCommand(prev, cmd as CspCompanionNavigatorCommand),
                  )
                }
                className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.62rem] hover:border-accent"
              >
                {cmd}
              </button>
            ),
          )}
        </div>
        <CspPwEditSliderJoint
          label="PWAiDisturbanceImageGenerator 강도"
          value={aiDisturbanceIntensity}
          min={0}
          max={100}
          unit="%"
          onChange={setAiDisturbanceIntensity}
        />
        <div
          data-testid="csp-companion-ai-readout"
          className="mt-2 space-y-1 rounded bg-card p-2 text-[0.64rem]"
        >
          <div>
            PWTcpRemoteCommander({companionState.specVersion}): 활성 탭{" "}
            <strong>{companionState.selectedTab}</strong> · 배율 {companionState.zoomPercent}% · 회전{" "}
            {companionState.rotationDeg}° · 좌우반전 {companionState.flipHorizontal ? "ON" : "OFF"} (
            {CSP_COMPANION_NAVIGATOR_COMMANDS.length} DoNavigator 명령)
          </div>
          <div>
            PWTimeLapseAiDisturbanceFilter: 노이즈 강도 {aiDisturbanceSummary.intensity}% · 평균 ΔRGB{" "}
            {aiDisturbanceSummary.meanAbsoluteDelta} · PSNR {aiDisturbanceSummary.psnrDb} dB
          </div>
        </div>
      </div>
    </div>
  );
}
