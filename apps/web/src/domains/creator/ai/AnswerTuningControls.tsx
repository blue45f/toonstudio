/**
 * 답변 조절 공통 부품 — 난이도·길이·창의성 세그먼트 컨트롤.
 *
 * 멘토 챗(CreatorMentorChatPanel)에 있던 ControlGroup을 추출·일반화한 것이다.
 * 조절은 설정 탭 뒤에 숨기지 않고 패널에 상시 노출하는 것이 계약이며, 값 계약과
 * 지시문 변환은 answer-tuning.ts(순수 모듈)가 정본이다. 이 컴포넌트는 표시와
 * 입력만 담당하고, 조절값을 실제 요청에 반영하는 일은 각 패널/클라이언트가 한다.
 *
 * 접근성: 그룹마다 fieldset+radiogroup, 옵션은 role="radio"+aria-checked.
 * density="compact"는 허브 패널의 작은 본문(0.65rem 체계)에 맞춘 축소형이다.
 */

import {
  ANSWER_CREATIVITIES,
  ANSWER_DIFFICULTIES,
  ANSWER_LENGTHS,
  ANSWER_TUNING_LABELS,
  type AnswerCreativity,
  type AnswerDifficulty,
  type AnswerLength,
  type AnswerTuning,
} from "./answer-tuning";

export interface AnswerTuningControlsProps {
  readonly value: AnswerTuning;
  readonly onChange: (next: AnswerTuning) => void;
  readonly disabled?: boolean;
  readonly locale?: "ko" | "en";
  readonly density?: "regular" | "compact";
}

function TuningGroup<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
  readonly disabled: boolean;
  readonly compact: boolean;
}) {
  return (
    <fieldset className="flex items-center gap-2" disabled={props.disabled}>
      <legend className="sr-only">{props.label}</legend>
      <span
        className={props.compact ? "text-[0.63rem] font-bold text-fg-3" : "text-xs font-bold text-fg-3"}
        aria-hidden
      >
        {props.label}
      </span>
      <div
        className="flex overflow-hidden rounded-full border border-line"
        role="radiogroup"
        aria-label={props.label}
      >
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            onClick={() => props.onChange(option.value)}
            className={
              props.value === option.value
                ? props.compact
                  ? "min-h-9 bg-accent px-2.5 text-[0.63rem] font-bold text-white"
                  : "min-h-9 bg-accent px-3 text-xs font-bold text-white"
                : props.compact
                  ? "min-h-9 bg-panel px-2.5 text-[0.63rem] font-semibold text-fg-2 hover:bg-panel-2"
                  : "min-h-9 bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-panel-2"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function AnswerTuningControls(props: AnswerTuningControlsProps) {
  const locale = props.locale ?? "ko";
  const compact = props.density === "compact";
  const disabled = props.disabled ?? false;
  const value = props.value;
  return (
    <div
      className={compact ? "flex flex-wrap gap-x-4 gap-y-2" : "flex flex-wrap gap-x-5 gap-y-2"}
      data-answer-tuning-controls="true"
    >
      <TuningGroup<AnswerDifficulty>
        label={ANSWER_TUNING_LABELS.difficulty.label[locale]}
        value={value.difficulty}
        disabled={disabled}
        compact={compact}
        onChange={(difficulty) => props.onChange({ ...value, difficulty })}
        options={ANSWER_DIFFICULTIES.map((optionValue) => ({
          value: optionValue,
          label: ANSWER_TUNING_LABELS.difficulty.options[optionValue][locale],
        }))}
      />
      <TuningGroup<AnswerLength>
        label={ANSWER_TUNING_LABELS.length.label[locale]}
        value={value.length}
        disabled={disabled}
        compact={compact}
        onChange={(length) => props.onChange({ ...value, length })}
        options={ANSWER_LENGTHS.map((optionValue) => ({
          value: optionValue,
          label: ANSWER_TUNING_LABELS.length.options[optionValue][locale],
        }))}
      />
      <TuningGroup<AnswerCreativity>
        label={ANSWER_TUNING_LABELS.creativity.label[locale]}
        value={value.creativity}
        disabled={disabled}
        compact={compact}
        onChange={(creativity) => props.onChange({ ...value, creativity })}
        options={ANSWER_CREATIVITIES.map((optionValue) => ({
          value: optionValue,
          label: ANSWER_TUNING_LABELS.creativity.options[optionValue][locale],
        }))}
      />
    </div>
  );
}
