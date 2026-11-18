/** 카메라 프레이밍·초기화·조작 방식 선택을 표시한다. */
import { formatShaperInputStyleGuide } from "../../../export/recipe-file";

import type { ShaperCameraInputStyle } from "./viewport-interactions";
import type { CameraFraming } from "../../../contracts";

const FRAMING_MODES: ReadonlyArray<{ readonly mode: CameraFraming["mode"]; readonly label: string }> = [
  { mode: "full-body", label: "전신" },
  { mode: "bust", label: "상반신" },
  { mode: "face", label: "얼굴" },
];

interface ViewportCameraControlsProps {
  readonly engineReady: boolean;
  readonly framing: CameraFraming["mode"];
  readonly inputStyle: ShaperCameraInputStyle;
  readonly onFraming: (mode: CameraFraming["mode"]) => void;
  readonly onResetView: () => void;
  readonly onChangeInputStyle: (style: ShaperCameraInputStyle) => void;
}

export function ViewportCameraControls({ engineReady, framing, inputStyle, onFraming, onResetView, onChangeInputStyle }: ViewportCameraControlsProps) {
  return (
    <span className="cl-viewport-group" role="group" aria-label="카메라 프레이밍" style={{ display: "inline-flex", gap: 4 }}>
      {FRAMING_MODES.map((entry) => (
        <button key={entry.mode} type="button" className="cl-viewport-button" aria-pressed={framing === entry.mode} disabled={!engineReady} onClick={() => onFraming(entry.mode)}>{entry.label}</button>
      ))}
      <button type="button" className="cl-viewport-button" disabled={!engineReady} onClick={onResetView} title="현재 프레이밍으로 시점을 되돌립니다(캔버스 더블클릭·0 키·F5 키와 같음)">시점 초기화</button>
      <select className="cl-viewport-select" aria-label="카메라 조작 방식" value={inputStyle} title={formatShaperInputStyleGuide(inputStyle).camControlToolTipText} onChange={(event) => onChangeInputStyle(event.target.value as ShaperCameraInputStyle)}>
        <option value="unity">Unity 조작</option>
        <option value="blender">Blender 조작</option>
        <option value="max">3ds Max 조작</option>
      </select>
    </span>
  );
}
