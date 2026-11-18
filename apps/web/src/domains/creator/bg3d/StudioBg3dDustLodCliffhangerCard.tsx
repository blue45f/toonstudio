import {
  Archive,
  Cpu,
  Flame,
  Gauge,
  Smartphone,
} from "lucide-react";
import { useMemo, useState } from "react";

import { StudioBg3dVrmWebGpuBinaryGuardCard } from "./StudioBg3dVrmWebGpuBinaryGuardCard";
import {
  DEVICE_LOD_BUDGET_SPECS,
  DUST_HEATHAZE_PROFILES,
  type DeviceLodTargetId,
  type DustHeatHazePresetId,
  type DustLodCliffhangerEvaluation,
} from "./studio-bg3d-dust-lod-cliffhanger-pack";
import {
  evaluateVrmPoseAndWebGpuGuard,
  type EditorChromeDensityTier,
  type VrmMannequinPoseId,
} from "./studio-bg3d-glb-binary-vrm-guard";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dDustLodCliffhangerCardProps {
  readonly disabled?: boolean;
  readonly evaluation: DustLodCliffhangerEvaluation;
  readonly onSelectHazeId: (id: DustHeatHazePresetId) => void;
  readonly onSelectDeviceId: (id: DeviceLodTargetId) => void;
  readonly onToggleProxyLod: () => void;
  readonly onChangeCliffhangerGutterPx: (px: number) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V27 잔류 연무·열기 아지랑이 ·
 * 모바일·태블릿 60fps 프록시 LOD 버짓 가드 · 엔딩 3컷 절단신공 텐션 스코어러 ·
 * .toonpack.json 통합 아카이브 번들 및 V28 VRM/WebGPU 가드 연결 카드.
 */
export function StudioBg3dDustLodCliffhangerCard({
  disabled = false,
  evaluation,
  onSelectHazeId,
  onSelectDeviceId,
  onToggleProxyLod,
  onChangeCliffhangerGutterPx,
}: StudioBg3dDustLodCliffhangerCardProps) {
  const [showPackJson, setShowPackJson] = useState(false);
  const [selectedPoseOverride, setSelectedPoseOverride] =
    useState<VrmMannequinPoseId | null>(null);
  const [chromeTier, setChromeTier] =
    useState<EditorChromeDensityTier>("simple");

  const resolvedPoseId: VrmMannequinPoseId =
    selectedPoseOverride ??
    (evaluation.haze.id === "calm-incense-wisp"
      ? "desk-seated-74cm"
      : evaluation.haze.id === "fissure-drift-plume"
        ? "railing-lean-110cm"
        : "portal-stride-132cm");

  const v28Evaluation = useMemo(
    () =>
      evaluateVrmPoseAndWebGpuGuard({
        poseId: resolvedPoseId,
        chromeTier,
        activeSceneTriangles: evaluation.activeSceneTriangles,
        baseV27WeeklyHoursSaved: evaluation.totalWeeklyHoursV27,
      }),
    [
      resolvedPoseId,
      chromeTier,
      evaluation.activeSceneTriangles,
      evaluation.totalWeeklyHoursV27,
    ],
  );

  return (
    <div
      data-testid="bg3d-blender-v27-dust-lod-card"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs leading-[1.4] [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Flame size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            잔류 연무·아지랑이 V27 · 모바일 60fps 프록시 LOD · 엔딩 절단신공 · .toonpack.json 번들
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v27-lod-budget-badge"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span
            className={`size-2 rounded-full ${
              evaluation.budget60FpsPassed ? "bg-[#4cc38a]" : "bg-[#e5484d]"
            }`}
            aria-hidden
          />
          {evaluation.device.labelKo} · {evaluation.estimatedFrameTimeMs}ms (
          {evaluation.budget60FpsPassed ? "60fps 정상" : "프록시 LOD 권장"})
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2 lg:col-span-5">
          <img
            src={evaluation.haze.previewUrl}
            alt={evaluation.haze.labelKo}
            loading="lazy"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 font-medium text-fg">
              <Cpu size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span className="truncate">{evaluation.haze.labelKo}</span>
            </span>
            <span
              data-testid="bg3d-blender-v27-haze-lod-readout"
              className="mt-1 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.hazeLodSummaryKo}
            >
              {evaluation.hazeLodSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {DUST_HEATHAZE_PROFILES.map((item) => {
            const active = item.id === evaluation.haze.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v27-haze-${item.id}`}
                onClick={() => {
                  setSelectedPoseOverride(null);
                  onSelectHazeId(item.id);
                }}
                className={`min-h-9 rounded-lg border px-3 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {item.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-7">
          <span className="inline-flex items-center gap-1.5 font-medium text-fg-2">
            <Smartphone size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span>디바이스 버짓:</span>
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {DEVICE_LOD_BUDGET_SPECS.map((dev) => {
              const active = dev.id === evaluation.device.id;
              return (
                <button
                  key={dev.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-v27-device-${dev.id}`}
                  onClick={() => onSelectDeviceId(dev.id)}
                  className={`min-h-8 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
                    active
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  {dev.labelKo}
                </button>
              );
            })}
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-blender-v27-proxy-lod-toggle"
              onClick={onToggleProxyLod}
              className={`min-h-8 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
                evaluation.proxyLodEnabled
                  ? "border-accent bg-raised text-fg"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              } ${MOTION_PRESS}`}
            >
              {evaluation.proxyLodEnabled ? "32% 프록시 LOD ON" : "원본 100% 메시"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-5">
          <span
            data-testid="bg3d-blender-v27-cliffhanger-readout"
            className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs tabular-nums text-fg-2"
          >
            <Gauge size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span className="truncate" title={evaluation.cliffhangerSummaryKo}>
              {evaluation.cliffhangerSummaryKo}
            </span>
          </span>
          <input
            type="range"
            min={360}
            max={960}
            step={40}
            disabled={disabled}
            aria-label="엔딩 절단신공 암전 스크롤 여백 픽셀"
            data-testid="bg3d-blender-v27-cliffhanger-slider"
            value={evaluation.cliffhangerBlackoutGutterPx}
            onChange={(e) => onChangeCliffhangerGutterPx(Number(e.target.value))}
            className="w-20 accent-accent"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2">
        <span
          data-testid="bg3d-blender-v27-pack-roi-readout"
          className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <Archive size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span className="truncate" title={evaluation.packRoiSummaryKo}>
            {evaluation.packRoiSummaryKo}
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-blender-v27-pack-toggle"
          onClick={() => setShowPackJson((prev) => !prev)}
          className={`min-h-8 shrink-0 rounded-md border border-line bg-card px-3 py-1 font-mono text-xs font-medium tabular-nums text-fg hover:bg-raised ${MOTION_PRESS}`}
        >
          {showPackJson ? ".toonpack.json 닫기" : ".toonpack.json 번들 확인"}
        </button>
      </div>

      {showPackJson ? (
        <pre
          data-testid="bg3d-blender-v27-pack-json"
          className="max-h-40 overflow-y-auto rounded-lg border border-line bg-[#141415] p-3 font-mono text-xs tabular-nums text-fg-2"
        >
          {evaluation.packManifestJsonString}
        </pre>
      ) : null}

      <StudioBg3dVrmWebGpuBinaryGuardCard
        disabled={disabled}
        continuityDigestHex={evaluation.packManifest.continuityDigestHex}
        evaluation={v28Evaluation}
        onSelectPoseId={setSelectedPoseOverride}
        onSelectChromeTier={setChromeTier}
      />
    </div>
  );
}
