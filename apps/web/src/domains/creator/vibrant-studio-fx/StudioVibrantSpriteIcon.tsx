import "./studio-vibrant-atelier.css";

import { useState, type CSSProperties, type ReactElement } from "react";

import {
  getStudioVibrantSprite,
  isStudioVibrantSpriteId,
  resolveStudioToolSpriteId,
  type StudioVibrantSpriteId,
} from "./studio-vibrant-sprite-registry";

import { cn } from "@/shared/lib/utils";

export type StudioVibrantSpriteSize = number | "xs" | "sm" | "md" | "lg" | "xl";

const SPRITE_SIZE_PRESETS: Readonly<Record<"xs" | "sm" | "md" | "lg" | "xl", number>> =
  Object.freeze({
    xs: 20,
    sm: 24,
    md: 32,
    lg: 44,
    xl: 64,
  });

function resolveSpriteSizePx(size: StudioVibrantSpriteSize): number {
  if (typeof size === "number") {
    if (!Number.isFinite(size)) return SPRITE_SIZE_PRESETS.md;
    return Math.round(Math.min(256, Math.max(16, size)));
  }
  return SPRITE_SIZE_PRESETS[size] ?? SPRITE_SIZE_PRESETS.md;
}

export interface StudioVibrantSpriteIconProps {
  /** 44종 정본 스프라이트 ID 또는 도구·브러시 별칭 ID. */
  readonly spriteId: StudioVibrantSpriteId | (string & {});
  /** 픽셀 크기(16..256) 또는 프리셋("xs" | "sm" | "md" | "lg" | "xl"). 기본값 "md"(32px). */
  readonly size?: StudioVibrantSpriteSize;
  /** 활성 상태 — 도구별 OKLCH 액센트 링 및 잉크 번짐 오라(`ts-ink-bloom-active`) 적용. */
  readonly active?: boolean;
  /** 유리 광택 스윕(`ts-specular-sheen`) 및 150ms 탄성 눌림(`scale(0.95)`) 적용. */
  readonly animated?: boolean;
  /** 고대비 패턴 해치 오버레이(`ts-hc-hatch-overlay`) 강제 표시. */
  readonly highContrastOverlay?: boolean;
  /** 접근성 대체 라벨. 미지정 시 레지스트리 한글 정본 라벨을 사용한다. */
  readonly ariaLabel?: string;
  /** 장식용 아이콘으로 스크린 리더에서 숨길 때 true. */
  readonly decorative?: boolean;
  /** 이미지 로딩 전략. 기본값 "lazy". */
  readonly loading?: "eager" | "lazy";
  readonly className?: string;
  /** 이미지 로드 실패 시 호출되는 선택 콜백. */
  readonly onLoadError?: (resolvedId: StudioVibrantSpriteId) => void;
}

/**
 * 44종 주얼 아틀리에 투명 WebP 스프라이트를 선명하게 렌더하는 공용 리액트 컴포넌트.
 *
 * - 원시 hex/rgb 색상 선언 0건 (모든 색은 `studio-vibrant-atelier.css` OKLCH 토큰/클래스만 사용).
 * - 이미지 로드 실패 시 깨진 아이콘 대신 한글 주얼 배지 폴백으로 안전하게 복구한다.
 */
export function StudioVibrantSpriteIcon({
  spriteId,
  size = "md",
  active = false,
  animated = false,
  highContrastOverlay = false,
  ariaLabel,
  decorative = false,
  loading = "lazy",
  className,
  onLoadError,
}: StudioVibrantSpriteIconProps): ReactElement {
  const resolvedId = isStudioVibrantSpriteId(spriteId)
    ? spriteId
    : resolveStudioToolSpriteId(spriteId);
  const entry = getStudioVibrantSprite(resolvedId);
  const sizePx = resolveSpriteSizePx(size);

  // 실패한 src 문자열을 상태로 보관해 spriteId 변경 시 효과 없이 자동 재시도한다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFallback = failedSrc === entry.src;

  const resolvedAriaLabel = ariaLabel?.trim() || entry.labelKo;
  const sizeStyle = {
    "--ts-sprite-size": `${sizePx}px`,
  } as CSSProperties;

  return (
    <span
      style={sizeStyle}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : resolvedAriaLabel}
      aria-hidden={decorative ? "true" : undefined}
      data-vibrant-sprite-id={entry.id}
      data-vibrant-sprite-category={entry.category}
      data-vibrant-accent-token={entry.accentToken}
      data-active={active ? "true" : "false"}
      data-animated={animated ? "true" : "false"}
      data-sprite-fallback={showFallback ? "true" : "false"}
      className={cn(
        "ts-vibrant-sprite",
        entry.accentClass,
        active && "ts-ink-bloom-active ts-vibrant-sprite--active",
        animated && "ts-specular-sheen ts-vibrant-pressable ts-vibrant-sprite--animated",
        highContrastOverlay && "ts-hc-hatch-overlay",
        className,
      )}
    >
      {showFallback ? (
        <span className="ts-vibrant-sprite__fallback" aria-hidden="true">
          {entry.shortBadgeKo}
        </span>
      ) : (
        <img
          src={entry.src}
          alt=""
          width={sizePx}
          height={sizePx}
          loading={loading}
          decoding="async"
          draggable={false}
          aria-hidden="true"
          className="ts-vibrant-sprite__img"
          onError={() => {
            setFailedSrc(entry.src);
            onLoadError?.(entry.id);
          }}
        />
      )}
    </span>
  );
}
