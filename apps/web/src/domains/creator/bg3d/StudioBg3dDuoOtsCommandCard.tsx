import {
  Command,
  Film,
  GitCommitHorizontal,
  Users2,
  WifiOff,
} from "lucide-react";

import {
  DUO_EYELINE_PRESETS,
  type CameraAxisSideId,
  type DuoEyelinePresetId,
  type DuoOtsRemotionOfflineEvaluation,
} from "./studio-bg3d-duo-ots-remotion-offline";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dDuoOtsCommandCardProps {
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly cameraAxisSide: CameraAxisSideId;
  readonly networkOnline: boolean;
  readonly quickCommandQuery: string;
  readonly evaluation: DuoOtsRemotionOfflineEvaluation;
  readonly onSelectDuoId: (id: DuoEyelinePresetId) => void;
  readonly onToggleAxisCrossing: () => void;
  readonly onToggleNetworkOnline: () => void;
  readonly onChangeQuickCommandQuery: (query: string) => void;
}

/**
 * Unslop 9-Pass · Editor Chrome Design · Korean Typography 규격이 결합된
 * V29 2인 시선 교차·키 차이 듀오 마네킹 · 180도 연출축 가드 · 결정론적 무빙툰 ·
 * 오프라인 로컬 복구 큐 · Cmd+K 초성 빠른 프리셋 브리지 바.
 */
export function StudioBg3dDuoOtsCommandCard({
  disabled = false,
  disabledReason = "읽기 전용 상태에서는 듀오 프리셋과 연출축 설정을 변경할 수 없습니다",
  cameraAxisSide,
  networkOnline,
  quickCommandQuery,
  evaluation,
  onSelectDuoId,
  onToggleAxisCrossing,
  onToggleNetworkOnline,
  onChangeQuickCommandQuery,
}: StudioBg3dDuoOtsCommandCardProps) {
  const unavailableTitle = disabled ? disabledReason : undefined;

  return (
    <div
      data-testid="bg3d-blender-v29-duo-ots-card"
      className="flex flex-col gap-2 border-t border-line pt-3 text-xs leading-[1.4] [word-break:keep-all] [overflow-wrap:break-word]"
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Users2
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-fg-2"
            aria-hidden
          />
          <span>
            2인 시선 교차·키 차이 듀오 V29 · 180도 연출축 가드 · 무빙툰 결정론 · 오프라인 복구
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v29-axis180-badge"
          className="inline-flex min-h-7 items-center gap-2 rounded-md bg-raised px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span
            className={`size-2 rounded-full ${
              evaluation.axis180Compliant ? "bg-[#4cc38a]" : "bg-[#e5484d]"
            }`}
            aria-hidden
          />
          {evaluation.axis180StatusKo}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg bg-panel px-2.5 py-2 lg:col-span-5">
          <img
            src={evaluation.duo.previewUrl}
            alt={evaluation.duo.labelKo}
            loading="lazy"
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-medium text-fg">
              {evaluation.duo.labelKo}
            </span>
            <span
              data-testid="bg3d-blender-v29-duo-readout"
              className="mt-0.5 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.duoOtsSummaryKo}
            >
              {evaluation.duoOtsSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {DUO_EYELINE_PRESETS.map((item) => {
            const active = item.id === evaluation.duo.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                title={unavailableTitle}
                data-testid={`bg3d-blender-v29-duo-${item.id}`}
                onClick={() => onSelectDuoId(item.id)}
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

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-1.5 lg:col-span-6">
          <label className="inline-flex min-w-0 flex-1 items-center gap-2">
            <Command
              size={16}
              strokeWidth={1.5}
              className="shrink-0 text-fg-3"
              aria-hidden
            />
            <input
              type="text"
              disabled={disabled}
              title={unavailableTitle}
              value={quickCommandQuery}
              onChange={(e) => onChangeQuickCommandQuery(e.target.value)}
              placeholder="초성·키워드 빠른 호출 (예: ㄹㅍ, ㅇㅂㄷㅅㄷ)"
              aria-label="초성 및 키워드 빠른 프리셋 검색"
              data-testid="bg3d-blender-v29-cmdk-input"
              className="min-h-7 w-full rounded-md border border-line bg-card px-2 py-0.5 font-mono text-xs text-fg placeholder:text-fg-3"
            />
          </label>
          {evaluation.matchedCommands[0] ? (
            <button
              type="button"
              disabled={disabled}
              title={unavailableTitle}
              data-testid="bg3d-blender-v29-cmdk-apply-first"
              onClick={() =>
                onSelectDuoId(evaluation.matchedCommands[0]!.targetDuoId)
              }
              className={`min-h-7 shrink-0 rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-fg ${MOTION_PRESS}`}
            >
              {evaluation.matchedCommands[0].shortcutHint} 적용 (
              {evaluation.matchedCommands.length}건)
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-panel px-3 py-1.5 lg:col-span-6">
          <button
            type="button"
            disabled={disabled}
            title={unavailableTitle}
            data-testid="bg3d-blender-v29-axis-toggle"
            onClick={onToggleAxisCrossing}
            className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums ${
              cameraAxisSide === "same-side-safe"
                ? "border-line bg-card text-fg-2 hover:bg-raised"
                : "border-[#e5484d] bg-raised text-fg"
            } disabled:cursor-not-allowed disabled:opacity-45 ${MOTION_PRESS}`}
          >
            <GitCommitHorizontal size={16} strokeWidth={1.5} aria-hidden />
            {cameraAxisSide === "same-side-safe"
              ? "카메라 동일축 유지"
              : "180도 반대축 테스트"}
          </button>

          <button
            type="button"
            disabled={disabled}
            title={unavailableTitle}
            data-testid="bg3d-blender-v29-offline-toggle"
            onClick={onToggleNetworkOnline}
            className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums ${
              networkOnline
                ? "border-line bg-card text-fg-2 hover:bg-raised"
                : "border-accent bg-raised text-fg"
            } disabled:cursor-not-allowed disabled:opacity-45 ${MOTION_PRESS}`}
          >
            <WifiOff size={16} strokeWidth={1.5} aria-hidden />
            {networkOnline ? "온라인 실시간 저장" : "오프라인 복구 큐"}
          </button>
        </div>
      </div>

      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-1.5">
        <span
          data-testid="bg3d-blender-v29-motion-offline-readout"
          className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <Film size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span className="truncate" title={evaluation.motionOfflineSummaryKo}>
            {evaluation.motionOfflineSummaryKo}
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v29-roi-readout"
          className="font-mono text-xs tabular-nums text-fg-3"
        >
          {evaluation.roiSummaryKo}
        </span>
      </div>
    </div>
  );
}
