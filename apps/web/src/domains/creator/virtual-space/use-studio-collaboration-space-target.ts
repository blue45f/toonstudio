import { generatePath, useParams } from "react-router-dom";
import { useStudioLiveCollaboration } from "../live/studio-live-collaboration-context";
import { activeProjectIdFromLocation } from "../studio-shell/active-project-context";
import { studioRoutePath } from "../studio-route-registry";

export function useStudioCollaborationSpaceTarget() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { room } = useStudioLiveCollaboration();
  const locationProject = typeof window === "undefined" ? null : activeProjectIdFromLocation(window.location.pathname, window.location.search);
  const current = routeProjectId || locationProject || room?.workId;
  const projectId = current && current.length <= 160 && ![".", ".."].includes(current) && !current.includes("\\") ? current : undefined;
  const spacePath = projectId ? generatePath(studioRoutePath("project-space"), { projectId }) : studioRoutePath("personal-space");
  return { projectId, spacePath, live: Boolean(room && room.workId === projectId) };
}
