import { StudioThreeDToggleControl } from "../StudioThreeDToggle";

/**
 * 템플릿 탭의 지연 로드 패널(방 만들기·웹툰 배경 선택기) 전용 컨트롤.
 *
 * `studio-bg3d-control-fields` 의 `LtRangeControl`·`LtToggleRow` 와 모양과 동작이 같다. 일부러 따로 둔 사본이다:
 * 지연 로드 패널이 그 모듈을 import 하면 번들러가 그 모듈을 3D 편집기 본체와 시점 패널이 나눠 쓰던 공유 청크에서 떼어
 * 별도 청크로 만들고, 편집기 활성화 정적 청크 수가 하나 늘어 번들 래칫(상한 93)을 넘는다(2026-10-16 통합 PR).
 * 모양을 바꿀 때는 `studio-bg3d-control-fields.tsx` 의 두 컨트롤과 함께 바꾼다.
 */

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

interface TemplateRangeControlProps {
  readonly id: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly onChangeEnd?: () => void;
  readonly step: number;
  readonly value: number;
  readonly valueText: string;
  readonly disabled?: boolean;
}

export function TemplateRangeControl({
  id,
  label,
  max,
  min,
  onChange,
  onChangeEnd,
  step,
  value,
  valueText,
  disabled = false,
}: TemplateRangeControlProps) {
  return (
    <label
      htmlFor={id}
      className={cx(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line/70 py-1.5 last:border-b-0",
        disabled && "opacity-45"
      )}
    >
      <span className="text-xs font-semibold text-fg-2">{label}</span>
      <output htmlFor={id} className="min-w-12 text-right text-[0.6875rem] tabular-nums text-fg-3">
        {valueText}
      </output>
      <input
        id={id}
        type="range"
        aria-valuetext={valueText}
        className="col-span-2 h-11 w-full cursor-pointer accent-accent disabled:cursor-not-allowed sm:h-8"
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={onChangeEnd}
        onKeyUp={onChangeEnd}
        onPointerCancel={onChangeEnd}
        onPointerUp={onChangeEnd}
      />
    </label>
  );
}

interface TemplateToggleRowProps {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  /** 선택. 스위치에 `aria-describedby` 로 묶이는 한 줄 설명. */
  readonly description?: string;
}

export function TemplateToggleRow({
  checked,
  label,
  onChange,
  disabled = false,
  description,
}: TemplateToggleRowProps) {
  return (
    <StudioThreeDToggleControl
      checked={checked}
      label={label}
      disabled={disabled}
      className="border-b border-line/70 py-2 last:border-b-0 hover:text-fg"
      labelClassName="text-xs font-semibold text-fg-2 group-hover:text-fg"
      {...(description === undefined
        ? {}
        : { description, descriptionClassName: "text-[0.6875rem] font-normal leading-relaxed text-fg-3" })}
      onChange={onChange}
    />
  );
}
