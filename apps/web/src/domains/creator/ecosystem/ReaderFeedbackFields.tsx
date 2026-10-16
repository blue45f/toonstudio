import { Check } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import type { BilingualLabel } from "./reader-feedback-copy";
import { RATING_LEVELS, type RatingLevel } from "./reader-feedback-schema";

/**
 * 폼 부품 — 라디오·체크박스를 알약 모양으로 보여 주는 선택지와 3단계 척도 묶음.
 * 입력 요소는 진짜 `input`(화면 밖으로 숨김)이라 키보드·스크린 리더 동작은 브라우저 기본을 그대로 쓰고,
 * 선택 여부는 색뿐 아니라 체크 표시로도 드러낸다. 외곽선 강조(focus-within)로 포커스 위치를 보인다.
 */
export function ChoiceChip({ type, name, value, checked, disabled = false, onChange, children }: {
  readonly type: "radio" | "checkbox";
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: () => void;
  readonly children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-center text-sm font-bold transition-colors motion-reduce:transition-none",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        checked ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2 hover:bg-raised hover:text-fg",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <input className="sr-only" type={type} name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
      {checked ? <Check size={14} aria-hidden /> : null}
      <span>{children}</span>
    </label>
  );
}

/** 입력 아래 오류 문구. 입력은 `aria-describedby`로 이 id 를 가리킨다. */
export function FieldError({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return <p id={id} className="mt-1 text-xs font-bold text-bad">{children}</p>;
}

/**
 * 1~3단계 척도 하나. 처음에는 아무것도 고르지 않은 상태이고, 고른 뒤에도 "선택 취소"로 답하지 않은 상태로 돌아갈 수 있다.
 * "선택 취소"는 누르면 사라지므로, 초점이 body 로 떨어지지 않게 이 묶음의 첫 선택지로 옮긴다.
 */
export function ScaleField({ legend, name, labels, value, onChange, localize, clearLabel }: {
  readonly legend: string;
  readonly name: string;
  readonly labels: Readonly<Record<RatingLevel, BilingualLabel>>;
  readonly value: RatingLevel | null;
  readonly onChange: (value: RatingLevel | null) => void;
  readonly localize: (ko: string, en: string) => string;
  readonly clearLabel: string;
}) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  return (
    <fieldset ref={fieldsetRef} className="min-w-0">
      <legend className="text-sm font-bold text-fg">{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {RATING_LEVELS.map((level) => (
          <ChoiceChip key={level} type="radio" name={name} value={String(level)} checked={value === level} onChange={() => onChange(level)}>
            <span className="tabular-nums" aria-hidden>{level}</span> {localize(labels[level].ko, labels[level].en)}
          </ChoiceChip>
        ))}
      </div>
      {value !== null ? (
        <button
          type="button"
          onClick={() => { onChange(null); fieldsetRef.current?.querySelector<HTMLElement>("input")?.focus(); }}
          className="mt-1 min-h-11 rounded-lg px-2 text-xs font-bold text-fg-3 underline underline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {clearLabel}
        </button>
      ) : null}
    </fieldset>
  );
}
