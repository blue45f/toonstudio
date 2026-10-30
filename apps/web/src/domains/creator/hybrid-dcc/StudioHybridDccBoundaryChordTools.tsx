import { useId, type RefObject } from "react";
import { useT } from "@/shared/lib/i18n";

import type { useStudioHybridDccBoundaryChord } from "./useStudioHybridDccBoundaryChord";

export type StudioBoundaryChordPickingMode = "edge" | "vertex" | null;
export interface StudioHybridDccBoundaryChordToolsProps {
  readonly model: ReturnType<typeof useStudioHybridDccBoundaryChord>;
  readonly mode: StudioBoundaryChordPickingMode;
  readonly onModeChange: (mode: Exclude<StudioBoundaryChordPickingMode, null>) => void;
  readonly onCancel: () => void;
  readonly onRestart: () => void;
  readonly unavailable: string | null;
  readonly busy: boolean;
  readonly sectionRef?: RefObject<HTMLElement | null>;
}
const BUTTON = "min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

/** 원본의 경계 두 점만 수집한다. 표시 상태는 실제 hook 계산·host 발행 결과를 사용한다. */
export function StudioHybridDccBoundaryChordTools({ model, mode, onModeChange, onCancel, onRestart, unavailable, busy, sectionRef }: StudioHybridDccBoundaryChordToolsProps) {
  const t = useT(), id = useId();
  const active = mode !== null || model.engaged;
  const locked = Boolean(unavailable) || busy || model.applying;
  const status = model.applying ? t("studio.bg3dScene.boundaryChord.status.applying", undefined, "면 나누기를 적용하는 중입니다.")
    : model.pending ? t("studio.bg3dScene.boundaryChord.status.pending", undefined, "경계선 미리보기를 계산하는 중입니다. 취소하거나 다시 시작할 수 있습니다.")
      : model.status === "ready" ? t("studio.bg3dScene.boundaryChord.status.ready", undefined, "두 경계의 미리보기입니다. 적용 전에는 원본과 편집 이력이 바뀌지 않습니다.")
        : model.endpoints.length === 1 ? t("studio.bg3dScene.boundaryChord.status.firstSelected", undefined, "시작점을 선택했습니다. 같은 면의 다른 경계를 선택하세요.")
          : active ? t("studio.bg3dScene.boundaryChord.status.pickFirst", undefined, "3D 화면에서 선택한 면의 첫 경계를 선택하세요.")
            : t("studio.bg3dScene.boundaryChord.status.idle", undefined, "한 면을 선택하고 모서리 또는 꼭짓점 선택을 시작하세요.");
  return (
    <section ref={sectionRef} aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} aria-busy={model.pending || model.applying}
      className="mt-2 min-w-0 space-y-3 rounded-xl border border-line bg-panel p-3" data-studio-hybrid-dcc-boundary-chord="true">
      <h3 id={`${id}-title`} className="text-xs font-semibold text-fg">{t("studio.bg3dScene.boundaryChord.title", undefined, "경계선으로 면 나누기")}</h3>
      <p id={`${id}-help`} className="text-xs leading-relaxed text-fg-3">
        {t("studio.bg3dScene.boundaryChord.help", undefined, "선택한 면의 경계 두 곳을 이어 면을 나눕니다. 카메라는 자유롭게 움직여도 됩니다. 내부 도형 그리기는 기존 면 그리기에서 사용하세요.")}
      </p>
      <div role="group" aria-label={t("studio.bg3dScene.boundaryChord.pickingMode", undefined, "경계점 선택 방식")} className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} data-studio-boundary-start="edge" aria-pressed={mode === "edge"} disabled={locked || model.pending}
          onClick={() => onModeChange("edge")}>{t("studio.bg3dScene.boundaryChord.pickEdge", undefined, "모서리에서 선택")}</button>
        <button type="button" className={BUTTON} aria-pressed={mode === "vertex"} disabled={locked || model.pending}
          onClick={() => onModeChange("vertex")}>{t("studio.bg3dScene.boundaryChord.pickVertex", undefined, "꼭짓점에서 선택")}</button>
      </div>
      <p className="text-xs tabular-nums text-fg-3">{t("studio.bg3dScene.boundaryChord.selectedCount", { count: model.endpoints.length }, "선택한 경계점 {count}/2")}</p>
      {unavailable ? <p className="text-xs text-fg-3">{unavailable}</p> : null}
      {model.error ? <p role="alert" className="text-xs text-bad">{model.error}</p> : null}
      <p role="status" aria-live="polite" className="min-h-5 text-xs leading-relaxed text-fg-2">{model.notice || status}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${BUTTON} border-accent/60 bg-accent-soft text-accent`} disabled={locked || !model.canApply}
          onClick={() => { if (!locked && model.canApply) model.apply(); }}>{t("studio.bg3dScene.boundaryChord.apply", undefined, "면 나누기 적용")}</button>
        <button type="button" className={BUTTON} disabled={!active} onClick={onCancel}>{t("studio.bg3dScene.boundaryChord.cancel", undefined, "경계선 취소")}</button>
        <button type="button" className={BUTTON} disabled={locked || !active} onClick={onRestart}>{t("studio.bg3dScene.boundaryChord.restart", undefined, "경계점 다시 선택")}</button>
      </div>
    </section>
  );
}
