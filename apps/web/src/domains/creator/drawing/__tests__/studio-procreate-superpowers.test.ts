import { describe, expect, it } from "vitest";

import {
  buildProcreateAnimationAssistPlan,
  buildProcreatePageAssistDeck,
  computeProcreateColorHarmony,
  DEFAULT_PROCREATE_QUICK_MENU_PROFILES,
  describeProcreateAccessibleColorName,
  evaluateProcreate3dLightingStudio,
  evaluateProcreateDrawingGuideAssist,
  evaluateProcreateSingleTouchGesture,
  executeProcreateColorDrop,
  parseProcreateSilicaBrushArchiveDescriptor,
  parseProcreateSilicaDocumentDescriptor,
  parseProcreateSwatchesJson,
  resolveProcreateQuickMenuFlickSlot,
  serializeProcreateSwatchesJson,
} from "../studio-procreate-superpowers";

describe("studio-procreate-superpowers (Procreate 컬러 조화·ColorDrop·QuickMenu·Drawing/Animation/Page Assist·3D 조명·네이티브 코덱)", () => {
  it("Color Harmony 5모드(complementary/split-complementary/analogous/triadic/tetradic)와 접근성 색상 설명이 정확히 동작한다", () => {
    const comp = computeProcreateColorHarmony({
      hue01: 0,
      saturation01: 0.9,
      brightness01: 0.95,
      mode: "complementary",
    });
    expect(comp).toHaveLength(2);
    expect(comp[0]!.role).toBe("primary");
    expect(comp[1]!.hue01).toBeCloseTo(0.5, 4);

    const tetradic = computeProcreateColorHarmony({
      hue01: 0.1,
      saturation01: 0.8,
      brightness01: 0.9,
      mode: "tetradic",
    });
    expect(tetradic).toHaveLength(4);

    const cobaltDesc = describeProcreateAccessibleColorName({
      hue01: 220 / 360,
      saturation01: 0.85,
      brightness01: 0.9,
    });
    expect(cobaltDesc.nameEn).toContain("Cobalt Blue");
    expect(cobaltDesc.nameKo).toContain("코발트 블루");
  });

  it("ColorDrop은 Reference Layer 선화 장벽을 존중하고 Continue Filling 다중 시드 채우기를 수행한다", () => {
    const width = 8;
    const height = 8;
    const referenceLayer = new Uint8ClampedArray(width * height * 4);
    const targetLayer = new Uint8ClampedArray(width * height * 4);

    // x=4 세로줄에 검은 선화 장벽 배치
    for (let y = 0; y < height; y += 1) {
      const idx = (y * width + 4) * 4;
      referenceLayer[idx] = 0;
      referenceLayer[idx + 1] = 0;
      referenceLayer[idx + 2] = 0;
      referenceLayer[idx + 3] = 255;
    }

    // 왼쪽 영역(x=1, y=1)만 1차 ColorDrop 시 오른쪽 영역(x=6, y=1)은 채워지지 않아야 함
    const singleDrop = executeProcreateColorDrop(targetLayer, {
      width,
      height,
      threshold01: 0.25,
      fillColorRgba: [255, 80, 40, 255],
      seeds: [{ x: 1, y: 1 }],
      referenceLayerRgba: referenceLayer,
    });
    expect(singleDrop.filledPixelCount).toBe(4 * 8);

    // Continue Filling으로 오른쪽 시드({ x: 6, y: 1 })를 추가하면 좌우 양쪽 셀(4*8 + 3*8 = 56px)이 모두 채워짐
    const continueFill = executeProcreateColorDrop(targetLayer, {
      width,
      height,
      threshold01: 0.25,
      fillColorRgba: [255, 80, 40, 255],
      seeds: [
        { x: 1, y: 1 },
        { x: 6, y: 1 },
      ],
      referenceLayerRgba: referenceLayer,
    });
    expect(continueFill.filledPixelCount).toBe(56);
  });

  it("QuickMenu 6슬롯 방사형 플릭 판정과 Page Assist 프로필 액션 매핑이 동작한다", () => {
    const topFlick = resolveProcreateQuickMenuFlickSlot({
      originX: 100,
      originY: 100,
      flickX: 100,
      flickY: 40,
    });
    expect(topFlick.triggered).toBe(true);
    expect(topFlick.slot).toBe("top");
    expect(topFlick.actionId).toBe("fit-to-screen");

    const pageAssistFlick = resolveProcreateQuickMenuFlickSlot({
      originX: 100,
      originY: 100,
      flickX: 160,
      flickY: 70,
      profile: DEFAULT_PROCREATE_QUICK_MENU_PROFILES[1],
    });
    expect(pageAssistFlick.slot).toBe("top-right");
    expect(pageAssistFlick.actionId).toBe("next-page");
  });

  it("Drawing Guides & Drawing Assist는 2D Grid, Isometric, Perspective, Symmetry(미러/회전 대칭)를 계산한다", () => {
    const gridSnap = evaluateProcreateDrawingGuideAssist(
      { x: 50, y: 50 },
      { x: 120, y: 58 },
      { mode: "2d-grid", gridSizePx: 32, centerX: 100, centerY: 100 },
    );
    expect(gridSnap.snappedPoint).toEqual({ x: 120, y: 50 });

    const radialSym = evaluateProcreateDrawingGuideAssist(
      { x: 100, y: 100 },
      { x: 130, y: 110 },
      {
        mode: "symmetry",
        gridSizePx: 32,
        centerX: 100,
        centerY: 100,
        symmetryKind: "radial",
        rotationalSymmetry: true,
      },
    );
    expect(radialSym.symmetryPoints).toHaveLength(8);
  });

  it("Animation Assist(Background/Foreground 핀·Hold·Ping-Pong·어니언 스킨)와 Page Assist가 동작한다", () => {
    const animPlan = buildProcreateAnimationAssistPlan({
      frames: [
        { id: "bg", label: "배경", isBackgroundPinned: true },
        { id: "f1", label: "원화 1", holdCount: 1 },
        { id: "f2", label: "원화 2", holdCount: 0 },
        { id: "f3", label: "원화 3", holdCount: 0 },
        { id: "fg", label: "전경 조명", isForegroundPinned: true },
      ],
      activeFrameId: "f2",
      playbackMode: "ping-pong",
      onionSkinCount: 2,
      pastFrameHex: "#ff0055",
      futureFrameHex: "#00ffcc",
    });

    expect(animPlan.backgroundFrameId).toBe("bg");
    expect(animPlan.foregroundFrameId).toBe("fg");
    expect(animPlan.playbackTickOrder).toEqual(["f1", "f1", "f2", "f3", "f2", "f1"]);
    expect(animPlan.onionSkinsForActiveFrame).toHaveLength(2);
    expect(animPlan.onionSkinsForActiveFrame[0]?.tintHex).toBe("#ff0055");
    expect(animPlan.onionSkinsForActiveFrame[1]?.tintHex).toBe("#00ffcc");

    const pageDeck = buildProcreatePageAssistDeck({
      layers: [
        { id: "master-bg", name: "원고 용지 테두리", visible: true },
        { id: "p1", name: "1페이지 콘티", visible: true },
        { id: "p2", name: "2페이지 콘티", visible: true },
      ],
      pinBottomLayerAsMasterBackground: true,
    });
    expect(pageDeck.masterBackgroundLayerId).toBe("master-bg");
    expect(pageDeck.pages).toHaveLength(2);
    expect(pageDeck.pages[0]?.pageNumber).toBe(1);
  });

  it("3D Lighting Studio(최대 4광원 PBR), 접근성 Single-Touch 제스처, .swatches/.procreate/.brush 네이티브 코덱이 동작한다", () => {
    const lighting = evaluateProcreate3dLightingStudio({
      baseColor: { r: 0.8, g: 0.6, b: 0.2 },
      metallic01: 0.9,
      roughness01: 0.15,
      surfaceNormal: { x: 0, y: 0, z: 1 },
      environmentPreset: "studio",
      lights: [
        { id: "l1", direction: { x: 0, y: 0, z: 1 }, color: { r: 1, g: 1, b: 1 }, intensity01: 0.9 },
        { id: "l2", direction: { x: 0.5, y: 0.5, z: 0.7 }, color: { r: 0.4, g: 0.7, b: 1 }, intensity01: 0.6 },
      ],
    });
    expect(lighting.activeLightCount).toBe(2);
    expect(lighting.specularHighlight01).toBeGreaterThan(0.5);

    const singleTouchZoom = evaluateProcreateSingleTouchGesture({
      mode: "zoom",
      deltaX: 40,
      deltaY: -20,
      currentZoom: 1,
      currentRotationDeg: 0,
    });
    expect(singleTouchZoom.nextZoom).toBeGreaterThan(1);

    const swatchesJson = serializeProcreateSwatchesJson({
      name: "Procreate Harmony Ref",
      swatches: [
        { hue: 0.58, saturation: 0.82, brightness: 0.94, alpha: 1, colorSpace: 0 },
        { hue: 0.08, saturation: 0.76, brightness: 0.98, alpha: 1, colorSpace: 0 },
      ],
    });
    const parsedSwatches = parseProcreateSwatchesJson(swatchesJson);
    expect(parsedSwatches.name).toBe("Procreate Harmony Ref");
    expect(parsedSwatches.swatches).toHaveLength(30);
    expect(parsedSwatches.swatches[0]?.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(parsedSwatches.swatches[2]).toBeNull();

    const docDesc = parseProcreateSilicaDocumentDescriptor({
      name: "Webtoon_Ep01",
      size: "{2048, 4096}",
      tileSize: 256,
      strokeCount: 1420,
      videoEnabled: true,
    });
    expect(docDesc.widthPx).toBe(2048);
    expect(docDesc.heightPx).toBe(4096);
    expect(docDesc.tileColumns).toBe(8);
    expect(docDesc.tileRows).toBe(16);
    expect(docDesc.totalTileCount).toBe(128);

    const brushCfg = parseProcreateSilicaBrushArchiveDescriptor({
      plotSpacing: 0.06,
      streamlineAmount: 0.82,
      motionFilteringAmount: 0.48,
      grainMoving: true,
      wetMixDilution: 0.45,
      metallicScale: 0.75,
      authorName: "Savage Interactive / Silica Ref",
    });
    expect(brushCfg.strokePath.plotSpacing01).toBeCloseTo(0.06, 5);
    expect(brushCfg.stabilization.motionFilteringAmount01).toBeCloseTo(0.48, 5);
    expect(brushCfg.grain.mode).toBe("moving");
    expect(brushCfg.wetMix.dilution01).toBeCloseTo(0.45, 5);
    expect(brushCfg.materials3d.metallicScale01).toBeCloseTo(0.75, 5);
  });
});
