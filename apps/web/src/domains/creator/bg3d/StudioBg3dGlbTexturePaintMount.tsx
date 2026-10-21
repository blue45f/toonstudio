/**
 * StudioBg3dGlbTexturePaintMount — GLB 텍스처 페인트 패널의 사이드바 마운트 (D4).
 *
 * 호스트 백(h)의 glbTexturePaint 묶음(useStudioBg3dGlbTexturePaintHost)을
 * 패널 props로 그대로 잇는 얇은 어댑터다. 선택된 커스텀 모델이 없으면 아무것도
 * 그리지 않고, 표시는 모델 탭(BG_PANEL_TABS의 "models")에서만 한다 —
 * 다른 섹션과 같은 hideOnTab 계약을 따른다.
 */

import { StudioBg3dGlbTexturePaintPanel } from "./StudioBg3dGlbTexturePaintPanel";

import type { StudioBg3dGlbTexturePaintHostBag } from "./useStudioBg3dGlbTexturePaintHost";

export interface StudioBg3dGlbTexturePaintMountHost {
  readonly glbTexturePaint?: StudioBg3dGlbTexturePaintHostBag;
  readonly hideOnTab?: (tab: string) => boolean;
}

export function StudioBg3dGlbTexturePaintMount({
  h,
}: {
  readonly h: StudioBg3dGlbTexturePaintMountHost;
}) {
  const paint = h.glbTexturePaint;
  if (!paint?.instance) return null;
  const hidden = h.hideOnTab ? h.hideOnTab("models") : false;
  return (
    <section hidden={hidden} className="border-t border-line pt-4" aria-label="GLB 텍스처 페인트">
      <h3 className="mb-2 text-sm font-bold text-fg">모델 표면 그리기 · GLB 텍스처</h3>
      <StudioBg3dGlbTexturePaintPanel
        instance={paint.instance}
        paintability={paint.paintability}
        paintActive={paint.paintActive}
        onPaintActiveChange={paint.onPaintActiveChange}
        brush={paint.brush}
        onBrushChange={paint.onBrushChange}
        activeTargetKey={paint.activeTargetKey}
        onActiveTargetChange={paint.onActiveTargetChange}
        onPaintChange={paint.onPaintChange}
        baseImageSource={paint.baseImageSource}
        baseImageSize={paint.baseImageSize}
      />
    </section>
  );
}
