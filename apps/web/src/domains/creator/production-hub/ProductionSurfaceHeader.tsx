import { ArrowRight, ChevronDown, FileCheck2 } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { productionPlanningIsEmpty, resolveProductionSurfaceTarget } from "./production-project-dashboard-model";
import { productionSurfaceDefinition, productionSurfacePath, type ProductionProjectSurface } from "./production-project-surfaces";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const StudioPublishingPreflightPanel = lazyRetry(
  () =>
    import("../publishing-preflight-pro/StudioPublishingPreflightPanel").then((module) => ({
      default: module.StudioPublishingPreflightPanel,
    })),
  "StudioPublishingPreflightPanel",
);

/**
 * 각 화면 맨 위: 무엇을 하는 화면인지 한 줄로 설명하고, 이어서 할 행동 하나를 제시한다.
 * 표지가 있는 프로젝트에서는 개요 무대(ProductionOverviewCoverStage)와 같은 문법 —
 * 흐린 표지 배경 + 그라디언트 스크림 — 으로 장면 헤더가 되어, 표면의 정체성이
 * 작품의 아트에 종속된다. 표지가 없으면 기존 카드 띠 그대로 폴백한다.
 * 개요 표면은 바로 위에 전용 표지 무대가 서므로 이중으로 깔지 않는다.
 */
export function ProductionSurfaceHeader({
  aggregate,
  surface,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly surface: ProductionProjectSurface;
}) {
  const bt = useBilingual("ProductionSurfaceHeader");
  const [preflightOpen, setPreflightOpen] = useState(false);
  const definition = useMemo(() => productionSurfaceDefinition(surface), [surface]);
  const Icon = definition.icon;
  // 개요의 다음 행동은 평소 공정 보드지만, 기획 문서가 비어 있으면 기획이 먼저다.
  // 개요 대시보드의 "지금 할 일"과 같은 규칙(productionPlanningIsEmpty)을 써서
  // 두 CTA가 서로 다른 곳을 가리키는 일이 없게 한다.
  const overviewPlanningFirst = surface === "overview" && productionPlanningIsEmpty(aggregate);
  const nextLabel = overviewPlanningFirst
    ? { ko: "기획부터 시작하기", en: "Start with planning" }
    : definition.next.label;
  const nextHref = useMemo(
    () => (overviewPlanningFirst
      ? productionSurfacePath(aggregate.projectId, "planning")
      : resolveProductionSurfaceTarget(aggregate, definition.next.target, new Date())),
    [aggregate, definition.next.target, overviewPlanningFirst],
  );
  const coverImageUrl = aggregate.coverImageUrl ?? null;
  const scene = coverImageUrl !== null && surface !== "overview";
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={
            scene
              ? "grid size-10 shrink-0 place-items-center rounded-xl border border-accent/40 bg-panel/60 text-accent backdrop-blur-sm"
              : "grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent"
          }
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{bt(definition.label.ko, definition.label.en)}</h2>
          <p className="text-xs leading-5 text-fg-2">{bt(definition.description.ko, definition.description.en)}</p>
        </div>
      </div>
      <Link className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })} to={nextHref}>
        <span className="sr-only">{bt("다음 단계:", "Next step:")} </span>
        {bt(nextLabel.ko, nextLabel.en)}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </>
  );
  const preflightDisclosure = (
    <details
      data-testid="studio-publishing-preflight-disclosure"
      className="group rounded-2xl border border-line bg-card/80 shadow-sm"
      onToggle={(event) => setPreflightOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <FileCheck2 className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate">
            {bt(
              "6대 플랫폼 납품 프리플라이트 · 멀티포맷 리플로우 · 독자 이탈/크래시/외주 검증",
              "6-platform publishing preflight, multi-format reflow, reader/OOM/outsource guard",
            )}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      {preflightOpen ? (
        <div className="border-t border-line p-3">
          <Suspense fallback={<p className="px-2 py-3 text-xs text-fg-2">{bt("출판 프리플라이트 스위트를 불러오는 중입니다…", "Loading publishing preflight suite…")}</p>}>
            <StudioPublishingPreflightPanel
              projectId={aggregate.projectId}
              seriesTitle={aggregate.title}
              episodeNumber={Math.max(1, aggregate.episodes.length)}
            />
          </Suspense>
        </div>
      ) : null}
    </details>
  );
  if (!scene) {
    return (
      <div className="mb-4 space-y-2">
        <header
          data-production-surface-header={surface}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/80 px-4 py-3 shadow-sm"
        >
          {content}
        </header>
        {preflightDisclosure}
      </div>
    );
  }
  return (
    <div className="mb-4 space-y-2">
      <header
        data-production-surface-header={surface}
        data-production-surface-header-scene="cover"
        className="relative overflow-hidden rounded-2xl border border-line bg-panel shadow-sm"
      >
        <img
          src={coverImageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/70 to-panel/20" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 py-4">{content}</div>
      </header>
      {preflightDisclosure}
    </div>
  );
}
