import { WGSL_PIPELINE_IDS, EXPORT_PRESET_IDS, WEBCODECS_CODEC_IDS, getExportPreset,
  type WgslCorePipelineSpec, type WgslPipelineId, type WebCodecsCodecId, type WebCodecsExportPreset, type WebCodecsCodecProfile } from "./shader-prewarm-webcodecs-engine";

export function assertText(value: string, maximum: number): void {
  if (typeof value !== "string" || value.length > maximum) throw new RangeError(`문자열은 ${maximum}자까지 지원합니다.`);
}
export function assertCachedIds(ids: readonly WgslPipelineId[] | undefined): void {
  if (ids === undefined) return;
  if (!Array.isArray(ids) || ids.length > 12 || ids.some(id => !WGSL_PIPELINE_IDS.includes(id)) || new Set(ids).size !== ids.length) throw new Error("캐시 가정 목록은 고유한 정본 파이프라인 ID 12개 이하여야 합니다.");
}
export function assertPipelineSignature(pipeline: WgslCorePipelineSpec, tag: string): void {
  assertText(tag, 256); assertText(pipeline.entryPoint, 128); assertText(pipeline.workgroupSize, 128); assertText(pipeline.wgslSignatureSeed, 4096);
  if (!WGSL_PIPELINE_IDS.includes(pipeline.id) || !Number.isInteger(pipeline.bindingCount) || pipeline.bindingCount < 1 || pipeline.bindingCount > 8) throw new Error("파이프라인 서명 메타데이터가 잘못됐습니다.");
}
export function assertHardwareAssumptions(flags?: Partial<Readonly<Record<WebCodecsCodecId, boolean>>>): void {
  if (flags === undefined) return;
  if (flags === null || typeof flags !== "object" || WEBCODECS_CODEC_IDS.some(id => flags[id] !== undefined && typeof flags[id] !== "boolean")) throw new Error("하드웨어 지원 가정은 boolean이어야 합니다.");
}
export function assertExportPreset(preset: WebCodecsExportPreset): void {
  if (!EXPORT_PRESET_IDS.includes(preset.id)) throw new Error("지원하지 않는 출고 프리셋 ID입니다.");
  const canonical = getExportPreset(preset.id);
  for (const key of Object.keys(canonical)) if (Reflect.get(preset, key) !== Reflect.get(canonical, key)) throw new Error("외부 프리셋이 정본과 일치하지 않습니다.");
}
/** ITU-T H.264(08/2024) 표 A-1/A-6의 frame·초당 macroblock 상한에 맞춘 계획값이다.
 * https://www.itu.int/rec/T-REC-H.264-202408-I/en 실제 WebCodecs 지원은 별도 확인해야 한다. */
export function codecStringForPreset(profile: WebCodecsCodecProfile, preset: WebCodecsExportPreset): string {
  if (profile.id === "h264" && !preset.is4kUhd && Math.ceil(preset.width / 16) * Math.ceil(preset.height / 16) > 8704) return "avc1.640032";
  return preset.is4kUhd ? profile.codecString4k60 : profile.codecStringStandard;
}
/** 정본의 한정된 필드만 비교한다. 외부 메타데이터는 순회·직렬화하지 않는다. */
export function assertPlanMatches(actual: unknown, expected: unknown): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error("계획 배열이 정본과 다릅니다.");
    expected.forEach((value, index) => assertPlanMatches(actual[index], value));
  } else if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") throw new Error("계획 객체가 정본과 다릅니다.");
    for (const key of Object.keys(expected)) assertPlanMatches(Reflect.get(actual, key), Reflect.get(expected, key));
  } else if (actual !== expected) throw new Error("계획 수치·상태가 현재 입력의 정본과 다릅니다.");
}
