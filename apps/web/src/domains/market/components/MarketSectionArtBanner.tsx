import { SectionArt } from "@/shared/components/section-art";
import { cn } from "@/shared/lib/utils";

/**
 * 마켓 하위 페이지 머리말의 공통 아트 배너 — 섹션 대표 아트(section-market)를
 * 위시리스트가 먼저 쓴 문법(높이·라운드·여백) 그대로 모든 하위 첫 화면에 깐다.
 * 장식 전용이며 페이지 정체성은 각 페이지의 제목·본문이 담당한다.
 */
export function MarketSectionArtBanner({ className }: { readonly className?: string }) {
  return (
    <SectionArt
      image="market"
      className={cn("mb-6 h-32 w-full rounded-3xl object-cover sm:h-40", className)}
    />
  );
}
