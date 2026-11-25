import { normalizeRadianceSceneInput, type NormalizedRadianceSceneConfig, type SceneOccluder } from "./radiance-cascades-engine";

export const MAX_CPU_OCCLUDERS = 64;
export function assertCoordinate(value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new RangeError("CPU SDF 좌표는 유한한 ±1,000,000 범위만 지원합니다.");
}
export function assertOccluder(occ: SceneOccluder): void {
  if (!occ || typeof occ.id !== "string" || !occ.id.trim() || occ.id.length > 128 ||
    !["circle", "capsule", "rounded-box"].includes(occ.shape) || !["character", "background", "balloon"].includes(occ.kind)) throw new Error("차폐체 ID·종류·모양이 잘못됐습니다.");
  [occ.x, occ.y, occ.radius, occ.x2 ?? occ.x, occ.y2 ?? occ.y, occ.halfW ?? occ.radius, occ.halfH ?? occ.radius].forEach(assertCoordinate);
  if (occ.radius < 0 || (occ.shape === "rounded-box" && ((occ.halfW ?? occ.radius) < occ.radius || (occ.halfH ?? occ.radius) < occ.radius))) throw new RangeError("차폐체 반경·반폭·반높이가 잘못됐습니다.");
  if (!occ.albedo || [occ.albedo.l, occ.albedo.c, occ.albedo.h, occ.emissiveStrength].some(v => !Number.isFinite(v))) throw new Error("차폐체 색·발광 수치는 유한해야 합니다.");
}
/** 목록 상한·ID를 먼저 검사하고 입력 문자열·도형·배열을 수정하지 않는다. */
export function assertOccluderSet(occluders: readonly SceneOccluder[], allowEmpty = false): void {
  if (!Array.isArray(occluders) || occluders.length > MAX_CPU_OCCLUDERS || (!allowEmpty && occluders.length === 0)) throw new RangeError("최근접 SDF 질의는 1~64개 차폐체를 지원합니다.");
  const ids = new Set<string>();
  for (const occ of occluders) { assertOccluder(occ); if (ids.has(occ.id)) throw new Error("중복 차폐체 ID입니다."); ids.add(occ.id); }
}
/** 외부 NormalizedConfig를 다시 클램프하지 않는다. 반복·패킹 전에 정본과 일치해야 한다. */
export function assertNormalizedRadianceConfig(config: NormalizedRadianceSceneConfig): void {
  if (!config || typeof config !== "object") throw new Error("정규화된 조명 설정이 필요합니다.");
  const canonical = normalizeRadianceSceneInput(config);
  for (const key of Object.keys(canonical)) {
    if (key === "activeKeyLightColor") continue;
    if (Reflect.get(config, key) !== Reflect.get(canonical, key)) throw new RangeError("외부 조명 설정이 정규화된 지원 범위를 벗어났습니다.");
  }
  if (!config.activeKeyLightColor || ["l", "c", "h"].some(key => Reflect.get(config.activeKeyLightColor, key) !== Reflect.get(canonical.activeKeyLightColor, key))) throw new Error("설정과 광원 색 정본이 일치하지 않습니다.");
}
