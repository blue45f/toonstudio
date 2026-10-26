import { type ReactElement, type ReactNode } from "react";

import {
  CSP_BUILTIN_FTO_FONTS,
  CSP_MENUV3_KOREAN_BENTO_ITEMS,
  CSP_PW_UI_WIDGET_CLASSES,
} from "../../../../../../packages/studio-format-gateway/src/csp-fto-pwui-bento-design";

/**
 * 클립스튜디오 네이티브 `PWEditSliderJoint` 위젯(게이지 슬라이더 바 + 인라인 수치 표시 결합 컨트롤)
 */
export function CspPwEditSliderJoint({
  label,
  value,
  min,
  max,
  unit = "%",
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly onChange: (nextValue: number) => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1 text-[0.68rem]">
      <span className="min-w-28 font-medium">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <span className="min-w-12 text-right font-mono text-[0.65rem] text-fg-2">
        {value}
        {unit}
      </span>
    </div>
  );
}

/**
 * 클립스튜디오 네이티브 `PWCheckBoxEnabler` 위젯(체크 상태에 따라 하위 파라미터 그룹 전체를 제어하는 컨테이너)
 */
export function CspPwCheckBoxEnabler({
  label,
  checked,
  onChange,
  children,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (nextChecked: boolean) => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="rounded border border-line bg-card p-2">
      <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-medium">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label} (PWCheckBoxEnabler)</span>
      </label>
      <div className={checked ? "opacity-100" : "pointer-events-none opacity-45"}>
        {children}
      </div>
    </div>
  );
}

export interface StudioCspPwuiBentoToonSectionProps {
  readonly toonShadingEnabled: boolean;
  readonly onChangeToonShadingEnabled: (enabled: boolean) => void;
  readonly vividnessPercent: number;
  readonly onChangeVividnessPercent: (value: number) => void;
  readonly lightIntensityPercent: number;
  readonly onChangeLightIntensityPercent: (value: number) => void;
  readonly quantizedLightValue: number;
  readonly appliedSaturationBoost: number;
  readonly shadedHex: string;
  readonly selectedFtoFont: string;
  readonly onChangeSelectedFtoFont: (postScriptName: string) => void;
  readonly verticalBalloonMode: boolean;
  readonly onChangeVerticalBalloonMode: (vertical: boolean) => void;
  readonly onLaunchBentoItem?: (bentoId: string, target: string) => void;
}

export function StudioCspPwuiBentoToonSection({
  toonShadingEnabled,
  onChangeToonShadingEnabled,
  vividnessPercent,
  onChangeVividnessPercent,
  lightIntensityPercent,
  onChangeLightIntensityPercent,
  quantizedLightValue,
  appliedSaturationBoost,
  shadedHex,
  selectedFtoFont,
  onChangeSelectedFtoFont,
  verticalBalloonMode,
  onChangeVerticalBalloonMode,
  onLaunchBentoItem,
}: StudioCspPwuiBentoToonSectionProps): ReactElement {
  return (
    <div
      role="tabpanel"
      id="csp-ux-panel-pwui_bento_3d_toon"
      aria-labelledby="csp-ux-tab-pwui_bento_3d_toon"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          PWGLCalcVividColor 3D 툰·비비드 음영 셰이더 (46B67EA9)
        </div>
        <CspPwCheckBoxEnabler
          label="4단계 툰 계단화 (PWGLtoonfaultlist)"
          checked={toonShadingEnabled}
          onChange={onChangeToonShadingEnabled}
        >
          <div className="flex flex-col gap-1.5">
            <CspPwEditSliderJoint
              label="비비드 채도 부스트"
              value={vividnessPercent}
              min={0}
              max={800}
              disabled={!toonShadingEnabled}
              onChange={onChangeVividnessPercent}
            />
            <CspPwEditSliderJoint
              label="조명 밝기 (Light)"
              value={lightIntensityPercent}
              min={0}
              max={100}
              disabled={!toonShadingEnabled}
              onChange={onChangeLightIntensityPercent}
            />
          </div>
        </CspPwCheckBoxEnabler>
        <div
          data-testid="csp-pwgl-vivid-readout"
          className="mt-2 flex items-center justify-between rounded bg-card p-1.5 text-[0.65rem]"
        >
          <span>
            양자화 명도: {quantizedLightValue.toFixed(2)} · 채도 가산:{" "}
            {appliedSaturationBoost.toFixed(3)}
          </span>
          <span
            style={{
              backgroundColor: shadedHex,
              forcedColorAdjust: "none",
            }}
            className="inline-block h-5 w-10 rounded border border-line"
          />
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          내장 .fto 만화 서체 5종 &amp; PW* 27종 위젯 카탈로그
        </div>
        <select
          aria-label="내장 .fto 만화 서체 선택"
          value={selectedFtoFont}
          onChange={(e) => onChangeSelectedFtoFont(e.target.value)}
          className="mb-2 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
        >
          {CSP_BUILTIN_FTO_FONTS.map((f) => (
            <option key={f.assetFileName} value={f.postScriptName}>
              {f.postScriptName} ({f.assetFileName} · VORG 세로조판)
            </option>
          ))}
        </select>
        <label className="mb-2 flex items-center gap-1.5 text-[0.68rem]">
          <input
            type="checkbox"
            checked={verticalBalloonMode}
            onChange={(e) => onChangeVerticalBalloonMode(e.target.checked)}
          />
          <span>세로쓰기 말풍선 조판 (VORG/vhea/vmtx)</span>
        </label>
        <div
          data-testid="csp-fto-pwui-readout"
          className="rounded bg-card p-1.5 text-[0.65rem]"
        >
          서체: <strong>{selectedFtoFont}</strong> (
          {verticalBalloonMode ? "세로조판" : "가로조판"}) · PW* 위젯 클래스:{" "}
          {CSP_PW_UI_WIDGET_CLASSES.length}종 (스튜디오 507 / 심플UX 40 다이얼로그)
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          CLIP STUDIO MENUv3 벤토(Bento) 퀵 런처 (9항목)
        </div>
        <div className="grid grid-cols-3 gap-1">
          {CSP_MENUV3_KOREAN_BENTO_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onLaunchBentoItem?.(item.id, item.targetCommandOrPage)
              }
              className="flex flex-col items-center rounded border border-line bg-card p-1.5 text-center hover:border-accent"
            >
              <span className="text-[0.65rem] font-semibold">{item.nameKo}</span>
              <span className="text-[0.58rem] text-fg-2">{item.subLabel}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
