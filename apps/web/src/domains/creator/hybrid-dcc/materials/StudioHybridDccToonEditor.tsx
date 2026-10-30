import { useId } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioHybridDccToonEditorState } from "./useStudioHybridDccToonEditor";

const CONTROL = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

export function StudioHybridDccToonEditor({ model }: { readonly model: StudioHybridDccToonEditorState }) {
  const bt = useBilingual("StudioHybridDccToonEditor"); const id = useId();
  if (!model.visible) return null;
  return <section ref={model.sectionRef} aria-labelledby={`${id}-title`} className="mt-3 min-w-0 space-y-3 rounded-xl border border-line bg-panel p-3"
    data-studio-hybrid-dcc-toon-editor="true" data-previewing={Boolean(model.preview) || undefined}>
    <h3 id={`${id}-title`} className="text-sm font-semibold text-fg">{bt("툰 재질 편집", "Toon material editing")}</h3>
    <p id={`${id}-help`} className="text-xs leading-relaxed text-fg-2">{bt("밝은 면과 그림자의 색·경계, 외곽선을 조절합니다. 적용 전 변경은 미리보기이며 작업파일에 저장되지 않습니다.", "Adjust lit and shaded colors, the shading boundary and outlines. Changes remain an unsaved preview until applied.")}</p>
    <form className="min-w-0 space-y-4" onSubmit={(event) => { event.preventDefault(); model.apply(); }}>
      <fieldset disabled={model.locked} className="min-w-0 space-y-4">
        <legend className="sr-only">{bt("툰 재질 설정", "Toon material settings")}</legend>
        <label htmlFor={`${id}-scope`} className="grid gap-1 text-xs text-fg-2">{bt("적용 범위", "Apply to")}
          <select id={`${id}-scope`} className={CONTROL} value={model.slot} onChange={(event) => model.setSlot(event.target.value)}>
            <option value="all">{bt("오브젝트의 모든 면", "All object faces")}</option>
            {model.slots.map((slot) => <option key={slot} value={String(slot)}>{formatI18nTemplate(bt("재질 슬롯 {slot}", "Material slot {slot}"), { slot })}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {(["base", "shade"] as const).map((field) => <label key={field} htmlFor={`${id}-${field}`} className="grid min-w-0 gap-1 text-xs text-fg-2">
            {field === "base" ? bt("밝은 면 색", "Lit color") : bt("그림자 색", "Shade color")}
            <input id={`${id}-${field}`} type="color" className={`${CONTROL} w-full p-1`} value={model.fields[field]} onChange={(event) => model.setField(field, event.target.value)} />
            <span aria-hidden="true" className="text-fg-3">{model.fields[field]}</span>
          </label>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["shift", "toony"] as const).map((field) => <div key={field} className="grid min-w-0 gap-1 text-xs text-fg-2">
            <label htmlFor={`${id}-${field}`}>{field === "shift" ? bt("그림자 경계 (-1~1)", "Shadow boundary (-1 to 1)") : bt("명암 선명도 (0~1)", "Shading sharpness (0 to 1)")}</label>
            <input id={`${id}-${field}`} type="text" inputMode="decimal" maxLength={48} autoComplete="off" spellCheck={false} className={CONTROL} value={model.fields[field]}
              aria-invalid={model.error ? true : undefined} aria-describedby={`${id}-help${model.error ? ` ${id}-error` : ""}`} onChange={(event) => model.setField(field, event.target.value)} />
            <input type="range" min={field === "shift" ? -1 : 0} max={1} step={.01} className="min-h-11 w-full accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={field === "shift" ? bt("그림자 경계 슬라이더", "Shadow boundary slider") : bt("명암 선명도 슬라이더", "Shading sharpness slider")}
              value={Number.isFinite(Number(model.fields[field])) ? Number(model.fields[field]) : 0} onChange={(event) => model.setField(field, event.target.value)} />
          </div>)}
        </div>
        <div className="space-y-3 border-t border-line pt-3">
          <label className="flex min-h-11 items-center gap-2 text-xs text-fg"><input type="checkbox" checked={model.fields.outline} onChange={(event) => model.setField("outline", event.target.checked)} />{bt("외곽선 표시", "Show outlines")}</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor={`${id}-outline-mode`} className="grid min-w-0 gap-1 text-xs text-fg-2">{bt("외곽선 크기 기준", "Outline size basis")}
              <select id={`${id}-outline-mode`} className={CONTROL} disabled={!model.fields.outline} value={model.fields.outlineMode} onChange={(event) => { const value = event.target.value; if (value === "worldCoordinates" || value === "screenCoordinates") model.setField("outlineMode", value); }}>
                <option value="worldCoordinates">{bt("장면 단위", "Scene units")}</option><option value="screenCoordinates">{bt("화면 높이", "Screen height")}</option>
              </select>
            </label>
            <label htmlFor={`${id}-width`} className="grid min-w-0 gap-1 text-xs text-fg-2">{model.fields.outlineMode === "screenCoordinates" ? bt("외곽선 너비 (화면 높이 %)", "Outline width (% of screen height)") : bt("외곽선 너비 (장면 단위)", "Outline width (scene units)")}
              <input id={`${id}-width`} type="text" inputMode="decimal" maxLength={48} autoComplete="off" spellCheck={false} className={CONTROL} disabled={!model.fields.outline} value={model.fields.width}
                aria-invalid={model.error ? true : undefined} aria-describedby={`${id}-help${model.error ? ` ${id}-error` : ""}`} onChange={(event) => model.setField("width", event.target.value)} />
            </label>
          </div>
          <label htmlFor={`${id}-outline-color`} className="flex min-h-11 flex-wrap items-center gap-3 text-xs text-fg-2">{bt("외곽선 색", "Outline color")}
            <input id={`${id}-outline-color`} type="color" className={`${CONTROL} w-20 p-1`} disabled={!model.fields.outline} value={model.fields.outlineColor} onChange={(event) => model.setField("outlineColor", event.target.value)} />
            <span aria-hidden="true" className="text-fg-3">{model.fields.outlineColor}</span>
          </label>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={CONTROL} disabled={model.locked} onClick={model.startPreview}>{bt("재질 미리보기", "Preview material")}</button>
        <button type="submit" className={`${CONTROL} border-accent/60 bg-accent-soft font-semibold text-accent`} disabled={!model.canApply}>{model.applying ? bt("재질 적용 중", "Applying material") : bt("툰 재질 적용", "Apply toon material")}</button>
        <button type="button" className={CONTROL} disabled={!model.dirty || model.applying} onClick={model.cancel}>{bt("재질 미리보기 취소", "Cancel material preview")}</button>
        <button type="button" className={`${CONTROL} border-transparent bg-transparent`} disabled={!model.canReset} onClick={model.reset}>{bt("기본 재질로 복원", "Restore default material")}</button>
      </div>
    </form>
    {model.unavailable ? <p className="text-xs text-fg-2">{model.unavailable}</p> : null}
    {model.error ? <p id={`${id}-error`} role="alert" className="text-xs text-bad">{model.error}</p> : null}
    <p role="status" aria-live="polite" className="min-h-4 text-xs text-fg-2">{model.notice}</p>
  </section>;
}
