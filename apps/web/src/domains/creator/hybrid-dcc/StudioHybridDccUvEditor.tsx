import { useId } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioHybridDccUvSelectionSurface } from "./StudioHybridDccUvSelectionSurface";

import type { StudioHybridDccUvEditorState } from "./useStudioHybridDccUvEditor";

const CONTROL = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

/** 재질 작업대에서 면 코너 정본 UV를 선택하고, 표시용 미리보기를 명시적으로 확정한다. */
export function StudioHybridDccUvEditor({ model }: { readonly model: StudioHybridDccUvEditorState }) {
  const bt = useBilingual("StudioHybridDccUvEditor");
  const id = useId();
  if (!model.visible) return null;
  return <section ref={model.sectionRef} aria-labelledby={`${id}-title`} className="mt-3 min-w-0 space-y-3 rounded-xl border border-line bg-panel p-3" data-studio-hybrid-dcc-uv-editor="true" data-previewing={model.previewing || undefined} data-source-hash={model.sourceModel?.sourceHash ?? ""}>
    <h3 id={`${id}-title`} className="text-sm font-semibold text-fg">{bt("UV 편집", "UV editing")}</h3>
    <p id={`${id}-help`} className="text-xs leading-relaxed text-fg-2">{bt("원본 메시의 면 코너 UV를 편집합니다. 3D 체크무늬는 좌표 확인용이며, 이미지 텍스처를 저장하지 않습니다. 변형 결과는 적용 전까지 저장되지 않습니다.", "Edit the source mesh's face-corner UVs. The 3D checker is a coordinate guide and does not save an image texture. Transform previews are not saved until applied.")}</p>
    <fieldset disabled={model.locked} className="flex flex-wrap items-end gap-2">
      <legend className="sr-only">{bt("UV 생성", "Generate UVs")}</legend>
      <label className="grid min-w-0 flex-1 gap-1 text-xs text-fg-2" htmlFor={`${id}-unwrap`}>
        {bt("투영 방식", "Projection")}
        <select id={`${id}-unwrap`} className={CONTROL} value={model.unwrapMode} onChange={(event) => {
          const mode = event.target.value;
          if (mode === "box" || mode === "planar-xy" || mode === "planar-xz" || mode === "planar-yz") model.setUnwrapMode(mode);
        }}>
          <option value="box">{bt("박스 · 면 법선별 패치", "Box · face-normal patches")}</option><option value="planar-xy">XY</option><option value="planar-xz">XZ</option><option value="planar-yz">YZ</option>
        </select>
      </label>
      <button type="button" className={CONTROL} disabled={model.dirty} onClick={model.unwrap}>{model.sourceModel ? bt("UV 다시 펼치기", "Unwrap UVs again") : bt("UV 펼치기", "Unwrap UVs")}</button>
    </fieldset>
    {model.sourceModel ? <p className="text-xs leading-relaxed text-fg-3">{bt("다시 펼치면 현재 UV를 교체하며 되돌릴 수 있습니다. 아일랜드는 공유 변 양끝의 UV가 정확히 같은 면들을 묶습니다.", "Unwrapping replaces the current UVs and can be undone. Islands join faces whose UVs match exactly at both ends of a shared edge.")}</p> : <p className="text-xs text-fg-2">{bt("UV를 펼치면 2D 선택 화면과 3D 체크무늬가 나타납니다.", "Unwrap UVs to show the 2D selection view and the 3D checker.")}</p>}
    {model.sourceModel ? <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)]">
      <StudioHybridDccUvSelectionSurface key={`${model.sourceModel.documentId}:${model.sourceModel.assetId}:${model.sourceModel.sourceHash}`} model={model} />
      <form className="min-w-0 space-y-3" onSubmit={(event) => { event.preventDefault(); model.apply(); }}>
        <p className="text-xs text-fg-2">{formatI18nTemplate(bt("선택한 UV 코너 {count}개", "{count} UV corners selected"), { count: model.selectedCount })}</p>
        <p className="text-xs leading-relaxed text-fg-3">{bt("회전·크기는 선택한 코너들의 평균 중심을 기준으로 합니다. 같은 좌표의 코너도 각각 계산합니다. 음수 좌표·타일 밖·0배율을 허용합니다.", "Rotation and scale use the average of the selected corners, counting separate corners at the same coordinate. Negative coordinates, other tiles and zero scale are allowed.")}</p>
        <fieldset disabled={model.locked || !model.selectedCount} className="space-y-3">
          <legend className="sr-only">{bt("UV 변형 값", "UV transform values")}</legend>
          <label className="grid gap-1 text-xs text-fg-2" htmlFor={`${id}-kind`}>{bt("UV 변형 종류", "UV transform type")}<select id={`${id}-kind`} className={CONTROL} value={model.kind} onChange={(event) => {
            const kind = event.target.value; if (kind === "translate" || kind === "rotate" || kind === "scale") model.setKind(kind);
          }}><option value="translate">{bt("이동", "Move")}</option><option value="rotate">{bt("회전", "Rotate")}</option><option value="scale">{bt("크기", "Scale")}</option></select></label>
          <div className="grid grid-cols-2 gap-2">
            {(model.kind === "rotate" ? ["angle"] as const : ["u", "v"] as const).map((axis) => <label key={axis} htmlFor={`${id}-${axis}`} className="grid min-w-0 gap-1 text-xs text-fg-2">
              {axis === "angle" ? bt("UV 회전 (도)", "UV rotation (degrees)") : `${axis.toUpperCase()} ${model.kind === "scale" ? bt("(배율)", "(factor)") : bt("(이동량)", "(offset)")}`}
              <input id={`${id}-${axis}`} className={`${CONTROL} w-full`} type="text" inputMode="decimal" value={model.fields[axis]} maxLength={48} autoComplete="off" spellCheck={false} aria-invalid={model.error ? true : undefined} aria-describedby={`${id}-help${model.error ? ` ${id}-error` : ""}`} onChange={(event) => model.setField(axis, event.target.value)} />
            </label>)}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2"><button type="submit" className={`${CONTROL} border-accent/60 bg-accent-soft font-semibold text-accent`} disabled={!model.canApply}>{model.applying ? bt("UV 적용 중", "Applying UVs") : bt("UV 변형 적용", "Apply UV transform")}</button><button type="button" className={CONTROL} disabled={!model.dirty || model.applying} onClick={model.cancel}>{bt("UV 미리보기 취소", "Cancel UV preview")}</button></div>
      </form>
    </div> : null}
    {model.unavailable ? <p className="text-xs text-fg-2">{model.unavailable}</p> : null}
    {model.error ? <p id={`${id}-error`} role="alert" className="text-xs text-bad">{model.error}</p> : null}
    <p role="status" aria-live="polite" className="min-h-4 text-xs text-fg-2">{model.notice}</p>
  </section>;
}
