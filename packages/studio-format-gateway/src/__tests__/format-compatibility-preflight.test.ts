import { describe, expect, it } from "vitest";

import { readClipText } from "../chunked-sqlite-layer-model";
import {
  buildMissingFontSubstitutionPreviews,
  buildPreflightInputFromClipLayers,
  createCompatibilityReportFromPreflight,
  decodeLegacyLayerNameBytes,
  decodePsdPascalLayerName,
  evaluateExportPreservationReadiness,
  recoverGarbledLayerName,
  scanFormatCompatibilityPreflight,
  scanPsdPreflight,
  verifyExportFolderAndClippingPreservation,
  type PreflightLayerDescriptor,
} from "../format-compatibility-preflight";

import type { ClipLayer } from "../chunked-sqlite-document-types";

/** Python `cp949` 코덱으로 교차 검증한 구버전 한국어 PSD/CLIP 레이어명 골든 바이트 테이블. */
const GOLDEN_CP949_LAYER_NAMES: readonly { readonly expected: string; readonly bytes: readonly number[] }[] = [
  { expected: "인물_선화", bytes: [0xc0, 0xce, 0xb9, 0xb0, 0x5f, 0xbc, 0xb1, 0xc8, 0xad] },
  { expected: "배경_채색", bytes: [0xb9, 0xe8, 0xb0, 0xe6, 0x5f, 0xc3, 0xa4, 0xbb, 0xf6] },
  { expected: "톤_효과1", bytes: [0xc5, 0xe6, 0x5f, 0xc8, 0xbf, 0xb0, 0xfa, 0x31] },
  { expected: "말풍선_대사", bytes: [0xb8, 0xbb, 0xc7, 0xb3, 0xbc, 0xb1, 0x5f, 0xb4, 0xeb, 0xbb, 0xe7] },
  { expected: "밑색 레이어", bytes: [0xb9, 0xd8, 0xbb, 0xf6, 0x20, 0xb7, 0xb9, 0xc0, 0xcc, 0xbe, 0xee] },
  { expected: "빛효과 (오버레이)", bytes: [0xba, 0xfb, 0xc8, 0xbf, 0xb0, 0xfa, 0x20, 0x28, 0xbf, 0xc0, 0xb9, 0xf6, 0xb7, 0xb9, 0xc0, 0xcc, 0x29] },
  { expected: "그림자_클리핑", bytes: [0xb1, 0xd7, 0xb8, 0xb2, 0xc0, 0xda, 0x5f, 0xc5, 0xac, 0xb8, 0xae, 0xc7, 0xce] },
  { expected: "캐릭터_눈동자", bytes: [0xc4, 0xb3, 0xb8, 0xaf, 0xc5, 0xcd, 0x5f, 0xb4, 0xab, 0xb5, 0xbf, 0xc0, 0xda] },
  // CP949 UHC 확장 한글(KS X 1001 범위 밖 음절) 포함 골든 케이스
  { expected: "뷁_테스트", bytes: [0x94, 0xee, 0x5f, 0xc5, 0xd7, 0xbd, 0xba, 0xc6, 0xae] },
  { expected: "찱흙_질감", bytes: [0xaa, 0x47, 0xc8, 0xeb, 0x5f, 0xc1, 0xfa, 0xb0, 0xa8] },
  { expected: "컷1_폴더", bytes: [0xc4, 0xc6, 0x31, 0x5f, 0xc6, 0xfa, 0xb4, 0xf5] },
  { expected: "효과음_쾅!", bytes: [0xc8, 0xbf, 0xb0, 0xfa, 0xc0, 0xbd, 0x5f, 0xc4, 0xe7, 0x21] },
];

