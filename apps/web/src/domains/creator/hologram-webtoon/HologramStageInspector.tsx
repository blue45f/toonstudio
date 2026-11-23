import type { CSSProperties } from "react";
import { Code2, Download } from "lucide-react";

import type {
  HologramLayerSpec,
  HologramPlaneRole,
  HologramProjectionResult,
} from "./hologram-spatial-projection";

export interface HologramStageInspectorProps {
  readonly instanceId: string;
  readonly resolvedLocale: "ko" | "en";
  readonly text: (ko: string, en: string) => string;
  readonly activeLayers: readonly HologramLayerSpec[];
  readonly mainProjection: HologramProjectionResult;
  readonly holofoilIntensity: number;
  readonly depthOfFieldStrength: number;
  readonly ipdMm: number;
  readonly clampComfortZone: boolean;
  readonly comfortDisparityLimitDeg: number;
  readonly showManifestPreview: boolean;
  readonly serializedManifest: string;
  readonly exportNotice: string | null;
  readonly onDepthChange: (role: HologramPlaneRole, nextDepthMm: number) => void;
  readonly onResetDepths: () => void;
  readonly onHolofoilChange: (value: number) => void;
  readonly onDepthOfFieldChange: (value: number) => void;
  readonly onIpdChange: (value: number) => void;
  readonly onToggleComfortGuard: () => void;
  readonly onExportManifest: () => void;
  readonly onToggleManifestPreview: () => void;
}

