import { CoverImage } from "./cover-image";

import type { Title } from "@/shared/lib/types";

import { cx } from "@/shared/lib/cx";

/**
 * ArtBackdrop (BLUEPRINT §6.2 (2)·(4), §6.3 작품 상세, S3-17) — 표지 틴트 배경.
 *
 * 틴트는 런타임 픽셀 샘플링(canvas·getImageData)으로 만들지 않는다. 작품
 * 메타데이터에 사전 계산돼 실려 오는 `Title.cover`([from, to] 그라디언트 쌍)를
 * 그대로 배경으로 쓴다 — 결정적이고, 첫 페인트부터 틴트만으로 화면이 완성되며,
 * 표지 이미지가 없거나 로드에 실패해도 배경이 비지 않는다. 실제 표지 이미지는
 * 그 위에 흐리게 겹치는 장식 레이어일 뿐이며 분위기 도출에는 쓰지 않는다.
 * 3층 표준(§6.2 (2)): 틴트/아트(배경) → 스크림 → 본문(호출자 children이 아니라
 * 형제 콘텐츠). 스크림은 아트 위 텍스트의 본문 대비 4.5:1을 보장하는 고정값이다
 * (S3-15의 --art-scrim 토큰과 같은 의도 — 토큰 병합 시 이 상수로 수렴한다).
 */
export const ART_BACKDROP_SCRIM_BOTTOM =
  "bg-[linear-gradient(to_top,oklch(0.09_0.025_265/0.95)_0%,oklch(0.09_0.025_265/0.82)_34%,oklch(0.09_0.025_265/0.38)_62%,oklch(0.09_0.025_265/0.06)_88%)]";
export const ART_BACKDROP_SCRIM_SIDE =
  "bg-[linear-gradient(78deg,oklch(0.09_0.025_265/0.5)_0%,transparent_58%)]";

/** 사전 계산 틴트 쌍 → 배경 그라디언트. TitlePoster와 같은 혼합 비율(88%/82%)을 쓴다. */
export function artBackdropBackground(cover: readonly [string, string]): string {
  const [from, to] = cover;
  return `linear-gradient(150deg, color-mix(in oklch, ${from} 88%, oklch(0.24 0.012 66)), color-mix(in oklch, ${to} 82%, oklch(0.15 0.008 70)))`;
}

export function ArtBackdrop({
  title,
  className,
}: {
  /** 사전 계산 틴트(cover)와 장식용 표지 이미지(coverImage)만 읽는다. */
  title: Pick<Title, "cover" | "coverImage">;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-art-backdrop="true"
      data-art-tint="precomputed"
      className={cx(
        "absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden",
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{ background: artBackdropBackground(title.cover) }}
      />
      {title.coverImage ? (
        <CoverImage
          src={title.coverImage}
          alt=""
          priority
          className="absolute inset-0 size-full scale-110 object-cover object-[center_22%] opacity-60 blur-md"
        />
      ) : null}
      {/* 하단 스크림: 남색 94%에서 투명으로 — 본문 대비 4.5:1 확보 */}
      <div className={cx("absolute inset-0", ART_BACKDROP_SCRIM_BOTTOM)} />
      <div className={cx("absolute inset-0", ART_BACKDROP_SCRIM_SIDE)} />
    </div>
  );
}