/** Python `cp932` / Shift-JIS 코덱으로 교차 검증한 구버전 일본어 PSD/CLIP 레이어명 골든 바이트 테이블. */
const GOLDEN_SHIFT_JIS_LAYER_NAMES: readonly { readonly expected: string; readonly bytes: readonly number[] }[] = [
  { expected: "レイヤー1", bytes: [0x83, 0x8c, 0x83, 0x43, 0x83, 0x84, 0x81, 0x5b, 0x31] },
  { expected: "背景", bytes: [0x94, 0x77, 0x8c, 0x69] },
  { expected: "線画", bytes: [0x90, 0xfc, 0x89, 0xe6] },
  { expected: "キャラ_下塗り", bytes: [0x83, 0x4c, 0x83, 0x83, 0x83, 0x89, 0x5f, 0x89, 0xba, 0x93, 0x68, 0x82, 0xe8] },
  { expected: "トーン", bytes: [0x83, 0x67, 0x81, 0x5b, 0x83, 0x93] },
  { expected: "フキダシ", bytes: [0x83, 0x74, 0x83, 0x4c, 0x83, 0x5f, 0x83, 0x56] },
  { expected: "影_乗算", bytes: [0x89, 0x65, 0x5f, 0x8f, 0xe6, 0x8e, 0x5a] },
  { expected: "光_加算発光", bytes: [0x8c, 0xf5, 0x5f, 0x89, 0xc1, 0x8e, 0x5a, 0x94, 0xad, 0x8c, 0xf5] },
  { expected: "フォルダ_人物", bytes: [0x83, 0x74, 0x83, 0x48, 0x83, 0x8b, 0x83, 0x5f, 0x5f, 0x90, 0x6c, 0x95, 0xa8] },
  { expected: "効果線_集中", bytes: [0x8c, 0xf8, 0x89, 0xca, 0x90, 0xfc, 0x5f, 0x8f, 0x57, 0x92, 0x86] },
  { expected: "下書き", bytes: [0x89, 0xba, 0x8f, 0x91, 0x82, 0xab] },
  { expected: "仕上げ_ハイライト", bytes: [0x8e, 0x64, 0x8f, 0xe3, 0x82, 0xb0, 0x5f, 0x83, 0x6e, 0x83, 0x43, 0x83, 0x89, 0x83, 0x43, 0x83, 0x67] },
  { expected: "セリフ", bytes: [0x83, 0x5a, 0x83, 0x8a, 0x83, 0x74] },
];

function pushUint16BE(target: number[], value: number): void {
  target.push((value >>> 8) & 0xff, value & 0xff);
}

