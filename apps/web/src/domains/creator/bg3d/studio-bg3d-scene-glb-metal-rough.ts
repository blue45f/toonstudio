/**
 * 개인 장면 내보내기의 UV normalize/bake 결과와 raw capture만 받는다.
 * UV normalize/bake 뒤 캡처된 선형 RGBA8에서 G/B만 정확하게 옮긴다.
 * authored mipchain·외부 glTF renderer의 anisotropy 동등성을 보장하지 않는다.
 */
import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter,
  LinearMipmapNearestFilter, LinearSRGBColorSpace, Matrix3, MirroredRepeatWrapping, NearestFilter,
  NearestMipmapLinearFilter, NearestMipmapNearestFilter, NoColorSpace, RepeatWrapping, RGBAFormat,
  Texture, UnsignedByteType, UVMapping } from "three";

/** 실제 texture capture API 중 이 순수 builder가 읽는 부분만 요구한다. */
export interface StudioBg3dSceneGlbMetalRoughCapture {
  readonly texture: Texture;
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly rowOrder: "top-down";
}
export interface StudioBg3dSceneGlbMetalRoughSource {
  /** 개인 graph의 원래 texture. mip 정책과 최종 UV/sampler를 확인하며 수정하지 않는다. */
  readonly texture: Texture;
  readonly capture: StudioBg3dSceneGlbMetalRoughCapture;
}
export interface StudioBg3dSceneGlbMetalRoughInput {
  readonly roughness: StudioBg3dSceneGlbMetalRoughSource | null;
  readonly metalness: StudioBg3dSceneGlbMetalRoughSource | null;
  readonly signal: AbortSignal;
  /** 입력 capture를 이미 계산한 뒤 남은 예산. 새 RGBA 출력 1개를 추가로 계산한다. */
  readonly maximumRgbaBytes: number;
}
export type StudioBg3dSceneGlbMetalRoughReason = "signal-aborted" | "invalid-additional-rgba-budget"
  | "invalid-capture" | "capture-source-state-mismatch" | "capture-size-mismatch"
  | "texture-role-color-space-mismatch" | "texture-mapping-unsupported" | "uv-channel-out-of-range"
  | "uv-transform-not-finite" | "uv-projective-transform" | "uv-normalization-or-bake-required"
  | "sampling-state-invalid" | "sampling-state-mismatch" | "uv-state-mismatch"
  | "premultiplied-source-not-supported" | "authored-mip-chain-not-preserved"
  | "additional-rgba-over-budget";
export type StudioBg3dSceneGlbMetalRoughLimitation = "automatic-mip-regeneration-not-verified"
  | "anisotropy-not-encoded-by-gltf-core";
export interface StudioBg3dSceneGlbMetalRoughFailure {
  readonly ok: false;
  readonly code: "aborted" | "unsupported-feature" | "invalid-capture" | "budget-exceeded";
  readonly reason: StudioBg3dSceneGlbMetalRoughReason;
  readonly messageKo: string;
}
export type StudioBg3dSceneGlbMetalRoughResult = StudioBg3dSceneGlbMetalRoughFailure | {
  readonly ok: true;
  readonly value: { readonly kind: "unchanged"; readonly reason: "no-maps" | "already-shared-orm" }
    | {
      readonly kind: "packed";
      readonly texture: DataTexture;
      /** 새 texture.image.data와 같은 개인 바이트다. 입력 capture 배열과 공유하지 않는다. */
      readonly rgba: Uint8Array<ArrayBuffer>;
      readonly width: number;
      readonly height: number;
      readonly additionalRgbaBytes: number;
      readonly coverage: "base-level-gb-exact";
      readonly limitations: readonly StudioBg3dSceneGlbMetalRoughLimitation[];
      /** source·capture·재질은 정리하지 않는다. 반환한 개인 texture만 한 번 정리한다. */
      dispose(): void;
    };
};
interface Sampling {
  readonly channel: number;
  readonly matrix: Matrix3;
  readonly wrapS: Texture["wrapS"];
  readonly wrapT: Texture["wrapT"];
  readonly minFilter: Texture["minFilter"];
  readonly magFilter: Texture["magFilter"];
  readonly anisotropy: number;
  readonly usesMipmaps: boolean;
}
interface Validated {
  readonly source: StudioBg3dSceneGlbMetalRoughSource;
  readonly sampling: Sampling;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}
