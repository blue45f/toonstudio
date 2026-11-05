/**
 * 잠재 안료 혼합 셰이더 모듈 생성기 — WGSL(WebGPU)과 GLSL ES 3.0(WebGL2) 두 벌을 같은 표에서 만든다.
 *
 * - 순방향 다항식(농도 4개 → sRGB)은 `latent-pigment-model.generated.ts` 의 계수 60개와 `latent-pigment-basis.ts` 의
 *   항 순서를 빌드 때(이 함수를 부를 때) 셰이더 상수로 펼쳐 넣는다. 계수를 셰이더 문자열에 따로 적어 두지 않으므로
 *   모델을 다시 생성하면 셰이더도 자동으로 따라간다.
 * - 역방향(RGB → 농도)은 `latent-pigment-table.ts` 가 구운 N³ 표를 rgba32float 3D 텍스처(또는 GLSL 2D 아틀라스)로
 *   올린 것을 textureLoad/texelFetch 8번으로 삼선형 보간한다. 필터링 없는 형식이라 어느 장치에서나 같은 텍셀을 읽고,
 *   보간 식은 CPU 표 경로와 같다(`mix(a, b, t) = a·(1−t) + b·t`, x→y→z 순서).
 * - 잔차는 `입력 − 0~1로 자른 다항식(조회 농도)`로 셰이더 안에서 다시 계산하므로 왕복은 무손실이다.
 * - 산술의 단계별 TS 재현은 `latent-pigment-shader-mirror.ts` 에 있고 시험이 이 생성 결과와 줄 단위로 대조한다.
 *
 * 입출력 색 공간: `latent_pigment_mix*` 는 감마 인코딩 sRGB(0~1), `latent_pigment_mix_linear*` 는 선형 sRGB 를 받아
 * 앞뒤로 sRGB 변환을 붙인다. 알파 변형은 직선(straight) 알파이며 색 비율을 알파로 가중한다(투명한 쪽 안료는 섞이지 않음).
 *
 * 실기기 GPU 픽셀은 검증하지 않았다(Node 에서 WGSL 구문 해석과 TS 재현만 했다).
 */
import { LATENT_PIGMENT_BASIS_ID, LATENT_PIGMENT_TERMS } from "./latent-pigment-basis";
import { LATENT_PIGMENT_COEFFICIENTS, LATENT_PIGMENT_MODEL_REVISION } from "./latent-pigment-model.generated";
import {
  LATENT_PIGMENT_TABLE_COMPONENTS,
  LATENT_PIGMENT_TABLE_DEFAULT_SIZE,
  LATENT_PIGMENT_TABLE_MAX_SIZE,
  LATENT_PIGMENT_TABLE_MIN_SIZE,
  LATENT_PIGMENT_TABLE_REVISION,
  type LatentPigmentTable,
} from "./latent-pigment-table";

export const LATENT_PIGMENT_SHADER_REVISION = 1 as const;

/** 두 셰이더가 같은 이름으로 내보내는 함수. */
export const LATENT_PIGMENT_SHADER_FUNCTIONS = Object.freeze([
  "latent_pigment_polynomial",
  "latent_pigment_table_concentrations",
  "latent_pigment_from_rgb",
  "latent_pigment_to_rgb",
  "latent_pigment_mix_latent",
  "latent_pigment_mix",
  "latent_pigment_mix_rgba",
  "latent_pigment_srgb_to_linear",
  "latent_pigment_linear_to_srgb",
  "latent_pigment_mix_linear",
  "latent_pigment_mix_linear_rgba",
] as const);

export type LatentPigmentShaderLanguage = "wgsl" | "glsl";

/** 농도 성분 인덱스 → 벡터 접근자. 항 순서 표의 인덱스를 셰이더 식으로 바꿀 때 쓴다. */
const COMPONENT = ["x", "y", "z", "w"] as const;

/** 셰이더 부동소수 리터럴. JS 의 왕복 표기를 그대로 쓰고 소수점·지수가 없으면 `.0` 을 붙인다(GLSL 정수 리터럴 방지). */
export function formatLatentPigmentShaderFloat(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`셰이더 상수는 유한한 수여야 합니다(받은 값: ${String(value)}).`);
  const text = String(Object.is(value, -0) ? 0 : value);
  return /[.eE]/u.test(text) ? text : `${text}.0`;
}

