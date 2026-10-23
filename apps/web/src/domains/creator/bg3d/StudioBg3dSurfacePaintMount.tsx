/**
 * StudioBg3dSurfacePaintMount — 도형(프리미티브) 표면 그리기 패널의 사이드바 마운트(2026-10-23).
 *
 * 호스트 백(h)의 primitiveTexturePaint 묶음(useStudioBg3dPrimitivePaintHost)을 표면 그리기 1단계 패널
 * (StudioBg3dTexturePaintPanel) props 로 잇는 얇은 어댑터다. 사이드바는 GLB 마운트(StudioBg3dGlbTexturePaintMount)
 * 한 줄만 그리고, 그 마운트가 이 컴포넌트를 함께 그린다 — 사이드바 파일을 고치지 않고 붙이기 위한 위임이다.
 * 선택한 첫 항목이 프리미티브가 아니면 아무것도 그리지 않고, 도형 탭(BG_PANEL_TABS 의 "shapes")에서만 보인다.
 */

import { useT } from "@/shared/lib/i18n";
import "./studio-bg3d-surface-paint-i18n";

import { StudioBg3dTexturePaintPanel } from "./StudioBg3dTexturePaintPanel";

import type { StudioBg3dPrimitivePaintBlock, StudioBg3dPrimitivePaintHostBag } from "./useStudioBg3dPrimitivePaintHost";

export interface StudioBg3dSurfacePaintMountHost {
  readonly primitiveTexturePaint?: StudioBg3dPrimitivePaintHostBag;
  readonly hideOnTab?: (tab: string) => boolean;
}

function blockReason(t: ReturnType<typeof useT>, block: StudioBg3dPrimitivePaintBlock | null): string | null {
  switch (block) {
    case "locked":
      return t("studio.bg3dSurfacePaint.lockedReason", "잠긴 도형에는 그릴 수 없어요. 레이어 목록에서 잠금을 푼 뒤 그려 주세요.");
    case "hidden":
      return t("studio.bg3dSurfacePaint.hiddenReason", "숨긴 도형에는 그릴 수 없어요. 레이어 목록의 눈 아이콘으로 다시 보이게 한 뒤 그려 주세요.");
    case "busy":
      return t("studio.bg3dSurfacePaint.busyReason", "캡처·불러오기·물리 미리보기가 끝난 뒤 그릴 수 있어요.");
    case null:
      return null;
  }
}

export function StudioBg3dSurfacePaintMount({ h }: { readonly h: StudioBg3dSurfacePaintMountHost }) {
  const t = useT();
  const paint = h.primitiveTexturePaint;
  if (!paint?.primitive) return null;
  const hidden = h.hideOnTab ? h.hideOnTab("shapes") : false;
  const heading = t("studio.bg3dSurfacePaint.heading", "도형 표면 그리기");
  return (
    <section hidden={hidden} className="border-t border-line pt-4" aria-label={heading}>
      <h3 className="mb-2 text-sm font-bold text-fg">{heading}</h3>
      <StudioBg3dTexturePaintPanel
        // 도형마다 다시 실행 목록이 따로다 — 다른 도형으로 바꾸면 패널 상태를 새로 시작한다.
        key={paint.primitive.id}
        primitive={paint.primitive}
        paintActive={paint.paintActive}
        onPaintActiveChange={paint.onPaintActiveChange}
        brush={paint.brush}
        onBrushChange={paint.onBrushChange}
        onPaintChange={paint.onPaintChange}
        disabledReason={blockReason(t, paint.blockedBy)}
      />
    </section>
  );
}