function pushUint32BE(target: number[], value: number): void {
  target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function pushFourCc(target: number[], fourCc: string): void {
  for (let i = 0; i < 4; i += 1) {
    target.push(fourCc.charCodeAt(i) & 0xff);
  }
}

interface SyntheticPsdLayerSpec {
  readonly pascalBytes: readonly number[];
  readonly blendFourCc?: string;
  readonly clipping?: boolean;
  readonly sectionDividerType?: number;
  readonly tags?: readonly { readonly key: string; readonly payload: readonly number[] }[];
}

/** 픽셀 채널이 비어 있는 유효한 PSD v1(8BPS) 테스트 바이너리를 생성한다(아래→위 순서). */
function buildSyntheticPsd(layersBottomToTop: readonly SyntheticPsdLayerSpec[]): Uint8Array {
  const layerRecords: number[] = [];
  pushUint16BE(layerRecords, layersBottomToTop.length);

  for (const spec of layersBottomToTop) {
    // rect(16) + channelsCount(2)
    for (let i = 0; i < 16; i += 1) layerRecords.push(0);
    pushUint16BE(layerRecords, 0);

    // 8BIM + blend + opacity + clipping + flags + filler
    pushFourCc(layerRecords, "8BIM");
    pushFourCc(layerRecords, spec.blendFourCc ?? "norm");
    layerRecords.push(255, spec.clipping ? 1 : 0, 0, 0);

    // extra data: mask(4) + ranges(4) + pascalName(padded to 4) + tagged blocks
    const extra: number[] = [];
    pushUint32BE(extra, 0);
    pushUint32BE(extra, 0);
    extra.push(spec.pascalBytes.length, ...spec.pascalBytes);
    while ((1 + spec.pascalBytes.length + (extra.length - (8 + 1 + spec.pascalBytes.length))) % 4 !== 0) {
      extra.push(0);
    }

    const tags = [...(spec.tags ?? [])];
    if (spec.sectionDividerType !== undefined) {
      const payload: number[] = [];
      pushUint32BE(payload, spec.sectionDividerType);
      tags.push({ key: "lsct", payload });
    }
    for (const tag of tags) {
      pushFourCc(extra, "8BIM");
      pushFourCc(extra, tag.key);
      pushUint32BE(extra, tag.payload.length);
      extra.push(...tag.payload);
      if (tag.payload.length % 2 === 1) extra.push(0);
    }

    pushUint32BE(layerRecords, extra.length);
    layerRecords.push(...extra);
  }
  if (layerRecords.length % 2 === 1) layerRecords.push(0);

  const layerMaskSection: number[] = [];
  pushUint32BE(layerMaskSection, layerRecords.length);
  layerMaskSection.push(...layerRecords);

  const file: number[] = [];
  pushFourCc(file, "8BPS");
  pushUint16BE(file, 1); // PSD v1
  file.push(0, 0, 0, 0, 0, 0); // reserved
  pushUint16BE(file, 3); // RGB channels
  pushUint32BE(file, 1280); // height
  pushUint32BE(file, 800); // width
  pushUint16BE(file, 8); // bitDepth
  pushUint16BE(file, 3); // RGB colorMode
  pushUint32BE(file, 0); // Color Mode Data
  pushUint32BE(file, 0); // Image Resources
  pushUint32BE(file, layerMaskSection.length);
  file.push(...layerMaskSection);
  pushUint16BE(file, 0); // Image Data compression

  return new Uint8Array(file);
}

describe("축 12 · UTF-8 → CP949(EUC-KR) → Shift-JIS 순차 판별 디코더 골든 회귀 (#060)", () => {
  it("구버전 한국어 CP949(KS X 1001 + UHC 확장 한글 포함) 12종 레이어명을 100% 복구한다", () => {
    for (const sample of GOLDEN_CP949_LAYER_NAMES) {
      const decoded = decodeLegacyLayerNameBytes(new Uint8Array(sample.bytes));
      expect(decoded.text, `CP949 복구 실패: ${sample.expected}`).toBe(sample.expected);
      expect(decoded.detectedEncoding).toBe("cp949");
      expect(decoded.wasRecovered).toBe(true);
      expect(decoded.mojibakeDetected).toBe(true);
    }
  });

  it("구버전 일본어 Shift-JIS 13종 레이어명을 CP949 오탐 없이 100% 복구한다", () => {
    for (const sample of GOLDEN_SHIFT_JIS_LAYER_NAMES) {
      const decoded = decodeLegacyLayerNameBytes(new Uint8Array(sample.bytes));
      expect(decoded.text, `Shift-JIS 복구 실패: ${sample.expected}`).toBe(sample.expected);
      expect(decoded.detectedEncoding).toBe("shift-jis");
      expect(decoded.wasRecovered).toBe(true);
    }
  });

  it("정상 UTF-8·ASCII·BOM 바이트열과 이미 정상인 한글/일본어 문자열은 원형 그대로 보존한다", () => {
    const utf8Bytes = new TextEncoder().encode("웹툰_1화_線画_Layer");
    const decoded = decodeLegacyLayerNameBytes(utf8Bytes);
    expect(decoded.text).toBe("웹툰_1화_線画_Layer");
    expect(decoded.detectedEncoding).toBe("utf-8");
    expect(decoded.wasRecovered).toBe(false);

    const bomUtf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8Bytes, 0x00, 0x00]);
    expect(decodeLegacyLayerNameBytes(bomUtf8)).toMatchObject({
      text: "웹툰_1화_線画_Layer",
      detectedEncoding: "utf-8",
      wasRecovered: false,
    });

    // 이미 정상 유니코드 문자열과 유럽 악센트 문자열 보호
    expect(recoverGarbledLayerName("배경_채색").wasRecovered).toBe(false);
    expect(recoverGarbledLayerName("Café_Layer")).toMatchObject({
      text: "Café_Layer",
      wasRecovered: false,
    });
  });

  it("Latin-1/Windows-1252로 깨진 문자열과 PSD luni/Pascal 조합, CLIP BLOB 셀을 자동 복구한다", () => {
    const garbledKorean = String.fromCharCode(...GOLDEN_CP949_LAYER_NAMES[0]!.bytes);
    expect(recoverGarbledLayerName(garbledKorean)).toMatchObject({
      text: "인물_선화",
      detectedEncoding: "cp949",
      wasRecovered: true,
    });

    // Windows-1252 깨짐 문자열("ƒŒƒCƒ„[1" ← 83 8C 83 43 83 84 81 5B 31)
    expect(recoverGarbledLayerName("\u0192\u0152\u0192C\u0192\u201e\x81[1")).toMatchObject({
      text: "レイヤー1",
      detectedEncoding: "shift-jis",
      wasRecovered: true,
    });

    // PSD luni가 있으면 Pascal보다 우선하고, 없으면 Pascal에서 복구
    const pascal = new Uint8Array(GOLDEN_CP949_LAYER_NAMES[1]!.bytes);
    expect(decodePsdPascalLayerName(pascal, "유니코드_배경").text).toBe("유니코드_배경");
    expect(decodePsdPascalLayerName(pascal, null)).toMatchObject({
      text: "배경_채색",
      detectedEncoding: "cp949",
      wasRecovered: true,
    });

    // .clip SQLite LayerName BLOB가 CP949/Shift-JIS로 저장된 경우 readClipText 자동 복구
    expect(readClipText(new Uint8Array(GOLDEN_CP949_LAYER_NAMES[0]!.bytes), 100)).toBe("인물_선화");
    expect(readClipText(new Uint8Array(GOLDEN_SHIFT_JIS_LAYER_NAMES[0]!.bytes), 100)).toBe("レイヤー1");
  });
});

