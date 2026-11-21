/**
 * 회차 단계 인계 섹션 — 단계 시작 화면의 본문 상단에 붙이는 얇은 래퍼.
 *
 * aggregate + 회차 + 대상 단계만 받으면, 앞 단계 산출 조달
 * (episode-stage-handoff-source)과 인용 카드(StageHandoffCard)를 잇는다.
 * 표면은 자기 회차 맥락만 넘기면 되고, 인용 내용·빈 상태·끌어오기/새로
 * 쓰기 선택은 전부 카드가 소유한다. 회차가 바뀌면 key로 카드를 새로
 * 마운트해 이전 회차의 선택 상태가 새지 않게 한다.
 */
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { ChevronDown, Sparkles } from "lucide-react";
import { Suspense, useState } from "react";

import { episodeStageHandoffSource } from "./episode-stage-handoff-source";
import type { EpisodeStageId } from "./production-project-surfaces";
import { StageHandoffCard } from "./StageHandoffCard";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const StudioOsmuIpExpansionPanel = lazyRetry(
  () =>
    import("../osmu-ip-expansion/StudioOsmuIpExpansionPanel").then((module) => ({
      default: module.StudioOsmuIpExpansionPanel,
    })),
  "StudioOsmuIpExpansionPanel",
);

export interface EpisodeStageHandoffSectionProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
  readonly targetStage: EpisodeStageId;
}

export function EpisodeStageHandoffSection({
  aggregate,
  episodeId,
  targetStage,
}: EpisodeStageHandoffSectionProps) {
  const bt = useBilingual("EpisodeStageHandoffSection");
  const [osmuPanelOpen, setOsmuPanelOpen] = useState(false);
  const source = episodeStageHandoffSource(aggregate, episodeId);
  return (
    <div className="space-y-3">
      <StageHandoffCard
        key={`${episodeId}:${targetStage}`}
        plan={source.plan}
        scenePlans={source.scenePlans}
        targetStage={targetStage}
        status="ready"
        projectId={aggregate.projectId}
      />
      <details
        data-testid="studio-osmu-ip-expansion-disclosure"
        className="group/osmu-ip rounded-2xl border border-line bg-panel"
        aria-label={bt(
          "OSMU IP 확장: 웹소설 양방향 각색 · 웹드라마/OTT 피칭 · 애니메이션 24fps X-Sheet",
          "OSMU IP Expansion: Webnovel Adaptation · Drama/OTT Pitch · 24fps Animation X-Sheet",
        )}
        onToggle={(event) => setOsmuPanelOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2.5">
            <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 [word-break:keep-all]">
              {bt(
                "OSMU IP 확장: 웹소설 양방향 각색 · 웹드라마/OTT 피칭 · 애니메이션 24fps X-Sheet",
                "OSMU IP Expansion: Webnovel Adaptation · Drama/OTT Pitch · 24fps Animation X-Sheet",
              )}
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-fg-3 transition-transform group-open/osmu-ip:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        {osmuPanelOpen ? (
          <div className="border-t border-line p-3 sm:p-4">
            <Suspense
              fallback={
                <div role="status" className="rounded-xl border border-line bg-card p-4 text-xs text-fg-2">
                  {bt(
                    "OSMU IP 확장 파이프라인 관제실을 불러오는 중입니다.",
                    "Loading OSMU IP Expansion pipeline panel.",
                  )}
                </div>
              }
            >
              <StudioOsmuIpExpansionPanel
                projectId={aggregate.projectId}
                episodeTitle={source.plan?.title}
              />
            </Suspense>
          </div>
        ) : null}
      </details>
    </div>
  );
}
