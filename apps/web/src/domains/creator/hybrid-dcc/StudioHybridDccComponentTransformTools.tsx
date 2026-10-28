import { useId } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioHybridDccComponentTransformModel } from "./useStudioHybridDccComponentTransform";

const CONTROL = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

/** 로컬 좌표·선택 정점의 평균 중심을 사용하는 메시 요소 변형 작업대. */
export function StudioHybridDccComponentTransformTools({ model }: { readonly model: StudioHybridDccComponentTransformModel }) {
  const bt = useBilingual("StudioHybridDccComponentTransform");
  const id = useId();
  if (!model.visible) return null;
  const unit = model.kind === "rotate" ? bt("도", "degrees") : model.kind === "scale" ? bt("배율", "factor") : "m";
  return (
    <section ref={model.sectionRef} className="mt-2 space-y-3 rounded-xl border border-line bg-panel p-3" aria-labelledby={`${id}-title`} data-studio-hybrid-dcc-component-transform="true" data-previewing={model.previewing || undefined}>
      <h3 id={`${id}-title`} className="text-sm font-semibold text-fg">{bt("선택 요소 변형", "Transform selected elements")}</h3>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-fg-2">
        {bt("로컬 X·Y·Z 좌표로 점·선·면을 편집합니다. 회전과 크기는 선택한 정점들의 평균 중심을 기준으로 합니다.", "Edit vertices, edges and faces in local X, Y and Z. Rotation and scale use the median of the selected vertices as the pivot.")}
      </p>
      <p className="text-xs text-fg-3">{formatI18nTemplate(bt("선택한 요소 {count}개", "{count} elements selected"), { count: model.selectionCount })}</p>
      <form onSubmit={(event) => { event.preventDefault(); model.apply(); }} className="space-y-3">
        <fieldset disabled={model.locked} className="space-y-3">
          <legend className="sr-only">{bt("요소 변형 값", "Component transform values")}</legend>
          <label className="grid gap-1 text-xs text-fg-2" htmlFor={`${id}-kind`}>
            {bt("변형 종류", "Transform type")}
            <select id={`${id}-kind`} className={CONTROL} value={model.kind} onChange={(event) => {
              const value = event.target.value;
              if (value === "translate" || value === "rotate" || value === "scale") model.setKind(value);
            }}>
              <option value="translate">{bt("이동", "Move")}</option>
              <option value="rotate">{bt("회전", "Rotate")}</option>
              <option value="scale">{bt("크기", "Scale")}</option>
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["x", "y", "z"] as const).map((axis) => (
              <label key={axis} htmlFor={`${id}-${axis}`} className="grid min-w-0 gap-1 text-xs text-fg-2">
                {`${axis.toUpperCase()} (${unit})`}
                <input id={`${id}-${axis}`} className={`${CONTROL} w-full`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={48} value={model.fields[axis]} aria-invalid={model.error ? true : undefined} aria-describedby={`${id}-hint${model.error ? ` ${id}-error` : ""}`} onChange={(event) => model.setField(axis, event.target.value)} />
              </label>
            ))}
          </div>
        </fieldset>
        {model.unavailable ? <p className="text-xs text-fg-2">{model.unavailable}</p> : null}
        {model.error ? <p id={`${id}-error`} role="alert" className="text-xs text-bad">{model.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={`${CONTROL} border-accent/60 bg-accent-soft font-semibold text-accent`} disabled={!model.canApply}>{model.applying ? bt("적용 중", "Applying") : bt("요소 변형 적용", "Apply component transform")}</button>
          <button type="button" className={CONTROL} disabled={!model.dirty || model.applying} onClick={model.cancel}>{bt("변형 취소", "Cancel transform")}</button>
        </div>
        <p role="status" aria-live="polite" className="min-h-4 text-xs text-fg-2">{model.notice}</p>
      </form>
    </section>
  );
}
