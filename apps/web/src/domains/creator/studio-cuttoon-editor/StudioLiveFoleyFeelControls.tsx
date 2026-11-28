import { Brush, Cpu, Gauge, PenTool, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  cycleStudioTactileReliefMode,
  getStudioTactileReliefMode,
  hydrateInteractiveStudioTactileReliefMode,
  subscribeStudioTactileReliefMode,
  type StudioTactileReliefMode,
} from "../brush/studio-tactile-physical-relief-runtime";
import {
  isStudioSupergapRuntimeHubOpen,
  subscribeStudioSupergapRuntimeHubOpen,
  toggleStudioSupergapRuntimeHub,
} from "../runtime-leaves/studio-supergap-runtime-hub-lazy-bridge";
import { clearStudioDynamicCoverageCommittedCache } from "../studio-dynamic-brush-coverage-renderer";

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
import {
  cycleLiveNibVfxMode,
  getLiveNibVfxMode,
  subscribeLiveNibVfxMode,
  type NibTactileVfxMode,
} from "./studio-live-nib-vfx-bridge";

export interface StudioLiveFoleyFeelControlsProps {
  readonly blocked: boolean;
  readonly blockedReason?: string;
  readonly blockedReasonId: string;
  /** 상단 퀵 바처럼 별도 필압 칩이 있을 때 중복 필압 감도 칩을 숨긴다(단독 호출 기본값 false). */
  readonly hidePressureChip?: boolean;
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

function formatNibVfxModeShort(
  mode: NibTactileVfxMode,
  bt: (ko: string, en: string) => string,
): string {
  if (mode === "vivid") return bt("생생함", "Vivid");
  if (mode === "off") return bt("꺼짐", "Off");
  return bt("은은함", "Subtle");
}

function formatTactileReliefShort(
  mode: StudioTactileReliefMode,
  bt: (ko: string, en: string) => string,
): string {
  if (mode === "vivid") return bt("강조", "Vivid");
  if (mode === "off") return bt("꺼짐", "Off");
  return bt("입체", "Sculpted");
}

/**
 * 빠른 드로잉 인체공학 바의 원클릭 필기음(슥삭 Foley) · 필기감 FX · 필압 감도 커브 사이클 버튼.
 * Calm Atelier 토큰(`.studio-drawing-ergonomics-chip`, 44px 터치 타깃, `word-break: keep-all`)을 따른다.
 */
export function StudioLiveFoleyFeelControls({
  blocked,
  blockedReason,
  blockedReasonId,
  hidePressureChip = false,
  onPushCue,
}: StudioLiveFoleyFeelControlsProps) {
  const bt = useBilingual("studio.drawingClarity");
  const [foleyState, setFoleyState] = useState<StudioLiveFoleyState>(() => getLiveFoleyState());
  const [pressureCurve, setPressureCurve] = useState<StudioPressureCurvePreset>(() =>
    getStudioPressureCurvePreset(),
  );
  const [nibVfxMode, setNibVfxMode] = useState<NibTactileVfxMode>(() => getLiveNibVfxMode());
  const [tactileReliefMode, setTactileReliefMode] = useState<StudioTactileReliefMode>(() =>
    getStudioTactileReliefMode(),
  );
  const [supergapHubOpen, setSupergapHubOpen] = useState<boolean>(() =>
    isStudioSupergapRuntimeHubOpen(),
  );

  useEffect(() => subscribeLiveFoleyState(setFoleyState), []);
  useEffect(() => subscribeStudioPressureCurve(setPressureCurve), []);
  useEffect(() => subscribeLiveNibVfxMode(setNibVfxMode), []);
  useEffect(() => subscribeStudioSupergapRuntimeHubOpen(setSupergapHubOpen), []);
  useEffect(() => {
    setTactileReliefMode(hydrateInteractiveStudioTactileReliefMode());
    return subscribeStudioTactileReliefMode(setTactileReliefMode);
  }, []);

  const foleyShort = formatFoleyPresetShort(foleyState.preset, bt);
  const pressureShort = formatPressureCurveShort(pressureCurve, bt);
  const nibVfxShort = formatNibVfxModeShort(nibVfxMode, bt);
  const tactileReliefShort = formatTactileReliefShort(tactileReliefMode, bt);
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
          "종이 필기음 전환 (차분함 → 생생함 → 무음)",
          "Cycle paper sound (Quiet → Vivid → Muted)",
        )}
      >
        {foleyState.preset === "silent-focus" ? (
          <VolumeX size={15} aria-hidden />
        ) : foleyState.preset === "lively-asmr" ? (
          <Volume2 size={15} aria-hidden />
        ) : (
          <Volume1 size={15} aria-hidden />
        )}
        <span>
          <span className="studio-drawing-ergonomics-compact-prefix">{`${bt("필기음", "Foley")} · `}</span>
          {foleyShort}
        </span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip [word-break:keep-all]"
        aria-pressed={nibVfxMode !== "off"}
        data-studio-nib-vfx-mode={nibVfxMode}
        data-studio-aux-control="true"
        data-studio-compact-icon-chip="true"
        onClick={() => {
          const next = cycleLiveNibVfxMode();
          onPushCue?.("V", bt("펜촉 효과", "Nib feel"), formatNibVfxModeShort(next, bt));
        }}
        title={bt(
          "펜촉 필기감 효과 전환 (은은함 → 생생함 → 꺼짐)",
          "Cycle nib tactile effect (Subtle → Vivid → Off)",
        )}
      >
        <PenTool size={15} aria-hidden />
        <span>{`${bt("펜촉 효과", "Nib feel")} · ${nibVfxShort}`}</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip [word-break:keep-all]"
        aria-pressed={tactileReliefMode !== "off"}
        data-studio-tactile-relief-mode={tactileReliefMode}
        data-studio-aux-control="true"
        data-studio-compact-icon-chip="true"
        onClick={() => {
          const next = cycleStudioTactileReliefMode();
          clearStudioDynamicCoverageCommittedCache();
          onPushCue?.("T", bt("실물 질감", "Tactile relief"), formatTactileReliefShort(next, bt));
        }}
        title={bt(
          "2.5D 실물 브러시 질감 셰이딩 전환 (입체 → 강조 → 꺼짐)",
          "Cycle 2.5D physical brush relief shading (Sculpted → Vivid → Off)",
        )}
      >
        <Brush size={15} aria-hidden />
        <span>{`${bt("실물 질감", "Tactile")} · ${tactileReliefShort}`}</span>
      </button>

      <button
        type="button"
        className="studio-drawing-ergonomics-chip [word-break:keep-all]"
        aria-pressed={supergapHubOpen}
        data-studio-supergap-hub-trigger="true"
        data-studio-aux-control="true"
        data-studio-compact-icon-chip="true"
        onClick={() => {
          const nextOpen = toggleStudioSupergapRuntimeHub();
          onPushCue?.(
            "E",
            bt("초격차 엔진 허브", "Super-Gap Engine Hub"),
            nextOpen ? bt("열림", "Open") : bt("닫힘", "Closed"),
          );
        }}
        title={bt(
          "데스크톱 네이티브 GPU/NPU 브릿지 및 초격차 런타임 엔진 허브 열기",
          "Open Desktop Native GPU/NPU Bridge and Super-Gap Runtime Engine Hub",
        )}
      >
        <Cpu size={15} aria-hidden />
        <span>{bt("엔진 허브", "Engine Hub")}</span>
      </button>

      {hidePressureChip ? null : (
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
                  "펜 필압 감도 전환 (표준 → 가볍게 → 강하게)",
                  "Cycle pen pressure feel (Standard → Soft → Firm)",
                )
          }
        >
          <Gauge size={15} aria-hidden />
          <span>{`${bt("필압 감도", "Pressure")} · ${pressureShort}`}</span>
        </button>
      )}
    </>
  );
}