function formatSignedMm(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}mm` : `${rounded}mm`;
}

export function HologramStageInspector({
  instanceId,
  resolvedLocale,
  text,
  activeLayers,
  mainProjection,
  holofoilIntensity,
  depthOfFieldStrength,
  ipdMm,
  clampComfortZone,
  comfortDisparityLimitDeg,
  showManifestPreview,
  serializedManifest,
  exportNotice,
  onDepthChange,
  onResetDepths,
  onHolofoilChange,
  onDepthOfFieldChange,
  onIpdChange,
  onToggleComfortGuard,
  onExportManifest,
  onToggleManifestPreview,
}: HologramStageInspectorProps): React.JSX.Element {
  const transformLookup = new Map(mainProjection.transforms.map((item) => [item.role, item]));
  const meterRatio = Math.max(0, Math.min(1, mainProjection.effectiveMaxDisparityDeg / 5));
  const meterFillStyle: CSSProperties = {
    transform: `scaleX(${meterRatio.toFixed(4)})`,
  };

  return (
    <aside
      className="holo-inspector-column"
      aria-label={text("홀로그램 깊이·광학 인스펙터", "Hologram depth and optical inspector")}
    >
      <div className="holo-card">
        <div className="holo-card-header">
          <h3 className="holo-card-title">
            {text("5-평면 Z-깊이 제어 (mm)", "5-Plane Z-Depth Controls (mm)")}
          </h3>
          <button
            type="button"
            className="holo-pill-button"
            data-testid="holo-reset-depths-btn"
            onClick={onResetDepths}
          >
            {text("기본값", "Reset")}
          </button>
        </div>

        <div className="holo-slider-list">
          {activeLayers.map((layer) => {
            const sliderId = `${instanceId}-depth-${layer.role}`;
            const transform = transformLookup.get(layer.role);
            const labelText = resolvedLocale === "ko" ? layer.labelKo : layer.labelEn;
            const clampedNote =
              transform && transform.comfortClamped
                ? ` → ${formatSignedMm(transform.effectiveZMm)}`
                : "";

            return (
              <div key={layer.id} className="holo-slider-row">
                <div className="holo-slider-label-row">
                  <label htmlFor={sliderId} className="holo-slider-label">
                    {labelText}
                  </label>
                  <span className="holo-slider-value">
                    {formatSignedMm(layer.zMm)}
                    {clampedNote}
                  </span>
                </div>
                <input
                  id={sliderId}
                  type="range"
                  className="holo-range-input"
                  min={-180}
                  max={180}
                  step={1}
                  value={layer.zMm}
                  data-testid={`holo-depth-slider-${layer.role}`}
                  onChange={(event) => onDepthChange(layer.role, Number(event.target.value))}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="holo-card">
        <h3 className="holo-card-title">
          {text("광학 굴절 · 양안 스테레오", "Optical Refraction & Stereo")}
        </h3>
        <div className="holo-slider-list">
          <div className="holo-slider-row">
            <div className="holo-slider-label-row">
              <label htmlFor={`${instanceId}-holofoil`} className="holo-slider-label">
                {text("홀로포일 굴절 강도", "Holofoil refraction")}
              </label>
              <span className="holo-slider-value">{Math.round(holofoilIntensity * 100)}%</span>
            </div>
            <input
              id={`${instanceId}-holofoil`}
              type="range"
              className="holo-range-input"
              min={0}
              max={100}
              step={1}
              value={Math.round(holofoilIntensity * 100)}
              data-testid="holo-foil-slider"
              onChange={(event) => onHolofoilChange(Number(event.target.value) / 100)}
            />
          </div>

          <div className="holo-slider-row">
            <div className="holo-slider-label-row">
              <label htmlFor={`${instanceId}-dof`} className="holo-slider-label">
                {text("심도 흐림 (DoF)", "Depth-of-field blur")}
              </label>
              <span className="holo-slider-value">{Math.round(depthOfFieldStrength * 100)}%</span>
            </div>
            <input
              id={`${instanceId}-dof`}
              type="range"
              className="holo-range-input"
              min={0}
              max={100}
              step={1}
              value={Math.round(depthOfFieldStrength * 100)}
              data-testid="holo-dof-slider"
              onChange={(event) => onDepthOfFieldChange(Number(event.target.value) / 100)}
            />
          </div>

          <div className="holo-slider-row">
            <div className="holo-slider-label-row">
              <label htmlFor={`${instanceId}-ipd`} className="holo-slider-label">
                {text("양안 동공 간격 (IPD)", "Stereo IPD")}
              </label>
              <span className="holo-slider-value">{ipdMm}mm</span>
            </div>
            <input
              id={`${instanceId}-ipd`}
              type="range"
              className="holo-range-input"
              min={54}
              max={74}
              step={1}
              value={ipdMm}
              data-testid="holo-ipd-slider"
              onChange={(event) => onIpdChange(Number(event.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="holo-card">
        <div className="holo-card-header">
          <h3 className="holo-card-title">
            {text("눈피로 안전 시차 게이지", "Eye-Comfort Disparity Gauge")}
          </h3>
          <button
            type="button"
            className="holo-pill-button"
            aria-pressed={clampComfortZone}
            data-testid="holo-comfort-guard-toggle"
            onClick={onToggleComfortGuard}
          >
            {clampComfortZone
              ? text("2.5° 가드 켜짐", "2.5° guard on")
              : text("가드 꺼짐", "Guard off")}
          </button>
        </div>

        <div
          className="holo-comfort-meter-track"
          role="meter"
          aria-label={text("최대 양안 시차각", "Maximum stereo angular disparity")}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={Number(mainProjection.effectiveMaxDisparityDeg.toFixed(2))}
          aria-valuetext={`${mainProjection.effectiveMaxDisparityDeg.toFixed(2)}° / ${comfortDisparityLimitDeg.toFixed(1)}°`}
        >
          <div
            className="holo-comfort-meter-fill"
            data-status={mainProjection.comfortStatus}
            style={meterFillStyle}
          />
        </div>

        <p className="holo-comfort-caption">
          {text(
            `실효 시차 ${mainProjection.effectiveMaxDisparityDeg.toFixed(2)}° (권장 한계 ≤ ${comfortDisparityLimitDeg.toFixed(1)}°) · 안전 돌출 한계 +${Math.round(mainProjection.maxSafePopOutMm)}mm`,
            `Effective disparity ${mainProjection.effectiveMaxDisparityDeg.toFixed(2)}° (comfort limit <= ${comfortDisparityLimitDeg.toFixed(1)}°) · Safe pop-out +${Math.round(mainProjection.maxSafePopOutMm)}mm`,
          )}
        </p>
      </div>

      <div className="holo-card">
        <h3 className="holo-card-title">
          {text(".toon-holo.json 매니페스트", ".toon-holo.json Manifest")}
        </h3>
        <div className="holo-manifest-actions">
          <button
            type="button"
            className="holo-action-button"
            data-variant="primary"
            data-testid="holo-export-manifest-btn"
            onClick={onExportManifest}
          >
            <Download size={15} aria-hidden="true" />
            {text(".toon-holo.json 내보내기", "Export .toon-holo.json")}
          </button>
          <button
            type="button"
            className="holo-action-button"
            aria-expanded={showManifestPreview}
            data-testid="holo-toggle-manifest-preview-btn"
            onClick={onToggleManifestPreview}
          >
            <Code2 size={15} aria-hidden="true" />
            {showManifestPreview
              ? text("JSON 숨기기", "Hide JSON")
              : text("JSON 미리보기", "Preview JSON")}
          </button>
        </div>

        {exportNotice ? (
          <p className="holo-export-notice" role="status" data-testid="holo-export-notice">
            {exportNotice}
          </p>
        ) : null}

        {showManifestPreview ? (
          <pre className="holo-manifest-preview" data-testid="holo-manifest-preview">
            {serializedManifest}
          </pre>
        ) : null}
      </div>
    </aside>
  );
}
