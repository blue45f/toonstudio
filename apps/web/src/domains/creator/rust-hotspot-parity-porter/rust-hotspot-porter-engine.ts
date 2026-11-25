/**
 * Wave 54A — 상위 5% 핫스팟 Rust WASM 점진 전환 · 0-diff 동치 증명 하네스 엔진.
 *
 * - 전체 76만 LOC 빅뱅 재작성 대신 프레임 연산의 대부분을 차지하는 상위 5% 핫스팟 6종만 선별한다.
 * - Scan(프로파일) → Record(골든 I/O 녹화) → Port(Rust WASM 후보) → Verify(TS 대비 동치 검증) → Enable(Fail-Closed 무중단 승격)
 * - 불일치 1건 또는 허용오차 초과 시 Enable을 자동 차단(Fail-Closed)하고 TS 참조 경로로 즉시 복귀한다.
 */

export type HotspotTargetId =
  | "km16-pigment-mix"
  | "tactile-bristle-stamp"
  | "tile-blend-composite"
  | "vrm-4bone-skinning"
  | "morton-bvh-cull"
  | "mls-puppet-warp";

export type PorterPipelineStage = "scan" | "record" | "port" | "verify" | "enable";
export type KernelRoutingMode = "ts-reference" | "rust-wasm-enabled";
export type ParityGateDecision = "pending" | "approved" | "blocked-fail-closed" | "rolled-back";
export type RustPortReadiness = "wasm-kernel-built" | "wasm-port-candidate";
export type FixtureCategory = "nominal" | "zero" | "one" | "negative" | "nan-guard" | "inf-guard" | "boundary-edge";
export type HotspotKernelFn = (input: readonly number[]) => readonly number[];

export interface PorterStageSpec {
  readonly id: PorterPipelineStage; readonly order: 1 | 2 | 3 | 4 | 5;
  readonly labelKo: string; readonly labelEn: string; readonly detailKo: string; readonly detailEn: string;
}

export interface HotspotTargetSpec {
  readonly id: HotspotTargetId; readonly order: 1 | 2 | 3 | 4 | 5 | 6; readonly paretoRank: 1 | 2 | 3 | 4 | 5 | 6;
  readonly titleKo: string; readonly titleEn: string; readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly domainKo: string; readonly domainEn: string;
  readonly tsReferenceModule: string; readonly rustTargetCrate: string; readonly wasmExportSymbol: string;
  readonly rustPortReadiness: RustPortReadiness;
  readonly estimatedLoc: number; readonly codebaseLocSharePct: number; readonly frameTimeWeightPct: number;
  readonly defaultTolerance: number; readonly defaultInjectedDrift: number; readonly outputLabels: readonly string[];
  readonly currentStateKo: string; readonly currentStateEn: string; readonly targetStateKo: string; readonly targetStateEn: string;
}

export interface ParetoConcentrationSummary {
  readonly totalCodebaseLoc: number; readonly hotspotCount: number; readonly hotspotTotalLoc: number;
  readonly hotspotLocSharePct: number; readonly coldCodeLocSharePct: number;
  readonly hotspotFrameTimeSharePct: number; readonly coldCodeFrameTimeSharePct: number;
  readonly builtRustKernelCount: number; readonly portCandidateCount: number;
  readonly disclosureKo: string; readonly disclosureEn: string;
}

