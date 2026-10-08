import { Navigate, useLocation, useParams } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";
import {
  ProductionEpisodeRoomPage,
  ProductionExternalReviewPage,
  StudioPinnedReviewSharePage,
  ProductionLandingPage,
  ProductionProjectPage,
  OrganizationHomePage,
  TeamPeoplePage,
  TeamWorkspaceJoinPage,
  TeamWorkspaceUsagePage,
  VersionSharePage,
} from "./production-route-pages";

/**
 * 옛 /production/workspaces 주소를 정식 /team/people 주소로 넘기는 호환 리다이렉트.
 * 두 패밀리는 원래도 같은 TeamWorkspacePage를 렌더했고(TeamPeoplePage가 그대로 감싼다)
 * 내부 링크·초대 링크도 전부 /team/people 기준으로 생성돼 왔으므로 본문 소실은 없다.
 * 쿼리·해시는 그대로 유지해 초대 토큰(?token=·#invite=) 같은 기존 공유 링크의
 * 의미가 끊기지 않게 한다. (O-03 일원화, 2026-10-08)
 */
function TeamPeopleRedirect({ to }: { readonly to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

function TeamPeopleWorkspaceRedirect({ suffix = "" }: { readonly suffix?: string }) {
  const { workspaceId } = useParams();
  return <TeamPeopleRedirect to={`/team/people/${encodeURIComponent(workspaceId ?? "")}${suffix}`} />;
}

export const productionRoutes = defineAppRoutes([
  { id: "team-people", path: "/team/people", element: <TeamPeoplePage /> },
  { id: "team-organization", path: "/team/organization", element: <OrganizationHomePage /> },
  { id: "team-people-join", path: "/team/people/join", element: <TeamWorkspaceJoinPage /> },
  { id: "team-people-detail", path: "/team/people/:workspaceId", element: <TeamPeoplePage /> },
  { id: "team-people-usage", path: "/team/people/:workspaceId/usage", element: <TeamWorkspaceUsagePage /> },
  { id: "production-workspaces", path: "/production/workspaces", element: <TeamPeopleRedirect to="/team/people" /> },
  { id: "production-workspace-join", path: "/production/workspaces/join", element: <TeamPeopleRedirect to="/team/people/join" /> },
  { id: "production-workspace-detail", path: "/production/workspaces/:workspaceId", element: <TeamPeopleWorkspaceRedirect /> },
  { id: "production-workspace-usage", path: "/production/workspaces/:workspaceId/usage", element: <TeamPeopleWorkspaceRedirect suffix="/usage" /> },
  { id: "production-home", path: "/production", element: <ProductionLandingPage /> },
  { id: "production-external-review", path: "/production/review/:projectId/:reviewId", element: <ProductionExternalReviewPage /> },
  { id: "production-pinned-review", path: "/production/pinned-review", element: <StudioPinnedReviewSharePage /> },
  { id: "production-version-share", path: "/share/version/:token", element: <VersionSharePage /> },
  { id: "production-projects", path: "/production/projects", element: <ProductionLandingPage /> },
  { id: "production-project-root", path: "/production/projects/:projectId", element: <Navigate to="overview" replace /> },
  { id: "production-project-overview", path: "/production/projects/:projectId/overview", element: <ProductionProjectPage surface="overview" /> },
  { id: "production-project-planning", path: "/production/projects/:projectId/planning", element: <ProductionProjectPage surface="planning" /> },
  { id: "production-project-episodes", path: "/production/projects/:projectId/episodes", element: <ProductionProjectPage surface="episodes" /> },
  { id: "production-project-manuscripts", path: "/production/projects/:projectId/manuscripts", element: <ProductionProjectPage surface="manuscripts" /> },
  { id: "production-project-production", path: "/production/projects/:projectId/production", element: <ProductionProjectPage surface="production" /> },
  { id: "production-project-schedule", path: "/production/projects/:projectId/schedule", element: <ProductionProjectPage surface="schedule" /> },
  { id: "production-project-control", path: "/production/projects/:projectId/control", element: <ProductionProjectPage surface="control" /> },
  { id: "production-project-risks", path: "/production/projects/:projectId/risks", element: <ProductionProjectPage surface="control" /> },
  { id: "production-project-handoff", path: "/production/projects/:projectId/handoff", element: <ProductionProjectPage surface="handoff" /> },
  { id: "production-project-review", path: "/production/projects/:projectId/review", element: <ProductionProjectPage surface="review" /> },
  { id: "production-project-activity", path: "/production/projects/:projectId/activity", element: <ProductionProjectPage surface="activity" /> },
  { id: "production-project-procurement", path: "/production/projects/:projectId/procurement", element: <ProductionProjectPage surface="procurement" /> },
  { id: "production-project-rights", path: "/production/projects/:projectId/rights", element: <ProductionProjectPage surface="rights" /> },
  { id: "production-project-settings", path: "/production/projects/:projectId/settings", element: <ProductionProjectPage surface="settings" /> },
  { id: "production-episode-room", path: "/production/projects/:projectId/episodes/:episodeId", element: <ProductionEpisodeRoomPage /> },
]);
