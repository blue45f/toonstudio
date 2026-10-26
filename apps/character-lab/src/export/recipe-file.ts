/**
 * 레시피 JSON 파일 저장·불러오기. 파싱은 contracts/recipe.ts `parseRecipe`(strict zod, 미래 버전 거부)를 쓴다.
 * 페인트 레이어는 PNG base64 레코드로 레시피에 포함한다.
 */
import { createDefaultRecipe, failVisible, parseRecipe, recipeDigest } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import { decodePaintLayerRecord, encodePaintLayerRecord } from "./paint-layer-record";
import {
  hexToUnitRgb,
  parseShaperPartPreset,
  rgbFloatStringsToHex,
  serializeShaperPartPreset,
  tokenizeShaperPresetLines,
} from "./shaper-preset";

import type {
  ShaperPartPresetData,
  ShaperPresetAccessoryRecord,
  ShaperPresetHairBaseZoneRecord,
  ShaperPresetHairStrandRecord,
  ShaperPresetLinePointRecord,
  ShaperPresetLineRecord,
  ShaperPresetTransformRecord,
} from "./shaper-preset";
import type { CharacterRecipe, LabFailure, PaintLayer, ParseRecipeResult } from "../contracts";

export const RECIPE_FILE_SUFFIX = ".character.json";
export const RECIPE_MIME = "application/json";
/** 파일 하나의 상한(페인트 레이어 포함) */
export const MAX_RECIPE_FILE_BYTES = 64 * 1024 * 1024;

/** 키 정렬·2칸 들여쓰기(사람이 읽는 파일이면서 바이트 결정적) */
export function serializeRecipe(recipe: CharacterRecipe): string {
  return `${JSON.stringify(JSON.parse(stableStringify(recipe)), null, 2)}\n`;
}

export function parseRecipeFile(text: string, now?: number): ParseRecipeResult {
  if (text.length > MAX_RECIPE_FILE_BYTES) {
    return {
      ok: false,
      failure: failVisible(
        "recipe-file-too-large",
        `레시피 파일이 상한(${MAX_RECIPE_FILE_BYTES} B)을 넘습니다.`,
        undefined,
        now,
      ),
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      failure: failVisible("recipe-json-syntax", "레시피 파일이 올바른 JSON이 아닙니다.", error, now),
    };
  }
  return parseRecipe(json, now);
}

