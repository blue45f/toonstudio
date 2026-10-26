/**
 * @file csp-cs3o-foil-sprite-atlas.ts
 * @description Clip Studio 1.5 (`CLIP STUDIO PAINT.app` v5.1.5)
 *              1. `.cs3o` (`dessindoll_head_ver1.cs3o`, `dessindollLeftHand.cs3o`, `dessindollRightHand.cs3o`)
 *                 SQLite `object3d` 테이블 및 `"CLIP_STUDIO_3D_DATA2"` / `"catalog_object"` 바이너리 코덱
 *              2. `default_pose_ver2.pep` 67노드 전신 스켈레톤 계층, `0A24C606` 42종 3D 카테고리·21종 표정/모음 모프·
 *                 10종 안면 특징점(`mouth_fp_`..`seatpoint_fp_`) 및 6단계 `shadeDS` 툰+MatCap 셰이더
 *              3. `46B67EA9[4]` `PWGLisfoilstamptex` 금박(Foil-Stamp)·엠보스·범프·스피어 반사 GLSL 셰이더
 *              4. `4B945704`(305 PNG) 외 8종 `PWPiece` + `"png_"` UI 스프라이트 아틀라스 파서/인코더 및
 *                 잔여 UUID 리소스 아카이브 전수 명세 + `48B1A2B7` Indentation-DSL XML 컴파일러
 */

// ---------------------------------------------------------------------------
// 1. .cs3o (3D 캐릭터 두상·손 오브젝트 SQLite + CLIP_STUDIO_3D_DATA2 바이너리 코덱)
// ---------------------------------------------------------------------------

export const CSP_CS3O_SQLITE_TABLE_DDL =
  "CREATE TABLE object3d(_PW_ID INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER DEFAULT NULL, catalog_id TEXT DEFAULT NULL, catalog_data BLOB DEFAULT NULL);" as const;

export const CSP_CS3O_MAGIC_HEADER = "CLIP_STUDIO_3D_DATA2" as const;
export const CSP_CS3O_CHUNK_TAG = "catalog_object" as const;

export interface CspBuiltinCs3oCharacterObjectSpec {
  readonly fileName:
    | "dessindoll_head_ver1.cs3o"
    | "dessindollLeftHand.cs3o"
    | "dessindollRightHand.cs3o";
  readonly sqliteByteSize: number;
  readonly version: number;
  readonly catalogId: string;
  readonly catalogDataByteSize: number;
  readonly rigPartKind: "head_facial_morph" | "left_hand_slerp" | "right_hand_slerp";
  readonly embeddedFbxSdkVersion: string;
  readonly descriptionKo: string;
}

export const CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS: readonly CspBuiltinCs3oCharacterObjectSpec[] =
  [
    {
      fileName: "dessindoll_head_ver1.cs3o",
      sqliteByteSize: 8_245_248,
      version: 1000,
      catalogId: "head_ver1_default",
      catalogDataByteSize: 8_234_644,
      rigPartKind: "head_facial_morph",
      embeddedFbxSdkVersion: "FBX SDK/FBX Plugins version 2020.2",
      descriptionKo: "3D 데생 인형 두상 모델 (10종 안면 특징점 + 21종 표정/모음 모프 내장)",
    },
    {
      fileName: "dessindollLeftHand.cs3o",
      sqliteByteSize: 679_936,
      version: 1000,
      catalogId: "left_hand_default",
      catalogDataByteSize: 671_288,
      rigPartKind: "left_hand_slerp",
      embeddedFbxSdkVersion: "FBX SDK/FBX Plugins version 2020.2",
      descriptionKo: "3D 데생 인형 왼손 메쉬·리깅 오브젝트 (handsetup_*.pep 연동)",
    },
    {
      fileName: "dessindollRightHand.cs3o",
      sqliteByteSize: 737_280,
      version: 1000,
      catalogId: "right_hand_default",
      catalogDataByteSize: 728_516,
      rigPartKind: "right_hand_slerp",
      embeddedFbxSdkVersion: "FBX SDK/FBX Plugins version 2020.2",
      descriptionKo: "3D 데생 인형 오른손 메쉬·리깅 오브젝트 (handsetup_*.pep 연동)",
    },
  ] as const;

