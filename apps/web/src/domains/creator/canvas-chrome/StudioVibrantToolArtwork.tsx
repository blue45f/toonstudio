/**
 * 자체 완결형 드로잉 스튜디오 컬러 스프라이트 아트워크 컴포넌트.
 *
 * `/assets/studio/vibrant-sprites/*.webp` 44종 투명 WebP 스프라이트를 선명하게 렌더링하며,
 * 이미지 로드 실패 시 안전한 폴백 글리프를 표시하고 TSX 내 원시 색상을 전혀 사용하지 않는다.
 */

import { useState, type ReactElement, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import {
  getVibrantSpriteSrc,
  type StudioVibrantAccentKind,
  type StudioVibrantSpriteId,
} from "./studio-vibrant-sprite-catalog";
import "./studio-vibrant-chrome.css";

export interface StudioVibrantToolArtworkProps {
  readonly spriteId: StudioVibrantSpriteId;
  readonly accent?: StudioVibrantAccentKind;
  readonly size?: number;
  readonly active?: boolean;
  /** 기본값 true — 이미 aria-label이 있는 버튼 내부에서 접근성 이름을 오염시키지 않는다. */
  readonly decorative?: boolean;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly fallback?: ReactNode;
}

export function StudioVibrantToolArtwork({
  spriteId,
  accent = "neutral",
  size = 22,
  active = false,
  decorative = true,
  ariaLabel,
  className,
  fallback,
}: StudioVibrantToolArtworkProps): ReactElement {
  const [failedSpriteId, setFailedSpriteId] = useState<string | null>(null);
  const src = getVibrantSpriteSrc(spriteId);
  const hasFailed = failedSpriteId === spriteId;

  return (
    <span
      data-studio-vibrant-artwork={spriteId}
      data-vibrant-accent={accent}
      data-vibrant-active={active ? "true" : "false"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={!decorative && hasFailed ? ariaLabel : undefined}
      role={!decorative && hasFailed ? "img" : undefined}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={cn("studio-vibrant-artwork", className)}
    >
      {hasFailed ? (
        <span className="studio-vibrant-artwork__fallback" aria-hidden="true">
          {fallback ?? (
            <span className="size-2 rounded-full bg-accent" />
          )}
        </span>
      ) : (
        <img
          src={src}
          alt={decorative ? "" : (ariaLabel ?? "")}
          width={size}
          height={size}
          draggable={false}
          decoding="async"
          loading="eager"
          onError={() => setFailedSpriteId(spriteId)}
          className="studio-vibrant-artwork__img"
        />
      )}
    </span>
  );
}
