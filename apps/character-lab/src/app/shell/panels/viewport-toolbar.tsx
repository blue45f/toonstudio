import { formatShaperInputStyleGuide } from "../../../export/recipe-file";

import { SHAPER_GIZMO_MODES } from "./shaper-control-points";
import { ViewportCompositionBar } from "./viewport-backdrop-overlay";
import { ViewportDuoShotControls } from "./viewport-duo-shot-guide";
import { ViewportHandPropControls } from "./viewport-hand-prop-controls";
import { ViewportMangaFxControls, clampMangaFxIntensity } from "./viewport-manga-fx-overlay";
import { ViewportPresetSelect } from "./viewport-preset-select";
import { ViewportSceneDirectorControls } from "./viewport-scene-director";

import type { CameraFraming, DuoPartnerExpressionPreset, DuoPartnerStance, HandPropId } from "../../../contracts";
import type { ShaperGizmoMode } from "./shaper-control-points";
import type { DuoShotState } from "./viewport-duo-shot-guide";
import type { ShaperCameraInputStyle, ShaperPivotMode } from "./viewport-interactions";
import type { MangaSfxStampPreset, ViewportMangaFxState } from "./viewport-manga-fx-overlay";
import type { WebtoonSceneDirectorPresetId } from "./viewport-scene-director";
import type { ComponentProps, Dispatch, SetStateAction } from "react";

interface StateControl<T> {
  readonly value: T;
  readonly set: Dispatch<SetStateAction<T>>;
}

interface ViewportToolbarProps {
  readonly engineReady: boolean;
  readonly camera: {
    readonly framing: CameraFraming["mode"];
    readonly inputStyle: ShaperCameraInputStyle;
    readonly onFraming: (mode: CameraFraming["mode"]) => void;
    readonly onResetView: () => void;
    readonly setInputStyle: (style: ShaperCameraInputStyle) => void;
  };
  readonly composition: Omit<ComponentProps<typeof ViewportCompositionBar>, "engineReady">;
  readonly duoShot: {
    readonly state: DuoShotState;
    readonly update: (updater: (prev: DuoShotState) => DuoShotState) => void;
    readonly summaryKo: string;
    readonly duo3dSupported: boolean;
    readonly duo3dBusy: boolean;
    readonly applyEyeContact: () => void;
  };
  readonly mangaFx: {
    readonly state: ViewportMangaFxState;
    readonly set: Dispatch<SetStateAction<ViewportMangaFxState>>;
    readonly sfxBusy?: boolean;
    readonly onToggle: () => void;
    readonly onChangeSfxStamp: (stamp: MangaSfxStampPreset) => void;
  };
  readonly director: {
    readonly engineReady: boolean;
    readonly busy: boolean;
    readonly activeDirectorId: WebtoonSceneDirectorPresetId | "";
    readonly duoPartnerActive?: boolean;
    readonly onSelectDirector: (presetId: WebtoonSceneDirectorPresetId | "") => void;
    readonly onCastDuoPartner?: () => void;
  };
  readonly handProp: ComponentProps<typeof ViewportHandPropControls>;
  readonly overlay: {
    readonly handles: StateControl<boolean>;
    readonly fingers: StateControl<boolean>;
    readonly controlPoints: StateControl<boolean>;
    readonly symmetry: StateControl<boolean>;
    readonly pivot: StateControl<ShaperPivotMode>;
    readonly gizmo: StateControl<ShaperGizmoMode>;
    readonly hud: StateControl<boolean>;
    readonly preset: { readonly value: string; readonly apply: (presetId: string) => void };
    readonly drawing: { readonly value: boolean; readonly set: (enabled: boolean) => void };
  };
}

const FRAMING_MODES: ReadonlyArray<{ readonly mode: CameraFraming["mode"]; readonly label: string }> = [
  { mode: "full-body", label: "전신" },
  { mode: "bust", label: "상반신" },
  { mode: "face", label: "얼굴" },
];

