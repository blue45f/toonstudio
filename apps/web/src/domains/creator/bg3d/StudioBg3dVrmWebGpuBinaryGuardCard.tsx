import {
  Binary,
  LayoutPanelTop,
  PersonStanding,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import { StudioBg3dDuoOtsCommandCard } from "./StudioBg3dDuoOtsCommandCard";
import {
  evaluateDuoOtsRemotionAndOffline,
  type CameraAxisSideId,
  type DuoEyelinePresetId,
} from "./studio-bg3d-duo-ots-remotion-offline";
import {
  VRM_POSE_MANNEQUIN_PROFILES,
  type EditorChromeDensityTier,
  type VrmMannequinPoseId,
  type VrmWebGpuGuardEvaluation,
} from "./studio-bg3d-glb-binary-vrm-guard";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const CHROME_TIERS: ReadonlyArray<{
  readonly id: EditorChromeDensityTier;
  readonly labelKo: string;
}> = [
  { id: "focus", labelKo: "집중 HUD" },
  { id: "simple", labelKo: "기본 5단" },
  { id: "pro", labelKo: "전문 계측" },
];

export interface StudioBg3dVrmWebGpuBinaryGuardCardProps {
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly continuityDigestHex?: string;
  readonly evaluation: VrmWebGpuGuardEvaluation;
  readonly onSelectPoseId: (id: VrmMannequinPoseId) => void;
  readonly onSelectChromeTier: (tier: EditorChromeDensityTier) => void;
}

/**
 * Editor Chrome Design(3단 밀도 · 28/32px 행 리듬 · 1px 헤어라인 분리 · 비활성 사유 명시) +
 * Korean Typography(keep-all · tabular-nums · 기울임 금지) +
 * Unslop 9-Pass & Canvas WebGPU 3D Guard 규격이 결합된 V28 VRM 포즈·바이너리·GPU 가드 및 V29 듀오 연출 바.
 */
export function StudioBg3dVrmWebGpuBinaryGuardCard({
  disabled = false,
  disabledReason = "작업대가 읽기 전용 상태여서 포즈와 밀도 설정을 변경할 수 없습니다",
  continuityDigestHex = "00000000",
  evaluation,
  onSelectPoseId,
  onSelectChromeTier,
}: StudioBg3dVrmWebGpuBinaryGuardCardProps) {
  const unavailableTitle = disabled ? disabledReason : undefined;
  const [duoOverrideId, setDuoOverrideId] =
    useState<DuoEyelinePresetId | null>(null);
  const [cameraAxisSide, setCameraAxisSide] =
    useState<CameraAxisSideId>("same-side-safe");
  const [networkOnline, setNetworkOnline] = useState(true);
  const [quickCommandQuery, setQuickCommandQuery] = useState("");

  const resolvedDuoId: DuoEyelinePresetId =
    duoOverrideId ??
    (evaluation.pose.id === "railing-lean-110cm"
      ? "rofan-gaze-24cm"
      : evaluation.pose.id === "desk-seated-74cm"
        ? "ots-table-dialogue"
        : "action-standoff-clash");

  const v29Evaluation = useMemo(
    () =>
      evaluateDuoOtsRemotionAndOffline({
        duoId: resolvedDuoId,
        cameraAxisSide,
        hasNeutralBridgeCut: false,
        networkOnline,
        quickCommandQuery,
        continuityDigestHex,
        baseV28WeeklyHoursSaved: evaluation.totalWeeklyHoursV28,
      }),
    [
      resolvedDuoId,
      cameraAxisSide,
      networkOnline,
      quickCommandQuery,
      continuityDigestHex,
      evaluation.totalWeeklyHoursV28,
    ],
  );

  return (
    <div
      data-testid="bg3d-blender-v28-vrm-webgpu-card"
      className="flex flex-col gap-2 border-t border-line pt-3 text-xs leading-[1.4] [word-break:keep-all] [overflow-wrap:break-word]"
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <PersonStanding
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-fg-2"
            aria-hidden
          />
          <span>
            VRM 1.0 해부학 포즈 마네킹 V28 · GPU 메모리 보호 · GLB 바이너리 무결성
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="작업대 표시 밀도 단계"
            className="inline-flex items-center gap-1 rounded-lg bg-panel p-0.5"
          >
            {CHROME_TIERS.map((tier) => {
              const active = tier.id === evaluation.chromeTier;
              return (
                <button
                  key={tier.id}
                  type="button"
                  disabled={disabled}
                  title={unavailableTitle}
                  data-testid={`bg3d-blender-v28-tier-${tier.id}`}
                  onClick={() => onSelectChromeTier(tier.id)}
                  className={`min-h-7 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${
                    active
                      ? "bg-raised text-fg"
                      : "text-fg-3 hover:text-fg-2"
                  } disabled:cursor-not-allowed disabled:opacity-45 ${MOTION_PRESS}`}
                >
                  {tier.labelKo}
                </button>
              );
            })}
          </div>
          <span
            data-testid="bg3d-blender-v28-anatomical-badge"
            className="inline-flex min-h-7 items-center gap-2 rounded-md bg-raised px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-fg"
          >
            <span
              className={`size-2 rounded-full ${
                evaluation.anatomicalLimitsCompliant
                  ? "bg-[#4cc38a]"
                  : "bg-[#e5484d]"
              }`}
              aria-hidden
            />
            {evaluation.anatomicalLimitsCompliant
              ? "관절 가동범위 정상 · GPU 누수 0건"
              : "관절 가동범위 초과 점검"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg bg-panel px-2.5 py-2 lg:col-span-5">
          <img
            src={evaluation.pose.previewUrl}
            alt={evaluation.pose.labelKo}
            loading="lazy"
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-medium text-fg">
              {evaluation.pose.labelKo}
            </span>
            <span
              data-testid="bg3d-blender-v28-vrm-readout"
              className="mt-0.5 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.vrmSummaryKo}
            >
              {evaluation.vrmSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {VRM_POSE_MANNEQUIN_PROFILES.map((item) => {
            const active = item.id === evaluation.pose.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                title={unavailableTitle}
                data-testid={`bg3d-blender-v28-pose-${item.id}`}
                onClick={() => {
                  setDuoOverrideId(null);
                  onSelectPoseId(item.id);
                }}
                className={`min-h-8 rounded-lg border px-3 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } disabled:cursor-not-allowed disabled:opacity-45 ${MOTION_PRESS}`}
              >
                {item.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      {evaluation.chromeTier !== "focus" ? (
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-1.5">
          <span
            data-testid="bg3d-blender-v28-webgpu-readout"
            className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <LayoutPanelTop
              size={16}
              strokeWidth={1.5}
              className="shrink-0 text-fg-3"
              aria-hidden
            />
            <span className="truncate" title={evaluation.webGpuBinarySummaryKo}>
              {evaluation.webGpuBinarySummaryKo}
            </span>
          </span>
          <span
            data-testid="bg3d-blender-v28-roi-readout"
            className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs tabular-nums text-fg-3"
          >
            <Binary size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span className="truncate" title={evaluation.roiSummaryKo}>
              {evaluation.roiSummaryKo}
            </span>
          </span>
        </div>
      ) : null}

      {disabled ? (
        <p
          data-testid="bg3d-blender-v28-disabled-reason"
          className="inline-flex items-center gap-1.5 text-xs text-fg-3"
        >
          <ShieldAlert size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
          <span>{disabledReason}</span>
        </p>
      ) : null}

      <StudioBg3dDuoOtsCommandCard
        disabled={disabled}
        cameraAxisSide={cameraAxisSide}
        networkOnline={networkOnline}
        quickCommandQuery={quickCommandQuery}
        evaluation={v29Evaluation}
        onSelectDuoId={setDuoOverrideId}
        onToggleAxisCrossing={() =>
          setCameraAxisSide((prev) =>
            prev === "same-side-safe"
              ? "crossed-axis-violation"
              : "same-side-safe",
          )
        }
        onToggleNetworkOnline={() => setNetworkOnline((prev) => !prev)}
        onChangeQuickCommandQuery={setQuickCommandQuery}
      />
    </div>
  );
}
