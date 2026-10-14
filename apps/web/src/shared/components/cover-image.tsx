import { useEffect, useState } from "react";

import { cx } from "@/shared/lib/cx";
import { proxiedCoverSrc, proxiedCoverSrcSet } from "@/shared/lib/cover-proxy";
import { useAppConfig } from "@/platform/environment/use-app-config";

// 표지 로드 상한(ms) — 프록시·업스트림이 멈추면 브라우저가 error를 아주 늦게 주거나
// 영원히 주지 않아 포스터 자리가 빈 이미지로 남는다(F-B13-1). 이 시간 안에 load도
// error도 없으면 실패로 보고 <img>를 걷어낸다. 단, 폴백 표시는 이 판정을 기다리지
// 않는다 — 폴백은 첫 페인트부터 이미지 아래에 서 있고(S3-16 표지 계약), 상한은
// 깨진 채 매달린 <img>를 정리하는 용도로만 남는다.
export const COVER_LOAD_TIMEOUT_MS = 12_000;

// 표지 그리드 표준(§5.2 (5): 2열 →(640) 3열 →(1024) 4열 →(1280) 5열, 컨테이너
// standard 82.5rem)에서 도출한 sizes — 그리드 표지는 호출자가 손으로 적지 않고
// 부품이 자동 부여한다(S3-16). 1280px 이상은 컨테이너 상한 기준 (82.5rem-간격)/5 ≈ 16rem.
export const COVER_GRID_SIZES =
  "(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 16rem";

// 대형(hero) 포스터의 sizes — 상세·스포트라이트처럼 그리드가 아닌 단독 대형 표지용.
export const COVER_HERO_SIZES = "(max-width: 639px) 50vw, 20rem";

// 표지 그리드의 첫 행 개수 — 가장 넓은 구간(5열)의 첫 행. 첫 행 priority 판정은
// 개별 카드 호출자가 아니라 그리드(목록을 렌더링하는 쪽)가 index로 도출한다(S3-16).
export const COVER_GRID_FIRST_ROW_COUNT = 5;

// 그리드 index(0-base)가 첫 행인지 — 첫 행 표지만 priority(eager·fetchPriority high).
export function coverGridPriority(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < COVER_GRID_FIRST_ROW_COUNT;
}

// sizes 자동 부여 — 명시 sizes가 없고 srcSet만 있으면 그리드 표준 sizes를 붙인다.
// (srcSet이 있을 때만 sizes가 의미를 가지므로, srcSet이 없으면 undefined를 유지한다.
//  포스터 계열은 TitlePoster가 size 기준으로 기본 sizes를 먼저 채워 넣는다.)
export function resolveCoverSizes(sizes: string | undefined, srcSet: string | undefined): string | undefined {
  return sizes ?? (srcSet ? COVER_GRID_SIZES : undefined);
}

// 표지 <img> 래퍼 — 계약(S3-16, BLUEPRINT §6.2 (4)):
// - 로드 전 상태는 투명한 빈 타일이 아니라 "즉시 보이는 폴백"이다. fallback은 첫
//   페인트부터 <img> 아래에 렌더되고, 이미지가 로드되면 그 위로 페이드-인한다.
//   실패(error·상한 초과·킬스위치)면 <img>만 걷어내고 폴백이 그대로 남는다 —
//   실패 판정을 기다리는 구간이 없다.
// - priority(LCP) 표지는 페이드 없이 즉시 표시해 LCP에 영향 없음.
export function CoverImage({
  src,
  alt,
  fallback,
  className,
  priority,
  sizes,
  srcSet,
}: {
  src: string;
  alt: string;
  fallback?: React.ReactNode;
  className?: string;
  priority?: boolean; // above-the-fold 커버는 즉시 로드(LCP 개선)
  sizes?: string;
  srcSet?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 표지 킬스위치(관리자) — 저작권 리스크 시 즉시 자체 타이포 커버로 대체. 로드 실패도 동일 폴백.
  // (환경변수 COVER_IMAGE_POLICY=off 는 빌드·프록시 단의 하드 킬로 병행 존재한다.)
  const { showCovers } = useAppConfig();

  // 로드 상한 — src가 바뀌면 다시 잰다. 이미 끝난(loaded/failed) 표지에는 걸지 않는다.
  useEffect(() => {
    if (loaded || failed) return;
    const timer = window.setTimeout(() => setFailed(true), COVER_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, failed, src]);

  if (!showCovers || failed) return <>{fallback ?? null}</>;
  return (
    <>
      {/* 즉시 보이는 폴백 — 로드가 끝나기 전(첫 페인트 포함)에는 이미지 아래에 서 있고,
          로드 완료 시점에 걷어낸다. priority 표지도 같은 규칙이라 첫 행도 빈 타일이 없다. */}
      {!loaded && (fallback ?? null)}
      <img
        src={proxiedCoverSrc(src)}
        srcSet={srcSet ? proxiedCoverSrcSet(srcSet) : undefined}
        sizes={resolveCoverSizes(sizes, srcSet)}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding={priority ? "sync" : "async"}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        // 캐시된 이미지는 onLoad/onError 가 핸들러 부착 전에 끝나 있을 수 있다 → 마운트 시점에
        // 이미 끝난 이미지면 결과대로 처리한다. 성공(complete + naturalWidth>0)이면 즉시 표시해
        // 투명 고착을 막고, 실패(complete 인데 naturalWidth=0)면 깨진 이미지 아이콘 대신 폴백으로
        // 보낸다 — 실패를 loaded 로 처리하면 깨진 표지가 그대로 남는다(F-B13-1).
        ref={(node) => {
          if (!node?.complete) return;
          if (node.naturalWidth > 0) setLoaded(true);
          else setFailed(true);
        }}
        className={cx(
          className,
          !priority && "transition-opacity duration-500 ease-out",
          !priority && !loaded && "opacity-0"
        )}
      />
    </>
  );
}
