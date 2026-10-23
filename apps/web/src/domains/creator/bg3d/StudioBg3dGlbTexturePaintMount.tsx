/**
 * StudioBg3dGlbTexturePaintMount — 표면 그리기 패널의 사이드바 마운트 (D4, 2026-10-23 프리미티브 위임 추가).
 *
 * 호스트 백(h)의 glbTexturePaint 묶음(useStudioBg3dGlbTexturePaintHost)을
 * 패널 props로 그대로 잇는 얇은 어댑터다. 선택된 커스텀 모델이 없으면 GLB 패널을
 * 그리지 않고, 표시는 모델 탭(BG_PANEL_TABS의 "models")에서만 한다 —
 * 다른 섹션과 같은 hideOnTab 계약을 따른다.
 * 프리미티브(도형) 표면 그리기는 StudioBg3dSurfacePaintMount 가 맡는다. 사이드바에는 이 마운트 한 줄만 있어,
 * 여기서 함께 그려 붙인다(선택한 첫 항목은 모델이거나 도형 하나뿐이라 둘이 동시에 보이지 않는다).
 */

import { StudioBg3dGlbTexturePaintPanel } from "./StudioBg3dGlbTexturePaintPanel";
import { StudioBg3dSurfacePaintMount, type StudioBg3dSurfacePaintMountHost } from "./StudioBg3dSurfacePaintMount";

import type { StudioBg3dGlbTexturePaintHostBag } from "./useStudioBg3dGlbTexturePaintHost";

export interface StudioBg3dGlbTexturePaintMountHost extends StudioBg3dSurfacePaintMountHost {
  readonly glbTexturePaint?: StudioBg3dGlbTexturePaintHostBag;
  readonly hideOnTab?: (tab: string) => boolean;
}

export function StudioBg3dGlbTexturePaintMount({
  h,
}: {
  readonly h: StudioBg3dGlbTexturePaintMountHost;
}) {
  return (
    <>
      <StudioBg3dSurfacePaintMount h={h} />
      <StudioBg3dGlbModelPaintSection h={h} />
    </>
  );
}

function StudioBg3dGlbModelPaintSection({ h }: { readonly h: StudioBg3dGlbTexturePaintMountHost }) {
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
