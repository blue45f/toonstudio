import { StudioThreeDToggleControl } from "../StudioThreeDToggle";

export const CONTROL_CLASS =
  "min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none transition-[border-color,background-color] duration-150 hover:bg-raised focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";

interface ModifierNumberFieldProps {
  readonly label: string;
  readonly visibleLabel?: string;
  readonly description?: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly disabled: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
}

export function ModifierNumberField({
  label,
  visibleLabel,
  description,
  value,
  onChange,
  disabled,
  min,
  max,
  step,
  unit,
}: ModifierNumberFieldProps) {
  return (
    <label className="block min-w-0 text-xs font-medium text-fg-2">
      <span className="mb-1.5 block break-words [overflow-wrap:anywhere]">
        {visibleLabel ?? label}
      </span>
      <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <input
          type="number"
          aria-label={label}
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={CONTROL_CLASS}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        {unit ? <span className="shrink-0 text-[0.6875rem] text-fg-3">{unit}</span> : null}
      </span>
      {description ? (
        <span className="mt-1.5 block break-words text-[0.6875rem] font-normal leading-relaxed text-fg-3 [overflow-wrap:anywhere]">
          {description}
        </span>
      ) : null}
    </label>
  );
}

interface ModifierSelectFieldProps<T extends string> {
  readonly label: string;
  readonly visibleLabel?: string;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled: boolean;
  readonly options: readonly { readonly value: T; readonly label: string; readonly disabled?: boolean }[];
}

export function ModifierSelectField<T extends string>({
  label,
  visibleLabel,
  value,
  onChange,
  disabled,
  options,
}: ModifierSelectFieldProps<T>) {
  return (
    <label className="block min-w-0 text-xs font-medium text-fg-2">
      <span className="mb-1.5 block break-words [overflow-wrap:anywhere]">
        {visibleLabel ?? label}
      </span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        className={CONTROL_CLASS}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ModifierToggleField({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly description: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <StudioThreeDToggleControl
      checked={checked}
      disabled={disabled}
      label={label}
      description={description}
      className="min-h-11 rounded-lg bg-canvas/35 px-3 py-2 hover:bg-raised"
      labelClassName="text-xs font-semibold text-fg"
      descriptionClassName="text-[0.6875rem] leading-relaxed text-fg-3"
      onChange={onChange}
    />
  );
}
