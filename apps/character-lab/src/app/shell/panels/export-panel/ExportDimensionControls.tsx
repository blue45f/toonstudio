import { CAMERA_FRAMING_MODES } from "../../../../contracts";
import {
  MAX_PNG_EXPORT_DIMENSION,
  MAX_SETTLE_STEPS,
  MIN_EXPORT_DIMENSION,
} from "../../../../export/export-session";
import { FRAMING_LABELS_KO, clampExportInt } from "../export-panel-helpers";

import { ExportPresetRows } from "./ExportStatusSection";

import type { CameraFramingMode } from "../../../../contracts";

export interface ExportDimensionControlsProps {
  readonly idsPrefix: string;
  readonly width: number;
  readonly height: number;
  readonly framing: CameraFramingMode;
  readonly settleSteps: number;
  readonly onChangeWidth: (next: number) => void;
  readonly onChangeHeight: (next: number) => void;
  readonly onChangeFraming: (next: CameraFramingMode) => void;
  readonly onChangeSettleSteps: (next: number) => void;
}

export function ExportDimensionControls({
  idsPrefix,
  width,
  height,
  framing,
  settleSteps,
  onChangeWidth,
  onChangeHeight,
  onChangeFraming,
  onChangeSettleSteps,
}: ExportDimensionControlsProps) {
  return (
    <>
      <ExportPresetRows
        width={width}
        height={height}
        framing={framing}
        onSelectPreset={(w, h, mode) => {
          onChangeWidth(w);
          onChangeHeight(h);
          onChangeFraming(mode);
        }}
      />
      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-width`}>너비(px)</label>
        <input
          id={`${idsPrefix}-width`}
          type="number"
          min={MIN_EXPORT_DIMENSION}
          max={MAX_PNG_EXPORT_DIMENSION}
          value={width}
          onChange={(event) => onChangeWidth(clampExportInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, width))}
        />
        <label htmlFor={`${idsPrefix}-height`}>높이(px)</label>
        <input
          id={`${idsPrefix}-height`}
          type="number"
          min={MIN_EXPORT_DIMENSION}
          max={MAX_PNG_EXPORT_DIMENSION}
          value={height}
          onChange={(event) => onChangeHeight(clampExportInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, height))}
        />
      </div>
      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-framing`}>프레이밍</label>
        <select
          id={`${idsPrefix}-framing`}
          value={framing}
          onChange={(event) => onChangeFraming(event.target.value as CameraFramingMode)}
        >
          {CAMERA_FRAMING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {FRAMING_LABELS_KO[mode]}
            </option>
          ))}
        </select>
        <label htmlFor={`${idsPrefix}-settle`}>물리 settle 스텝</label>
        <input
          id={`${idsPrefix}-settle`}
          type="number"
          min={0}
          max={MAX_SETTLE_STEPS}
          value={settleSteps}
          onChange={(event) => onChangeSettleSteps(clampExportInt(event.target.value, 0, MAX_SETTLE_STEPS, 0))}
        />
      </div>
    </>
  );
}
