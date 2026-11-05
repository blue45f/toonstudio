/** Float32 농도 값을 줄이지 않고 각 성분의 IEEE754 바이트를 RGBA8 텍셀 하나에 저장한다. */
import {
  assertLatentPigmentTable,
  LATENT_PIGMENT_TABLE_COMPONENTS,
  LATENT_PIGMENT_TABLE_MAX_SIZE,
  LATENT_PIGMENT_TABLE_MIN_SIZE,
  type LatentPigmentTable,
} from "./latent-pigment-table";

export type LatentPigmentTextureEncoding = "float32" | "packed-float32";
export interface LatentPigmentPackedAtlasLayout {
  readonly width: number;
  readonly height: number;
  readonly floatCount: number;
}
export interface LatentPigmentPackedFloat32Atlas extends LatentPigmentPackedAtlasLayout {
  /** 텍셀 순서는 표의 ((b·N+g)·N+r)·4+k이며 각 RGBA는 little-endian 바이트다. */
  readonly data: Uint8Array;
}

/** 장치마다 배치를 바꾸지 않아 zero-argument 공개 GLSL과 업로드가 같은 주소를 사용한다. */
export function latentPigmentPackedAtlasLayout(size: number): LatentPigmentPackedAtlasLayout {
  if (!Number.isSafeInteger(size) || size < LATENT_PIGMENT_TABLE_MIN_SIZE || size > LATENT_PIGMENT_TABLE_MAX_SIZE) {
    throw new RangeError("안료 바이트 표의 격자 크기가 올바르지 않습니다.");
  }
  const floatCount = size * size * size * LATENT_PIGMENT_TABLE_COMPONENTS;
  const width = Math.ceil(Math.sqrt(floatCount));
  return Object.freeze({ width, height: Math.ceil(floatCount / width), floatCount });
}

export function packLatentPigmentFloat32Atlas(table: LatentPigmentTable): LatentPigmentPackedFloat32Atlas {
  const checked = assertLatentPigmentTable(table);
  const layout = latentPigmentPackedAtlasLayout(checked.size);
  const data = new Uint8Array(layout.width * layout.height * 4);
  const view = new DataView(data.buffer);
  checked.concentrations.forEach((value, index) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("표의 안료 농도는 유한한 0~1 값이어야 합니다.");
    view.setFloat32(index * 4, value, true);
  });
  return Object.freeze({ ...layout, data });
}
