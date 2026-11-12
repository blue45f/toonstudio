import { stripUtf8Bom } from "../shared/json-safety";

import type { Vec3 } from "../contracts";

export interface ShaperPresetTransformRecord {
  readonly position: Vec3;
  readonly eulerAngles: Vec3;
  readonly scale: Vec3;
}

export interface ShaperPresetHairStrandRecord {
  readonly id: number;
  readonly baseMeshId: number;
  readonly scaleCurveTime0: number;
  readonly scaleCurveTime1: number;
  readonly partMeshId: number;
  readonly partBaseMeshId: number;
  readonly triangleVertexIds: readonly [number, number, number];
  readonly v0d: number;
  readonly v1d: number;
  readonly rootLocalEuler: Vec3;
  readonly rotationAligned: boolean;
  readonly outlineEnabled: boolean;
}

export interface ShaperPresetHairBaseZoneRecord {
  readonly zone: number;
  readonly xUi: number;
  readonly yUi: number;
  readonly widthUi: number;
  readonly heightUi: number;
  readonly offsetTx: number;
  readonly offsetTy: number;
}

export interface ShaperPresetLineRecord {
  readonly id: number;
  readonly scaleCurveTime0: number;
  readonly scaleCurveTime1: number;
  readonly layer: number;
  readonly thickness: number;
  readonly pressureMode: number;
  readonly colorMode: number;
  readonly colorHex?: string;
}

export interface ShaperPresetLinePointRecord {
  readonly partMeshId: number;
  readonly partBaseMeshId: number;
  readonly triangleVertexIds: readonly [number, number, number];
  readonly v0d: number;
  readonly v1d: number;
  readonly thickness: number;
  readonly surfaceNormal: Vec3;
}

export interface ShaperPresetAccessoryRecord {
  readonly parentName: string;
  readonly position: Vec3;
  readonly eulerAngles: Vec3;
  readonly scale: Vec3;
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
  readonly eyeballTexId?: number;
  readonly eyeballTexPath?: string;
  readonly eyeballHighlightTexId?: number;
  readonly eyeballHighlightTexPath?: string;
  readonly eyeballLeftTransform?: ShaperPresetTransformRecord;
  readonly eyeballRightTransform?: ShaperPresetTransformRecord;
  readonly eyeballHighlightType?: number;
  readonly eyeballHighlightPos?: readonly [number, number];
  readonly eyeballHighlightAlpha?: number;
  readonly seamPosC?: Vec3;
  readonly seamPosL?: Vec3;
  readonly seamPosR?: Vec3;
  readonly controlVertices?: readonly Vec3[];
  readonly controlPowers?: readonly number[];
  readonly hairs?: readonly ShaperPresetHairStrandRecord[];
  readonly hairControlTransforms?: readonly ShaperPresetTransformRecord[];
  readonly hairBaseMeshId?: number;
  readonly hairBaseZones?: readonly ShaperPresetHairBaseZoneRecord[];
  readonly lines?: readonly ShaperPresetLineRecord[];
  readonly lineBaseMeshTypes?: readonly number[];
  readonly linePoints?: readonly ShaperPresetLinePointRecord[];
  readonly linePointBaseMeshTypes?: readonly number[];
  readonly accessories?: readonly ShaperPresetAccessoryRecord[];
  readonly boneNames: readonly string[];
  readonly bonePositions: readonly Vec3[];
  readonly boneAngles: readonly Vec3[];
  readonly boneScales: readonly Vec3[];
  readonly colorsHex: readonly string[];
  readonly outlineRatios: readonly number[];
}

