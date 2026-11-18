import { Anchor, DoorOpen, Link2, SlidersHorizontal } from "lucide-react";

import {
  ARTICULATED_V20_PROP_PROFILES,
  type ArticulatedPropIkBridgeEvaluation,
  type ArticulatedV20PropId,
} from "./studio-bg3d-articulated-ik-bridge";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dArticulatedIkBridgeCardProps {
  readonly disabled?: boolean;
  readonly evaluation: ArticulatedPropIkBridgeEvaluation;
  readonly onSelectPropId: (propId: ArticulatedV20PropId) => void;
  readonly onChangeOpenRatioPct: (pct: number) => void;
  readonly onToggleIkSnap: (enabled: boolean) => void;
  readonly onToggleFollow3dSpeedlines: (enabled: boolean) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V20 가동 배경 파츠 & 캐릭터 IK 스냅 소켓 카드:
 * 4px 그리드 간격, 중첩 반경(`rounded-2xl -> rounded-xl -> rounded-lg -> rounded-md`),
 * 16px stroke-1.5 라인 아이콘, 500/600 최대 웨이트, tabular-nums 고정폭 좌표 칩을 준수한다.
 */
export function StudioBg3dArticulatedIkBridgeCard({
  disabled = false,
  evaluation,
  onSelectPropId,
  onChangeOpenRatioPct,
  onToggleIkSnap,
  onToggleFollow3dSpeedlines,
}: StudioBg3dArticulatedIkBridgeCardProps) {
  return (
    <section
      data-testid="bg3d-blender-articulated-ik-section"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3 text-xs text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
          <DoorOpen size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>5C. 개폐형 가동 파츠(V20) · 캐릭터 IK 스냅 소켓 브리지</span>
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={evaluation.ikSnapEnabled}
            data-testid="bg3d-blender-ik-snap-toggle"
            onClick={() => onToggleIkSnap(!evaluation.ikSnapEnabled)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1 font-mono text-xs font-medium tabular-nums ${
              evaluation.ikSnapEnabled
                ? "border-accent bg-raised text-fg"
                : "border-line bg-card text-fg-3 hover:bg-raised"
            } ${MOTION_PRESS}`}
          >
            <Anchor size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
            <span>{evaluation.ikSnapEnabled ? "IK 소켓 스냅 ON (0.0분)" : "IK 소켓 스냅 OFF"}</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            aria-pressed={evaluation.follow3dSpeedlinesEnabled}
            data-testid="bg3d-blender-speedline-anchor-toggle"
            onClick={() => onToggleFollow3dSpeedlines(!evaluation.follow3dSpeedlinesEnabled)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1 font-mono text-xs font-medium tabular-nums ${
              evaluation.follow3dSpeedlinesEnabled
                ? "border-accent bg-raised text-fg"
                : "border-line bg-card text-fg-3 hover:bg-raised"
            } ${MOTION_PRESS}`}
          >
            <Link2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
            <span>
              {evaluation.follow3dSpeedlinesEnabled
                ? "follow-3d 속도선 고정 (0.0px)"
                : "속도선 수동 추적"}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-card p-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 lg:col-span-5">
          <img
            src={evaluation.profile.previewUrl}
            alt={evaluation.profile.labelKo}
            loading="lazy"
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-lg bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-fg">
              {evaluation.profile.mechanismLabelKo}
            </span>
            <span
              data-testid="bg3d-blender-articulated-kinematics-readout"
              className="mt-0.5 block font-mono text-xs tabular-nums text-fg-2"
            >
              {evaluation.kinematicsSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-2 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            {ARTICULATED_V20_PROP_PROFILES.map((prop) => {
              const active = prop.id === evaluation.profile.id;
              return (
                <button
                  key={prop.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-v20-prop-${prop.id}`}
                  onClick={() => onSelectPropId(prop.id)}
                  className={`min-h-9 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    active
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-panel text-fg-2 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  {prop.labelKo}
                </button>
              );
            })}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-1.5">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-medium tabular-nums text-fg">
              <SlidersHorizontal size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span>가동 파츠 개폐율: {evaluation.openRatioPct}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              disabled={disabled}
              aria-label="V20 배경 가동 파츠 개폐율 퍼센트"
              data-testid="bg3d-blender-v20-open-slider"
              value={evaluation.openRatioPct}
              onChange={(e) => onChangeOpenRatioPct(Number(e.target.value))}
              className="w-40 accent-accent"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {evaluation.ikSockets.map((socket) => (
          <div
            key={socket.socketId}
            data-testid={`bg3d-blender-ik-socket-${socket.socketId}`}
            className="rounded-xl border border-line bg-card px-3 py-2"
          >
            <span className="block truncate text-xs font-medium text-fg">{socket.labelKo}</span>
            <span className="mt-1 block font-mono text-xs tabular-nums text-fg-3">
              X {socket.positionMeters[0].toFixed(2)} · Y {socket.positionMeters[1].toFixed(2)} · Z{" "}
              {socket.positionMeters[2].toFixed(2)}m
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {evaluation.handoffProtocolSteps.map((step) => (
          <div
            key={step.stepId}
            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <span className="block truncate text-xs font-medium text-fg">{step.titleKo}</span>
              <span className="block truncate font-mono text-xs tabular-nums text-fg-3">
                {step.detailKo}
              </span>
            </div>
            <span
              className={`size-2 shrink-0 rounded-full ${step.ready ? "bg-[#4cc38a]" : "bg-[#e5484d]"}`}
              aria-hidden
            />
          </div>
        ))}
      </div>

      <p
        data-testid="bg3d-blender-ik-summary-readout"
        className="font-mono text-xs tabular-nums text-fg-2"
      >
        {evaluation.ikSummaryKo}
      </p>
    </section>
  );
}
