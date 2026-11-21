import { describe, expect, it } from "vitest";

import {
  applyMaintainSizeZShift,
  createMultiplaneCameraDoc,
  evaluateMultiplaneCameraAtFrame,
  evaluateMultiplaneLayerTransform,
  evaluateMultiplaneSceneAtFrame,
  evaluateVerticalScrollParallax,
  projectMultiplaneTopSideViews,
  setMultiplaneCameraKeyframe,
  shiftDocumentLayerZMaintainSize,
  type MultiplaneLayerSpec,
} from "./studio-multiplane-z-camera";

function createSampleLayers(): readonly MultiplaneLayerSpec[] {
  return [
    {
      id: "layer-bg",
      name: "원경 산맥",
      x: 500,
      y: 300,
      zDepth: -500,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      opacity: 1,
      visible: true,
    },
    {
      id: "layer-mid",
      name: "중경 캐릭터",
      x: 500,
      y: 300,
      zDepth: 0,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      opacity: 1,
      visible: true,
    },
    {
      id: "layer-fg",
      name: "전경 나뭇잎",
      x: 500,
      y: 300,
      zDepth: 500,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      opacity: 1,
      visible: true,
    },
  ];
}

describe("studio-multiplane-z-camera", () => {
  it("2.5D Z-깊이에 따른 투시 배율·원경→전경 정렬·피사계 심도(DoF)·근접 평면 컬링을 정확히 계산한다", () => {
    let doc = createMultiplaneCameraDoc({
      id: "cam-mp-1",
      viewportWidth: 800,
      viewportHeight: 600,
      focalLengthPx: 1000,
      initialCamZ: 1000,
      dof: { enabled: true, focusPlaneZ: 0, blurScale: 0.02, maxBlurPx: 20 },
      layers: createSampleLayers(),
    });
    doc = setMultiplaneCameraKeyframe(doc, 0, { camX: 400, camY: 300, camZ: 1000 }, "linear");

    const evaluated = evaluateMultiplaneSceneAtFrame(doc, 0);
    expect(evaluated.layers.map((l) => l.layerId)).toEqual(["layer-bg", "layer-mid", "layer-fg"]);

    const bg = evaluated.layers[0];
    const mid = evaluated.layers[1];
    const fg = evaluated.layers[2];
    expect(bg?.perspectiveScale).toBeCloseTo(1000 / 1500, 5);
    expect(mid?.perspectiveScale).toBeCloseTo(1, 5);
    expect(fg?.perspectiveScale).toBeCloseTo(2, 5);

    // 중경(z=0)이 초점 평면이므로 블러 0, 원경/전경은 양수 블러
    expect(mid?.dofBlurPx).toBeCloseTo(0, 5);
    expect(bg?.dofBlurPx).toBeGreaterThan(0);
    expect(fg?.dofBlurPx).toBeGreaterThan(0);

    // 카메라 뒤로 넘어간 레이어는 자동 숨김 처리
    const fgLayer = createSampleLayers()[2];
    expect(fgLayer).toBeDefined();
    if (fgLayer) {
      const behind = evaluateMultiplaneLayerTransform(
        { ...fgLayer, zDepth: 1000 },
        evaluated.camera,
        { viewportWidth: 800, viewportHeight: 600, nearClipEps: 10 },
      );
      expect(behind.isBehindCamera).toBe(true);
      expect(behind.visible).toBe(false);
    }
  });

  it("Maintain Size Z 이동 후 현재 카메라 기준 겉보기 크기와 화면 좌표가 100% 보존되고, 팬 이동 시 진짜 시차가 발생한다", () => {
    let doc = createMultiplaneCameraDoc({
      id: "cam-maintain",
      viewportWidth: 800,
      viewportHeight: 600,
      focalLengthPx: 1000,
      initialCamZ: 1000,
      layers: [
        {
          id: "hero-prop",
          name: "전경 기둥",
          x: 560,
          y: 220,
          zDepth: 0,
          scaleX: 1.25,
          scaleY: 0.9,
          rotationDeg: 15,
          opacity: 1,
          visible: true,
        },
      ],
    });
    doc = setMultiplaneCameraKeyframe(doc, 0, { camX: 400, camY: 300, camZ: 1000 }, "linear");
    doc = setMultiplaneCameraKeyframe(doc, 10, { camX: 500, camY: 300, camZ: 1000 }, "linear");

    const beforeAt0 = evaluateMultiplaneSceneAtFrame(doc, 0).layers[0];
    const shifted = shiftDocumentLayerZMaintainSize(doc, "hero-prop", 500, 0);
    expect(shifted.result).not.toBeNull();
    expect(shifted.result?.compensationRatio).toBeCloseTo(0.5, 5);

    const afterAt0 = evaluateMultiplaneSceneAtFrame(shifted.doc, 0).layers[0];
    expect(afterAt0?.screenX).toBeCloseTo(beforeAt0?.screenX ?? 0, 5);
    expect(afterAt0?.screenY).toBeCloseTo(beforeAt0?.screenY ?? 0, 5);
    expect(afterAt0?.effectiveScaleX).toBeCloseTo(beforeAt0?.effectiveScaleX ?? 0, 5);
    expect(afterAt0?.effectiveScaleY).toBeCloseTo(beforeAt0?.effectiveScaleY ?? 0, 5);

    // 카메라가 X=+100 팬했을 때, 전경(z=500)으로 옮긴 레이어는 z=0일 때보다 2배 빠르게 화면 이동해야 한다.
    const beforeAt10 = evaluateMultiplaneSceneAtFrame(doc, 10).layers[0];
    const afterAt10 = evaluateMultiplaneSceneAtFrame(shifted.doc, 10).layers[0];
    const shiftOrig = Math.abs((beforeAt10?.screenX ?? 0) - (beforeAt0?.screenX ?? 0));
    const shiftFg = Math.abs((afterAt10?.screenX ?? 0) - (afterAt0?.screenX ?? 0));
    expect(shiftFg).toBeCloseTo(shiftOrig * 2, 4);

    // 카메라 근접 클립을 넘어서는 목표 Z는 안전하게 클램프된다.
    const camState = evaluateMultiplaneCameraAtFrame(doc, 0);
    const firstLayer = doc.layers[0];
    expect(firstLayer).toBeDefined();
    if (firstLayer) {
      const clamped = applyMaintainSizeZShift(firstLayer, 1500, camState, 10);
      expect(clamped.clampedToNearPlane).toBe(true);
      expect(clamped.appliedZDepth).toBe(990);
    }
  });

  it("세로 스크롤 패럴랙스와 보조 Top/Side 정투영 뷰를 일관되게 계산한다", () => {
    const doc = createMultiplaneCameraDoc({
      id: "cam-scroll",
      viewportWidth: 800,
      viewportHeight: 600,
      focalLengthPx: 1000,
      initialCamZ: 1000,
      layers: createSampleLayers(),
    });

    const atStart = evaluateVerticalScrollParallax(doc, 0, { scrollTravelPx: 200 });
    const atEnd = evaluateVerticalScrollParallax(doc, 1, { scrollTravelPx: 200 });

    const bgDeltaY = Math.abs((atEnd.layers[0]?.screenY ?? 0) - (atStart.layers[0]?.screenY ?? 0));
    const midDeltaY = Math.abs((atEnd.layers[1]?.screenY ?? 0) - (atStart.layers[1]?.screenY ?? 0));
    const fgDeltaY = Math.abs((atEnd.layers[2]?.screenY ?? 0) - (atStart.layers[2]?.screenY ?? 0));
    expect(fgDeltaY).toBeGreaterThan(midDeltaY);
    expect(midDeltaY).toBeGreaterThan(bgDeltaY);

    const proj = projectMultiplaneTopSideViews(doc, 0);
    expect(proj.frustumTop).toHaveLength(3);
    expect(proj.frustumSide).toHaveLength(3);
    expect(proj.layerMarkers).toHaveLength(3);
    expect(proj.layerMarkers[0]?.zDepth).toBe(-500);
    expect(proj.layerMarkers[2]?.zDepth).toBe(500);
  });
});