function checkTableSize(size: number): number {
  if (!Number.isSafeInteger(size) || size < LATENT_PIGMENT_TABLE_MIN_SIZE || size > LATENT_PIGMENT_TABLE_MAX_SIZE) {
    throw new RangeError(`잠재 안료 표 크기가 올바르지 않습니다(받은 값: ${String(size)}).`);
  }
  return size;
}

function checkBindingIndex(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) {
    throw new RangeError(`${label} 번호가 올바르지 않습니다(받은 값: ${String(value)}).`);
  }
  return value;
}

/**
 * 다항식 누적 식 20줄. 항 k 의 계수 (R, G, B)를 vec3 상수로, 단항식 c[i]·c[j]·c[l] 을 왼쪽 결합 곱으로 적는다.
 * TS 재현(`mirrorLatentPigmentPolynomial`)이 같은 순서로 f32 연산을 한다.
 */
export function latentPigmentPolynomialStatements(language: LatentPigmentShaderLanguage): readonly string[] {
  const vector = language === "wgsl" ? "vec3f" : "vec3";
  return LATENT_PIGMENT_TERMS.map((term, index) => {
    const red = formatLatentPigmentShaderFloat(LATENT_PIGMENT_COEFFICIENTS[0][index]);
    const green = formatLatentPigmentShaderFloat(LATENT_PIGMENT_COEFFICIENTS[1][index]);
    const blue = formatLatentPigmentShaderFloat(LATENT_PIGMENT_COEFFICIENTS[2][index]);
    const monomial = term.map((variable) => `c.${COMPONENT[variable]}`).join(" * ");
    return `rgb = rgb + ${vector}(${red}, ${green}, ${blue}) * (${monomial});`;
  });
}

/** 두 언어 모두 `//` 한 줄 주석을 쓴다. 비 ASCII 를 피하려고 머리 주석은 영어 식별자만 적는다. */
function header(language: LatentPigmentShaderLanguage, tableSize: number): string {
  return [
    `// toonstudio-latent-pigment-v1 ${language} module (generated; do not edit)`,
    `// shader revision ${LATENT_PIGMENT_SHADER_REVISION}, model revision ${LATENT_PIGMENT_MODEL_REVISION}, basis ${LATENT_PIGMENT_BASIS_ID},`
      + ` table revision ${LATENT_PIGMENT_TABLE_REVISION}, table size ${tableSize}`,
  ].join("\n");
}

export interface LatentPigmentWgslOptions {
  /** 표 텍스처의 @group 번호. 기본 0. */
  readonly group?: number;
  /** 표 텍스처의 @binding 번호. 기본 0. */
  readonly binding?: number;
  /** 표의 축당 격자점 수. 올리는 표와 같아야 한다. 기본 33. */
  readonly tableSize?: number;
}

/**
 * WGSL 모듈 문자열. 표는 `texture_3d<f32>`(rgba32float, 바인드 레이아웃 sampleType "unfilterable-float",
 * viewDimension "3d")로 묶는다. 진입점은 넣지 않으므로 호출 측 셰이더 앞에 붙여 쓴다.
 */
