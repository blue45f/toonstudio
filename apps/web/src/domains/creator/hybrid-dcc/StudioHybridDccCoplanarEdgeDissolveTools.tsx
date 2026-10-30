import { useId, type RefObject } from "react";
import { useT } from "@/shared/lib/i18n";

import type { useStudioHybridDccCoplanarEdgeDissolve } from "./useStudioHybridDccCoplanarEdgeDissolve";

export interface StudioHybridDccCoplanarEdgeDissolveToolsProps {
  readonly model: ReturnType<typeof useStudioHybridDccCoplanarEdgeDissolve>;
  readonly unavailable: string | null;
  readonly busy: boolean;
  readonly sectionRef?: RefObject<HTMLElement | null>;
}

const BUTTON = "min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

/** 선택된 실제 모서리의 계획만 표시하며 계산 중·확정 대기 중에도 취소를 제공한다. */
export function StudioHybridDccCoplanarEdgeDissolveTools({ model, unavailable, busy, sectionRef }: StudioHybridDccCoplanarEdgeDissolveToolsProps) {
  const t = useT(), id = useId();
  const locked = Boolean(unavailable) || busy || model.applying;
  const status = model.applying ? t("studio.bg3dScene.coplanarEdgeHeal.status.applying", undefined, "공유 모서리 치유를 적용하는 중입니다.")
    : model.pending ? t("studio.bg3dScene.coplanarEdgeHeal.status.pending", undefined, "모서리 치유 미리보기를 계산하는 중입니다. 취소할 수 있습니다.")
      : model.status === "ready" ? t("studio.bg3dScene.coplanarEdgeHeal.status.ready", undefined, "미리보기입니다. 적용 전에는 원본과 편집 이력이 바뀌지 않습니다.")
        : t("studio.bg3dScene.coplanarEdgeHeal.status.idle", undefined, "같은 평면의 두 면 사이에서 지울 모서리를 선택하세요.");
  return (
    <section ref={sectionRef} aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} aria-busy={model.pending || model.applying}
      className="mt-2 min-w-0 space-y-3 rounded-xl border border-line bg-panel p-3" data-studio-coplanar-edge-heal="true">
      <h3 id={`${id}-title`} className="text-xs font-semibold text-fg">{t("studio.bg3dScene.coplanarEdgeHeal.title", undefined, "공유 모서리 치유")}</h3>
      <p id={`${id}-help`} className="text-xs leading-relaxed text-fg-3">{t("studio.bg3dScene.coplanarEdgeHeal.help", undefined, "선택한 경계를 지워 같은 평면의 두 면을 합칩니다.")}</p>
      {unavailable ? <p className="text-xs text-fg-3">{unavailable}</p> : null}
      {model.error ? <p role="alert" className="text-xs text-bad">{model.error}</p> : null}
      <p role="status" aria-live="polite" className="min-h-5 text-xs leading-relaxed text-fg-2">{model.notice || status}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} data-studio-coplanar-preview="true" disabled={locked || model.pending || !model.canPrepare}
          onClick={() => { if (!locked && model.canPrepare && !model.pending) model.prepare(); }}>{t("studio.bg3dScene.coplanarEdgeHeal.preview", undefined, "선택 모서리 미리보기")}</button>
        <button type="button" className={`${BUTTON} border-accent/60 bg-accent-soft text-accent`} disabled={locked || !model.canApply}
          onClick={() => { if (!locked && model.canApply) model.apply(); }}>{t("studio.bg3dScene.coplanarEdgeHeal.apply", undefined, "치유 적용")}</button>
        <button type="button" className={BUTTON} disabled={!model.engaged} onClick={model.cancel}>{t("studio.bg3dScene.coplanarEdgeHeal.cancel", undefined, "치유 취소")}</button>
      </div>
    </section>
  );
}
