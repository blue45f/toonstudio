import { describe, expect, it } from "vitest";

import type { StudioImageDataLike } from "../studio-filters";

import {
  buildProceduralCubeLutText,
  createBuiltInCameraRawLutCatalog,
  createDefaultCameraRawSettings,
  demosaicBayerToImageData,
  developCameraRawImage,
  linearChannelToSrgb,
  parseAiDocumentMeta,
  parseDngHeaderMeta,
  parseSketchDocumentMeta,
  srgbChannelToLinear,
} from "./studio-camera-raw-develop";

function makeSolidImage(w: number, h: number, r: number, g: number, b: number, a = 255): StudioImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { data, width: w, height: h };
}

function makeMinimalDngBytes(width: number, height: number): Uint8Array {
  // 8B header + 2B entryCount + 7*12B entries + 4B nextIFD + 24B AsShotNeutral rationals = 122B
  const buf = new Uint8Array(128);
  const view = new DataView(buf.buffer);
  buf[0] = 0x49;
  buf[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  const entries: readonly [number, number, number, number][] = [
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, 1, 14],
    [50706, 1, 4, 0x00000401], // DNG 1.4.0.0 in little-endian bytes
    [50714, 4, 1, 512],
    [50717, 4, 1, 16383],
    [50728, 5, 3, 98], // AsShotNeutral offset
  ];
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, count, value], i) => {
    const off = 10 + i * 12;
    view.setUint16(off, tag, true);
    view.setUint16(off + 2, type, true);
    view.setUint32(off + 4, count, true);
    view.setUint32(off + 8, value, true);
  });
  // AsShotNeutral: R=0.5 (500/1000), G=1.0 (1000/1000), B=0.75 (750/1000)
  view.setUint32(98, 500, true);
  view.setUint32(102, 1000, true);
  view.setUint32(106, 1000, true);
  view.setUint32(110, 1000, true);
  view.setUint32(114, 750, true);
  view.setUint32(118, 1000, true);
  return buf;
}