function datePart(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function recipeFileName(recipe: CharacterRecipe, date: Date = new Date()): string {
  return `character-${recipeDigest(recipe).slice(0, 8)}-${datePart(date)}${RECIPE_FILE_SUFFIX}`;
}

/** 레시피에 페인트 레이어를 PNG base64로 넣는다(빈 레이어는 제외). */
export async function embedPaintLayers(
  recipe: CharacterRecipe,
  layers: readonly PaintLayer[],
): Promise<CharacterRecipe> {
  const records = [];
  for (const layer of layers) {
    if (layer.rgba.every((b) => b === 0)) continue;
    records.push(await encodePaintLayerRecord(layer));
  }
  return { ...recipe, paint: { layers: records } };
}

export interface ExtractedPaintLayers {
  readonly layers: readonly PaintLayer[];
  readonly failures: readonly LabFailure[];
}

/** 레시피의 페인트 레코드를 디코드한다. 깨진 레코드는 건너뛰고 사유를 모은다. */
export async function extractPaintLayers(
  recipe: CharacterRecipe,
  now?: number,
): Promise<ExtractedPaintLayers> {
  const layers: PaintLayer[] = [];
  const failures: LabFailure[] = [];
  for (const record of recipe.paint.layers) {
    const result = await decodePaintLayerRecord(record, now);
    if (result.ok) layers.push(result.layer);
    else failures.push(result.failure);
  }
  return { layers, failures };
}

export interface ShaperStylePresetData {
  readonly version: string;
  readonly hairColorHex?: string;
  readonly skinColorHex?: string;
  readonly shadeTexId?: number;
  readonly shadeColorHex?: string;
  readonly shadePos?: number;
  readonly shadeWidth?: number;
  readonly reflectiveLightTexId?: number;
  readonly reflectiveLightColorHex?: string;
  readonly reflectiveLightPos?: number;
  readonly reflectiveLightWidth?: number;
  readonly outlineColorHex?: string;
  readonly outlineThickness?: number;
  readonly outlinePressure?: boolean;
  readonly disableHairInline?: boolean;
  readonly shadowType?: number;
  readonly lightAngleX?: number;
  readonly lightAngleY?: number;
}

/**
 * SHAPER HeadPartsManager::LoadStyle(0x060001fc) 텍스트 DSL 파서:
 * 첫 줄 버전 헤더 + 쉼표(,) 구분 `key*v1/v2/...` 토큰을 해독해 스타일 설정을 추출한다.
 */
export function parseShaperStylePreset(text: string): ShaperStylePresetData {
  const { version, pairs } = tokenizeShaperPresetLines(text);
  const out: {
    version: string;
    hairColorHex?: string;
    skinColorHex?: string;
    shadeTexId?: number;
    shadeColorHex?: string;
    shadePos?: number;
    shadeWidth?: number;
    reflectiveLightTexId?: number;
    reflectiveLightColorHex?: string;
    reflectiveLightPos?: number;
    reflectiveLightWidth?: number;
    outlineColorHex?: string;
    outlineThickness?: number;
    outlinePressure?: boolean;
    disableHairInline?: boolean;
    shadowType?: number;
    lightAngleX?: number;
    lightAngleY?: number;
  } = { version };

  for (const [key, val] of pairs) {
    switch (key) {
      case "hC": {
        const hex = rgbFloatStringsToHex(val.split("/"));
        if (hex !== undefined) out.hairColorHex = hex;
        break;
      }
      case "sC": {
        const hex = rgbFloatStringsToHex(val.split("/"));
        if (hex !== undefined) out.skinColorHex = hex;
        break;
      }
      case "ssT":
        out.shadeTexId = Number.parseInt(val, 10);
        break;
      case "ssC": {
        const hex = rgbFloatStringsToHex(val.split("/"));
        if (hex !== undefined) out.shadeColorHex = hex;
        break;
      }
      case "ssL":
        out.shadePos = Number.parseFloat(val);
        break;
      case "ssW":
        out.shadeWidth = Number.parseFloat(val);
        break;
      case "rsT":
        out.reflectiveLightTexId = Number.parseInt(val, 10);
        break;
      case "rsC": {
        const hex = rgbFloatStringsToHex(val.split("/"));
        if (hex !== undefined) out.reflectiveLightColorHex = hex;
        break;
      }
      case "rsL":
        out.reflectiveLightPos = Number.parseFloat(val);
        break;
      case "rsW":
        out.reflectiveLightWidth = Number.parseFloat(val);
        break;
      case "olC": {
        const hex = rgbFloatStringsToHex(val.split("/"));
        if (hex !== undefined) out.outlineColorHex = hex;
        break;
      }
      case "olT":
        out.outlineThickness = Number.parseFloat(val);
        break;
      case "olP":
        out.outlinePressure = Number.parseInt(val, 10) !== 0;
        break;
      case "hID":
        out.disableHairInline = Number.parseInt(val, 10) !== 0;
        break;
      case "shT":
        out.shadowType = Number.parseInt(val, 10);
        break;
      case "lAX":
        out.lightAngleX = Number.parseFloat(val);
        break;
      case "lAY":
        out.lightAngleY = Number.parseFloat(val);
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * SHAPER HeadPartsManager::SaveStyle (0x060001fa) 텍스트 DSL 직렬화기
 */
export function serializeShaperStylePreset(data: ShaperStylePresetData): string {
  const tokens: string[] = [];
  const pushColor = (key: string, hex: string | undefined): void => {
    if (hex === undefined) return;
    const rgb = hexToUnitRgb(hex);
    if (rgb !== undefined) {
      tokens.push(`${key}*${rgb[0]}/${rgb[1]}/${rgb[2]}`);
    }
  };
  pushColor("hC", data.hairColorHex);
  pushColor("sC", data.skinColorHex);
  if (data.shadeTexId !== undefined) tokens.push(`ssT*${data.shadeTexId}`);
  pushColor("ssC", data.shadeColorHex);
  if (data.shadePos !== undefined) tokens.push(`ssL*${data.shadePos}`);
  if (data.shadeWidth !== undefined) tokens.push(`ssW*${data.shadeWidth}`);
  if (data.reflectiveLightTexId !== undefined) tokens.push(`rsT*${data.reflectiveLightTexId}`);
  pushColor("rsC", data.reflectiveLightColorHex);
  if (data.reflectiveLightPos !== undefined) tokens.push(`rsL*${data.reflectiveLightPos}`);
  if (data.reflectiveLightWidth !== undefined) tokens.push(`rsW*${data.reflectiveLightWidth}`);
  pushColor("olC", data.outlineColorHex);
  if (data.outlineThickness !== undefined) tokens.push(`olT*${data.outlineThickness}`);
  if (data.outlinePressure !== undefined) tokens.push(`olP*${data.outlinePressure ? 1 : 0}`);
  if (data.disableHairInline !== undefined) tokens.push(`hID*${data.disableHairInline ? 1 : 0}`);
  if (data.shadowType !== undefined) tokens.push(`shT*${data.shadowType}`);
  if (data.lightAngleX !== undefined) tokens.push(`lAX*${data.lightAngleX}`);
  if (data.lightAngleY !== undefined) tokens.push(`lAY*${data.lightAngleY}`);

  return `${data.version || "1.0"}\n${tokens.join(",")}`;
}

/**
 * 파싱된 SHAPER 스타일/파츠 프리셋 데이터를 CharacterRecipe v3로 클린룸 변환한다.
 */
export function shaperPresetToCharacterRecipe(options: {
  readonly style?: ShaperStylePresetData;
  readonly part?: ShaperPartPresetData;
  readonly baseRecipe?: CharacterRecipe;
}): CharacterRecipe {
  const base = options.baseRecipe ?? createDefaultRecipe();
  const { style, part } = options;

  const colors = {
    ...base.colors,
    ...(style?.skinColorHex !== undefined ? { skin: style.skinColorHex } : {}),
    ...(style?.hairColorHex !== undefined ? { hair: style.hairColorHex, brow: style.hairColorHex } : {}),
    ...(part?.colorsHex[0] !== undefined ? { top: part.colorsHex[0] } : {}),
    ...(part?.colorsHex[1] !== undefined ? { bottom: part.colorsHex[1] } : {}),
  };

  const clampSym = (v: number): number => Math.min(1, Math.max(-1, v));
  const body = {
    ...base.body,
    ...(part?.muscle !== undefined && Number.isFinite(part.muscle)
      ? { shoulderWidth: clampSym(part.muscle * 2 - 1) }
      : {}),
    ...(part?.fat !== undefined && Number.isFinite(part.fat)
      ? { hip: clampSym(part.fat * 2 - 1) }
      : {}),
  };

  const lineWidthMm =
    style?.outlineThickness !== undefined && Number.isFinite(style.outlineThickness)
      ? Math.min(20, Math.max(0, style.outlineThickness * 4))
      : base.shading.look.line.widthMm;

  const shadeRgb = style?.shadeColorHex !== undefined ? hexToUnitRgb(style.shadeColorHex) : undefined;
  const outlineRgb = style?.outlineColorHex !== undefined ? hexToUnitRgb(style.outlineColorHex) : undefined;

  return {
    ...base,
    colors,
    body,
    shading: {
      ...base.shading,
      mode: style !== undefined ? "toon" : base.shading.mode,
      look: {
        ...base.shading.look,
        shade:
          shadeRgb !== undefined
            ? {
                skin: { kind: "multiply", rgb: [shadeRgb[0], shadeRgb[1], shadeRgb[2]] },
                hair: { kind: "multiply", rgb: [shadeRgb[0], shadeRgb[1], shadeRgb[2]] },
                other: { kind: "multiply", rgb: [shadeRgb[0], shadeRgb[1], shadeRgb[2]] },
              }
            : base.shading.look.shade,
        line: {
          ...base.shading.look.line,
          widthMm: lineWidthMm,
          color:
            outlineRgb !== undefined
              ? { mode: "fixed", rgb: [outlineRgb[0], outlineRgb[1], outlineRgb[2]] }
              : base.shading.look.line.color,
        },
      },
    },
  };
}

export interface ShaperProjectState {
  readonly headParts: Readonly<Partial<Record<0 | 1 | 2 | 3 | 4, ShaperPartPresetData>>>;
  readonly hairPart?: ShaperPartPresetData;
  readonly bodyPart?: ShaperPartPresetData;
  readonly costumes?: Readonly<Partial<Record<8 | 9 | 10, ShaperPartPresetData>>>;
  readonly accessories?: readonly ShaperPartPresetData[];
  readonly poseAndCamera?: ShaperPartPresetData;
  readonly style?: ShaperStylePresetData;
}

/**
 * SHAPER UIManager::<SaveProject>d__77::MoveNext (0x06000683) 역공학 내재화:
 * `.shaper` 프로젝트 아카이브 내부의 파일 엔트리 맵(`0..4.preset`, `6.preset`, `7.preset`, `8..10.preset`, `11_k.preset`, `12.preset`, `style.preset`)을
 * SHAPER의 6단계 직렬화 순서 그대로 생성한다.
 */
export function buildShaperProjectArchiveEntries(
  project: ShaperProjectState,
): Readonly<Record<string, string>> {
  const entries: Record<string, string> = {};

  // Step 1: 두상 파츠 0..4 (head, eyes, nose, mouth, ears) 및 헤어 6
  for (const partIdx of [0, 1, 2, 3, 4] as const) {
    const part = project.headParts[partIdx];
    if (part !== undefined) {
      entries[`${partIdx}.preset`] = serializeShaperPartPreset(part);
    }
  }
  if (project.hairPart !== undefined) {
    entries["6.preset"] = serializeShaperPartPreset(project.hairPart);
  }

  // Step 2: 체형 파츠 7 (body)
  if (project.bodyPart !== undefined) {
    entries["7.preset"] = serializeShaperPartPreset(project.bodyPart);
  }

  // Step 3: 의상 8..10 (clothTop, clothBottom, shoes) 및 액세서리 11_0, 11_1, ...
  if (project.costumes !== undefined) {
    for (const slot of [8, 9, 10] as const) {
      const costume = project.costumes[slot];
      if (costume !== undefined) {
        entries[`${slot}.preset`] = serializeShaperPartPreset(costume);
      }
    }
  }
  if (project.accessories !== undefined) {
    project.accessories.forEach((acc, idx) => {
      entries[`11_${idx}.preset`] = serializeShaperPartPreset(acc);
    });
  }

  // Step 4: 포즈 및 카메라 12.preset
  if (project.poseAndCamera !== undefined) {
    entries["12.preset"] = serializeShaperPartPreset(project.poseAndCamera);
  }

  // Step 5: 머티리얼 및 라이팅 style.preset
  if (project.style !== undefined) {
    entries["style.preset"] = serializeShaperStylePreset(project.style);
  }

  return entries;
}

/**
 * SHAPER UIManager::<OpenProject>d__74::MoveNext (0x0600067d) 역공학 내재화:
 * 압축 해제된 `.shaper` 프로젝트 아카이브 엔트리 맵에서 두상(`0..4.preset`), 헤어(`6.preset`), 체형(`7.preset`),
 * 의상(`8..10.preset`), 액세서리(`11_*.preset`), 포즈+카메라(`12.preset`), 스타일(`style.preset`)을 복원한다.
 */
export function parseShaperProjectArchiveEntries(
  entries: Readonly<Record<string, string>>,
): ShaperProjectState {
  const headParts: Partial<Record<0 | 1 | 2 | 3 | 4, ShaperPartPresetData>> = {};
  for (const partIdx of [0, 1, 2, 3, 4] as const) {
    const raw = entries[`${partIdx}.preset`];
    if (raw !== undefined) {
      const parsed = parseShaperPartPreset(raw);
      if (parsed !== null) {
        headParts[partIdx] = parsed;
      }
    }
  }

  const hairPart =
    entries["6.preset"] !== undefined
      ? (parseShaperPartPreset(entries["6.preset"]) ?? undefined)
      : undefined;
  const bodyPart =
    entries["7.preset"] !== undefined
      ? (parseShaperPartPreset(entries["7.preset"]) ?? undefined)
      : undefined;

  const costumes: Partial<Record<8 | 9 | 10, ShaperPartPresetData>> = {};
  for (const slot of [8, 9, 10] as const) {
    const raw = entries[`${slot}.preset`];
    if (raw !== undefined) {
      const parsed = parseShaperPartPreset(raw);
      if (parsed !== null) {
        costumes[slot] = parsed;
      }
    }
  }

  const accessoryKeys = Object.keys(entries)
    .filter((key) => /^11_\d+\.preset$/.test(key))
    .sort((a, b) => {
      const idxA = Number.parseInt(a.slice(3), 10);
      const idxB = Number.parseInt(b.slice(3), 10);
      return idxA - idxB;
    });
  const accessories: ShaperPartPresetData[] = [];
  for (const key of accessoryKeys) {
    const parsed = parseShaperPartPreset(entries[key]);
    if (parsed !== null) {
      accessories.push(parsed);
    }
  }

  const poseAndCamera =
    entries["12.preset"] !== undefined
      ? (parseShaperPartPreset(entries["12.preset"]) ?? undefined)
      : undefined;
  const style =
    entries["style.preset"] !== undefined
      ? (parseShaperStylePreset(entries["style.preset"]) ?? undefined)
      : undefined;

  return {
    headParts,
    ...(hairPart !== undefined ? { hairPart } : {}),
    ...(bodyPart !== undefined ? { bodyPart } : {}),
    ...(Object.keys(costumes).length > 0 ? { costumes } : {}),
    ...(accessories.length > 0 ? { accessories } : {}),
    ...(poseAndCamera !== undefined ? { poseAndCamera } : {}),
    ...(style !== undefined ? { style } : {}),
  };
}

export { parseShaperPartPreset, serializeShaperPartPreset };
export type {
  ShaperPartPresetData,
  ShaperPresetAccessoryRecord,
  ShaperPresetHairBaseZoneRecord,
  ShaperPresetHairStrandRecord,
  ShaperPresetLinePointRecord,
  ShaperPresetLineRecord,
  ShaperPresetTransformRecord,
};
