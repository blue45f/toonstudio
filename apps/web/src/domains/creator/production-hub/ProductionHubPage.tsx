import "../studio-shell/creator-workflow-surfaces.css";
import { RefreshCw } from "lucide-react";
import { Suspense } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { ProductionProjectHeader } from "./ProductionProjectHeader";
import { ProductionProjectNav } from "./ProductionProjectNav";
import { ProductionPlanningGuide } from "./ProductionPlanningGuide";
import { ProductionSampleJourneyGuide } from "./ProductionSampleJourneyGuide";
import { ProductionSessionStatus } from "./ProductionSessionStatus";
import { ProductionSurfaceHeader } from "./ProductionSurfaceHeader";
import { productionDemoAdapter } from "./production-demo-adapter";
import type { ProductionProjectSurface } from "./production-project-surfaces";
import { usePreferredRoleLens } from "./use-preferred-role-lens";
import { useProductionProjectSession } from "./use-production-project-session";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { LAYOUT_TOKENS } from "@/shared/components/layout/layout-tokens";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { SitePageArt } from "@/domains/legal/public/site-page-art";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { ProductionProjectLoading } from "./ProductionProjectLoading";
import type { ProductionSurfaceProps as SurfaceProps } from "./production-surface-props";

export type { ProductionProjectSurface } from "./production-project-surfaces";

const OverviewSurface = lazyRetry(() => import("./ProductionOverviewSurface").then((module) => ({ default: module.ProductionOverviewSurface })), "ProductionOverviewSurface");
const BoardSurface = lazyRetry(() => import("./ProductionBoardSurface").then((module) => ({ default: module.ProductionBoardSurface })), "ProductionBoardSurface");
const ProductionPlanningSurface = lazyRetry(() => import("./ProductionPlanningSurface").then((module) => ({ default: module.ProductionPlanningSurface })), "ProductionPlanningSurface");
const ProductionEpisodeOperationsWorkspace = lazyRetry(() => import("./ProductionEpisodeOperationsWorkspace").then((module) => ({ default: module.ProductionEpisodeOperationsWorkspace })), "ProductionEpisodeOperationsWorkspace");
const ProductionManuscriptWorkspace = lazyRetry(() => import("./ProductionManuscriptWorkspace").then((module) => ({ default: module.ProductionManuscriptWorkspace })), "ProductionManuscriptWorkspace");
const ProductionScheduleWorkspace = lazyRetry(() => import("./ProductionScheduleWorkspace").then((module) => ({ default: module.ProductionScheduleWorkspace })), "ProductionScheduleWorkspace");
const ProductionOperationsControlWorkspace = lazyRetry(() => import("./ProductionOperationsControlWorkspace").then((module) => ({ default: module.ProductionOperationsControlWorkspace })), "ProductionOperationsControlWorkspace");
const ProductionHandoffSurface = lazyRetry(() => import("./ProductionHandoffSurface").then((module) => ({ default: module.ProductionHandoffSurface })), "ProductionHandoffSurface");
const ProductionReviewSurface = lazyRetry(() => import("./ProductionReviewSurface").then((module) => ({ default: module.ProductionReviewSurface })), "ProductionReviewSurface");
const ProductionActivityWorkspace = lazyRetry(() => import("./ProductionActivityWorkspace").then((module) => ({ default: module.ProductionActivityWorkspace })), "ProductionActivityWorkspace");
const ProductionProcurementSurface = lazyRetry(() => import("./ProductionCommercialSurfaces").then((module) => ({ default: module.ProductionProcurementSurface })), "ProductionProcurementSurface");
const ProductionRightsSurface = lazyRetry(() => import("./ProductionCommercialSurfaces").then((module) => ({ default: module.ProductionRightsSurface })), "ProductionRightsSurface");
const ProductionTeamSurface = lazyRetry(() => import("./ProductionTeamSurface").then((module) => ({ default: module.ProductionTeamSurface })), "ProductionTeamSurface");
const ProductionOverviewCoverStage = lazyRetry(() => import("./ProductionOverviewCoverStage").then((module) => ({ default: module.ProductionOverviewCoverStage })), "ProductionOverviewCoverStage");
const EpisodeRoomPage = lazyRetry(() => import("./ProductionEpisodeRoomPage").then((module) => ({ default: module.ProductionEpisodeRoomPage })), "ProductionEpisodeRoomPage");

export function ProductionEpisodeRoomPage() {
  return <Suspense fallback={<ProductionProjectLoading />}><EpisodeRoomPage /></Suspense>;
}

function viewerAssignmentIdsFor(aggregate: ProductionProjectAggregate, userId: string | null): readonly string[] {
  if (!userId) return [];
  const partyIds = new Set(aggregate.parties.filter((party) => party.accountUserId === userId).map((party) => party.id));
  return aggregate.assignments.filter((assignment) => partyIds.has(assignment.partyId)).map((assignment) => assignment.id);
}

