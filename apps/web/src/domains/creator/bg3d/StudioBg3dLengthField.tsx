/**
 * 길이 직접 입력 필드 — "2.4m", "80cm", "1200mm", "3'6\"" 를 받아 정확한 길이(m)로 바꾼다.
 *
 * 줄자·이동·밀기/당기기·방 빌더가 같은 필드와 같은 파서(`parseStudioBg3dLengthInput`)를 쓴다.
 * 입력 중에는 방해하지 않고(형식이 덜 끝난 "3'" 같은 중간 상태에 경고를 띄우지 않는다), 확정(Enter)
 * 또는 포커스를 벗어날 때 이유와 예시를 포함한 오류를 `role="alert"`로 알린다.
 * 모든 오류·미리보기 문구는 `aria-describedby`로 입력창에 묶여 스크린리더가 함께 읽는다.
 */

import { useId, useState } from "react";

import { STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE } from "./studio-bg3d-inference-keyboard";
import {
  STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS,
  parseStudioBg3dLengthInput,
} from "./studio-bg3d-inference-units";

import type { ChangeEvent, KeyboardEvent, Ref } from "react";

import type {
  StudioBg3dLengthParseOptions,
  StudioBg3dLengthParseResult,
} from "./studio-bg3d-inference-units";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface StudioBg3dLengthFieldProps {
  readonly id?: string;
  readonly label: string;
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  /** Enter 또는 적용 버튼으로 확정했을 때. 형식이 틀려도 호출하며 결과의 `ok`로 구분한다. */
  readonly onSubmit?: (length: StudioBg3dLengthParseResult) => void;
  readonly parseOptions?: StudioBg3dLengthParseOptions;
  /** 호출자가 가진 오류(세션이 방향을 못 정한 경우 등). 입력 형식 오류보다 먼저 보여 준다. */
  readonly error?: string | null;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
  /** 추론 세션의 키보드 라우팅이 이 입력창을 알아보게 하는 표식. */
  readonly vcb?: boolean;
  /** 지정하면 입력창 옆에 적용 버튼을 그린다. */
  readonly submitLabel?: string;
  readonly className?: string;
  readonly onBlur?: () => void;
}

export function StudioBg3dLengthField({
  id,
  label,
  text,
  onTextChange,
  onSubmit,
  parseOptions,
  error = null,
  hint,
  placeholder,
  disabled = false,
  inputRef,
  vcb = false,
  submitLabel,
  className,
  onBlur,
}: StudioBg3dLengthFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? `bg3d-length-${generatedId}`;
  const hintId = `${fieldId}-hint`;
  const previewId = `${fieldId}-preview`;
  const errorId = `${fieldId}-error`;
  const [touched, setTouched] = useState(false);

  const trimmed = text.trim();
  const parsed = trimmed === "" ? null : parseStudioBg3dLengthInput(text, parseOptions);
  const formatError = touched && parsed && !parsed.ok ? parsed.message : null;
  const visibleError = error ?? formatError;
  const preview = parsed?.ok ? `= ${parsed.normalized}` : null;

  const describedBy = [hint ? hintId : null, preview ? previewId : null, visibleError ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const submit = () => {
    setTouched(true);
    onSubmit?.(parsed ?? parseStudioBg3dLengthInput(text, parseOptions));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (touched) setTouched(false);
    onTextChange(event.currentTarget.value);
  };

  return (
    <div className={cx("grid gap-1", className)}>
      <label htmlFor={fieldId} className="block text-[0.65rem] font-semibold text-fg-3">
        {label}
      </label>
      <div className="flex gap-1.5">
        <span
          className={cx(
            "flex min-h-11 min-w-0 flex-1 items-center overflow-hidden rounded-lg border bg-panel focus-within:border-accent sm:min-h-9",
            visibleError ? "border-bad/60" : "border-line",
          )}
        >
          <input
            id={fieldId}
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS}
            value={text}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={visibleError ? true : undefined}
            aria-describedby={describedBy || undefined}
            {...(vcb ? { [STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE]: "true" } : {})}
            className="min-w-0 flex-1 bg-transparent px-2.5 text-xs font-semibold tabular-nums text-fg placeholder:font-normal placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (trimmed !== "") setTouched(true);
              onBlur?.();
            }}
          />
        </span>
        {submitLabel ? (
          <button
            type="button"
            disabled={disabled}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-accent/45 bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9"
            onClick={submit}
          >
            {submitLabel}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-[0.62rem] leading-relaxed text-fg-3">
          {hint}
        </p>
      ) : null}
      {preview ? (
        <p id={previewId} data-testid="bg3d-length-preview" className="text-[0.62rem] font-semibold tabular-nums text-fg-2">
          {preview}
        </p>
      ) : null}
      {visibleError ? (
        <p id={errorId} role="alert" className="text-[0.64rem] font-semibold leading-relaxed text-bad">
          {visibleError}
        </p>
      ) : null}
    </div>
  );
}