export function rgbFloatStringsToHex(parts: readonly string[]): string | undefined {
  if (parts.length === 1) {
    const raw = (parts[0] ?? "").replace(/^#/u, "").trim();
    if (/^[0-9a-fA-F]{6}$/u.test(raw)) {
      return `#${raw.toLowerCase()}`;
    }
  }
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

export function hexToUnitRgb(hex: string): readonly [number, number, number] | undefined {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/u.test(normalized)) return undefined;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return [r, g, b];
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

function parseTransform9Slash(parts: readonly string[]): ShaperPresetTransformRecord | undefined {
  if (parts.length < 9) return undefined;
  const nums = parts.slice(0, 9).map((s) => Number.parseFloat(s));
  if (!nums.every(Number.isFinite)) return undefined;
  return {
    position: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0],
    eulerAngles: [nums[3] ?? 0, nums[4] ?? 0, nums[5] ?? 0],
    scale: [nums[6] ?? 1, nums[7] ?? 1, nums[8] ?? 1],
  };
}

function formatVec3Slash(v: Vec3): string {
  return `${v[0]}/${v[1]}/${v[2]}`;
}

function formatTransform9Slash(t: ShaperPresetTransformRecord): string {
  return `${formatVec3Slash(t.position)}/${formatVec3Slash(t.eulerAngles)}/${formatVec3Slash(t.scale)}`;
}

export function tokenizeShaperPresetLines(text: string): {
  readonly version: string;
  readonly pairs: readonly (readonly [string, string])[];
} {
  const { text: clean } = stripUtf8Bom(text);
  const lines = clean
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
 * SHAPER HeadPartsManager::CreateHeadPartFromPreset(0x060001e5) 전체 텍스트 DSL 파서:
 * 케이지 정점(`v*`, `p*`), 심어진 헤어(`h*`, `hp*`, `hb*`, `hbv*`), 3D 라인(`l*`, `lt*`, `lp*`, `lpt*`),
 * 안구(`ebtid*`, `eblt*`, `ebrt*`, `ebht*`, `ebhp*`, `ebha*`), 3-구간 Seam(`sposC/L/R*`),
 * 골격(`bN*`, `bP*`, `bA*`, `bS*`), 체형(`sex*`, `muscle*`, `fat*`), 카메라(`camP/R/Fov*`),
 * 의상 색상·윤곽선(`cC*`, `oR*`), 장신구(`acc*`) 토큰을 모두 파싱한다.
 * 동일 ID의 헤어(`h*`)·라인(`l*`)·본 이름(`bN*`)이 중복 등장하면 최신 레코드로 병합해 중복 ID를 막는다.
 */
export function parseShaperPartPreset(text: string): ShaperPartPresetData {
  const { version, pairs } = tokenizeShaperPresetLines(text);
  const controlVertices: Vec3[] = [];
  const controlPowers: number[] = [];
  const hairs: ShaperPresetHairStrandRecord[] = [];
  const hairIndexById = new Map<number, number>();
  const hairControlTransforms: ShaperPresetTransformRecord[] = [];
  const hairBaseZones: ShaperPresetHairBaseZoneRecord[] = [];
  const lines: ShaperPresetLineRecord[] = [];
  const lineIndexById = new Map<number, number>();
  const lineBaseMeshTypes: number[] = [];
  const linePoints: ShaperPresetLinePointRecord[] = [];
  const linePointBaseMeshTypes: number[] = [];
  const accessories: ShaperPresetAccessoryRecord[] = [];
  const boneNames: string[] = [];
  const boneIndexByName = new Map<string, number>();
  let activeBoneIndex = -1;
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
    eyeballTexId?: number;
    eyeballTexPath?: string;
    eyeballHighlightTexId?: number;
    eyeballHighlightTexPath?: string;
    eyeballLeftTransform?: ShaperPresetTransformRecord;
    eyeballRightTransform?: ShaperPresetTransformRecord;
    eyeballHighlightType?: number;
    eyeballHighlightPos?: readonly [number, number];
    eyeballHighlightAlpha?: number;
    seamPosC?: Vec3;
    seamPosL?: Vec3;
    seamPosR?: Vec3;
    hairBaseMeshId?: number;
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
      case "v": {
        const v = parseVec3Slash(val);
        if (v) controlVertices.push(v);
        break;
      }
      case "p": {
        const p = Number.parseFloat(val);
        if (Number.isFinite(p)) controlPowers.push(p);
        break;
      }
      case "h": {
        const parts = val.split("/");
        if (parts.length >= 16) {
          const strand: ShaperPresetHairStrandRecord = {
            id: Number.parseInt(parts[0] ?? "0", 10),
            baseMeshId: Number.parseInt(parts[1] ?? "0", 10),
            scaleCurveTime0: Number.parseFloat(parts[2] ?? "0"),
            scaleCurveTime1: Number.parseFloat(parts[3] ?? "1"),
            partMeshId: Number.parseInt(parts[4] ?? "0", 10),
            partBaseMeshId: Number.parseInt(parts[5] ?? "0", 10),
            triangleVertexIds: [
              Number.parseInt(parts[6] ?? "0", 10),
              Number.parseInt(parts[7] ?? "0", 10),
              Number.parseInt(parts[8] ?? "0", 10),
            ],
            v0d: Number.parseFloat(parts[9] ?? "0"),
            v1d: Number.parseFloat(parts[10] ?? "0"),
            rootLocalEuler: [
              Number.parseFloat(parts[11] ?? "0"),
              Number.parseFloat(parts[12] ?? "0"),
              Number.parseFloat(parts[13] ?? "0"),
            ],
            rotationAligned: Number.parseInt(parts[14] ?? "0", 10) !== 0,
            outlineEnabled: Number.parseInt(parts[15] ?? "1", 10) !== 0,
          };
          const prevIdx = hairIndexById.get(strand.id);
          if (prevIdx !== undefined) {
            hairs[prevIdx] = strand;
          } else {
            hairIndexById.set(strand.id, hairs.length);
            hairs.push(strand);
          }
        }
        break;
      }
      case "hp": {
        const tr = parseTransform9Slash(val.split("/"));
        if (tr) hairControlTransforms.push(tr);
        break;
      }
      case "hb":
        out.hairBaseMeshId = Number.parseInt(val, 10);
        break;
      case "hbv": {
        const parts = val.split("/").map((s) => Number.parseFloat(s));
        if (parts.length >= 7 && parts.every(Number.isFinite)) {
          hairBaseZones.push({
            zone: Math.trunc(parts[0] ?? 0),
            xUi: parts[1] ?? 0,
            yUi: parts[2] ?? 0,
            widthUi: parts[3] ?? 1,
            heightUi: parts[4] ?? 1,
            offsetTx: parts[5] ?? 0,
            offsetTy: parts[6] ?? 0,
          });
        }
        break;
      }
      case "l": {
        const parts = val.split("/");
        if (parts.length >= 7) {
          const colorMode = Number.parseInt(parts[6] ?? "0", 10);
          const colorHex =
            colorMode === 2 && parts.length >= 10
              ? rgbFloatStringsToHex(parts.slice(7, 10))
              : undefined;
          const lineRecord: ShaperPresetLineRecord = {
            id: Number.parseInt(parts[0] ?? "0", 10),
            scaleCurveTime0: Number.parseFloat(parts[1] ?? "0"),
            scaleCurveTime1: Number.parseFloat(parts[2] ?? "1"),
            layer: Number.parseInt(parts[3] ?? "0", 10),
            thickness: Number.parseFloat(parts[4] ?? "1"),
            pressureMode: Number.parseInt(parts[5] ?? "0", 10),
            colorMode,
            ...(colorHex !== undefined ? { colorHex } : {}),
          };
          const prevIdx = lineIndexById.get(lineRecord.id);
          if (prevIdx !== undefined) {
            lines[prevIdx] = lineRecord;
          } else {
            lineIndexById.set(lineRecord.id, lines.length);
            lines.push(lineRecord);
          }
        }
        break;
      }
      case "lt": {
        const mt = Number.parseInt(val, 10);
        if (Number.isFinite(mt)) lineBaseMeshTypes.push(mt);
        break;
      }
      case "lp": {
        const parts = val.split("/");
        if (parts.length >= 11) {
          linePoints.push({
            partMeshId: Number.parseInt(parts[0] ?? "0", 10),
            partBaseMeshId: Number.parseInt(parts[1] ?? "0", 10),
            triangleVertexIds: [
              Number.parseInt(parts[2] ?? "0", 10),
              Number.parseInt(parts[3] ?? "0", 10),
              Number.parseInt(parts[4] ?? "0", 10),
            ],
            v0d: Number.parseFloat(parts[5] ?? "0"),
            v1d: Number.parseFloat(parts[6] ?? "0"),
            thickness: Number.parseFloat(parts[7] ?? "1"),
            surfaceNormal: [
              Number.parseFloat(parts[8] ?? "0"),
              Number.parseFloat(parts[9] ?? "0"),
              Number.parseFloat(parts[10] ?? "1"),
            ],
          });
        }
        break;
      }
      case "lpt": {
        const mt = Number.parseInt(val, 10);
        if (Number.isFinite(mt)) linePointBaseMeshTypes.push(mt);
        break;
      }
      case "ebtid":
        out.eyeballTexId = Number.parseInt(val, 10);
        break;
      case "ebtp":
        out.eyeballTexPath = val;
        break;
      case "ebhtid":
        out.eyeballHighlightTexId = Number.parseInt(val, 10);
        break;
      case "ebhtp":
        out.eyeballHighlightTexPath = val;
        break;
      case "eblt": {
        const tr = parseTransform9Slash(val.split("/"));
        if (tr) out.eyeballLeftTransform = tr;
        break;
      }
      case "ebrt": {
        const tr = parseTransform9Slash(val.split("/"));
        if (tr) out.eyeballRightTransform = tr;
        break;
      }
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
      case "bN": {
        const existingIdx = boneIndexByName.get(val);
        if (existingIdx !== undefined) {
          activeBoneIndex = existingIdx;
        } else {
          activeBoneIndex = boneNames.length;
          boneIndexByName.set(val, activeBoneIndex);
          boneNames.push(val);
        }
        break;
      }
      case "bP": {
        const v = parseVec3Slash(val);
        if (v) {
          if (activeBoneIndex >= 0 && activeBoneIndex < bonePositions.length) bonePositions[activeBoneIndex] = v;
          else bonePositions.push(v);
        }
        break;
      }
      case "bA": {
        const v = parseVec3Slash(val);
        if (v) {
          if (activeBoneIndex >= 0 && activeBoneIndex < boneAngles.length) boneAngles[activeBoneIndex] = v;
          else boneAngles.push(v);
        }
        break;
      }
      case "bS": {
        const v = parseVec3Slash(val);
        if (v) {
          if (activeBoneIndex >= 0 && activeBoneIndex < boneScales.length) boneScales[activeBoneIndex] = v;
          else boneScales.push(v);
        }
        break;
      }
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
      case "acc": {
        const parts = val.split("/");
        if (parts.length >= 10) {
          const tr = parseTransform9Slash(parts.slice(1, 10));
          if (tr) {
            accessories.push({
              parentName: parts[0] ?? "",
              ...tr,
            });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    ...out,
    ...(controlVertices.length > 0 ? { controlVertices } : {}),
    ...(controlPowers.length > 0 ? { controlPowers } : {}),
    ...(hairs.length > 0 ? { hairs } : {}),
    ...(hairControlTransforms.length > 0 ? { hairControlTransforms } : {}),
    ...(hairBaseZones.length > 0 ? { hairBaseZones } : {}),
    ...(lines.length > 0 ? { lines } : {}),
    ...(lineBaseMeshTypes.length > 0 ? { lineBaseMeshTypes } : {}),
    ...(linePoints.length > 0 ? { linePoints } : {}),
    ...(linePointBaseMeshTypes.length > 0 ? { linePointBaseMeshTypes } : {}),
    ...(accessories.length > 0 ? { accessories } : {}),
    boneNames,
    bonePositions,
    boneAngles,
    boneScales,
    colorsHex,
    outlineRatios,
  };
}

/**
 * SHAPER HeadPartsManager::CreatePreset (0x060001e8) 텍스트 DSL 직렬화기:
 * `1.0` 버전 헤더 + 쉼표(,) 구분 `key*val` 토큰 문자열로 파츠/전신/포즈 프리셋을 생성한다.
 */
export function serializeShaperPartPreset(data: ShaperPartPresetData): string {
  const tokens: string[] = [];
  if (data.partType !== undefined) tokens.push(`mt*${data.partType}`);
  if (data.baseMeshId !== undefined) tokens.push(`mid*${data.baseMeshId}`);
  if (data.name !== undefined) tokens.push(`name*${data.name}`);

  for (const v of data.controlVertices ?? []) {
    tokens.push(`v*${formatVec3Slash(v)}`);
  }
  for (const p of data.controlPowers ?? []) {
    tokens.push(`p*${p}`);
  }
  for (const h of data.hairs ?? []) {
    const [t0, t1, t2] = h.triangleVertexIds;
    tokens.push(
      `h*${h.id}/${h.baseMeshId}/${h.scaleCurveTime0}/${h.scaleCurveTime1}/${h.partMeshId}/${h.partBaseMeshId}/${t0}/${t1}/${t2}/${h.v0d}/${h.v1d}/${formatVec3Slash(h.rootLocalEuler)}/${h.rotationAligned ? 1 : 0}/${h.outlineEnabled ? 1 : 0}`,
    );
  }
  for (const hp of data.hairControlTransforms ?? []) {
    tokens.push(`hp*${formatTransform9Slash(hp)}`);
  }
  if (data.hairBaseMeshId !== undefined) {
    tokens.push(`hb*${data.hairBaseMeshId}`);
  }
  for (const z of data.hairBaseZones ?? []) {
    tokens.push(
      `hbv*${z.zone}/${z.xUi}/${z.yUi}/${z.widthUi}/${z.heightUi}/${z.offsetTx}/${z.offsetTy}`,
    );
  }
  for (const l of data.lines ?? []) {
    let colorSuffix = "";
    if (l.colorMode === 2 && l.colorHex !== undefined) {
      const rgb = hexToUnitRgb(l.colorHex);
      if (rgb !== undefined) {
        colorSuffix = `/${rgb[0]}/${rgb[1]}/${rgb[2]}`;
      }
    }
    tokens.push(
      `l*${l.id}/${l.scaleCurveTime0}/${l.scaleCurveTime1}/${l.layer}/${l.thickness}/${l.pressureMode}/${l.colorMode}${colorSuffix}`,
    );
  }
  for (const lt of data.lineBaseMeshTypes ?? []) {
    tokens.push(`lt*${lt}`);
  }
  for (const lp of data.linePoints ?? []) {
    const [t0, t1, t2] = lp.triangleVertexIds;
    tokens.push(
      `lp*${lp.partMeshId}/${lp.partBaseMeshId}/${t0}/${t1}/${t2}/${lp.v0d}/${lp.v1d}/${lp.thickness}/${formatVec3Slash(lp.surfaceNormal)}`,
    );
  }
  for (const lpt of data.linePointBaseMeshTypes ?? []) {
    tokens.push(`lpt*${lpt}`);
  }
  if (data.eyeballTexId !== undefined) tokens.push(`ebtid*${data.eyeballTexId}`);
  if (data.eyeballTexPath !== undefined) tokens.push(`ebtp*${data.eyeballTexPath}`);
  if (data.eyeballHighlightTexId !== undefined) tokens.push(`ebhtid*${data.eyeballHighlightTexId}`);
  if (data.eyeballHighlightTexPath !== undefined) {
    tokens.push(`ebhtp*${data.eyeballHighlightTexPath}`);
  }
  if (data.eyeballLeftTransform !== undefined) {
    tokens.push(`eblt*${formatTransform9Slash(data.eyeballLeftTransform)}`);
  }
  if (data.eyeballRightTransform !== undefined) {
    tokens.push(`ebrt*${formatTransform9Slash(data.eyeballRightTransform)}`);
  }
  if (data.eyeballHighlightType !== undefined) tokens.push(`ebht*${data.eyeballHighlightType}`);
  if (data.eyeballHighlightPos !== undefined) {
    tokens.push(`ebhp*${data.eyeballHighlightPos[0]}/${data.eyeballHighlightPos[1]}`);
  }
  if (data.eyeballHighlightAlpha !== undefined) tokens.push(`ebha*${data.eyeballHighlightAlpha}`);
  if (data.seamPosC !== undefined) tokens.push(`sposC*${formatVec3Slash(data.seamPosC)}`);
  if (data.seamPosL !== undefined) tokens.push(`sposL*${formatVec3Slash(data.seamPosL)}`);
  if (data.seamPosR !== undefined) tokens.push(`sposR*${formatVec3Slash(data.seamPosR)}`);

  const boneCount = data.boneNames.length;
  for (let i = 0; i < boneCount; i += 1) {
    tokens.push(`bN*${data.boneNames[i]}`);
    const bp = data.bonePositions[i];
    if (bp !== undefined) tokens.push(`bP*${formatVec3Slash(bp)}`);
    const ba = data.boneAngles[i];
    if (ba !== undefined) tokens.push(`bA*${formatVec3Slash(ba)}`);
    const bs = data.boneScales[i];
    if (bs !== undefined) tokens.push(`bS*${formatVec3Slash(bs)}`);
  }

  if (data.sex !== undefined) tokens.push(`sex*${data.sex}`);
  if (data.muscle !== undefined) tokens.push(`muscle*${data.muscle}`);
  if (data.fat !== undefined) tokens.push(`fat*${data.fat}`);
  if (data.camPos !== undefined) {
    tokens.push(`camP*${data.camPos[0]}/${data.camPos[1]}/${data.camPos[2]}/${data.camPos[3]}`);
  }
  if (data.camAngles !== undefined) tokens.push(`camR*${formatVec3Slash(data.camAngles)}`);
  if (data.camFov !== undefined) tokens.push(`camFov*${data.camFov}`);

  for (const hex of data.colorsHex) {
    const clean = hex.startsWith("#") ? hex.slice(1).toUpperCase() : hex.toUpperCase();
    tokens.push(`cC*${clean}`);
  }
  for (const ratio of data.outlineRatios) {
    tokens.push(`oR*${ratio}`);
  }
  for (const acc of data.accessories ?? []) {
    tokens.push(`acc*${acc.parentName}/${formatTransform9Slash(acc)}`);
  }

  return `${data.version || "1.0"}\n${tokens.join(",")}`;
}

export interface ShaperServerAssetDescriptor {
  readonly id: number;
  readonly filename: string;
  readonly name: string;
  readonly category: string;
  readonly type: string;
  readonly version: number;
}

export interface ShaperCheckedAssetResult extends ShaperServerAssetDescriptor {
  readonly path: string;
  readonly normalizedVersion: number;
  /** 0 = 최신 상태, 1 = 로컬 미존재(신규 다운로드), 2 = 로컬 버전 구형(인플레이스 업데이트) */
  readonly update: 0 | 1 | 2;
  readonly progressPercent: number;
}

/**
 * SHAPER PresetServerManager::CheckAsset (0x0600028a) & Update (0x0600028f) 역공학 내재화:
 * - `version == 0`이면 기본값 `1.0`으로 정규화한다.
 * - `${appDataPath}/${category}/${type}/${filename}` 경로를 조합하고 중복 슬래시(`//`)를 `/`로 치환한다.
 * - 진행률은 `Math.ceil(((index + 1) / assets.length) * 100)`(%)으로 계산한다.
 * - 로컬 파일이 없으면 `update = 1`, `.preset` 파일의 첫 줄 버전이 서버 `version`보다 작으면 `update = 2`, 같거나 크면 `update = 0`으로 판정하며,
 *   동일 `(확장자 제외 파일명, category, type)`을 공유하는 에셋 엔트리들에도 동일한 `update` 상태를 전파한다.
 */
export function evaluateShaperPresetAssetUpdates(options: {
  readonly appDataPath: string;
  readonly assets: readonly ShaperServerAssetDescriptor[];
  readonly localPresetContentsByPath: Readonly<Record<string, string | undefined>>;
}): readonly ShaperCheckedAssetResult[] {
  const { appDataPath, assets, localPresetContentsByPath } = options;
  const total = assets.length;
  if (total === 0) return [];

  const stripExtension = (filename: string): string => {
    const dot = filename.lastIndexOf(".");
    return dot > 0 ? filename.slice(0, dot) : filename;
  };
  const getExtension = (path: string): string => {
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot) : "";
  };

  const results = assets.map((asset, idx) => {
    const normalizedVersion = asset.version === 0 ? 1 : asset.version;
    const rawPath = `${appDataPath}/${asset.category}/${asset.type}/${asset.filename}`;
    const path = rawPath.replace(/\/\//g, "/");
    const progressPercent = Math.ceil(((idx + 1) / total) * 100);
    return {
      ...asset,
      path,
      normalizedVersion,
      update: 0 as 0 | 1 | 2,
      progressPercent,
    };
  });

  for (let i = 0; i < total; i += 1) {
    const current = results[i];
    if (current === undefined || current.update !== 0) continue;

    const localContent = localPresetContentsByPath[current.path];
    let updateState: 0 | 1 | 2 = 0;
    if (localContent === undefined) {
      updateState = 1;
    } else if (getExtension(current.path) === ".preset") {
      const firstLine = localContent.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "0";
      const localVersion = Number.parseFloat(firstLine);
      if (!Number.isFinite(localVersion) || localVersion < current.normalizedVersion) {
        updateState = 2;
      }
    }

    current.update = updateState;
    if (updateState > 0) {
      const currentStem = stripExtension(current.filename);
      for (let j = 0; j < total; j += 1) {
        const peer = results[j];
        if (
          peer !== undefined &&
          stripExtension(peer.filename) === currentStem &&
          peer.category === current.category &&
          peer.type === current.type
        ) {
          peer.update = updateState;
        }
      }
    }
  }

  return results;
}

export {
  buildShaper3mfModelXml,
  parseShaper3mfModelXml,
  type Shaper3mfMeshObject,
  type Shaper3mfModelDocument,
  type Shaper3mfModelUnit,
} from "./shaper-3mf";
