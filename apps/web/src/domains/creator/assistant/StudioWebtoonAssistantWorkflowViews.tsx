import { CheckCircle2, Compass, Copy, PackageOpen } from "lucide-react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";

import {
  routeStudioAssistantSkills,
  type StudioAssistantRoutableTab,
} from "./studio-assistant-skill-router";
import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  evaluateWorkflowPackRightsClearance,
  type StudioWorkflowPack,
} from "./studio-workflow-pack";
import { PERSPECTIVE_GUIDES } from "./webtoon-croquis-pose-guide";
import { WEBTOON_PLATFORM_SPECS } from "./webtoon-platform-spec-validator";

import type { WebtoonProductionStage } from "./webtoon-focus-timer";

import { cn } from "@/shared/lib/utils";

const CHIP_CLASS = cn(
  "inline-flex items-center justify-center rounded-lg border px-2.5 text-[0.65rem] font-bold",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
);

export function StudioAssistantSkillRouterBar({
  query,
  onQueryChange,
  activeTab,
  focusStage,
  panelsCount,
  protectedRegionsCount,
  canvasHeight,
  onSelectTab,
}: {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly activeTab: StudioAssistantRoutableTab;
  readonly focusStage: WebtoonProductionStage;
  readonly panelsCount: number;
  readonly protectedRegionsCount: number;
  readonly canvasHeight: number;
  readonly onSelectTab: (tabId: StudioAssistantRoutableTab) => void;
}) {
  const routedSkills = routeStudioAssistantSkills(
    { query, focusStage, panelsCount, protectedRegionsCount, canvasHeight },
    3,
  );

  return (
    <div
      data-testid="studio-assistant-skill-router"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-raised/60 px-3 py-2"
    >
      <div className="relative min-w-44 flex-1">
        <Compass
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="스마트 도구 자동 추천 검색"
          placeholder="작업 내용 입력 (예: 3D 로우앵글, 네이버 슬라이스, 로판 세팅)…"
          className={cn(
            "min-h-9 w-full rounded-lg border border-line bg-card pl-8 pr-2.5 text-xs text-fg",
            STUDIO_FOCUS_RING,
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label="추천 보조 도구">
        {routedSkills.map((match) => (
          <button
            key={match.tabId}
            type="button"
            onClick={() => onSelectTab(match.tabId)}
            title={match.reason}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-lg border px-2 text-[0.65rem] font-bold",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              activeTab === match.tabId
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <span>{match.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StudioWorkflowPacksPanel({
  appliedWorkflowPackId,
  copiedWorkflowPackId,
  onApplyPack,
  onCopyPack,
}: {
  readonly appliedWorkflowPackId: string | null;
  readonly copiedWorkflowPackId: string | null;
  readonly onApplyPack: (pack: StudioWorkflowPack) => void;
  readonly onCopyPack: (pack: StudioWorkflowPack) => void;
}) {
  return (
    <div data-testid="studio-workflow-packs-tab" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-xl border border-line bg-card/60 p-3">
        <div className="flex items-center gap-1.5 font-bold">
          <PackageOpen className="size-4 text-accent" aria-hidden />
          <span>장르별 Studio Workflow Pack (1클릭 세팅 &amp; Rights BOM 검증)</span>
        </div>
        <p className="text-[0.65rem] text-fg-3">
          플랫폼 규격, 피부톤 팔레트, 투시 구도, 독자 페이싱, 포커스 타이머를 하나의 팩으로 적용하고 상업 연재 라이선스를 확인합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {BUILTIN_STUDIO_WORKFLOW_PACKS.map((pack) => {
          const clearance = evaluateWorkflowPackRightsClearance(pack);
          const isApplied = appliedWorkflowPackId === pack.id;
          const isCopied = copiedWorkflowPackId === pack.id;
          return (
            <article
              key={pack.id}
              data-workflow-pack-id={pack.id}
              className={cn(
                "flex flex-col justify-between gap-3 rounded-xl border p-3",
                isApplied ? "border-accent bg-accent-soft/40" : "border-line bg-card",
              )}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.78rem] font-bold text-fg">{pack.name}</span>
                  <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-3">
                    {pack.genre}
                  </span>
                </div>
                <p className="text-[0.66rem] leading-relaxed text-fg-2">{pack.summary}</p>
                <div className="flex flex-wrap gap-1 text-[0.6rem] text-fg-3">
                  <span className="rounded border border-line bg-raised px-1.5 py-0.5">
                    {WEBTOON_PLATFORM_SPECS[pack.platformId].name}
                  </span>
                  <span className="rounded border border-line bg-raised px-1.5 py-0.5">
                    {PERSPECTIVE_GUIDES[pack.perspectivePreset].label}
                  </span>
                </div>
                <p
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-bold",
                    clearance.clearedForCommercialExport
                      ? "bg-good/10 text-good"
                      : "bg-warn/10 text-warn",
                  )}
                >
                  <CheckCircle2 className="size-3" aria-hidden />
                  <span>{clearance.summary}</span>
                </p>
              </div>

              <div className="flex items-center gap-1.5 border-t border-line/60 pt-2">
                <button
                  type="button"
                  onClick={() => onApplyPack(pack)}
                  className={cn(
                    CHIP_CLASS,
                    "flex-1 border-transparent bg-accent text-on-accent hover:opacity-90",
                  )}
                >
                  {isApplied ? "적용됨" : "팩 일괄 적용"}
                </button>
                <button
                  type="button"
                  onClick={() => onCopyPack(pack)}
                  className={cn(CHIP_CLASS, "gap-1 border-line bg-raised text-fg hover:bg-card")}
                >
                  <Copy className="size-3" aria-hidden />
                  <span>{isCopied ? "JSON 복사됨" : "JSON 복사"}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
