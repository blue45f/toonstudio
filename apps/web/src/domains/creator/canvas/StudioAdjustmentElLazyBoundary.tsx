import { lazy, Suspense, type ReactNode } from "react";
import type { AdjustmentElement } from "../layer/studio-adjustment-element-guard";

const StudioAdjustmentElGroup = lazy(() =>
  import("./StudioAdjustmentElGroup").then((module) => ({ default: module.StudioAdjustmentElGroup })),
);

export function StudioAdjustmentElLazyBoundary({
  element,
  pixelRatio,
  width,
  height,
  cacheKey,
  children,
}: {
  element: AdjustmentElement;
  pixelRatio: number;
  width: number;
  height: number;
  cacheKey: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<>{children}</>}>
      <StudioAdjustmentElGroup element={element} pixelRatio={pixelRatio} width={width} height={height} cacheKey={cacheKey}>
        {children}
      </StudioAdjustmentElGroup>
    </Suspense>
  );
}
