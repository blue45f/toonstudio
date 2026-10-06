export type RouteSilhouetteFamily =
  | "virtual-space"
  | "studio-home"
  | "learn"
  | "site-home"
  | "market"
  | "fortune"
  | "catalog-grid"
  | "catalog-rank";

/**
 * 페이지 실루엣 스켈레톤 공용 규격 (R9, 2026-10-07 규격화).
 *
 * 왜 실루엣인가: 일반 카드 그리드는 어느 페이지에서 열어도 같은 회색 화면이라 진입
 * 첫인상이 본문과 무관했다. 자주 진입하는 화면군은 각 페이지의 골격(무대+패널,
 * 포스터 히어로, 좌 패널+카드 등)을 닮은 실루엣으로 자리를 먼저 잡는다.
 *
 * 규격:
 * - 데이터가 아니라 구조만 흉내 낸다. 실제 아트·문구·수치는 넣지 않는다.
 * - 실제 페이지의 그리드·비율·여백 리듬을 따라 레이아웃 시프트가 없게 한다.
 * - 블록은 `skeleton` 유틸만 쓴다. 반짝임(시머)은 globals.css가
 *   `prefers-reduced-motion`에서 전역으로 끄므로 패밀리마다 따로 끄지 않는다.
 * - 색은 토큰 클래스(border-line·bg-panel·bg-card)만 쓴다. 원시 색상 금지.
 *
 * 역할 경계 (중복 로딩 표시 방지):
 * - 라우트 폴백(RouteFallback의 Suspense)이 이 실루엣의 1차 소비처다. 폴백은
 *   코드 청크·셸이 준비되는 동안만 보이며, 페이지가 마운트되면 사라진다.
 * - 페이지가 마운트된 뒤의 데이터 로딩은 페이지 내부 스켈레톤 소관이다
 *   (LoadingState, 도메인 전용 스켈레톤 등). 페이지 내부에서 라우트 폴백이나
 *   이 실루엣을 다시 그려 전역 로딩과 겹치게 하지 않는다. 단, 페이지가 자체
 *   게이트(예: 홈의 세션 확인) 때문에 본문을 통째로 비워 두는 경우에는 같은
 *   패밀리의 실루엣을 재사용해 폴백→게이트→본문의 시각 점프를 없앤다.
 * - 오래 걸릴 때의 안내는 단계 사다리가 맡는다: 실루엣(즉시) → 폴백의 지연
 *   안내 카드(4.5초) → RouteStage의 stalled 복구 패널(기본 8초). 실루엣 자체에
 *   타이머·문구·버튼을 넣지 않는다.
 */
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

/**
 * 사이트 홈(/) 실루엣: 포스터 히어로(좌 이야기 열 + 우 Luna 패널) + 개인 스트립
 * + 발견 미리보기 레일 + 시작 카드 6열 + 예시 작품 선반.
 * ReferenceCreatorDashboard의 실제 골격(포스터 최소 높이·2열 비율)을 따른다.
 */
