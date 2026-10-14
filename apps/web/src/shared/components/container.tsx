import { cx } from "@/shared/lib/cx";

/**
 * 컨테이너 폭 단 (BLUEPRINT §5.2 (1), §5.3 L1).
 * 정본 이름은 폭 4단(reading/standard/app/full)이고, layout-tokens.ts의
 * `LAYOUT_CONTENT_WIDTH_CLASS`와 같은 값을 쓴다. default/wide/prose는 기존
 * 호출부 호환용 별칭이다: wide = standard(1320px), prose = reading(48rem).
 * default(1180px)는 4단 밖의 레거시 폭이라 신규 사용을 금지하고, 표면 이관 때
 * standard로 수렴한다.
 */
export type ContainerSize =
  | "reading"
  | "standard"
  | "app"
  | "full"
  | "default"
  | "wide"
  | "prose";

// 페이지 컨테이너. Section과 분리해 첫 화면 skeleton/error 경로가 섹션 UI 청크를 끌고 오지 않게 한다.
export function Container({
  children,
  className,
  size = "default",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  size?: ContainerSize;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      data-page-container={size}
      className={cx(
        // 좌우 여백은 CSS --layout-gutter 단계(16/24/32px: 기본/≥640/≥1280)와 동일해
        // 헤더·본문의 정렬선이 전 폭에서 일치한다 (BLUEPRINT §5.2 (2), §5.3 L1).
        "mx-auto w-full px-4 sm:px-6 xl:px-8",
        (size === "wide" || size === "standard") && "max-w-[1320px]",
        size === "default" && "max-w-[1180px]",
        (size === "prose" || size === "reading") && "max-w-3xl",
        size === "app" && "max-w-[1600px]",
        size === "full" && "max-w-none",
        className
      )}
    >
      {children}
    </div>
  );
}
