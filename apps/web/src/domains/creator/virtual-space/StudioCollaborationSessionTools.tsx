import { lazy, Suspense } from "react";
import { studioRoutePath } from "../studio-route-registry";
import type { useStudioCollaborationSpaceTarget } from "./use-studio-collaboration-space-target";

const LivePanel = lazy(() => import("../live/StudioLiveCollaborationPanel")
  .then((module) => ({ default: module.StudioLiveCollaborationPanel })));

export function StudioCollaborationSessionTools({ target, board }: {
  readonly target: ReturnType<typeof useStudioCollaborationSpaceTarget>;
  readonly board: boolean;
}) {
  const { projectId, spacePath, live } = target;
  const linkClass = "inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm";
  return <section className="space-y-3 rounded-lg border border-line bg-panel p-3">
    <h4 className="text-sm font-semibold">{board ? "공동 화이트보드" : "참여자와 화면 공유"}</h4>
    {!board && projectId && live ? <Suspense fallback={<p role="status">협업 세션을 여는 중…</p>}>
      <LivePanel workId={projectId} />
    </Suspense> : <p className="text-sm text-fg-2">{!projectId
      ? "팀원과 함께 작업하려면 프로젝트를 여세요."
      : board ? "협업 공간의 같은 보드에 그림과 메모를 남깁니다." : "현재 이 편집기에 연결된 협업 세션이 없습니다."}</p>}
    <a className={linkClass} target="_blank" rel="noopener noreferrer"
      href={projectId ? spacePath + (board ? "?activity=board" : "?activity=people") : studioRoutePath("home")}>
      {projectId ? (board ? "프로젝트 화이트보드 열기" : "공간 참여자 보기") : "프로젝트 열기"}
    </a>
  </section>;
}
