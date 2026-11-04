/**
 * @file csp-bfps-cscr-prmi.ts
 * @description Clip Studio Paint 5.1.5 브러시 모양 프리셋 데이터베이스(`BrushPreset.bfps`),
 * 소재 카탈로그 경로 복구 테이블(`catalogPathRepairTable.cscr`),
 * 그리고 프로모션 일러스트 스크램블 이미지(`.prmi` 8-bit 비트 순열 암호화 JFIF & `ImageInfo.xml`) 코덱.
 */

// ============================================================================
// 1. BrushPreset.bfps (14 Built-in Brush Shape Presets / 브러시 모양 프리셋)
// ============================================================================

export type CspBrushShapePresetId =
  | "dotted_line"
  | "dashed_line"
  | "airbrush"
  | "watercolor"
  | "rough_watercolor"
  | "gouache"
  | "dry_india_ink"
  | "chalk"
  | "pencil_v3_1"
  | "flat_marker"
  | "rough_pen"
  | "real_g_pen"
  | "pen"
  | "rough_hard_pen";

export interface CspBrushShapeBfpsPresetSpec {
  readonly presetId: CspBrushShapePresetId;
  readonly nodeId: number;
  readonly nodeNameKo: string;
  readonly variantId: number;
  readonly initVariantId: number;
  readonly nodeIcon: number;
  readonly opacity: number;
  readonly antiAlias: number;
  readonly compositeMode: number;
  readonly brushSize: number;
  readonly brushHardness: number;
  readonly brushInterval: number;
  readonly brushThickness: number;
  readonly brushRotationDeg: number;
  readonly usePatternImage: boolean;
  readonly textureDensity: number;
  readonly useDualBrush: boolean;
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/BrushPreset/korean/BrushPreset.bfps` (135,168 bytes)
 * `Node` 및 `Variant` 테이블에서 전수 추출한 14종 기본 브러시 모양 프리셋.
 */
export const CSP_BRUSH_SHAPE_BFPS_PRESETS: readonly CspBrushShapeBfpsPresetSpec[] = [
  {
    presetId: "dotted_line",
    nodeId: 31,
    nodeNameKo: "점선",
    variantId: 61,
    initVariantId: 62,
    nodeIcon: 102,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 80,
    brushInterval: 200.0,
    brushThickness: 100,
    brushRotationDeg: 0.0,
    usePatternImage: false,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "dashed_line",
    nodeId: 32,
    nodeNameKo: "파선",
    variantId: 63,
    initVariantId: 64,
    nodeIcon: 102,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 10.0,
    brushThickness: 100,
    brushRotationDeg: 0.0,
    usePatternImage: true,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "airbrush",
    nodeId: 33,
    nodeNameKo: "에어브러시",
    variantId: 65,
    initVariantId: 66,
    nodeIcon: 102,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 1,
    brushInterval: 10.0,
    brushThickness: 100,
    brushRotationDeg: 0.0,
    usePatternImage: false,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "watercolor",
    nodeId: 43,
    nodeNameKo: "수채",
    variantId: 85,
    initVariantId: 86,
    nodeIcon: 102,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 10.0,
    brushThickness: 100,
    brushRotationDeg: 0.0,
    usePatternImage: false,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "rough_watercolor",
    nodeId: 44,
    nodeNameKo: "거친 수채",
    variantId: 87,
    initVariantId: 88,
    nodeIcon: 104,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 15.0,
    brushThickness: 100,
    brushRotationDeg: 0.0,
    usePatternImage: true,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "gouache",
    nodeId: 45,
    nodeNameKo: "구아슈",
    variantId: 89,
    initVariantId: 90,
    nodeIcon: 110,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 3.0,
    brushThickness: 100,
    brushRotationDeg: 45.0,
    usePatternImage: true,
    textureDensity: 100,
    useDualBrush: true,
  },
  {
    presetId: "dry_india_ink",
    nodeId: 46,
    nodeNameKo: "먹(마른붓질)",
    variantId: 91,
    initVariantId: 92,
    nodeIcon: 112,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 0.97,
    brushThickness: 100,
    brushRotationDeg: 0.0,
    usePatternImage: true,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "chalk",
    nodeId: 47,
    nodeNameKo: "초크",
    variantId: 93,
    initVariantId: 94,
    nodeIcon: 113,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 81,
    brushInterval: 10.0,
    brushThickness: 50,
    brushRotationDeg: 0.0,
    usePatternImage: true,
    textureDensity: 80,
    useDualBrush: true,
  },
  {
    presetId: "pencil_v3_1",
    nodeId: 48,
    nodeNameKo: "연필 [Ver.3.1]",
    variantId: 95,
    initVariantId: 96,
    nodeIcon: 102,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 10.0,
    brushThickness: 100,
    brushRotationDeg: 180.0,
    usePatternImage: true,
    textureDensity: 80,
    useDualBrush: true,
  },
  {
    presetId: "flat_marker",
    nodeId: 49,
    nodeNameKo: "평면 마커",
    variantId: 97,
    initVariantId: 98,
    nodeIcon: 103,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 70,
    brushInterval: 0.1,
    brushThickness: 30,
    brushRotationDeg: 90.0,
    usePatternImage: false,
    textureDensity: 44,
    useDualBrush: true,
  },
  {
    presetId: "rough_pen",
    nodeId: 50,
    nodeNameKo: "거친 펜",
    variantId: 99,
    initVariantId: 100,
    nodeIcon: 101,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 60,
    brushInterval: 10.0,
    brushThickness: 60,
    brushRotationDeg: 0.0,
    usePatternImage: false,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "real_g_pen",
    nodeId: 51,
    nodeNameKo: "리얼 G 펜",
    variantId: 101,
    initVariantId: 102,
    nodeIcon: 101,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 10.0,
    brushThickness: 85,
    brushRotationDeg: 0.0,
    usePatternImage: true,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "pen",
    nodeId: 52,
    nodeNameKo: "펜",
    variantId: 103,
    initVariantId: 104,
    nodeIcon: 102,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 10.0,
    brushThickness: 100,
    brushRotationDeg: 0.0,
    usePatternImage: false,
    textureDensity: 50,
    useDualBrush: true,
  },
  {
    presetId: "rough_hard_pen",
    nodeId: 53,
    nodeNameKo: "거칠고 딱딱한 펜",
    variantId: 105,
    initVariantId: 106,
    nodeIcon: 101,
    opacity: 90,
    antiAlias: 1,
    compositeMode: 0,
    brushSize: 15.0,
    brushHardness: 100,
    brushInterval: 10.0,
    brushThickness: 150,
    brushRotationDeg: 0.0,
    usePatternImage: true,
    textureDensity: 50,
    useDualBrush: true,
  },
] as const;

/**
 * 클립스튜디오의 '오브젝트(벡터 선) 브러시 모양 변경' 기능과 동일하게,
 * 선택한 `.bfps` 브러시 모양 프리셋을 기존 벡터/브러시 스트로크 속성에 투영합니다.
 */
export function applyCspBrushShapePresetToStroke(params: {
  readonly presetId: CspBrushShapePresetId;
  readonly preserveBrushSize?: number;
}): {
  readonly preset: CspBrushShapeBfpsPresetSpec;
  readonly effectiveBrushSize: number;
  readonly effectiveStepDistancePx: number;
  readonly aspectRatio: number;
} {
  const preset =
    CSP_BRUSH_SHAPE_BFPS_PRESETS.find((p) => p.presetId === params.presetId) ??
    CSP_BRUSH_SHAPE_BFPS_PRESETS[12]!;
  const effectiveBrushSize = Math.max(0.5, params.preserveBrushSize ?? preset.brushSize);
  const effectiveStepDistancePx = Math.max(
    0.25,
    (effectiveBrushSize * preset.brushInterval) / 100,
  );
  const aspectRatio = Math.max(0.1, Math.min(2.0, preset.brushThickness / 100));

  return {
    preset,
    effectiveBrushSize,
    effectiveStepDistancePx,
    aspectRatio,
  };
}

// ============================================================================
// 2. catalogPathRepairTable.cscr (Material Path Repair Engine / 소재 경로 복구)
// ============================================================================

export interface CspCatalogPathRepairRow {
  readonly id: number;
  readonly repairPath: string;
  readonly targetPath: string;
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Material/catalogPathRepairTable.cscr` (41,984 bytes, 244 rows)
 * `repairtable(_PW_ID, repairpath, targetpath)` 대표 매핑 엔트리.
 */
export const CSP_CATALOG_PATH_REPAIR_SAMPLES: readonly CspCatalogPathRepairRow[] = [
  {
    id: 1,
    repairPath: ".:Paint001:004e7b2591-6f43-b1bc-cd4f-8b9d6efca2:data:material.layer",
    targetPath: ".:Paint003:709a76dd84-7844-8398-2f07-8963e54ba0:data:material.layer",
  },
  {
    id: 2,
    repairPath: ".:Paint001:00c8afd84f-9849-d5b9-eb8d-aae1e7589f:data:material.layer",
    targetPath: ".:Paint001:0d828acf7a-5a40-5b88-ffa8-1d1f058651:data:material.layer",
  },
  {
    id: 3,
    repairPath: ".:Paint002:014b9ce008-3644-9bbe-04cc-53cdc5f063:data:material.layer",
    targetPath: ".:Paint004:c1da911764-ee48-d894-13b0-6fab24965e:data:material.layer",
  },
  {
    id: 4,
    repairPath: ".:Paint002:0269f2b58f-784d-ce80-4d16-81ffdbf49a:data:material.layer",
    targetPath: ".:Paint004:a4906af97d-3343-0fa1-4d3a-1ccecbd875:data:material.layer",
  },
  {
    id: 5,
    repairPath: ".:Paint002:063b8dcd00-b54a-2395-809f-8dacc86eb9:data:material.layer",
    targetPath: ".:Paint005:fe443de78c-e64f-d4a3-d2ce-8a3d3e7882:data:material.layer",
  },
  {
    id: 6,
    repairPath: ".:Paint003:0720b486df-9844-5f94-d7ee-1206faaf89:data:material.layer",
    targetPath: ".:Paint004:ca9fc20aef-4048-2097-4e54-87a932bd01:data:material.layer",
  },
  {
    id: 7,
    repairPath: ".:Paint002:085df9951a-3a49-549b-fb3d-fe4e0dd676:data:material.layer",
    targetPath: ".:Paint005:d936d22ac4-ea47-de94-962d-45694248a7:data:material.layer",
  },
  {
    id: 8,
    repairPath: ".:Paint001:0a2f24d7e7-2641-b1a0-0295-d516448754:data:material.layer",
    targetPath: ".:Paint003:8437d6b6b9-1a4d-cb8b-bc51-7527e8d4b6:data:material.layer",
  },
] as const;

/**
 * 구버전 `.sut` / `.todb` / `.clip`에 기록된 소재 카탈로그 경로(`repairpath`)를
 * `catalogPathRepairTable.cscr` 매핑에 따라 현행 카탈로그 경로(`targetpath`)로 복구합니다.
 */
export function repairCspMaterialCatalogPath(
  materialPath: string,
  extraRows: readonly CspCatalogPathRepairRow[] = CSP_CATALOG_PATH_REPAIR_SAMPLES,
): {
  readonly originalPath: string;
  readonly resolvedPath: string;
  readonly wasRepaired: boolean;
  readonly packageFolder: string;
  readonly materialUuid: string;
} {
  const normalized = materialPath.trim().replace(/\//g, ":");
  const matched = extraRows.find((r) => r.repairPath === normalized);
  const resolvedPath = matched ? matched.targetPath : normalized;
  const parts = resolvedPath.split(":");
  return {
    originalPath: materialPath,
    resolvedPath,
    wasRepaired: matched !== undefined,
    packageFolder: parts[1] ?? "",
    materialUuid: parts[2] ?? "",
  };
}

// ============================================================================
// 3. .prmi (PromotionImage) 8-Bit Permutation Cipher & ImageInfo.xml Parser
// ============================================================================

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Promotion/Illustration/Image/*.prmi`에서
 * 역공학으로 규명한 JPEG -> PRMI 8비트 위치 순열 (`src_bit -> dst_bit`).
 * - bit 0 -> bit 7 (`0x01 -> 0x80`)
 * - bit 1 -> bit 2 (`0x02 -> 0x04`)
 * - bit 2 -> bit 4 (`0x04 -> 0x10`)
 * - bit 3 -> bit 6 (`0x08 -> 0x40`)
 * - bit 4 -> bit 1 (`0x10 -> 0x02`)
 * - bit 5 -> bit 3 (`0x20 -> 0x08`)
 * - bit 6 -> bit 5 (`0x40 -> 0x20`)
 * - bit 7 -> bit 0 (`0x80 -> 0x01`)
 */
export const CSP_PRMI_BIT_PERMUTATION = [7, 2, 4, 6, 1, 3, 5, 0] as const;
export const CSP_PRMI_INVERSE_BIT_PERMUTATION = [7, 4, 1, 5, 2, 6, 3, 0] as const;

const JPEG_TO_PRMI_LUT = new Uint8Array(256);
const PRMI_TO_JPEG_LUT = new Uint8Array(256);

for (let b = 0; b < 256; b += 1) {
  let encoded = 0;
  for (let srcBit = 0; srcBit < 8; srcBit += 1) {
    if (((b >>> srcBit) & 1) !== 0) {
      encoded |= 1 << CSP_PRMI_BIT_PERMUTATION[srcBit]!;
    }
  }
  JPEG_TO_PRMI_LUT[b] = encoded;
  PRMI_TO_JPEG_LUT[encoded] = b;
}

/**
 * 클립스튜디오 `.prmi` 스크램블 이미지 바이트열을 표준 JFIF JPEG 바이트열(`\xff\xd8\xff\xe0...`)로 복호화합니다.
 */
export function decodeCspPrmiToJpegBytes(prmiBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(prmiBytes.byteLength);
  for (let i = 0; i < prmiBytes.byteLength; i += 1) {
    out[i] = PRMI_TO_JPEG_LUT[prmiBytes[i]!]!;
  }
  return out;
}

/**
 * 표준 JPEG 바이트열을 클립스튜디오 `.prmi` 8비트 순열 스크램블 포맷(`\xff\x63\xff\x29...`)으로 인코딩합니다.
 */
export function encodeJpegBytesToCspPrmi(jpegBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(jpegBytes.byteLength);
  for (let i = 0; i < jpegBytes.byteLength; i += 1) {
    out[i] = JPEG_TO_PRMI_LUT[jpegBytes[i]!]!;
  }
  return out;
}

export interface CspPromotionImageInfoEntry {
  readonly author: string;
  readonly filePath: string;
  readonly logoColor: "black" | "white";
}

/**
 * `Settings/PAINT/Promotion/Illustration/<locale>/ImageInfo.xml` (`<promotionimageroot>`)을 파싱합니다.
 */
export function parseCspPromotionImageInfoXml(xmlText: string): {
  readonly version: string;
  readonly entries: readonly CspPromotionImageInfoEntry[];
} {
  const lowerXml = xmlText.toLowerCase();
  const rootStart = lowerXml.indexOf("<promotionimageroot");
  const rootEnd = rootStart >= 0 ? xmlText.indexOf(">", rootStart) : -1;
  const rootTag = rootStart >= 0 && rootEnd >= 0 ? xmlText.slice(rootStart, rootEnd + 1) : "";
  const rootVersionMatch = /\bversion\s*=\s*"([^"]*)"/i.exec(rootTag);
  const entries: CspPromotionImageInfoEntry[] = [];

  for (const segment of xmlText.split(/<\/promotionimageinfo>/i)) {
    const lowerSeg = segment.toLowerCase();
    const openIdx = lowerSeg.lastIndexOf("<promotionimageinfo");
    if (openIdx < 0) continue;
    const gtIdx = segment.indexOf(">", openIdx + 19);
    if (gtIdx < 0) continue;
    const openTag = segment.slice(openIdx, gtIdx + 1);
    const inner = segment.slice(gtIdx + 1);
    const authorMatch = /\bauthor\s*=\s*"([^"]*)"/i.exec(openTag);
    const filepathMatch = /\bfilepath\s*=\s*"([^"]*)"/i.exec(openTag);
    if (!authorMatch || !filepathMatch) continue;
    const author = authorMatch[1] ?? "";
    const filePath = filepathMatch[1] ?? "";
    const colorMatch = /\bcolor\s*=\s*"([^"]*)"/i.exec(inner);
    const logoColor = colorMatch?.[1]?.toLowerCase() === "white" ? "white" : "black";
    entries.push({ author, filePath, logoColor });
  }

  return {
    version: rootVersionMatch?.[1] ?? "1.0.0",
    entries,
  };
}
