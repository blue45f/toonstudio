/**
 * 렌더 패스 식별자. 캡처 요청은 이 중 일부를 요구하고, 엔진은 요청한 패스만 돌려준다.
 *
 * 레시피 v3(2026-10-23 CORE-1)에서 화풍 패스 3종을 끝에 더했다: `lit-clean`(톤·선 없는 조명 — 음영 분해·내부선 추출 입력),
 * `tone`(톤 피복 α), `line`(외곽 주선). 모든 엔진이 그리는 것은 기본 6종(`RENDER_PASS_IDS`)뿐이고, 화풍 패스는
 * `CharacterEngine.supportedPasses`로 지원을 밝힌 엔진에만 요청한다(`resolveSupportedPasses`). 그래서 기존 "전 패스 요청" 호출(`[...RENDER_PASS_IDS]`)은
 * v2 엔진에서 그대로 동작한다 — 설계는 `RENDER_PASS_IDS` 끝에 붙이라고 했지만 이 호환을 위해 전체 어휘는 `ALL_RENDER_PASS_IDS`로 따로 둔다.
 */
export const RENDER_PASS_IDS = ["flat", "lit", "normal", "depth", "part-id", "material-id"] as const;
/** 화풍 패스(엔진이 `supportedPasses`로 밝혀야 요청할 수 있다) */
export const STYLE_RENDER_PASS_IDS = ["lit-clean", "tone", "line"] as const;
/** 전체 패스 어휘(기본 6 + 화풍 3, 이 순서) */
export const ALL_RENDER_PASS_IDS = [...RENDER_PASS_IDS, ...STYLE_RENDER_PASS_IDS] as const;

export type BaseRenderPassId = (typeof RENDER_PASS_IDS)[number];
export type StyleRenderPassId = (typeof STYLE_RENDER_PASS_IDS)[number];
export type RenderPassId = (typeof ALL_RENDER_PASS_IDS)[number];

/** depth를 제외한 래스터 패스 */
export type RasterPassId = Exclude<RenderPassId, "depth">;

export const RENDER_PASS_LABELS_KO: Readonly<Record<RenderPassId, string>> = {
  flat: "밑색",
  lit: "조명",
  normal: "법선",
  depth: "깊이",
  "part-id": "부위 ID",
  "material-id": "재질 ID",
  "lit-clean": "조명(톤·선 제외)",
  tone: "톤",
  line: "주선",
};

const PASS_SET: ReadonlySet<string> = new Set(ALL_RENDER_PASS_IDS);

export function isRenderPassId(value: string): value is RenderPassId {
  return PASS_SET.has(value);
}

/** 엔진이 그릴 수 있는 패스: 선언(`CharacterEngine.supportedPasses`)이 없으면 기본 6종 */
export function resolveSupportedPasses(declared: readonly RenderPassId[] | undefined): readonly RenderPassId[] {
  return declared ?? RENDER_PASS_IDS;
}

/** 요청 패스 중 엔진이 지원하지 않는 것(빈 배열이면 요청 가능). 호출자는 대체 없이 한글 사유로 실패를 보인다. */
export function unsupportedPasses(requested: readonly RenderPassId[], declared: readonly RenderPassId[] | undefined): readonly RenderPassId[] {
  const supported = new Set(resolveSupportedPasses(declared));
  return requested.filter((pass) => !supported.has(pass));
}

/** ID 패스 인코딩: R = partId & 255, G = partId >> 8, B = materialId, A = 255 */
export function encodeIdPixel(partId: number, materialId: number): readonly [number, number, number, number] {
  return [partId & 255, (partId >> 8) & 255, materialId & 255, 255];
}

export function decodeIdPixel(r: number, g: number, b: number): { partId: number; materialId: number } {
  return { partId: r | (g << 8), materialId: b };
}