class PackingFailure extends Error {
  constructor(readonly failure: StudioBg3dSceneGlbMetalRoughFailure) { super(failure.messageKo); }
}
function fail(code: StudioBg3dSceneGlbMetalRoughFailure["code"], reason: StudioBg3dSceneGlbMetalRoughReason): never {
  throw new PackingFailure({ ok: false, code, reason,
    messageKo: code === "aborted" ? "표면 재질 채널 저장을 취소했습니다."
      : code === "budget-exceeded" ? "원본 해상도의 재질 채널을 합칠 추가 메모리 예산이 부족합니다."
      : code === "invalid-capture" ? "재질 채널의 원본 캡처 정보를 확인하지 못했습니다."
      : "재질 채널을 같은 UV·색·샘플링 설정으로 정확하게 합칠 수 없습니다." });
}
function active(signal: AbortSignal): void { if (signal.aborted) fail("aborted", "signal-aborted"); }
const WRAPS = new Set<number>([ClampToEdgeWrapping, RepeatWrapping, MirroredRepeatWrapping]);
const MIP_FILTERS = new Set<number>([NearestMipmapNearestFilter, NearestMipmapLinearFilter, LinearMipmapNearestFilter, LinearMipmapLinearFilter]);
const MIN_FILTERS = new Set<number>([NearestFilter, LinearFilter, ...MIP_FILTERS]);
function linear(texture: Texture): boolean {
  return texture.colorSpace === NoColorSpace || texture.colorSpace === LinearSRGBColorSpace;
}
/** GPU uniform의 Float32가 같은 경우만 동등하다. nearest 경계를 바꿀 넓은 epsilon은 쓰지 않는다. */
function sameGpuMatrix(a: Matrix3, b: Matrix3): boolean {
  return a.elements.every((value, index) => Math.fround(value) === Math.fround(b.elements[index]));
}
function effectiveUv(texture: Texture): Matrix3 {
  if (![texture.offset.x, texture.offset.y, texture.repeat.x, texture.repeat.y, texture.rotation,
    texture.center.x, texture.center.y].every(Number.isFinite)) fail("unsupported-feature", "uv-transform-not-finite");
  const matrix = texture.matrixAutoUpdate ? new Matrix3().setUvTransform(texture.offset.x, texture.offset.y,
    texture.repeat.x, texture.repeat.y, texture.rotation, texture.center.x, texture.center.y) : texture.matrix.clone();
  const e = matrix.elements;
  if (e.length !== 9) fail("unsupported-feature", "uv-transform-not-finite");
  for (let index = 0; index < 9; index += 1) {
    if (!Object.hasOwn(e, index) || !Number.isFinite(e[index]) || !Number.isFinite(Math.fround(e[index]))) fail("unsupported-feature", "uv-transform-not-finite");
  }
  if (e[2] !== 0 || e[5] !== 0 || e[8] !== 1) fail("unsupported-feature", "uv-projective-transform");
  // 설치 GLTFLoader의 KHR 행렬과 일치하는, 이미 normalize/bake된 recipe만 복사한다.
  // 비정규화 center·S×R 행렬을 이 builder가 임의로 분해하거나 geometry에 굽지 않는다.
  const c = Math.cos(texture.rotation), s = Math.sin(texture.rotation);
  const exported = new Matrix3().set(texture.repeat.x * c, texture.repeat.y * s, texture.offset.x,
    -texture.repeat.x * s, texture.repeat.y * c, texture.offset.y, 0, 0, 1);
  if (!exported.elements.every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value))) || !sameGpuMatrix(matrix, exported)) {
    fail("unsupported-feature", "uv-normalization-or-bake-required");
  }
  return matrix;
}
function sampling(texture: Texture): Sampling {
  if (texture.mapping !== UVMapping) fail("unsupported-feature", "texture-mapping-unsupported");
  if (!Number.isInteger(texture.channel) || texture.channel < 0 || texture.channel > 3) fail("unsupported-feature", "uv-channel-out-of-range");
  if (!WRAPS.has(texture.wrapS) || !WRAPS.has(texture.wrapT) || !MIN_FILTERS.has(texture.minFilter)
    || (texture.magFilter !== NearestFilter && texture.magFilter !== LinearFilter)
    || !Number.isFinite(texture.anisotropy) || texture.anisotropy < 1) fail("unsupported-feature", "sampling-state-invalid");
  return { channel: texture.channel, matrix: effectiveUv(texture), wrapS: texture.wrapS, wrapT: texture.wrapT,
    minFilter: texture.minFilter, magFilter: texture.magFilter, anisotropy: texture.anisotropy,
    usesMipmaps: MIP_FILTERS.has(texture.minFilter) };
}
function sameSampler(a: Sampling, b: Sampling): boolean {
  return a.wrapS === b.wrapS && a.wrapT === b.wrapT && a.minFilter === b.minFilter
    && a.magFilter === b.magFilter && a.anisotropy === b.anisotropy;
}
function sameUv(a: Sampling, b: Sampling): boolean {
  return a.channel === b.channel && sameGpuMatrix(a.matrix, b.matrix);
}
function sizedImage(image: unknown): image is { readonly width: number; readonly height: number } {
  return image !== null && typeof image === "object" && "width" in image && "height" in image
    && typeof image.width === "number" && Number.isSafeInteger(image.width) && image.width > 0
    && typeof image.height === "number" && Number.isSafeInteger(image.height) && image.height > 0;
}
function validate(source: StudioBg3dSceneGlbMetalRoughSource): Validated {
  const { texture, capture } = source;
  if (!(texture instanceof Texture) || !(capture.texture instanceof Texture)
    || capture.rowOrder !== "top-down" || !(capture.rgba instanceof Uint8Array)
    || !(capture.rgba.buffer instanceof ArrayBuffer) || typeof capture.texture.flipY !== "boolean"
    || !Number.isSafeInteger(capture.width) || capture.width < 1 || !Number.isSafeInteger(capture.height) || capture.height < 1
    || !Number.isSafeInteger(capture.width * capture.height * 4)
    || capture.rgba.length !== capture.width * capture.height * 4) fail("invalid-capture", "invalid-capture");
  const sourceImage: unknown = texture.image, capturedImage: unknown = capture.texture.image;
  if (!sizedImage(sourceImage) || !sizedImage(capturedImage)
    || sourceImage.width !== capture.width || sourceImage.height !== capture.height
    || capturedImage.width !== capture.width || capturedImage.height !== capture.height) {
    fail("invalid-capture", "capture-source-state-mismatch");
  }
  if (!linear(texture) || !linear(capture.texture)) fail("unsupported-feature", "texture-role-color-space-mismatch");
  if (texture.premultiplyAlpha || capture.texture.premultiplyAlpha) fail("unsupported-feature", "premultiplied-source-not-supported");
  const state = sampling(texture), capturedState = sampling(capture.texture);
  if (texture.colorSpace !== capture.texture.colorSpace || !sameSampler(state, capturedState) || !sameUv(state, capturedState)) {
    fail("invalid-capture", "capture-source-state-mismatch");
  }
  // minFilter가 mip을 사용하지 않으면 미사용 authored mip은 현재 샘플링에 관여하지 않는다.
  // 실제 authored mip을 사용하는 입력은 PNG 한 장에서 재생성한 mip과 같다고 가정하지 않는다.
  if (state.usesMipmaps && (texture.mipmaps.length > 0 || !texture.generateMipmaps)) {
    fail("unsupported-feature", "authored-mip-chain-not-preserved");
  }
  return { source, sampling: state, width: capture.width, height: capture.height, byteLength: capture.rgba.length };
}
function pixel(input: Validated, row: number, column: number, channel: 1 | 2): number {
  const capture = input.source.capture;
  const sourceRow = capture.texture.flipY ? input.height - row - 1 : row;
  return capture.rgba[(sourceRow * input.width + column) * 4 + channel];
}

