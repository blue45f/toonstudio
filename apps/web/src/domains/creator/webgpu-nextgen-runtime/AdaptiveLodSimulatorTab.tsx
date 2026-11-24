/**
 * 탭 2: 적응형 스크린-스페이스 3D LOD · 절두체 컬링 · 프레임 예산 거버너 시뮬레이터.
 */

import { Activity, AlertTriangle, CheckCircle2, Gauge, Layers, RefreshCw } from "lucide-react";
import { useCallback, useId, useMemo, useState, type ReactElement } from "react";

import {
  AdaptiveLodGovernor,
  GPU_TIER_PROFILES,
  createDefaultWebtoonSceneAssets,
  type FrameRateTargetHz,
  type GpuDeviceTier,
  type LodGovernorFrameReport,
  type SceneAssetCategory,
} from "./adaptive-lod-governor";

export interface AdaptiveLodSimulatorTabProps {
  readonly isKo: boolean;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const CHIP_BASE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const CHIP_ACTIVE = "border-accent bg-accent text-on-accent";
const CHIP_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const BTN_SECONDARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none hover:border-accent hover:bg-raised ${FOCUS_RING}`;

const GPU_TIERS: readonly GpuDeviceTier[] = ["mobile-low", "tablet-mid", "desktop-pro"];
const FPS_TARGETS: readonly FrameRateTargetHz[] = [60, 120];
const VIEWPORT_HEIGHTS: readonly number[] = [720, 1080, 1440];

const CATEGORY_LABELS: Readonly<Record<SceneAssetCategory, readonly [string, string]>> = Object.freeze({
  character: ["캐릭터", "Character"],
  hair: ["헤어", "Hair"],
  prop: ["소품", "Prop"],
  background: ["배경", "Background"],
});

interface HysteresisJitterSummary {
  readonly testedFrames: number;
  readonly lodTransitions: number;
  readonly poppingSuppressedFrames: number;
}

function runHysteresisJitterTest(
  gpuTier: GpuDeviceTier,
  targetFps: FrameRateTargetHz,
  cameraOffsetZ: number,
  fovDeg: number,
  viewportHeightPx: number,
): HysteresisJitterSummary {
  const assets = createDefaultWebtoonSceneAssets();
  const governor = new AdaptiveLodGovernor({ hysteresisBandRatio: 0.18, minDwellFrames: 2 });
  const viewportWidthPx = Math.round((viewportHeightPx * 16) / 9);
  const prevLods = new Map<string, number>();

  let lodTransitions = 0;
  let poppingSuppressedFrames = 0;
  const testedFrames = 8;

  for (let frame = 0; frame < testedFrames; frame += 1) {
    // 미세 카메라 앞뒤 흔들림(±0.28m) 주입
    const jitter = frame % 2 === 0 ? 0.28 : -0.28;
    const report = governor.evaluateFrame({
      assets,
      gpuTier,
      targetFps,
      camera: {
        position: [0, 0.2, cameraOffsetZ + jitter],
        forward: [0, 0, -1],
        fovDeg,
        viewportWidthPx,
        viewportHeightPx,
        nearPlaneM: 0.1,
        farPlaneM: 120,
      },
    });
    poppingSuppressedFrames += report.hysteresisHeldCount;
    for (const d of report.decisions) {
      if (d.culled) continue;
      const before = prevLods.get(d.assetId);
      if (before !== undefined && before !== d.selectedLod) {
        lodTransitions += 1;
      }
      prevLods.set(d.assetId, d.selectedLod);
    }
  }

  return { testedFrames, lodTransitions, poppingSuppressedFrames };
}

export function AdaptiveLodSimulatorTab({ isKo }: AdaptiveLodSimulatorTabProps): ReactElement {
  const uid = useId();
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const sceneAssets = useMemo(() => createDefaultWebtoonSceneAssets(), []);
  const [gpuTier, setGpuTier] = useState<GpuDeviceTier>("tablet-mid");
  const [targetFps, setTargetFps] = useState<FrameRateTargetHz>(60);
  const [cameraOffsetZ, setCameraOffsetZ] = useState<number>(0);
  const [fovDeg, setFovDeg] = useState<number>(50);
  const [viewportHeightPx, setViewportHeightPx] = useState<number>(1080);
  const [jitterSummary, setJitterSummary] = useState<HysteresisJitterSummary | null>(null);

  const frameReport = useMemo<LodGovernorFrameReport>(() => {
    const governor = new AdaptiveLodGovernor({ hysteresisBandRatio: 0.16, minDwellFrames: 2 });
    const viewportWidthPx = Math.round((viewportHeightPx * 16) / 9);
    return governor.evaluateFrame({
      assets: sceneAssets,
      gpuTier,
      targetFps,
      camera: {
        position: [0, 0.2, cameraOffsetZ],
        forward: [0, 0, -1],
        fovDeg,
        viewportWidthPx,
        viewportHeightPx,
        nearPlaneM: 0.1,
        farPlaneM: 120,
      },
    });
  }, [cameraOffsetZ, fovDeg, gpuTier, sceneAssets, targetFps, viewportHeightPx]);

  const handleRunJitterTest = useCallback(() => {
    setJitterSummary(
      runHysteresisJitterTest(gpuTier, targetFps, cameraOffsetZ, fovDeg, viewportHeightPx),
    );
  }, [cameraOffsetZ, fovDeg, gpuTier, targetFps, viewportHeightPx]);

  const budgetHealthy =
    frameReport.withinFrameBudget &&
    frameReport.withinTriangleBudget &&
    frameReport.withinVramBudget;

  return (
    <div className="flex flex-col gap-4 [word-break:keep-all]">
      {/* GPU 티어 · 목표 주사율 · 해상도 컨트롤 */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-canvas p-3.5 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fg-2">
            {pick("디바이스 GPU 티어", "Device GPU Tier")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {GPU_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                aria-pressed={gpuTier === tier}
                onClick={() => setGpuTier(tier)}
                className={`${CHIP_BASE} ${gpuTier === tier ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {pick(GPU_TIER_PROFILES[tier].labelKo, GPU_TIER_PROFILES[tier].labelEn)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fg-2">
            {pick("목표 프레임 예산", "Target Frame Budget")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {FPS_TARGETS.map((hz) => (
              <button
                key={hz}
                type="button"
                aria-pressed={targetFps === hz}
                onClick={() => setTargetFps(hz)}
                className={`${CHIP_BASE} tabular-nums ${targetFps === hz ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {hz}fps ({hz === 120 ? "≤ 8.33ms" : "≤ 16.67ms"})
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fg-2">
            {pick("뷰포트 높이", "Viewport Height")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {VIEWPORT_HEIGHTS.map((height) => (
              <button
                key={height}
                type="button"
                aria-pressed={viewportHeightPx === height}
                onClick={() => setViewportHeightPx(height)}
                className={`${CHIP_BASE} tabular-nums ${viewportHeightPx === height ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {height}p
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 카메라 거리 오프셋 · FOV 슬라이더 + 히스테리시스 떨림 시험 */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-raised p-3.5 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${uid}-cam-distance`}
            className="flex items-center justify-between text-xs font-semibold text-fg"
          >
            <span>{pick("카메라 후퇴 거리 오프셋", "Camera Distance Offset")}</span>
            <span className="text-accent tabular-nums">
              {cameraOffsetZ >= 0 ? `+${cameraOffsetZ.toFixed(1)}m` : `${cameraOffsetZ.toFixed(1)}m`}
            </span>
          </label>
          <input
            id={`${uid}-cam-distance`}
            type="range"
            min={-2}
            max={24}
            step={0.5}
            value={cameraOffsetZ}
            onChange={(event) => setCameraOffsetZ(Number(event.target.value))}
            className="min-h-11 w-full accent-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${uid}-cam-fov`}
            className="flex items-center justify-between text-xs font-semibold text-fg"
          >
            <span>{pick("수직 시야각 (FOV)", "Vertical FOV")}</span>
            <span className="text-accent tabular-nums">{fovDeg}°</span>
          </label>
          <input
            id={`${uid}-cam-fov`}
            type="range"
            min={28}
            max={90}
            step={2}
            value={fovDeg}
            onChange={(event) => setFovDeg(Number(event.target.value))}
            className="min-h-11 w-full accent-accent"
          />
        </div>

        <div className="flex flex-col justify-center gap-1.5">
          <button type="button" onClick={handleRunJitterTest} className={BTN_SECONDARY}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("경계 떨림 히스테리시스 시험", "Test Hysteresis Anti-Pop")}</span>
          </button>
          {jitterSummary ? (
            <p className="text-xs text-fg-2 tabular-nums">
              {pick(
                `${jitterSummary.testedFrames}프레임 진동: LOD 전환 ${jitterSummary.lodTransitions}회 · 팝핑 억제 ${jitterSummary.poppingSuppressedFrames}회`,
                `${jitterSummary.testedFrames} jitter frames: ${jitterSummary.lodTransitions} switch(es), ${jitterSummary.poppingSuppressedFrames} pop-hold(s)`,
              )}
            </p>
          ) : null}
        </div>
      </div>

      {/* 프레임 예산 요약 4카드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>{pick("추정 GPU 프레임 시간", "Estimated Frame Time")}</span>
            {budgetHealthy ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
            )}
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${frameReport.withinFrameBudget ? "text-good" : "text-bad"}`}
          >
            {frameReport.estimatedFrameMs.toFixed(2)} ms
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("목표 한도", "Budget")}: ≤ {frameReport.frameBudgetMs.toFixed(2)} ms ({targetFps}Hz)
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>{pick("활성 삼각형 수", "Active Triangles")}</span>
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-fg tabular-nums">
            {frameReport.totalTriangles.toLocaleString()}
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("상한", "Limit")}: {frameReport.maxTrianglesBudget.toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>{pick("예상 씬 VRAM", "Estimated Scene VRAM")}</span>
            <Gauge className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-fg tabular-nums">
            {frameReport.totalVramMb.toFixed(1)} MiB
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("상한", "Limit")}: {frameReport.maxVramBudgetMb} MiB
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>{pick("가시 · 컬링 · 클램핑", "Visible · Culled · Clamped")}</span>
            <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-fg tabular-nums">
            {frameReport.totalVisibleAssets} / {frameReport.totalCulledAssets} /{" "}
            {frameReport.clampedAssetIds.length}
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            LOD0:{frameReport.lodHistogram[0]} · LOD1:{frameReport.lodHistogram[1]} · LOD2:
            {frameReport.lodHistogram[2]} · LOD3:{frameReport.lodHistogram[3]}
          </p>
        </div>
      </div>

      {/* 에셋별 LOD 및 투영 오차 표 */}
      <div className="overflow-x-auto rounded-lg border border-line bg-canvas">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-raised text-fg-2">
              <th className="px-3 py-2 font-semibold">{pick("3D 에셋", "3D Asset")}</th>
              <th className="px-3 py-2 font-semibold">{pick("분류", "Category")}</th>
              <th className="px-3 py-2 text-right font-semibold">{pick("거리", "Distance")}</th>
              <th className="px-3 py-2 text-right font-semibold">
                {pick("투영 오차", "Error (px)")}
              </th>
              <th className="px-3 py-2 text-center font-semibold">LOD</th>
              <th className="px-3 py-2 text-right font-semibold">{pick("삼각형", "Tris")}</th>
              <th className="px-3 py-2 text-right font-semibold">VRAM</th>
              <th className="px-3 py-2 font-semibold">{pick("상태", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {frameReport.decisions.map((item) => {
              const catLabel = CATEGORY_LABELS[item.category];
              return (
                <tr key={item.assetId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-medium text-fg">{item.name}</td>
                  <td className="px-3 py-2 text-fg-2">{pick(catLabel[0], catLabel[1])}</td>
                  <td className="px-3 py-2 text-right text-fg-2 tabular-nums">
                    {item.distanceM.toFixed(1)}m
                  </td>
                  <td className="px-3 py-2 text-right text-fg tabular-nums">
                    {item.projectedErrorPx.toFixed(2)} px
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {item.culled ? (
                      <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-fg-3">
                        CULLED
                      </span>
                    ) : (
                      <span className="rounded border border-accent/40 bg-accent-soft px-1.5 py-0.5 font-semibold text-accent">
                        LOD{item.selectedLod}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-fg tabular-nums">
                    {item.triangles.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-fg-2 tabular-nums">
                    {item.vramMb} MiB
                  </td>
                  <td className="px-3 py-2">
                    {item.culled ? (
                      <span className="inline-flex rounded border border-line bg-raised px-2 py-0.5 text-fg-3">
                        {item.budgetCulled
                          ? pick("예산 컬링", "Budget Culled")
                          : pick("절두체 컬링", "Frustum Culled")}
                      </span>
                    ) : item.clampedByBudget ? (
                      <span className="inline-flex rounded border border-warn/40 bg-warn/15 px-2 py-0.5 font-semibold text-warn">
                        {pick("예산 클램핑", "Budget Clamped")}
                      </span>
                    ) : (
                      <span className="inline-flex rounded border border-good/40 bg-good/15 px-2 py-0.5 font-semibold text-good">
                        {pick("최적", "Optimal")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