describe("축 12 · 가져오기 전 1초 사전 호환성 리포트 스캐너 (#056–#059)", () => {
  it("완전 호환 / 래스터화 대체 / 미지원 스마트필터·효과를 분류하고 표준 CompatibilityReport로 연결한다", () => {
    const report = scanFormatCompatibilityPreflight(
      {
        sourceFileName: "ep04_master.psd",
        sourceFormat: "psd",
        canvasWidth: 1600,
        canvasHeight: 12000,
        bitDepth: 16,
        colorMode: "cmyk",
        layers: [
          {
            id: "folder-char",
            name: "캐릭터",
            kind: "folder",
            blendMode: "pass-through",
            parentId: null,
          },
          {
            id: "line-art",
            rawNameBytes: new Uint8Array(GOLDEN_CP949_LAYER_NAMES[0]!.bytes),
            kind: "raster",
            blendMode: "multiply",
            parentId: "folder-char",
            clipToBelow: true,
          },
          {
            id: "base-color",
            name: "밑색",
            kind: "raster",
            blendMode: "normal",
            parentId: "folder-char",
          },
          {
            id: "smart-fx",
            rawNameBytes: new Uint8Array(GOLDEN_SHIFT_JIS_LAYER_NAMES[2]!.bytes),
            kind: "smart-object",
            blendMode: "normal",
            parentId: null,
            effects: [
              {
                type: "smart-filter-liquify",
                name: "픽셀 유동화",
                isSmartFilter: true,
                enabled: true,
              },
              {
                type: "bevel-emboss",
                name: "경사와 엠보스",
                isSmartFilter: false,
                enabled: true,
              },
            ],
          },
          {
            id: "dialogue-1",
            name: "말풍선_1",
            kind: "text",
            fontFamily: "YoonGothic Pro",
            parentId: null,
          },
        ],
      },
      {
        availableLocalFonts: ["Pretendard", "Noto Serif KR"],
        targetExportFormat: "psd",
      },
    );

    expect(report.withinOneSecondBudget).toBe(true);
    expect(report.elapsedMs).toBeLessThan(1_000);
    expect(report.grade).toBe("D");
    expect(report.requiresApproval).toBe(true);

    // 분류 검증
    expect(report.fullyCompatibleLayers.map((l) => l.layerId)).toEqual([
      "folder-char",
      "line-art",
      "base-color",
      "dialogue-1",
    ]);
    expect(report.rasterizedFallbackLayers.map((l) => l.layerId)).toEqual(["smart-fx"]);
    expect(report.unsupportedSmartFiltersAndEffects).toHaveLength(1);
    expect(report.unsupportedSmartFiltersAndEffects[0]).toMatchObject({
      layerId: "smart-fx",
      layerName: "線画",
      effectType: "smart-filter-liquify",
      isSmartFilter: true,
    });

    // CP949 & Shift-JIS 자동 복구 내역
    expect(report.recoveredLayerNames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layerId: "line-art", recoveredName: "인물_선화", detectedEncoding: "cp949" }),
        expect.objectContaining({ layerId: "smart-fx", recoveredName: "線画", detectedEncoding: "shift-jis" }),
      ]),
    );

    // 누락 폰트 로컬 대체 매핑 미리보기
    expect(report.missingFontSubstitutions).toHaveLength(1);
    expect(report.missingFontSubstitutions[0]).toMatchObject({
      requestedFont: "YoonGothic Pro",
      suggestedFallbackFont: "Pretendard",
      availableInLocalFonts: true,
      affectedLayerIds: ["dialogue-1"],
    });

    // 폴더·클리핑 마스크 보존 통과
    expect(report.exportPreservation).toMatchObject({
      passed: true,
      foldersTotal: 1,
      foldersPreserved: 1,
      clippingMasksTotal: 1,
      clippingMasksPreserved: 1,
      clippingMasksBroken: 0,
    });

    // 정식 CompatibilityReport Zod 계약 브리지 검증
    const hash = "a".repeat(64);
    const formal = createCompatibilityReportFromPreflight(report, {
      id: "preflight-report-001",
      source: {
        sourceFileName: "ep04_master.psd",
        sourceFormat: "psd",
        sourceHash: hash,
        sourceSize: 4096,
        sourceBlob: {
          id: "blob-preflight-001",
          sha256: hash,
          size: 4096,
          mediaType: "image/vnd.adobe.photoshop",
          role: "source",
        },
        immutable: true,
        importedAt: "2026-11-23T05:00:00.000Z",
      },
      createdAt: "2026-11-23T05:00:01.000Z",
    });
    expect(formal.grade).toBe("D");
    expect(formal.summary.unsupported).toBeGreaterThanOrEqual(1);
    expect(formal.summary.rasterized).toBe(1);
  });

  it("누락 폰트 로컬 대체 매핑이 카테고리별(고딕·명조·만화·일본어·고정폭) 대체와 자폭 위험도를 제시한다", () => {
    const layers: readonly PreflightLayerDescriptor[] = [
      { id: "t1", kind: "text", fontFamily: "Pretendard Bold" },
      { id: "t2", kind: "text", fontFamily: "CCWildWords Roman" },
      { id: "t3", kind: "text", fontFamily: "KoPubBatang Medium" },
      { id: "t4", kind: "text", fontFamily: "Hiragino Kaku Gothic ProN" },
      { id: "t5", kind: "text", fontFamily: "Consolas" },
    ];
    const previews = buildMissingFontSubstitutionPreviews(layers, [
      "Pretendard",
      "Noto Serif KR",
      "Noto Sans JP",
      "D2Coding",
    ]);

    expect(previews.map((p) => p.requestedFont)).toEqual([
      "CCWildWords Roman",
      "KoPubBatang Medium",
      "Hiragino Kaku Gothic ProN",
      "Consolas",
    ]);
    expect(previews.find((p) => p.requestedFont === "CCWildWords Roman")).toMatchObject({
      category: "comic-handwriting",
      matchStrategy: "alias-table",
      estimatedMetricDelta: "high",
      suggestedFallbackFont: "Pretendard",
      availableInLocalFonts: true,
    });
    // 로컬 대체 폰트가 전혀 없는 환경에서는 기본 번들 만화 폰트를 제안
    const fallbackWithoutLocal = buildMissingFontSubstitutionPreviews(
      [{ id: "t2", kind: "text", fontFamily: "CCWildWords Roman" }],
      [],
    );
    expect(fallbackWithoutLocal[0]).toMatchObject({
      suggestedFallbackFont: "Nanum Pen Script",
      availableInLocalFonts: false,
    });
    expect(previews.find((p) => p.requestedFont === "KoPubBatang Medium")).toMatchObject({
      suggestedFallbackFont: "Noto Serif KR",
      availableInLocalFonts: true,
    });
    expect(previews.find((p) => p.requestedFont === "Hiragino Kaku Gothic ProN")).toMatchObject({
      suggestedFallbackFont: "Noto Sans JP",
      availableInLocalFonts: true,
    });
    expect(previews.find((p) => p.requestedFont === "Consolas")).toMatchObject({
      suggestedFallbackFont: "D2Coding",
      availableInLocalFonts: true,
    });
  });

  it("내보내기 폴더 계층과 클리핑 마스크 보존 실패(고아 클리핑·폴더 유실·평면 포맷)를 정확히 탐지한다", () => {
    const sourceLayers: readonly PreflightLayerDescriptor[] = [
      { id: "f1", name: "컷1", kind: "folder", parentId: null },
      { id: "shadow", name: "그림자", kind: "raster", parentId: "f1", clipToBelow: true },
      { id: "base", name: "밑색", kind: "raster", parentId: "f1", clipToBelow: false },
    ];

    expect(evaluateExportPreservationReadiness(sourceLayers, "psd").passed).toBe(true);
    expect(evaluateExportPreservationReadiness(sourceLayers, "png")).toMatchObject({
      passed: false,
      foldersLost: 1,
      clippingMasksBroken: 1,
    });

    // 고아 클리핑 마스크(아래에 기준 레이어 없음)
    const orphanReport = evaluateExportPreservationReadiness(
      [{ id: "bad-clip", name: "고아_클리핑", kind: "raster", parentId: null, clipToBelow: true }],
      "psd",
    );
    expect(orphanReport.passed).toBe(false);
    expect(orphanReport.orphanClippingLayerIds).toEqual(["bad-clip"]);

    // 왕복 내보내기 비교: 폴더 유실 + 클리핑 플래그 손실 탐지
    const degradedExport: readonly PreflightLayerDescriptor[] = [
      { id: "shadow", name: "그림자", kind: "raster", parentId: null, clipToBelow: false },
      { id: "base", name: "밑색", kind: "raster", parentId: null, clipToBelow: false },
    ];
    const diff = verifyExportFolderAndClippingPreservation(sourceLayers, degradedExport, "psd");
    expect(diff.passed).toBe(false);
    expect(diff.foldersLost).toBe(1);
    expect(diff.clippingMasksBroken).toBe(1);
    expect(diff.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["folder-lost-in-export", "clipping-flag-lost"]),
    );
  });

  it("실제 PSD 바이너리 고속 프리플라이트 스캔이 구버전 CP949/Shift-JIS 레이어·폴더·클리핑·스마트필터를 1초 이내에 판별한다", () => {
    const psdBytes = buildSyntheticPsd([
      // bottom-to-top: </folder> → 밑색 → 인물_선화(clip) → 컷1_폴더(folder) → レイヤー1(smart filter)
      { pascalBytes: [0x3c, 0x2f, 0x47, 0x3e], sectionDividerType: 3 },
      { pascalBytes: GOLDEN_CP949_LAYER_NAMES[4]!.bytes, blendFourCc: "norm" },
      { pascalBytes: GOLDEN_CP949_LAYER_NAMES[0]!.bytes, blendFourCc: "mul ", clipping: true },
      { pascalBytes: GOLDEN_CP949_LAYER_NAMES[10]!.bytes, sectionDividerType: 1 },
      {
        pascalBytes: GOLDEN_SHIFT_JIS_LAYER_NAMES[0]!.bytes,
        tags: [
          { key: "SoLd", payload: [0, 0, 0, 1] },
          { key: "fxrp", payload: [0, 0, 0, 1] },
        ],
      },
    ]);

    const report = scanPsdPreflight(psdBytes, { sourceFileName: "legacy_ep01.psd" });
    expect(report.withinOneSecondBudget).toBe(true);
    expect(report.sourceFormat).toBe("psd");
    expect(report.totalLayers).toBe(4);
    expect(report.recoveredLayerNames.map((entry) => entry.recoveredName)).toEqual([
      "レイヤー1",
      "컷1_폴더",
      "인물_선화",
      "밑색 레이어",
    ]);
    expect(report.exportPreservation).toMatchObject({
      passed: true,
      foldersTotal: 1,
      clippingMasksTotal: 1,
      clippingMasksPreserved: 1,
    });
    expect(report.unsupportedSmartFiltersAndEffects).toHaveLength(1);
    expect(report.rasterizedFallbackLayers).toHaveLength(1);
  });

  it("500개 레이어 대형 문서 및 CLIP 레이어 변환 어댑터도 1초 예산 안에서 완료한다", () => {
    const clipLayers: ClipLayer[] = Array.from({ length: 500 }, (_, index) => ({
      index,
      id: index + 1,
      parentIndex: null,
      depth: 0,
      kind: index % 20 === 0 ? "vector" : "raster",
      layerType: 0,
      name: `레이어_${index + 1}`,
      uuid: null,
      visible: true,
      effectiveVisible: true,
      visibilityRaw: 1,
      editLocked: false,
      transparencyLocked: false,
      lockRaw: 0,
      clipToBelow: false,
      folderFlags: 0,
      opacity: 1,
      opacityRaw: 256,
      compositeMode: "normal",
      compositeRaw: 0,
      passThrough: false,
      drawColor: null,
      drawColorEnabled: false,
      placement: {
        layerOffsetX: 0,
        layerOffsetY: 0,
        renderOffsetX: 0,
        renderOffsetY: 0,
        maskOffsetX: 0,
        maskOffsetY: 0,
        maskRenderOffsetX: 0,
        maskRenderOffsetY: 0,
        drawToRenderOffscreenType: null,
      },
      extent: null,
      colorMode: null,
      initialPixel: null,
      pixels: null,
      storedBlocks: null,
      mask: null,
    }));

    const preflightInput = buildPreflightInputFromClipLayers(clipLayers, {
      sourceFileName: "large_episode.clip",
      canvasWidth: 800,
      canvasHeight: 20_000,
    });
    const report = scanFormatCompatibilityPreflight(preflightInput);

    expect(report.withinOneSecondBudget).toBe(true);
    expect(report.elapsedMs).toBeLessThan(1_000);
    expect(report.grade).toBe("A");
    expect(report.requiresApproval).toBe(false);
    expect(report.fullyCompatibleLayers).toHaveLength(500);
  });

  it("대량의 반복 하이픈 적대적 엔티티 ID 입력도 ReDoS 없이 50ms 이내 선형 시간에 정확히 정규화한다 (CodeQL #248)", () => {
    const onlyDashes = "-".repeat(100_000);
    const trailingBang = `a${"-".repeat(100_000)}!`;
    const sandwichedDashes = `a${"-".repeat(100_000)}b`;

    const measureSingleLayerId = (rawId: string) => {
      const startedAt = performance.now();
      const report = scanFormatCompatibilityPreflight({
        sourceFileName: "adversarial.psd",
        sourceFormat: "psd",
        layers: [{ id: rawId, name: "안전_레이어", kind: "raster" }],
      });
      const elapsedMs = performance.now() - startedAt;
      return {
        entityId: report.compatibilityItems[0]?.id,
        elapsedMs,
      };
    };

    // JIT 워밍업으로 첫 실행 컴파일 지연을 제거해 순수 정규화 시간을 측정한다.
    expect(measureSingleLayerId("---hero_1---").entityId).toBe("layer-hero_1-11");
    expect(measureSingleLayerId("!!!alpha  beta!!!").entityId).toBe("layer-alpha-beta-11");

    const dashesResult = measureSingleLayerId(onlyDashes);
    expect(dashesResult.entityId).toBe("layer-11");
    expect(dashesResult.elapsedMs, "'-'.repeat(100_000) 정규화 소요(ms)").toBeLessThan(50);

    const trailingBangResult = measureSingleLayerId(trailingBang);
    expect(trailingBangResult.entityId).toBe("layer-a-11");
    expect(trailingBangResult.elapsedMs, "'a' + '-'.repeat(100_000) + '!' 정규화 소요(ms)").toBeLessThan(50);

    const sandwichedResult = measureSingleLayerId(sandwichedDashes);
    expect(sandwichedResult.entityId).toBe(`layer-a${"-".repeat(47)}-11`);
    expect(sandwichedResult.elapsedMs, "'a' + '-'.repeat(100_000) + 'b' 정규화 소요(ms)").toBeLessThan(50);
  });
});
