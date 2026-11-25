import { WASM32_SAFE_ARENA_CEILING_BYTES, type GraphicsPaperPipelineId, type GraphicsPaperPipelineSpec, type PipelineMemoryFootprintEstimate } from "./instanced-bvh-spatial-engine";
import { checkedInteger } from "./spatial-input-contract";

/** 논문·프로젝트 문서를 참고한 설계 명세·바이트 산식이다. GPU·Rust·WASM64 구현 또는 실측 결과는 아니다. */

export const GRAPHICS_PAPER_PIPELINE_SPECS: readonly GraphicsPaperPipelineSpec[] = [
  {
    id: "kubelka-munk-1931", authors: "Paul Kubelka & Franz Munk", year: "1931",
    venue: "Zeitschrift für Technische Physik 12, 593–601", title: "Ein Beitrag zur Optik der Farbanstriche",
    koreanSummary: "2-플럭스 흡수(K)·산란(S) 분광 계수 기반 물리 안료 감산 혼색 파이프라인",
    coreEquations: "K/S = (1 - R)^2 / (2R); R_mix = 1 + (K_m/S_m) - sqrt((K_m/S_m)^2 + 2(K_m/S_m))",
    webgpuPass: { stage: "compute", workgroupSize: [8, 8, 1], storageFormat: "rgba16float", bindingSlotCount: 4, indirectDrawCompatible: false },
    wasm64Bridge: { arenaSharingMode: "zero-copy-soa", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(P) 안료 분광 LUT 사전 적분", perFrame: "O(W_dirty * H_dirty * B) 분광 혼색", memory: "O(N_pixels * 16B) RGBA16F K/S 버퍼" },
    bytesPerUnitFormula: { unitLabel: "pixel (RGBA16F + K/S 2-flux state)", bytesPerUnit: 16, overheadBytes: 16384 },
  },
  {
    id: "chu-tai-moxi-2005", authors: "Nelson S.-H. Chu & Chiew-Lan Tai", year: "2005",
    venue: "ACM SIGGRAPH 2005 (ACM TOG 24(3), 504–511)", title: "MoXi: Real-Time Ink Dispersion in Absorbent Paper",
    koreanSummary: "D2Q9 격자 볼츠만(LBM) 모세관 종이 섬유 유동 및 습윤 먹물 3-계층 확산",
    coreEquations: "f_i(x + e_i, t + 1) = (1 - w) f_i(x, t) + w f_i^eq(rho, u); fiber-blocking kappa",
    webgpuPass: { stage: "compute", workgroupSize: [8, 8, 1], storageFormat: "rgba16float", bindingSlotCount: 6, indirectDrawCompatible: false },
    wasm64Bridge: { arenaSharingMode: "tile-arena", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(T_active * S^2) 섬유 공극장 초기화", perFrame: "O(T_wet * S^2 * Q) 활성 습윤 타일 LBM", memory: "O(T_wet * S^2 * 48B) 9-방향 더블 버퍼" },
    bytesPerUnitFormula: { unitLabel: "active wet cell (D2Q9 + 3-layer pigment)", bytesPerUnit: 48, overheadBytes: 65536 },
  },
  {
    // ID는 기존 API 호환성을 위해 유지하며 저자는 원출판 정보로 기록한다.
    id: "chen-diverdi-wetbrush-2015", authors: "Zhili Chen, Byungmoon Kim, Daichi Ito & Huamin Wang", year: "2015",
    venue: "ACM TOG 34(6), Article 200", title: "Wetbrush: GPU-Based 3D Painting Simulation at the Bristle Level",
    koreanSummary: "3D 탄성 브리슬 동역학·물감 전이 및 임파스토 높이맵 릴리프 조명 합성",
    coreEquations: "PBD bristle chain constraints + heightmap delta H(x,y) -> Sobel normal + Blinn-Phong",
    webgpuPass: { stage: "compute-then-render", workgroupSize: [64, 1, 1], storageFormat: "rgba16float", bindingSlotCount: 5, indirectDrawCompatible: true },
    wasm64Bridge: { arenaSharingMode: "ring-staging", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(B * S) 브리슬 체인 정지 자세 구성", perFrame: "O(B * S * I_pbd + A_footprint) 동역학·스탬핑", memory: "O(B * S * 32B + N_tiles * S^2 * 12B)" },
    bytesPerUnitFormula: { unitLabel: "3D bristle segment (pos/vel/ink-load)", bytesPerUnit: 32, overheadBytes: 32768 },
  },
  {
    id: "loop-blinn-2005", authors: "Charles Loop & Jim Blinn", year: "2005",
    venue: "ACM SIGGRAPH 2005 (ACM TOG 24(3), 1000–1009)", title: "Resolution Independent Curve Rendering using Programmable Graphics Hardware",
    koreanSummary: "해상도 독립 2차/3차 음함수 베지어 곡선 GPU 평가 및 fwidth 스크린 공간 AA",
    coreEquations: "f(u, v) = u^2 - v; sd = f / max(length(vec2(dpdx(f), dpdy(f))), eps)",
    webgpuPass: { stage: "render", workgroupSize: [1, 1, 1], storageFormat: "bgra8unorm", bindingSlotCount: 2, indirectDrawCompatible: true },
    wasm64Bridge: { arenaSharingMode: "zero-copy-soa", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(N_curves) 인스턴스 32B 패킹", perFrame: "O(log N + K_visible) 컬링 후 단일 drawIndirect", memory: "O(N_curves * 32B) 32-byte 정렬 스트라이드" },
    bytesPerUnitFormula: { unitLabel: "instanced curve/object record (32B)", bytesPerUnit: 32, overheadBytes: 4096 },
  },
  {
    id: "levien-vello-piet-gpu-2025", authors: "Linebender Contributors", year: "프로젝트 문서",
    venue: "Linebender 프로젝트 아키텍처 문서", title: "Vello / Piet-GPU",
    koreanSummary: "GPU Prefix-Sum 타일 빈닝·Coarse/Fine 경로 분할 기반 컴퓨트 2D 벡터 렌더링",
    coreEquations: "PathFlatten -> TileAlloc -> PrefixSum(backdrop) -> CoarseBinning -> FineRaster(16x16)",
    webgpuPass: { stage: "compute", workgroupSize: [64, 1, 1], storageFormat: "rgba8unorm", bindingSlotCount: 7, indirectDrawCompatible: true },
    wasm64Bridge: { arenaSharingMode: "zero-copy-soa", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(N_segments) 경로 스트림 인코딩", perFrame: "O((N_seg + N_tiles) / P_gpu + log P_gpu)", memory: "O(N_segments * 32B + N_tiles * 16B)" },
    bytesPerUnitFormula: { unitLabel: "flattened path segment + tile bin", bytesPerUnit: 48, overheadBytes: 16384 },
  },
] as const;

/** 기존 ID로 그래픽스 참고 명세를 조회한다. */
export function getGraphicsPaperPipelineSpec(id: GraphicsPaperPipelineId): GraphicsPaperPipelineSpec {
  for (let i = 0; i < GRAPHICS_PAPER_PIPELINE_SPECS.length; i += 1) {
    const spec = GRAPHICS_PAPER_PIPELINE_SPECS[i];
    if (spec !== undefined && spec.id === id) return spec;
  }
  throw new RangeError(`알 수 없는 그래픽스 논문 파이프라인 ID: ${id}`);
}

/** 입력 단위 수에 따른 결정론적 메모리 발자국(Bytes/KiB/MiB)과 WASM32/WASM64 권장 모드를 산출한다. */
export function estimatePipelineMemoryFootprint(specId: GraphicsPaperPipelineId, unitCount: number): PipelineMemoryFootprintEstimate {
  const spec = getGraphicsPaperPipelineSpec(specId);
  const limit = Math.floor((Number.MAX_SAFE_INTEGER - spec.bytesPerUnitFormula.overheadBytes) / spec.bytesPerUnitFormula.bytesPerUnit);
  const safeUnits = checkedInteger(unitCount, limit);
  const totalBytes = safeUnits * spec.bytesPerUnitFormula.bytesPerUnit + spec.bytesPerUnitFormula.overheadBytes;
  const fitsWasm32Ceiling = totalBytes <= WASM32_SAFE_ARENA_CEILING_BYTES;
  return {
    specId, unitCount: safeUnits, totalBytes, totalKiB: totalBytes / 1024, totalMiB: totalBytes / (1024 * 1024),
    fitsWasm32Ceiling, recommendedArenaMode: fitsWasm32Ceiling ? "wasm32" : "wasm64",
  };
}