function SurfaceContent({ surface, ...props }: SurfaceProps & { readonly surface: ProductionProjectSurface }) {
  const { aggregate, access, execute, executeStrict, roleLens, isDemo } = props;
  switch (surface) {
    case "overview": return <OverviewSurface {...props} />;
    case "planning": return <ProductionPlanningSurface aggregate={aggregate} execute={execute} canEdit={access.edit} />;
    case "episodes": return <ProductionEpisodeOperationsWorkspace aggregate={aggregate} execute={execute} canEdit={access.edit} />;
    case "manuscripts": return <ProductionManuscriptWorkspace aggregate={aggregate} canEdit={access.edit} isDemo={isDemo} execute={execute} />;
    case "production": return <BoardSurface {...props} />;
    case "schedule": return <ProductionScheduleWorkspace aggregate={aggregate} execute={execute} canEdit={access.edit} />;
    case "control": return <ProductionOperationsControlWorkspace aggregate={aggregate} execute={executeStrict} canEdit={access.edit} canManage={access.manage} />;
    case "handoff": return <ProductionHandoffSurface aggregate={aggregate} roleLens={roleLens} execute={executeStrict} canEdit={access.edit} isDemo={isDemo} />;
    case "review": return <ProductionReviewSurface aggregate={aggregate} execute={executeStrict} canEdit={access.edit} canReview={access.comment || access.edit} canManage={access.manage} refresh={props.refresh} roleLens={roleLens} isDemo={isDemo} />;
    case "activity": return <ProductionActivityWorkspace aggregate={aggregate} viewerUserId={props.viewerUserId} viewerAssignmentIds={props.viewerAssignmentIds} versionActivityEnabled={!isDemo} />;
    case "procurement": return <ProductionProcurementSurface aggregate={aggregate} />;
    case "rights": return <ProductionRightsSurface aggregate={aggregate} />;
    case "settings": return <ProductionTeamSurface aggregate={aggregate} access={access} execute={execute} executeStrict={executeStrict}
      refresh={props.refresh} hasUnconfirmedCommand={props.hasUnconfirmedCommand} isDemo={isDemo} />;
  }
}

function ProjectError({ message, refreshing, onRefresh }: { readonly message: string; readonly refreshing: boolean; readonly onRefresh: () => void }) {
  const bt = useBilingual("ProductionProjectPage");
  return (
    <div data-route-error="production-project" className="min-h-dvh bg-canvas p-6 text-fg">
      <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-bad/30 bg-bad/10 p-6">
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <div>
            <h1 className="font-bold">{bt("프로젝트를 열 수 없습니다", "Can't open this project")}</h1>
            <p className="mt-2 text-sm text-fg-2">{message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={refreshing} onClick={onRefresh} className={buttonClass({ variant: "outline", className: "min-h-11 gap-1.5" })}>
                <RefreshCw className="size-4" aria-hidden="true" />
                {bt("다시 불러오기", "Retry")}
              </button>
              <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to="/production">{bt("제작 관리 홈", "Production home")}</Link>
              <Link className={buttonClass({ variant: "ghost", className: "min-h-11" })} to="/production/projects/sample-project/overview">{bt("샘플 프로젝트 보기", "Open the sample project")}</Link>
            </div>
          </div>
          <SitePageArt
            kind="recovery"
            caption={bt("브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다", "Brand concept art · not an editor capture")}
          />
        </div>
      </div>
    </div>
  );
}

export function ProductionProjectPage({ surface }: { readonly surface: ProductionProjectSurface }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const actorId = useApp((state) => state.userId);
  const { ready: authReady } = useSession();
  const project = useProductionProjectSession(projectId, actorId, productionDemoAdapter, { authReady });
  const [roleLens, setRoleLens] = usePreferredRoleLens("producer");
  const bt = useBilingual("ProductionProjectPage");

  if (!projectId) return <Navigate to="/production" replace />;
  if (project.loading) return <ProductionProjectLoading />;
  if (project.error || !project.aggregate) {
    return (
      <ProjectError
        message={project.error ?? bt("프로젝트 데이터가 없습니다.", "No project data.")}
        refreshing={project.refreshing}
        onRefresh={() => void project.refresh()}
      />
    );
  }

  const aggregate = project.aggregate;
  return (
    <div data-creator-workflow="production-project" data-route-ready="production-project" className="min-h-dvh bg-canvas text-fg">
      <ProductionProjectHeader aggregate={aggregate} access={project.access} roleLens={roleLens} onRoleLensChange={setRoleLens} saveState={project.saveState} isDemo={project.isDemo} />
      <div className={cn("mx-auto grid lg:grid-cols-[13.5rem_minmax(0,1fr)]", LAYOUT_TOKENS.width.app)}>
        <ProductionProjectNav projectId={aggregate.projectId} surface={surface} />
        <div className="min-w-0 p-4 sm:p-6">
          {!project.isDemo ? <ProductionSessionStatus revision={aggregate.revision} refreshing={project.refreshing} saving={project.saveState === "saving"} onRefresh={project.refresh} /> : null}
          {project.notice ? (
            <div className={cn("mb-4 rounded-xl border px-3 py-2 text-xs", project.saveState === "error" ? "border-bad/30 bg-bad/10 text-fg" : "border-good/30 bg-good/10 text-fg")} role="status">
              {project.notice}
            </div>
          ) : null}
          {surface === "overview" && aggregate.coverImageUrl ? (
            <div className="mb-4">
              <Suspense fallback={<ProductionProjectLoading />}><ProductionOverviewCoverStage aggregate={aggregate} /></Suspense>
            </div>
          ) : null}
          {project.isDemo ? <ProductionSampleJourneyGuide location={surface} /> : null}
          <ProductionSurfaceHeader aggregate={aggregate} surface={surface} />
          <Suspense fallback={<ProductionProjectLoading />}>
          <SurfaceContent
            surface={surface}
            aggregate={aggregate}
            access={project.access}
            roleLens={roleLens}
            execute={project.execute}
            executeStrict={project.executeStrict}
            refresh={project.refresh}
            hasUnconfirmedCommand={project.hasUnconfirmedCommand}
            isDemo={project.isDemo}
            viewerAssignmentIds={viewerAssignmentIdsFor(aggregate, actorId)}
            viewerUserId={actorId}
          />
          </Suspense>
          <ProductionPlanningGuide projectId={aggregate.projectId} />
        </div>
      </div>
    </div>
  );
}
