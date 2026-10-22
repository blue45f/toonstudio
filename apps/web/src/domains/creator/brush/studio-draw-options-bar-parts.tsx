/**
 * StudioDrawOptionsBar — 크기 미리보기와 힌트 변형·안정화 프리셋(표시 부품).
 *
 * `StudioDrawOptionsBar.tsx`에서 분리한 순수 표시·데이터 계층이다.
 */

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  STUDIO_BRUSH_OPACITY_CHIPS,
  STUDIO_BRUSH_SIZE_CHIPS,
} from "../studio-brush";

export function SizePreview({
  size,
  color,
  opacity,
}: {
  size: number;
  color: string;
  opacity: number;
}): ReactElement {
  const d = Math.min(26, Math.max(4, size * 0.42));
  const halo = Math.min(30, d + 6);
  return (
    <span
      aria-hidden
      data-studio-size-preview="true"
      className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-line/80 bg-canvas/90 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.06)]"
    >
      <span
        className="absolute rounded-full opacity-25 blur-[1.5px]"
        style={{ width: halo, height: halo, background: color }}
      />
      <span
        className="relative rounded-full shadow-[0_1px_3px_oklch(0.1_0.01_70/0.35)] ring-1 ring-black/15"
        style={{
          width: d,
          height: d,
          backgroundColor: color,
          opacity: Math.max(0.2, opacity),
        }}
      />
    </span>
  );
}

export const iconBtn = cn(
  "grid size-8 shrink-0 place-items-center rounded-lg border",
  STUDIO_EASE,
  STUDIO_FOCUS_RING
);

export const BRUSH_SIZE_HINT_VARIANT = {
  xs: "preset-xs",
  s: "preset-s",
  m: "preset-m",
  l: "preset-l",
  xl: "preset-xl",
  xxl: "preset-xxl",
} as const satisfies Record<(typeof STUDIO_BRUSH_SIZE_CHIPS)[number]["id"], string>;

export const BRUSH_OPACITY_HINT_VARIANT = {
  o20: "preset-20",
  o40: "preset-40",
  o60: "preset-60",
  o80: "preset-80",
  o100: "preset-100",
} as const satisfies Record<(typeof STUDIO_BRUSH_OPACITY_CHIPS)[number]["id"], string>;

export const STUDIO_STABILIZER_STRENGTH_PRESETS = [
  { value: 0, label: "끔", description: "입력 지연 없이 원본 제스처를 그대로 사용합니다.", previewVariant: "standard" },
  { value: 2, label: "스케치", description: "빠른 러프와 짧은 선을 가볍게 안정화합니다.", previewVariant: "standard" },
  { value: 5, label: "선화", description: "일반적인 캐릭터 선화에 균형 잡힌 보정을 적용합니다.", previewVariant: "adaptive" },
  { value: 8, label: "정밀", description: "긴 곡선과 장식선을 강하게 안정화합니다.", previewVariant: "precision" },
] as const;

