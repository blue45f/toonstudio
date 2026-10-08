import { useEffect, useState } from "react";

import { cx } from "@/shared/lib/cx";
import { proxiedCoverSrc, proxiedCoverSrcSet } from "@/shared/lib/cover-proxy";
import { useAppConfig } from "@/platform/environment/use-app-config";

// 표지 로드 상한(ms) — 프록시·업스트림이 멈추면 브라우저가 error를 아주 늦게 주거나
// 영원히 주지 않아 포스터 자리가 빈 이미지로 남는다(F-B13-1). 이 시간 안에 load도
// error도 없으면 실패로 보고 폴백(타이포그래픽 커버)으로 전환한다.
export const COVER_LOAD_TIMEOUT_MS = 12_000;

// 표지 <img> 래퍼 — CDN 링크가 만료/404 되면 깨진 이미지 박스 대신 폴백(그라디언트+글리프)으로 전환.
// 로드 완료 시 부드럽게 페이드-인(팝-인 방지). priority(LCP) 표지는 즉시 표시해 LCP에 영향 없음.
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
    <img
      src={proxiedCoverSrc(src)}
      srcSet={srcSet ? proxiedCoverSrcSet(srcSet) : undefined}
      sizes={sizes}
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
  );
}
