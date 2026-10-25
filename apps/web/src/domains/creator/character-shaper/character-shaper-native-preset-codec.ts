/**
 * Character Shaper — SHAPER v1.05 (`1.0` `.preset` / `.shaper`) 네이티브 코덱 및 레시피 브리지.
 *
 * Studio HORANG SHAPER (`Assembly-CSharp.dll` `HeadPartTypes`, `DataLoader`, `SaveManager`,
 * `MaterialData`, `EyeballData`, `LineData`, `HairData`)의 콤마(`,`)·별표(`*`)·슬래시(`/`) 기반
 * 텍스트 직렬화 문법을 양방향 파싱·직렬화하고 ToonStudio 15개 `CharacterSlotKind` 및
 * `CharacterRecipe`로 변환한다.
 */

import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import { createEmptyCharacterRecipe } from "./character-shaper-recipe";

import type {
  CharacterHandSide,
  CharacterRecipe,
  CharacterRecipeColors,
  CharacterRecipeSlots,
  CharacterSemanticMorphBundle,
  CharacterSlotKind,
} from "./character-shaper-contract";
import type { AvatarForgeFaceParams } from "../vrm/studio-vrm-avatar-forge";

export const SHAPER_PRESET_FORMAT_VERSION = "1.0" as const;

export const SHAPER_HEAD_PART_TYPES = [
  "head", "eyes", "nose", "mouth", "ears", "neck", "hair",
  "body", "clothTop", "clothBottom", "shoes", "acc", "pose", "handPose",
] as const;

export type ShaperHeadPartType = (typeof SHAPER_HEAD_PART_TYPES)[number];
export type ShaperPresetDomainType = ShaperHeadPartType | "style";

export const SHAPER_HEAD_PART_TYPE_IDS: Readonly<Record<ShaperHeadPartType, number>> = {
  head: 0, eyes: 1, nose: 2, mouth: 3, ears: 4, neck: 5, hair: 6,
  body: 7, clothTop: 8, clothBottom: 9, shoes: 10, acc: 11, pose: 12, handPose: 13,
};

const ID_TO_PART_TYPE: Readonly<Record<number, ShaperHeadPartType>> = {
  0: "head", 1: "eyes", 2: "nose", 3: "mouth", 4: "ears", 5: "neck", 6: "hair",
  7: "body", 8: "clothTop", 9: "clothBottom", 10: "shoes", 11: "acc", 12: "pose", 13: "handPose",
};

const SHAPER_TO_CHARACTER_SLOTS: Readonly<Record<ShaperPresetDomainType, readonly CharacterSlotKind[]>> = {
  head: ["face-shape"],
  eyes: ["eyes", "irises", "expression"],
  nose: ["nose"],
  mouth: ["mouth", "expression"],
  ears: ["ears"],
  neck: ["body"],
  hair: ["hair"],
  body: ["body"],
  clothTop: ["top"],
  clothBottom: ["bottom"],
  shoes: ["shoes"],
  acc: ["accessory"],
  pose: ["pose"],
  handPose: ["hand-pose"],
  style: ["face-shape", "hair", "irises"],
};

const CHARACTER_SLOT_TO_SHAPER_PART: Readonly<Record<CharacterSlotKind, ShaperHeadPartType>> = {
  "face-shape": "head",
  eyes: "eyes",
  irises: "eyes",
  nose: "nose",
  mouth: "mouth",
  ears: "ears",
  hair: "hair",
  body: "body",
  top: "clothTop",
  bottom: "clothBottom",
  shoes: "shoes",
  accessory: "acc",
  expression: "eyes",
  pose: "pose",
  "hand-pose": "handPose",
};

export function mapShaperPartTypeToCharacterSlots(
  partType: ShaperPresetDomainType,
): readonly CharacterSlotKind[] {
  return SHAPER_TO_CHARACTER_SLOTS[partType];
}

export function mapCharacterSlotToShaperPartType(slot: CharacterSlotKind): ShaperHeadPartType {
  return CHARACTER_SLOT_TO_SHAPER_PART[slot];
}

export interface ShaperVector2 { readonly x: number; readonly y: number }
export interface ShaperVector3 { readonly x: number; readonly y: number; readonly z: number }
export interface ShaperRect4 { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface ShaperRgbColor { readonly r: number; readonly g: number; readonly b: number }
export interface ShaperRgbaColor extends ShaperRgbColor { readonly a: number }

export interface ShaperLinePointPreset {
  readonly position: ShaperVector3;
  readonly thickness: number;
  readonly v0d: number;
  readonly v1d: number;
  readonly normal: ShaperVector3;
  readonly baseMeshType: string;
  readonly partMeshId: string;
  readonly partBaseMeshId: string;
}

export interface ShaperLinePreset {
  readonly thickness: number;
  readonly pressureMode: number;
  readonly colorMode: number;
  readonly color: ShaperRgbaColor;
  readonly layer: number;
  readonly points: readonly ShaperLinePointPreset[];
}

export interface ShaperHairStrandPreset {
  readonly baseMeshId: string;
  readonly v0d: number;
  readonly v1d: number;
  readonly rotation: ShaperVector3;
  readonly controlPointPos: ShaperVector3;
  readonly controlPointRot: ShaperVector3;
  readonly controlPointScale: ShaperVector3;
  readonly outline: number;
}

export interface ShaperHairBasePreset {
  readonly baseId: string;
  readonly uvTransform: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly tx: number;
    readonly ty: number;
  };
}

