import { describe, expect, it } from "vitest";
import {
  analyzeCharacterContinuityDrift,
  applyDocumentConflictResolutions,
  applyOklchCorrectionToRegion,
  auditAndSoftProofRgbaBuffer,
  buildCbzArchivePackage,
  buildEpub3ManifestPackage,
  buildPdfX4PrintPackage,
  computeOklchDeltaE,
  DualJournalSessionRestorer,
  InMemoryDualJournalStorage,
  inspectClipboardAssetProvenance,
  oklchToSrgb,
  packageForPublishTarget,
  PLATFORM_PUBLISH_SPECS,
  resolveStudioDocumentConflict,
  runPublishPreflightGate,
  srgbToOklch,
  srgbToPrintCmyk,
  StylusBiometricInkProfiler,
  ThermalBatteryAdaptivePacer,
  ZeroTrustKeyVault,
  type CharacterReferenceSheet,
  type ManuscriptSliceInput,
  type PublishRightsBom,
  type RgbaImageSurface,
  type StudioDocumentSnapshot,
  type StylusPointSample,
  type StylusStrokeSample,
} from "./index";

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8");

function createSolidRgba(w: number, h: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

function paintRect(s: RgbaImageSurface, x0: number, y0: number, w: number, h: number, r: number, g: number, b: number): void {
  for (let y = y0; y < Math.min(s.height, y0 + h); y += 1) {
    for (let x = x0; x < Math.min(s.width, x0 + w); x += 1) {
      const idx = (y * s.width + x) * 4;
      s.rgba[idx] = r;
      s.rgba[idx + 1] = g;
      s.rgba[idx + 2] = b;
      s.rgba[idx + 3] = 255;
    }
  }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < parts.length; i += 1) total += parts[i].length;
  const out = new Uint8Array(total);
  let off = 0;
  for (let i = 0; i < parts.length; i += 1) {
    out.set(parts[i], off);
    off += parts[i].length;
  }
  return out;
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  new DataView(chunk.buffer).setUint32(0, data.length, false);
  for (let i = 0; i < 4; i += 1) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  return chunk;
}

