/** 기본 단색 box 편집 파생 GLB에 실제 원본 재질을 기록한다. 형상·BIN·provenance는 재작성하지 않는다. */
import { STUDIO_HYBRID_DCC_GLB_EXPORT_GENERATOR } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_GLB_MAX_JSON_BYTES } from "./studio-bg3d-glb-validation";
import {
  STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS,
  STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY,
} from "./studio-bg3d-primitive-edit-material-runtime";

export type StudioBg3dPrimitiveEditMaterialResult =
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly code: "invalid-color" | "invalid-glb" | "unsupported-export" | "budget-exceeded"; readonly messageKo: string };

type FailureCode = Extract<StudioBg3dPrimitiveEditMaterialResult, { readonly ok: false }>["code"];
function failure(code: FailureCode): StudioBg3dPrimitiveEditMaterialResult {
  const messages = {
    "invalid-color": "상자의 원본 색상이 올바르지 않아 모델을 만들지 않았습니다.",
    "invalid-glb": "편집 모델의 GLB 바이트를 읽지 못해 원본을 교체하지 않았습니다.",
    "unsupported-export": "재질 없는 단일 편집 메시 내보내기만 원본 재질을 보존할 수 있습니다.",
    "budget-exceeded": "재질을 포함한 편집 모델이 자산 크기 제한을 넘었습니다.",
  };
  return { ok: false, code, messageKo: messages[code] };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isArray(value: unknown): value is unknown[] { return Array.isArray(value); }

/** Three ColorManagement의 sRGB 전달 함수와 같다. 전역 ColorManagement 설정에 의존하지 않는다. */
function linearChannel(byte: number): number {
  const value = byte / 255;
  return value < 0.04045 ? value * 0.0773993808 : Math.pow(value * 0.9478672986 + 0.0521327014, 2.4);
}
function onlyExportedPrimitive(root: Record<string, unknown>): Record<string, unknown> | null {
  const asset = root.asset;
  if (!isRecord(asset) || asset.version !== "2.0" || asset.generator !== STUDIO_HYBRID_DCC_GLB_EXPORT_GENERATOR) return null;
  if (root.materials !== undefined || root.textures !== undefined || root.images !== undefined
    || root.animations !== undefined || root.skins !== undefined || root.extensions !== undefined) return null;
  if (!isArray(root.meshes) || root.meshes.length !== 1 || !isRecord(root.meshes[0])) return null;
  const mesh = root.meshes[0];
  if (!isArray(mesh.primitives) || mesh.primitives.length !== 1 || !isRecord(mesh.primitives[0])) return null;
  const primitive = mesh.primitives[0];
  if (primitive.material !== undefined || primitive.mode !== 4 || primitive.targets !== undefined || primitive.extensions !== undefined) return null;
  const extras = root.extras;
  const provenance = isRecord(extras) && isRecord(extras.toonSpectrum) ? extras.toonSpectrum.provenance : null;
  return isRecord(provenance) && provenance.authority === "editable-half-edge-mesh" ? primitive : null;
}

/** exporter 성공 bytes만 받는다. 호출자는 metrics.glbByteLength를 반환 bytes 길이로 갱신한다. */
export function writeStudioBg3dPrimitiveEditMaterialGlb(bytes: Uint8Array, color: string): StudioBg3dPrimitiveEditMaterialResult {
  if (typeof color !== "string" || !/^#[a-f0-9]{6}$/iu.test(color)) return failure("invalid-color");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 20) return failure("invalid-glb");
  if (bytes.byteLength > STUDIO_BG3D_GLB_MAX_BYTES
    || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true) > STUDIO_BG3D_GLB_MAX_JSON_BYTES) return failure("budget-exceeded");
  try {
    const parsed = readStudioVrmExportGlb(bytes);
    const primitive = onlyExportedPrimitive(parsed.json);
    if (!primitive) return failure("unsupported-export");
    const rgb = [1, 3, 5].map((offset) => linearChannel(Number.parseInt(color.slice(offset, offset + 2), 16)));
    parsed.json.materials = [{
      name: "ToonStudio 원본 단색 상자",
      pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], roughnessFactor: 1, metallicFactor: 0 },
      emissiveFactor: [0, 0, 0], alphaMode: "OPAQUE", doubleSided: false,
      extras: { [STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]: STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS },
    }];
    primitive.material = 0;
    return { ok: true, bytes: writeStudioVrmExportGlb({ json: parsed.json, binary: parsed.binary }) };
  } catch (error) {
    const code: unknown = isRecord(error) ? error.code : null;
    return failure(code === "json-too-large" || code === "output-too-large" ? "budget-exceeded" : "invalid-glb");
  }
}