export type ShaperEyeballHighlightTrackingMode = "fix" | "cam" | "light" | "world";

export interface ShaperEyeballData {
  readonly irisTexId?: string;
  readonly irisRect?: ShaperRect4;
  readonly highlightTexId?: string;
  readonly highlightRect?: ShaperRect4;
  readonly leftEyeRotation?: ShaperVector3;
  readonly rightEyeRotation?: ShaperVector3;
  readonly highlightTrackingMode?: ShaperEyeballHighlightTrackingMode;
  readonly highlightPosition?: ShaperVector2;
  readonly highlightAlpha?: number;
}

export interface ShaperBoneTransform {
  readonly boneName: string;
  readonly position?: ShaperVector3;
  readonly rotation?: ShaperVector3;
  readonly scale?: ShaperVector3;
}

export interface ShaperCameraTransform {
  readonly position?: ShaperVector3;
  readonly rotation?: ShaperVector3;
  readonly fov?: number;
}

export interface ShaperAccessoryTransform {
  readonly parentBone: string;
  readonly position: ShaperVector3;
  readonly rotation: ShaperVector3;
  readonly scale: ShaperVector3;
}

export interface ShaperToonMaterialStyle {
  readonly hairColor?: ShaperRgbColor;
  readonly skinColor?: ShaperRgbColor;
  readonly secondShadeTexId?: string;
  readonly secondShadeColor?: ShaperRgbColor;
  readonly secondShadePosition?: number;
  readonly secondShadeWidth?: number;
  readonly rimShadeTexId?: string;
  readonly rimShadeColor?: ShaperRgbColor;
  readonly rimShadePosition?: number;
  readonly rimShadeWidth?: number;
  readonly outlineColor?: ShaperRgbColor;
  readonly outlineThickness?: number;
  readonly outlinePower?: number;
  readonly hairBaseId?: string;
  readonly shaderType?: string;
  readonly lightAngleX?: number;
  readonly lightAngleY?: number;
}

export interface ShaperNativePresetDocument {
  readonly version: typeof SHAPER_PRESET_FORMAT_VERSION;
  readonly partType: ShaperPresetDomainType;
  readonly baseMeshId: string | null;
  readonly name: string | null;
  readonly vertices: readonly ShaperVector3[];
  readonly creasePowers: readonly number[];
  readonly seams: {
    readonly center?: ShaperVector3;
    readonly left?: ShaperVector3;
    readonly right?: ShaperVector3;
  };
  readonly lines: readonly ShaperLinePreset[];
  readonly hairStrands: readonly ShaperHairStrandPreset[];
  readonly hairBases: readonly ShaperHairBasePreset[];
  readonly eyeball: ShaperEyeballData | null;
  readonly bodyProportions: { readonly sex?: 0 | 1; readonly muscle?: number; readonly fat?: number } | null;
  readonly bones: readonly ShaperBoneTransform[];
  readonly camera: ShaperCameraTransform | null;
  readonly costume: {
    readonly color?: string;
    readonly outlineRatio?: number;
    readonly accessories: readonly ShaperAccessoryTransform[];
  } | null;
  readonly style: ShaperToonMaterialStyle | null;
  readonly unknownTokens: readonly { readonly key: string; readonly value: string }[];
}

export type ShaperNativePresetParseResult =
  | { readonly ok: true; readonly document: ShaperNativePresetDocument }
  | { readonly ok: false; readonly error: string };

export interface ShaperProjectArchiveParseResult {
  readonly ok: boolean;
  readonly presets: Readonly<Partial<Record<ShaperPresetDomainType, ShaperNativePresetDocument>>>;
  readonly errors: readonly { readonly fileName: string; readonly error: string }[];
}

export interface CharacterRecipeBridgeResult {
  readonly recipe: CharacterRecipe;
  readonly touchedSlots: readonly CharacterSlotKind[];
  readonly forgeFacePatch: Partial<AvatarForgeFaceParams>;
  readonly semanticMorphs: CharacterSemanticMorphBundle;
  readonly camera: ShaperCameraTransform | null;
  readonly surfaceLineCount: number;
  readonly hairStrandCount: number;
}

function parseNum(raw: string | undefined, fallback = 0): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n) || Object.is(n, -0)) return "0";
  return String(Math.round(n * 1e6) / 1e6);
}

