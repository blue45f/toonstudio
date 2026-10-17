import { roundStudioBg3dNumber as round } from "./studio-bg3d-editor-ui";
import {
  resolveStudioBg3dInteriorSuppression,
  studioBg3dLineNeedsDepth,
} from "./studio-bg3d-line-output-rules";

import type { StudioBg3dLineOutputSettings } from "./studio-bg3d-scene-document-types";

/**
 * LT 패널 "선화" 탭의 "정밀 선 검출" 접이식 구역.
 *
 * `StudioBg3dLtPanel.tsx` 에서 그대로 떼어 낸 컨트롤(검출 정밀도·외곽선 강조·선 다듬기·모서리 각도·화면 크기
 * 보정·깊이선·재질선)에 "내부선 억제"와 "가려진 선 제거"의 설명을 더했다. 컨트롤 컴포넌트는 패널과 같은 방식으로
 * 호출하는 쪽이 넘겨 주며, 여기서는 값을 읽고 `updateLtLineSettings` 로 한 필드씩 고치기만 한다.
 */
export interface StudioBg3dLtLineDetailControlsProps {
  readonly ltLineSettings: StudioBg3dLineOutputSettings;
  readonly updateLtLineSettings: (patch: Partial<StudioBg3dLineOutputSettings>) => void;
  readonly LtToggleRow: typeof import("./studio-bg3d-control-fields").LtToggleRow;
  readonly LtRangeControl: typeof import("./studio-bg3d-control-fields").LtRangeControl;
  readonly ChevronDown: typeof import("lucide-react").ChevronDown;
}

