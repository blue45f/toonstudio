/**
 * StudioDrawOptionsBar — 크기 미리보기(표시 부품).
 *
 * `StudioDrawOptionsBar.tsx`에서 분리한 순수 표시 계층이다. Fast Refresh 경계를 지키려고
 * 컴포넌트만 내보내며, 막대가 함께 쓰는 상수는 `studio-draw-options-bar-constants.ts`에 둔다.
 */

import type { ReactElement } from "react";

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