describe("studio-camera-raw-develop", () => {
  it("중립 DevelopSettings에서 sRGB<->16-bit 선형 왕복과 히스토그램 집계가 정확하다", () => {
    expect(linearChannelToSrgb(srgbChannelToLinear(0.5))).toBeCloseTo(0.5, 5);
    const src = makeSolidImage(4, 4, 128, 96, 64, 255);
    const result = developCameraRawImage(src, createDefaultCameraRawSettings());

    expect(Math.abs(result.image.data[0]! - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.image.data[1]! - 96)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.image.data[2]! - 64)).toBeLessThanOrEqual(1);
    expect(result.image.data[3]).toBe(255);
    expect(result.linear16.length).toBe(4 * 4 * 4);
    expect(result.lutApplied).toBe(false);
    expect(result.histogram.luma.reduce((acc, n) => acc + n, 0)).toBe(16);
  });

  it("화이트밸런스(색온도/틴트)·노출(EV)·톤 커브가 기대 방향으로 색상을 변조한다", () => {
    const midGray = makeSolidImage(4, 4, 128, 128, 128);
    const warm = developCameraRawImage(
      midGray,
      createDefaultCameraRawSettings({ temperatureKelvin: 9500, tint: 0 }),
    );
    expect(warm.image.data[0]!).toBeGreaterThan(warm.image.data[2]!);

    const magenta = developCameraRawImage(
      midGray,
      createDefaultCameraRawSettings({ tint: 60 }),
    );
    expect(magenta.image.data[0]!).toBeGreaterThan(magenta.image.data[1]!);

    const bright = developCameraRawImage(
      midGray,
      createDefaultCameraRawSettings({ exposureEv: 1.5 }),
    );
    expect(bright.image.data[0]!).toBeGreaterThan(180);

    const curved = developCameraRawImage(
      midGray,
      createDefaultCameraRawSettings({
        toneCurve: [
          { x: 0, y: 0 },
          { x: 0.25, y: 0.6 },
          { x: 1, y: 1 },
        ],
      }),
    );
    expect(curved.image.data[0]!).toBeGreaterThan(150);
  });

  it("클래리티·디헤이즈·8색 HSL 믹서·3-휠 컬러 그레이딩·비네팅·결정적 그레인이 작동한다", () => {
    // 좌/우 명암 경계가 있는 8x8 테스트 이미지
    const edgeImg: StudioImageDataLike = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4),
    };
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const i = (y * 8 + x) * 4;
        const v = x < 4 ? 90 : 165;
        edgeImg.data[i] = v;
        edgeImg.data[i + 1] = v;
        edgeImg.data[i + 2] = v;
        edgeImg.data[i + 3] = 255;
      }
    }
    const baseClarity = developCameraRawImage(edgeImg, createDefaultCameraRawSettings());
    const boostClarity = developCameraRawImage(
      edgeImg,
      createDefaultCameraRawSettings({ clarity: 85 }),
    );
    // 경계 픽셀 (x=4, y=4) 명암 대비가 상승한다
    const idxRightEdge = (4 * 8 + 4) * 4;
    expect(boostClarity.image.data[idxRightEdge]!).toBeGreaterThan(baseClarity.image.data[idxRightEdge]!);

    // 디헤이즈: 뿌연 중회색 이미지에서 대비를 끌어내림
    const hazy = makeSolidImage(4, 4, 180, 185, 190);
    const dehazed = developCameraRawImage(hazy, createDefaultCameraRawSettings({ dehaze: 70 }));
    expect(dehazed.image.data[0]!).toBeLessThanOrEqual(hazy.data[0]!);

    // 8색 HSL: 순수 빨강의 휘도를 올리되 순수 파랑에는 영향이 없다
    const redImg = makeSolidImage(2, 2, 210, 40, 40);
    const blueImg = makeSolidImage(2, 2, 40, 60, 210);
    const redBoostSettings = createDefaultCameraRawSettings({
      hslMixer: {
        ...createDefaultCameraRawSettings().hslMixer,
        red: { hue: 0, saturation: 30, luminance: 80 },
      },
    });
    const redOut = developCameraRawImage(redImg, redBoostSettings);
    const blueOut = developCameraRawImage(blueImg, redBoostSettings);
    expect(redOut.image.data[0]!).toBeGreaterThan(210);
    expect(Math.abs(blueOut.image.data[2]! - 210)).toBeLessThanOrEqual(2);

    // 3-휠 그레이딩 + 비네팅 + 결정적 그레인
    const darkCornerTest = makeSolidImage(9, 9, 140, 140, 140);
    const graded = developCameraRawImage(
      darkCornerTest,
      createDefaultCameraRawSettings({
        colorGrading: {
          shadows: { hueDeg: 220, saturation01: 0.8, luminance: 0 },
          midtones: { hueDeg: 0, saturation01: 0, luminance: 0 },
          highlights: { hueDeg: 40, saturation01: 0.6, luminance: 0 },
          balance: 0,
        },
        vignette: { amount: -80, midpoint: 30, feather: 50 },
        grain: { amount: 40, seed: 777 },
      }),
    );
    const gradedRepeat = developCameraRawImage(
      darkCornerTest,
      createDefaultCameraRawSettings({
        colorGrading: {
          shadows: { hueDeg: 220, saturation01: 0.8, luminance: 0 },
          midtones: { hueDeg: 0, saturation01: 0, luminance: 0 },
          highlights: { hueDeg: 40, saturation01: 0.6, luminance: 0 },
          balance: 0,
        },
        vignette: { amount: -80, midpoint: 30, feather: 50 },
        grain: { amount: 40, seed: 777 },
      }),
    );
    expect(graded.image.data).toEqual(gradedRepeat.image.data);
    // 모서리 픽셀(0,0)이 중앙(4,4)보다 어둡다
    const centerIdx = (4 * 9 + 4) * 4;
    expect(graded.image.data[0]!).toBeLessThan(graded.image.data[centerIdx]!);
  });

  it("내장 .cube 3D LUT 카탈로그와 커스텀 LUT 강도 블렌딩을 적용한다", () => {
    const catalog = createBuiltInCameraRawLutCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(3);
    const golden = catalog[0]!;
    const gray = makeSolidImage(3, 3, 128, 128, 128);

    const fullLut = developCameraRawImage(
      gray,
      createDefaultCameraRawSettings({
        lut: { id: golden.id, title: golden.title, cubeText: golden.cubeText, intensity01: 1 },
      }),
    );
    expect(fullLut.lutApplied).toBe(true);
    expect(fullLut.image.data[0]!).toBeGreaterThan(fullLut.image.data[2]!);

    const identityCube = buildProceduralCubeLutText("Identity", 3, (r, g, b) => [r, g, b]);
    const idOut = developCameraRawImage(
      gray,
      createDefaultCameraRawSettings({
        lut: { id: "id", title: "Identity", cubeText: identityCube, intensity01: 1 },
      }),
    );
    expect(Math.abs(idOut.image.data[0]! - 128)).toBeLessThanOrEqual(1);
  });

  it(".sketch / .ai / DNG 메타 어댑터와 Malvar-He-Cutler 5x5 베이어 디모자이킹이 동작한다", () => {
    const sketchMeta = parseSketchDocumentMeta([
      {
        _class: "page",
        layers: [
          {
            _class: "artboard",
            do_objectID: "ab-cover",
            name: "에피소드 표지",
            frame: { x: 0, y: 0, width: 1080, height: 1440 },
            layers: [
              { _class: "shapePath", name: "배경" },
              { _class: "text", name: "타이틀" },
              { _class: "symbolInstance", name: "로고" },
            ],
          },
        ],
      },
      "malformed-entry",
    ]);
    expect(sketchMeta.ok).toBe(true);
    expect(sketchMeta.artboards).toHaveLength(1);
    expect(sketchMeta.artboards[0]!.width).toBe(1080);
    expect(sketchMeta.vectorPathCount).toBe(1);
    expect(sketchMeta.textLayerCount).toBe(1);
    expect(sketchMeta.symbolInstanceCount).toBe(1);
    expect(sketchMeta.warnings).toHaveLength(1);

    const aiMeta = parseAiDocumentMeta(
      [
        "%PDF-1.6",
        "%%Creator: Adobe Illustrator 29.0",
        "/ArtBox [0 0 595.28 841.89]",
        "<< /Type /OCG /Name (LineArt) >>",
        "<< /Type /OCG /Name (ColorFlat) >>",
        "10 20 m 100 20 l 100 120 l",
      ].join("\n"),
    );
    expect(aiMeta.ok).toBe(true);
    expect(aiMeta.hasPdfCompatibleStream).toBe(true);
    expect(aiMeta.artboardBoxPt).toEqual([0, 0, 595.28, 841.89]);
    expect(aiMeta.layerNames).toEqual(["LineArt", "ColorFlat"]);
    expect(aiMeta.vectorCommandCount).toBe(3);

    const legacyAi = parseAiDocumentMeta("%!PS-Adobe-3.0\n%AI8_Creator");
    expect(legacyAi.ok).toBe(true);
    expect(legacyAi.hasPdfCompatibleStream).toBe(false);
    expect(legacyAi.warnings.length).toBeGreaterThan(0);

    const dngMeta = parseDngHeaderMeta(makeMinimalDngBytes(4000, 3000));
    expect(dngMeta.ok).toBe(true);
    expect(dngMeta.byteOrder).toBe("little");
    expect(dngMeta.width).toBe(4000);
    expect(dngMeta.height).toBe(3000);
    expect(dngMeta.isDng).toBe(true);
    expect(dngMeta.dngVersion).toEqual([1, 4, 0, 0]);
    expect(dngMeta.blackLevel).toBe(512);
    expect(dngMeta.whiteLevel).toBe(16383);
    expect(dngMeta.suggestedTemperatureKelvin).toBeGreaterThan(6500);

    // 균일 중회색 RGGB 베이어 패턴 디모자이킹
    const raw = new Uint16Array(6 * 6).fill(8192);
    const demosaiced = demosaicBayerToImageData(raw, 6, 6, "RGGB", 0, 16383);
    const midIdx = (3 * 6 + 3) * 4;
    expect(Math.abs(demosaiced.data[midIdx]! - demosaiced.data[midIdx + 1]!)).toBeLessThanOrEqual(2);
    expect(Math.abs(demosaiced.data[midIdx + 1]! - demosaiced.data[midIdx + 2]!)).toBeLessThanOrEqual(2);
  });
});
