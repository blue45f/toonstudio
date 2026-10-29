/** 자기 생성 단색 box의 편집 원본과 실제 GLB 렌더 데이터를 정확한 재내보내기로 결합한다. */
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import {
  readStudioVrmExportGlb, writeStudioVrmExportGlb,
  type StudioVrmExportParsedGlb,
} from "../vrm/studio-vrm-export-glb-container";
import { STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_GLB_MAX_JSON_BYTES } from "./studio-bg3d-glb-validation";
import {
  parseStudioBg3dPrimitiveEditAuthoring,
  type StudioBg3dPrimitiveEditAuthoringErrorCode, type StudioBg3dPrimitiveEditAuthoringValue,
} from "./studio-bg3d-primitive-edit-authoring";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY } from "./studio-bg3d-primitive-edit-authoring-keys";

export { STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY } from "./studio-bg3d-primitive-edit-authoring-keys";
export type StudioBg3dPrimitiveEditAuthoringGlbErrorCode = StudioBg3dPrimitiveEditAuthoringErrorCode
  | "invalid-glb" | "missing-authoring" | "render-mismatch";
export type StudioBg3dPrimitiveEditAuthoringGlbResult<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: StudioBg3dPrimitiveEditAuthoringGlbErrorCode; readonly messageKo: string };

