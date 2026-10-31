import { useId } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioHybridDccUvAtlasModel } from "./useStudioHybridDccUvAtlas";

const CONTROL = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

/** 자동 펼치기의 설정과 진행을 표시하고, 계산·적용 중에도 취소 조작을 남긴다. */
export function StudioHybridDccUvAtlasTools({ model }: { readonly model: StudioHybridDccUvAtlasModel }) {
  const bt = useBilingual("StudioHybridDccUvAtlas");
  const id = useId();
  const active = model.phase !== "idle";
  const locked = model.busy || active;
  const startDisabled = locked || !model.canStart || Boolean(model.unavailable);
  const status = active
    ? model.stage || (model.phase === "publishing" ? bt("UV 적용 중", "Applying UVs") : bt("자동 UV 펼치기 중", "Unwrapping UVs automatically"))
    : model.notice;
  const description = `${id}-help${model.unavailable ? ` ${id}-unavailable` : ""}${model.error ? ` ${id}-error` : ""}`;

  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-3 rounded-xl border border-line bg-panel p-3" data-studio-hybrid-dcc-uv-atlas="true">
    <h4 id={`${id}-title`} className="text-xs font-semibold text-fg">{bt("자동 UV 펼치기", "Automatic UV unwrapping")}</h4>
    <p id={`${id}-help`} className="text-xs leading-relaxed text-fg-2">{bt("선택한 오브젝트의 표면을 새 UV 아일랜드로 펼치고 UV 타일 안에 정리합니다. 여백은 목표 해상도의 픽셀 수로 계산합니다.", "Unwrap the selected object's surface into new UV islands and arrange them inside a UV tile. Padding is measured in pixels at the target resolution.")}</p>
    <p id={`${id}-replacement`} className="text-xs leading-relaxed text-fg-3">{bt("적용하면 기존 UV를 교체하며 한 번의 실행 취소로 되돌릴 수 있습니다. 기존 이미지 텍스처의 배치가 달라질 수 있습니다.", "Applying replaces the existing UVs and can be reverted with one undo. The placement of existing image textures may change.")}</p>
    <form className="min-w-0 space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (!startDisabled) void model.start();
    }}>
      <fieldset disabled={locked} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <legend className="sr-only">{bt("자동 UV 펼치기 설정", "Automatic UV unwrapping settings")}</legend>
        <label htmlFor={`${id}-resolution`} className="grid min-w-0 gap-1 text-xs text-fg-2">
          {bt("목표 해상도 (px)", "Target resolution (px)")}
          <input id={`${id}-resolution`} className={`${CONTROL} w-full`} type="text" inputMode="numeric" maxLength={48} autoComplete="off" spellCheck={false} disabled={locked} value={model.resolution} aria-describedby={description} onChange={(event) => {
            if (!locked) model.setResolution(event.target.value);
          }} />
        </label>
        <label htmlFor={`${id}-padding`} className="grid min-w-0 gap-1 text-xs text-fg-2">
          {bt("아일랜드 여백 (px)", "Island padding (px)")}
          <input id={`${id}-padding`} className={`${CONTROL} w-full`} type="text" inputMode="numeric" maxLength={48} autoComplete="off" spellCheck={false} disabled={locked} value={model.padding} aria-describedby={description} onChange={(event) => {
            if (!locked) model.setPadding(event.target.value);
          }} />
        </label>
        <label className="flex min-h-11 min-w-0 items-center gap-2 text-xs text-fg-2 sm:col-span-2">
          <input type="checkbox" disabled={locked} checked={model.rotateCharts} onChange={(event) => {
            if (!locked) model.setRotateCharts(event.target.checked);
          }} />
          {bt("90도 회전 허용", "Allow 90° rotation")}
        </label>
      </fieldset>
      <div className="flex min-w-0 flex-wrap gap-2">
        <button type="submit" className={`${CONTROL} border-accent/60 bg-accent-soft font-semibold text-accent`} disabled={startDisabled} aria-describedby={`${description} ${id}-replacement`}>
          {active ? bt("자동 UV 펼치기 진행 중", "Automatic UV unwrapping in progress") : model.error ? bt("자동 UV 펼치기 다시 시도", "Retry automatic UV unwrapping") : bt("자동 UV 펼치기", "Unwrap UVs automatically")}
        </button>
        <button type="button" className={CONTROL} disabled={!active} onClick={model.cancel}>{bt("자동 UV 펼치기 취소", "Cancel automatic UV unwrapping")}</button>
      </div>
    </form>
    {model.unavailable ? <p id={`${id}-unavailable`} className="text-xs leading-relaxed text-fg-2">{model.unavailable}</p> : null}
    {model.error ? <p id={`${id}-error`} role="alert" className="text-xs leading-relaxed text-bad">{model.error}</p> : null}
    <div role="status" aria-live="polite" className="min-w-0 space-y-1 text-xs text-fg-2">
      <p className="min-h-4">{status}</p>
      {active ? <progress className="h-2 w-full accent-accent" aria-label={bt("자동 UV 펼치기 진행률", "Automatic UV unwrapping progress")} max={1} value={model.progress ?? undefined} /> : null}
    </div>
  </section>;
}