export function StudioBg3dLtLineDetailControls({
  ltLineSettings,
  updateLtLineSettings,
  LtToggleRow,
  LtRangeControl,
  ChevronDown,
}: StudioBg3dLtLineDetailControlsProps) {
  const suppression = resolveStudioBg3dInteriorSuppression(ltLineSettings);
  const suppressionOn = ltLineSettings.interiorSuppressionEnabled === true;
  const depthCaptured = studioBg3dLineNeedsDepth(ltLineSettings);

  return (
    <details className="group border-b border-line/70">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        정밀 선 검출
        <span className="flex items-center gap-1 text-right text-[0.64rem] font-normal text-fg-3">
          {suppressionOn ? "모서리 · 깊이 · 질감 · 내부선 억제 켬" : "모서리 · 깊이 · 질감 · 내부선 억제"}
          <ChevronDown className="shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" size={13} aria-hidden />
        </span>
      </summary>
      <div className="border-t border-line/60 pl-2">
        <LtRangeControl
          id="bg3d-lt-line-accuracy"
          label="검출 정밀도"
          min={0}
          max={1}
          step={0.01}
          value={ltLineSettings.accuracy}
          valueText={`${Math.round(ltLineSettings.accuracy * 100)}%`}
          disabled={!ltLineSettings.enabled}
          onChange={(accuracy) => updateLtLineSettings({ accuracy })}
        />
        <LtRangeControl
          id="bg3d-lt-line-exterior"
          label="외곽선 강조"
          min={0}
          max={2}
          step={0.05}
          value={ltLineSettings.exteriorOutlineStrength}
          valueText={`${round(ltLineSettings.exteriorOutlineStrength, 2)}×`}
          disabled={!ltLineSettings.enabled}
          onChange={(exteriorOutlineStrength) => updateLtLineSettings({ exteriorOutlineStrength })}
        />
        <LtToggleRow
          checked={suppressionOn}
          label="내부선 억제"
          description="안쪽의 명암·재질·모서리 선을 줄이고 물체와 배경의 경계(윤곽)는 남겨요. 바닥에 닿는 선처럼 깊이가 이어지는 곳은 안쪽 선으로 보고 줄여요. 켜면 깊이도 함께 캡처해요."
          disabled={!ltLineSettings.enabled}
          onChange={(interiorSuppressionEnabled) => updateLtLineSettings({ interiorSuppressionEnabled })}
        />
        {suppressionOn ? (
          <LtRangeControl
            id="bg3d-lt-line-interior-suppression"
            label="억제 강도"
            min={0}
            max={1}
            step={0.01}
            value={suppression.strength}
            valueText={`${Math.round(suppression.strength * 100)}%`}
            disabled={!ltLineSettings.enabled}
            onChange={(interiorSuppressionStrength) => updateLtLineSettings({ interiorSuppressionStrength })}
          />
        ) : null}
        <LtRangeControl
          id="bg3d-lt-line-smoothing"
          label="선 다듬기"
          min={0}
          max={1}
          step={0.01}
          value={ltLineSettings.smoothing}
          valueText={`${Math.round(ltLineSettings.smoothing * 100)}%`}
          disabled={!ltLineSettings.enabled}
          onChange={(smoothing) => updateLtLineSettings({ smoothing })}
        />
        <LtRangeControl
          id="bg3d-lt-line-crease"
          label="모서리 각도"
          min={0}
          max={180}
          step={1}
          value={ltLineSettings.creaseAngleDegrees}
          valueText={`${Math.round(ltLineSettings.creaseAngleDegrees)}°`}
          disabled={!ltLineSettings.enabled}
          onChange={(creaseAngleDegrees) => updateLtLineSettings({ creaseAngleDegrees })}
        />
        <LtToggleRow
          checked={ltLineSettings.scaleAwareAccuracy}
          label="화면 크기 보정"
          disabled={!ltLineSettings.enabled}
          onChange={(scaleAwareAccuracy) => updateLtLineSettings({ scaleAwareAccuracy })}
        />
        <LtToggleRow
          checked={ltLineSettings.hiddenLineRemoval}
          label="가려진 선 제거"
          description={
            depthCaptured
              ? "앞 물체에 가려지는 쪽에 생기는 이중선을 앞 물체의 윤곽선 한 줄로 합쳐요."
              : "깊이 정보가 있을 때만 적용돼요. 지금은 깊이를 캡처하지 않아 효과가 없어요. ‘깊이선 검출’이나 ‘내부선 억제’를 켜면 함께 캡처해요."
          }
          disabled={!ltLineSettings.enabled}
          onChange={(hiddenLineRemoval) => updateLtLineSettings({ hiddenLineRemoval })}
        />
        <LtToggleRow
          checked={ltLineSettings.depthEnabled}
          label="깊이선 검출"
          disabled={!ltLineSettings.enabled}
          onChange={(depthEnabled) => updateLtLineSettings({ depthEnabled })}
        />
        {ltLineSettings.depthEnabled ? (
          <>
            <LtRangeControl
              id="bg3d-lt-line-depth"
              label="깊이선 강도"
              min={0}
              max={1}
              step={0.01}
              value={ltLineSettings.depthStrength}
              valueText={`${Math.round(ltLineSettings.depthStrength * 100)}%`}
              disabled={!ltLineSettings.enabled}
              onChange={(depthStrength) => updateLtLineSettings({ depthStrength })}
            />
            <LtToggleRow
              checked={ltLineSettings.depthOutlineOnly}
              label="깊이 외곽선만"
              disabled={!ltLineSettings.enabled}
              onChange={(depthOutlineOnly) => updateLtLineSettings({ depthOutlineOnly })}
            />
          </>
        ) : null}
        <LtToggleRow
          checked={ltLineSettings.textureLineEnabled}
          label="재질선 검출"
          disabled={!ltLineSettings.enabled}
          onChange={(textureLineEnabled) => updateLtLineSettings({ textureLineEnabled })}
        />
        {ltLineSettings.textureLineEnabled ? (
          <LtRangeControl
            id="bg3d-lt-line-texture"
            label="재질선 강도"
            min={0}
            max={1}
            step={0.01}
            value={ltLineSettings.textureLineStrength}
            valueText={`${Math.round(ltLineSettings.textureLineStrength * 100)}%`}
            disabled={!ltLineSettings.enabled}
            onChange={(textureLineStrength) => updateLtLineSettings({ textureLineStrength })}
          />
        ) : null}
      </div>
    </details>
  );
}