const MESSAGES = {
  "invalid-glb": "편집 원본을 담은 GLB 바이트를 안전하게 읽을 수 없습니다.",
  "missing-authoring": "이 모델에는 복원할 원본 면 편집 데이터가 없습니다.",
  "render-mismatch": "원본 면 편집 데이터와 모델의 형상·재질·출처가 일치하지 않습니다.",
  "budget-exceeded": "편집 원본을 포함한 모델이 자산 크기 제한을 넘었습니다.",
  "mesh-invalid": "저장된 원본 메시를 같은 형상으로 내보낼 수 없습니다.",
};
class AuthoringGlbFailure extends Error {
  constructor(readonly code: StudioBg3dPrimitiveEditAuthoringGlbErrorCode, readonly messageKo: string) { super(messageKo); }
}
function fail(code: keyof typeof MESSAGES): never { throw new AuthoringGlbFailure(code, MESSAGES[code]); }
function attempt<T>(work: () => T): StudioBg3dPrimitiveEditAuthoringGlbResult<T> {
  try { return { ok: true, value: work() }; }
  catch (error) {
    if (error instanceof AuthoringGlbFailure) return { ok: false, code: error.code, messageKo: error.messageKo };
    const code: unknown = isRecord(error) ? error.code : null;
    const resultCode = code === "json-too-large" || code === "output-too-large" ? "budget-exceeded" : "invalid-glb";
    return { ok: false, code: resultCode, messageKo: MESSAGES[resultCode] };
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isArray(value: unknown): value is unknown[] { return Array.isArray(value); }
/** JSON 키를 재작성하지 않아 __proto__ 같은 외부 키도 사라지지 않고 비교된다. */
function equalJson(left: unknown, right: unknown): boolean {
  const pending: Array<readonly [unknown, unknown]> = [[left, right]];
  while (pending.length > 0) {
    const pair = pending.pop();
    if (!pair) return false;
    const [a, b] = pair;
    if (a === b) continue;
    if (isArray(a) && isArray(b)) {
      if (a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) pending.push([a[index], b[index]]);
    } else if (isRecord(a) && isRecord(b)) {
      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (const key of keys) {
        if (!Object.hasOwn(b, key)) return false;
        pending.push([a[key], b[key]]);
      }
    } else return false;
  }
  return true;
}
function authoring(input: unknown): StudioBg3dPrimitiveEditAuthoringValue {
  const result = parseStudioBg3dPrimitiveEditAuthoring(input);
  if (!result.ok) throw new AuthoringGlbFailure(result.code, result.messageKo);
  return result.value;
}
/** 호출 중 원본 view가 바뀌어도 검증·읽기·저장에는 같은 개인 복사본만 사용한다. */
function boundedGlb(input: Uint8Array): StudioVrmExportParsedGlb {
  if (!(input instanceof Uint8Array) || input.byteLength < 20) fail("invalid-glb");
  if (input.byteLength > STUDIO_BG3D_GLB_MAX_BYTES) fail("budget-exceeded");
  const bytes = Uint8Array.from(input);
  if (new DataView(bytes.buffer).getUint32(12, true) > STUDIO_BG3D_GLB_MAX_JSON_BYTES) fail("budget-exceeded");
  const parsed = readStudioVrmExportGlb(bytes);
  const layout = parsed.layout;
  if (layout.totalByteLength !== bytes.byteLength) fail("invalid-glb");
  if (layout.binContentOffset !== null) {
    const padding = bytes.subarray(layout.binContentOffset + layout.binByteLength);
    if (padding.some((value) => value !== 0)) fail("invalid-glb");
  }
  return parsed;
}
function onlyScene(root: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(root.scenes) || root.scenes.length !== 1) fail("render-mismatch");
  const scene: unknown = root.scenes[0];
  if (!isRecord(scene)) fail("invalid-glb");
  return scene;
}
function sceneAuthoring(scene: Record<string, unknown>): unknown {
  return isRecord(scene.extras) ? scene.extras[STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY] : undefined;
}
function replay(value: StudioBg3dPrimitiveEditAuthoringValue): StudioVrmExportParsedGlb {
  const source = value.envelope.source;
  const exported = exportStudioHybridDccMeshGlb({ assetId: source.assetId, sourceRevision: source.revision,
    sourceHash: source.meshHash, mesh: value.mesh });
  if (!exported.ok) fail("mesh-invalid");
  const material = writeStudioBg3dPrimitiveEditMaterialGlb(exported.bytes, value.envelope.sourceMaterialAtExport.colorSrgb);
  if (!material.ok) fail(material.code === "budget-exceeded" ? "budget-exceeded" : "render-mismatch");
  return boundedGlb(material.bytes);
}
/** 자기 Scene 키만 제외한다. 다른 extras·UV·재질·texture·animation은 그대로 비교하여 거부한다. */
function verify(actual: StudioVrmExportParsedGlb, value: StudioBg3dPrimitiveEditAuthoringValue): void {
  const scene = onlyScene(actual.json);
  if (isRecord(scene.extras) && Object.hasOwn(scene.extras, STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY)) {
    delete scene.extras[STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY];
    if (Object.keys(scene.extras).length === 0) delete scene.extras;
  }
  const expected = replay(value);
  if (actual.binary.byteLength !== expected.binary.byteLength
    || !actual.binary.every((byte, index) => byte === expected.binary[index])
    || !equalJson(actual.json, expected.json)) fail("render-mismatch");
}

/** 이미 다른 원본 payload가 있으면 교체하지 않는다. 같은 payload의 반복 기록은 허용한다. */
export function writeStudioBg3dPrimitiveEditAuthoringToGlb(
  glb: Uint8Array, unknownEnvelope: unknown,
): StudioBg3dPrimitiveEditAuthoringGlbResult<Uint8Array<ArrayBuffer>> {
  return attempt(() => {
    const value = authoring(unknownEnvelope), actual = boundedGlb(glb), scene = onlyScene(actual.json);
    const existing = sceneAuthoring(scene);
    if (existing !== undefined && !equalJson(authoring(existing).envelope, value.envelope)) fail("render-mismatch");
    verify(actual, value);
    scene.extras = { [STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY]: value.envelope };
    return writeStudioVrmExportGlb({ json: actual.json, binary: actual.binary });
  });
}

/** 파일 내부의 정합성만 검증한다. storage record와 현재 선택의 소유권·지문은 호출자가 별도로 확인한다. */
export function readStudioBg3dPrimitiveEditAuthoringGlb(
  glb: Uint8Array,
): StudioBg3dPrimitiveEditAuthoringGlbResult<StudioBg3dPrimitiveEditAuthoringValue> {
  return attempt(() => {
    const actual = boundedGlb(glb), input = sceneAuthoring(onlyScene(actual.json));
    if (input === undefined) fail("missing-authoring");
    const value = authoring(input);
    verify(actual, value);
    return value;
  });
}
