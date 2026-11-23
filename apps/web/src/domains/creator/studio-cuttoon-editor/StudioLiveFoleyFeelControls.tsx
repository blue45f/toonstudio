import { Gauge, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  cycleLiveFoleyPreset,
  cycleStudioPressureCurvePreset,
  getLiveFoleyState,
  getStudioPressureCurvePreset,
  subscribeLiveFoleyState,
  subscribeStudioPressureCurve,
  type StudioFoleyPresetId,
  type StudioLiveFoleyState,
  type StudioPressureCurvePreset,
} from "./studio-live-stroke-foley-bridge";

export interface StudioLiveFoleyFeelControlsProps {
  readonly blocked: boolean;
  readonly blockedReason?: string;
  readonly blockedReasonId: string;
  readonly onPushCue?: (keycap: string, label: string, value?: string) => void;
}

function formatFoleyPresetShort(
  preset: StudioFoleyPresetId,
  bt: (ko: string, en: string) => string,
): string {
  if (preset === "lively-asmr") return bt("ASMR", "ASMR");
  if (preset === "silent-focus") return bt("무음", "Muted");
  return bt("차분함", "Quiet");
}

function formatPressureCurveShort(
  preset: StudioPressureCurvePreset,
  bt: (ko: string, en: string) => string,
): string {
  if (preset === "soft") return bt("가볍게", "Soft");
  if (preset === "firm") return bt("강하게", "Firm");
  return bt("표준", "Standard");
}

/**
 * 빠른 드로잉 인체공학 바의 원클릭 필기음(슥삭 Foley) · 필압 감도 커브 사이클 버튼.
 * Calm Atelier 토큰(`.studio-drawing-ergonomics-chip`, 44px 터치 타깃, `word-break: keep-all`)을 따른다.
 */
export function StudioLiveFoleyFeelControls({
  blocked,
  blockedReason,
  blockedReasonId,
  onPushCue,
}: StudioLiveFoleyFeelControlsProps) {
  const bt = useBilingual("studio.drawingClarity");
  const [foleyState, setFoleyState] = useState<StudioLiveFoleyState>(() => getLiveFoleyState());
  const [pressureCurve, setPressureCurve] = useState<StudioPressureCurvePreset>(() =>
    getStudioPressureCurvePreset(),
  );

  useEffect(() => subscribeLiveFoleyState(setFoleyState), []);
  useEffect(() => subscribeStudioPressureCurve(setPressureCurve), []);

  const foleyShort = formatFoleyPresetShort(foleyState.preset, bt);
  const pressureShort = formatPressureCurveShort(pressureCurve, bt);
  const foleyActive = !foleyState.muted && foleyState.preset !== "silent-focus";

  return (
    <>
      <button
        type="button"
        className="studio-drawing-ergonomics-chip [word-break:keep-all]"
        aria-pressed={foleyActive}
        data-studio-foley-preset={foleyState.preset}
        data-studio-aux-control="true"
        onClick={() => {
          const next = cycleLiveFoleyPreset();
          onPushCue?.("F", bt("필기음", "Foley"), formatFoleyPresetShort(next.preset, bt));
        }}
        title={bt(
          "클릭할 때마다 종이 필기음(차분함 → ASMR → 무음)을 전환합니다",
          "Cycle live paper foley sound (Quiet → ASMR → Muted)",
        )}
      >
        {foleyState.preset === "silent-focus" ? (
          <VolumeX size={15} aria-hidden />
        ) : foleyState.preset === "lively-asmr" ? (
          <Volume2 size={15} aria-hidden />
        ) : (
          <Volume1 size={15} aria-hidden />
        )}
        <span>{`${bt("필기음", "Foley")} · ${foleyShort}`}</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip [word-break:keep-all]"
        disabled={blocked}
        aria-pressed={pressureCurve !== "standard"}
        aria-describedby={blocked && blockedReason ? blockedReasonId : undefined}
        data-studio-disabled-reason={blocked && blockedReason ? blockedReason : undefined}
        data-studio-pressure-curve={pressureCurve}
        data-studio-aux-control="true"
        onClick={() => {
          const next = cycleStudioPressureCurvePreset();
          onPushCue?.("P", bt("필압 감도", "Pressure feel"), formatPressureCurveShort(next, bt));
        }}
        title={
          blocked && blockedReason
            ? blockedReason
            : bt(
                "클릭할 때마다 펜 필압 감도 커브(표준 → 가볍게 → 강하게)를 전환합니다",
                "Cycle pen pressure sensitivity curve (Standard → Soft → Firm)",
              )
        }
      >
        <Gauge size={15} aria-hidden />
        <span>{`${bt("필압 감도", "Pressure")} · ${pressureShort}`}</span>
      </button>
    </>
  );
}
