/** 렌더러와 독립된 툰 재질 정본. 색은 sRGB 6자리 hex이며 런타임에서 linear로 변환한다. */
import { sha256HexPortable } from "../../studio-sha256";

export interface StudioHybridDccToonMaterial {
  readonly version: 1;
  readonly model: "toon";
  readonly baseColorSrgb: `#${string}`;
  readonly shadeColorSrgb: `#${string}`;
  readonly shadingShift: number;
  readonly shadingToony: number;
  readonly outline: {
    readonly enabled: boolean;
    readonly mode: "worldCoordinates" | "screenCoordinates";
    /** worldCoordinates는 미터/Three world unit, screenCoordinates는 화면 높이에 대한 비율이다(px 아님). */
    readonly width: number;
    readonly colorSrgb: `#${string}`;
  };
}

export function studioToonMaterialObject(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("툰 재질은 일반 JSON 객체여야 합니다.");
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== "string" || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"))
    || keys && (own.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))) {
    throw new Error("툰 재질에 누락되거나 지원하지 않는 필드가 있습니다.");
  }
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)) || value < min || value > max) {
    throw new Error("툰 재질 숫자가 유한한 지원 범위를 벗어났습니다.");
  }
  return value === 0 ? 0 : value;
}
function color(value: unknown): `#${string}` {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) throw new Error("툰 재질 색은 #RRGGBB 형식이어야 합니다.");
  return `#${value.slice(1).toLowerCase()}`;
}

/** 알 수 없는 필드를 거부하고 외부 입력과 참조를 공유하지 않는 불변 정본을 만든다. */
export function normalizeStudioHybridDccToonMaterial(value: unknown): StudioHybridDccToonMaterial {
  const m = studioToonMaterialObject(value, ["version", "model", "baseColorSrgb", "shadeColorSrgb", "shadingShift", "shadingToony", "outline"]);
  const o = studioToonMaterialObject(m.outline, ["enabled", "mode", "width", "colorSrgb"]);
  if (m.version !== 1 || m.model !== "toon" || typeof o.enabled !== "boolean"
    || (o.mode !== "worldCoordinates" && o.mode !== "screenCoordinates")) throw new Error("지원하지 않는 툰 재질 버전·모델·외곽선 설정입니다.");
  return Object.freeze({ version: 1, model: "toon", baseColorSrgb: color(m.baseColorSrgb), shadeColorSrgb: color(m.shadeColorSrgb),
    shadingShift: number(m.shadingShift, -1, 1), shadingToony: number(m.shadingToony, 0, 1),
    // 규격에 임의 최대 폭은 없다. GPU의 유한 Float32 표현 범위만 공통 숫자 경계로 검사한다.
    outline: Object.freeze({ enabled: o.enabled, mode: o.mode, width: number(o.width, 0, Infinity), colorSrgb: color(o.colorSrgb) }) });
}
export function createStudioHybridDccDefaultToonMaterial(): StudioHybridDccToonMaterial {
  return normalizeStudioHybridDccToonMaterial({ version: 1, model: "toon", baseColorSrgb: "#f2f2f2", shadeColorSrgb: "#777777",
    shadingShift: 0, shadingToony: .9, outline: { enabled: true, mode: "worldCoordinates", width: .003, colorSrgb: "#000000" } });
}
export function hashStudioHybridDccToonMaterial(value: StudioHybridDccToonMaterial): `toon-material:sha256:${string}` {
  return `toon-material:sha256:${sha256HexPortable(new TextEncoder().encode(JSON.stringify(normalizeStudioHybridDccToonMaterial(value))))}`;
}
