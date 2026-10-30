import { useId } from "react";

export type VisionPoseTarget = "body" | "hands";

interface ShaperVisionAiSectionProps {
  readonly target: VisionPoseTarget;
  readonly disabled: boolean;
  readonly onTargetChange: (target: VisionPoseTarget) => void;
}

/** 사진과 웹캠이 같은 실제 추론 대상 설정을 사용한다. */
export function ShaperVisionAiSection({ target, disabled, onTargetChange }: ShaperVisionAiSectionProps) {
  const id = useId();
  return (
    <fieldset className="cl-vision-row" disabled={disabled}>
      <legend>인식할 포즈</legend>
      <label htmlFor={`${id}-body`}>
        <input id={`${id}-body`} type="radio" name={`${id}-target`} checked={target === "body"} onChange={() => onTargetChange("body")} />
        전신 포즈
      </label>
      <label htmlFor={`${id}-hands`}>
        <input id={`${id}-hands`} type="radio" name={`${id}-target`} checked={target === "hands"} onChange={() => onTargetChange("hands")} />
        손 포즈
      </label>
      <p className="cl-vision-hint">사진 파일과 카메라 촬영 모두에 적용됩니다. 손만 인식하면 전신이 나오지 않은 사진에서도 손가락 포즈를 만들 수 있습니다.</p>
    </fieldset>
  );
}