export function buildLatentPigmentWgsl(options: LatentPigmentWgslOptions = {}): string {
  const group = checkBindingIndex(options.group ?? 0, "@group");
  const binding = checkBindingIndex(options.binding ?? 0, "@binding");
  const size = checkTableSize(options.tableSize ?? LATENT_PIGMENT_TABLE_DEFAULT_SIZE);
  const polynomial = latentPigmentPolynomialStatements("wgsl").map((line) => `  ${line}`).join("\n");
  return `${header("wgsl", size)}
const LATENT_PIGMENT_TABLE_SIZE: i32 = ${size};

@group(${group}) @binding(${binding}) var latent_pigment_table: texture_3d<f32>;

struct LatentPigment {
  concentrations: vec4f,
  residual: vec3f,
}

fn latent_pigment_polynomial(c: vec4f) -> vec3f {
  var rgb = vec3f(0.0);
${polynomial}
  return rgb;
}

fn latent_pigment_table_concentrations(rgb: vec3f) -> vec4f {
  let last = f32(LATENT_PIGMENT_TABLE_SIZE - 1);
  let position = clamp(rgb, vec3f(0.0), vec3f(1.0)) * last;
  let cell = min(floor(position), vec3f(last - 1.0));
  let f = position - cell;
  let i = vec3i(cell);
  let c000 = textureLoad(latent_pigment_table, i, 0);
  let c100 = textureLoad(latent_pigment_table, i + vec3i(1, 0, 0), 0);
  let c010 = textureLoad(latent_pigment_table, i + vec3i(0, 1, 0), 0);
  let c110 = textureLoad(latent_pigment_table, i + vec3i(1, 1, 0), 0);
  let c001 = textureLoad(latent_pigment_table, i + vec3i(0, 0, 1), 0);
  let c101 = textureLoad(latent_pigment_table, i + vec3i(1, 0, 1), 0);
  let c011 = textureLoad(latent_pigment_table, i + vec3i(0, 1, 1), 0);
  let c111 = textureLoad(latent_pigment_table, i + vec3i(1, 1, 1), 0);
  let x00 = mix(c000, c100, f.x);
  let x10 = mix(c010, c110, f.x);
  let x01 = mix(c001, c101, f.x);
  let x11 = mix(c011, c111, f.x);
  let y0 = mix(x00, x10, f.y);
  let y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}

fn latent_pigment_from_rgb(rgb: vec3f) -> LatentPigment {
  let color = clamp(rgb, vec3f(0.0), vec3f(1.0));
  let concentrations = latent_pigment_table_concentrations(color);
  let polynomial = clamp(latent_pigment_polynomial(concentrations), vec3f(0.0), vec3f(1.0));
  return LatentPigment(concentrations, color - polynomial);
}

fn latent_pigment_to_rgb(latent: LatentPigment) -> vec3f {
  let polynomial = clamp(latent_pigment_polynomial(latent.concentrations), vec3f(0.0), vec3f(1.0));
  return clamp(polynomial + latent.residual, vec3f(0.0), vec3f(1.0));
}

fn latent_pigment_mix_latent(a: LatentPigment, b: LatentPigment, t: f32) -> LatentPigment {
  let w = clamp(t, 0.0, 1.0);
  return LatentPigment(mix(a.concentrations, b.concentrations, w), mix(a.residual, b.residual, w));
}

fn latent_pigment_mix(a: vec3f, b: vec3f, t: f32) -> vec3f {
  return latent_pigment_to_rgb(latent_pigment_mix_latent(latent_pigment_from_rgb(a), latent_pigment_from_rgb(b), t));
}

fn latent_pigment_mix_rgba(a: vec4f, b: vec4f, t: f32) -> vec4f {
  let w = clamp(t, 0.0, 1.0);
  let first = a.a * (1.0 - w);
  let second = b.a * w;
  let coverage = first + second;
  let color_t = select(w, second / coverage, coverage > 0.0);
  return vec4f(latent_pigment_mix(a.rgb, b.rgb, color_t), coverage);
}

fn latent_pigment_srgb_to_linear(c: vec3f) -> vec3f {
  let x = clamp(c, vec3f(0.0), vec3f(1.0));
  let low = x / 12.92;
  let high = pow((x + 0.055) / 1.055, vec3f(2.4));
  return select(high, low, x <= vec3f(0.04045));
}

fn latent_pigment_linear_to_srgb(c: vec3f) -> vec3f {
  let x = clamp(c, vec3f(0.0), vec3f(1.0));
  let low = x * 12.92;
  let high = 1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, x <= vec3f(0.0031308));
}

fn latent_pigment_mix_linear(a: vec3f, b: vec3f, t: f32) -> vec3f {
  return latent_pigment_srgb_to_linear(
    latent_pigment_mix(latent_pigment_linear_to_srgb(a), latent_pigment_linear_to_srgb(b), t),
  );
}

fn latent_pigment_mix_linear_rgba(a: vec4f, b: vec4f, t: f32) -> vec4f {
  let mixed = latent_pigment_mix_rgba(
    vec4f(latent_pigment_linear_to_srgb(a.rgb), a.a),
    vec4f(latent_pigment_linear_to_srgb(b.rgb), b.a),
    t,
  );
  return vec4f(latent_pigment_srgb_to_linear(mixed.rgb), mixed.a);
}
`;
}

export type LatentPigmentGlslTableLayout = "texture-3d" | "atlas-2d";

export interface LatentPigmentGlslOptions {
  /** WebGL1은 100과 2D 아틀라스, WebGL2는 300을 사용한다. */
  readonly version?: 100 | 300;
  /** `texture-3d`(기본): highp sampler3D, `atlas-2d`: 너비 N·N × 높이 N 의 highp sampler2D. */
  readonly tableLayout?: LatentPigmentGlslTableLayout;
  /** 표 샘플러 uniform 이름. 기본 `u_latentPigmentTable`. */
  readonly samplerName?: string;
  readonly tableSize?: number;
}