function buildTestPng(chunks: readonly { readonly type: string; readonly data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (let i = 0; i < chunks.length; i += 1) parts.push(buildPngChunk(chunks[i].type, chunks[i].data));
  parts.push(buildPngChunk("IEND", new Uint8Array(0)));
  return concatBytes(parts);
}

function encodePngText(keyword: string, value: string): Uint8Array {
  return concatBytes([UTF8_ENCODER.encode(keyword), new Uint8Array([0]), UTF8_ENCODER.encode(value)]);
}

function encodePngITxt(keyword: string, value: string): Uint8Array {
  return concatBytes([UTF8_ENCODER.encode(keyword), new Uint8Array([0, 0, 0, 0, 0]), UTF8_ENCODER.encode(value)]);
}

function buildTestJpeg(segments: readonly { readonly marker: number; readonly payload: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  for (let i = 0; i < segments.length; i += 1) {
    const h = new Uint8Array(4);
    h[0] = 0xff;
    h[1] = segments[i].marker;
    new DataView(h.buffer).setUint16(2, segments[i].payload.length + 2, false);
    parts.push(h, segments[i].payload);
  }
  parts.push(new Uint8Array([0xff, 0xd9]));
  return concatBytes(parts);
}

function buildTestWebp(chunks: readonly { readonly fourCc: string; readonly payload: Uint8Array }[]): Uint8Array {
  const bodyParts: Uint8Array[] = [UTF8_ENCODER.encode("WEBP")];
  for (let i = 0; i < chunks.length; i += 1) {
    const h = new Uint8Array(8);
    for (let c = 0; c < 4; c += 1) h[c] = chunks[i].fourCc.charCodeAt(c);
    new DataView(h.buffer).setUint32(4, chunks[i].payload.length, true);
    bodyParts.push(h, chunks[i].payload);
    if (chunks[i].payload.length % 2 === 1) bodyParts.push(new Uint8Array([0]));
  }
  const body = concatBytes(bodyParts);
  const riff = new Uint8Array(8);
  riff.set(UTF8_ENCODER.encode("RIFF"), 0);
  new DataView(riff.buffer).setUint32(4, body.length, true);
  return concatBytes([riff, body]);
}

function createValidRightsBom(): PublishRightsBom {
  return {
    workId: "work-starlight-01",
    episodeId: "ep-012",
    title: "별빛 아틀리에 12화",
    language: "ko",
    publisherName: "ToonStudio Local Press",
    generatedAtIso: "2026-11-26T10:00:00Z",
    royaltySplits: [
      { creatorId: "creator-a", displayName: "김서연", role: "art", sharePercent: 70 },
      { creatorId: "creator-b", displayName: "박지훈", role: "story", sharePercent: 30 },
    ],
    assets: [
      {
        assetId: "font-pretendard",
        name: "Pretendard Variable",
        kind: "font",
        licenseCode: "OFL-1.1",
        commercialAllowed: true,
        attributionRequired: false,
      },
    ],
  };
}

function synthesizeStrokes(params: {
  readonly prefix: string;
  readonly count: number;
  readonly basePressure: number;
  readonly pressureAmp: number;
  readonly speedPxPerSec: number;
  readonly jitterAmp: number;
  readonly tiltXDeg: number;
  readonly tiltYDeg: number;
  readonly curveRad: number;
  readonly seedOffset: number;
}): StylusStrokeSample[] {
  const strokes: StylusStrokeSample[] = [];
  for (let s = 0; s < params.count; s += 1) {
    const points: StylusPointSample[] = [];
    let x = 40;
    let y = 80 + s * 14;
    let angle = 0.15;
    for (let i = 0; i < 32; i += 1) {
      const t = i / 31;
      const noise = Math.sin((i + 1) * 1.7 + (s + params.seedOffset) * 3.1);
      const speed = params.speedPxPerSec * (0.85 + 0.3 * Math.sin(t * Math.PI) + params.jitterAmp * noise);
      const dist = Math.max(0.4, (speed * 10) / 1000);
      angle += params.curveRad * (1 + 0.15 * noise);
      x += Math.cos(angle) * dist;
      y += Math.sin(angle) * dist;
      const env = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
      points.push({
        x,
        y,
        timestampMs: i * 10,
        pressure: Math.min(1, Math.max(0.05, params.basePressure * (0.25 + 0.75 * env) + params.pressureAmp * Math.sin(t * Math.PI * 2) * 0.2)),
        tiltXDeg: params.tiltXDeg + noise * 1.6,
        tiltYDeg: params.tiltYDeg + Math.cos(i * 0.8 + s) * 1.4,
      });
    }
    strokes.push({ strokeId: `${params.prefix}-${s + 1}`, points });
  }
  return strokes;
}

describe("CMYK PDF/X-4 · EPUB3/CBZ · 플랫폼 규격 패키저 및 프리플라이트 게이트", () => {
  it("네이버(690/800)·카카오(720)·라인(800x1280)·타파스(940) 규격 위반을 차단하고 정상 원고를 ₩0 패키징한다", () => {
    expect(PLATFORM_PUBLISH_SPECS["naver-webtoon-690"].requiredWidthPx).toBe(690);
    expect(PLATFORM_PUBLISH_SPECS["naver-webtoon-800"].requiredWidthPx).toBe(800);
    expect(PLATFORM_PUBLISH_SPECS["kakaopage-720"].requiredWidthPx).toBe(720);
    expect(PLATFORM_PUBLISH_SPECS["line-webtoon-global-800x1280"].maxSliceHeightPx).toBe(1280);
    expect(PLATFORM_PUBLISH_SPECS["tapas-940"].requiredWidthPx).toBe(940);

    const blocked = packageForPublishTarget({
      specId: "line-webtoon-global-800x1280",
      slices: [{ sliceId: "c1", fileName: "c1.webp", widthPx: 720, heightPx: 1800, format: "webp", byteLength: 3 * 1024 * 1024 }],
      rightsBom: createValidRightsBom(),
    });
    expect(blocked.preflight.passed).toBe(false);
    expect(blocked.artifact).toBeNull();
    expect(blocked.serverCostKrw).toBe(0);
    expect(blocked.preflight.blockingIssues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["unsupported-format", "width-mismatch", "slice-height-exceeded", "slice-bytes-exceeded"]),
    );

    const naverOk = packageForPublishTarget({
      specId: "naver-webtoon-800",
      slices: [{ sliceId: "c1", fileName: "ep12-001.jpg", widthPx: 800, heightPx: 1400, format: "jpg", byteLength: 420_000 }],
      rightsBom: createValidRightsBom(),
    });
    const kakaoOk = packageForPublishTarget({
      specId: "kakaopage-720",
      slices: [{ sliceId: "c1", fileName: "ep12-001.png", widthPx: 720, heightPx: 1800, format: "png", byteLength: 520_000 }],
      rightsBom: createValidRightsBom(),
    });
    const tapasOk = packageForPublishTarget({
      specId: "tapas-940",
      slices: [{ sliceId: "c1", fileName: "ep12-001.jpg", widthPx: 940, heightPx: 3200, format: "jpg", byteLength: 640_000 }],
      rightsBom: createValidRightsBom(),
    });
    expect(naverOk.preflight.passed && kakaoOk.preflight.passed && tapasOk.preflight.passed).toBe(true);
    expect(naverOk.artifact?.kind).toBe("webtoon-scroll");
    expect(naverOk.artifact?.rightsBomJson).toContain('"sharePercent": 70');
  });

  it("인쇄 CMYK PDF/X-4의 DPI·3mm 도련·TAC 300% 초과·라이선스 위반을 검출하고 소프트프루핑 패키지를 생성한다", () => {
    const overInkRgba = createSolidRgba(16, 16, 0, 0, 0);
    const overSample = srgbToPrintCmyk(0, 0, 0, { maxTacPercent: 300, gcrStrength: 0.2 });
    expect(overSample.exceededTac).toBe(true);
    expect(overSample.rawTacPercent).toBeGreaterThan(300);
    expect(overSample.clampedTacPercent).toBeLessThanOrEqual(300.001);

    const badBom: PublishRightsBom = {
      ...createValidRightsBom(),
      royaltySplits: [{ creatorId: "c1", displayName: "김서연", role: "art", sharePercent: 85 }],
      assets: [{ assetId: "nc", name: "비상업 브러시", kind: "brush", licenseCode: "CC-BY-NC-4.0", commercialAllowed: false, attributionRequired: true }],
    };
    const failReport = runPublishPreflightGate({
      specId: "print-book-cmyk-pdfx4",
      gcrStrength: 0.2,
      slices: [{ sliceId: "p1", fileName: "p1.png", widthPx: 16, heightPx: 16, format: "png", byteLength: 4096, dpi: 150, bleedMm: 1.5, rgba: overInkRgba }],
      rightsBom: badBom,
    });
    expect(failReport.passed).toBe(false);
    expect(failReport.blockingIssues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["dpi-too-low", "bleed-too-narrow", "tac-limit-exceeded", "royalty-split-sum-invalid", "rights-commercial-blocked"]),
    );

    const safeRgba = createSolidRgba(16, 16, 110, 150, 210);
    const softProof = auditAndSoftProofRgbaBuffer(safeRgba, 16, 16, { paperProfile: "uncoated-book", maxTacPercent: 300 });
    expect(softProof.overLimitPixelCount).toBe(0);
    expect(softProof.softProofRgba[0]).not.toBe(safeRgba[0]);

    const pdfPkg = buildPdfX4PrintPackage({
      specId: "print-book-cmyk-pdfx4",
      paperProfile: "japan-color-2001-coated",
      slices: [{ sliceId: "p1", fileName: "p1.png", widthPx: 16, heightPx: 16, format: "png", byteLength: 10240, dpi: 300, bleedMm: 3, trimWidthMm: 148, trimHeightMm: 210, rgba: safeRgba }],
      rightsBom: createValidRightsBom(),
    });
    const pdfText = UTF8_DECODER.decode(pdfPkg.pdfBytes);
    expect(pdfText.indexOf("%PDF-1.6")).toBe(0);
    expect(pdfText).toContain('GTS_PDFXVersion="PDF/X-4"');
    expect(pdfText).toContain("/TrimBox");
    expect(pdfText).toContain("/BleedBox");
    expect(pdfText).toContain("/OutputIntents");
    expect(pdfPkg.pages[0].cropMarksPt).toHaveLength(8);
    expect(pdfPkg.pages[0].registrationMarksPt).toHaveLength(4);
    expect(pdfPkg.pages[0].softProofAudit?.maxObservedRawTacPercent).toBeLessThanOrEqual(300);
    expect(pdfPkg.serverCostKrw).toBe(0);
  });

  it("EPUB3 고정 레이아웃과 CBZ 아카이브(ZIP 바이트 · Rights BOM 포함)를 로컬 생성한다", () => {
    const slices: ManuscriptSliceInput[] = [
      { sliceId: "p1", fileName: "001.jpg", widthPx: 800, heightPx: 1200, format: "jpg", byteLength: 64, dpi: 300, rawBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
      { sliceId: "p2", fileName: "002.jpg", widthPx: 800, heightPx: 1200, format: "jpg", byteLength: 64, dpi: 300, rawBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    ];
    const epub = buildEpub3ManifestPackage({ specId: "epub3-fixed-layout", readingDirection: "rtl", slices, rightsBom: createValidRightsBom() });
    expect(epub.opfXml).toContain("rendition:layout");
    expect(epub.opfXml).toContain('page-progression-direction="rtl"');
    expect(epub.navXhtml).toContain("pages/page-001.xhtml");
    expect([epub.archiveBytes[0], epub.archiveBytes[1]]).toEqual([0x50, 0x4b]);
    expect(epub.entries.some((e) => e.path === "OEBPS/meta/rights-bom.json")).toBe(true);

    const cbz = buildCbzArchivePackage({ specId: "cbz-comic-archive", slices, rightsBom: createValidRightsBom() });
    expect(cbz.comicInfoXml).toContain("<PageCount>2</PageCount>");
    expect(cbz.entries.map((e) => e.path)).toEqual(["ComicInfo.xml", "rights-bom.json", "001.jpg", "002.jpg"]);
    expect([cbz.archiveBytes[0], cbz.archiveBytes[1]]).toEqual([0x50, 0x4b]);
  });
});

describe("제로 토큰 캐릭터 연속성 Diff 디버거 및 클립보드 출처·저작권 가드", () => {
  it("OKLCH 왕복 변환을 보존하고 0토큰으로 머리색/소품 비율 이탈 핀과 원클릭 보정 델타를 생성한다", () => {
    const back = oklchToSrgb(srgbToOklch(64, 108, 198));
    expect(Math.abs(back.r - 64) <= 1 && Math.abs(back.g - 108) <= 1 && Math.abs(back.b - 198) <= 1).toBe(true);

    const refSurface: RgbaImageSurface = { width: 64, height: 64, rgba: createSolidRgba(64, 64, 245, 245, 245) };
    paintRect(refSurface, 4, 4, 24, 20, 48, 92, 186);
    paintRect(refSurface, 4, 28, 16, 12, 42, 168, 118);
    paintRect(refSurface, 36, 10, 16, 16, 212, 174, 58);

    const refSheet: CharacterReferenceSheet = {
      characterId: "char-harin",
      characterName: "하린",
      surface: refSurface,
      regions: [
        { regionId: "hair", labelKo: "머리카락", role: "hair", referenceBox: { x: 4, y: 4, width: 24, height: 20 } },
        { regionId: "eyes", labelKo: "눈동자", role: "eyes", referenceBox: { x: 4, y: 28, width: 16, height: 12 } },
        { regionId: "brooch", labelKo: "별빛 브로치", role: "prop", referenceBox: { x: 36, y: 10, width: 16, height: 16 } },
      ],
    };

    const cutSurface: RgbaImageSurface = { width: 80, height: 80, rgba: createSolidRgba(80, 80, 245, 245, 245) };
    paintRect(cutSurface, 10, 8, 24, 20, 142, 62, 168); // 보라색으로 이탈
    paintRect(cutSurface, 10, 8, 24, 2, 12, 12, 12); // 검은 먹선(자동 필터링)
    paintRect(cutSurface, 10, 34, 16, 12, 43, 167, 119); // 눈동자 정상
    paintRect(cutSurface, 40, 20, 32, 16, 212, 174, 58); // 브로치 종횡비 2:1 이탈

    const report = analyzeCharacterContinuityDrift({
      episodeId: "ep-15",
      cutId: "cut-04",
      cutSurface,
      referenceSheet: refSheet,
      targets: [
        { regionId: "hair", box: { x: 10, y: 8, width: 24, height: 20 } },
        { regionId: "eyes", box: { x: 10, y: 34, width: 16, height: 12 } },
        { regionId: "brooch", box: { x: 40, y: 20, width: 32, height: 16 } },
      ],
    });
    expect(report.aiTokensUsed).toBe(0);
    expect(report.passed).toBe(false);
    expect(report.warningPins).toHaveLength(2);

    const hairPin = report.warningPins.find((p) => p.regionId === "hair");
    const broochPin = report.warningPins.find((p) => p.regionId === "brooch");
    expect(hairPin?.canvasX).toBe(22);
    expect(hairPin?.canvasY).toBe(18);
    expect(broochPin?.aspectRatioDriftPercent).toBeGreaterThanOrEqual(99);

    if (!hairPin) throw new Error("hairPin expected");
    const correctedRgba = applyOklchCorrectionToRegion(cutSurface, { x: 10, y: 8, width: 24, height: 20 }, hairPin.correctionDelta);
    const recheck = analyzeCharacterContinuityDrift({
      episodeId: "ep-15",
      cutId: "cut-04",
      cutSurface: { width: 80, height: 80, rgba: correctedRgba },
      referenceSheet: refSheet,
      targets: [{ regionId: "hair", box: { x: 10, y: 8, width: 24, height: 20 } }],
    });
    expect(recheck.passed).toBe(true);
    expect(computeOklchDeltaE(recheck.regionDiffs[0].referenceOklch, recheck.regionDiffs[0].observedOklch)).toBeLessThan(0.025);
  });

  it("PNG·JPEG·WebP의 XMP/EXIF/C2PA/DoNotTrain/상업 제한/창작자 다이제스트 불일치를 사전 차단한다", () => {
    const cleanPng = buildTestPng([
      { type: "tEXt", data: encodePngText("Author", "Studio Harin") },
      { type: "tEXt", data: encodePngText("License", "CC-BY-4.0 Commercial Allowed") },
      { type: "iTXt", data: encodePngITxt("toonstudio:creator-digest", "digest-harin-2026") },
    ]);
    const cleanReport = inspectClipboardAssetProvenance(cleanPng, {
      commercialProject: true,
      expectedCreatorDigest: "digest-harin-2026",
    });
    expect(cleanReport.format).toBe("png");
    expect(cleanReport.decision).toBe("allow");
    expect(cleanReport.safeToIngest).toBe(true);

    const xmp =
      `http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:RDF>` +
      `<dc:creator>External</dc:creator><dc:rights>CC-BY-NC Non-Commercial</dc:rights>` +
      `<plus:DataMining>http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED</plus:DataMining>` +
      `<toonstudio:creator-digest>other-digest-999</toonstudio:creator-digest></rdf:RDF></x:xmpmeta>`;
    const riskyJpeg = buildTestJpeg([
      { marker: 0xe1, payload: UTF8_ENCODER.encode(xmp) },
      { marker: 0xeb, payload: UTF8_ENCODER.encode("jumb:urn:c2pa:c2pa.training-mining:notAllowed") },
    ]);
    const jpegReport = inspectClipboardAssetProvenance(riskyJpeg, {
      commercialProject: true,
      respectDoNotTrain: true,
      expectedCreatorDigest: "digest-harin-2026",
    });
    expect(jpegReport.decision).toBe("block");
    expect(jpegReport.parsedMetadata.c2paManifestDetected).toBe(true);
    expect(jpegReport.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["do-not-train-prohibited", "restricted-commercial-use", "creator-digest-mismatch"]),
    );

    const unattributedWebp = buildTestWebp([
      { fourCc: "XMP ", payload: UTF8_ENCODER.encode("<x:xmpmeta><dc:title>No License</dc:title></x:xmpmeta>") },
    ]);
    const webpReport = inspectClipboardAssetProvenance(unattributedWebp, {
      requireLicenseAttribution: true,
      blockOnMissingAttribution: true,
    });
    expect(webpReport.decision).toBe("block");
    expect(webpReport.findings.some((f) => f.code === "missing-license-attribution")).toBe(true);

    const unknownReport = inspectClipboardAssetProvenance(new Uint8Array([1, 2, 3, 4]));
    expect(unknownReport.decision).toBe("block");
    expect(unknownReport.findings[0].code).toBe("unrecognized-binary-format");
  });
});

describe("열/배터리 프레임 페이서 · A/B 이중 저널 즉시 복구 · 비추출 키 볼트", () => {
  it("프레임 드리프트와 발열/저전력 신호로 VRS·SVT·XPBD 프로파일을 단계 하향하고 냉각 후 복구한다", () => {
    const pacer = new ThermalBatteryAdaptivePacer({
      initialProfileId: "ultra-120hz",
      windowSize: 10,
      stepDownStreakRequired: 2,
      stepUpStreakRequired: 6,
    });
    const profiles: string[] = [pacer.getCurrentProfile().id];
    const vrs: string[] = [pacer.getCurrentProfile().vrsTileRate];
    const xpbd: number[] = [pacer.getCurrentProfile().xpbdSubsteps];
    const mip: number[] = [pacer.getCurrentProfile().svtMipBias];
    let predicted = false;

    for (let i = 0; i < 24; i += 1) {
      const d = pacer.recordFrame({
        frameTimeMs: 9.5 + i * 0.9,
        batteryLevel: i > 14 ? 0.12 : 0.45,
        charging: false,
        lowPowerMode: i > 14,
        thermalState: i > 16 ? "critical" : i > 8 ? "serious" : "fair",
      });
      if (d.predictedThrottling) predicted = true;
      if (d.transitioned) {
        profiles.push(d.profileId);
        vrs.push(d.vrsTileRate);
        xpbd.push(d.xpbdSubsteps);
        mip.push(d.svtMipBias);
      }
    }
    expect(predicted).toBe(true);
    expect(profiles).toEqual(["ultra-120hz", "balanced-90hz", "cool-60hz", "battery-saver-45hz"]);
    expect(vrs).toEqual(["1x1", "2x1", "2x2", "4x2"]);
    expect(mip).toEqual([0, 0.5, 1, 1.75]);
    expect(xpbd).toEqual([8, 6, 4, 2]);

    let steppedUp = false;
    for (let i = 0; i < 20; i += 1) {
      if (pacer.recordFrame({ frameTimeMs: 5.2, batteryLevel: 0.88, charging: true, lowPowerMode: false, thermalState: "nominal" }).direction === "step-up") {
        steppedUp = true;
      }
    }
    expect(steppedUp).toBe(true);
    expect(pacer.getCurrentProfile().tierIndex).toBeLessThan(3);
  });

  it("Journal B 손상(비트 반전·절단) 시 유효한 Journal A로 50ms 미만 자동 폴백 복구한다", () => {
    interface SessionState {
      readonly episodeId: string;
      readonly activeLayerId: string;
      readonly strokes: number;
    }
    const storage = new InMemoryDualJournalStorage();
    const restorer = new DualJournalSessionRestorer<SessionState>(storage);

    const slots = [
      restorer.commitSnapshot({ episodeId: "ep-12", activeLayerId: "ink-1", strokes: 120 }, 1000).slot,
      restorer.commitSnapshot({ episodeId: "ep-12", activeLayerId: "ink-1", strokes: 145 }, 2000).slot,
      restorer.commitSnapshot({ episodeId: "ep-12", activeLayerId: "color-2", strokes: 188 }, 3000).slot,
      restorer.commitSnapshot({ episodeId: "ep-12", activeLayerId: "color-2", strokes: 205 }, 4000).slot,
    ];
    expect(slots).toEqual(["A", "B", "A", "B"]);

    const slotB = storage.readSlot("B");
    if (!slotB) throw new Error("slotB expected");
    slotB[slotB.length - 8] ^= 0xff;
    storage.writeSlot("B", slotB);

    const fresh = new DualJournalSessionRestorer<SessionState>(storage);
    const recovered = fresh.restoreLatestValidSnapshot();
    expect(recovered.restored).toBe(true);
    expect(recovered.restoredSlot).toBe("A");
    expect(recovered.sequenceNumber).toBe(3);
    expect(recovered.state).toEqual({ episodeId: "ep-12", activeLayerId: "color-2", strokes: 188 });
    expect(recovered.recoveredFromFallback).toBe(true);
    expect(recovered.corruptedSlots).toEqual(["B"]);
    expect(recovered.restoreDurationMs).toBeLessThan(process.env.CI ? 250 : 50);

    storage.writeSlot("B", slotB.subarray(0, 20));
    const torn = fresh.restoreLatestValidSnapshot();
    expect(torn.restored && torn.restoredSlot === "A").toBe(true);
  });

  it("WebCrypto extractable=false AES-GCM/ECDSA 키 격리와 원시 키 추출 차단을 증명한다", async () => {
    const vault = new ZeroTrustKeyVault();
    const aesAudit = await vault.createSessionAesKey("session-aes-main");
    const signResult = await vault.createSigningKeyPair("creator-ecdsa-main");
    expect(aesAudit.extractable).toBe(false);
    expect(signResult.audit.extractable).toBe(false);
    expect(signResult.publicKeyJwk.kty).toBe("EC");

    expect(await vault.verifyKeyNonExtractable("session-aes-main")).toEqual({ extractable: false, exportBlockedByRuntime: true });
    expect(await vault.verifyKeyNonExtractable("creator-ecdsa-main")).toEqual({ extractable: false, exportBlockedByRuntime: true });

    const unsafeKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    expect(() => vault.registerExternalAesKey("bad-key", unsafeKey)).toThrow();

    const plaintext = UTF8_ENCODER.encode("ToonStudio Local Encrypted Draft #12");
    const aad = UTF8_ENCODER.encode("work:starlight:ep12");
    const envelope = await vault.encryptPayload("session-aes-main", plaintext, aad);
    expect(UTF8_DECODER.decode(await vault.decryptPayload(envelope, aad))).toBe("ToonStudio Local Encrypted Draft #12");
    await expect(vault.decryptPayload(envelope, UTF8_ENCODER.encode("wrong-aad"))).rejects.toThrow();

    const sig = await vault.signPayload("creator-ecdsa-main", plaintext);
    expect(await vault.verifyPayload("creator-ecdsa-main", plaintext, sig)).toBe(true);
    const tampered = plaintext.slice();
    tampered[0] ^= 0x01;
    expect(await vault.verifyPayload("creator-ecdsa-main", tampered, sig)).toBe(false);
  });
});

describe("온디바이스 스타일러스 생체 필압 진위 판별 및 3-Way 문서 충돌 해결기", () => {
  it("동일 작가 필적은 본인(authentic)으로 승인하고 사칭 필적은 imposter-suspected로 거부한다", () => {
    const profiler = new StylusBiometricInkProfiler();
    const template = profiler.enrollCreator(
      "creator-seoyeon",
      synthesizeStrokes({ prefix: "enroll", count: 10, basePressure: 0.62, pressureAmp: 0.14, speedPxPerSec: 540, jitterAmp: 0.04, tiltXDeg: 26, tiltYDeg: 14, curveRad: 0.032, seedOffset: 1 }),
    );
    expect(template.enrolledStrokeCount).toBe(10);
    expect(template.privacyMode).toBe("local-only-statistical-template");

    const selfResult = profiler.verifyInkAuthorship(
      template,
      synthesizeStrokes({ prefix: "self", count: 6, basePressure: 0.63, pressureAmp: 0.15, speedPxPerSec: 555, jitterAmp: 0.045, tiltXDeg: 27, tiltYDeg: 13.5, curveRad: 0.034, seedOffset: 42 }),
    );
    expect(selfResult.verdict).toBe("authentic");
    expect(selfResult.verified).toBe(true);
    expect(selfResult.cosineSimilarity).toBeGreaterThanOrEqual(0.95);
    expect(selfResult.mahalanobisDistance).toBeLessThan(1.8);

    const imposterResult = profiler.verifyInkAuthorship(
      template,
      synthesizeStrokes({ prefix: "imp", count: 6, basePressure: 0.94, pressureAmp: 0.55, speedPxPerSec: 170, jitterAmp: 0.35, tiltXDeg: -42, tiltYDeg: 38, curveRad: 0.16, seedOffset: 99 }),
    );
    expect(imposterResult.verdict).toBe("imposter-suspected");
    expect(imposterResult.verified).toBe(false);
    expect(imposterResult.mahalanobisDistance).toBeGreaterThan(3);
    expect(imposterResult.deviatingTraits.length).toBeGreaterThanOrEqual(3);
  });

  it("겹치지 않는 로컬·클라우드 편집은 필드 단위로 자동 병합하고 실제 동시 충돌만 명시적 선택지로 보고한다", () => {
    const baseDoc: StudioDocumentSnapshot = {
      documentId: "doc-ep-12",
      revision: 10,
      metadata: { title: "별빛 아틀리에 12화", episodeNumber: 12, readingDirection: "vertical-scroll", canvasWidth: 800, canvasHeight: 12800, tags: ["판타지"] },
      layers: [
        { id: "layer-ink", name: "선화", kind: "vector-ink", visible: true, locked: false, opacity: 1, blendMode: "normal", zIndex: 2, contentHash: "h-ink-1" },
        { id: "layer-bg", name: "배경 3D", kind: "3d-bg", visible: true, locked: false, opacity: 1, blendMode: "normal", zIndex: 1, contentHash: "h-bg-1" },
      ],
      balloons: [
        { id: "b-01", cutId: "cut-01", speaker: "하린", text: "오늘 마감 전까지 끝낼 수 있을까?", fontFamily: "Pretendard", fontSizePx: 20, x: 120, y: 240, width: 240, height: 90, style: "speech" },
      ],
      cameraRails: [
        { id: "rail-01", cutId: "cut-01", easing: "ease-in-out", durationMs: 1200, keyframes: [{ t: 0, x: 0, y: 0, zoom: 1, rotationDeg: 0 }, { t: 1, x: 0, y: 200, zoom: 1.15, rotationDeg: 0 }] },
      ],
    };

    const localNonOverlap: StudioDocumentSnapshot = {
      ...baseDoc,
      revision: 11,
      layers: [
        { ...baseDoc.layers[0], opacity: 0.85 },
        baseDoc.layers[1],
        { id: "layer-fx", name: "역광 글로우", kind: "fx", visible: true, locked: false, opacity: 0.6, blendMode: "screen", zIndex: 3, contentHash: "h-fx-1" },
      ],
      balloons: [{ ...baseDoc.balloons[0], text: "오늘 마감 전까지 반드시 끝낸다!" }],
    };
    const cloudNonOverlap: StudioDocumentSnapshot = {
      ...baseDoc,
      revision: 12,
      layers: [{ ...baseDoc.layers[0], name: "메인 선화 (정리본)" }, baseDoc.layers[1]],
      balloons: [{ ...baseDoc.balloons[0], x: 180, y: 260 }],
      cameraRails: [{ ...baseDoc.cameraRails[0], durationMs: 1600 }],
    };

    const cleanMerge = resolveStudioDocumentConflict(baseDoc, localNonOverlap, cloudNonOverlap);
    expect(cleanMerge.cleanAutoMerge).toBe(true);
    expect(cleanMerge.conflicts).toHaveLength(0);
    expect(cleanMerge.provisionalDocument.layers).toHaveLength(3);
    expect(cleanMerge.provisionalDocument.layers[0].name).toBe("메인 선화 (정리본)");
    expect(cleanMerge.provisionalDocument.layers[0].opacity).toBe(0.85);
    expect(cleanMerge.provisionalDocument.balloons[0].text).toBe("오늘 마감 전까지 반드시 끝낸다!");
    expect(cleanMerge.provisionalDocument.balloons[0].x).toBe(180);
    expect(cleanMerge.provisionalDocument.cameraRails[0].durationMs).toBe(1600);

    const localConflict: StudioDocumentSnapshot = {
      ...baseDoc,
      metadata: { ...baseDoc.metadata, title: "별빛 아틀리에 12화 (로컬 수정)" },
      layers: [baseDoc.layers[0], { ...baseDoc.layers[1], contentHash: "h-bg-local-2" }],
      balloons: [{ ...baseDoc.balloons[0], text: "로컬 대사 최종본" }],
    };
    const cloudConflict: StudioDocumentSnapshot = {
      ...baseDoc,
      metadata: { ...baseDoc.metadata, title: "별빛 아틀리에 12화 (편집자 교정)" },
      layers: [baseDoc.layers[0]],
      balloons: [{ ...baseDoc.balloons[0], text: "클라우드 편집자 교정 대사" }],
    };

    const conflictReport = resolveStudioDocumentConflict(baseDoc, localConflict, cloudConflict);
    expect(conflictReport.cleanAutoMerge).toBe(false);
    expect(conflictReport.conflicts).toHaveLength(3);
    expect(conflictReport.conflicts.find((c) => c.conflictId === "layers:layer-bg:*")?.kind).toBe("modify-vs-delete");

    const finalized = applyDocumentConflictResolutions(conflictReport, {
      "metadata:metadata:title": "use-cloud",
      "balloons:b-01:text": "use-local",
      "layers:layer-bg:*": "use-local",
    });
    expect(finalized.metadata.title).toBe("별빛 아틀리에 12화 (편집자 교정)");
    expect(finalized.balloons[0].text).toBe("로컬 대사 최종본");
    expect(finalized.layers.some((l) => l.id === "layer-bg" && l.contentHash === "h-bg-local-2")).toBe(true);
  });
});