function parseVec2(raw: string): ShaperVector2 {
  const [x, y] = raw.split("/");
  return { x: parseNum(x), y: parseNum(y) };
}

function fmtVec2(v: ShaperVector2): string {
  return `${fmtNum(v.x)}/${fmtNum(v.y)}`;
}

function parseVec3(raw: string): ShaperVector3 {
  const [x, y, z] = raw.split("/");
  return { x: parseNum(x), y: parseNum(y), z: parseNum(z) };
}

function fmtVec3(v: ShaperVector3): string {
  return `${fmtNum(v.x)}/${fmtNum(v.y)}/${fmtNum(v.z)}`;
}

function parseRect4(raw: string): ShaperRect4 {
  const [x, y, w, h] = raw.split("/");
  return { x: parseNum(x), y: parseNum(y), w: parseNum(w), h: parseNum(h) };
}

function fmtRect4(r: ShaperRect4): string {
  return `${fmtNum(r.x)}/${fmtNum(r.y)}/${fmtNum(r.w)}/${fmtNum(r.h)}`;
}

function parseRgb(raw: string): ShaperRgbColor {
  const [r, g, b] = raw.split("/");
  return { r: parseNum(r), g: parseNum(g), b: parseNum(b) };
}

function fmtRgb(c: ShaperRgbColor): string {
  return `${fmtNum(c.r)}/${fmtNum(c.g)}/${fmtNum(c.b)}`;
}

function resolvePartTypeToken(raw: string, fallback: ShaperPresetDomainType): ShaperPresetDomainType {
  const trimmed = raw.trim();
  if (trimmed === "style") return "style";
  if ((SHAPER_HEAD_PART_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as ShaperHeadPartType;
  }
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric in ID_TO_PART_TYPE) {
    return ID_TO_PART_TYPE[numeric] ?? fallback;
  }
  return fallback;
}

function isTrackingMode(raw: string): raw is ShaperEyeballHighlightTrackingMode {
  return raw === "fix" || raw === "cam" || raw === "light" || raw === "world";
}

export function rgbToHexColor(color: ShaperRgbColor): string {
  const toChannel = (v: number): string => {
    const normalized = v <= 1 && v >= 0 && (!Number.isInteger(v) || v === 1) ? Math.round(v * 255) : Math.round(v);
    return Math.max(0, Math.min(255, normalized)).toString(16).padStart(2, "0");
  };
  return `#${toChannel(color.r)}${toChannel(color.g)}${toChannel(color.b)}`;
}

function createLineBuilder() {
  return {
    thickness: 1,
    pressureMode: 0,
    colorMode: 0,
    color: { r: 0, g: 0, b: 0, a: 1 },
    layer: 0,
    pendingPositions: [] as ShaperVector3[],
    points: [] as ShaperLinePointPreset[],
  };
}

/**
 * SHAPER `1.0` `.preset` 텍스트를 파싱하여 구조화된 `ShaperNativePresetDocument`로 변환한다.
 */
