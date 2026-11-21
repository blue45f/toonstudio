import { readPsd, writePsd } from "ag-psd";
import { describe, expect, it } from "vitest";

import {
  loadStudioZeroCopyIndirectBrushRuntime,
  resolveStudioBrushBackendQualityRoute,
} from "../brush/studio-brush-backend-quality-policy";
import {
  acquireStudioWetPaperLbmWebGpuAccelerator,
  getStudioWetPaperLbmWebGpuStatus,
} from "../brush/wet-paper/studio-wet-paper-host";
import { groupPsdExportLayers } from "../export/studio-psd-folder-structure";
import { buildWebtoonPsdExportManifest } from "../export/studio-timelapse-and-psd-exporter";
import { createVectorLayer, createVectorStroke } from "../vector-layer/vector-layer-model";
import { exportVectorLayerToSvg } from "../vector-layer/vector-layer-svg-export";
import { replaceVectorBrushShape } from "../vector-layer/vector-stroke-edit";

import {
  attachKoreanParticle,
  buildSpeechBubbleTailBooleanUnion,
  formatKoreanBubbleLines,
  koreanTailSyllableHasBatchim,
  speechBubbleBooleanPolygonsToSvgPath,
} from "./studio-korean-bubble-boolean-typesetting";

describe("AC-003 CSP 4.0+ Native Browser Capabilities & (A-1) Connected Engines", () => {
  it("swaps vector layer stroke brush shape live while preserving control points and updating SVG", () => {
    const stroke = createVectorStroke({
      id: "vec-stroke-1",
      segments: [
        {
          p0: { x: 10, y: 20 },
          p1: { x: 40, y: 10 },
          p2: { x: 80, y: 40 },
          p3: { x: 120, y: 30 },
        },
      ],
      widths: [4, 7],
      color: "#1b1a1f",
      brushShapeId: "round",
      opacity: 1,
    });
    const layer = createVectorLayer({
      id: "vec-layer-1",
      name: "주인공 벡터 선화",
      strokes: [stroke],
    });

    const swappedStroke = replaceVectorBrushShape(stroke, "calligraphy");
    expect(swappedStroke.brushShapeId).toBe("calligraphy");
    expect(swappedStroke.segments).toEqual(stroke.segments);
    expect(swappedStroke.widths.length).toBe(stroke.widths.length);

    const swappedLayer = { ...layer, strokes: [swappedStroke] };
    const svgBefore = exportVectorLayerToSvg(layer, { width: 200, height: 100 });
    const svgAfter = exportVectorLayerToSvg(swappedLayer, { width: 200, height: 100 });
    expect(svgBefore.strokeCount).toBe(1);
    expect(svgAfter.strokeCount).toBe(1);
    expect(svgBefore.svg).toContain("<svg");
    expect(svgAfter.svg).toContain("<svg");
    expect(svgAfter.svg).not.toBe(svgBefore.svg);
  });

  it("typesets Korean speech balloon text with keep-all 어절 integrity and es-hangul particles", () => {
    expect(attachKoreanParticle("선화", "을/를")).toBe("선화를");
    expect(attachKoreanParticle("말풍선", "이/가")).toBe("말풍선이");
    expect(attachKoreanParticle("붓펜", "으로/로")).toBe("붓펜으로");
    expect(koreanTailSyllableHasBatchim("웹툰")).toBe(true);
    expect(koreanTailSyllableHasBatchim("컷")).toBe(true);
    expect(koreanTailSyllableHasBatchim("대사")).toBe(false);

    const layout = formatKoreanBubbleLines("지금 당장 옥상으로 올라와야 해!", 10);
    expect(layout.cssWordBreak).toBe("keep-all");
    expect(layout.opticalCenterOffsetRatio).toBe(-0.03);
    expect(layout.innerPaddingRatio).toBe(0.2);
    expect(layout.lines.join(" ")).toBe("지금 당장 옥상으로 올라와야 해!");
    // Every Korean 어절 stays intact (no mid-word split)
    for (const line of layout.lines) {
      expect(line).not.toMatch(/옥상$/);
      expect(line).not.toMatch(/^으로/);
    }
  });

  it("computes seamless non-destructive speech bubble + tail Boolean Union via studio-live-boolean-group", async () => {
    const unionResult = await buildSpeechBubbleTailBooleanUnion({
      x: 40,
      y: 40,
      width: 220,
      height: 120,
      tailSide: "left",
      tailXRatio: 0.35,
      tailHeight: 48,
      tailBase: 36,
      tailBend: 8,
    });

    expect(unionResult.ok).toBe(true);
    if (unionResult.ok) {
      expect(unionResult.evaluatedLeafCount).toBe(2);
      // United body + tail merges into 1 contiguous outer polygon extending down into tail tip
      expect(unionResult.polygons.length).toBe(1);
      expect(unionResult.bounds.y + unionResult.bounds.height).toBeGreaterThan(40 + 120 + 40);
      const svgPath = speechBubbleBooleanPolygonsToSvgPath(unionResult.polygons);
      expect(svgPath).toMatch(/^M[\d.-]+ [\d.-]+ L.+ Z$/);
    }
  });

  it("preserves non-destructive layer groups, clipping masks, and blend modes across real ag-psd writePsd -> readPsd roundtrip", () => {
    const plan = buildWebtoonPsdExportManifest({
      widthPx: 16,
      heightPx: 16,
      layers: [
        { id: "l-bg", name: "배경 밑색", role: "bg3d", opacity: 1, visible: true, blendMode: "normal", clippingMask: false },
        { id: "l-color", name: "캐릭터 채색", role: "color", opacity: 0.9, visible: true, blendMode: "normal", clippingMask: false },
        { id: "l-shade", name: "음영 클리핑", role: "color", opacity: 0.65, visible: true, blendMode: "multiply", clippingMask: true },
        { id: "l-line", name: "주인공 선화", role: "lineart", opacity: 1, visible: true, blendMode: "normal", clippingMask: false },
        { id: "l-sfx", name: "효과음 쿠웅", role: "sfx", opacity: 1, visible: true, blendMode: "normal", clippingMask: false },
        { id: "l-dlg", name: "대사 식자", role: "dialogue", opacity: 1, visible: true, blendMode: "normal", clippingMask: false },
      ],
    });
    expect(plan.groups.map((g) => g.groupId)).toContain("line-art");
    expect(plan.groups.map((g) => g.groupId)).toContain("dialogue-sfx");

    const groups = [
      { id: "grp-char", name: "캐릭터 폴더" },
      { id: "grp-text", name: "식자 폴더" },
    ];
    const solidPixels = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(4 * 4 * 4).fill(255),
    };
    const groupedChildren = groupPsdExportLayers(
      [
        { name: "캐릭터 밑색", blendMode: "normal", opacity: 1, imageData: solidPixels },
        { name: "음영 클리핑", blendMode: "multiply", opacity: 0.7, clipping: true, imageData: solidPixels },
        { name: "말풍선 대사", blendMode: "normal", opacity: 1, imageData: solidPixels },
      ],
      [
        { groupId: "grp-char" },
        { groupId: "grp-char" },
        { groupId: "grp-text" },
      ],
      groups,
    );

    const buffer = writePsd({
      width: 16,
      height: 16,
      children: groupedChildren,
    });
    expect(buffer.byteLength).toBeGreaterThan(0);

    const roundtripped = readPsd(buffer, { skipLayerImageData: true, skipCompositeImageData: true });
    expect(roundtripped.children).toHaveLength(2);
    const charFolder = roundtripped.children?.find((c) => c.name === "캐릭터 폴더");
    const textFolder = roundtripped.children?.find((c) => c.name === "식자 폴더");
    expect(charFolder?.children).toHaveLength(2);
    expect(textFolder?.children).toHaveLength(1);
    const shadeLayer = charFolder?.children?.find((c) => c.name === "음영 클리핑");
    expect(shadeLayer?.blendMode).toBe("multiply");
    expect(shadeLayer?.clipping).toBe(true);
  });

  it("wires (A-1) WebGPU LBM wet-paper and Zero-Copy Indirect runtimes into production route/bake hooks safely with CPU fallback", async () => {
    const wetPaperGpu = await acquireStudioWetPaperLbmWebGpuAccelerator(null, { width: 32, height: 32 });
    expect(wetPaperGpu.getStatus()).toBe("cpu-fallback");
    wetPaperGpu.dispose();
    expect(["idle", "ready", "cpu-fallback"]).toContain(getStudioWetPaperLbmWebGpuStatus());

    const routed = resolveStudioBrushBackendQualityRoute({
      brushId: "pen",
      availability: {
        "webgpu-live-causal-ink": "ready",
        "canvas2d-causal-ink": "ready",
      },
    });
    expect(routed.status).toBe("ready");
    if (routed.status === "ready") {
      expect(routed.liveBackend).toBe("webgpu-live-causal-ink");
    }

    const zeroCopyMod = await loadStudioZeroCopyIndirectBrushRuntime();
    expect(zeroCopyMod.isStudioGpuBristlePromotedBrushId("oil--impasto-ribbon")).toBe(true);
    expect(zeroCopyMod.STUDIO_ZERO_COPY_RING_SLOTS).toBe(3);
  });
});
