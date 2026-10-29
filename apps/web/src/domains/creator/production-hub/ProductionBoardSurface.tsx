import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { ProductionProjectLoading } from "./ProductionProjectLoading";
import type { ProductionSurfaceProps as SurfaceProps } from "./production-surface-props";
import { ProductionTaskOutputRefreshContext } from "./production-task-output-refresh-context";

const EpisodeStageHandoffSection = lazyRetry(() => import("./EpisodeStageHandoffSection").then((module) => ({ default: module.EpisodeStageHandoffSection })), "EpisodeStageHandoffSection");
const ProductionRoleWorkspace = lazyRetry(() => import("./ProductionRoleWorkspace").then((module) => ({ default: module.ProductionRoleWorkspace })), "ProductionRoleWorkspace");
const ProductionWorkBoard = lazyRetry(() => import("./ProductionWorkBoard").then((module) => ({ default: module.ProductionWorkBoard })), "ProductionWorkBoard");

export function ProductionBoardSurface({ aggregate, access, roleLens, executeStrict, refresh, isDemo, viewerAssignmentIds }: SurfaceProps) {
  const bt = useBilingual("ProductionBoardSurface");
  const [params, setParams] = useSearchParams();
  // 단계 인계: 인계 화면의 "다음 공정 열기" 딥링크(boardEpisode)가 실은 진입에서는
  // 콘티 시작 화면 상단에 앞 단계(기획) 산출을 자동 인용한다. 회차 맥락이 없는
  // 일반 보드 진입에서는 마운트하지 않는다(지어낸 회차 인용 방지).
  const boardEpisodeId = params.get("boardEpisode");
  const boardEpisode = boardEpisodeId
    ? aggregate.episodes.find((episode) => episode.episodeId === boardEpisodeId) ?? null
    : null;
  const roleView = params.get("productionView") === "roles" || (params.has("task") && params.get("productionView") !== "board");
  const views = [
    { id: "board", label: bt("팀 공정 보드", "Team board"), active: !roleView },
    { id: "roles", label: bt("역할별 작업", "Role workspace"), active: roleView },
  ] as const;
  return (
    <ProductionTaskOutputRefreshContext.Provider value={refresh ?? null}><div className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={bt("제작 작업 공간 선택", "Choose a workspace")}>
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-pressed={view.active}
            className={buttonClass({ variant: view.active ? "solid" : "outline", className: "min-h-11" })}
            onClick={() => setParams((previous) => {
              const next = new URLSearchParams(previous);
              next.set("productionView", view.id);
              return next;
            })}
          >
            {view.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<ProductionProjectLoading />}>
      {boardEpisode ? (
        <EpisodeStageHandoffSection aggregate={aggregate} episodeId={boardEpisode.episodeId} targetStage="storyboard" />
      ) : null}
      {roleView
        ? <ProductionRoleWorkspace key={aggregate.projectId} aggregate={aggregate} execute={executeStrict} canEdit={access.edit} roleLens={roleLens} />
        : (
          <ProductionWorkBoard
            key={aggregate.projectId}
            aggregate={aggregate}
            execute={executeStrict}
            canEdit={access.edit}
            canManage={access.manage}
            viewerAssignmentIds={viewerAssignmentIds}
            roleLens={roleLens}
            persistOrder={!isDemo}
          />
        )}
      </Suspense>
    </div></ProductionTaskOutputRefreshContext.Provider>
  );
}
