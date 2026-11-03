import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

import { StudioHiggsfieldMangakaPanel } from "../manga-toolkit/StudioHiggsfieldMangakaPanel";
import { StudioWebtoonRolePipelineSubPanel } from "../manga-toolkit/StudioWebtoonRolePipelineSubPanel";
import { studioRoleWorkspaceId } from "../studio-task-workspace";
import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

import { StudioCompetitorCapabilityPanel } from "./StudioCompetitorCapabilityPanel";

import { cn } from "@/shared/lib/utils";

type PlanningTab = "roles" | "mangaka";
const TABS: readonly { readonly id: PlanningTab; readonly ko: string; readonly en: string }[] = [
  { id: "roles", ko: "직무별 분업 계획", en: "Role work plan" },
  { id: "mangaka", ko: "만화·웹툰 예제", en: "Comic and webtoon examples" },
];

/** 실제 문서·프로필 변경 없이 계획을 살펴보고 정식 편집기 진입 경로로 배치를 연다. */
export function StudioWorkflowPlanningPanel({ locale }: { readonly locale: "ko" | "en" }) {
  const navigate = useNavigate();
  const prefix = useId();
  const tabRefs = useRef<Partial<Record<PlanningTab, HTMLButtonElement | null>>>({});
  const [activeTab, setActiveTab] = useState<PlanningTab>("roles");
  const ko = locale === "ko";
  const selectTab = (tab: PlanningTab, focus = false) => {
    setActiveTab(tab);
    if (focus) tabRefs.current[tab]?.focus();
  };
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, tab: PlanningTab) => {
    let next: PlanningTab;
    if (event.key === "Home") next = "roles";
    else if (event.key === "End") next = "mangaka";
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = tab === "roles" ? "mangaka" : "roles";
    else return;
    event.preventDefault();
    selectTab(next, true);
  };
  const openWorkspace = (workspaceId: StudioDefaultWorkspaceId) => {
    const search = new URLSearchParams({ roleWorkspace: workspaceId });
    if (!studioRoleWorkspaceId(search)) return;
    navigate(`/studio/canvas?${search.toString()}`);
  };

  return (
    <section data-testid="studio-workflow-planning-panel" className="space-y-4">
      <p className="rounded-xl border border-accent/30 bg-accent-soft/20 p-3 text-sm leading-5 text-fg-2">
        {ko
          ? "분업 계획과 만화 예제를 살펴보세요. 이곳의 선택은 현재 원고를 수정하지 않습니다. 아래에서 작업공간 배치를 선택하면 편집기가 열립니다."
          : "Explore production plans and comic examples. These preview choices do not edit the current document. Choosing a workspace layout below opens the editor."}
      </p>
      <div role="tablist" aria-label={ko ? "제작 계획 도구" : "Production planning tools"} className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" id={`${prefix}-tab-${tab.id}`}
            ref={(element) => { tabRefs.current[tab.id] = element; }}
            aria-selected={activeTab === tab.id} aria-controls={`${prefix}-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)} onKeyDown={(event) => handleTabKey(event, tab.id)}
            className={cn("min-h-11 rounded-xl border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              activeTab === tab.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2")}>
            {ko ? tab.ko : tab.en}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${prefix}-panel-roles`} aria-labelledby={`${prefix}-tab-roles`}
        hidden={activeTab !== "roles"} tabIndex={0}>
        {activeTab === "roles" ? <StudioWebtoonRolePipelineSubPanel /> : null}
      </div>
      <div role="tabpanel" id={`${prefix}-panel-mangaka`} aria-labelledby={`${prefix}-tab-mangaka`}
        hidden={activeTab !== "mangaka"} tabIndex={0}>
        {activeTab === "mangaka" ? <StudioHiggsfieldMangakaPanel /> : null}
      </div>
      <StudioCompetitorCapabilityPanel locale={locale} onSelectWorkspacePreset={openWorkspace} />
    </section>
  );
}
