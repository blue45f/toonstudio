import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { SwitchIndicator } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";

/**
 * 브러시 스튜디오 설정 탭이 공유하는 슬라이더·스위치 행이다. 상태 없이 받은 값과
 * 콜백만 그리므로 StudioBrushStudio 본문과 듀얼 브러시 컨트롤이 같은 행을 쓴다.
 */
interface RangeRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
  hint?: string;
}

export function RangeRow({ label, value, min, max, step, display, onChange, hint }: RangeRowProps) {
  return (
    <label className="block min-h-14 rounded-xl border border-line bg-card/55 px-3 py-2.5 transition-colors duration-150 hover:border-line-strong hover:bg-card/80">
      <span className="flex items-center justify-between gap-3 text-xs font-semibold text-fg-2">
        <span>{label}</span>
        <span className="rounded-md bg-raised px-1.5 py-0.5 tabular-nums text-[0.7rem] text-fg">{display}</span>
      </span>
      {hint ? <span className="mt-0.5 block text-[0.65rem] leading-relaxed text-fg-3">{hint}</span> : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className={cn("mt-1.5 h-8 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
        aria-label={label}
      />
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-card/55 px-3 py-2.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-raised",
        STUDIO_FOCUS_RING
      )}
    >
      <span>
        <span className="block text-xs font-semibold text-fg-2">{label}</span>
        <span className="block text-[0.65rem] leading-relaxed text-fg-3">{description}</span>
      </span>
      <SwitchIndicator checked={checked} />
    </button>
  );
}