function SiteHomeSilhouette() {
  return (
    <div className="grid gap-5">
      <div className="overflow-hidden rounded-[20px] border border-line bg-panel">
        <div className="grid min-h-[420px] content-end gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-end">
          <div className="grid max-w-[680px] content-end gap-3">
            <span className="skeleton h-10 w-56" />
            <span className="skeleton h-4 w-72 max-w-full opacity-80" />
            <span className="skeleton mt-1 h-11 w-full max-w-lg" />
            <span className="skeleton h-11 w-2/3 max-w-sm" />
            <span className="skeleton h-4 w-full max-w-md opacity-80" />
            <div className="mt-2 flex gap-2">
              <span className="skeleton h-8 w-28 rounded-full" />
              <span className="skeleton h-8 w-28 rounded-full opacity-80" />
            </div>
            <span className="skeleton block h-[58px] w-full rounded-full" />
          </div>
          <div className="hidden rounded-2xl border border-line bg-card p-3.5 lg:block">
            <div className="flex items-center gap-2.5">
              <span className="skeleton size-11 shrink-0 rounded-xl" />
              <span className="skeleton h-4 w-1/2" />
            </div>
            <span className="skeleton mt-3 block h-4 w-full opacity-80" />
            <span className="skeleton mt-2 block h-4 w-5/6 opacity-80" />
            <span className="skeleton mt-3 block h-24 w-full rounded-xl opacity-90" />
            <span className="skeleton mt-3 block h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
      <span className="skeleton block h-12 w-full rounded-2xl" />
      <div>
        <span className="skeleton block h-5 w-44" />
        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {range(6).map((index) => (
            <span key={index} className="skeleton block aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      </div>
      <div>
        <span className="skeleton block h-5 w-48" />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {range(6).map((index) => (
            <div key={index} className="overflow-hidden rounded-xl border border-line bg-card">
              <span className="skeleton block h-[76px] w-full rounded-none" />
              <span className="skeleton mx-2.5 mt-2.5 block h-3.5 w-4/5" />
              <span className="skeleton mx-2.5 mb-3 mt-1.5 block h-3 w-3/5 opacity-80" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <span className="skeleton block h-5 w-32" />
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {range(6).map((index) => (
            <span key={index} className="skeleton block h-[120px] w-full rounded-[10px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 마켓 홈(/market) 실루엣: 마스트헤드(제목·검색·행동 + 우 미리보기) + 카테고리
 * 아트 타일 줄 + 최근 공유 카드 그리드. 카드 모양은 마켓 홈 내부 스켈레톤
 * (16:9 미리보기 + 본문 2줄)과 같은 결을 쓴다.
 */
function MarketSilhouette() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="grid content-start gap-3">
          <span className="skeleton h-3.5 w-28" />
          <span className="skeleton h-10 w-full max-w-md" />
          <span className="skeleton h-10 w-1/2 max-w-xs" />
          <span className="skeleton h-4 w-full max-w-lg opacity-80" />
          <span className="skeleton mt-1 block h-12 w-full max-w-xl rounded-xl" />
          <div className="mt-1 flex items-center gap-2.5">
            <span className="skeleton h-11 w-32 rounded-xl" />
            <span className="skeleton h-8 w-36 rounded-full opacity-80" />
          </div>
        </div>
        <span className="skeleton hidden min-h-64 w-full rounded-3xl lg:block" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {range(5).map((index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-line bg-card">
            <span className="skeleton block aspect-[16/10] w-full rounded-none" />
            <span className="skeleton mx-3 my-2.5 block h-3.5 w-2/3" />
          </div>
        ))}
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="skeleton h-5 w-36" />
          <span className="skeleton h-4 w-16 opacity-80" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {range(8).map((index) => (
            <div key={index} className="overflow-hidden rounded-xl border border-line bg-card">
              <span className="skeleton block aspect-video w-full rounded-none" />
              <div className="space-y-2 p-3.5">
                <span className="skeleton block h-4 w-4/5" />
                <span className="skeleton block h-3 w-2/5 opacity-80" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 운세군(/fortune, /fortune/*) 실루엣: 좌 루나 패널(아바타·말풍선·종류 칩·
 * 생년월일 입력·CTA) + 우 오늘의 카드 2×2 + 저장·공유 바.
 * FortuneLunaHero 착지 구도(400px 패널 + 카드 그리드)를 따른다.
 */
function FortuneSilhouette() {
  return (
    <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-6">
        <div className="flex items-center gap-3">
          <span className="skeleton size-12 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2">
            <span className="skeleton h-4 w-2/3" />
            <span className="skeleton h-3 w-1/2 opacity-80" />
          </div>
        </div>
        <div className="rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3">
          <span className="skeleton block h-4 w-full" />
          <span className="skeleton mt-2 block h-4 w-5/6 opacity-80" />
          <span className="skeleton mt-2 block h-4 w-3/5 opacity-80" />
        </div>
        <div className="flex flex-wrap gap-2">
          {range(4).map((index) => (
            <span key={index} className="skeleton h-9 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid gap-1.5">
          <span className="skeleton h-3.5 w-24" />
          <span className="skeleton block h-11 w-full rounded-xl" />
          <span className="skeleton h-3 w-3/4 opacity-80" />
        </div>
        <span className="skeleton mt-auto block h-12 w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-4">
        <span className="skeleton h-5 w-32" />
        <div className="grid gap-5 sm:grid-cols-2">
          {range(4).map((index) => (
            <div key={index} className="overflow-hidden rounded-3xl border border-line bg-panel">
              <span className="skeleton block h-40 w-full rounded-none sm:h-44" />
              <div className="space-y-2 px-4 py-3.5">
                <span className="skeleton block h-4 w-full" />
                <span className="skeleton block h-4 w-2/3 opacity-80" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-5 py-4">
          <span className="skeleton h-4 w-1/2 max-w-xs" />
          <div className="flex gap-2">
            <span className="skeleton h-9 w-20 rounded-xl" />
            <span className="skeleton h-9 w-20 rounded-xl opacity-80" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 카탈로그 목록형 실루엣: 헤더(제목·설명) + 필터 칩 줄 + 표지 그리드.
 * 탐색(/explore) 내부 스켈레톤과 같은 카드 결(3:4 표지 + 제목·보조 2줄,
 * 2/3/4/5열)을 써서 폴백→본문 전환 시 카드 자리가 흔들리지 않게 한다.
 */
function CatalogGridSilhouette() {
  return (
    <div>
      <div className="flex flex-col gap-3">
        <span className="skeleton h-3 w-24" />
        <span className="skeleton h-9 w-2/3 max-w-md" />
        <span className="skeleton h-4 w-1/2 max-w-sm opacity-80" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {range(5).map((index) => (
          <span key={index} className="skeleton h-9 w-24 rounded-full" />
        ))}
        <span className="skeleton ml-auto h-9 w-28 rounded-full opacity-80" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {range(10).map((index) => (
          <div key={index} className="space-y-3">
            <span className="skeleton block aspect-[3/4] w-full rounded-xl" />
            <span className="skeleton block h-4 w-3/4" />
            <span className="skeleton block h-3 w-1/2 opacity-80" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 랭킹(/ranking) 실루엣: 헤더 + 순위 보드 행 목록.
 * 랭킹 보드 내부 스켈레톤(RankingSkeleton)의 행 결(순위·썸네일·제목 2줄·수치)을 따른다.
 */
function CatalogRankSilhouette() {
  return (
    <div>
      <div className="flex flex-col gap-3">
        <span className="skeleton h-3 w-24" />
        <span className="skeleton h-9 w-2/3 max-w-md" />
        <span className="skeleton h-4 w-1/2 max-w-sm opacity-80" />
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-panel p-2 sm:p-3">
        {range(8).map((index) => (
          <div
            key={index}
            className="grid grid-cols-[2.75rem_2.5rem_1fr_auto] items-center gap-3 rounded-lg border-b border-line/60 px-2 py-2.5 last:border-b-0 sm:gap-4 sm:px-3"
          >
            <span className="skeleton h-8 w-8" />
            <span className="skeleton h-12 w-10" />
            <span className="min-w-0 space-y-2">
              <span className="skeleton block h-4 w-2/3" />
              <span className="skeleton block h-3 w-4/5 opacity-80" />
            </span>
            <span className="skeleton h-8 w-14" />
          </div>
        ))}
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
        {family === "site-home" ? <SiteHomeSilhouette /> : null}
        {family === "market" ? <MarketSilhouette /> : null}
        {family === "fortune" ? <FortuneSilhouette /> : null}
        {family === "catalog-grid" ? <CatalogGridSilhouette /> : null}
        {family === "catalog-rank" ? <CatalogRankSilhouette /> : null}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
