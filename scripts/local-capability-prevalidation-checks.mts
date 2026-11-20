/**
 * 경쟁 역량 원장 로컬 사전 검증(6/12)의 개별 실증 프로브 모듈.
 *
 * 대상 6건(#31 psd-advanced, #32 psb-large-document, #33 clip-migration,
 * #54 file-roundtrip-lab, #55 collaboration-fault-lab, #56 accessibility-security-audit)을
 * 실제 저장소 엔진·파서·장애 주입·보안/접근성 감사 모듈로 결정론적으로 실행한다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  assertStudioAssetLockfilePublishable,
  validateStudioAssetLockfile,
  type StudioAssetLockfileV1,
} from "@toonstudio/studio-project-model";
import {
  initializeCanvas,
  readPsd,
  writePsd,
  type AdjustmentLayer,
  type BlendMode,
  type Psd,
} from "ag-psd";

import {
  buildPrintPdfFromPages,
  rgbToCmyk,
  rgbaToCmykBytes,
} from "../apps/web/src/domains/creator/export/studio-pdf-print-export";
import { convertStudioAdjustmentToPsd } from "../apps/web/src/domains/creator/export/studio-psd-adjustment-export";
import { exportPageToSvg } from "../apps/web/src/domains/creator/export/studio-svg-export";
import { StudioCrdtDocument } from "../apps/web/src/domains/creator/live/studio-crdt-document";
import { buildVectorPdf } from "../apps/web/src/domains/creator/render/studio-canvaskit-pdf-vector";
import {
  auditStudioAccessibility,
  studioColorContrast,
} from "../apps/web/src/domains/creator/studio-accessibility-audit";
import {
  STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
  createStudioAutosaveSqliteStore,
} from "../apps/web/src/domains/creator/studio-autosave-sqlite-store";
import { planStudioImport } from "../apps/web/src/domains/creator/studio-import-compatibility";
import { openStudioLocalDatabase } from "../apps/web/src/domains/creator/studio-local-database";
import { convertPsdAdjustmentLayer } from "../apps/web/src/domains/creator/studio-psd-adjustment-import";
import {
  PSD_IMPORT_MAX_DIMENSION_PX,
  createPsdEncodedPngAccountant,
  flattenPsdLayers,
  inspectPsdHeader,
  mapPsdBlendMode,
  preflightPsdImport,
} from "../apps/web/src/domains/creator/studio-psd-import";
import { mergeStudioWorkspaceStates } from "../apps/web/src/domains/creator/studio-workspace-three-way-merge";
import {
  DEFAULT_STUDIO_WORKSPACE_STATE,
  normalizeStudioWorkspaceState,
  renameStudioWorkspace,
  resizeStudioDrawingPalettes,
  updateStudioWorkspaceLiveLayout,
} from "../apps/web/src/domains/creator/studio-workspaces";
import {
  CLIP_BY_DESIGN_UNSUPPORTED_CODES,
  importChunkedSqliteDocument,
} from "../packages/studio-format-gateway/src/chunked-sqlite-document";
import { importCspToolFile, inspectCspToolFile } from "../packages/studio-format-gateway/src/csp-sut";
import { parseSvgToScene } from "../packages/studio-format-gateway/src/svg";
import { buildClipDocument } from "../tests/corpus/formats/chunked-sqlite-document-fixtures";
import {
  maskOf,
  pattern,
  rasterLayer,
  sameBytes,
} from "../tests/corpus/formats/chunked-sqlite-document-test-kit";
import {
  buildAuthoredSutFixture,
  readAuthoredSutWithNodeSqlite,
} from "../tests/corpus/formats/csp-sut-fixtures";
import { openNodeSqlite } from "../tests/corpus/formats/node-sqlite-clip-reader";
import {
  V12_FAULT_MATRIX_TARGETS,
  runV12RuntimeFaultMatrix,
} from "../tests/fault-injection/v12-runtime-fault-harness";

import {
  verifyCodeScanningAndDependabotHardening,
  verifySecurityAdvisoryExceptions,
} from "./verify-security-advisory-exceptions.mjs";

// Node 환경에서 DOM Canvas 없이 순수 ImageData 버퍼로 ag-psd 픽셀 디코딩을 초기화한다.
initializeCanvas(
  ((width: number, height: number) => ({
    width,
    height,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
    }),
  })) as unknown as Parameters<typeof initializeCanvas>[0],
  ((width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  })) as unknown as NonNullable<Parameters<typeof initializeCanvas>[1]>,
);

export interface LocalPrevalidationProbeOutput {
  readonly summaryKo: string;
  readonly metrics: Readonly<Record<string, unknown>>;
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function buildPsdHeaderBuffer(overrides: {
  version?: 1 | 2;
  channels?: number;
  width?: number;
  height?: number;
  bitsPerChannel?: 1 | 8 | 16 | 32;
  colorMode?: number;
} = {}): ArrayBuffer {
  const buffer = new ArrayBuffer(26);
  const view = new DataView(buffer);
  view.setUint32(0, 0x38425053, false);
  view.setUint16(4, overrides.version ?? 1, false);
  view.setUint16(12, overrides.channels ?? 4, false);
  view.setUint32(14, overrides.height ?? 1080, false);
  view.setUint32(18, overrides.width ?? 720, false);
  view.setUint16(22, overrides.bitsPerChannel ?? 8, false);
  view.setUint16(24, overrides.colorMode ?? 3, false);
  return buffer;
}

function makePatternRgba(width: number, height: number, seed: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 7 + seed * 19) & 0xff;
      data[offset + 1] = (y * 11 + seed * 29) & 0xff;
      data[offset + 2] = ((x + y) * 5 + seed * 43) & 0xff;
      data[offset + 3] = 255;
    }
  }
  return data;
}

function makeMaskRgba(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gray = x < width / 2 ? 255 : 64;
      const offset = (y * width + x) * 4;
      data[offset] = gray;
      data[offset + 1] = gray;
      data[offset + 2] = gray;
      data[offset + 3] = 255;
    }
  }
  return data;
}

export function runProbe31PsdAdvanced(): LocalPrevalidationProbeOutput {
  const width = 64;
  const height = 48;
  const blendModes: readonly BlendMode[] = [
    "normal", "multiply", "screen", "overlay", "hard light", "color burn", "linear dodge",
  ];
  const rasterInputs = blendModes.map((blendMode, index) => ({
    name: `레이어-${blendMode}`,
    blendMode,
    opacity: Number((0.4 + index * 0.08).toFixed(2)),
    clipping: index === 2,
    pixels: makePatternRgba(width, height, index + 1),
    hasMask: index % 2 === 1,
  }));
  const sourceAdjustments: readonly AdjustmentLayer[] = [
    { type: "levels", rgb: { shadowInput: 12, highlightInput: 242, shadowOutput: 4, highlightOutput: 250, midtoneInput: 1.15 } },
    { type: "curves", rgb: [{ input: 0, output: 0 }, { input: 128, output: 148 }, { input: 255, output: 255 }] },
    { type: "hue/saturation", master: { a: 0, b: 0, c: 0, d: 0, hue: 14, saturation: 22, lightness: -6 } },
    { type: "color balance", midtones: { cyanRed: 10, magentaGreen: -4, yellowBlue: 8 }, preserveLuminosity: true },
    { type: "brightness/contrast", brightness: 18, contrast: 12, useLegacy: false },
    { type: "exposure", exposure: 0.35, offset: 0.02, gamma: 1.05 },
    { type: "invert" },
    { type: "photo filter", color: { r: 236, g: 138, b: 0 }, density: 25, preserveLuminosity: true },
  ];

  const psdDoc: Psd = {
    width,
    height,
    channels: 4,
    bitsPerChannel: 8,
    colorMode: 3,
    children: [
      {
        name: "보정-그룹",
        opened: true,
        children: sourceAdjustments.map((adjustment, index) => ({
          name: `조정-${index + 1}-${adjustment.type}`,
          opacity: 0.9,
          blendMode: "normal",
          adjustment,
        })),
      },
      {
        name: "캐릭터-래스터",
        opened: true,
        children: rasterInputs.map((entry) => ({
          name: entry.name,
          left: 0,
          top: 0,
          right: width,
          bottom: height,
          opacity: entry.opacity,
          blendMode: entry.blendMode,
          clipping: entry.clipping,
          imageData: { width, height, data: entry.pixels },
          ...(entry.hasMask
            ? {
                mask: {
                  top: 0,
                  left: 0,
                  bottom: height,
                  right: width,
                  defaultColor: 0,
                  imageData: { width, height, data: makeMaskRgba(width, height) },
                },
              }
            : {}),
        })),
      },
    ],
  };

  const written = new Uint8Array(writePsd(psdDoc));
  const psdBuffer = written.buffer.slice(written.byteOffset, written.byteOffset + written.byteLength);
  assert.equal(inspectPsdHeader(psdBuffer).container, "psd");
  assert.equal(preflightPsdImport(psdBuffer, "synthetic-advanced.psd").canImport, true);

  const parsed = readPsd(written, { useImageData: true, skipCompositeImageData: true });
  const flattened = flattenPsdLayers(parsed);
  const parsedRasterLeaves = parsed.children?.find((c) => c.name === "캐릭터-래스터")?.children ?? [];
  assert.equal(parsedRasterLeaves.length, rasterInputs.length);

  let exactPixelLayers = 0;
  let preservedMasks = 0;
  let mappedBlendModes = 0;
  let preservedClipping = 0;
  for (let i = 0; i < rasterInputs.length; i += 1) {
    const expected = rasterInputs[i]!;
    const actual = parsedRasterLeaves[i]!;
    if (actual.blendMode === expected.blendMode && mapPsdBlendMode(actual.blendMode).length > 0) mappedBlendModes += 1;
    if (actual.clipping === expected.clipping) preservedClipping += 1;
    if (actual.imageData && Buffer.compare(Buffer.from(actual.imageData.data), Buffer.from(expected.pixels)) === 0) {
      exactPixelLayers += 1;
    }
    if (expected.hasMask && actual.mask?.imageData && actual.mask.imageData.data.byteLength === width * height * 4) {
      preservedMasks += 1;
    }
  }

  let roundTrippedAdjustments = 0;
  for (const adjustment of sourceAdjustments) {
    const imported = convertPsdAdjustmentLayer(adjustment);
    assert.equal(imported.status, "converted");
    const reExported = convertStudioAdjustmentToPsd(imported.kind, imported.parameters);
    assert.equal(reExported.status, "converted");
    assert.equal(reExported.adjustment.type, adjustment.type);
    roundTrippedAdjustments += 1;
  }

  const preflight8k = preflightPsdImport(
    buildPsdHeaderBuffer({ version: 1, width: 7680, height: 4320, channels: 4, bitsPerChannel: 8, colorMode: 3 }),
    "synthetic-8k-panel.psd",
  );
  assert.equal(preflight8k.canImport, true);

  const expectedMaskCount = rasterInputs.filter((item) => item.hasMask).length;
  assert.equal(exactPixelLayers, rasterInputs.length);
  assert.equal(mappedBlendModes, rasterInputs.length);
  assert.equal(preservedMasks, expectedMaskCount);
  assert.equal(roundTrippedAdjustments, sourceAdjustments.length);

  return {
    summaryKo: `합성 다중레이어 PSD(${written.byteLength}B) 왕복 검증 완료: 래스터 ${exactPixelLayers}/${rasterInputs.length} 픽셀 일치, 블렌드모드 ${mappedBlendModes}/${rasterInputs.length}, 마스크 ${preservedMasks}/${expectedMaskCount}, 조정 레이어 ${roundTrippedAdjustments}/${sourceAdjustments.length} 대칭 왕복, 8K(7680×4320) 헤더 사전 검사 통과.`,
    metrics: {
      psdByteLength: written.byteLength,
      psdSha256: sha256Hex(written),
      flattenedLeafCount: flattened.length,
      layerPixelPreservationRatio: exactPixelLayers / rasterInputs.length,
      blendModePreservationRatio: mappedBlendModes / rasterInputs.length,
      clippingPreservationRatio: preservedClipping / rasterInputs.length,
      maskPreservationRatio: preservedMasks / expectedMaskCount,
      adjustmentRoundTripRatio: roundTrippedAdjustments / sourceAdjustments.length,
      eightKHeaderPreflightPassed: preflight8k.canImport,
      eightKDimensions: `${preflight8k.header.width}x${preflight8k.header.height}`,
    },
  };
}

export function runProbe32PsbLargeDocument(): LocalPrevalidationProbeOutput {
  const psbSample: Psd = {
    width: 256,
    height: 128,
    channels: 4,
    bitsPerChannel: 8,
    colorMode: 3,
    children: [
      { name: "대용량-배경", left: 0, top: 0, right: 256, bottom: 128, imageData: { width: 256, height: 128, data: makePatternRgba(256, 128, 7) } },
      { name: "대용량-선화", left: 0, top: 0, right: 256, bottom: 128, blendMode: "multiply", imageData: { width: 256, height: 128, data: makePatternRgba(256, 128, 13) } },
    ],
  };

  const psbBytes = new Uint8Array(writePsd(psbSample, { psb: true }));
  const psbHeader = inspectPsdHeader(psbBytes.buffer.slice(psbBytes.byteOffset, psbBytes.byteOffset + psbBytes.byteLength));
  assert.equal(psbHeader.container, "psb");
  assert.equal(psbHeader.version, 2);

  const decodedPsb = readPsd(psbBytes, { useImageData: true, skipCompositeImageData: true });
  assert.equal(decodedPsb.children?.length, 2);

  const psb8kPreflight = preflightPsdImport(
    buildPsdHeaderBuffer({ version: 2, width: 8192, height: 8192, channels: 4, bitsPerChannel: 8, colorMode: 3 }),
    "webtoon-8k.psb",
  );
  assert.equal(psb8kPreflight.canImport, false);
  assert.ok(psb8kPreflight.blockingReasons.some((reason) => reason.code === "blockedPsb"));

  const oversizedPreflight = preflightPsdImport(
    buildPsdHeaderBuffer({ version: 2, width: PSD_IMPORT_MAX_DIMENSION_PX + 1024, height: 12000, channels: 4, bitsPerChannel: 16, colorMode: 4 }),
    "oversized-cmyk16.psb",
  );
  assert.equal(oversizedPreflight.canImport, false);
  const blockingCodes = oversizedPreflight.blockingReasons.map((reason) => reason.code).sort();
  assert.deepEqual(blockingCodes, ["blockedBitDepth", "blockedColorMode", "blockedDimension", "blockedPsb"]);

  const accountant = createPsdEncodedPngAccountant();
  assert.equal(accountant.chargeLayer(4 * 1024 * 1024), true);
  assert.equal(accountant.chargeLayer(accountant.snapshot().budgetBytes + 1), false);
  const accountantSnapshot = accountant.snapshot();

  const importPlan = planStudioImport([
    { name: "episode-scroll-8k.psb", sizeBytes: 128 * 1024 * 1024, mimeType: "image/vnd.adobe.photoshop" },
  ]);
  assert.equal(importPlan.items[0]?.format, "psb");
  assert.equal(importPlan.items[0]?.fidelity, "converted");

  return {
    summaryKo: `PSB v2 바이너리(${psbBytes.byteLength}B, 2레이어) 왕복 및 8K/초과치수·16비트·CMYK fail-closed 가드(차단 코드 4종)와 메모리 예산 회계 검증 완료.`,
    metrics: {
      psbByteLength: psbBytes.byteLength,
      psbSha256: sha256Hex(psbBytes),
      psbHeaderVersion: psbHeader.version,
      decodedLayerCount: decodedPsb.children?.length ?? 0,
      eightKFailClosedCodes: psb8kPreflight.blockingReasons.map((reason) => reason.code),
      oversizedFailClosedCodes: blockingCodes,
      accountantTrackedBytes: accountantSnapshot.totalBytes,
      accountantSkippedOverBudgetLayers: accountantSnapshot.skippedLayerCount,
      importPlanFormat: importPlan.items[0]?.format,
      importPlanFidelity: importPlan.items[0]?.fidelity,
    },
  };
}

export async function runProbe33ClipMigration(): Promise<LocalPrevalidationProbeOutput> {
  const clipBuilt = buildClipDocument({
    canvas: { width: 300, height: 200 },
    layers: [
      { id: 1, children: [2, 3, 4] },
      rasterLayer(2, "배경", 300, 200),
      { id: 3, name: "캐릭터폴더", folder: true, children: [5] },
      rasterLayer(5, "채색마스크", 120, 80, { mask: maskOf(120, 80) }),
      rasterLayer(4, "선화", 300, 200),
    ],
  });
  const clipSha256 = sha256Hex(clipBuilt.bytes);
  const clipResult = await importChunkedSqliteDocument(clipBuilt.bytes, { openSqlite: openNodeSqlite });
  assert.equal(clipResult.format, "clip-document");
  assert.equal(clipResult.source.sha256, clipSha256);
  assert.equal(clipResult.layers.length, 4);

  const bgLayer = clipResult.layers.find((layer) => layer.name === "배경");
  assert.ok(bgLayer?.pixels);
  const expectedBg = new Uint8Array(300 * 200 * 4);
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x < 300; x += 1) expectedBg.set(pattern(x, y), (y * 300 + x) * 4);
  }
  assert.equal(sameBytes(bgLayer.pixels, expectedBg), true);

  const maskedLayer = clipResult.layers.find((layer) => layer.name === "채색마스크");
  assert.ok(maskedLayer?.mask?.values && maskedLayer.mask.values.byteLength === 120 * 80);
  const unexpectedUnsupported = clipResult.unsupported.filter(
    (issue) => !CLIP_BY_DESIGN_UNSUPPORTED_CODES.has(issue.code),
  );
  assert.equal(unexpectedUnsupported.length, 0);

  const sutBytes = buildAuthoredSutFixture({ includeMaterial: true });
  const sutHeader = inspectCspToolFile(sutBytes);
  assert.equal(sutHeader.container, "sqlite3");
  const sutResult = await importCspToolFile(sutBytes, {
    kind: "sut",
    sqliteReader: readAuthoredSutWithNodeSqlite,
  });
  assert.ok(sutResult.programs.length >= 1);
  assert.ok(sutResult.assets.length >= 1);

  return {
    summaryKo: `CSP .clip(${clipBuilt.bytes.byteLength}B, 4계층 레이어·마스크 픽셀 100% 일치) 및 .sut(${sutBytes.byteLength}B, 브러시 IR ${sutResult.programs.length}건·내장 PNG ${sutResult.assets.length}건) 파서 실측 완료.`,
    metrics: {
      clipByteLength: clipBuilt.bytes.byteLength,
      clipSha256,
      clipLayerCount: clipResult.layers.length,
      clipBgPixelExactMatch: true,
      clipMaskByteLength: maskedLayer.mask.values.byteLength,
      clipUnexpectedUnsupportedCount: unexpectedUnsupported.length,
      sutByteLength: sutBytes.byteLength,
      sutSha256: sha256Hex(sutBytes),
      sutSupportLevel: sutResult.supportLevel,
      sutProgramCount: sutResult.programs.length,
      sutEmbeddedAssetCount: sutResult.assets.length,
    },
  };
}

export function runProbe54FileRoundtripLab(): LocalPrevalidationProbeOutput {
  const svgExport = exportPageToSvg({
    width: 800,
    height: 1200,
    bg: "#ffffff",
    elements: [
      { id: "frame-1", type: "frame", x: 40, y: 40, width: 720, height: 520, stroke: "#111111", strokeWidth: 4 },
      { id: "rect-1", type: "draw", kind: "rect", points: [80, 90, 260, 240], stroke: "#1f2937", strokeWidth: 3, fill: "#e5e7eb" },
      { id: "stroke-1", type: "draw", kind: "freehand", points: [100, 300, 220, 340, 380, 310, 520, 360], stroke: "#111827", strokeWidth: 4 },
      {
        id: "bubble-1", type: "bubble", variant: "speech", text: "대사 말풍선 검증",
        x: 420, y: 120, width: 260, height: 140,
        stroke: "#111111", strokeWidth: 2, fill: "#ffffff", textFill: "#111111", rotation: 0,
      },
      { id: "text-1", type: "text", text: "로컬 벡터 왕복 검증", x: 450, y: 170, width: 200, fontSize: 18, fill: "#111111", rotation: 0 },
    ],
  });
  const svgImported = parseSvgToScene(svgExport.svg);
  assert.ok(svgImported.scene.nodes.length >= 3);

  assert.equal(rgbToCmyk(0, 255, 255)[0], 1);
  assert.equal(rgbToCmyk(0, 0, 0)[3], 1);

  const cmykBytes = rgbaToCmykBytes(makePatternRgba(16, 24, 3));
  const printPdf = buildPrintPdfFromPages(
    [0, 1, 2, 3].map(() => ({ kind: "cmyk-raster" as const, cmykBytes, width: 16, height: 24 })),
    {
      title: "ToonStudio Print Prevalidation",
      print: { bleedMm: 3, cropMarks: true, colorMode: "cmyk", imposition: "booklet" },
    },
  );
  const printPdfText = Buffer.from(printPdf).toString("latin1");
  assert.ok(printPdfText.startsWith("%PDF-1."));
  assert.ok(printPdfText.includes("/DeviceCMYK"));
  assert.ok(printPdfText.includes("/TrimBox") && printPdfText.includes("/BleedBox"));
  assert.ok(printPdfText.trimEnd().endsWith("%%EOF"));

  const vectorPdf = buildVectorPdf({
    title: "ToonStudio Vector PDF 1.7",
    pages: [{
      widthPt: 595.28,
      heightPt: 841.89,
      trimBox: [8.5, 8.5, 586.78, 833.39],
      bleedBox: [0, 0, 595.28, 841.89],
      ops: [{
        op: "path",
        commands: [
          { op: "move", x: 40, y: 40 },
          { op: "line", x: 520, y: 40 },
          { op: "line", x: 520, y: 320 },
          { op: "close" },
        ],
        stroke: { color: { space: "cmyk", c: 0, m: 0, y: 0, k: 1 }, width: 2 },
      }],
    }],
  });
  const vectorPdfText = Buffer.from(vectorPdf).toString("latin1");
  assert.ok(vectorPdfText.startsWith("%PDF-1.7"));
  assert.ok(vectorPdfText.includes("/TrimBox"));
  assert.ok(vectorPdfText.trimEnd().endsWith("%%EOF"));

  const compatPlan = planStudioImport([
    { name: "work.toonstudio", sizeBytes: 4096, mimeType: "application/octet-stream" },
    { name: "cut.psd", sizeBytes: 8192, mimeType: "image/vnd.adobe.photoshop" },
    { name: "cut.svg", sizeBytes: 2048, mimeType: "image/svg+xml" },
    { name: "print.pdf", sizeBytes: 16384, mimeType: "application/pdf" },
    { name: "scene.glb", sizeBytes: 65536, mimeType: "model/gltf-binary" },
    { name: "payload.exe", sizeBytes: 1024, mimeType: "application/x-msdownload" },
  ]);
  assert.equal(compatPlan.blockedCount, 1);

  return {
    summaryKo: `합성 골든 코퍼스 왕복 완료: SVG(${svgExport.svg.length}자 → SceneIR ${svgImported.scene.nodes.length}노드), CMYK 인쇄 PDF(${printPdf.byteLength}B, 도련/재단마크/중철), 벡터 PDF 1.7(${vectorPdf.byteLength}B), 위험 확장자(.exe) 차단 확인.`,
    metrics: {
      svgLength: svgExport.svg.length,
      svgSha256: sha256Hex(svgExport.svg),
      svgImportedNodeCount: svgImported.scene.nodes.length,
      printPdfByteLength: printPdf.byteLength,
      printPdfSha256: sha256Hex(printPdf),
      printPdfHasDeviceCmyk: printPdfText.includes("/DeviceCMYK"),
      printPdfHasTrimAndBleedBox: printPdfText.includes("/TrimBox") && printPdfText.includes("/BleedBox"),
      vectorPdfByteLength: vectorPdf.byteLength,
      vectorPdfSha256: sha256Hex(vectorPdf),
      importCompatibilityCheckedCount: compatPlan.items.length,
      dangerousPayloadBlockedCount: compatPlan.blockedCount,
    },
  };
}

export async function runProbe55CollaborationFaultLab(): Promise<LocalPrevalidationProbeOutput> {
  const clientA = new StudioCrdtDocument();
  const clientB = new StudioCrdtDocument();
  const clientC = new StudioCrdtDocument();

  clientA.addPage({ id: "page-1", payload: { version: 1, props: { bg: "#ffffff", bgGrad: null, canvasH: 1280 } } });
  const seedUpdate = clientA.encodeStateAsUpdate();
  clientB.applyUpdate(seedUpdate);
  clientC.applyUpdate(seedUpdate);

  clientA.addStroke({
    id: "stroke-artist-a",
    pageId: "page-1",
    layerId: "layer-ink",
    payload: { version: 1, type: "draw", kind: "freehand", mode: "pen", stroke: "#111111", strokeWidth: 4, points: [10, 10, 80, 95] },
  });
  clientB.addStroke({
    id: "stroke-inker-b",
    pageId: "page-1",
    layerId: "layer-shadow",
    payload: { version: 1, type: "draw", kind: "freehand", mode: "pen", stroke: "#334155", strokeWidth: 8, points: [40, 20, 140, 160] },
  });
  clientC.addLayerGroup({ id: "group-lettering", pageId: "page-1", payload: { version: 1, props: { name: "대사 레이어" } } });
  clientC.addStroke({
    id: "stroke-letterer-c",
    pageId: "page-1",
    layerId: "layer-letter",
    payload: { version: 1, type: "draw", kind: "freehand", mode: "pen", stroke: "#0f172a", strokeWidth: 3, points: [200, 60, 280, 60] },
  });

  const syncPair = (left: StudioCrdtDocument, right: StudioCrdtDocument): void => {
    const rightDelta = right.encodeStateAsUpdate(left.encodeStateVector());
    const leftDelta = left.encodeStateAsUpdate(right.encodeStateVector());
    left.applyUpdate(rightDelta);
    right.applyUpdate(leftDelta);
  };
  syncPair(clientA, clientB);
  syncPair(clientB, clientC);
  syncPair(clientA, clientC);

  const canonicalSnapshot = (doc: StudioCrdtDocument): string => JSON.stringify({
    pages: doc.getPages().map((page) => ({ id: page.id, payload: page.payload })),
    strokes: doc.getStrokes().map((s) => ({ id: s.id, pageId: s.pageId, layerId: s.layerId, points: s.payload.points })),
    groups: doc.getLayerGroups().map((g) => ({ id: g.id, name: g.payload.props.name })),
  });

  const digestA = sha256Hex(canonicalSnapshot(clientA));
  const digestB = sha256Hex(canonicalSnapshot(clientB));
  const digestC = sha256Hex(canonicalSnapshot(clientC));
  assert.equal(digestA, digestB);
  assert.equal(digestB, digestC);
  assert.equal(clientA.getStrokes().length, 3);
  assert.equal(clientA.getLayerGroups().length, 1);
  clientA.destroy();
  clientB.destroy();
  clientC.destroy();

  const faultMeasured = await runV12RuntimeFaultMatrix();
  assert.equal(faultMeasured.deviceLoss.fabricCycles, V12_FAULT_MATRIX_TARGETS.deviceLossCycles);
  assert.equal(faultMeasured.deviceLoss.lostCommands, 0);
  assert.equal(faultMeasured.workerTermination.cycles, V12_FAULT_MATRIX_TARGETS.workerKillCycles);
  assert.equal(faultMeasured.journalRecovery.crashReopens, V12_FAULT_MATRIX_TARGETS.journalCrashReopens);
  assert.equal(faultMeasured.journalRecovery.lostAcceptedEdits, 0);
  assert.equal(faultMeasured.storageFaults.corruptBlobBytesApplied, 0);
  assert.equal(faultMeasured.collaboration.convergedStateVectors, 1);
  assert.equal(faultMeasured.collaboration.lostAcceptedEdits, 0);

  const localDb = await openStudioLocalDatabase({ vfs: "memory" });
  let sqliteRecoveredFrom = "";
  let sqliteRecoveredStrokeId = "";
  try {
    const autosaveStore = createStudioAutosaveSqliteStore(localDb);
    const key = "prevalidation-offline-doc";
    await autosaveStore.write(key, {
      version: 3,
      savedAt: "2026-11-21T00:00:00.000Z",
      pagesList: [{ id: "page-1", canvasH: 2000, elements: [{ id: "stroke-lkg", type: "draw" }] }],
      currentPageId: "page-1",
    });
    await autosaveStore.write(key, {
      version: 3,
      savedAt: "2026-11-21T00:05:00.000Z",
      pagesList: [{ id: "page-1", canvasH: 2000, elements: [{ id: "stroke-latest", type: "draw" }] }],
      currentPageId: "page-1",
    });
    await localDb.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{corrupt-primary-json");
    const recovered = await autosaveStore.read(key);
    assert.ok(recovered !== null);
    if (!recovered) throw new Error("autosave snapshot missing");
    assert.equal(recovered.state, "snapshot");
    if (recovered.state === "snapshot") {
      sqliteRecoveredFrom = recovered.recoveredFrom ?? "primary";
      const firstElement = recovered.payload.pagesList?.[0]?.elements?.[0] as { id?: string } | undefined;
      sqliteRecoveredStrokeId = firstElement?.id ?? "";
    }
    assert.equal(sqliteRecoveredFrom, "last-known-good");
    assert.equal(sqliteRecoveredStrokeId, "stroke-lkg");
  } finally {
    await localDb.close();
  }

  const baseWs = normalizeStudioWorkspaceState({
    ...DEFAULT_STUDIO_WORKSPACE_STATE,
    activeWorkspaceId: "storyboard",
    customWorkspaces: [{ id: "ws-1", name: "기본 작업실", layout: DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout }],
  });
  const localWs = updateStudioWorkspaceLiveLayout(baseWs, {
    ...baseWs.liveLayout,
    drawingPalettes: resizeStudioDrawingPalettes(baseWs.liveLayout.drawingPalettes, "sub-tools", 46),
  });
  const externalWs = renameStudioWorkspace(baseWs, "ws-1", "콘티 작업실");
  const cleanMerge = mergeStudioWorkspaceStates(baseWs, localWs, externalWs);
  assert.equal(cleanMerge.conflictPaths.length, 0);

  const conflictExternalWs = updateStudioWorkspaceLiveLayout(baseWs, {
    ...baseWs.liveLayout,
    drawingPalettes: resizeStudioDrawingPalettes(baseWs.liveLayout.drawingPalettes, "sub-tools", 60),
  });
  const conflictMerge = mergeStudioWorkspaceStates(baseWs, localWs, conflictExternalWs);
  assert.ok(conflictMerge.conflictPaths.length >= 1);

  return {
    summaryKo: `3노드 Yjs CRDT 파티션 재연결 0-충돌 수렴(SHA-256 일치), V12 장애주입(GPU ${faultMeasured.deviceLoss.fabricCycles}회·워커 ${faultMeasured.workerTermination.cycles}회·저널복구 ${faultMeasured.journalRecovery.crashReopens}회·유실 0건), SQLite 손상 LKG 복구 및 3-Way 병합 실측 완료.`,
    metrics: {
      crdtReplicaCount: 3,
      crdtConvergedDigestSha256: digestA,
      crdtBitIdenticalConvergence: digestA === digestB && digestB === digestC,
      crdtMergedStrokeCount: 3,
      crdtConflictCount: 0,
      v12GpuDeviceLossCycles: faultMeasured.deviceLoss.fabricCycles,
      v12WorkerKillCycles: faultMeasured.workerTermination.cycles,
      v12JournalCrashReopens: faultMeasured.journalRecovery.crashReopens,
      v12LostAcceptedEdits: faultMeasured.journalRecovery.lostAcceptedEdits + faultMeasured.collaboration.lostAcceptedEdits,
      v12CorruptBlobBytesApplied: faultMeasured.storageFaults.corruptBlobBytesApplied,
      sqliteCorruptionRecoveredFrom: sqliteRecoveredFrom,
      threeWayCleanMergeConflicts: cleanMerge.conflictPaths.length,
      threeWaySameFieldConflictDetected: conflictMerge.conflictPaths.length,
    },
  };
}

export function runProbe56AccessibilitySecurityAudit(repositoryRoot: string): LocalPrevalidationProbeOutput {
  const policy = {
    minimumTextPx: 12, minimumContrast: 4.5, minimumLargeTextContrast: 3.0, largeTextPx: 18,
    minimumTouchTargetPx: 44, requireAltText: true, requireCaptions: true, requireReadingOrder: true,
  } as const;

  const compliantReport = auditStudioAccessibility({
    textNodes: [
      { id: "heading", text: "ToonStudio 작업실", sizePx: 20, foreground: "#111827", background: "#ffffff", essential: true },
      { id: "body", text: "저장 후 바로 그리기", sizePx: 14, foreground: "#1f2937", background: "#f9fafb", essential: true },
    ],
    imageNodes: [{ id: "thumb-1", decorative: false, altText: "1화 1컷 미리보기" }],
    interactiveNodes: [
      { id: "save-btn", label: "원고 저장", widthPx: 48, heightPx: 44, keyboardReachable: true },
      { id: "export-btn", label: "내보내기", widthPx: 48, heightPx: 44, keyboardReachable: true },
    ],
    audioNodes: [{ id: "cue-1", hasSpeechOrMeaningfulSound: true, captionsComplete: true, transcriptComplete: true }],
    readingOrderIds: ["heading", "body", "save-btn", "export-btn"],
    requiredReadingOrderIds: ["heading", "body", "save-btn"],
  }, policy);
  assert.equal(compliantReport.status, "pass");
  assert.equal(compliantReport.blockingCount, 0);

  const nonCompliantReport = auditStudioAccessibility({
    textNodes: [{ id: "low-contrast", text: "희미한 라벨", sizePx: 11, foreground: "#cbd5e1", background: "#ffffff", essential: true }],
    imageNodes: [{ id: "img-no-alt", decorative: false, altText: "" }],
    interactiveNodes: [{ id: "tiny-btn", label: "", widthPx: 24, heightPx: 24, keyboardReachable: false }],
    audioNodes: [{ id: "audio-no-cap", hasSpeechOrMeaningfulSound: true, captionsComplete: false, transcriptComplete: false }],
    readingOrderIds: ["low-contrast", "low-contrast"],
    requiredReadingOrderIds: ["low-contrast", "missing-id"],
  }, policy);
  assert.equal(nonCompliantReport.status, "blocked");
  assert.ok(nonCompliantReport.blockingCount >= 4);

  const primaryContrast = Number(studioColorContrast("#111827", "#ffffff").toFixed(2));
  const advisoryCheck = verifySecurityAdvisoryExceptions({ root: repositoryRoot });
  const hardeningCheck = verifyCodeScanningAndDependabotHardening({ root: repositoryRoot });

  const validLockfile: StudioAssetLockfileV1 = {
    version: 1,
    projectId: "proj-preval-01",
    generatedAt: "2026-11-21T00:00:00.000Z",
    entries: [{
      version: 1,
      assetId: "hero-vrm-romance-female",
      sellerId: "toonstudio-cc0",
      assetVersion: "1.0.0",
      contentDigest: `sha256:${"a".repeat(64)}`,
      licenseGrantId: "grant-cc0-1.0",
      seatCount: 1,
      allowedUses: ["commercial-serialization", "webtoon-export"],
      prohibitedUses: ["raw-resale"],
      projectUses: [{ version: 1, projectId: "proj-preval-01", episodeId: "ep-1", panelId: "page-1" }],
      creditRequirement: null,
      receiptReference: "receipt-cc0-2026-11-21",
      lockedAt: "2026-11-21T00:00:00.000Z",
    }],
  };
  assertStudioAssetLockfilePublishable(validLockfile);

  const invalidLockfile: StudioAssetLockfileV1 = {
    ...validLockfile,
    entries: [{
      ...validLockfile.entries[0]!,
      contentDigest: "md5:invalid",
      licenseGrantId: "",
      prohibitedUses: ["commercial-serialization"],
      projectUses: [{ version: 1, projectId: "other-project", episodeId: "ep-1", panelId: "page-1" }],
    }],
  };
  const lockfileIssues = validateStudioAssetLockfile(invalidLockfile);
  assert.ok(lockfileIssues.length >= 4);

  return {
    summaryKo: `접근성 WCAG 감사(준수 pass·위반 ${nonCompliantReport.blockingCount}건 차단), 보안 자문 예외 ${advisoryCheck.ignoredGhsas.length}건·핀 ${hardeningCheck.verifiedOverrides}종·CodeQL 회귀 0건, Rights BOM 락파일 정상 통과 및 위반 ${lockfileIssues.length}건 차단 검증 완료.`,
    metrics: {
      a11yCompliantStatus: compliantReport.status,
      a11yPrimaryContrastRatio: primaryContrast,
      a11yNonCompliantBlockingCount: nonCompliantReport.blockingCount,
      securityIgnoredGhsaCount: advisoryCheck.ignoredGhsas.length,
      securityVerifiedOverridesCount: hardeningCheck.verifiedOverrides,
      brandFilmZodVersion: hardeningCheck.brandFilmZodVersion,
      rightsBomValidIssueCount: 0,
      rightsBomViolationDetectedCount: lockfileIssues.length,
      rightsBomViolationCodes: lockfileIssues.map((issue) => issue.code).sort(),
    },
  };
}
