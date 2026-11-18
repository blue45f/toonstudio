import {
  Captions,
  CheckCheck,
  Eye,
  Hammer,
  PenLine,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioBg3dDustLodCliffhangerCard } from "./StudioBg3dDustLodCliffhangerCard";
import {
  AFTERMATH_DAMAGE_PROFILES,
  READER_DISPLAY_MODES,
  type AftermathDamageStageId,
  type AftermathReadabilityVttEvaluation,
  type ReaderDisplayModeId,
} from "./studio-bg3d-aftermath-readability-vtt";
import {
  evaluateDustLodCliffhangerAndPack,
  type DeviceLodTargetId,
  type DustHeatHazePresetId,
} from "./studio-bg3d-dust-lod-cliffhanger-pack";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dAftermathReadabilityCardProps {
  readonly disabled?: boolean;
  readonly locale?: "KO" | "EN" | "JA";
  readonly tankobonFormatId?: "B5" | "A5";
  readonly continuityDigestHex?: string;
  readonly evaluation: AftermathReadabilityVttEvaluation;
  readonly onSelectAftermathId: (id: AftermathDamageStageId) => void;
  readonly onChangeDialogueDensityPct: (pct: number) => void;
  readonly onSelectDisplayModeId: (id: ReaderDisplayModeId) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V26 실내 파손·흔적(Intact/Cracked/Shattered) ·
 * 대사 밀도 연동 배경 선화 자동 감쇠 · 독자 디스플레이(야간 OLED/색각 이상) 가독성 ·
 * .toonsubs.vtt 자막 큐시트 · 4채널 출고 게이트 및 V27 연무/프록시 LOD/절단신공 연결 카드.
 */
export function StudioBg3dAftermathReadabilityCard({
  disabled = false,
  locale = "KO",
  tankobonFormatId = "B5",
  continuityDigestHex = "00000000",
  evaluation,
  onSelectAftermathId,
  onChangeDialogueDensityPct,
  onSelectDisplayModeId,
}: StudioBg3dAftermathReadabilityCardProps) {
  const [showVttPreview, setShowVttPreview] = useState(false);
  const [hazeId, setHazeId] =
    useState<DustHeatHazePresetId>("fissure-drift-plume");
  const [deviceId, setDeviceId] =
    useState<DeviceLodTargetId>("mobile-midrange-60fps");
  const [proxyLodEnabled, setProxyLodEnabled] = useState(true);
  const [cliffhangerGutterPx, setCliffhangerGutterPx] = useState(780);

  useEffect(() => {
    if (evaluation.aftermath.id === "intact") setHazeId("calm-incense-wisp");
    else if (evaluation.aftermath.id === "cracked")
      setHazeId("fissure-drift-plume");
    else setHazeId("tempest-shockwave-haze");
  }, [evaluation.aftermath.id]);

  const v27Evaluation = useMemo(
    () =>
      evaluateDustLodCliffhangerAndPack({
        hazeId,
        deviceId,
        proxyLodEnabled,
        cliffhangerBlackoutGutterPx: cliffhangerGutterPx,
        locale,
        tankobonFormatId,
        continuityDigestHex,
        allFourChannelsReady: evaluation.allFourChannelsReady,
        baseV26WeeklyHoursSaved: evaluation.totalWeeklyHoursV26,
      }),
    [
      hazeId,
      deviceId,
      proxyLodEnabled,
      cliffhangerGutterPx,
      locale,
      tankobonFormatId,
      continuityDigestHex,
      evaluation.allFourChannelsReady,
      evaluation.totalWeeklyHoursV26,
    ],
  );

  return (
    <div
      data-testid="bg3d-blender-v26-aftermath-card"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Hammer size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            3단계 파손·흔적 V26 · 대사 선화 감쇠 · 독자 가독성 · .toonsubs.vtt · 4채널 출고 게이트
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v26-release-gate-badge"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span
            className={`size-2 rounded-full ${
              evaluation.allFourChannelsReady ? "bg-[#4cc38a]" : "bg-[#e5484d]"
            }`}
            aria-hidden
          />
          {evaluation.allFourChannelsReady
            ? "4채널 동시 출고 준비 완료 (5/5)"
            : "출고 전 연속성·가독성 점검 필요"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2 lg:col-span-5">
          <img
            src={evaluation.aftermath.previewUrl}
            alt={evaluation.aftermath.labelKo}
            loading="lazy"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 font-medium text-fg">
              <PenLine size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span className="truncate">{evaluation.aftermath.labelKo}</span>
            </span>
            <span
              data-testid="bg3d-blender-v26-aftermath-readout"
              className="mt-1 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.aftermathLineSummaryKo}
            >
              {evaluation.aftermathLineSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {AFTERMATH_DAMAGE_PROFILES.map((stage) => {
            const active = stage.id === evaluation.aftermath.id;
            return (
              <button
                key={stage.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v26-stage-${stage.id}`}
                onClick={() => onSelectAftermathId(stage.id)}
                className={`min-h-9 rounded-lg border px-3 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {stage.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-5">
          <label className="flex w-full items-center justify-between gap-2 text-xs">
            <span className="font-mono tabular-nums text-fg-2">
              대사 밀도 {evaluation.dialogueDensityPct}% (선화 -{evaluation.lineAttenuationPct}%)
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              disabled={disabled}
              aria-label="대사 밀도 연동 배경 선화 감쇠율"
              data-testid="bg3d-blender-v26-dialogue-slider"
              value={evaluation.dialogueDensityPct}
              onChange={(e) => onChangeDialogueDensityPct(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-7">
          <span
            data-testid="bg3d-blender-v26-display-readout"
            className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <Eye size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span className="truncate" title={evaluation.displayReadabilitySummaryKo}>
              {evaluation.displayReadabilitySummaryKo}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {READER_DISPLAY_MODES.map((mode) => {
              const active = mode.id === evaluation.displayMode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-v26-display-${mode.id}`}
                  onClick={() => onSelectDisplayModeId(mode.id)}
                  className={`min-h-8 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
                    active
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  {mode.labelKo}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-fg-2">
          <CheckCheck size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span>금요일 10분 출고:</span>
        </span>
        {evaluation.releaseChecklist.map((step) => (
          <span
            key={step.stepNo}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 font-mono text-xs tabular-nums text-fg-2"
          >
            <span
              className={`size-2 rounded-full ${
                step.passed ? "bg-[#4cc38a]" : "bg-[#e5484d]"
              }`}
              aria-hidden
            />
            {step.stepNo}. {step.labelKo}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2">
        <span
          data-testid="bg3d-blender-v26-vtt-roi-readout"
          className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <Captions size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span className="truncate" title={evaluation.vttReleaseRoiSummaryKo}>
            {evaluation.vttReleaseRoiSummaryKo}
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-blender-v26-vtt-toggle"
          onClick={() => setShowVttPreview((prev) => !prev)}
          className={`min-h-8 shrink-0 rounded-md border border-line bg-card px-3 py-1 font-mono text-xs font-medium tabular-nums text-fg hover:bg-raised ${MOTION_PRESS}`}
        >
          {showVttPreview ? ".toonsubs.vtt 닫기" : ".toonsubs.vtt 자막 확인"}
        </button>
      </div>

      {showVttPreview ? (
        <pre
          data-testid="bg3d-blender-v26-vtt-preview"
          className="max-h-40 overflow-y-auto rounded-lg border border-line bg-[#141415] p-3 font-mono text-xs tabular-nums text-fg-2"
        >
          {evaluation.vttContentString}
        </pre>
      ) : null}

      <StudioBg3dDustLodCliffhangerCard
        disabled={disabled}
        evaluation={v27Evaluation}
        onSelectHazeId={setHazeId}
        onSelectDeviceId={setDeviceId}
        onToggleProxyLod={() => setProxyLodEnabled((prev) => !prev)}
        onChangeCliffhangerGutterPx={setCliffhangerGutterPx}
      />
    </div>
  );
}
