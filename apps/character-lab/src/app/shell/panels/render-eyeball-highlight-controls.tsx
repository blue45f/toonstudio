/**
 * RenderPanel 4모드 안구 하이라이트(fix/cam/light/world + F10 시선 고정) 제어 서브컴포넌트.
 *
 * - 엔진이 `EyeballHighlightPort`를 지원하지 않으면 기존 미지원 안내(`eyeball-highlight-unavailable`)를 표시한다.
 * - 엔진이 포트를 제공하면 4모드 선택, 오프셋 X/Y, F10 카메라 시선 고정 토글 및 실측 회전각을 표시한다.
 */
import { useEffect } from "react";

import { EYEBALL_HIGHLIGHT_MODES, EYEBALL_HIGHLIGHT_MODE_LABELS_KO } from "../../../render/render-telemetry";

import type { EyeballHighlightConfig, EyeballHighlightState } from "../../../render/render-telemetry";
import type { EyeballHighlightMode } from "../../../render/toon-reference";

export interface RenderEyeballHighlightControlsProps {
  readonly idPrefix: string;
  readonly state: EyeballHighlightState | null;
  readonly onUpdate: (patch: Partial<EyeballHighlightConfig>) => void;
}

function isEyeballHighlightMode(value: string): value is EyeballHighlightMode {
  return (EYEBALL_HIGHLIGHT_MODES as readonly string[]).includes(value);
}

export function RenderEyeballHighlightControls({ idPrefix, state, onUpdate }: RenderEyeballHighlightControlsProps) {
  useEffect(() => {
    if (!state) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "F10" || event.repeat) return;
      event.preventDefault();
      onUpdate({ fixEyeballCam: !state.fixEyeballCam });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, onUpdate]);

  if (!state) {
    return (
      <p className="cl-render-reason" data-testid="eyeball-highlight-unavailable">
        안구 하이라이트 기준 변경은 현재 렌더러가 지원하지 않습니다. 시선·안구 회전은 표정 패널에서 조절합니다.
      </p>
    );
  }

  return (
    <div className="cl-render-group" data-testid="eyeball-highlight-controls">
      <div className="cl-render-row">
        <label htmlFor={`${idPrefix}-eyeball-hl-mode`}>안구 하이라이트 기준</label>
        <select
          id={`${idPrefix}-eyeball-hl-mode`}
          data-testid="eyeball-highlight-mode-select"
          value={state.mode}
          onChange={(event) => {
            if (isEyeballHighlightMode(event.target.value)) onUpdate({ mode: event.target.value });
          }}
        >
          {EYEBALL_HIGHLIGHT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {EYEBALL_HIGHLIGHT_MODE_LABELS_KO[mode]}
            </option>
          ))}
        </select>
      </div>
      <div className="cl-render-row">
        <label htmlFor={`${idPrefix}-eyeball-hl-x`}>하이라이트 X 오프셋</label>
        <input
          id={`${idPrefix}-eyeball-hl-x`}
          data-testid="eyeball-highlight-offset-x"
          type="range"
          min={-45}
          max={45}
          step={1}
          value={state.offsetPos[0]}
          onChange={(event) => onUpdate({ offsetPos: [Number(event.target.value), state.offsetPos[1]] })}
        />
        <output htmlFor={`${idPrefix}-eyeball-hl-x`}>{`${state.offsetPos[0]}°`}</output>
      </div>
      <div className="cl-render-row">
        <label htmlFor={`${idPrefix}-eyeball-hl-y`}>하이라이트 Y 오프셋</label>
        <input
          id={`${idPrefix}-eyeball-hl-y`}
          data-testid="eyeball-highlight-offset-y"
          type="range"
          min={-45}
          max={45}
          step={1}
          value={state.offsetPos[1]}
          onChange={(event) => onUpdate({ offsetPos: [state.offsetPos[0], Number(event.target.value)] })}
        />
        <output htmlFor={`${idPrefix}-eyeball-hl-y`}>{`${state.offsetPos[1]}°`}</output>
      </div>
      <div className="cl-render-row">
        <label htmlFor={`${idPrefix}-eyeball-hl-f10`}>F10 카메라 시선 고정</label>
        <input
          id={`${idPrefix}-eyeball-hl-f10`}
          data-testid="eyeball-highlight-f10-toggle"
          type="checkbox"
          checked={state.fixEyeballCam}
          onChange={(event) => onUpdate({ fixEyeballCam: event.target.checked })}
        />
      </div>
      <p className="cl-render-hint" data-testid="eyeball-highlight-readout">
        하이라이트 회전 ({state.highlightEulerDeg[0].toFixed(1)}°, {state.highlightEulerDeg[1].toFixed(1)}°) · F10 {state.fixEyeballCam ? "고정" : "해제"}
      </p>
    </div>
  );
}
