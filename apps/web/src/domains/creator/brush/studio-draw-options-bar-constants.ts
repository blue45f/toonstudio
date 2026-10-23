/**
 * StudioDrawOptionsBar — 아이콘 버튼 스타일, 힌트 변형, 안정화 프리셋(상수).
 *
 * 컴포넌트 파일에서 상수를 함께 내보내면 빠른 새로고침이 깨져 `studio-draw-options-bar-parts.tsx` 에서 분리했다.
 */

import { cn } from "@/shared/lib/utils";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  STUDIO_BRUSH_OPACITY_CHIPS,
  STUDIO_BRUSH_SIZE_CHIPS,
} from "../studio-brush";

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