/**
 * GLSL ES 3.00 모듈 문자열(`#version` 줄은 넣지 않는다). 기본 정밀도에 기대지 않도록 모든 부동소수 선언에
 * highp 를 붙였다. 표 텍스처는 RGBA32F(필터링 없음)로 올리고 texelFetch 로 읽는다.
 */
export function buildLatentPigmentGlsl(options: LatentPigmentGlslOptions = {}): string {
  const version = options.version ?? 300;
  if (version !== 100 && version !== 300) throw new RangeError("GLSL 버전은 100 또는 300이어야 합니다.");
  const layout = options.tableLayout ?? (version === 100 ? "atlas-2d" : "texture-3d");
  if (layout !== "texture-3d" && layout !== "atlas-2d") {
    throw new RangeError(`표 배치가 올바르지 않습니다(받은 값: ${String(layout)}).`);
  }
  if (version === 100 && layout !== "atlas-2d") throw new RangeError("WebGL1은 2D 안료 아틀라스가 필요합니다.");
  const sampler = options.samplerName ?? "u_latentPigmentTable";
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(sampler) || sampler.startsWith("gl_")) {
    throw new RangeError(`샘플러 이름이 올바르지 않습니다(받은 값: ${sampler}).`);
  }
  const size = checkTableSize(options.tableSize ?? LATENT_PIGMENT_TABLE_DEFAULT_SIZE);
  const polynomial = latentPigmentPolynomialStatements("glsl").map((line) => `  ${line}`).join("\n");
  const samplerDeclaration = layout === "texture-3d"
    ? `uniform highp sampler3D ${sampler};`
    : `uniform highp sampler2D ${sampler};`;
  const texelFetch = version === 100
    ? `  return texture2D(${sampler}, (vec2(float(i.x + i.z * LATENT_PIGMENT_TABLE_SIZE), float(i.y)) + 0.5) / vec2(float(LATENT_PIGMENT_TABLE_SIZE * LATENT_PIGMENT_TABLE_SIZE), float(LATENT_PIGMENT_TABLE_SIZE)));`
    : layout === "texture-3d"
    ? `  return texelFetch(${sampler}, i, 0);`
    : `  return texelFetch(${sampler}, ivec2(i.x + i.z * LATENT_PIGMENT_TABLE_SIZE, i.y), 0);`;
  return `${header("glsl", size)}
const int LATENT_PIGMENT_TABLE_SIZE = ${size};
${samplerDeclaration}

struct LatentPigment {
  highp vec4 concentrations;
  highp vec3 residual;
};

highp vec3 latent_pigment_polynomial(highp vec4 c) {
  highp vec3 rgb = vec3(0.0);
${polynomial}
  return rgb;
}

highp vec4 latent_pigment_table_texel(ivec3 i) {
${texelFetch}
}

highp vec4 latent_pigment_table_concentrations(highp vec3 rgb) {
  highp float last = float(LATENT_PIGMENT_TABLE_SIZE - 1);
  highp vec3 position = clamp(rgb, 0.0, 1.0) * last;
  highp vec3 cell = min(floor(position), vec3(last - 1.0));
  highp vec3 f = position - cell;
  ivec3 i = ivec3(cell);
  highp vec4 c000 = latent_pigment_table_texel(i);
  highp vec4 c100 = latent_pigment_table_texel(i + ivec3(1, 0, 0));
  highp vec4 c010 = latent_pigment_table_texel(i + ivec3(0, 1, 0));
  highp vec4 c110 = latent_pigment_table_texel(i + ivec3(1, 1, 0));
  highp vec4 c001 = latent_pigment_table_texel(i + ivec3(0, 0, 1));
  highp vec4 c101 = latent_pigment_table_texel(i + ivec3(1, 0, 1));
  highp vec4 c011 = latent_pigment_table_texel(i + ivec3(0, 1, 1));
  highp vec4 c111 = latent_pigment_table_texel(i + ivec3(1, 1, 1));
  highp vec4 x00 = mix(c000, c100, f.x);
  highp vec4 x10 = mix(c010, c110, f.x);
  highp vec4 x01 = mix(c001, c101, f.x);
  highp vec4 x11 = mix(c011, c111, f.x);
  highp vec4 y0 = mix(x00, x10, f.y);
  highp vec4 y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}

LatentPigment latent_pigment_from_rgb(highp vec3 rgb) {
  highp vec3 color = clamp(rgb, 0.0, 1.0);
  highp vec4 concentrations = latent_pigment_table_concentrations(color);
  highp vec3 polynomial = clamp(latent_pigment_polynomial(concentrations), 0.0, 1.0);
  return LatentPigment(concentrations, color - polynomial);
}

highp vec3 latent_pigment_to_rgb(LatentPigment latent) {
  highp vec3 polynomial = clamp(latent_pigment_polynomial(latent.concentrations), 0.0, 1.0);
  return clamp(polynomial + latent.residual, 0.0, 1.0);
}

LatentPigment latent_pigment_mix_latent(LatentPigment a, LatentPigment b, highp float t) {
  highp float w = clamp(t, 0.0, 1.0);
  return LatentPigment(mix(a.concentrations, b.concentrations, w), mix(a.residual, b.residual, w));
}

highp vec3 latent_pigment_mix(highp vec3 a, highp vec3 b, highp float t) {
  return latent_pigment_to_rgb(latent_pigment_mix_latent(latent_pigment_from_rgb(a), latent_pigment_from_rgb(b), t));
}

highp vec4 latent_pigment_mix_rgba(highp vec4 a, highp vec4 b, highp float t) {
  highp float w = clamp(t, 0.0, 1.0);
  highp float first = a.a * (1.0 - w);
  highp float second = b.a * w;
  highp float coverage = first + second;
  highp float colorT = coverage > 0.0 ? second / coverage : w;
  return vec4(latent_pigment_mix(a.rgb, b.rgb, colorT), coverage);
}

highp vec3 latent_pigment_srgb_to_linear(highp vec3 c) {
  highp vec3 x = clamp(c, 0.0, 1.0);
  highp vec3 low = x / 12.92;
  highp vec3 high = pow((x + 0.055) / 1.055, vec3(2.4));
  return ${version === 100 ? "vec3(x.r <= 0.04045 ? low.r : high.r, x.g <= 0.04045 ? low.g : high.g, x.b <= 0.04045 ? low.b : high.b)" : "mix(high, low, lessThanEqual(x, vec3(0.04045)))"};
}

highp vec3 latent_pigment_linear_to_srgb(highp vec3 c) {
  highp vec3 x = clamp(c, 0.0, 1.0);
  highp vec3 low = x * 12.92;
  highp vec3 high = 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055;
  return ${version === 100 ? "vec3(x.r <= 0.0031308 ? low.r : high.r, x.g <= 0.0031308 ? low.g : high.g, x.b <= 0.0031308 ? low.b : high.b)" : "mix(high, low, lessThanEqual(x, vec3(0.0031308)))"};
}

highp vec3 latent_pigment_mix_linear(highp vec3 a, highp vec3 b, highp float t) {
  return latent_pigment_srgb_to_linear(
    latent_pigment_mix(latent_pigment_linear_to_srgb(a), latent_pigment_linear_to_srgb(b), t));
}

highp vec4 latent_pigment_mix_linear_rgba(highp vec4 a, highp vec4 b, highp float t) {
  highp vec4 mixed = latent_pigment_mix_rgba(
    vec4(latent_pigment_linear_to_srgb(a.rgb), a.a),
    vec4(latent_pigment_linear_to_srgb(b.rgb), b.a),
    t);
  return vec4(latent_pigment_srgb_to_linear(mixed.rgb), mixed.a);
}
`;
}

