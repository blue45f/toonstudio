import {
  BookOpen,
  FlipHorizontal2,
  ShieldCheck,
  Volume2,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioBg3dAftermathReadabilityCard } from "./StudioBg3dAftermathReadabilityCard";
import {
  evaluateAftermathReadabilityAndVtt,
  type AftermathDamageStageId,
  type ReaderDisplayModeId,
} from "./studio-bg3d-aftermath-readability-vtt";
import {
  WIND_DRAPE_REFLECTION_PROFILES,
  type ContinuityLedgerSnapshot,
  type TankobonFormatId,
  type WindDrapeContinuityEvaluation,
  type WindDrapeFabricId,
} from "./studio-bg3d-wind-drape-continuity";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const FORMATS: readonly TankobonFormatId[] = ["B5", "A5"];

export interface StudioBg3dWindDrapeContinuityCardProps {
  readonly disabled?: boolean;
  readonly onomatopoeiaText?: string;
  readonly all70CutsDarkroomCompliant?: boolean;
  readonly evaluation: WindDrapeContinuityEvaluation;
  readonly lockedLedger: ContinuityLedgerSnapshot | null;
  readonly onSelectFabricId: (id: WindDrapeFabricId) => void;
  readonly onToggleLedgerLock: () => void;
  readonly onSelectTankobonFormatId: (id: TankobonFormatId) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V25 기류 연동 패브릭 · 하프 미러 반사창 ·
 * 회차 간 상태 연속성 원장(Continuity Ledger) · 단행본 B5/A5 오버스캔 · .toonaudio.json 및 V26 연결 카드.
 */
export function StudioBg3dWindDrapeContinuityCard({
  disabled = false,
  onomatopoeiaText = "촤르륵 · 영롱",
  all70CutsDarkroomCompliant = true,
  evaluation,
  lockedLedger,
  onSelectFabricId,
  onToggleLedgerLock,
  onSelectTankobonFormatId,
}: StudioBg3dWindDrapeContinuityCardProps) {
  const [showAudioJson, setShowAudioJson] = useState(false);
  const [aftermathId, setAftermathId] =
    useState<AftermathDamageStageId>("cracked");
  const [dialogueDensityPct, setDialogueDensityPct] = useState<number>(60);
  const [displayModeId, setDisplayModeId] =
    useState<ReaderDisplayModeId>("standard-srgb");

  useEffect(() => {
    if (evaluation.currentSnapshot.openRatioPct <= 25) setAftermathId("intact");
    else if (evaluation.currentSnapshot.openRatioPct <= 75)
      setAftermathId("cracked");
    else setAftermathId("shattered");
  }, [evaluation.currentSnapshot.openRatioPct]);

  const v26Evaluation = useMemo(
    () =>
      evaluateAftermathReadabilityAndVtt({
        aftermathId,
        dialogueDensityPct,
        baseBgLineThicknessPx:
          evaluation.currentSnapshot.kelvin >= 7500 ? 2.8 : 1.35,
        displayModeId,
        locale: evaluation.audioManifest.locale,
        onomatopoeiaText,
        continuityCompliant: evaluation.continuityCompliant,
        all70CutsDarkroomCompliant,
        tankobonFormatId: evaluation.tankobonSpec.formatId,
        baseV25WeeklyHoursSaved: evaluation.totalWeeklyHoursV25,
      }),
    [
      aftermathId,
      dialogueDensityPct,
      displayModeId,
      evaluation.currentSnapshot.kelvin,
      evaluation.audioManifest.locale,
      evaluation.continuityCompliant,
      evaluation.tankobonSpec.formatId,
      evaluation.totalWeeklyHoursV25,
      onomatopoeiaText,
      all70CutsDarkroomCompliant,
    ],
  );

  return (
    <div
      data-testid="bg3d-blender-v25-wind-drape-card"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Wind size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            기류 연동 패브릭·하프 미러 반사창 V25 · 연속성 원장 · 단행본 오버스캔 · .toonaudio.json
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v25-continuity-badge"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span
            className={`size-2 rounded-full ${
              evaluation.continuityCompliant ? "bg-[#4cc38a]" : "bg-[#e5484d]"
            }`}
            aria-hidden
          />
          {evaluation.continuityStatusKo}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2 lg:col-span-5">
          <img
            src={evaluation.profile.previewUrl}
            alt={evaluation.profile.labelKo}
            loading="lazy"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 font-medium text-fg">
              <FlipHorizontal2
                size={16}
                strokeWidth={1.5}
                className="shrink-0 text-fg-3"
                aria-hidden
              />
              <span className="truncate">{evaluation.profile.labelKo}</span>
            </span>
            <span
              data-testid="bg3d-blender-v25-drape-readout"
              className="mt-1 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.drapeMirrorSummaryKo}
            >
              {evaluation.drapeMirrorSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {WIND_DRAPE_REFLECTION_PROFILES.map((item) => {
            const active = item.id === evaluation.profile.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v25-fabric-${item.id}`}
                onClick={() => onSelectFabricId(item.id)}
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-5">
          <span className="inline-flex items-center gap-2 font-medium text-fg-2">
            <ShieldCheck size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span>회차 간 씬 스냅샷 고정</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            data-testid="bg3d-blender-v25-ledger-lock-btn"
            onClick={onToggleLedgerLock}
            className={`min-h-8 rounded-md border px-3 py-1 font-mono text-xs font-medium tabular-nums ${
              lockedLedger
                ? "border-accent bg-raised text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised"
            } ${MOTION_PRESS}`}
          >
            {lockedLedger ? "직전 회차 스냅샷 해제" : "직전 회차 스냅샷 잠금"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-7">
          <span
            data-testid="bg3d-blender-v25-overscan-readout"
            className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <BookOpen size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span className="truncate" title={evaluation.overscanSummaryKo}>
              {evaluation.overscanSummaryKo}
            </span>
          </span>
          <div className="flex items-center gap-1">
            {FORMATS.map((fmt) => {
              const active = fmt === evaluation.tankobonSpec.formatId;
              return (
                <button
                  key={fmt}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-v25-format-${fmt}`}
                  onClick={() => onSelectTankobonFormatId(fmt)}
                  className={`min-h-8 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
                    active
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  {fmt} 단행본
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2">
        <span
          data-testid="bg3d-blender-v25-audio-roi-readout"
          className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <Volume2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span className="truncate" title={evaluation.audioRoiSummaryKo}>
            {evaluation.audioRoiSummaryKo}
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-blender-v25-audio-toggle"
          onClick={() => setShowAudioJson((prev) => !prev)}
          className={`min-h-8 shrink-0 rounded-md border border-line bg-card px-3 py-1 font-mono text-xs font-medium tabular-nums text-fg hover:bg-raised ${MOTION_PRESS}`}
        >
          {showAudioJson ? ".toonaudio.json 닫기" : ".toonaudio.json 4스템 확인"}
        </button>
      </div>

      {showAudioJson ? (
        <pre
          data-testid="bg3d-blender-v25-audio-json"
          className="max-h-40 overflow-y-auto rounded-lg border border-line bg-[#141415] p-3 font-mono text-xs tabular-nums text-fg-2"
        >
          {evaluation.audioManifestJsonString}
        </pre>
      ) : null}

      <StudioBg3dAftermathReadabilityCard
        disabled={disabled}
        evaluation={v26Evaluation}
        onSelectAftermathId={setAftermathId}
        onChangeDialogueDensityPct={setDialogueDensityPct}
        onSelectDisplayModeId={setDisplayModeId}
      />
    </div>
  );
}
