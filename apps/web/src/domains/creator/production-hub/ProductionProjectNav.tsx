import { ArrowRight, ArrowUpRight, ChevronDown, Settings2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  PRODUCTION_NAV_MODEL,
  productionNavGroupIdForSurface,
  productionNavInitialOpenGroup,
  productionSurfacePath,
  type EpisodeStageDefinition,
  type EpisodeStageId,
  type ProductionNavGroupId,
  type ProductionProjectSurface,
  type ProductionSurfaceDefinition,
  type ProductionSurfaceTarget,
} from "./production-project-surfaces";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const LINK_BASE_CLASS =
  "group flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none";

const SUMMARY_CLASS =
  "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-sm font-bold text-fg-2 outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden";

function SurfaceLink({
  projectId,
  definition,
  active,
  compact,
}: {
  readonly projectId: string;
  readonly definition: ProductionSurfaceDefinition;
  readonly active: boolean;
  readonly compact: boolean;
}) {
  const bt = useBilingual("ProductionProjectNav");
  const Icon = definition.icon;
  const label = bt(definition.label.ko, definition.label.en);
  const description = bt(definition.description.ko, definition.description.en);
  return (
    <Link
      to={productionSurfacePath(projectId, definition.id)}
      aria-current={active ? "page" : undefined}
      title={`${label} · ${description}`}
      className={cn(
        LINK_BASE_CLASS,
        !compact && "lg:min-h-[3.5rem]",
        active
          ? "bg-accent-soft text-accent shadow-[inset_3px_0_0_var(--color-accent)]"
          : "text-fg-2 hover:bg-raised hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block whitespace-nowrap">{label}</span>
        {!compact ? (
          <span className="mt-0.5 hidden max-w-[11rem] truncate text-[0.6875rem] font-normal text-fg-3 lg:block">{description}</span>
        ) : (
          // 그룹 안 항목은 접혀 있던 표면을 이름만으로 골라야 하는 자리라, 한 줄 설명을
          // 함께 보여 줘야 "어느 표면이 내 일인가"를 펼친 자리에서 판단할 수 있다.
          <span className="mt-0.5 line-clamp-2 text-[0.6875rem] font-normal leading-4 text-fg-3">{description}</span>
        )}
      </span>
    </Link>
  );
}

/**
 * 단계 주 행동 링크가 가리킬 경로. 진행 레일·다음 할 일 모델의 해석기와 같은 규칙이다 —
 * surface는 프로젝트 화면 경로, path는 그대로, episode-room은 회차 id를 모르는 내비에서
 * 회차 표면 경로로 폴백한다.
 */
function stageActionHref(projectId: string, target: ProductionSurfaceTarget): string {
  switch (target.kind) {
    case "surface":
      return productionSurfacePath(projectId, target.surface, target.query);
    case "path":
      return target.path;
    case "episode-room":
      return productionSurfacePath(projectId, "episodes");
  }
}

/**
 * 전용 화면이 없는 단계(식자·연출, 게시)가 그룹을 비워 두지 않도록, 그 단계의 첫 행동으로
 * 이어지는 링크를 둔다. 단계 정의의 primaryAction이 라벨과 목적지의 정본이다.
 */
function StagePrimaryActionLink({
  projectId,
  stage,
}: {
  readonly projectId: string;
  readonly stage: EpisodeStageDefinition;
}) {
  const bt = useBilingual("ProductionProjectNav");
  const { label, target } = stage.primaryAction;
  const leavesProject = target.kind === "path";
  const Icon = leavesProject ? ArrowUpRight : ArrowRight;
  return (
    <Link
      to={stageActionHref(projectId, target)}
      className={cn(LINK_BASE_CLASS, "text-fg-2 hover:bg-raised hover:text-fg")}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block">{bt(label.ko, label.en)}</span>
        <span className="mt-0.5 line-clamp-2 text-[0.6875rem] font-normal leading-4 text-fg-3">
          {leavesProject
            ? bt("이 단계는 제작 허브 밖 화면에서 이어져요", "This stage continues outside the production hub")
            : bt("이 단계는 전용 화면 없이 관련 화면에서 이어져요", "This stage continues in a related screen")}
        </span>
      </span>
    </Link>
  );
}

/**
 * 펼침 그룹 하나. `<details>` 자체가 group 역할을 가지므로 이름은 aria-label로 준다
 * (summary는 펼침 버튼 이름을 맡는다). 현재 단계 그룹에는 "지금 단계" 표시를 붙인다.
 */
function NavGroup({
  label,
  marker,
  current,
  open,
  onOpenChange,
  children,
}: {
  readonly label: string;
  readonly marker: string | null;
  readonly current: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  const bt = useBilingual("ProductionProjectNav");
  return (
    <details
      aria-label={label}
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="group/stage rounded-xl"
    >
      <summary className={SUMMARY_CLASS}>
        <span className="flex min-w-0 items-center gap-2">
          {marker !== null ? (
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-[0.6875rem] font-black text-fg-2">{marker}</span>
          ) : (
            <Settings2 className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{label}</span>
          {current ? (
            <span className="shrink-0 rounded-full border border-line bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-bold text-accent">
              {bt("지금 단계", "Current")}
            </span>
          ) : null}
        </span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open/stage:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="space-y-1 px-1 pb-2 pt-1">{children}</div>
    </details>
  );
}

/**
 * 프로젝트 메뉴. 개요는 그룹 밖 최상단에 고정하고, 나머지 화면은 제작 흐름(기획→콘티→작화→
 * 식자·연출→검수→게시→운영) 일곱 단계 그룹과 아래 "관리" 그룹에 나눠 담는다. 전용 화면이 없는
 * 단계는 그 단계의 첫 행동 링크를 둔다. 그룹 구성은 `PRODUCTION_NAV_MODEL`이 정본이다.
 *
 * 시작 상태에서는 그룹 하나만 펼친다 — 지금 단계(`currentStageId`)가 있으면 그 단계, 없으면 현재
 * 화면이 속한 그룹, 그것도 없으면 기획(`productionNavInitialOpenGroup`). 기획 문서가 비어 있어
 * 지금 단계를 모르는 프로젝트의 개요도 기획 그룹이 먼저 열려 첫 단계에 닿는다. 현재 화면이 속한
 * 그룹은 항상 펼친 채로 보인다. 펼침 상태는 사용자가 직접 바꿀 수 있다.
 */
export function ProductionProjectNav({
  projectId,
  surface,
  currentStageId,
}: {
  readonly projectId: string;
  readonly surface: ProductionProjectSurface | null;
  /** 이 프로젝트가 지금 만들고 있는 회차의 단계. 모르면 생략한다. */
  readonly currentStageId?: EpisodeStageId | null;
}) {
  const bt = useBilingual("ProductionProjectNav");
  const activeGroup = surface ? productionNavGroupIdForSurface(surface) : null;
  const [openGroups, setOpenGroups] = useState<ReadonlySet<ProductionNavGroupId>>(
    () => new Set<ProductionNavGroupId>([productionNavInitialOpenGroup(currentStageId, surface)]),
  );
  const isOpen = (id: ProductionNavGroupId): boolean => openGroups.has(id) || id === activeGroup;
  const setGroupOpen = (id: ProductionNavGroupId, open: boolean): void => {
    setOpenGroups((previous) => {
      if (previous.has(id) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const { overview, stageGroups, managementLabel, managementSurfaces } = PRODUCTION_NAV_MODEL;
  return (
    <nav
      aria-label={bt("프로젝트 메뉴", "Project menu")}
      className="creator-workflow-nav border-b border-line bg-panel lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r"
    >
      <div className="p-2 lg:p-3">
        <SurfaceLink projectId={projectId} definition={overview} active={surface === overview.id} compact={false} />
      </div>
      <p className="hidden px-5 pt-1 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-fg-3 lg:block">
        {bt("제작 단계", "Stages")}
      </p>
      <div className="space-y-1 px-2 pb-2 pt-1 lg:px-3">
        {stageGroups.map((group, index) => (
          <NavGroup
            key={group.id}
            label={bt(group.stage.label.ko, group.stage.label.en)}
            marker={String(index + 1)}
            current={currentStageId === group.id}
            open={isOpen(group.id)}
            onOpenChange={(open) => setGroupOpen(group.id, open)}
          >
            {group.surfaces.length > 0
              ? group.surfaces.map((definition) => (
                  <SurfaceLink
                    key={definition.id}
                    projectId={projectId}
                    definition={definition}
                    active={surface === definition.id}
                    compact
                  />
                ))
              : <StagePrimaryActionLink projectId={projectId} stage={group.stage} />}
          </NavGroup>
        ))}
      </div>
      <div className="border-t border-line px-2 pb-2 pt-1 lg:px-3">
        <NavGroup
          label={bt(managementLabel.ko, managementLabel.en)}
          marker={null}
          current={false}
          open={isOpen("management")}
          onOpenChange={(open) => setGroupOpen("management", open)}
        >
          {managementSurfaces.map((definition) => (
            <SurfaceLink
              key={definition.id}
              projectId={projectId}
              definition={definition}
              active={surface === definition.id}
              compact
            />
          ))}
        </NavGroup>
      </div>
    </nav>
  );
}
