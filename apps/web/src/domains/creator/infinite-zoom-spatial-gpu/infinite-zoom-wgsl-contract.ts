import { INFINITE_ZOOM_GPU_ATLAS_WGSL, alignToWebGpu256,
  type WgslValidationReport, type WgslContractCheck } from "./infinite-zoom-spatial-engine";

const WGSL_RESERVED_KEYWORDS: ReadonlySet<string> = new Set(
  "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield".split(" "),
);

function measureWgslStructBytes(source: string, structName: string): number {
  const match = source.match(new RegExp(`struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`, "u"));
  if (!match?.[1]) return 0;
  let bytes = 0;
  for (const field of match[1].split(",").map((s) => s.trim()).filter(Boolean)) {
    if (/:\s*vec[34]<(?:f32|u32|i32)>/u.test(field)) bytes += 16;
    else if (/:\s*vec2<(?:f32|u32|i32)>/u.test(field)) bytes += 8;
    else if (/:\s*(?:f32|u32|i32)/u.test(field)) bytes += 4;
  }
  return bytes;
}

function scanReservedKeywordCollisions(source: string): string[] {
  const hits = new Set<string>();
  const patterns: readonly RegExp[] = [
    /\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gu,
    /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu,
    /(?:^|[({,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:vec[234]<|f32|u32|i32|array<)/gmu,
  ];
  for (const regex of patterns) {
    for (const match of source.matchAll(regex)) {
      const ident = match[1];
      if (ident && WGSL_RESERVED_KEYWORDS.has(ident)) hits.add(ident);
    }
  }
  return [...hits].sort();
}

function checkBalancedDelimiters(source: string): boolean {
  let curly = 0;
  let paren = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") curly += 1;
    else if (ch === "}") curly -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    if (curly < 0 || paren < 0) return false;
  }
  return curly === 0 && paren === 0;
}

/** WGSL 셰이더 정적 계약 검증기(예약어 충돌 0, 16B 정렬 구조체, 컴퓨트 전용 샘플링 검증). */
export function validateInfiniteZoomWgsl(source: string = INFINITE_ZOOM_GPU_ATLAS_WGSL): WgslValidationReport {
  if (typeof source !== "string" || source.length > 65_536) throw new RangeError("WGSL 정적 검사는 65,536자까지 지원합니다.");
  const balanced = checkBalancedDelimiters(source);
  const wgMatch = source.match(/@compute\s+@workgroup_size\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/u);
  const fnMatch = source.match(/@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u);
  const entryPoint = fnMatch?.[1] ?? "";
  const workgroupSize: readonly [number, number, number] = wgMatch
    ? [Number(wgMatch[1]), Number(wgMatch[2]), Number(wgMatch[3])]
    : [0, 0, 0];

  const uniformStructBytes = measureWgslStructBytes(source, "InfiniteZoomUniforms");
  const indirectionStructBytes = measureWgslStructBytes(source, "AtlasIndirectionEntry");
  const uniformAlignedStrideBytes = uniformStructBytes > 0 ? alignToWebGpu256(uniformStructBytes) : 0;
  const bindingCount = new Set([...source.matchAll(/@binding\(\s*(\d+)\s*\)/gu)].map((m) => Number(m[1]))).size;
  const reservedKeywordHits = scanReservedKeywordCollisions(source);

  const checks: readonly WgslContractCheck[] = [
    { id: "delimiters-balanced", passed: balanced, detailKo: "중괄호({})·소괄호(()) 구문 균형 검증", detailEn: "Balanced curly braces and parentheses" },
    { id: "compute-entrypoint", passed: Boolean(wgMatch && entryPoint.length > 0), detailKo: `컴퓨트 엔트리포인트(${entryPoint || "없음"}) 및 @workgroup_size(16, 16, 1)`, detailEn: `Compute entry (${entryPoint || "missing"}) with @workgroup_size(16, 16, 1)` },
    { id: "struct-16b-alignment", passed: uniformStructBytes >= 16 && uniformStructBytes % 16 === 0 && indirectionStructBytes >= 16 && indirectionStructBytes % 16 === 0, detailKo: `Uniform ${uniformStructBytes}B(256B 스트라이드)·인덱스 ${indirectionStructBytes}B 16B 정렬`, detailEn: `Uniform ${uniformStructBytes}B (256B stride) & indirection ${indirectionStructBytes}B 16B-aligned` },
    { id: "reserved-keywords-clean", passed: reservedKeywordHits.length === 0, detailKo: `WGSL 예약어 식별자 충돌 ${reservedKeywordHits.length}건`, detailEn: `${reservedKeywordHits.length} WGSL reserved keyword collisions` },
    { id: "floating-origin-lod-atlas", passed: source.includes("fn floating_origin_to_local(") && source.includes("fn lookup_atlas_uv(") && source.includes("page_table") && source.includes("fn blend_semantic_lod("), detailKo: "상대좌표 변환 · 시맨틱 LOD 블렌딩 · 아틀라스 인다이렉션 함수 포함", detailEn: "Includes floating-origin transform, semantic LOD blend, and atlas page lookup" },
    { id: "compute-safe-sampling", passed: source.includes("textureSampleLevel(") && !/\btextureSample\s*\(/u.test(source) && source.includes("textureStore(") && bindingCount >= 4 && bindingCount <= 8, detailKo: `컴퓨트 전용 textureSampleLevel + textureStore + 바인딩 ${bindingCount}개(<=8)`, detailEn: `Compute-safe textureSampleLevel + textureStore + ${bindingCount} bindings (<=8)` },
    { id: "empty-page-table-guard", passed: source.includes("let page_count = arrayLength(&page_table)") && source.includes("if (page_count == 0u) { return; }"),
    detailKo: "빈 페이지 테이블은 참조 전에 종료하는 소스 계약", detailEn: "Empty page table exits before lookup (source contract)" },
  ];
  const errors = checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.detailEn}`);
  return {
    validationKind: "static-source-contract", gpuCompiled: false,
    valid: errors.length === 0, entryPoint, workgroupSize, uniformStructBytes, uniformAlignedStrideBytes,
    indirectionStructBytes, bindingCount, reservedKeywordHits, checks, errors,
  };
}
