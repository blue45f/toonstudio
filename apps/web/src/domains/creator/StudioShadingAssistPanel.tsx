/**
 * Studio Shading Assist Panel — 명암 보조(광원 방향 미리보기형 음영 초안).
 *
 * 광원 방향을 8방향 패드로 고르고 강도·경계·부드러움·단차를 조절한 뒤
 * "음영 초안 만들기" 한 번으로 studio-shading-assist 초안 생성을 호스트에 요청한다.
 * 호스트가 마스크를 새 음영 레이어로 커밋하고, 결과 요약 문자열을 lastResult로
 * 돌려주면 패널 하단에 표시한다. 옵션 state는 호스트가 소유하는 제어형 패널
 * (StudioShadowHighlightPanel과 같은 패턴), 생성 콜백은 요약 1회 호출.
 */
import { Sun, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { StudioPanelChip, StudioSectionHeader, StudioSliderRow } from "./studio-panel-ui";
import {
  SHADING_ASSIST_COVERAGE_RANGE,
  SHADING_ASSIST_SOFTNESS_RANGE,
  SHADING_ASSIST_STRENGTH_RANGE,
  normalizeShadingAssistOptions,
  type ShadingAssistOptions,
} from "./studio-shading-assist";

import type { ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";

// 8방향 광원 패드 — 라벨(화살표)·방위각(화면 공간: 0=위, 시계 방향)·짧은 이름.
const LIGHT_DIRECTIONS: readonly { azimuthDeg: number; arrow: string; label: string }[] = [
  { azimuthDeg: 315, arrow: "↖", label: "왼쪽 위" },
  { azimuthDeg: 0, arrow: "↑", label: "위" },
  { azimuthDeg: 45, arrow: "↗", label: "오른쪽 위" },
  { azimuthDeg: 270, arrow: "←", label: "왼쪽" },
  { azimuthDeg: 90, arrow: "→", label: "오른쪽" },
  { azimuthDeg: 225, arrow: "↙", label: "왼쪽 아래" },
  { azimuthDeg: 180, arrow: "↓", label: "아래" },
  { azimuthDeg: 135, arrow: "↘", label: "오른쪽 아래" },
];

const TONE_STEP_CHOICES: readonly { value: ShadingAssistOptions["toneSteps"]; label: string }[] = [
  { value: 0, label: "부드럽게" },
  { value: 2, label: "2단 음영" },
  { value: 3, label: "3단 음영" },
];

export interface StudioShadingAssistPanelProps {
  readonly value: ShadingAssistOptions;
  readonly onPatch: (patch: Partial<ShadingAssistOptions>) => void;
  /** 음영 초안 생성 요청 — 호스트가 현재 옵션으로 초안을 만들어 레이어로 커밋한다. */
  readonly onGenerate: () => void;
  /** 대상 이미지가 없으면 생성 비활성. */
  readonly hasTarget?: boolean;
  /** 마지막 생성 결과 요약(호스트 소유 피드백). 옵션이 바뀌면 패널이 자동으로 지운다. */
  readonly lastResult?: string | null;
}

export function StudioShadingAssistPanel({
  value,
  onPatch,
  onGenerate,
  hasTarget = true,
  lastResult = null,
}: StudioShadingAssistPanelProps): ReactElement {
  const options = normalizeShadingAssistOptions(value);
  // 결과 요약은 도착 당시의 옵션 키와 함께 보관하고, 현재 옵션 키와 같을 때만 보인다 —
  // 옵션을 바꾸면 낡은 요약이 자동으로 사라진다(현재 설정과 어긋난 안내 방지).
  // options 객체는 렌더마다 새로 만들어지므로 값 자체를 문자열 키로 비교한다.
  const optionsKey = `${options.azimuthDeg}|${options.strength}|${options.coverage}|${options.softness}|${options.toneSteps}|${options.shadowColor.join(",")}`;
  const [result, setResult] = useState<{ text: string; key: string } | null>(null);
  // optionsKey는 도착 시점 스냅샷 용도라, 최신 키를 ref로 따라가며 아래 effect는
  // lastResult 변화에만 반응한다. 동기화 effect가 같은 커밋에서 먼저 실행되므로
  // 스냅샷에 쓰이는 키는 기존 클로저 방식과 항상 같다.
  const optionsKeyRef = useRef(optionsKey);
  useEffect(() => {
    optionsKeyRef.current = optionsKey;
  });
  useEffect(() => {
    if (lastResult) setResult({ text: lastResult, key: optionsKeyRef.current });
  }, [lastResult]);
  const visibleResult = result && result.key === optionsKey ? result.text : null;

  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="명암 보조"
        description="빛이 오는 방향을 고르면 그 반대쪽에 음영 초안 레이어를 만들어 드립니다. 초안을 다듬어 완성하세요."
      />

      {/* 광원 방향 8방향 패드 — 가운데는 현재 방향 이름 표시(버튼 아님). */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-fg-2">
          <Sun size={12} className="mr-1 inline-block align-[-2px]" aria-hidden />
          광원 방향
        </span>
        <div className="grid w-36 grid-cols-3 gap-1" role="group" aria-label="광원 방향">
          {LIGHT_DIRECTIONS.slice(0, 3).map((dir) => (
            <DirectionButton key={dir.azimuthDeg} dir={dir} options={options} onPatch={onPatch} />
          ))}
          <DirectionButton dir={LIGHT_DIRECTIONS[3]!} options={options} onPatch={onPatch} />
          <span className="flex items-center justify-center text-[0.62rem] font-medium text-fg-3">
            {LIGHT_DIRECTIONS.find((d) => d.azimuthDeg === options.azimuthDeg)?.label ?? "직접 지정"}
          </span>
          <DirectionButton dir={LIGHT_DIRECTIONS[4]!} options={options} onPatch={onPatch} />
          {LIGHT_DIRECTIONS.slice(5).map((dir) => (
            <DirectionButton key={dir.azimuthDeg} dir={dir} options={options} onPatch={onPatch} />
          ))}
        </div>
      </div>

      {/* 음영 조절 슬라이더 */}
      <div className="space-y-2">
        <StudioSliderRow
          label="음영 강도"
          min={SHADING_ASSIST_STRENGTH_RANGE.min}
          max={SHADING_ASSIST_STRENGTH_RANGE.max}
          step={SHADING_ASSIST_STRENGTH_RANGE.step}
          value={Math.round(options.strength)}
          onChange={(n) => onPatch({ strength: n })}
          readout={`${Math.round(options.strength)}%`}
        />
        <StudioSliderRow
          label="음영 경계"
          min={SHADING_ASSIST_COVERAGE_RANGE.min}
          max={SHADING_ASSIST_COVERAGE_RANGE.max}
          step={SHADING_ASSIST_COVERAGE_RANGE.step}
          value={Math.round(options.coverage)}
          onChange={(n) => onPatch({ coverage: n })}
          readout={`${Math.round(options.coverage)}%`}
        />
        <StudioSliderRow
          label="경계 부드러움"
          min={SHADING_ASSIST_SOFTNESS_RANGE.min}
          max={SHADING_ASSIST_SOFTNESS_RANGE.max}
          step={SHADING_ASSIST_SOFTNESS_RANGE.step}
          value={Math.round(options.softness)}
          onChange={(n) => onPatch({ softness: n })}
          readout={`${Math.round(options.softness)}%`}
        />
      </div>

      {/* 음영 단차 칩 */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="음영 단차">
        {TONE_STEP_CHOICES.map((choice) => (
          <StudioPanelChip
            key={choice.label}
            active={options.toneSteps === choice.value}
            onClick={() => onPatch({ toneSteps: choice.value })}
          >
            {choice.label}
          </StudioPanelChip>
        ))}
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={!hasTarget}
        className={buttonClass({ size: "sm", variant: "solid", className: "w-full gap-1" })}
        title="현재 광원 방향·설정으로 음영 초안 레이어를 만듭니다."
      >
        <WandSparkles size={13} aria-hidden /> 음영 초안 만들기
      </button>
      {visibleResult ? (
        <p className="text-[0.7rem] leading-relaxed text-fg-3" role="status">
          {visibleResult}
        </p>
      ) : null}
    </div>
  );
}

function DirectionButton({
  dir,
  options,
  onPatch,
}: {
  dir: { azimuthDeg: number; arrow: string; label: string };
  options: ShadingAssistOptions;
  onPatch: (patch: Partial<ShadingAssistOptions>) => void;
}): ReactElement {
  const active = options.azimuthDeg === dir.azimuthDeg;
  return (
    <button
      type="button"
      onClick={() => onPatch({ azimuthDeg: dir.azimuthDeg })}
      aria-pressed={active}
      aria-label={`광원 ${dir.label}`}
      title={`광원 방향: ${dir.label}`}
      className={buttonClass({
        size: "sm",
        variant: active ? "solid" : "quiet",
        className: "h-9 w-full text-sm",
      })}
    >
      {dir.arrow}
    </button>
  );
}
