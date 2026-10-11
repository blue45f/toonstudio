import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { resolveProductionSurfaceTarget } from "./production-project-dashboard-model";
import { productionSurfaceDefinition, type ProductionProjectSurface } from "./production-project-surfaces";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

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
  const definition = productionSurfaceDefinition(surface);
  const Icon = definition.icon;
  const nextHref = useMemo(
    () => resolveProductionSurfaceTarget(aggregate, definition.next.target, new Date()),
    [aggregate, definition.next.target],
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
          <h2 className="text-lg font-black tracking-tight text-fg">{bt(definition.label.ko, definition.label.en)}</h2>
          <p className="text-xs leading-5 text-fg-2">{bt(definition.description.ko, definition.description.en)}</p>
        </div>
      </div>
      <Link className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })} to={nextHref}>
        <span className="sr-only">{bt("다음 단계:", "Next step:")} </span>
        {bt(definition.next.label.ko, definition.next.label.en)}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </>
  );
  if (!scene) {
    return (
      <header
        data-production-surface-header={surface}
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/80 px-4 py-3 shadow-sm"
      >
        {content}
      </header>
    );
  }
  return (
    <header
      data-production-surface-header={surface}
      data-production-surface-header-scene="cover"
      className="relative mb-4 overflow-hidden rounded-2xl border border-line bg-panel shadow-sm"
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
  );
}
