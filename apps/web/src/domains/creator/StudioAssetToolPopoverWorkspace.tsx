import { Suspense } from "react";

import { StudioAssetToolPopoverBody } from "./StudioAssetToolPopoverBody";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import {
  LazyStudioInsertBatchPreflight,
  LazyStudioUnifiedAssetToolPopoverContent,
} from "./studio-unified-asset-lazy-ui";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";
import { useT } from "@/shared/lib/i18n";

export interface StudioAssetToolPopoverWorkspaceProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

export function StudioAssetToolPopoverWorkspace({
  toolBelt,
}: StudioAssetToolPopoverWorkspaceProps) {
  const t = useT();
  if (toolBelt.menu !== "asset") {
    return <StudioAssetToolPopoverBody toolBelt={toolBelt} />;
  }

  return (
    <Suspense fallback={<StudioPanelLoading label={t("studio.canvas.panelLoading.unifiedAssets", "통합 에셋을 여는 중...")} />}>
      <LazyStudioInsertBatchPreflight toolBelt={toolBelt} />
      <LazyStudioUnifiedAssetToolPopoverContent toolBelt={toolBelt} />
    </Suspense>
  );
}