/** WebGPU 업로드 서술: 3D rgba32float 텍스처 한 장. `queue.writeTexture` 의 레이아웃 인자 그대로다. */
export interface LatentPigmentWebGpuTableUpload {
  readonly dimension: "3d";
  readonly format: "rgba32float";
  readonly size: readonly [width: number, height: number, depthOrArrayLayers: number];
  readonly bytesPerRow: number;
  readonly rowsPerImage: number;
  readonly sampleType: "unfilterable-float";
  readonly viewDimension: "3d";
  readonly data: Float32Array;
}

export function latentPigmentWebGpuTableUpload(table: LatentPigmentTable): LatentPigmentWebGpuTableUpload {
  const size = checkTableSize(table.size);
  if (table.concentrations.length !== size * size * size * LATENT_PIGMENT_TABLE_COMPONENTS) {
    throw new TypeError("잠재 안료 표의 길이가 크기와 맞지 않습니다.");
  }
  return Object.freeze({
    dimension: "3d",
    format: "rgba32float",
    size: Object.freeze([size, size, size] as const),
    bytesPerRow: size * LATENT_PIGMENT_TABLE_COMPONENTS * Float32Array.BYTES_PER_ELEMENT,
    rowsPerImage: size,
    sampleType: "unfilterable-float",
    viewDimension: "3d",
    data: table.concentrations,
  });
}