/**
 * material의 roughness/metalness scalar는 받지도 바꾸지도 않는다.
 * 없는 map 채널은 255(곱셈 항등값 1), 원래 source alpha와 R은 사용하지 않는다.
 * 두 map이 같거나 없는 unchanged는 기존 exporter의 검증·정책을 대신하는 admission이 아니다.
 */
export function createStudioBg3dSceneGlbMetalRoughTexture(input: StudioBg3dSceneGlbMetalRoughInput): StudioBg3dSceneGlbMetalRoughResult {
  try {
    active(input.signal);
    if (!input.roughness && !input.metalness) return { ok: true, value: { kind: "unchanged", reason: "no-maps" } };
    if (input.roughness && input.metalness && input.roughness.texture === input.metalness.texture) {
      return { ok: true, value: { kind: "unchanged", reason: "already-shared-orm" } };
    }
    if (!Number.isSafeInteger(input.maximumRgbaBytes) || input.maximumRgbaBytes < 0) fail("budget-exceeded", "invalid-additional-rgba-budget");
    const roughness = input.roughness ? validate(input.roughness) : null;
    const metalness = input.metalness ? validate(input.metalness) : null;
    const reference = roughness ?? metalness;
    if (!reference) return { ok: true, value: { kind: "unchanged", reason: "no-maps" } };
    if (roughness && metalness) {
      if (roughness.width !== metalness.width || roughness.height !== metalness.height) fail("unsupported-feature", "capture-size-mismatch");
      if (!sameSampler(roughness.sampling, metalness.sampling)) fail("unsupported-feature", "sampling-state-mismatch");
      if (!sameUv(roughness.sampling, metalness.sampling)) fail("unsupported-feature", "uv-state-mismatch");
    }
    if (reference.byteLength > input.maximumRgbaBytes) fail("budget-exceeded", "additional-rgba-over-budget");
    active(input.signal);
    const rgba = new Uint8Array(reference.byteLength);
    for (let row = 0; row < reference.height; row += 1) {
      active(input.signal);
      for (let column = 0; column < reference.width; column += 1) {
        const index = (row * reference.width + column) * 4;
        rgba[index] = 255; rgba[index + 1] = roughness ? pixel(roughness, row, column, 1) : 255;
        rgba[index + 2] = metalness ? pixel(metalness, row, column, 2) : 255; rgba[index + 3] = 255;
      }
    }
    active(input.signal);
    const source = reference.source.texture, state = reference.sampling;
    const texture = new DataTexture(rgba, reference.width, reference.height, RGBAFormat, UnsignedByteType);
    texture.colorSpace = NoColorSpace; texture.flipY = false; texture.premultiplyAlpha = false;
    texture.channel = state.channel; texture.wrapS = state.wrapS; texture.wrapT = state.wrapT;
    texture.minFilter = state.minFilter; texture.magFilter = state.magFilter; texture.anisotropy = state.anisotropy;
    texture.offset.copy(source.offset); texture.repeat.copy(source.repeat); texture.rotation = source.rotation;
    texture.center.set(0, 0); texture.matrixAutoUpdate = false; texture.matrix.copy(state.matrix);
    texture.generateMipmaps = state.usesMipmaps; texture.userData = { mimeType: "image/png" }; texture.needsUpdate = true;
    const limitations: StudioBg3dSceneGlbMetalRoughLimitation[] = [];
    if (state.usesMipmaps) limitations.push("automatic-mip-regeneration-not-verified");
    // glTF core sampler는 anisotropy를 기록하지 않는다. metadata 보존을 외부 렌더 동등성으로 승격하지 않는다.
    if (state.anisotropy > 1) limitations.push("anisotropy-not-encoded-by-gltf-core");
    let disposed = false;
    return { ok: true, value: { kind: "packed", texture, rgba, width: reference.width, height: reference.height,
      additionalRgbaBytes: rgba.length, coverage: "base-level-gb-exact", limitations: Object.freeze(limitations),
      dispose() { if (!disposed) { disposed = true; texture.dispose(); } } } };
  } catch (error) {
    if (error instanceof PackingFailure) return error.failure;
    throw error;
  }
}