export interface CspCs3oObject3dHeader {
  readonly magicHeader: typeof CSP_CS3O_MAGIC_HEADER;
  readonly chunkTag: typeof CSP_CS3O_CHUNK_TAG;
  readonly guidHex: string;
  readonly formatRevision: number;
  readonly primaryPayloadOffset: number;
  readonly totalBlobLength: number;
  readonly hasEmbeddedFbx: boolean;
  readonly hasEmbeddedNnb: boolean;
  readonly embeddedPngCount: number;
}

function readAsciiString(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i += 1) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

function findAsciiSubsequence(haystack: Uint8Array, needleAscii: string): boolean {
  if (needleAscii.length === 0 || haystack.length < needleAscii.length) return false;
  const firstCode = needleAscii.charCodeAt(0);
  const limit = haystack.length - needleAscii.length;
  for (let i = 0; i <= limit; i += 1) {
    if (haystack[i] !== firstCode) continue;
    let matched = true;
    for (let j = 1; j < needleAscii.length; j += 1) {
      if (haystack[i + j] !== needleAscii.charCodeAt(j)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function countPngSignatures(bytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i + 8 <= bytes.length; i += 1) {
    if (
      bytes[i] === 0x89 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x4e &&
      bytes[i + 3] === 0x47 &&
      bytes[i + 4] === 0x0d &&
      bytes[i + 5] === 0x0a &&
      bytes[i + 6] === 0x1a &&
      bytes[i + 7] === 0x0a
    ) {
      count += 1;
    }
  }
  return count;
}

export function parseCspCs3oObject3dHeader(bytes: Uint8Array): CspCs3oObject3dHeader {
  if (bytes.byteLength < 68) {
    throw new Error(`Invalid .cs3o catalog_data: expected >= 68 bytes, got ${bytes.byteLength}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magicLen = view.getUint32(0, true);
  const magic = readAsciiString(bytes, 4, magicLen);
  if (magic !== CSP_CS3O_MAGIC_HEADER) {
    throw new Error(`Invalid .cs3o magic header: ${magic}`);
  }
  const tagOffset = 4 + magicLen;
  const tagLen = view.getUint32(tagOffset, true);
  const chunkTag = readAsciiString(bytes, tagOffset + 4, tagLen);
  if (chunkTag !== CSP_CS3O_CHUNK_TAG) {
    throw new Error(`Invalid .cs3o chunk tag: ${chunkTag}`);
  }
  const guidOffset = tagOffset + 4 + tagLen;
  let guidHex = "";
  for (let i = 0; i < 16; i += 1) {
    guidHex += (bytes[guidOffset + i] ?? 0).toString(16).padStart(2, "0");
  }
  const revOffset = guidOffset + 16;
  const formatRevision = view.getUint32(revOffset, true);
  const primaryPayloadOffset = view.getUint32(revOffset + 4, true);

  return {
    magicHeader: CSP_CS3O_MAGIC_HEADER,
    chunkTag: CSP_CS3O_CHUNK_TAG,
    guidHex,
    formatRevision,
    primaryPayloadOffset,
    totalBlobLength: bytes.byteLength,
    hasEmbeddedFbx: findAsciiSubsequence(bytes, "Kaydara FBX Binary"),
    hasEmbeddedNnb: findAsciiSubsequence(bytes, "NNB1"),
    embeddedPngCount: countPngSignatures(bytes),
  };
}

export function encodeCspCs3oObject3dHeader(input: {
  readonly guidHex?: string;
  readonly formatRevision?: number;
  readonly payloadBytes?: Uint8Array;
}): Uint8Array {
  const guidClean = (input.guidHex ?? "30313233343536373839616263646566")
    .replace(/[^0-9a-fA-F]/g, "")
    .padEnd(32, "0")
    .slice(0, 32);
  const payload = input.payloadBytes ?? new Uint8Array(0);
  const headerSize = 4 + 20 + 4 + 14 + 16 + 4 + 4 + 4;
  const out = new Uint8Array(headerSize + payload.byteLength);
  const view = new DataView(out.buffer);

  view.setUint32(0, 20, true);
  for (let i = 0; i < 20; i += 1) out[4 + i] = CSP_CS3O_MAGIC_HEADER.charCodeAt(i);
  view.setUint32(24, 14, true);
  for (let i = 0; i < 14; i += 1) out[28 + i] = CSP_CS3O_CHUNK_TAG.charCodeAt(i);
  for (let i = 0; i < 16; i += 1) {
    out[42 + i] = Number.parseInt(guidClean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  view.setUint32(58, input.formatRevision ?? 2, true);
  view.setUint32(62, headerSize, true);
  view.setUint32(66, payload.byteLength, true);
  out.set(payload, headerSize);
  return out;
}

// ---------------------------------------------------------------------------
// 2. default_pose_ver2.pep 67노드 전신 본 계층 & 0A24C606 42카테고리·21표정·10특징점
// ---------------------------------------------------------------------------

export const CSP_DEFAULT_POSE_VER2_67_BONES = [
  "RootNode", "Reference", "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "Head_End",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3", "LeftHandThumb4",
  "LeftHandIndex1", "LeftHandIndex2", "LeftHandIndex3", "LeftHandIndex4",
  "LeftHandMiddle1", "LeftHandMiddle2", "LeftHandMiddle3", "LeftHandMiddle4",
  "LeftHandRing1", "LeftHandRing2", "LeftHandRing3", "LeftHandRing4",
  "LeftHandPinky1", "LeftHandPinky2", "LeftHandPinky3", "LeftHandPinky4",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "RightHandThumb1", "RightHandThumb2", "RightHandThumb3", "RightHandThumb4",
  "RightHandIndex1", "RightHandIndex2", "RightHandIndex3", "RightHandIndex4",
  "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3", "RightHandMiddle4",
  "RightHandRing1", "RightHandRing2", "RightHandRing3", "RightHandRing4",
  "RightHandPinky1", "RightHandPinky2", "RightHandPinky3", "RightHandPinky4",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "LeftToe_End",
  "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase", "RightToe_End",
] as const;

export const CSP_3D_HEAD_10_FEATURE_POINTS = [
  { id: "mouth_fp_", labelKo: "입 중심 특징점 (Mouth Feature Point)" },
  { id: "nose_fp_", labelKo: "코끝 특징점 (Nose Tip Feature Point)" },
  { id: "chin_fp_", labelKo: "턱끝 특징점 (Chin Feature Point)" },
  { id: "forehead_fp_", labelKo: "이마 중심 특징점 (Forehead Feature Point)" },
  { id: "ear_l_fp_", labelKo: "왼쪽 귀 특징점 (Left Ear Feature Point)" },
  { id: "ear_r_fp_", labelKo: "오른쪽 귀 특징점 (Right Ear Feature Point)" },
  { id: "eye_l_fp_", labelKo: "왼쪽 눈동자 특징점 (Left Eye Feature Point)" },
  { id: "eye_r_fp_", labelKo: "오른쪽 눈동자 특징점 (Right Eye Feature Point)" },
  { id: "neck_fp_", labelKo: "목 연결 특징점 (Neck Joint Feature Point)" },
  { id: "seatpoint_fp_", labelKo: "안착 기준점 (Seat Anchor Point)" },
] as const;

export const CSP_3D_FACIAL_21_MORPH_CHANNELS = [
  "eyebrow_up_down", "eyebrow_angle", "eye_open_close", "eye_smile", "eye_squint",
  "pupil_scale", "nose_height", "nose_width", "mouth_open", "mouth_width", "mouth_corner_up_down",
  "vowel_a", "vowel_i", "vowel_u", "vowel_e", "vowel_o",
  "expr_joy", "expr_anger", "expr_sorrow", "expr_surprise", "expr_neutral",
] as const;

export const CSP_3D_ASSET_42_CATEGORIES = [
  "3d_b1_body_male", "3d_b2_body_female", "3d_b3_head_base", "3d_b4_hair_front", "3d_b5_hair_back",
  "3d_b6_Pose_fullbody", "3d_b7_pose_hand", "3d_b8_prim_cube", "3d_b9_prim_sphere", "3d_b10_prim_prism",
  "3d_c1_char_casual", "3d_c2_char_school", "3d_c3_char_fantasy", "3d_c4_char_scifi", "3d_c5_acc_glasses",
  "3d_c6_acc_hat", "3d_c7_acc_shoes", "3d_c8_acc_weapon", "3d_c9_acc_bag", "3d_c10_acc_jewelry",
  "3d_s1_scene_classroom", "3d_s2_scene_bedroom", "3d_s3_scene_office", "3d_s4_scene_street", "3d_s5_scene_station",
  "3d_s6_scene_cafe", "3d_s7_scene_castle", "3d_s8_scene_forest", "3d_s9_scene_vehicle", "3d_s10_scene_sky_dome",
  "3d_p1_prop_desk", "3d_p2_prop_chair", "3d_p3_prop_bed", "3d_p4_prop_door", "3d_p5_prop_window",
  "3d_p6_prop_book", "3d_p7_prop_cup", "3d_p8_prop_phone", "3d_p9_prop_bicycle", "3d_p10_prop_car",
  "3d_l1_light_directional", "3d_l2_camera_preset",
] as const;

// ---------------------------------------------------------------------------
// 3. 46B67EA9[4] PWGLisfoilstamptex 금박(Foil-Stamp)·범프·스피어 반사 GLSL 셰이더 &
//    0A24C606[2] 6단계 shadeDS 툰 + MatCap 셰이더
// ---------------------------------------------------------------------------

export interface CspPwglFoilStampShaderInput {
  readonly baseRgb01: readonly [number, number, number];
  readonly maskAlpha3x3: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
  readonly bumpNormalXyz?: readonly [number, number, number];
  readonly lightDirXyz?: readonly [number, number, number];
  readonly foilDiffuseRgb01?: readonly [number, number, number];
  readonly sphereMapRgb01?: readonly [number, number, number];
}

export interface CspPwglFoilStampShaderResult {
  readonly edgeNormalXyz: readonly [number, number, number];
  readonly perturbedNormalXyz: readonly [number, number, number];
  readonly specularIntensity: number;
  readonly featheredMaskAlpha01: number;
  readonly foilCompositeRgb01: readonly [number, number, number];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalizeVec3(x: number, y: number, z: number): readonly [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

export function evaluateCspPwglFoilStampShading(
  input: CspPwglFoilStampShaderInput,
): CspPwglFoilStampShaderResult {
  const m = input.maskAlpha3x3;
  const dxx = (m[2] + 2 * m[5] + m[8] - (m[0] + 2 * m[3] + m[6])) * 0.5;
  const dyy = (m[6] + 2 * m[7] + m[8] - (m[0] + 2 * m[1] + m[2])) * 0.5;
  const edgeNormalXyz = normalizeVec3(-dxx, -dyy, 1.0);

  const bump = input.bumpNormalXyz ?? [0.1, 0.1, 0.98];
  const perturbedNormalXyz = normalizeVec3(
    edgeNormalXyz[0] + bump[0] * 0.15,
    edgeNormalXyz[1] + bump[1] * 0.15,
    edgeNormalXyz[2] + bump[2] * 0.15,
  );

  const lightDir = normalizeVec3(
    input.lightDirXyz?.[0] ?? 0.35,
    input.lightDirXyz?.[1] ?? 0.45,
    input.lightDirXyz?.[2] ?? 0.82,
  );
  const nDotL = Math.max(
    0,
    perturbedNormalXyz[0] * lightDir[0] +
      perturbedNormalXyz[1] * lightDir[1] +
      perturbedNormalXyz[2] * lightDir[2],
  );
  const halfVec = normalizeVec3(lightDir[0], lightDir[1], lightDir[2] + 1.0);
  const nDotH = Math.max(
    0,
    perturbedNormalXyz[0] * halfVec[0] +
      perturbedNormalXyz[1] * halfVec[1] +
      perturbedNormalXyz[2] * halfVec[2],
  );
  const specularIntensity = nDotL > 0 ? Math.pow(nDotH, 100.0) : 0;

  const foilBase = input.foilDiffuseRgb01 ?? [0.96, 0.78, 0.24];
  const sphere = input.sphereMapRgb01 ?? [0.99, 0.91, 0.55];
  const diffR = foilBase[0] * (0.25 + 0.75 * nDotL);
  const diffG = foilBase[1] * (0.25 + 0.75 * nDotL);
  const diffB = foilBase[2] * (0.25 + 0.75 * nDotL);

  const foilR = clamp01(0.3 * diffR + 0.4 * sphere[0] + 0.8 * specularIntensity);
  const foilG = clamp01(0.3 * diffG + 0.4 * sphere[1] + 0.8 * specularIntensity);
  const foilB = clamp01(0.3 * diffB + 0.4 * sphere[2] + 0.8 * specularIntensity);

  const featheredMaskAlpha01 = clamp01(
    (m[0] + m[1] * 2 + m[2] + m[3] * 2 + m[4] * 4 + m[5] * 2 + m[6] + m[7] * 2 + m[8]) / 16,
  );

  const base = input.baseRgb01;
  return {
    edgeNormalXyz,
    perturbedNormalXyz,
    specularIntensity,
    featheredMaskAlpha01,
    foilCompositeRgb01: [
      clamp01(base[0] * (1 - featheredMaskAlpha01) + foilR * featheredMaskAlpha01),
      clamp01(base[1] * (1 - featheredMaskAlpha01) + foilG * featheredMaskAlpha01),
      clamp01(base[2] * (1 - featheredMaskAlpha01) + foilB * featheredMaskAlpha01),
    ],
  };
}

export function evaluateCspShadeDsSixStepToon(input: {
  readonly baseRgb01: readonly [number, number, number];
  readonly nDotL01: number;
  readonly sphereMapRgb01?: readonly [number, number, number];
  readonly sphereBlend01?: number;
}): {
  readonly stepIndex: 0 | 1 | 2 | 3 | 4 | 5;
  readonly stepFactor: number;
  readonly shadedRgb01: readonly [number, number, number];
} {
  const v = clamp01(input.nDotL01);
  const thresholds = [0.15, 0.32, 0.5, 0.68, 0.85] as const;
  const factors = [0.28, 0.44, 0.6, 0.76, 0.9, 1.0] as const;
  let stepIndex: 0 | 1 | 2 | 3 | 4 | 5 = 5;
  if (v < thresholds[0]) stepIndex = 0;
  else if (v < thresholds[1]) stepIndex = 1;
  else if (v < thresholds[2]) stepIndex = 2;
  else if (v < thresholds[3]) stepIndex = 3;
  else if (v < thresholds[4]) stepIndex = 4;

  const stepFactor = factors[stepIndex];
  const sphere = input.sphereMapRgb01 ?? [0.95, 0.97, 1.0];
  const blend = clamp01(input.sphereBlend01 ?? 0.2);

  return {
    stepIndex,
    stepFactor,
    shadedRgb01: [
      clamp01(input.baseRgb01[0] * stepFactor * (1 - blend) + sphere[0] * blend),
      clamp01(input.baseRgb01[1] * stepFactor * (1 - blend) + sphere[1] * blend),
      clamp01(input.baseRgb01[2] * stepFactor * (1 - blend) + sphere[2] * blend),
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. PWPiece + "png_" UI 스프라이트 아틀라스 코덱 & 48B1A2B7 Indentation-DSL 컴파일러
// ---------------------------------------------------------------------------

export interface CspPwPieceSpriteSlice {
  readonly sliceName: string;
  readonly leftPx: number;
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface CspPwPieceSpriteAtlasEntry {
  readonly pngByteLength: number;
  readonly atlasWidthPx: number;
  readonly atlasHeightPx: number;
  readonly slices: readonly CspPwPieceSpriteSlice[];
}

export function parseCspPwPieceSpriteAtlasEntry(bytes: Uint8Array): CspPwPieceSpriteAtlasEntry {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pngByteLength = 0;
  let atlasWidthPx = 0;
  let atlasHeightPx = 0;

  for (let i = 0; i + 32 <= bytes.byteLength; i += 1) {
    if (
      bytes[i] === 0x70 &&
      bytes[i + 1] === 0x6e &&
      bytes[i + 2] === 0x67 &&
      bytes[i + 3] === 0x5f
    ) {
      pngByteLength = view.getUint32(i + 4, false);
      const pngStart = i + 8;
      if (pngStart + 24 <= bytes.byteLength && bytes[pngStart] === 0x89 && bytes[pngStart + 1] === 0x50) {
        atlasWidthPx = view.getUint32(pngStart + 16, false);
        atlasHeightPx = view.getUint32(pngStart + 20, false);
      }
      break;
    }
  }

  const slices: CspPwPieceSpriteSlice[] = [];
  for (let i = 0; i + 120 <= bytes.byteLength; i += 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x57 &&
      bytes[i + 2] === 0x50 &&
      bytes[i + 3] === 0x69 &&
      bytes[i + 4] === 0x65 &&
      bytes[i + 5] === 0x63 &&
      bytes[i + 6] === 0x65
    ) {
      const nameCharCount = view.getUint32(i + 23, false);
      if (nameCharCount > 0 && nameCharCount <= 64 && i + 27 + nameCharCount * 2 + 80 <= bytes.byteLength) {
        let sliceName = "";
        for (let c = 0; c < nameCharCount; c += 1) {
          const code = view.getUint16(i + 27 + c * 2, false);
          if (code !== 0) sliceName += String.fromCharCode(code);
        }
        const coordBase = i + 27 + nameCharCount * 2 + 62;
        if (coordBase + 16 <= bytes.byteLength) {
          const leftPx = view.getUint32(coordBase, false);
          const topPx = view.getUint32(coordBase + 4, false);
          const rightPx = view.getUint32(coordBase + 8, false);
          const bottomPx = view.getUint32(coordBase + 12, false);
          slices.push({
            sliceName,
            leftPx,
            topPx,
            rightPx,
            bottomPx,
            widthPx: Math.max(0, rightPx - leftPx),
            heightPx: Math.max(0, bottomPx - topPx),
          });
        }
      }
    }
  }

  return { pngByteLength, atlasWidthPx, atlasHeightPx, slices };
}

export function encodeCspPwPieceSpriteAtlasEntry(input: {
  readonly atlasWidthPx: number;
  readonly atlasHeightPx: number;
  readonly slices: readonly {
    readonly sliceName: string;
    readonly leftPx: number;
    readonly topPx: number;
    readonly rightPx: number;
    readonly bottomPx: number;
  }[];
}): Uint8Array {
  const pngStubLen = 24;
  const pieceRecords: Uint8Array[] = input.slices.map((s) => {
    const nameLen = s.sliceName.length;
    const rec = new Uint8Array(27 + nameLen * 2 + 80);
    const rv = new DataView(rec.buffer);
    const magic = "PWPiece";
    for (let i = 0; i < magic.length; i += 1) rec[i] = magic.charCodeAt(i);
    rv.setUint32(23, nameLen, false);
    for (let i = 0; i < nameLen; i += 1) rv.setUint16(27 + i * 2, s.sliceName.charCodeAt(i), false);
    const coordBase = 27 + nameLen * 2 + 62;
    rv.setUint32(coordBase, s.leftPx, false);
    rv.setUint32(coordBase + 4, s.topPx, false);
    rv.setUint32(coordBase + 8, s.rightPx, false);
    rv.setUint32(coordBase + 12, s.bottomPx, false);
    return rec;
  });

  const totalPieceLen = pieceRecords.reduce((acc, r) => acc + r.byteLength, 0);
  const out = new Uint8Array(8 + pngStubLen + totalPieceLen);
  const view = new DataView(out.buffer);
  out.set([0x70, 0x6e, 0x67, 0x5f], 0);
  view.setUint32(4, pngStubLen, false);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 8);
  view.setUint32(8 + 16, input.atlasWidthPx, false);
  view.setUint32(8 + 20, input.atlasHeightPx, false);

  let cursor = 8 + pngStubLen;
  for (const rec of pieceRecords) {
    out.set(rec, cursor);
    cursor += rec.byteLength;
  }
  return out;
}

export const CSP_PWPIECE_SPRITE_ATLAS_ARCHIVES = [
  { archiveId: "4B945704", byteSize: 13_416_816, c1Count: 131, pngCount: 305, roleKo: "메인 스튜디오 툴바·팔레트·커맨드바 아이콘 스프라이트 아틀라스" },
  { archiveId: "2BA04572", byteSize: 3_760_112, c1Count: 44, pngCount: 88, roleKo: "도구 속성·브러시 스트로크 미리보기·보조 아이콘 아틀라스" },
  { archiveId: "A0AA5020", byteSize: 2_310_420, c1Count: 32, pngCount: 64, roleKo: "레이어·마스크·블렌딩·타임라인 상태 아이콘 아틀라스" },
  { archiveId: "C1DBD787", byteSize: 1_904_216, c1Count: 28, pngCount: 56, roleKo: "3D 매니퓰레이터·카메라·조명 기즈모 스프라이트 아틀라스" },
  { archiveId: "FBD7D97E", byteSize: 1_312_088, c1Count: 22, pngCount: 44, roleKo: "심플 모드(모바일/태블릿) 터치 제스처·플로팅 아이콘 아틀라스" },
  { archiveId: "22A6FE03", byteSize: 472_104, c1Count: 14, pngCount: 28, roleKo: "컬러 휠·슬라이더·스포이드 커서 스프라이트 아틀라스" },
  { archiveId: "8083E4D1", byteSize: 401_920, c1Count: 12, pngCount: 24, roleKo: "자(Ruler)·퍼스펙티브 가이드·그리드 핸들 아틀라스" },
  { archiveId: "87775483", byteSize: 171_440, c1Count: 8, pngCount: 16, roleKo: "다이얼 메뉴·빠른 실행 오버레이 배지 아틀라스" },
] as const;

export const CSP_REMAINING_RESOURCE_ARCHIVE_SPECS = [
  { archiveId: "2D481AE5", app: "PAINT", c1Count: 2, roleKo: "OpenToonz (.tlv / .tpl / .tnz) 씬 내보내기 및 lzocompress 연동 리소스" },
  { archiveId: "48B1A2B7", app: "PAINT", c1Count: 6, roleKo: "Indentation-DSL 기반 EPUB OPF/NCX·BVData·Face·PrintSpec XML 생성기" },
  { archiveId: "4CB47456", app: "PAINT", c1Count: 1, roleKo: "CELSYS:BOOK:VIEWER:1.0 3D 제본 미리보기(BookViewer) 설정 및 셰이더" },
  { archiveId: "7F9F9530", app: "PAINT", c1Count: 5, roleKo: "Kindle·ibisPaint·kakooyo·Action·Coordinate 크로스앱 클라우드 교환 브리지" },
  { archiveId: "8AF4B718", app: "PAINT", c1Count: 2, roleKo: "AVI 1.0/2.0·MP4·QuickTime 애니메이션 동영상 렌더러 설정" },
  { archiveId: "97CDB75A", app: "PAINT", c1Count: 1, roleKo: "Kindle 전자책 포맷 직접 출력 프로파일" },
  { archiveId: "FCBD92AE", app: "PAINT", c1Count: 1, roleKo: "OpenGL GPU 렌더러·VRAM·셰이더 성능 진단 체커" },
  { archiveId: "5704E805", app: "PAINT", c1Count: 9, roleKo: "PWCommandShortcut 단축키 엔진 및 IllustStudio/ComicStudio 4.0/3.0 레거시 컨버터" },
  { archiveId: "E79C2AC5", app: "CLIP_STUDIO", c1Count: 67, roleKo: "CLIP STUDIO 소재 카탈로그·태그·폴더 관리 PW* 다이얼로그 67종" },
  { archiveId: "DD705E0D", app: "CLIP_STUDIO", c1Count: 29, roleKo: "CLIP STUDIO 클라우드 동기화·알림·작품 관리 PW* 다이얼로그 29종" },
] as const;

export function compileCsp48B1A2B7IndentationDslToXml(dslText: string): string {
  const lines = dslText
    .split(/\r?\n/)
    .map((raw) => raw.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0);

  interface NodeItem {
    readonly tag: string;
    readonly indent: number;
    readonly attrs: string[];
    valueText: string;
    readonly children: NodeItem[];
  }

  const rootNodes: NodeItem[] = [];
  const stack: NodeItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed.startsWith("E:")) {
      const tag = trimmed.slice(2).trim();
      const node: NodeItem = { tag, indent, attrs: [], valueText: "", children: [] };
      while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
      if (stack.length === 0) rootNodes.push(node);
      else stack[stack.length - 1]!.children.push(node);
      stack.push(node);
    } else if (trimmed.startsWith("A:") && stack.length > 0) {
      const eqIdx = trimmed.indexOf("=", 2);
      if (eqIdx > 2) {
        stack[stack.length - 1]!.attrs.push(
          `${trimmed.slice(2, eqIdx).trim()}="${trimmed.slice(eqIdx + 1).trim()}"`,
        );
      }
    } else if (trimmed.startsWith("V:") && stack.length > 0) {
      stack[stack.length - 1]!.valueText = trimmed.slice(2).trim();
    }
  }

  const renderNode = (node: NodeItem, depth: number): string => {
    const pad = "  ".repeat(depth);
    const attrStr = node.attrs.length > 0 ? ` ${node.attrs.join(" ")}` : "";
    if (node.children.length === 0 && node.valueText.length === 0) return `${pad}<${node.tag}${attrStr}/>`;
    if (node.children.length === 0) return `${pad}<${node.tag}${attrStr}>${node.valueText}</${node.tag}>`;
    const inner = node.children.map((ch) => renderNode(ch, depth + 1)).join("\n");
    return `${pad}<${node.tag}${attrStr}>\n${inner}\n${pad}</${node.tag}>`;
  };

  return rootNodes.map((n) => renderNode(n, 0)).join("\n");
}
