// 렌즈 시프트(가로·세로) 직접 조절 + 2점 투시 자동 보정 — "렌즈 · 투영" 구역의 한 묶음.
//
// 시프트는 카메라 위치·회전을 그대로 둔 채 프레임만 옮기는 값이다(문서 camera.lensShift, 프레임 한 변의
// 비율, ±2). 예전에는 2점 투시 버튼이 세로 값 하나만 계산해 넣었고 가로 값과 직접 조절은 없었다.
// 이 컴포넌트는 두 축을 슬라이더로 드러내고, 값 변경은 다른 렌즈 슬라이더와 같은 미리보기 → 제스처
// 종료 시 한 번 커밋(실행 취소 한 단계) 경로를 따른다. 상태는 모두 부모가 소유한다(무상태).
import { RotateCcw } from "lucide-react";

import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import { LtRangeControl } from "./studio-bg3d-control-fields";
import { STUDIO_BG3D_CONTROL_BUTTON, studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import {
  STUDIO_BG3D_LENS_SHIFT_LIMIT,
  formatStudioBg3dLensShiftValue,
  isStudioBg3dLensShiftNeutral,
  readStudioBg3dLensShift,
  withStudioBg3dLensShiftAxis,
  type StudioBg3dLensShift,
  type StudioBg3dLensShiftAxis,
} from "./studio-bg3d-lens";

const COPY_SCOPE = "domains.creator.bg3d.StudioBg3dLensShiftControls";

function copy(source: string): string {
  return translateCurrentStaticSourceText(COPY_SCOPE, "ko", source);
}

export interface StudioBg3dLensShiftControlsProps {
  /** 문서 카메라의 시프트. 없으면 [0, 0] 으로 본다. */
  readonly lensShift: StudioBg3dLensShift | undefined;
  /** 캡처·복원·정사영 등으로 조작을 막아야 하는 상태. */
  readonly disabled: boolean;
  readonly twoPointPerspectiveActive: boolean;
  /** 슬라이더를 움직이는 동안 한 축을 바꾼 [가로, 세로] 전체 값으로 호출된다. */
  readonly onPreviewShift: (shift: StudioBg3dLensShift) => void;
  /** 포인터·키보드·포커스 이탈로 한 번의 조절이 끝났다(부모가 실행 취소 단계를 확정한다). */
  readonly onFinishShift: () => void;
  readonly onResetShift: () => void;
  readonly onApplyTwoPointPerspective: () => void;
}

export function StudioBg3dLensShiftControls({
  lensShift,
  disabled,
  twoPointPerspectiveActive,
  onPreviewShift,
  onFinishShift,
  onResetShift,
  onApplyTwoPointPerspective,
}: StudioBg3dLensShiftControlsProps) {
  const shift = readStudioBg3dLensShift({ lensShift });
  const preview = (axis: StudioBg3dLensShiftAxis, value: number) => {
    onPreviewShift(withStudioBg3dLensShiftAxis(shift, axis, value));
  };

  return (
    <div
      role="group"
      aria-label={copy("렌즈 시프트")}
      className="mt-2 rounded-xl border border-line bg-card/70 px-3 py-2"
    >
      <LtRangeControl
        id="bg3d-lens-shift-x"
        label={copy("가로 시프트")}
        min={-STUDIO_BG3D_LENS_SHIFT_LIMIT}
        max={STUDIO_BG3D_LENS_SHIFT_LIMIT}
        step={0.01}
        value={shift[0]}
        valueText={formatStudioBg3dLensShiftValue(shift[0])}
        disabled={disabled}
        onChange={(value) => preview("x", value)}
        onChangeEnd={onFinishShift}
      />
      <LtRangeControl
        id="bg3d-lens-shift-y"
        label={copy("세로 시프트")}
        min={-STUDIO_BG3D_LENS_SHIFT_LIMIT}
        max={STUDIO_BG3D_LENS_SHIFT_LIMIT}
        step={0.01}
        value={shift[1]}
        valueText={formatStudioBg3dLensShiftValue(shift[1])}
        disabled={disabled}
        onChange={(value) => preview("y", value)}
        onChangeEnd={onFinishShift}
      />
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <button
          type="button"
          aria-pressed={twoPointPerspectiveActive}
          disabled={disabled}
          className={cx(
            STUDIO_BG3D_CONTROL_BUTTON,
            "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            twoPointPerspectiveActive && "border-accent/60 bg-accent-soft text-accent",
          )}
          onClick={onApplyTwoPointPerspective}
        >
          {copy("2점 투시 보정")}
        </button>
        <button
          type="button"
          disabled={disabled || isStudioBg3dLensShiftNeutral(shift)}
          className={cx(
            STUDIO_BG3D_CONTROL_BUTTON,
            "border-line bg-panel px-3 text-fg-2 hover:bg-raised hover:text-fg",
          )}
          onClick={onResetShift}
        >
          <RotateCcw size={14} aria-hidden />
          {copy("시프트 초기화")}
        </button>
      </div>
      <p className="mt-2 text-[0.64rem] leading-relaxed text-fg-3">
        {copy("시프트는 카메라 위치와 회전은 그대로 두고 프레임만 옮깁니다. +값은 장면이 화면에서 가로로는 왼쪽, 세로로는 위쪽으로 이동합니다.")}
      </p>
      <p className="mt-1.5 text-[0.64rem] leading-relaxed text-fg-3">
        {copy("올려다보거나 내려다보는 구도에서는 2점 투시 보정으로 수직선을 화면과 평행하게 세우세요(건축 컷). 시선은 수평이 되고 원래 구도는 세로 시프트로 보존됩니다. 같은 값이 컷 저장·실행 취소·LT 삽입·배치 출력에 쓰이며, 매직 마스크는 시프트가 0일 때만 만들 수 있어요.")}
      </p>
    </div>
  );
}