export interface HotspotScanResult {
  readonly hotspotId: HotspotTargetId; readonly paretoRank: 1 | 2 | 3 | 4 | 5 | 6;
  readonly estimatedLoc: number; readonly codebaseLocSharePct: number; readonly frameTimeWeightPct: number;
  readonly defaultTolerance: number; readonly rustPortReadiness: RustPortReadiness;
  readonly recommendedPriority: "p0-critical" | "p1-high";
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface GoldenIoFixture {
  readonly id: string; readonly hotspotId: HotspotTargetId; readonly category: FixtureCategory;
  readonly labelKo: string; readonly labelEn: string;
  readonly input: readonly number[]; readonly expectedOutput: readonly number[]; readonly inputDigest: string;
}

export interface RustCandidateOptions {
  readonly injectedErrorMagnitude?: number; readonly injectedFixtureIndex?: number; readonly injectNonFinite?: boolean;
}

export interface FixtureParityDetail {
  readonly fixtureId: string; readonly category: FixtureCategory; readonly labelKo: string; readonly labelEn: string;
  readonly expectedOutput: readonly number[]; readonly candidateOutput: readonly number[];
  readonly absErr: number; readonly passed: boolean; readonly nonFiniteOrShapeError: boolean;
  readonly errorNoteKo: string | null; readonly errorNoteEn: string | null;
}

export interface ParityVerificationResult {
  readonly hotspotId: HotspotTargetId; readonly tolerance: number;
  readonly totalCases: number; readonly passedCases: number; readonly mismatchCount: number;
  readonly nonFiniteOutputCount: number; readonly shapeMismatchCount: number; readonly totalVectorElements: number;
  readonly maxAbsErr: number; readonly meanAbsErr: number; readonly parityPassed: boolean; readonly proofDigest: string;
  readonly details: readonly FixtureParityDetail[]; readonly summaryKo: string; readonly summaryEn: string;
}

export interface PorterAuditEntry {
  readonly step: number; readonly stage: PorterPipelineStage;
  readonly action: "scan" | "record" | "port" | "verify" | "enable-approved" | "enable-blocked" | "rollback";
  readonly messageKo: string; readonly messageEn: string;
}

export interface HotspotPorterSession {
  readonly hotspotId: HotspotTargetId; readonly stage: PorterPipelineStage;
  readonly routingMode: KernelRoutingMode; readonly gateDecision: ParityGateDecision;
  readonly tolerance: number; readonly injectErrorEnabled: boolean; readonly injectedErrorMagnitude: number;
  readonly scanResult: HotspotScanResult | null; readonly fixtures: readonly GoldenIoFixture[];
  readonly portReady: boolean; readonly verification: ParityVerificationResult | null;
  readonly blockedReasonKo: string | null; readonly blockedReasonEn: string | null;
  readonly auditTrail: readonly PorterAuditEntry[];
}

export interface HotspotParityProofReceipt {
  readonly schemaVersion: "toonstudio.rust-hotspot-parity-receipt.v1";
  readonly executionScope: "simulation";
  readonly hotspot: HotspotTargetSpec; readonly stage: PorterPipelineStage;
  readonly routingMode: KernelRoutingMode; readonly gateDecision: ParityGateDecision;
  readonly tolerance: number; readonly injectErrorEnabled: boolean;
  readonly paretoSummary: ParetoConcentrationSummary; readonly verification: ParityVerificationResult | null;
  readonly blockedReasonKo: string | null; readonly blockedReasonEn: string | null;
  readonly honestyNoteKo: string; readonly honestyNoteEn: string;
}

export const TOTAL_CODEBASE_LOC_REFERENCE = 760000 as const;

export const PORTER_PIPELINE_STAGES: readonly PorterStageSpec[] = [
  { id: "scan", order: 1, labelKo: "1. Scan (병목 프로파일)", labelEn: "1. Scan (Profile)", detailKo: "전체 코드 중 상위 5% 프레임 핫스팟과 허용오차 계약 식별", detailEn: "Identify top-5% frame hotspots and numeric tolerance contracts" },
  { id: "record", order: 2, labelKo: "2. Record (골든 I/O 녹화)", labelEn: "2. Record (Golden I/O)", detailKo: "0·1·음수·NaN/Inf 방어·경계값 입력과 TS 참조 출력 스냅샷 고정", detailEn: "Capture deterministic edge cases (0, 1, negative, NaN/Inf) from TS ref" },
  { id: "port", order: 3, labelKo: "3. Port (Rust WASM 후보)", labelEn: "3. Port (Rust Candidate)", detailKo: "Rust WASM 커널 후보를 바인딩하고 오차 주입 회귀 시험 준비", detailEn: "Bind Rust WASM candidate kernel and optional fault-injection probe" },
  { id: "verify", order: 4, labelKo: "4. Verify (0-diff 동치 증명)", labelEn: "4. Verify (Parity Proof)", detailKo: "모든 골든 케이스의 최대 절대오차(maxAbsErr)와 불일치 건수 검증", detailEn: "Verify maxAbsErr and mismatchCount against every golden fixture" },
  { id: "enable", order: 5, labelKo: "5. Enable (무중단 전환 · 롤백)", labelEn: "5. Enable (Zero-Downtime Gate)", detailKo: "mismatchCount=0·오차 통과 시에만 Rust 승격, 이상 시 즉시 TS 복귀", detailEn: "Promote to Rust only on 0-mismatch pass; instant TS rollback anytime" },
];

export const TOP_5PCT_HOTSPOT_TARGETS: readonly HotspotTargetSpec[] = [
  {
    id: "km16-pigment-mix", order: 1, paretoRank: 3,
    titleKo: "KM16 16파장 분광 안료 혼색", titleEn: "KM16 16-Band Spectral Pigment Mix",
    shortLabelKo: "KM16 분광 혼색", shortLabelEn: "KM16 Pigment", domainKo: "안료 · 감산 혼색", domainEn: "Pigment · Subtractive",
    tsReferenceModule: "apps/web/src/domains/creator/webnn-pigment-director",
    rustTargetCrate: "crates/studio-wasm64-drawing-core/src/spectral_km_kernel.rs",
    wasmExportSymbol: "wasm_mix_pigments_km16_packed", rustPortReadiness: "wasm-kernel-built",
    estimatedLoc: 4560, codebaseLocSharePct: 0.6, frameTimeWeightPct: 16.0, defaultTolerance: 1e-5, defaultInjectedDrift: 0.012,
    outputLabels: ["rOut", "gOut", "bOut", "lumaOut"],
    currentStateKo: "현재: Rust KM16 커널 구현 완료, TS 브리지 전환 전 골든 동치 검증 대기",
    currentStateEn: "Current: Rust KM16 kernel built; awaiting golden parity gate before TS switch",
    targetStateKo: "목표: maxAbsErr <= 1e-5 증명 후 브러시 혼색 핫패스를 Rust WASM으로 무중단 승격",
    targetStateEn: "Target: Promote brush mixing hotpath to Rust WASM once maxAbsErr <= 1e-5",
  },
  {
    id: "tactile-bristle-stamp", order: 2, paretoRank: 1,
    titleKo: "종이 요철 · 갈필 · 임파스토 스탬프", titleEn: "Paper Tooth · Dry Bristle · Impasto Stamp",
    shortLabelKo: "종이 요철 스탬프", shortLabelEn: "Tactile Bristle", domainKo: "브러시 · 질감 물리", domainEn: "Brush · Tactile Physics",
    tsReferenceModule: "apps/web/src/domains/creator/render/webgpu-tactile-pipeline/webgpu-tactile-compositor-bridge.ts",
    rustTargetCrate: "crates/studio-wasm64-drawing-core/src/tactile_texture_kernel.rs",
    wasmExportSymbol: "wasm_stamp_tactile_bristle", rustPortReadiness: "wasm-kernel-built",
    estimatedLoc: 6420, codebaseLocSharePct: 0.84, frameTimeWeightPct: 22.0, defaultTolerance: 1e-5, defaultInjectedDrift: 0.018,
    outputLabels: ["paperHeight", "coverage", "impastoHeight", "alphaByte"],
    currentStateKo: "현재: Rust 요철·갈필 커널 구현 완료, WebGPU 미지원 단말 CPU 폴백 동치 검증 대상",
    currentStateEn: "Current: Rust tactile kernel built; verifying parity for CPU fallback path",
    targetStateKo: "목표: 스트로크 스탬프 단위 0-diff 검증 후 메인 스레드 TS 픽셀 루프 완전 대체",
    targetStateEn: "Target: Replace main-thread TS pixel stamp loop after 0-diff parity sign-off",
  },
  {
    id: "tile-blend-composite", order: 3, paretoRank: 2,
    titleKo: "256px 희소 타일 12종 블렌드 합성", titleEn: "256px Sparse Tile 12-Mode Blend Composite",
    shortLabelKo: "희소 타일 12종 합성", shortLabelEn: "Tile Composite", domainKo: "합성기 · 256px 아레나", domainEn: "Compositor · 256px Arena",
    tsReferenceModule: "apps/web/src/domains/creator/render/studio-frame-graph-compositor.ts",
    rustTargetCrate: "crates/studio-wasm64-drawing-core/src/tile_compositor_kernel.rs",
    wasmExportSymbol: "wasm_composite_tile_dirty_rect", rustPortReadiness: "wasm-kernel-built",
    estimatedLoc: 5980, codebaseLocSharePct: 0.79, frameTimeWeightPct: 20.0, defaultTolerance: 0, defaultInjectedDrift: 2,
    outputLabels: ["outR", "outG", "outB", "outA"],
    currentStateKo: "현재: Rust 12종 블렌드 더티 타일 합성 커널 구현 완료, 바이트 완전 일치(0-diff) 게이트 적용",
    currentStateEn: "Current: Rust 12-mode dirty-tile compositor built; enforcing bit-exact 0-diff gate",
    targetStateKo: "목표: 12종 블렌드 전수 0-diff 증명 후 256px 더티 리전 합성을 Rust WASM으로 상시 전환",
    targetStateEn: "Target: Switch 256px dirty-rect compositing to Rust WASM after 0-diff proof",
  },
  {
    id: "vrm-4bone-skinning", order: 4, paretoRank: 4,
    titleKo: "VRM 4-본 선형 블렌드 스키닝", titleEn: "VRM 4-Bone Linear Blend Skinning",
    shortLabelKo: "VRM 4-본 스키닝", shortLabelEn: "VRM 4-Bone Skin", domainKo: "3D 캐릭터 · 리깅", domainEn: "3D Character · Rigging",
    tsReferenceModule: "apps/web/src/domains/creator/vrm/studio-vrm-pose-naturalization.ts",
    rustTargetCrate: "crates/studio-wasm64-drawing-core/src/vrm_skinning_kernel.rs (target)",
    wasmExportSymbol: "wasm_skin_vrm_4bone_batch", rustPortReadiness: "wasm-port-candidate",
    estimatedLoc: 7220, codebaseLocSharePct: 0.95, frameTimeWeightPct: 12.5, defaultTolerance: 1e-4, defaultInjectedDrift: 0.025,
    outputLabels: ["outX", "outY", "outZ", "weightSum"],
    currentStateKo: "현재: TS 스키닝 참조 경로 가동 중, 골든 본 가중치 픽스처 선녹화 후 Rust 이식 예정",
    currentStateEn: "Current: Running on TS reference path; recording golden bone fixtures for Rust port",
    targetStateKo: "목표: 가중치 정규화·특이값 방어 동치(<= 1e-4) 증명 후 WASM SIMD128 배치 스키닝 승격",
    targetStateEn: "Target: Promote to WASM SIMD128 batch skinning after <= 1e-4 parity proof",
  },
  {
    id: "morton-bvh-cull", order: 5, paretoRank: 5,
    titleKo: "1만 오브젝트 모턴 BVH 프러스텀 컬링", titleEn: "10K Object Morton BVH Frustum Culling",
    shortLabelKo: "모턴 BVH 컬링", shortLabelEn: "Morton BVH Cull", domainKo: "공간 분할 · 가시성", domainEn: "Spatial BVH · Culling",
    tsReferenceModule: "apps/web/src/domains/creator/render/webgpu-instanced-bvh/instanced-bvh-spatial-engine.ts",
    rustTargetCrate: "crates/studio-wasm64-drawing-core/src/morton_bvh_kernel.rs (target)",
    wasmExportSymbol: "wasm_morton_bvh_frustum_cull", rustPortReadiness: "wasm-port-candidate",
    estimatedLoc: 4940, codebaseLocSharePct: 0.65, frameTimeWeightPct: 10.0, defaultTolerance: 0, defaultInjectedDrift: 1,
    outputLabels: ["visible", "mortonCode", "centerX", "centerY"],
    currentStateKo: "현재: TS 모턴 코드 생성 및 WGSL 컬링 경로 운영, CPU 폴백 Rust 커널 이식 후보",
    currentStateEn: "Current: TS Morton code + WGSL cull active; candidate for Rust CPU fallback kernel",
    targetStateKo: "목표: 가시성 판정과 30비트 모턴 코드 0-diff 증명 후 1만 인스턴스 정렬·컬링 전환",
    targetStateEn: "Target: Switch 10K instance Morton sort & cull after exact 0-diff verification",
  },
  {
    id: "mls-puppet-warp", order: 6, paretoRank: 6,
    titleKo: "MLS 강체 퍼펫 워프 메시 솔버", titleEn: "MLS Rigid Puppet Warp Mesh Solver",
    shortLabelKo: "MLS 퍼펫 워프", shortLabelEn: "MLS Puppet Warp", domainKo: "변형 솔버 · 메시", domainEn: "Deformation · Mesh",
    tsReferenceModule: "apps/web/src/domains/creator/csp-puppet-warp/puppet-warp-mls-engine.ts",
    rustTargetCrate: "crates/studio-wasm64-drawing-core/src/filter_warp_kernel.rs",
    wasmExportSymbol: "warp_mesh_rigid_mls", rustPortReadiness: "wasm-kernel-built",
    estimatedLoc: 4480, codebaseLocSharePct: 0.59, frameTimeWeightPct: 8.5, defaultTolerance: 1e-4, defaultInjectedDrift: 0.35,
    outputLabels: ["outX", "outY", "dispPx", "pinSnap"],
    currentStateKo: "현재: Rust 강체 MLS 솔버 구현 완료, TS 퍼펫 엔진 대비 핀 특이점·회전 오차 검증 단계",
    currentStateEn: "Current: Rust rigid MLS solver built; verifying pin singularity & rotation parity",
    targetStateKo: "목표: 변위 오차 <= 1e-4px 통과 시 고밀도 퍼펫 메시 변형을 Rust WASM으로 무중단 승격",
    targetStateEn: "Target: Promote dense puppet mesh solves to Rust WASM once error <= 1e-4px",
  },
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const safeFinite = (value: number | undefined, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const roundTo = (value: number, digits: number): number => {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
};

function fnv1aHex(seedText: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function expandBits10(v: number): number {
  let x = clamp(Math.floor(v), 0, 1023) >>> 0;
  x = (x | (x << 16)) & 0x030000ff;
  x = (x | (x << 8)) & 0x0300f00f;
  x = (x | (x << 4)) & 0x030c30c3;
  x = (x | (x << 2)) & 0x09249249;
  return x >>> 0;
}

function kmChannelMix(c1: number, c2: number, ratio: number): number {
  const r1 = clamp(c1, 0.001, 0.999);
  const r2 = clamp(c2, 0.001, 0.999);
  const ks = (((1 - r1) ** 2) / (2 * r1)) * (1 - ratio) + (((1 - r2) ** 2) / (2 * r2)) * ratio;
  return roundTo(clamp(1 + ks - Math.sqrt(ks * ks + 2 * ks), 0, 1), 6);
}

function blendChannel(dst: number, src: number, modeId: number): number {
  switch (modeId) {
    case 1: return dst * src;
    case 2: return 1 - (1 - dst) * (1 - src);
    case 3: return dst < 0.5 ? 2 * dst * src : 1 - 2 * (1 - dst) * (1 - src);
    case 4: return Math.min(dst, src);
    case 5: return Math.max(dst, src);
    case 6: return src >= 0.9999 ? 1 : clamp(dst / (1 - src), 0, 1);
    case 7: return src <= 0.0001 ? 0 : clamp(1 - (1 - dst) / src, 0, 1);
    case 8: return src < 0.5 ? 2 * dst * src : 1 - 2 * (1 - dst) * (1 - src);
    case 9: return (1 - 2 * src) * dst * dst + 2 * src * dst;
    case 10: return Math.abs(dst - src);
    case 11: return dst + src - 2 * dst * src;
    default: return src;
  }
}

/** 6종 상위 5% 핫스팟의 결정론적 TypeScript 참조 구현. */
export function runTsReferenceKernel(hotspotId: HotspotTargetId, input: readonly number[]): readonly number[] {
  const at = (i: number, min: number, max: number, fb: number): number => clamp(safeFinite(input[i], fb), min, max);
  switch (hotspotId) {
    case "km16-pigment-mix": {
      const ratio = at(6, 0, 1, 0.5);
      const rOut = kmChannelMix(at(0, 0, 1, 0), at(3, 0, 1, 0), ratio);
      const gOut = kmChannelMix(at(1, 0, 1, 0), at(4, 0, 1, 0), ratio);
      const bOut = kmChannelMix(at(2, 0, 1, 0), at(5, 0, 1, 0), ratio);
      return [rOut, gOut, bOut, roundTo(0.2126 * rOut + 0.7152 * gOut + 0.0722 * bOut, 6)];
    }
    case "tactile-bristle-stamp": {
      const [wx, wy, p, tooth, dry, freq] = [at(0, -1e5, 1e5, 0), at(1, -1e5, 1e5, 0), at(2, 0, 1, 0), at(3, 0, 1, 0.5), at(4, 0, 1, 0.25), at(5, 0.01, 4, 0.12)];
      const h = roundTo(clamp(0.5 + 0.3 * Math.sin(wx * freq) * Math.cos(wy * freq) + 0.2 * Math.sin((wx + wy) * freq * 1.7), 0, 1), 6);
      const cov = roundTo(clamp((p - dry * (1 - h * tooth)) / Math.max(0.05, 1 - dry * 0.5), 0, 1), 6);
      return [h, cov, roundTo(cov * p * (0.4 + 0.6 * h), 6), Math.round(cov * 255)];
    }
    case "tile-blend-composite": {
      const [dR, dG, dB, dA] = [at(0, 0, 255, 0) / 255, at(1, 0, 255, 0) / 255, at(2, 0, 255, 0) / 255, at(3, 0, 255, 0) / 255];
      const [sR, sG, sB, sA] = [at(4, 0, 255, 0) / 255, at(5, 0, 255, 0) / 255, at(6, 0, 255, 0) / 255, (at(7, 0, 255, 0) / 255) * at(9, 0, 1, 1)];
      const modeId = Math.round(at(8, 0, 11, 0));
      const outA = sA + dA * (1 - sA);
      if (outA <= 1e-6) return [0, 0, 0, 0];
      const mix = (d: number, s: number): number => Math.round(clamp(((1 - dA) * sA * s + dA * sA * blendChannel(d, s, modeId) + dA * (1 - sA) * d) / outA, 0, 1) * 255);
      return [mix(dR, sR), mix(dG, sG), mix(dB, sB), Math.round(clamp(outA, 0, 1) * 255)];
    }
    case "vrm-4bone-skinning": {
      const [px, py, pz] = [at(0, -1e4, 1e4, 0), at(1, -1e4, 1e4, 0), at(2, -1e4, 1e4, 0)];
      const rw = [Math.max(0, safeFinite(input[3], 0)), Math.max(0, safeFinite(input[4], 0)), Math.max(0, safeFinite(input[5], 0)), Math.max(0, safeFinite(input[6], 0))];
      const sum = rw[0] + rw[1] + rw[2] + rw[3];
      const [w0, w1, w2, w3] = sum > 1e-8 ? [rw[0] / sum, rw[1] / sum, rw[2] / sum, rw[3] / sum] : [1, 0, 0, 0];
      const [tx0, ty0, tz0, tx1, ty1, tz1] = [at(7, -1e3, 1e3, 0), at(8, -1e3, 1e3, 0), at(9, -1e3, 1e3, 0), at(10, -1e3, 1e3, 0), at(11, -1e3, 1e3, 0), at(12, -1e3, 1e3, 0)];
      const ang = at(13, -Math.PI * 4, Math.PI * 4, 0);
      const [cA, sA] = [Math.cos(ang), Math.sin(ang)];
      const ox = w0 * (px + tx0) + w1 * (px * cA - py * sA + tx1) + w2 * (px * cA + pz * sA + tx1 * 0.5) + w3 * (px - tx0 * 0.25);
      const oy = w0 * (py + ty0) + w1 * (px * sA + py * cA + ty1) + w2 * (py + ty0 * 0.5) + w3 * (py - ty1 * 0.25);
      const oz = w0 * (pz + tz0) + w1 * (pz + tz1) + w2 * (-px * sA + pz * cA + tz1 * 0.5) + w3 * (pz + tz0 * 0.25);
      return [roundTo(ox, 6), roundTo(oy, 6), roundTo(oz, 6), roundTo(w0 + w1 + w2 + w3, 6)];
    }
    case "morton-bvh-cull": {
      const vals = input.slice(0, 12);
      if (vals.length < 12 || vals.some((v) => !Number.isFinite(v))) return [0, 0, 0, 0];
      const [minX, minY, minZ] = [Math.min(vals[0] ?? 0, vals[3] ?? 0), Math.min(vals[1] ?? 0, vals[4] ?? 0), Math.min(vals[2] ?? 0, vals[5] ?? 0)];
      const [maxX, maxY, maxZ] = [Math.max(vals[0] ?? 0, vals[3] ?? 0), Math.max(vals[1] ?? 0, vals[4] ?? 0), Math.max(vals[2] ?? 0, vals[5] ?? 0)];
      const [fMinX, fMinY, fMinZ] = [Math.min(vals[6] ?? -100, vals[9] ?? 100), Math.min(vals[7] ?? -100, vals[10] ?? 100), Math.min(vals[8] ?? -100, vals[11] ?? 100)];
      const [fMaxX, fMaxY, fMaxZ] = [Math.max(vals[6] ?? -100, vals[9] ?? 100), Math.max(vals[7] ?? -100, vals[10] ?? 100), Math.max(vals[8] ?? -100, vals[11] ?? 100)];
      const visible = maxX >= fMinX && minX <= fMaxX && maxY >= fMinY && minY <= fMaxY && maxZ >= fMinZ && minZ <= fMaxZ ? 1 : 0;
      const [cx, cy, cz] = [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5];
      const q = (v: number): number => Math.round(clamp((v + 1000) / 2000, 0, 1) * 1023);
      const morton = ((expandBits10(q(cx)) << 2) | (expandBits10(q(cy)) << 1) | expandBits10(q(cz))) >>> 0;
      return [visible, morton, roundTo(cx, 3), roundTo(cy, 3)];
    }
    case "mls-puppet-warp": {
      const [vx, vy, p0x, p0y] = [at(0, -1e4, 1e4, 0), at(1, -1e4, 1e4, 0), at(2, -1e4, 1e4, 0), at(3, -1e4, 1e4, 0)];
      const [q0x, q0y, p1x, p1y] = [at(4, -1e4, 1e4, p0x), at(5, -1e4, 1e4, p0y), at(6, -1e4, 1e4, 100), at(7, -1e4, 1e4, 0)];
      const [q1x, q1y] = [at(8, -1e4, 1e4, p1x), at(9, -1e4, 1e4, p1y)];
      const d0Sq = (vx - p0x) ** 2 + (vy - p0y) ** 2;
      if (d0Sq <= 1e-10) return [roundTo(q0x, 6), roundTo(q0y, 6), roundTo(Math.hypot(q0x - vx, q0y - vy), 6), 1];
      const d1Sq = (vx - p1x) ** 2 + (vy - p1y) ** 2;
      if (d1Sq <= 1e-10) return [roundTo(q1x, 6), roundTo(q1y, 6), roundTo(Math.hypot(q1x - vx, q1y - vy), 6), 1];
      const [w0, w1] = [1 / d0Sq, 1 / d1Sq];
      const wSum = w0 + w1;
      const [pSX, pSY, qSX, qSY] = [(w0 * p0x + w1 * p1x) / wSum, (w0 * p0y + w1 * p1y) / wSum, (w0 * q0x + w1 * q1x) / wSum, (w0 * q0y + w1 * q1y) / wSum];
      const [p0hX, p0hY, q0hX, q0hY] = [p0x - pSX, p0y - pSY, q0x - qSX, q0y - qSY];
      const [p1hX, p1hY, q1hX, q1hY] = [p1x - pSX, p1y - pSY, q1x - qSX, q1y - qSY];
      const aC = w0 * (p0hX * q0hX + p0hY * q0hY) + w1 * (p1hX * q1hX + p1hY * q1hY);
      const bC = w0 * (p0hX * q0hY - p0hY * q0hX) + w1 * (p1hX * q1hY - p1hY * q1hX);
      const mu = Math.hypot(aC, bC);
      const [dvx, dvy] = [vx - pSX, vy - pSY];
      const outX = mu > 1e-10 ? qSX + (aC * dvx - bC * dvy) / mu : qSX + dvx;
      const outY = mu > 1e-10 ? qSY + (bC * dvx + aC * dvy) / mu : qSY + dvy;
      return [roundTo(outX, 6), roundTo(outY, 6), roundTo(Math.hypot(outX - vx, outY - vy), 6), 0];
    }
  }
}

interface RawFixtureSeed {
  readonly suffix: string; readonly category: FixtureCategory; readonly labelKo: string; readonly labelEn: string; readonly input: readonly number[];
}

const GOLDEN_FIXTURE_SEEDS: Record<HotspotTargetId, readonly RawFixtureSeed[]> = {
  "km16-pigment-mix": [
    { suffix: "nominal-blue-yellow", category: "nominal", labelKo: "표준 울트라마린+카드뮴옐로 50% 혼색", labelEn: "Nominal Blue + Yellow 50% Mix", input: [0.08, 0.24, 0.86, 0.96, 0.88, 0.12, 0.5] },
    { suffix: "zero-black", category: "zero", labelKo: "경계값 0 (순흑 + ratio=0)", labelEn: "Zero Boundary (Pure Black, ratio=0)", input: [0, 0, 0, 0.9, 0.5, 0.2, 0] },
    { suffix: "one-white", category: "one", labelKo: "경계값 1 (순백 + ratio=1)", labelEn: "One Boundary (Pure White, ratio=1)", input: [0.1, 0.2, 0.3, 1, 1, 1, 1] },
    { suffix: "negative-clamp", category: "negative", labelKo: "음수 채널·비율 클램프 방어", labelEn: "Negative Channel & Ratio Clamp Guard", input: [-0.4, 0.5, -1.2, 0.8, -0.1, 0.7, -0.25] },
    { suffix: "nan-guard", category: "nan-guard", labelKo: "NaN 입력 무크래시 방어", labelEn: "NaN Input Non-Crash Guard", input: [Number.NaN, 0.5, 0.6, 0.9, Number.NaN, 0.2, Number.NaN] },
    { suffix: "inf-guard", category: "inf-guard", labelKo: "±Infinity 입력 상한 클램프 방어", labelEn: "±Infinity Input Clamp Guard", input: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.4, 0.7, 0.3, 0.9, Number.POSITIVE_INFINITY] },
    { suffix: "edge-ultra-dark", category: "boundary-edge", labelKo: "극저반사(0.001) 특이점 안정성", labelEn: "Near-Zero Reflectance Singularity", input: [0.0001, 0.0001, 0.0001, 0.001, 0.001, 0.001, 0.5] },
    { suffix: "edge-overshoot", category: "boundary-edge", labelKo: "HDR 초과(2.5) 입력 1.0 포화", labelEn: "HDR Overshoot Saturation", input: [2.5, 1.8, 0.2, 0.4, 3.1, 0.9, 1.4] },
  ],
  "tactile-bristle-stamp": [
    { suffix: "nominal-coldpress", category: "nominal", labelKo: "표준 황목 종이 중간 필압 스트로크", labelEn: "Nominal Cold-Press Mid-Pressure Stroke", input: [128.5, 64.25, 0.68, 0.75, 0.28, 0.14] },
    { suffix: "zero-pressure", category: "zero", labelKo: "경계값 0 (필압 0 · 무착색)", labelEn: "Zero Boundary (Zero Pressure)", input: [0, 0, 0, 0, 0, 0.12] },
    { suffix: "one-max-load", category: "one", labelKo: "경계값 1 (최대 필압·요철·갈필)", labelEn: "One Boundary (Max Pressure & Tooth)", input: [1, 1, 1, 1, 1, 1] },
    { suffix: "negative-world", category: "negative", labelKo: "음수 월드 좌표·음수 필압 방어", labelEn: "Negative World Coord & Pressure Guard", input: [-512.75, -1024.5, -0.3, -0.5, -0.2, -1] },
    { suffix: "nan-guard", category: "nan-guard", labelKo: "NaN 필압·좌표 안전 폴백", labelEn: "NaN Coordinate & Pressure Guard", input: [Number.NaN, 42, Number.NaN, 0.6, Number.NaN, 0.2] },
    { suffix: "inf-guard", category: "inf-guard", labelKo: "±Infinity 주파수·필압 클램프", labelEn: "±Infinity Frequency & Pressure Guard", input: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, 0.8, 0.2, Number.POSITIVE_INFINITY] },
    { suffix: "edge-dry-brush", category: "boundary-edge", labelKo: "극강 갈필(dry=0.95) 요철 마루 착색", labelEn: "Heavy Dry-Brush Peak Deposition", input: [312, 188, 0.55, 0.95, 0.95, 0.22] },
    { suffix: "edge-wet-impasto", category: "boundary-edge", labelKo: "습식 두꺼운 임파스토(dry=0, p=0.98)", labelEn: "Wet Heavy Impasto Coverage", input: [48, 96, 0.98, 0.4, 0, 0.08] },
  ],
  "tile-blend-composite": [
    { suffix: "nominal-multiply", category: "nominal", labelKo: "표준 Multiply(mode=1) 80% 합성", labelEn: "Nominal Multiply (mode=1) 80% Opacity", input: [210, 180, 140, 255, 120, 90, 200, 220, 1, 0.8] },
    { suffix: "zero-transparent", category: "zero", labelKo: "경계값 0 (완전 투명 소스·대상)", labelEn: "Zero Boundary (Fully Transparent)", input: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { suffix: "one-opaque-screen", category: "one", labelKo: "경계값 1 (불투명 Screen mode=2)", labelEn: "One Boundary (Opaque Screen mode=2)", input: [255, 255, 255, 255, 255, 255, 255, 255, 2, 1] },
    { suffix: "negative-channels", category: "negative", labelKo: "음수 RGBA·음수 불투명도 방어", labelEn: "Negative Channel & Opacity Guard", input: [-40, 120, -255, 200, -10, 240, 100, 180, -3, -0.5] },
    { suffix: "nan-guard", category: "nan-guard", labelKo: "NaN 채널·모드 안전 0 정규화", labelEn: "NaN Channel & Mode Sanitization", input: [Number.NaN, 128, 64, 255, 200, Number.NaN, 50, 200, Number.NaN, 0.7] },
    { suffix: "inf-guard", category: "inf-guard", labelKo: "±Infinity 오버플로 바이트 포화", labelEn: "±Infinity Byte Clamping Guard", input: [Number.POSITIVE_INFINITY, 100, Number.NEGATIVE_INFINITY, 255, 180, Number.POSITIVE_INFINITY, 90, 255, 99, Number.POSITIVE_INFINITY] },
    { suffix: "edge-color-dodge", category: "boundary-edge", labelKo: "ColorDodge(mode=6) 0나눗셈 경계(src=255)", labelEn: "ColorDodge Division-By-Zero Guard", input: [140, 80, 200, 255, 255, 255, 128, 255, 6, 1] },
    { suffix: "edge-color-burn", category: "boundary-edge", labelKo: "ColorBurn(mode=7) 0나눗셈 경계(src=0)", labelEn: "ColorBurn Division-By-Zero Guard", input: [140, 80, 200, 255, 0, 0, 128, 255, 7, 1] },
  ],
  "vrm-4bone-skinning": [
    { suffix: "nominal-shoulder", category: "nominal", labelKo: "표준 어깨 4-본 혼합(45° 회전)", labelEn: "Nominal 4-Bone Shoulder Blend (45°)", input: [1.2, 0.8, -0.4, 0.5, 0.3, 0.15, 0.05, 0.1, 0.2, -0.1, -0.2, 0.4, 0.1, Math.PI / 4] },
    { suffix: "zero-weights", category: "zero", labelKo: "경계값 0 (4-본 가중치 합 0 안전 폴백)", labelEn: "Zero Boundary (All-Zero Weights Fallback)", input: [0, 0, 0, 0, 0, 0, 0, 1.5, -0.5, 0.25, 0, 0, 0, 0] },
    { suffix: "one-rigid-bone", category: "one", labelKo: "경계값 1 (단일 본 가중치=1 강체)", labelEn: "One Boundary (Single Rigid Bone w=1)", input: [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1] },
    { suffix: "negative-weights", category: "negative", labelKo: "음수 가중치·음수 정점 클램프", labelEn: "Negative Bone Weight & Vertex Guard", input: [-2.5, -1.5, -0.5, -0.4, 0.8, -0.2, 0.2, -1, -2, -3, 0.5, -0.5, 0.2, -Math.PI / 2] },
    { suffix: "nan-guard", category: "nan-guard", labelKo: "NaN 가중치·회전각 정규화 방어", labelEn: "NaN Weight & Angle Guard", input: [Number.NaN, 1.0, 0.5, Number.NaN, 0.6, 0.4, Number.NaN, 0.2, Number.NaN, 0.1, 0, 0, 0, Number.NaN] },
    { suffix: "inf-guard", category: "inf-guard", labelKo: "±Infinity 정점·평행이동 클램프", labelEn: "±Infinity Position & Translation Guard", input: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2, 0.25, 0.25, 0.25, 0.25, Number.POSITIVE_INFINITY, 0, 0, 0, 0, 0, Number.POSITIVE_INFINITY] },
    { suffix: "edge-pi-flip", category: "boundary-edge", labelKo: "180°(π) 반전 회전 수치 안정성", labelEn: "180° (π) Flip Numerical Stability", input: [2.0, -1.0, 0.5, 0, 1, 0, 0, 0, 0, 0, 0.5, 0.5, -0.5, Math.PI] },
    { suffix: "edge-unnormalized", category: "boundary-edge", labelKo: "비정규 가중치(합=4.0) 자동 정규화", labelEn: "Unnormalized Weights (Sum=4.0) Renorm", input: [0.5, 1.5, -0.75, 1.5, 1.5, 0.5, 0.5, 0.3, -0.2, 0.1, -0.1, 0.2, 0.4, 0.6] },
  ],
  "morton-bvh-cull": [
    { suffix: "nominal-inside", category: "nominal", labelKo: "표준 프러스텀 내부 AABB 가시 판정", labelEn: "Nominal AABB Inside Frustum", input: [10, 20, -5, 30, 40, 15, -100, -100, -100, 100, 100, 100] },
    { suffix: "zero-origin-point", category: "zero", labelKo: "경계값 0 (원점 퇴화 점 AABB)", labelEn: "Zero Boundary (Origin Degenerate Point)", input: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { suffix: "one-unit-cube", category: "one", labelKo: "경계값 1 (단위 정육면체 포함)", labelEn: "One Boundary (Unit Cube Inside)", input: [0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1] },
    { suffix: "negative-outside", category: "negative", labelKo: "음수 좌표 프러스텀 외곽 컬링", labelEn: "Negative Coordinate Outside Frustum Cull", input: [-450, -320, -210, -410, -280, -190, -100, -100, -100, 100, 100, 100] },
    { suffix: "nan-guard", category: "nan-guard", labelKo: "NaN 바운드 안전 컬링(visible=0)", labelEn: "NaN Bounds Safe Cull (visible=0)", input: [Number.NaN, 0, 0, 10, 10, 10, -100, -100, -100, 100, 100, 100] },
    { suffix: "inf-guard", category: "inf-guard", labelKo: "±Infinity 바운드 안전 컬링(visible=0)", labelEn: "±Infinity Bounds Safe Cull (visible=0)", input: [Number.NEGATIVE_INFINITY, 0, 0, Number.POSITIVE_INFINITY, 10, 10, -100, -100, -100, 100, 100, 100] },
    { suffix: "edge-inverted-aabb", category: "boundary-edge", labelKo: "뒤집힌 min>max AABB 정규화", labelEn: "Inverted min>max AABB Normalization", input: [50, 60, 20, 10, 15, -5, -100, -100, -100, 100, 100, 100] },
    { suffix: "edge-touching-plane", category: "boundary-edge", labelKo: "프러스텀 경계면 정확 접촉(maxX=fMinX)", labelEn: "Exact Frustum Plane Touch Boundary", input: [-150, -10, -10, -100, 10, 10, -100, -100, -100, 100, 100, 100] },
  ],
  "mls-puppet-warp": [
    { suffix: "nominal-arm-lift", category: "nominal", labelKo: "표준 2핀 팔 올리기 강체 변형", labelEn: "Nominal 2-Pin Rigid Arm Lift", input: [50, 35, 0, 0, 0, 0, 100, 0, 90, 40] },
    { suffix: "zero-identity", category: "zero", labelKo: "경계값 0 (정점·핀 원점 일치 스냅)", labelEn: "Zero Boundary (Vertex on Origin Pin)", input: [0, 0, 0, 0, 0, 0, 1, 0, 1, 0] },
    { suffix: "one-unit-shift", category: "one", labelKo: "경계값 1 (단위 평행이동 변위=1)", labelEn: "One Boundary (Unit Translation Shift)", input: [1, 1, 0, 0, 1, 0, 2, 0, 3, 0] },
    { suffix: "negative-coords", category: "negative", labelKo: "음수 좌표계 90° 강체 회전", labelEn: "Negative Coordinate 90° Rigid Rotation", input: [-40, -20, -100, -100, -100, -100, -100, 0, 0, -100] },
    { suffix: "nan-guard", category: "nan-guard", labelKo: "NaN 핀 좌표 무발산 폴백", labelEn: "NaN Pin Coordinate Divergence Guard", input: [Number.NaN, 25, 0, 0, Number.NaN, 10, 100, 0, 100, Number.NaN] },
    { suffix: "inf-guard", category: "inf-guard", labelKo: "±Infinity 정점·타깃 클램프 방어", labelEn: "±Infinity Vertex & Target Clamp Guard", input: [Number.POSITIVE_INFINITY, 10, 0, 0, 5, 5, 100, 0, Number.NEGATIVE_INFINITY, 20] },
    { suffix: "edge-pin-singularity", category: "boundary-edge", labelKo: "핀 정확 일치 특이점(dist=0) 스냅", labelEn: "Exact Pin Coincidence Singularity Snap", input: [100, 0, 0, 0, 10, -5, 100, 0, 125, 45] },
    { suffix: "edge-collinear-collapsed", category: "boundary-edge", labelKo: "동일 위치 겹친 핀(mu=0) 안전 처리", labelEn: "Collapsed Coincident Pins (mu=0) Guard", input: [25, 40, 10, 10, 30, 20, 10, 10, 30, 20] },
  ],
};

export function getHotspotTarget(hotspotId: HotspotTargetId): HotspotTargetSpec {
  const found = TOP_5PCT_HOTSPOT_TARGETS.find((item) => item.id === hotspotId);
  if (found) return found;
  const fallback = TOP_5PCT_HOTSPOT_TARGETS[0];
  if (fallback) return fallback;
  throw new Error("TOP_5PCT_HOTSPOT_TARGETS must contain at least one target.");
}

export function summarizeParetoConcentration(targets: readonly HotspotTargetSpec[] = TOP_5PCT_HOTSPOT_TARGETS): ParetoConcentrationSummary {
  const hotspotTotalLoc = targets.reduce((acc, item) => acc + item.estimatedLoc, 0);
  const hotspotLocSharePct = roundTo((hotspotTotalLoc / TOTAL_CODEBASE_LOC_REFERENCE) * 100, 2);
  const hotspotFrameTimeSharePct = roundTo(targets.reduce((acc, item) => acc + item.frameTimeWeightPct, 0), 1);
  const builtRustKernelCount = targets.filter((t) => t.rustPortReadiness === "wasm-kernel-built").length;
  return {
    totalCodebaseLoc: TOTAL_CODEBASE_LOC_REFERENCE, hotspotCount: targets.length, hotspotTotalLoc,
    hotspotLocSharePct, coldCodeLocSharePct: roundTo(100 - hotspotLocSharePct, 2),
    hotspotFrameTimeSharePct, coldCodeFrameTimeSharePct: roundTo(Math.max(0, 100 - hotspotFrameTimeSharePct), 1),
    builtRustKernelCount, portCandidateCount: targets.length - builtRustKernelCount,
    disclosureKo: `계획 예제에서는 76만 LOC 중 ${hotspotLocSharePct}%를 골라 전체 프레임 연산의 ${hotspotFrameTimeSharePct}%를 차지한다고 가정합니다.`,
    disclosureEn: `The planning example assumes ${hotspotLocSharePct}% of 760,000 lines accounts for ${hotspotFrameTimeSharePct}% of frame work.`,
  };
}

/** 1단계 Scan: 대상 핫스팟의 프로파일 비중과 이식 우선순위를 산출한다. */
export function scanHotspotProfile(hotspotId: HotspotTargetId): HotspotScanResult {
  const target = getHotspotTarget(hotspotId);
  return {
    hotspotId: target.id, paretoRank: target.paretoRank, estimatedLoc: target.estimatedLoc,
    codebaseLocSharePct: target.codebaseLocSharePct, frameTimeWeightPct: target.frameTimeWeightPct,
    defaultTolerance: target.defaultTolerance, rustPortReadiness: target.rustPortReadiness,
    recommendedPriority: target.frameTimeWeightPct >= 15 ? "p0-critical" : "p1-high",
    summaryKo: `${target.shortLabelKo} · 계획 입력 ${target.codebaseLocSharePct}% LOC · 프레임 연산 ${target.frameTimeWeightPct}% · 허용오차 ${target.defaultTolerance}`,
    summaryEn: `${target.shortLabelEn} · planning inputs ${target.codebaseLocSharePct}% LOC and ${target.frameTimeWeightPct}% frame work · tolerance ${target.defaultTolerance}`,
  };
}

/** 2단계 Record: 경계값(0, 1, 음수, NaN/Inf 방어, 엣지 케이스) 포함 결정론적 골든 I/O 스냅샷을 녹화한다. */
export function recordGoldenIoFixtures(hotspotId: HotspotTargetId): readonly GoldenIoFixture[] {
  const target = getHotspotTarget(hotspotId);
  return GOLDEN_FIXTURE_SEEDS[target.id].map((seed) => ({
    id: `${target.id}:${seed.suffix}`, hotspotId: target.id, category: seed.category,
    labelKo: seed.labelKo, labelEn: seed.labelEn, input: [...seed.input],
    expectedOutput: runTsReferenceKernel(target.id, seed.input),
    inputDigest: fnv1aHex(`${target.id}:${seed.suffix}:${seed.input.map((v) => String(v)).join(",")}`),
  }));
}

/** 3단계 Port: TS 후보 모형으로 이식과 오차 검출을 연습한다. */
export function createRustCandidateKernel(hotspotId: HotspotTargetId, options?: RustCandidateOptions): HotspotKernelFn {
  const target = getHotspotTarget(hotspotId);
  const drift = Math.max(0, safeFinite(options?.injectedErrorMagnitude, 0));
  const injectNonFinite = Boolean(options?.injectNonFinite);
  const targetIndex = options?.injectedFixtureIndex;
  let callCounter = 0;
  return (input: readonly number[]): readonly number[] => {
    const idx = callCounter;
    callCounter += 1;
    const base = [...runTsReferenceKernel(target.id, input)];
    if ((targetIndex !== undefined && targetIndex !== idx) || base.length === 0) return base;
    if (injectNonFinite) {
      base[0] = Number.NaN;
      return base;
    }
    if (drift > 0) base[0] = roundTo((base[0] ?? 0) + drift, 6);
    return base;
  };
}

/** 4단계 Verify: 원본 TS 골든 출력과 Rust 후보 출력의 픽셀·벡터·수치별 오차와 불일치를 증명한다. */
export function verifyTsVsRustParity(
  hotspotId: HotspotTargetId,
  fixtures: readonly GoldenIoFixture[],
  candidateFn: HotspotKernelFn,
  tolerance?: number,
): ParityVerificationResult {
  const target = getHotspotTarget(hotspotId);
  const safeTolerance = Math.max(0, safeFinite(tolerance, target.defaultTolerance));
  const nonFinitePenalty = Math.max(safeTolerance * 1000, 1e6);

  let maxAbsErr = 0; let errSum = 0; let totalVectorElements = 0;
  let mismatchCount = 0; let nonFiniteOutputCount = 0; let shapeMismatchCount = 0; let passedCases = 0;
  const details: FixtureParityDetail[] = [];

  for (const fixture of fixtures) {
    let candidateOutput: readonly number[] = [];
    let thrownError = false;
    try {
      const raw = candidateFn(fixture.input);
      candidateOutput = Array.isArray(raw) ? raw : [];
    } catch {
      thrownError = true;
    }

    const expected = fixture.expectedOutput;
    const shapeBad = thrownError || candidateOutput.length !== expected.length;
    let nonFiniteBad = false;
    let caseMaxErr = 0;

    if (shapeBad) {
      shapeMismatchCount += 1;
      caseMaxErr = nonFinitePenalty;
      totalVectorElements += expected.length;
      errSum += nonFinitePenalty * Math.max(1, expected.length);
    } else {
      for (let i = 0; i < expected.length; i += 1) {
        const expVal = expected[i] ?? 0;
        const candVal = candidateOutput[i] ?? Number.NaN;
        totalVectorElements += 1;
        if (!Number.isFinite(expVal) || !Number.isFinite(candVal)) {
          nonFiniteBad = true;
          nonFiniteOutputCount += 1;
          caseMaxErr = Math.max(caseMaxErr, nonFinitePenalty);
          errSum += nonFinitePenalty;
        } else {
          const diff = Math.abs(candVal - expVal);
          caseMaxErr = Math.max(caseMaxErr, diff);
          errSum += diff;
        }
      }
    }

    maxAbsErr = Math.max(maxAbsErr, caseMaxErr);
    const nonFiniteOrShapeError = shapeBad || nonFiniteBad;
    const passed = !nonFiniteOrShapeError && caseMaxErr <= safeTolerance;
    if (passed) passedCases += 1;
    else mismatchCount += 1;

    const errorNoteKo = passed ? null : thrownError ? "후보 실행 중 예외 발생" : shapeBad ? `출력 벡터 길이 불일치(기대 ${expected.length}, 실제 ${candidateOutput.length})` : nonFiniteBad ? "NaN/Infinity 비유한 출력 탐지" : `허용오차(${safeTolerance}) 초과: 최대 절대오차 ${caseMaxErr}`;
    const errorNoteEn = passed ? null : thrownError ? "Candidate kernel threw during execution" : shapeBad ? `Output vector length mismatch (expected ${expected.length}, got ${candidateOutput.length})` : nonFiniteBad ? "Non-finite NaN/Infinity output detected" : `Exceeded tolerance (${safeTolerance}): max abs err ${caseMaxErr}`;

    details.push({
      fixtureId: fixture.id, category: fixture.category, labelKo: fixture.labelKo, labelEn: fixture.labelEn,
      expectedOutput: expected, candidateOutput: candidateOutput.map((v) => (Number.isFinite(v) ? v : -999999)),
      absErr: caseMaxErr, passed, nonFiniteOrShapeError, errorNoteKo, errorNoteEn,
    });
  }

  const totalCases = fixtures.length;
  const meanAbsErr = totalVectorElements > 0 ? roundTo(errSum / totalVectorElements, 8) : 0;
  const parityPassed = totalCases > 0 && mismatchCount === 0 && nonFiniteOutputCount === 0 && shapeMismatchCount === 0 && maxAbsErr <= safeTolerance;
  const proofDigest = `sha-fnv32-${fnv1aHex(`${target.id}|tol=${safeTolerance}|cases=${totalCases}|mismatch=${mismatchCount}|max=${maxAbsErr}|${fixtures.map((f) => f.inputDigest).join(".")}`)}`;

  return {
    hotspotId: target.id, tolerance: safeTolerance, totalCases, passedCases, mismatchCount,
    nonFiniteOutputCount, shapeMismatchCount, totalVectorElements, maxAbsErr, meanAbsErr, parityPassed, proofDigest, details,
    summaryKo: parityPassed ? `${totalCases}건 전수 동치 통과 (불일치 0건 · maxAbsErr ${maxAbsErr} <= 허용오차 ${safeTolerance})` : `동치 실패: ${mismatchCount}/${totalCases}건 불일치 (maxAbsErr ${maxAbsErr} > 허용오차 ${safeTolerance}) — Fail-Closed 차단 대상`,
    summaryEn: parityPassed ? `All ${totalCases} golden fixtures matched (0 mismatches · maxAbsErr ${maxAbsErr} <= tol ${safeTolerance})` : `Parity failed: ${mismatchCount}/${totalCases} mismatches (maxAbsErr ${maxAbsErr} > tol ${safeTolerance}) — Fail-Closed block`,
  };
}

function appendAudit(trail: readonly PorterAuditEntry[], stage: PorterPipelineStage, action: PorterAuditEntry["action"], messageKo: string, messageEn: string): readonly PorterAuditEntry[] {
  return [...trail, { step: trail.length + 1, stage, action, messageKo, messageEn }];
}

export function createInitialHotspotSession(hotspotId: HotspotTargetId): HotspotPorterSession {
  const target = getHotspotTarget(hotspotId);
  const scanResult = scanHotspotProfile(target.id);
  return {
    hotspotId: target.id, stage: "scan", routingMode: "ts-reference", gateDecision: "pending",
    tolerance: target.defaultTolerance, injectErrorEnabled: false, injectedErrorMagnitude: target.defaultInjectedDrift,
    scanResult, fixtures: [], portReady: false, verification: null, blockedReasonKo: null, blockedReasonEn: null,
    auditTrail: [{ step: 1, stage: "scan", action: "scan", messageKo: scanResult.summaryKo, messageEn: scanResult.summaryEn }],
  };
}

export function runScanStep(session: HotspotPorterSession): HotspotPorterSession {
  const scanResult = scanHotspotProfile(session.hotspotId);
  return { ...session, stage: "scan", scanResult, auditTrail: appendAudit(session.auditTrail, "scan", "scan", scanResult.summaryKo, scanResult.summaryEn) };
}

export function runRecordStep(session: HotspotPorterSession): HotspotPorterSession {
  const fixtures = recordGoldenIoFixtures(session.hotspotId);
  return {
    ...session, stage: "record", scanResult: session.scanResult ?? scanHotspotProfile(session.hotspotId),
    fixtures, portReady: false, verification: null, routingMode: "ts-reference", gateDecision: "pending",
    blockedReasonKo: null, blockedReasonEn: null,
    auditTrail: appendAudit(session.auditTrail, "record", "record", `골든 I/O ${fixtures.length}건 녹화 완료(0·1·음수·NaN/Inf 방어·경계값 포함)`, `Recorded ${fixtures.length} golden I/O fixtures (0, 1, negative, NaN/Inf guards & edges)`),
  };
}

export function runPortStep(
  session: HotspotPorterSession,
  options?: { readonly injectErrorEnabled?: boolean; readonly injectedErrorMagnitude?: number },
): HotspotPorterSession {
  const target = getHotspotTarget(session.hotspotId);
  const fixtures = session.fixtures.length > 0 ? session.fixtures : recordGoldenIoFixtures(target.id);
  const injectErrorEnabled = options?.injectErrorEnabled ?? session.injectErrorEnabled;
  const injectedErrorMagnitude = options?.injectedErrorMagnitude !== undefined ? Math.max(0, safeFinite(options.injectedErrorMagnitude, target.defaultInjectedDrift)) : session.injectedErrorMagnitude;
  return {
    ...session, stage: "port", scanResult: session.scanResult ?? scanHotspotProfile(target.id), fixtures, portReady: true,
    injectErrorEnabled, injectedErrorMagnitude, verification: null, routingMode: "ts-reference", gateDecision: "pending", blockedReasonKo: null, blockedReasonEn: null,
    auditTrail: appendAudit(
      session.auditTrail, "port", "port",
      injectErrorEnabled ? `후보 모형 준비 · 테스트 오차 +${injectedErrorMagnitude}` : "후보 모형 준비",
      injectErrorEnabled ? `Prepared candidate model with intentional drift +${injectedErrorMagnitude}` : "Prepared candidate model",
    ),
  };
}

export function runVerifyStep(session: HotspotPorterSession, candidateFn?: HotspotKernelFn, toleranceOverride?: number): HotspotPorterSession {
  const target = getHotspotTarget(session.hotspotId);
  const fixtures = session.fixtures.length > 0 ? session.fixtures : recordGoldenIoFixtures(target.id);
  const tolerance = toleranceOverride !== undefined ? Math.max(0, safeFinite(toleranceOverride, target.defaultTolerance)) : session.tolerance;
  const fn = candidateFn ?? createRustCandidateKernel(target.id, { injectedErrorMagnitude: session.injectErrorEnabled ? session.injectedErrorMagnitude : 0 });
  const verification = verifyTsVsRustParity(target.id, fixtures, fn, tolerance);
  const mustDowngrade = !verification.parityPassed && session.routingMode === "rust-wasm-enabled";
  return {
    ...session, stage: "verify", scanResult: session.scanResult ?? scanHotspotProfile(target.id), fixtures, portReady: true,
    tolerance, verification, routingMode: mustDowngrade ? "ts-reference" : session.routingMode,
    gateDecision: verification.parityPassed ? (session.routingMode === "rust-wasm-enabled" ? "approved" : "pending") : "blocked-fail-closed",
    blockedReasonKo: verification.parityPassed ? null : verification.summaryKo,
    blockedReasonEn: verification.parityPassed ? null : verification.summaryEn,
    auditTrail: appendAudit(
      session.auditTrail, "verify", "verify",
      mustDowngrade ? `${verification.summaryKo} — 활성 Rust 경로를 즉시 TS 참조로 강등했다.` : verification.summaryKo,
      mustDowngrade ? `${verification.summaryEn} — Active Rust path auto-reverted to TS reference.` : verification.summaryEn,
    ),
  };
}

/** 5단계 Enable (Fail-Closed Gate): mismatchCount === 0 이고 maxAbsErr <= tolerance 인 검증 통과 상태에서만 Rust WASM 승격을 허용한다. */
export function enableRustHotspotKernel(session: HotspotPorterSession, verificationOverride?: ParityVerificationResult): HotspotPorterSession {
  const verification = verificationOverride ?? session.verification;
  const target = getHotspotTarget(session.hotspotId);
  if (!session.portReady || !verification || verification !== session.verification || verification.hotspotId !== target.id || verification.totalCases !== session.fixtures.length || verification.totalCases === 0) {
    const reasonKo = "동치 검증 영수증이 없어 Rust 승격을 차단했다(Fail-Closed). Verify 단계를 먼저 통과해야 한다.";
    const reasonEn = "Blocked Rust promotion (Fail-Closed): missing parity verification proof. Run Verify first.";
    return { ...session, routingMode: "ts-reference", gateDecision: "blocked-fail-closed", blockedReasonKo: reasonKo, blockedReasonEn: reasonEn, auditTrail: appendAudit(session.auditTrail, "enable", "enable-blocked", reasonKo, reasonEn) };
  }
  const gateOk = verification.parityPassed && verification.mismatchCount === 0 && verification.nonFiniteOutputCount === 0 && verification.shapeMismatchCount === 0 && Number.isFinite(verification.maxAbsErr) && verification.maxAbsErr <= verification.tolerance;
  if (!gateOk) {
    const reasonKo = `Fail-Closed 차단: 불일치 ${verification.mismatchCount}건 · maxAbsErr ${verification.maxAbsErr} (허용오차 ${verification.tolerance}). TS 참조 경로를 유지한다.`;
    const reasonEn = `Fail-Closed block: ${verification.mismatchCount} mismatches · maxAbsErr ${verification.maxAbsErr} (tol ${verification.tolerance}). Keeping TS reference.`;
    return { ...session, stage: "verify", verification, routingMode: "ts-reference", gateDecision: "blocked-fail-closed", blockedReasonKo: reasonKo, blockedReasonEn: reasonEn, auditTrail: appendAudit(session.auditTrail, "enable", "enable-blocked", reasonKo, reasonEn) };
  }
  const okKo = `후보 모형 전환 승인 · ${target.shortLabelKo} 예제 ${verification.totalCases}건 통과`;
  const okEn = `Model switch approved · ${target.shortLabelEn} passed ${verification.totalCases} fixtures`;
  return { ...session, stage: "enable", verification, routingMode: "rust-wasm-enabled", gateDecision: "approved", blockedReasonKo: null, blockedReasonEn: null, auditTrail: appendAudit(session.auditTrail, "enable", "enable-approved", okKo, okEn) };
}

/** 원클릭 무중단 롤백: 활성 Rust 핫스팟 경로를 즉시 TS 참조 구현으로 복귀한다. */
export function rollbackToTsReference(session: HotspotPorterSession, reasonKo?: string, reasonEn?: string): HotspotPorterSession {
  const target = getHotspotTarget(session.hotspotId);
  const msgKo = reasonKo ?? `${target.shortLabelKo} 실행 경로를 TS 참조 구현으로 즉시 롤백했다.`;
  const msgEn = reasonEn ?? `Rolled ${target.shortLabelEn} execution back to TS reference immediately.`;
  return { ...session, stage: session.verification ? "verify" : "port", routingMode: "ts-reference", gateDecision: "rolled-back", blockedReasonKo: null, blockedReasonEn: null, auditTrail: appendAudit(session.auditTrail, "enable", "rollback", msgKo, msgEn) };
}

/** 5단계 파이프라인(Scan → Record → Port → Verify → Enable)을 일괄 실행한다. */
export function runFullVerifiedPortFlow(
  hotspotId: HotspotTargetId,
  options?: { readonly injectErrorEnabled?: boolean; readonly injectedErrorMagnitude?: number; readonly tolerance?: number; readonly candidateFn?: HotspotKernelFn },
): HotspotPorterSession {
  const s2 = runRecordStep(createInitialHotspotSession(hotspotId));
  const s3 = runPortStep(s2, {
    ...(options?.injectErrorEnabled !== undefined ? { injectErrorEnabled: options.injectErrorEnabled } : {}),
    ...(options?.injectedErrorMagnitude !== undefined ? { injectedErrorMagnitude: options.injectedErrorMagnitude } : {}),
  });
  return enableRustHotspotKernel(runVerifyStep(s3, options?.candidateFn, options?.tolerance));
}

export function buildHotspotParityReceipt(session: HotspotPorterSession): HotspotParityProofReceipt {
  return {
    schemaVersion: "toonstudio.rust-hotspot-parity-receipt.v1",
    executionScope: "simulation",
    hotspot: getHotspotTarget(session.hotspotId), stage: session.stage, routingMode: session.routingMode,
    gateDecision: session.gateDecision, tolerance: session.tolerance, injectErrorEnabled: session.injectErrorEnabled,
    paretoSummary: summarizeParetoConcentration(TOP_5PCT_HOTSPOT_TARGETS), verification: session.verification,
    blockedReasonKo: session.blockedReasonKo, blockedReasonEn: session.blockedReasonEn,
    honestyNoteKo: "이 보고서는 TS 예제로 흉내 낸 후보의 동작과 계획 입력값을 기록합니다. 실제 Rust WASM과 단말별 성능은 별도로 검증합니다.",
    honestyNoteEn: "This report records a TS candidate simulation and planning inputs. Actual Rust WASM parity and device performance require separate verification.",
  };
}

export function exportHotspotParityReportJson(session: HotspotPorterSession): { readonly json: string; readonly receipt: HotspotParityProofReceipt } {
  const receipt = buildHotspotParityReceipt(session);
  return { json: JSON.stringify(receipt, null, 2), receipt };
}

export function exportHotspotParityMarkdown(session: HotspotPorterSession, locale: "ko" | "en" = "ko"): string {
  const receipt = buildHotspotParityReceipt(session);
  const v = receipt.verification;
  const isEn = locale === "en";
  const lines: string[] = [
    isEn ? `## ToonStudio Top-5% Rust Hotspot Parity Receipt (${receipt.hotspot.id})` : `## ToonStudio 상위 5% 핫스팟 Rust 동치 증명 영수증 (${receipt.hotspot.id})`,
    "",
    `- **${isEn ? "Hotspot" : "핫스팟"}**: ${isEn ? receipt.hotspot.titleEn : receipt.hotspot.titleKo}`,
    `- **${isEn ? "Pipeline Stage" : "파이프라인 단계"}**: \`${receipt.stage}\``,
    `- **${isEn ? "Active Routing" : "활성 실행 경로"}**: \`${receipt.routingMode}\``,
    `- **${isEn ? "Gate Decision" : "게이트 판정"}**: \`${receipt.gateDecision}\``,
    `- **${isEn ? "Tolerance" : "허용오차"}**: \`${receipt.tolerance}\``,
    `- **${isEn ? "Rust Target" : "Rust 대상 커널"}**: \`${receipt.hotspot.rustTargetCrate}\` (\`${receipt.hotspot.wasmExportSymbol}\`)`,
    `- **${isEn ? "Pareto Share" : "파레토 비중"}**: ${receipt.hotspot.codebaseLocSharePct}% LOC / ${receipt.hotspot.frameTimeWeightPct}% frame weight`,
  ];
  if (v) {
    lines.push(
      `- **${isEn ? "Proof Digest" : "증명 다이제스트"}**: \`${v.proofDigest}\``,
      `- **${isEn ? "Parity Summary" : "동치 요약"}**: ${v.passedCases}/${v.totalCases} PASS, mismatchCount=${v.mismatchCount}, maxAbsErr=${v.maxAbsErr}`,
      "",
      isEn ? "| Fixture | Category | absErr | Status |" : "| 픽스처 | 분류 | 최대 절대오차 | 판정 |",
      "| --- | --- | ---: | --- |",
      ...v.details.map((d) => `| \`${d.fixtureId}\` | ${d.category} | ${d.absErr} | ${d.passed ? "PASS" : "FAIL"} |`),
    );
  } else {
    lines.push("", isEn ? "> Verification has not been executed yet. Fail-Closed gate remains locked on TS reference." : "> 아직 Verify 단계를 실행하지 않았다. Fail-Closed 게이트가 TS 참조 경로를 유지한다.");
  }
  lines.push("", `> ${isEn ? receipt.honestyNoteEn : receipt.honestyNoteKo}`);
  return lines.join("\n");
}
