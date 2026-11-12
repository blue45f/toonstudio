import type { KeyboardEvent } from "react";

export interface StudioMannequinRotationCommand {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
}

const DIRECTIONS = [
  ["ArrowUp", "위", "↑"], ["ArrowDown", "아래", "↓"],
  ["ArrowLeft", "왼쪽", "←"], ["ArrowRight", "오른쪽", "→"],
] as const;

/** WebGL 화면 대신 네이티브 버튼에 키보드 초점을 제공한다. */
export function StudioMannequinRotationControls({ disabled, onRotate }: {
  readonly disabled: boolean;
  readonly onRotate: (command: StudioMannequinRotationCommand) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !DIRECTIONS.some(([key]) => key === event.key)) return;
    event.preventDefault();
    onRotate(event);
  }
  return (
    <div role="group" aria-label="선택 관절 회전" className="absolute bottom-3 left-3 z-10 flex gap-1 rounded-lg bg-panel/95 p-1 shadow">
      {DIRECTIONS.map(([key, label, symbol]) => (
        <button key={key} type="button" disabled={disabled} aria-label={`선택 관절 ${label} 회전`}
          title="방향키: 회전 · Shift: 미세 회전 · Alt+좌우: 비틀기"
          className="h-9 w-9 rounded border border-line focus-visible:outline focus-visible:outline-2 disabled:opacity-40"
          onKeyDown={handleKeyDown}
          onClick={(event) => { if (!disabled) onRotate({ key, shiftKey: event.shiftKey, altKey: event.altKey, repeat: false }); }}>
          {symbol}
        </button>
      ))}
    </div>
  );
}
