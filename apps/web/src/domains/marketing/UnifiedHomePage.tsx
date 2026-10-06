import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { CreatorHomePage } from "@/domains/creator-resources/CreatorHomePage";
import { RouteSilhouetteSkeleton } from "@/shared/components/route-silhouette";

/**
 * One front door for ToonStudio.
 * "/"는 로그인 여부와 무관하게 항상 사이트 홈이다. 개인 작업 공간은 별도
 * 목적지인 /home(내 홈)이 소유하고, 로그인 사용자에게는 페이지를 교체하지
 * 않고 홈 안의 개인 스트립으로만 이어 준다. (이전에는 로그인 상태면 "/"가
 * /home으로 강제 이동해 사이트 홈을 볼 방법이 없었다.)
 */
export function UnifiedHomePage() {
  const { ready } = useSession();

  if (!ready) {
    // 세션 확인 게이트도 라우트 폴백과 같은 사이트 홈 실루엣을 쓴다 — 폴백(청크)
    // → 게이트(세션) → 본문으로 이어질 때 로딩 화면이 바뀌지 않아야 한다.
    // 공용 규격: shared/components/route-silhouette.tsx.
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
        <RouteSilhouetteSkeleton family="site-home" label="창작 공간을 준비하고 있습니다." />
      </div>
    );
  }

  return <CreatorHomePage />;
}

export default UnifiedHomePage;
