import { useRef, type KeyboardEvent } from "react";

import { studioSegmentChipClass } from "../../studio-panel-ui";

export interface ClaudeChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface ClaudeChoiceChipsProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly ClaudeChoiceOption<T>[];
  readonly onChange: (next: T) => void;
  readonly disabled?: boolean;
}

/**
 * 몇 개 안 되는 선택지를 칩으로 고르는 라디오 그룹. 키보드로는 그룹에 탭 한 번으로 들어와 방향키로 옮기며 고른다
 * (WAI-ARIA 라디오 그룹 패턴: 선택된 칩만 탭 순서에 들어가고, 화살표·Home·End가 선택과 포커스를 함께 옮긴다).
 */
export function ClaudeChoiceChips<T extends string>({ label, value, options, onChange, disabled = false }: ClaudeChoiceChipsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  const move = (index: number) => {
    const target = options[index];
    if (!target) return;
    onChange(target.value);
    refs.current[index]?.focus({ preventScroll: true });
  };

  // 방향키 처리는 포커스가 실제로 있는 라디오 단추에 둔다(그룹 컨테이너는 포커스를 받지 않는다).
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (selectedIndex + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (selectedIndex - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    if (next === null) return;
    event.preventDefault();
    move(next);
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-fg-2" aria-hidden>{label}</span>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            className={studioSegmentChipClass(selected)}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
