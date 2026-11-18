import { useState, type FormEvent } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { CUSTOM_PRIMITIVE_LIMITS, HEAD_DIVISIONS, type CustomPrimitive } from "./studio-hybrid-dcc-custom-primitive";

const inputClass = "min-h-11 w-full min-w-0 rounded-md border border-line bg-canvas px-2 text-sm text-fg focus-visible:outline-accent";

export function StudioHybridDccCustomPrimitiveForm({ disabled, onAdd }: {
  readonly disabled: boolean;
  readonly onAdd: (shape: CustomPrimitive, label: string) => void;
}) {
  const bt = useBilingual("StudioHybridDccCustomPrimitiveForm");
  const [kind, setKind] = useState<CustomPrimitive["kind"]>("sculpt-head");
  const [divisions, setDivisions] = useState(18);
  const [values, setValues] = useState({ heightCm: "23", jawPercent: "78", steps: "8", widthCm: "120", riseCm: "17", treadCm: "28" });

  const field = (key: keyof typeof values, label: string) => (
    <label className="grid min-w-0 gap-1">
      {label}
      <input className={inputClass} type="number" required min={CUSTOM_PRIMITIVE_LIMITS[key][0]}
        max={CUSTOM_PRIMITIVE_LIMITS[key][1]} step={key === "steps" ? 1 : "any"}
        value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
    </label>
  );

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    if (kind === "sculpt-head") {
      onAdd({ kind, heightCm: Number(values.heightCm), jawPercent: Number(values.jawPercent), divisions }, bt("두상 추가", "Add head"));
    } else {
      onAdd({ kind, steps: Number(values.steps), widthCm: Number(values.widthCm), riseCm: Number(values.riseCm), treadCm: Number(values.treadCm) }, bt("계단 추가", "Add stairs"));
    }
  };

  return (
    <details className="rounded-xl border border-line bg-canvas/35">
      <summary className="min-h-11 cursor-pointer content-center rounded-xl px-3 text-xs font-medium text-fg-2 focus-visible:outline-accent">
        {bt("맞춤 두상·계단", "Custom head and stairs")}
      </summary>
      <form onSubmit={add} className="border-t border-line p-3">
        <fieldset disabled={disabled} className="grid min-w-0 grid-cols-2 gap-3 text-xs text-fg-2">
          <label className="col-span-2 grid gap-1">
            {bt("만들 도형", "Shape")}
            <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value === "stairs" ? "stairs" : "sculpt-head")}>
              <option value="sculpt-head">{bt("캐릭터 두상", "Character head")}</option>
              <option value="stairs">{bt("직선 계단", "Straight stairs")}</option>
            </select>
          </label>
          {kind === "sculpt-head" ? (<>
            {field("heightCm", bt("두상 높이 (cm)", "Head height (cm)"))}
            {field("jawPercent", bt("턱 너비 (%)", "Jaw width (%)"))}
            <label className="col-span-2 grid gap-1">
              {bt("조형 밀도", "Sculpt density")}
              <select className={inputClass} value={divisions} onChange={(event) => setDivisions(Number(event.target.value))}>
                {HEAD_DIVISIONS.map((value) => <option key={value} value={value}>{bt("사각면", "Quads")} {6 * value * value}</option>)}
              </select>
            </label>
          </>) : (<>
            {field("steps", bt("단수", "Steps"))}
            {field("widthCm", bt("계단 너비 (cm)", "Stair width (cm)"))}
            {field("riseCm", bt("한 단 높이 (cm)", "Riser height (cm)"))}
            {field("treadCm", bt("디딤판 깊이 (cm)", "Tread depth (cm)"))}
          </>)}
          <button type="submit" className="col-span-2 min-h-11 rounded-lg border border-accent/45 bg-card font-medium text-fg hover:bg-raised disabled:opacity-45">
            {kind === "sculpt-head" ? bt("두상 추가", "Add head") : bt("계단 추가", "Add stairs")}
          </button>
        </fieldset>
      </form>
    </details>
  );
}
