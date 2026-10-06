/**
 * 라우트 진입 스켈레톤의 실루엣 변형.
 *
 * 일반 카드 그리드는 어느 페이지에서 열어도 같은 회색 화면이라 진입 첫인상이 본문과 무관했다.
 * 자주 진입하는 세 화면군(가상스튜디오·내 홈·학습)은 각 페이지의 골격(무대+패널, 히어로+최근 작품,
 * 배너+히어로)을 닮은 실루엣으로 자리를 먼저 잡는다. 데이터가 아니라 구조만 흉내 내며,
 * 실제 아트·문구는 넣지 않는다.
 */
export type RouteSilhouetteFamily = "virtual-space" | "studio-home" | "learn";

/** 경로가 속한 실루엣 화면군. 어느 군에도 속하지 않으면 null(일반 카드 스켈레톤 유지). */
export function routeSilhouetteFamily(pathname: string): RouteSilhouetteFamily | null {
  const path = pathname.replace(/\/+$/u, "") || "/";
  if (path === "/studio/space" || /^\/studio\/p\/[^/]+\/space(?:\/.*)?$/u.test(path)) {
    return "virtual-space";
  }
  if (path === "/home") return "studio-home";
  if (path === "/learn" || path.startsWith("/learn/")) return "learn";
  return null;
}

function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** 가상스튜디오 로비 실루엣: 왼쪽 월드 무대 + 오른쪽 캐릭터·입장 패널. */
function VirtualSpaceSilhouette() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="overflow-hidden rounded-3xl border border-line bg-panel p-4">
        <span className="skeleton block aspect-[16/10] w-full rounded-2xl" />
        <div className="mt-4 flex gap-2">
          <span className="skeleton h-8 w-24 rounded-full" />
          <span className="skeleton h-8 w-24 rounded-full opacity-80" />
          <span className="skeleton h-8 w-24 rounded-full opacity-60" />
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-panel p-4">
        <span className="skeleton block h-5 w-2/3" />
        <span className="skeleton mt-2 block h-3.5 w-1/2 opacity-80" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {range(6).map((index) => (
            <span key={index} className="skeleton block aspect-square w-full rounded-xl" />
          ))}
        </div>
        <span className="skeleton mt-4 block h-11 w-full rounded-xl" />
        <span className="skeleton mt-2 block h-11 w-full rounded-xl opacity-80" />
      </div>
    </div>
  );
}

/** 내 홈(작품 홈) 실루엣: 히어로 패널 + 빠른 실행 줄 + 최근 작품 표지 줄. */
function StudioHomeSilhouette() {
  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-3xl border border-line bg-panel">
        <div className="grid gap-4 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="grid content-center gap-3">
            <span className="skeleton h-6 w-44 rounded-full" />
            <span className="skeleton h-9 w-full max-w-md" />
            <span className="skeleton h-9 w-3/4 max-w-sm" />
            <span className="skeleton h-4 w-full max-w-lg opacity-80" />
            <span className="skeleton h-12 w-full max-w-lg rounded-xl" />
          </div>
          <span className="skeleton hidden min-h-56 rounded-xl md:block" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 border-t border-line p-3 sm:grid-cols-3 lg:grid-cols-5">
          {range(5).map((index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-line bg-card p-2">
              <span className="skeleton aspect-[2/1] w-full rounded-md" />
              <span className="skeleton h-3.5 w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-panel p-4">
        <span className="skeleton block h-5 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {range(4).map((index) => (
            <span key={index} className="skeleton block aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 학습 실루엣: 탭 줄 + 전폭 배너 + 좌문·우아트 히어로 패널. */
function LearnSilhouette() {
  return (
    <div>
      <div className="flex gap-2">
        {range(4).map((index) => (
          <span key={index} className="skeleton h-10 w-24 rounded-xl" />
        ))}
      </div>
      <span className="skeleton mt-4 block h-40 w-full rounded-3xl" />
      <div className="mt-4 grid overflow-hidden rounded-3xl border border-line bg-panel lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid content-center gap-3 p-6 sm:p-10">
          <span className="skeleton h-3.5 w-40" />
          <span className="skeleton h-10 w-full max-w-md" />
          <span className="skeleton h-10 w-3/4 max-w-sm" />
          <span className="skeleton h-4 w-full max-w-lg opacity-80" />
          <span className="skeleton h-4 w-2/3 max-w-md opacity-80" />
          <div className="mt-2 flex gap-2">
            <span className="skeleton h-11 w-36 rounded-xl" />
            <span className="skeleton h-11 w-36 rounded-xl opacity-80" />
          </div>
        </div>
        <span className="skeleton hidden min-h-64 lg:block" />
      </div>
    </div>
  );
}

export function RouteSilhouetteSkeleton({
  family,
  label,
}: {
  readonly family: RouteSilhouetteFamily;
  readonly label: string;
}) {
  return (
    <div
      data-slot="loading-state"
      data-variant="silhouette"
      data-route-silhouette={family}
      role="status"
      aria-busy="true"
      aria-label={label}
      aria-live="polite"
      className="skeleton-group w-full"
    >
      <div aria-hidden="true">
        {family === "virtual-space" ? <VirtualSpaceSilhouette /> : null}
        {family === "studio-home" ? <StudioHomeSilhouette /> : null}
        {family === "learn" ? <LearnSilhouette /> : null}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