export function parseShaperNativePreset(
  rawText: string,
  options?: { readonly fallbackPartType?: ShaperPresetDomainType },
): ShaperNativePresetParseResult {
  const normalized = rawText.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return { ok: false, error: "Empty Shaper preset payload" };
  const rawLines = normalized.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const header = rawLines[0];
  if (header !== SHAPER_PRESET_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported Shaper preset version "${header ?? ""}"; expected "${SHAPER_PRESET_FORMAT_VERSION}"`,
    };
  }

  const rawTokens = rawLines.slice(1).join(",").split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  let partType: ShaperPresetDomainType = options?.fallbackPartType ?? "head";
  let baseMeshId: string | null = null;
  let name: string | null = null;
  const vertices: ShaperVector3[] = [];
  const creasePowers: number[] = [];
  let seamCenter: ShaperVector3 | undefined;
  let seamLeft: ShaperVector3 | undefined;
  let seamRight: ShaperVector3 | undefined;

  const lines: ShaperLinePreset[] = [];
  let activeLine: ReturnType<typeof createLineBuilder> | null = null;
  const flushActiveLine = (): void => {
    if (!activeLine) return;
    lines.push({
      thickness: activeLine.thickness,
      pressureMode: activeLine.pressureMode,
      colorMode: activeLine.colorMode,
      color: activeLine.color,
      layer: activeLine.layer,
      points: activeLine.points,
    });
    activeLine = null;
  };

  const hairStrands: ShaperHairStrandPreset[] = [];
  const hairBases: ShaperHairBasePreset[] = [];
  let pendingHairBaseId: string | null = null;

  const eyeballMutable: { -readonly [K in keyof ShaperEyeballData]?: ShaperEyeballData[K] } = {};
  let hasEyeball = false;
  const bodyMutable: { sex?: 0 | 1; muscle?: number; fat?: number } = {};
  let hasBody = false;

  const bones: ShaperBoneTransform[] = [];
  let currentBone: { -readonly [K in keyof ShaperBoneTransform]: ShaperBoneTransform[K] } | null = null;
  const flushBone = (): void => {
    if (!currentBone) return;
    bones.push({ ...currentBone });
    currentBone = null;
  };

  const cameraMutable: { position?: ShaperVector3; rotation?: ShaperVector3; fov?: number } = {};
  let hasCamera = false;
  const costumeMutable: { color?: string; outlineRatio?: number; accessories: ShaperAccessoryTransform[] } = {
    accessories: [],
  };
  let hasCostume = false;
  const styleMutable: { -readonly [K in keyof ShaperToonMaterialStyle]?: ShaperToonMaterialStyle[K] } = {};
  let hasStyle = false;
  const unknownTokens: { readonly key: string; readonly value: string }[] = [];

  for (const token of rawTokens) {
    const starIdx = token.indexOf("*");
    if (starIdx < 0) continue;
    const key = token.slice(0, starIdx).trim();
    const val = token.slice(starIdx + 1).trim();

    switch (key) {
      case "mt": partType = resolvePartTypeToken(val, partType); break;
      case "mid": baseMeshId = val; break;
      case "name": name = val; break;
      case "v": vertices.push(parseVec3(val)); break;
      case "p": creasePowers.push(parseNum(val)); break;
      case "sposC": seamCenter = parseVec3(val); break;
      case "sposL": seamLeft = parseVec3(val); break;
      case "sposR": seamRight = parseVec3(val); break;
      case "l":
        flushActiveLine();
        activeLine = createLineBuilder();
        break;
      case "lt": {
        activeLine ??= createLineBuilder();
        const parts = val.split("/");
        activeLine.thickness = parseNum(parts[0], 1);
        activeLine.pressureMode = parseNum(parts[1], 0);
        activeLine.colorMode = parseNum(parts[2], 0);
        activeLine.color = {
          r: parseNum(parts[3], 0), g: parseNum(parts[4], 0),
          b: parseNum(parts[5], 0), a: parseNum(parts[6], 1),
        };
        activeLine.layer = parseNum(parts[7], 0);
        break;
      }
      case "lp":
        activeLine ??= createLineBuilder();
        activeLine.pendingPositions.push(parseVec3(val));
        break;
      case "lpt": {
        activeLine ??= createLineBuilder();
        const parts = val.split("/");
        const pos = activeLine.pendingPositions.shift() ?? { x: 0, y: 0, z: 0 };
        activeLine.points.push({
          position: pos,
          thickness: parseNum(parts[0], activeLine.thickness),
          v0d: parseNum(parts[1], 0),
          v1d: parseNum(parts[2], 0),
          normal: { x: parseNum(parts[3], 0), y: parseNum(parts[4], 0), z: parseNum(parts[5], 1) },
          baseMeshType: parts[6] ?? "head",
          partMeshId: parts[7] ?? "0",
          partBaseMeshId: parts[8] ?? "0",
        });
        break;
      }
      case "h": break;
      case "hp": {
        const parts = val.split("/");
        hairStrands.push({
          baseMeshId: parts[0] ?? "0",
          v0d: parseNum(parts[1]),
          v1d: parseNum(parts[2]),
          rotation: { x: parseNum(parts[3]), y: parseNum(parts[4]), z: parseNum(parts[5]) },
          controlPointPos: { x: parseNum(parts[6]), y: parseNum(parts[7]), z: parseNum(parts[8]) },
          controlPointRot: { x: parseNum(parts[9]), y: parseNum(parts[10]), z: parseNum(parts[11]) },
          controlPointScale: { x: parseNum(parts[12], 1), y: parseNum(parts[13], 1), z: parseNum(parts[14], 1) },
          outline: parseNum(parts[15], 1),
        });
        break;
      }
      case "hb": pendingHairBaseId = val; break;
      case "hbv": {
        const parts = val.split("/");
        hairBases.push({
          baseId: pendingHairBaseId ?? "0",
          uvTransform: {
            x: parseNum(parts[0]), y: parseNum(parts[1]),
            w: parseNum(parts[2], 1), h: parseNum(parts[3], 1),
            tx: parseNum(parts[4]), ty: parseNum(parts[5]),
          },
        });
        pendingHairBaseId = null;
        break;
      }
      case "ebtid": eyeballMutable.irisTexId = val; hasEyeball = true; break;
      case "ebtp": eyeballMutable.irisRect = parseRect4(val); hasEyeball = true; break;
      case "ebhtid": eyeballMutable.highlightTexId = val; hasEyeball = true; break;
      case "ebhtp": eyeballMutable.highlightRect = parseRect4(val); hasEyeball = true; break;
      case "eblt": eyeballMutable.leftEyeRotation = parseVec3(val); hasEyeball = true; break;
      case "ebrt": eyeballMutable.rightEyeRotation = parseVec3(val); hasEyeball = true; break;
      case "ebht":
        if (isTrackingMode(val)) { eyeballMutable.highlightTrackingMode = val; hasEyeball = true; }
        break;
      case "ebhp": eyeballMutable.highlightPosition = parseVec2(val); hasEyeball = true; break;
      case "ebha": eyeballMutable.highlightAlpha = parseNum(val, 1); hasEyeball = true; break;
      case "sex": bodyMutable.sex = parseNum(val, 0) === 1 ? 1 : 0; hasBody = true; break;
      case "muscle": bodyMutable.muscle = parseNum(val, 0); hasBody = true; break;
      case "fat": bodyMutable.fat = parseNum(val, 0); hasBody = true; break;
      case "bN": flushBone(); currentBone = { boneName: val }; break;
      case "bP": currentBone ??= { boneName: "root" }; currentBone.position = parseVec3(val); break;
      case "bA": currentBone ??= { boneName: "root" }; currentBone.rotation = parseVec3(val); break;
      case "bS": currentBone ??= { boneName: "root" }; currentBone.scale = parseVec3(val); break;
      case "camP": cameraMutable.position = parseVec3(val); hasCamera = true; break;
      case "camR": cameraMutable.rotation = parseVec3(val); hasCamera = true; break;
      case "camFov": cameraMutable.fov = parseNum(val, 35); hasCamera = true; break;
      case "cC":
        costumeMutable.color = val.includes("/") ? rgbToHexColor(parseRgb(val)) : val;
        hasCostume = true;
        break;
      case "oR": costumeMutable.outlineRatio = parseNum(val, 1); hasCostume = true; break;
      case "acc": {
        const parts = val.split("/");
        costumeMutable.accessories.push({
          parentBone: parts[0] ?? "Head",
          position: { x: parseNum(parts[1]), y: parseNum(parts[2]), z: parseNum(parts[3]) },
          rotation: { x: parseNum(parts[4]), y: parseNum(parts[5]), z: parseNum(parts[6]) },
          scale: { x: parseNum(parts[7], 1), y: parseNum(parts[8], 1), z: parseNum(parts[9], 1) },
        });
        hasCostume = true;
        break;
      }
      case "hC": styleMutable.hairColor = parseRgb(val); hasStyle = true; break;
      case "sC": styleMutable.skinColor = parseRgb(val); hasStyle = true; break;
      case "ssT": styleMutable.secondShadeTexId = val; hasStyle = true; break;
      case "ssC": styleMutable.secondShadeColor = parseRgb(val); hasStyle = true; break;
      case "ssL": styleMutable.secondShadePosition = parseNum(val); hasStyle = true; break;
      case "ssW": styleMutable.secondShadeWidth = parseNum(val); hasStyle = true; break;
      case "rsT": styleMutable.rimShadeTexId = val; hasStyle = true; break;
      case "rsC": styleMutable.rimShadeColor = parseRgb(val); hasStyle = true; break;
      case "rsL": styleMutable.rimShadePosition = parseNum(val); hasStyle = true; break;
      case "rsW": styleMutable.rimShadeWidth = parseNum(val); hasStyle = true; break;
      case "olC": styleMutable.outlineColor = parseRgb(val); hasStyle = true; break;
      case "olT": styleMutable.outlineThickness = parseNum(val); hasStyle = true; break;
      case "olP": styleMutable.outlinePower = parseNum(val); hasStyle = true; break;
      case "hID": styleMutable.hairBaseId = val; hasStyle = true; break;
      case "shT": styleMutable.shaderType = val; hasStyle = true; break;
      case "lAX": styleMutable.lightAngleX = parseNum(val); hasStyle = true; break;
      case "lAY": styleMutable.lightAngleY = parseNum(val); hasStyle = true; break;
      default: unknownTokens.push({ key, value: val }); break;
    }
  }
  flushActiveLine();
  flushBone();
  if (hasStyle && !options?.fallbackPartType && partType === "head" && vertices.length === 0 && bones.length === 0) {
    partType = "style";
  }
  const seams = {
    ...(seamCenter ? { center: seamCenter } : {}),
    ...(seamLeft ? { left: seamLeft } : {}),
    ...(seamRight ? { right: seamRight } : {}),
  };
  return {
    ok: true,
    document: {
      version: SHAPER_PRESET_FORMAT_VERSION, partType, baseMeshId, name, vertices, creasePowers, seams,
      lines, hairStrands, hairBases, eyeball: hasEyeball ? eyeballMutable : null,
      bodyProportions: hasBody ? bodyMutable : null, bones, camera: hasCamera ? cameraMutable : null,
      costume: hasCostume ? costumeMutable : null, style: hasStyle ? styleMutable : null, unknownTokens,
    },
  };
}

/**
 * `ShaperNativePresetDocument`를 SHAPER `1.0` `.preset` 표준 텍스트 포맷으로 직렬화한다.
 */
export function serializeShaperNativePreset(doc: ShaperNativePresetDocument): string {
  const tokens: string[] = [];
  if (doc.partType !== "style") tokens.push(`mt*${doc.partType}`);
  if (doc.baseMeshId !== null) tokens.push(`mid*${doc.baseMeshId}`);
  if (doc.name !== null) tokens.push(`name*${doc.name}`);
  for (const v of doc.vertices) tokens.push(`v*${fmtVec3(v)}`);
  for (const p of doc.creasePowers) tokens.push(`p*${fmtNum(p)}`);
  if (doc.seams.center) tokens.push(`sposC*${fmtVec3(doc.seams.center)}`);
  if (doc.seams.left) tokens.push(`sposL*${fmtVec3(doc.seams.left)}`);
  if (doc.seams.right) tokens.push(`sposR*${fmtVec3(doc.seams.right)}`);

  for (const line of doc.lines) {
    tokens.push("l*");
    tokens.push(
      `lt*${fmtNum(line.thickness)}/${fmtNum(line.pressureMode)}/${fmtNum(line.colorMode)}/${fmtNum(line.color.r)}/${fmtNum(line.color.g)}/${fmtNum(line.color.b)}/${fmtNum(line.color.a)}/${fmtNum(line.layer)}`,
    );
    for (const pt of line.points) {
      tokens.push(`lp*${fmtVec3(pt.position)}`);
      tokens.push(
        `lpt*${fmtNum(pt.thickness)}/${fmtNum(pt.v0d)}/${fmtNum(pt.v1d)}/${fmtNum(pt.normal.x)}/${fmtNum(pt.normal.y)}/${fmtNum(pt.normal.z)}/${pt.baseMeshType}/${pt.partMeshId}/${pt.partBaseMeshId}`,
      );
    }
  }

  for (const strand of doc.hairStrands) {
    tokens.push("h*");
    tokens.push(
      `hp*${strand.baseMeshId}/${fmtNum(strand.v0d)}/${fmtNum(strand.v1d)}/${fmtVec3(strand.rotation)}/${fmtVec3(strand.controlPointPos)}/${fmtVec3(strand.controlPointRot)}/${fmtVec3(strand.controlPointScale)}/${fmtNum(strand.outline)}`,
    );
  }
  for (const hb of doc.hairBases) {
    tokens.push(`hb*${hb.baseId}`);
    const u = hb.uvTransform;
    tokens.push(`hbv*${fmtNum(u.x)}/${fmtNum(u.y)}/${fmtNum(u.w)}/${fmtNum(u.h)}/${fmtNum(u.tx)}/${fmtNum(u.ty)}`);
  }

  if (doc.eyeball) {
    const eb = doc.eyeball;
    if (eb.irisTexId !== undefined) tokens.push(`ebtid*${eb.irisTexId}`);
    if (eb.irisRect) tokens.push(`ebtp*${fmtRect4(eb.irisRect)}`);
    if (eb.highlightTexId !== undefined) tokens.push(`ebhtid*${eb.highlightTexId}`);
    if (eb.highlightRect) tokens.push(`ebhtp*${fmtRect4(eb.highlightRect)}`);
    if (eb.leftEyeRotation) tokens.push(`eblt*${fmtVec3(eb.leftEyeRotation)}`);
    if (eb.rightEyeRotation) tokens.push(`ebrt*${fmtVec3(eb.rightEyeRotation)}`);
    if (eb.highlightTrackingMode) tokens.push(`ebht*${eb.highlightTrackingMode}`);
    if (eb.highlightPosition) tokens.push(`ebhp*${fmtVec2(eb.highlightPosition)}`);
    if (eb.highlightAlpha !== undefined) tokens.push(`ebha*${fmtNum(eb.highlightAlpha)}`);
  }

  if (doc.bodyProportions) {
    const bp = doc.bodyProportions;
    if (bp.sex !== undefined) tokens.push(`sex*${bp.sex}`);
    if (bp.muscle !== undefined) tokens.push(`muscle*${fmtNum(bp.muscle)}`);
    if (bp.fat !== undefined) tokens.push(`fat*${fmtNum(bp.fat)}`);
  }

  for (const bone of doc.bones) {
    tokens.push(`bN*${bone.boneName}`);
    if (bone.position) tokens.push(`bP*${fmtVec3(bone.position)}`);
    if (bone.rotation) tokens.push(`bA*${fmtVec3(bone.rotation)}`);
    if (bone.scale) tokens.push(`bS*${fmtVec3(bone.scale)}`);
  }

  if (doc.camera) {
    if (doc.camera.position) tokens.push(`camP*${fmtVec3(doc.camera.position)}`);
    if (doc.camera.rotation) tokens.push(`camR*${fmtVec3(doc.camera.rotation)}`);
    if (doc.camera.fov !== undefined) tokens.push(`camFov*${fmtNum(doc.camera.fov)}`);
  }

  if (doc.costume) {
    if (doc.costume.color !== undefined) tokens.push(`cC*${doc.costume.color}`);
    if (doc.costume.outlineRatio !== undefined) tokens.push(`oR*${fmtNum(doc.costume.outlineRatio)}`);
    for (const acc of doc.costume.accessories) {
      tokens.push(`acc*${acc.parentBone}/${fmtVec3(acc.position)}/${fmtVec3(acc.rotation)}/${fmtVec3(acc.scale)}`);
    }
  }

  if (doc.style) {
    const st = doc.style;
    if (st.hairColor) tokens.push(`hC*${fmtRgb(st.hairColor)}`);
    if (st.skinColor) tokens.push(`sC*${fmtRgb(st.skinColor)}`);
    if (st.secondShadeTexId !== undefined) tokens.push(`ssT*${st.secondShadeTexId}`);
    if (st.secondShadeColor) tokens.push(`ssC*${fmtRgb(st.secondShadeColor)}`);
    if (st.secondShadePosition !== undefined) tokens.push(`ssL*${fmtNum(st.secondShadePosition)}`);
    if (st.secondShadeWidth !== undefined) tokens.push(`ssW*${fmtNum(st.secondShadeWidth)}`);
    if (st.rimShadeTexId !== undefined) tokens.push(`rsT*${st.rimShadeTexId}`);
    if (st.rimShadeColor) tokens.push(`rsC*${fmtRgb(st.rimShadeColor)}`);
    if (st.rimShadePosition !== undefined) tokens.push(`rsL*${fmtNum(st.rimShadePosition)}`);
    if (st.rimShadeWidth !== undefined) tokens.push(`rsW*${fmtNum(st.rimShadeWidth)}`);
    if (st.outlineColor) tokens.push(`olC*${fmtRgb(st.outlineColor)}`);
    if (st.outlineThickness !== undefined) tokens.push(`olT*${fmtNum(st.outlineThickness)}`);
    if (st.outlinePower !== undefined) tokens.push(`olP*${fmtNum(st.outlinePower)}`);
    if (st.hairBaseId !== undefined) tokens.push(`hID*${st.hairBaseId}`);
    if (st.shaderType !== undefined) tokens.push(`shT*${st.shaderType}`);
    if (st.lightAngleX !== undefined) tokens.push(`lAX*${fmtNum(st.lightAngleX)}`);
    if (st.lightAngleY !== undefined) tokens.push(`lAY*${fmtNum(st.lightAngleY)}`);
  }

  for (const unk of doc.unknownTokens) tokens.push(`${unk.key}*${unk.value}`);
  return `${SHAPER_PRESET_FORMAT_VERSION}\n${tokens.join(",")}`;
}

function inferDomainTypeFromFileName(fileName: string): ShaperPresetDomainType {
  const base = fileName.replace(/^.*[/\\]/u, "").replace(/\.(preset|shaper)$/iu, "");
  if (base === "defaultStyle" || base === "style") return "style";
  if ((SHAPER_HEAD_PART_TYPES as readonly string[]).includes(base)) return base as ShaperHeadPartType;
  return "head";
}

/**
 * `.shaper` 프로젝트 아카이브 내부의 파츠별 `.preset` 엔트리 맵을 일괄 파싱한다.
 */
export function parseShaperProjectArchive(
  entries: Readonly<Record<string, string>>,
): ShaperProjectArchiveParseResult {
  const presets: Partial<Record<ShaperPresetDomainType, ShaperNativePresetDocument>> = {};
  const errors: { readonly fileName: string; readonly error: string }[] = [];

  for (const [fileName, content] of Object.entries(entries)) {
    const parsed = parseShaperNativePreset(content, { fallbackPartType: inferDomainTypeFromFileName(fileName) });
    if (!parsed.ok) {
      errors.push({ fileName, error: parsed.error });
      continue;
    }
    presets[parsed.document.partType] = parsed.document;
  }

  return { ok: errors.length === 0 && Object.keys(presets).length > 0, presets, errors };
}

/**
 * 파싱된 Shaper 프리셋 문서(단일 또는 다중 파츠)를 ToonStudio `CharacterRecipe` 및
 * 얼굴/시맨틱 모프·카메라 요약으로 브리지 변환한다.
 */
export function bridgeShaperPresetToCharacterRecipe(
  input: ShaperNativePresetDocument | readonly ShaperNativePresetDocument[],
  baseRecipe: CharacterRecipe = createEmptyCharacterRecipe(),
): CharacterRecipeBridgeResult {
  const docs: readonly ShaperNativePresetDocument[] = Array.isArray(input) ? input : [input];
  const mutableSlots: { -readonly [K in CharacterSlotKind]: CharacterRecipeSlots[K] } = {
    ...baseRecipe.slots,
    accessory: [...baseRecipe.slots.accessory],
  };
  const mutableColors: { -readonly [K in keyof CharacterRecipeColors]: string | null } = { ...baseRecipe.colors };
  let handSide: CharacterHandSide = baseRecipe.handSide;
  const touchedSet = new Set<CharacterSlotKind>();
  const forgeFacePatch: Partial<AvatarForgeFaceParams> = {};
  const semanticMorphs: CharacterSemanticMorphBundle = {};
  let camera: ShaperCameraTransform | null = null;
  let surfaceLineCount = 0;
  let hairStrandCount = 0;

  for (const doc of docs) {
    surfaceLineCount += doc.lines.length;
    hairStrandCount += doc.hairStrands.length;
    if (doc.camera) camera = doc.camera;

    const tagId = doc.name ?? doc.baseMeshId ?? "default";
    for (const slot of mapShaperPartTypeToCharacterSlots(doc.partType)) {
      if (CHARACTER_SLOT_KINDS.includes(slot)) touchedSet.add(slot);
    }

    switch (doc.partType) {
      case "head": {
        mutableSlots["face-shape"] = `face-shape:shaper-${tagId}`;
        if (doc.vertices.length > 0) {
          const avgX = doc.vertices.reduce((acc, v) => acc + Math.abs(v.x), 0) / doc.vertices.length;
          const avgY = doc.vertices.reduce((acc, v) => acc + v.y, 0) / doc.vertices.length;
          forgeFacePatch.headWidth = Number(Math.max(0.8, Math.min(1.25, 1 + (avgX - 0.5) * 0.2)).toFixed(3));
          forgeFacePatch.chinLength = Number(Math.max(-0.5, Math.min(0.5, avgY * 0.25)).toFixed(3));
        }
        break;
      }
      case "eyes":
        mutableSlots.eyes = `eyes:shaper-${tagId}`;
        if (doc.eyeball?.irisTexId) mutableSlots.irises = `irises:shaper-${doc.eyeball.irisTexId}`;
        if (doc.eyeball?.irisRect) {
          semanticMorphs.irisSize = Number(Math.max(-1, Math.min(1, (doc.eyeball.irisRect.w - 1) * 0.5)).toFixed(3));
        }
        break;
      case "nose": mutableSlots.nose = `nose:shaper-${tagId}`; break;
      case "mouth": mutableSlots.mouth = `mouth:shaper-${tagId}`; break;
      case "ears": mutableSlots.ears = `ears:shaper-${tagId}`; break;
      case "neck":
      case "body": mutableSlots.body = `body:shaper-${tagId}`; break;
      case "hair": mutableSlots.hair = `hair:shaper-${tagId}`; break;
      case "clothTop":
        mutableSlots.top = `top:shaper-${tagId}`;
        if (doc.costume?.color) mutableColors.top = doc.costume.color;
        break;
      case "clothBottom":
        mutableSlots.bottom = `bottom:shaper-${tagId}`;
        if (doc.costume?.color) mutableColors.bottom = doc.costume.color;
        break;
      case "shoes":
        mutableSlots.shoes = `shoes:shaper-${tagId}`;
        if (doc.costume?.color) mutableColors.shoes = doc.costume.color;
        break;
      case "acc": {
        const accId = `accessory:shaper-${tagId}`;
        if (!mutableSlots.accessory.includes(accId)) mutableSlots.accessory = [...mutableSlots.accessory, accId];
        break;
      }
      case "pose": mutableSlots.pose = `pose:shaper-${tagId}`; break;
      case "handPose": {
        mutableSlots["hand-pose"] = `hand-pose:shaper-${tagId}`;
        const hasLeft = doc.bones.some((b) => /left|[_.]l$/iu.test(b.boneName));
        const hasRight = doc.bones.some((b) => /right|[_.]r$/iu.test(b.boneName));
        handSide = hasLeft && !hasRight ? "left" : hasRight && !hasLeft ? "right" : "both";
        break;
      }
      case "style":
        if (doc.style?.skinColor) mutableColors.skin = rgbToHexColor(doc.style.skinColor);
        if (doc.style?.hairColor) {
          const hex = rgbToHexColor(doc.style.hairColor);
          mutableColors.hairBase = hex;
          if (!mutableColors.hairTip) mutableColors.hairTip = hex;
        }
        if (doc.style?.secondShadeColor && !mutableColors.hairTip) {
          mutableColors.hairTip = rgbToHexColor(doc.style.secondShadeColor);
        }
        break;
    }
  }

  return {
    recipe: {
      version: 1,
      slots: mutableSlots,
      colors: mutableColors,
      handSide,
      ...(baseRecipe.handPoses ? { handPoses: baseRecipe.handPoses } : {}),
    },
    touchedSlots: [...touchedSet],
    forgeFacePatch,
    semanticMorphs,
    camera,
    surfaceLineCount,
    hairStrandCount,
  };
}