/** 도구막대 표시만 분리하고 상태·엔진 호출·명령 적용은 뷰포트에 둔다. */
export function ViewportToolbar({ engineReady, camera, composition, duoShot, mangaFx, director, handProp, overlay }: ViewportToolbarProps) {
  return (
    <div className="cl-viewport-toolbar" role="toolbar" aria-label="뷰포트 도구" style={{ position: "relative", flexShrink: 0, padding: 8, display: "flex", gap: 4, borderBottom: "1px solid var(--lab-line)" }}>
      <span className="cl-viewport-group" role="group" aria-label="카메라 프레이밍" style={{ display: "inline-flex", gap: 4 }}>
        {FRAMING_MODES.map((entry) => (
          <button key={entry.mode} type="button" className="cl-viewport-button" aria-pressed={camera.framing === entry.mode} disabled={!engineReady} onClick={() => camera.onFraming(entry.mode)}>{entry.label}</button>
        ))}
        <button type="button" className="cl-viewport-button" disabled={!engineReady} onClick={camera.onResetView} title="현재 프레이밍으로 시점을 되돌립니다(캔버스 더블클릭·0 키·F5 키와 같음)">시점 초기화</button>
        <select className="cl-viewport-select" aria-label="카메라 조작 방식" value={camera.inputStyle} title={formatShaperInputStyleGuide(camera.inputStyle).camControlToolTipText} onChange={(event) => camera.setInputStyle(event.target.value as ShaperCameraInputStyle)}>
          <option value="unity">Unity 조작</option>
          <option value="blender">Blender 조작</option>
          <option value="max">3ds Max 조작</option>
        </select>
      </span>
      <ViewportCompositionBar engineReady={engineReady} {...composition} />
      <ViewportDuoShotControls
        duoShot={duoShot.state}
        summaryKo={duoShot.summaryKo}
        duo3dSupported={duoShot.duo3dSupported}
        duo3dBusy={duoShot.duo3dBusy}
        onToggleDuoShot={() => duoShot.update((prev) => ({ ...prev, enabled: !prev.enabled }))}
        onChangePartner={(partnerId) => duoShot.update((prev) => ({ ...prev, partnerId }))}
        onChangeSide={(side) => duoShot.update((prev) => ({ ...prev, side }))}
        onChangeDistance={(distanceKey) => duoShot.update((prev) => ({ ...prev, distanceKey }))}
        onApplyEyeContact={duoShot.applyEyeContact}
        onToggleRender3dPartner={() => duoShot.update((prev) => ({ ...prev, render3dPartner: !prev.render3dPartner }))}
        onChangePartnerStance={(partnerStance: DuoPartnerStance) => duoShot.update((prev) => ({ ...prev, partnerStance }))}
        onChangePartnerExpression={(partnerExpression: DuoPartnerExpressionPreset) => duoShot.update((prev) => ({ ...prev, partnerExpression }))}
        onChangePartnerHandProp={(partnerHandPropId: HandPropId | "") => duoShot.update((prev) => ({ ...prev, partnerHandPropId }))}
      />
      <ViewportMangaFxControls
        mangaFx={mangaFx.state}
        {...(mangaFx.sfxBusy !== undefined ? { sfxBusy: mangaFx.sfxBusy } : {})}
        onToggleMangaFx={mangaFx.onToggle}
        onChangeBubblePreset={(bubblePreset) => mangaFx.set((prev) => ({ ...prev, bubblePreset }))}
        onChangeLinesPreset={(linesPreset) => mangaFx.set((prev) => ({ ...prev, linesPreset }))}
        onChangeSfxStamp={mangaFx.onChangeSfxStamp}
        onChangeDialogueText={(dialogueText) => mangaFx.set((prev) => ({ ...prev, dialogueText }))}
        onChangeIntensity={(intensity) => mangaFx.set((prev) => ({ ...prev, intensity: clampMangaFxIntensity(intensity) }))}
      />
      <ViewportSceneDirectorControls
        engineReady={director.engineReady}
        busy={director.busy}
        activeDirectorId={director.activeDirectorId}
        {...(director.duoPartnerActive !== undefined ? { duoPartnerActive: director.duoPartnerActive } : {})}
        onSelectDirector={director.onSelectDirector}
        {...(director.onCastDuoPartner ? { onCastDuoPartner: director.onCastDuoPartner } : {})}
      />
      <ViewportHandPropControls {...handProp} />
      <span className="cl-viewport-group" role="group" aria-label="오버레이" style={{ display: "inline-flex", gap: 4 }}>
        <button type="button" className="cl-viewport-button" aria-pressed={overlay.handles.value} onClick={() => overlay.handles.set((value) => !value)}>관절 핸들</button>
        <button type="button" className="cl-viewport-button" aria-pressed={overlay.fingers.value} disabled={!overlay.handles.value} onClick={() => overlay.fingers.set((value) => !value)}>손가락 핸들</button>
        <button type="button" className="cl-viewport-button" aria-pressed={overlay.controlPoints.value} title="SHAPER ControlPoint(초록색 구체): 3D 뷰포트에서 얼굴·체형 제어점을 직접 끌어 성형" onClick={() => overlay.controlPoints.set((value) => !value)}>형상 제어점</button>
        <button type="button" className="cl-viewport-button" aria-pressed={overlay.symmetry.value} disabled={!overlay.handles.value} title="SHAPER 대칭 포즈 조작(좌우 관절 대칭 회전/IK)" onClick={() => overlay.symmetry.set((value) => !value)}>대칭 조작</button>
        <button type="button" className="cl-viewport-button" aria-pressed={overlay.pivot.value === "direct"} disabled={!overlay.handles.value} title="SHAPER BoneManager.pivotIKMode 전환" onClick={() => overlay.pivot.set((mode) => (mode === "parent" ? "direct" : "parent"))}>직접 피벗</button>
        <select className="cl-viewport-select" aria-label="기즈모 조작 모드" value={overlay.gizmo.value} disabled={!overlay.handles.value} title="SHAPER PivotManager 기즈모 모드 전환 (단축키 Q / W / E / R)" onChange={(event) => overlay.gizmo.set(Number(event.target.value) as ShaperGizmoMode)}>
          {SHAPER_GIZMO_MODES.map((m) => <option key={m.mode} value={m.mode}>{m.shortLabelKo}</option>)}
        </select>
        <ViewportPresetSelect presetId={overlay.preset.value} onSelect={overlay.preset.apply} />
        <button type="button" className="cl-viewport-button" aria-pressed={overlay.hud.value} onClick={() => overlay.hud.set((value) => !value)}>HUD</button>
        <button type="button" className="cl-viewport-button" aria-pressed={overlay.drawing.value} disabled={!engineReady} onClick={() => overlay.drawing.set(!overlay.drawing.value)}>드로잉</button>
      </span>
    </div>
  );
}
