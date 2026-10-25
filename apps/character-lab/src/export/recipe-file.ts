/**
 * 레시피 JSON 파일 저장·불러오기. 파싱은 contracts/recipe.ts `parseRecipe`(strict zod, 미래 버전 거부)를 쓴다.
 * 페인트 레이어는 PNG base64 레코드로 레시피에 포함한다.
 */
import { createDefaultRecipe, failVisible, parseRecipe, recipeDigest } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import { decodePaintLayerRecord, encodePaintLayerRecord } from "./paint-layer-record";

import type { CharacterRecipe, LabFailure, PaintLayer, ParseRecipeResult, Vec3 } from "../contracts";

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
    return { ok: false, failure: failVisible("recipe-file-too-large", `레시피 파일이 상한(${MAX_RECIPE_FILE_BYTES} B)을 넘습니다.`, undefined, now) };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, failure: failVisible("recipe-json-syntax", "레시피 파일이 올바른 JSON이 아닙니다.", error, now) };
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
export async function embedPaintLayers(recipe: CharacterRecipe, layers: readonly PaintLayer[]): Promise<CharacterRecipe> {
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
export async function extractPaintLayers(recipe: CharacterRecipe, now?: number): Promise<ExtractedPaintLayers> {
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

export interface ShaperPartPresetData {
  readonly version: string;
  readonly partType?: number;
  readonly baseMeshId?: number;
  readonly name?: string;
  readonly sex?: number;
  readonly muscle?: number;
  readonly fat?: number;
  readonly camPos?: readonly [number, number, number, number];
  readonly camAngles?: Vec3;
  readonly camFov?: number;
  readonly eyeballHighlightType?: number;
  readonly eyeballHighlightPos?: readonly [number, number];
  readonly eyeballHighlightAlpha?: number;
  readonly seamPosC?: Vec3;
  readonly seamPosL?: Vec3;
  readonly seamPosR?: Vec3;
  readonly boneNames: readonly string[];
  readonly bonePositions: readonly Vec3[];
  readonly boneAngles: readonly Vec3[];
  readonly boneScales: readonly Vec3[];
  readonly colorsHex: readonly string[];
  readonly outlineRatios: readonly number[];
}

function rgbFloatStringsToHex(parts: readonly string[]): string | undefined {
  if (parts.length < 3) return undefined;
  const r = Number.parseFloat(parts[0] ?? "0");
  const g = Number.parseFloat(parts[1] ?? "0");
  const b = Number.parseFloat(parts[2] ?? "0");
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return undefined;
  const toByte = (v: number): string =>
    Math.min(255, Math.max(0, Math.round(v * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function parseVec3Slash(raw: string): Vec3 | undefined {
  const parts = raw.split("/");
  if (parts.length < 3) return undefined;
  const x = Number.parseFloat(parts[0] ?? "0");
  const y = Number.parseFloat(parts[1] ?? "0");
  const z = Number.parseFloat(parts[2] ?? "0");
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
  return [x, y, z];
}

function tokenizeShaperPresetLines(text: string): {
  readonly version: string;
  readonly pairs: readonly (readonly [string, string])[];
} {
  const lines = text
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const version = lines[0] ?? "1.0";
  const pairs: (readonly [string, string])[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const tokens = lines[i]?.split(",") ?? [];
    for (const token of tokens) {
      const starIdx = token.indexOf("*");
      if (starIdx <= 0) continue;
      const key = token.slice(0, starIdx).trim();
      const val = token.slice(starIdx + 1).trim();
      pairs.push([key, val]);
    }
  }
  return { version, pairs };
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
 * SHAPER HeadPartsManager::CreateHeadPartFromPreset(0x060001e5) 텍스트 DSL 파서:
 * 독점 3D 메시 에셋(.obj/.fbx)을 복제하지 않고 체형·카메라·본·경계 오프셋·색상 팔레트만 클린룸으로 추출한다.
 */
export function parseShaperPartPreset(text: string): ShaperPartPresetData {
  const { version, pairs } = tokenizeShaperPresetLines(text);
  const boneNames: string[] = [];
  const bonePositions: Vec3[] = [];
  const boneAngles: Vec3[] = [];
  const boneScales: Vec3[] = [];
  const colorsHex: string[] = [];
  const outlineRatios: number[] = [];

  const out: {
    version: string;
    partType?: number;
    baseMeshId?: number;
    name?: string;
    sex?: number;
    muscle?: number;
    fat?: number;
    camPos?: readonly [number, number, number, number];
    camAngles?: Vec3;
    camFov?: number;
    eyeballHighlightType?: number;
    eyeballHighlightPos?: readonly [number, number];
    eyeballHighlightAlpha?: number;
    seamPosC?: Vec3;
    seamPosL?: Vec3;
    seamPosR?: Vec3;
  } = { version };

  for (const [key, val] of pairs) {
    switch (key) {
      case "mt":
        out.partType = Number.parseInt(val, 10);
        break;
      case "mid":
        out.baseMeshId = Number.parseInt(val, 10);
        break;
      case "name":
        out.name = val;
        break;
      case "sex":
        out.sex = Number.parseInt(val, 10);
        break;
      case "muscle":
        out.muscle = Number.parseFloat(val);
        break;
      case "fat":
        out.fat = Number.parseFloat(val);
        break;
      case "camP": {
        const parts = val.split("/").map((s) => Number.parseFloat(s));
        if (parts.length >= 4 && parts.every(Number.isFinite)) {
          out.camPos = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
        }
        break;
      }
      case "camR": {
        const v = parseVec3Slash(val);
        if (v) out.camAngles = v;
        break;
      }
      case "camFov":
        out.camFov = Number.parseFloat(val);
        break;
      case "ebht":
        out.eyeballHighlightType = Number.parseInt(val, 10);
        break;
      case "ebhp": {
        const parts = val.split("/").map((s) => Number.parseFloat(s));
        if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          out.eyeballHighlightPos = [parts[0] ?? 0, parts[1] ?? 0];
        }
        break;
      }
      case "ebha":
        out.eyeballHighlightAlpha = Number.parseFloat(val);
        break;
      case "sposC": {
        const v = parseVec3Slash(val);
        if (v) out.seamPosC = v;
        break;
      }
      case "sposL": {
        const v = parseVec3Slash(val);
        if (v) out.seamPosL = v;
        break;
      }
      case "sposR": {
        const v = parseVec3Slash(val);
        if (v) out.seamPosR = v;
        break;
      }
      case "bN":
        boneNames.push(val);
        break;
      case "bP": {
        const v = parseVec3Slash(val);
        if (v) bonePositions.push(v);
        break;
      }
      case "bA": {
        const v = parseVec3Slash(val);
        if (v) boneAngles.push(v);
        break;
      }
      case "bS": {
        const v = parseVec3Slash(val);
        if (v) boneScales.push(v);
        break;
      }
      case "cC": {
        const hex = rgbFloatStringsToHex(val.split("/"));
        if (hex !== undefined) colorsHex.push(hex);
        break;
      }
      case "oR": {
        const r = Number.parseFloat(val);
        if (Number.isFinite(r)) outlineRatios.push(r);
        break;
      }
      default:
        break;
    }
  }

  return {
    ...out,
    boneNames,
    bonePositions,
    boneAngles,
    boneScales,
    colorsHex,
    outlineRatios,
  };
}

function hexToUnitRgb(hex: string): readonly [number, number, number] | undefined {
  if (!/^#[0-9a-fA-F]{6}$/u.test(hex)) return undefined;
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
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
