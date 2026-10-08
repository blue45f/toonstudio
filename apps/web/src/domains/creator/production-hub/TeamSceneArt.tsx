import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 사람·권한 화면과 사용량 화면 첫 화면이 공유하는 장면 아트 띠. 제작 워크스페이스
 *  전용으로 만들어 둔 기존 자산(creator-workspace.webp — 원고 책상과 떠 있는
 *  컷·말풍선 장면)을 재사용한다. 왼쪽 어두운 여백은 원본의 텍스트 자리라 초점은
 *  오른쪽 장면(object-position)으로 잡는다. 사용량 전용 화면 신설 때 이 띠가
 *  빠져 비주얼 근거가 사라진 것을 복원하며 두 화면이 한 컴포넌트를 공유한다. */
export function TeamSceneArt() {
  const bt = useBilingual("TeamWorkspacePage");
  return <div data-testid="team-scene-art" className="relative overflow-hidden rounded-3xl border border-line">
    <img src="/assets/production-workspace/creator-workspace.webp" alt="" loading="lazy" decoding="async" className="h-44 w-full object-cover object-[72%_50%] sm:h-56" />
    <p className="absolute bottom-3 left-3 rounded-full bg-canvas/70 px-3 py-1 text-xs font-semibold text-fg backdrop-blur-sm">{bt("함께 만드는 작업실", "A studio you build together")}</p>
  </div>;
}
