import { StudioDirectorImageVault } from "./StudioDirectorImageVault";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioScenarioImageGenerationPreflight } from "./studio-scenario-candidate-workflow";

const choiceClass = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs hover:bg-raised disabled:opacity-45";

export function StudioDirectorCutSelectionHeader({ total, missing, selected, busy, onMissing, onAll, onClear }: {
  total: number; missing: number; selected: number; busy: boolean;
  onMissing: () => void; onAll: () => void; onClear: () => void;
}) {
  const bt = useBilingual("studio.director.cutSelection");
  return <header className="mb-3 flex flex-wrap items-center gap-2">
    <div className="mr-auto">
      <h3 className="text-sm font-bold">{bt("AI가 이해한 컷과 연출 확인", "Review cuts and direction")}</h3>
      <p className="text-[0.65rem] text-fg-3">{bt("다시 제작할 컷을 선택하세요. 기존 그림은 후보에 남습니다.", "Select the cuts to generate. Existing images stay in the candidate list.")}</p>
    </div>
    <button type="button" className={choiceClass} disabled={busy || !missing} onClick={onMissing}>{bt("그림 없는 컷 선택", "Select cuts without images")}</button>
    <button type="button" className={choiceClass} disabled={busy || !total} onClick={onAll}>{bt("전체 선택", "Select all")}</button>
    <button type="button" className={choiceClass} disabled={busy || !selected} onClick={onClear}>{bt("선택 해제", "Clear selection")}</button>
  </header>;
}

export function StudioDirectorGenerationAction({ generation, selected, blocked, imageConfigured, onGenerate }: {
  generation: StudioScenarioImageGenerationPreflight; selected: number; blocked: boolean; imageConfigured: boolean; onGenerate: () => void;
}) {
  const bt = useBilingual("studio.director.cutSelection");
  const { indexes, requestedCount, variants, withinLimit, maxRequests } = generation;
  const withoutPrompt = selected - indexes.length;
  return <>{!imageConfigured && <StudioDirectorImageVault />}<div className="sticky bottom-2 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-raised/95 p-2 shadow-xl backdrop-blur">
    <strong className="px-2 text-xs">{bt(`${selected}컷 선택됨`, `${selected} cuts selected`)}</strong>
    <span className="text-[0.65rem] text-fg-3">{bt(`컷당 후보 ${variants}개 · 총 ${requestedCount}개`, `${variants} candidates per cut · ${requestedCount} total`)}</span>
    {withoutPrompt > 0 && <span role="status" className="text-xs text-fg-2">{bt(`그림 설명이 없는 ${withoutPrompt}컷은 제외합니다.`, `${withoutPrompt} cuts without an image prompt will be skipped.`)}</span>}
    {!withinLimit && <span role="alert" className="text-xs text-bad">{bt(`한 번에 후보 ${maxRequests}개까지 제작할 수 있어요. 선택한 컷을 줄여 주세요.`, `Select fewer cuts to stay within the limit of ${maxRequests} candidates.`)}</span>}
    <button type="button" onClick={onGenerate} disabled={blocked || !requestedCount || !withinLimit}
      className="ml-auto min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent disabled:opacity-45">
      {bt(`선택한 ${indexes.length}컷 제작하기`, `Generate ${indexes.length} selected cuts`)}
    </button>
  </div></>;
}
