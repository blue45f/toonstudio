/**
 * Wave 60A — ToonStudio 10대 고유 브랜드 네이밍 정본 및 외부 명칭 혼입 자동 감사 엔진.
 *
 * - 실측 기준: 2026-11-26 (커밋 5314c62f8), crates/ · packages/ · apps/web/src/domains/creator/
 * - 10대 고유 포멀 브랜드 정본(ToonCore · SpectrumCompute · InkRaster · AtelierSolid ·
 *   AtelierCast · AtelierStage · PrismLight · LoomSync · KilnExport · CalmChrome)
 * - 실시간 파일명·패키지명·심볼명·UI 라벨 감사기(/compare/studio 및 Cargo.toml 예외 정확 구분)
 * - 무중단 4단계 레거시 전환 로드맵 + ADR Markdown 및 Registry JSON 내보내기
 */

export const BRAND_REGISTRY_SCHEMA_VERSION = "toonstudio.brand-registry.v1" as const;
export const BRAND_REGISTRY_MEASURED_AT = "2026-11-26" as const;
export const BRAND_REGISTRY_BASELINE_COMMIT = "5314c62f8" as const;

export type ProprietaryBrandId =
  | "toon-core" | "spectrum-compute" | "ink-raster" | "atelier-solid" | "atelier-cast"
  | "atelier-stage" | "prism-light" | "loom-sync" | "kiln-export" | "calm-chrome";

export type BrandArchitectureLayerId =
  | "core-runtime" | "compute-render" | "spatial-3d" | "collab-delivery" | "experience-system";

export type AuditInputContext =
  | "auto" | "file-path" | "package-name" | "symbol-name"
  | "ui-label" | "compare-surface" | "crate-dependency" | "interop-codec";

export type BrandAuditVerdict =
  | "clean" | "allowed-external-reference" | "warn-consolidation-target" | "blocked-external-brand";

export type ExternalReferenceExemptionReason =
  | "official-compare-surface" | "crate-dependency-manifest" | "format-interop-codec";

export type DetectionRuleCategory = "external-library" | "competitor-product" | "legacy-surface-split";

export type MigrationPhaseId =
  | "phase-1-guard-and-facade" | "phase-2-creator-domain-rehome"
  | "phase-3-workspace-packages" | "phase-4-rust-crates-alias";

export type RepositoryScanRootId = "crates" | "packages" | "creator-domain";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }

export interface BrandArchitectureLayerSpec {
  readonly id: BrandArchitectureLayerId; readonly order: number;
  readonly titleKo: string; readonly titleEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly accentOklch: OklchColor;
}

export interface ProprietaryBrandSpec {
  readonly id: ProprietaryBrandId; readonly order: number;
  readonly formalName: string; readonly slug: string; readonly cratePrefix: string;
  readonly layerId: BrandArchitectureLayerId;
  readonly taglineKo: string; readonly taglineEn: string;
  readonly scopeKo: string; readonly scopeEn: string;
  readonly canonicalAnchorPath: string;
  readonly consolidationNoteKo?: string; readonly consolidationNoteEn?: string;
  readonly accentOklch: OklchColor;
}

export interface ExternalNameDetectionRule {
  readonly ruleId: string; readonly category: DetectionRuleCategory; readonly severity: "block" | "warn";
  readonly tokens: readonly string[]; readonly targetBrandId: ProprietaryBrandId; readonly targetSlugHint: string;
  readonly rationaleKo: string; readonly rationaleEn: string;
  readonly supportsSecurityDisambiguation?: boolean;
}

export interface AllowedExternalReferenceScope {
  readonly reason: ExternalReferenceExemptionReason;
  readonly titleKo: string; readonly titleEn: string;
  readonly matchExamples: readonly string[];
  readonly policyKo: string; readonly policyEn: string;
}

export interface RepositoryScanRootMeasurement {
  readonly id: RepositoryScanRootId; readonly rootPath: string;
  readonly labelKo: string; readonly labelEn: string;
  readonly scannedDirs: number; readonly scannedFiles: number;
  readonly matchedDirs: number; readonly matchedFiles: number;
  readonly vendoredExemptDirs: number; readonly securityAcronymFalsePositives: number;
  readonly notesKo: string; readonly notesEn: string;
}

export interface RepositoryScanSummary {
  readonly measuredAt: typeof BRAND_REGISTRY_MEASURED_AT;
  readonly baselineCommitShort: typeof BRAND_REGISTRY_BASELINE_COMMIT;
  readonly scanMethod: "segment-token-filesystem-scan";
  readonly totalScannedDirs: number; readonly totalScannedFiles: number;
  readonly totalMatchedDirs: number; readonly totalMatchedFiles: number;
  readonly totalVendoredExemptDirs: number; readonly totalSecurityAcronymFalsePositives: number;
}

export interface MigrationPhaseSpec {
  readonly id: MigrationPhaseId; readonly order: number;
  readonly titleKo: string; readonly titleEn: string;
  readonly safetyGuaranteeKo: string; readonly safetyGuaranteeEn: string;
  readonly gateCommand: string;
}

export interface LegacyPathMigrationEntry {
  readonly id: string; readonly rootId: RepositoryScanRootId; readonly legacyPath: string;
  readonly entryKind: "directory" | "file-cluster" | "vendor-isolation";
  readonly measuredFileCount: number; readonly targetBrandId: ProprietaryBrandId;
  readonly canonicalTargetPath: string; readonly phaseId: MigrationPhaseId;
  readonly disposition: "migrate-via-facade" | "consolidate-surface" | "keep-vendor-exempt" | "scope-as-interop-codec";
  readonly strategyKo: string; readonly strategyEn: string;
}

export interface BrandAuditSampleProbe {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly query: string; readonly context: AuditInputContext; readonly expectedVerdict: BrandAuditVerdict;
}

export interface BrandAuditOptions { readonly context?: AuditInputContext; }

export interface BrandNamingFinding {
  readonly ruleId: string; readonly matchedToken: string;
  readonly category: DetectionRuleCategory; readonly severity: "block" | "warn";
  readonly recommendedBrandId: ProprietaryBrandId; readonly recommendedBrandName: string; readonly recommendedSlug: string;
  readonly rationaleKo: string; readonly rationaleEn: string;
}

export interface BrandNamingAuditResult {
  readonly input: string; readonly normalizedInput: string;
  readonly resolvedContext: Exclude<AuditInputContext, "auto">;
  readonly verdict: BrandAuditVerdict; readonly isBlocked: boolean; readonly isAllowedException: boolean;
  readonly exemptionReason: ExternalReferenceExemptionReason | null;
  readonly securityAcronymDisambiguated: boolean;
  readonly findings: readonly BrandNamingFinding[];
  readonly referencedProprietaryBrandIds: readonly ProprietaryBrandId[];
  readonly primaryRecommendedBrandId: ProprietaryBrandId | null;
  readonly suggestedCanonicalName: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly advisoryNotesKo: readonly string[]; readonly advisoryNotesEn: readonly string[];
}

export interface BrandBatchAuditSummary {
  readonly total: number; readonly cleanCount: number; readonly allowedExceptionCount: number;
  readonly warnCount: number; readonly blockedCount: number;
  readonly results: readonly BrandNamingAuditResult[];
}

export interface MigrationFilterOptions {
  readonly phaseId?: MigrationPhaseId | "all";
  readonly brandId?: ProprietaryBrandId | "all";
  readonly rootId?: RepositoryScanRootId | "all";
}

export interface BrandGovernanceExportOptions {
  readonly latestAudit?: BrandNamingAuditResult;
  readonly selectedBrandId?: ProprietaryBrandId | "all";
  readonly selectedPhaseId?: MigrationPhaseId | "all";
}

export interface BrandRegistryExportPayload {
  readonly schemaVersion: typeof BRAND_REGISTRY_SCHEMA_VERSION;
  readonly measuredAt: typeof BRAND_REGISTRY_MEASURED_AT;
  readonly baselineCommitShort: typeof BRAND_REGISTRY_BASELINE_COMMIT;
  readonly policyStatement: string;
  readonly scanSummary: RepositoryScanSummary;
  readonly scanRoots: readonly RepositoryScanRootMeasurement[];
  readonly layers: readonly BrandArchitectureLayerSpec[];
  readonly proprietaryBrands: readonly ProprietaryBrandSpec[];
  readonly allowedReferenceScopes: readonly AllowedExternalReferenceScope[];
  readonly detectionRuleCount: number;
  readonly migrationPhases: readonly MigrationPhaseSpec[];
  readonly migrationEntries: readonly LegacyPathMigrationEntry[];
  readonly latestAudit: BrandNamingAuditResult | null;
}

export interface BrandRegistryExportBundle {
  readonly payload: BrandRegistryExportPayload;
  readonly json: string;
}

const VIOLET_SLOP_MIN_HUE = 270;
const VIOLET_SLOP_MAX_HUE = 320;
const SAFE_FALLBACK_HUE = 228;

export function isVioletSlopHue(hue: number): boolean {
  const normalized = ((hue % 360) + 360) % 360;
  return normalized >= VIOLET_SLOP_MIN_HUE && normalized <= VIOLET_SLOP_MAX_HUE;
}

export function sanitizeNonVioletHue(hue: number): number {
  const normalized = Math.round((((hue % 360) + 360) % 360) * 10) / 10;
  return isVioletSlopHue(normalized) ? SAFE_FALLBACK_HUE : normalized;
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = Math.min(1, Math.max(0, color.l));
  const c = Math.min(0.4, Math.max(0, color.c));
  const h = sanitizeNonVioletHue(color.h);
  if (alpha !== undefined) {
    return `oklch(${l} ${c} ${h} / ${Math.min(1, Math.max(0, alpha)).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

export const BRAND_ARCHITECTURE_LAYERS: readonly BrandArchitectureLayerSpec[] = [
  { id: "core-runtime", order: 1, titleKo: "L1 · 네이티브 WASM64 코어", titleEn: "L1 · Native WASM64 Core", summaryKo: "브러시·타일·물리 커널의 단일 실행권", summaryEn: "Single execution authority for brush, tile, and physics kernels", accentOklch: { l: 0.52, c: 0.14, h: 228 } },
  { id: "compute-render", order: 2, titleKo: "L2 · 컴퓨트 · 래스터 · 광학 렌더링", titleEn: "L2 · Compute, Raster & Optical Render", summaryKo: "WebGPU 6단계 파이프라인, 안료 물리, 전역 조명", summaryEn: "WebGPU 6-stage compute, pigment raster physics, and GI", accentOklch: { l: 0.54, c: 0.14, h: 196 } },
  { id: "spatial-3d", order: 3, titleKo: "L3 · 3D 조형 · 캐릭터 · 가상 작업실", titleEn: "L3 · Spatial 3D, Cast & Stage", summaryKo: "파라메트릭 3D, 통합 캐릭터 스튜디오, 공간 음향 씬", summaryEn: "Parametric 3D solids, unified character studio, and spatial stage", accentOklch: { l: 0.55, c: 0.13, h: 158 } },
  { id: "collab-delivery", order: 4, titleKo: "L4 · 분산 협업 · 로컬 4K 출고", titleEn: "L4 · Distributed Sync & Local 4K Delivery", summaryKo: "HLC CRDT 타일 동기화, WebCodecs 출고, C2PA 증명", summaryEn: "HLC CRDT tile sync, local WebCodecs export, and C2PA provenance", accentOklch: { l: 0.55, c: 0.14, h: 42 } },
  { id: "experience-system", order: 5, titleKo: "L5 · 아틀리에 경험 · 브랜드 거버넌스", titleEn: "L5 · Atelier Experience & Governance", summaryKo: "96% 몰입 캔버스와 0-용어 디자인·네이밍 규율", summaryEn: "96% canvas immersion with zero-jargon design and naming guards", accentOklch: { l: 0.5, c: 0.11, h: 242 } },
] as const;

export const TOONSTUDIO_PROPRIETARY_BRANDS: readonly ProprietaryBrandSpec[] = [
  { id: "toon-core", order: 1, formalName: "ToonCore", slug: "toon-core", cratePrefix: "toon-core", layerId: "core-runtime", taglineKo: "통합 Rust WASM64 드로잉·물리 코어", taglineEn: "Unified Rust WASM64 Drawing & Physics Core", scopeKo: "타일 합성, 브러시 커널, SIMD BVH 스키닝, 가상 3D 물리 FFI", scopeEn: "Tile compositing, brush kernels, SIMD BVH skinning, and 3D physics FFI", canonicalAnchorPath: "crates/studio-wasm64-drawing-core", accentOklch: { l: 0.52, c: 0.14, h: 228 } },
  { id: "spectrum-compute", order: 2, formalName: "SpectrumCompute", slug: "spectrum-compute", cratePrefix: "toon-spectrum-compute", layerId: "compute-render", taglineKo: "멀티코어·WebGPU 6단계 컴퓨트 파이프라인", taglineEn: "Multicore & WebGPU 6-Stage Compute Pipeline", scopeKo: "벡터·경로 래스터화, 멀티코어 스케줄링, WebGPU 렌더 백엔드 통합", scopeEn: "Vector path compute, multicore scheduling, and unified GPU render backends", canonicalAnchorPath: "apps/web/src/domains/creator/spectrum-compute-scheduler", accentOklch: { l: 0.54, c: 0.14, h: 196 } },
  { id: "ink-raster", order: 3, formalName: "InkRaster", slug: "ink-raster", cratePrefix: "toon-ink-raster", layerId: "compute-render", taglineKo: "고해상도 래스터·질감·안료 물리 엔진", taglineEn: "High-Resolution Raster, Paper Grain & Pigment Physics Engine", scopeKo: "혼색 안료 물리, 습식 종이 높이맵, 필압 브러시, 래스터 보정 필터", scopeEn: "Spectral pigment mixing, wet-paper heightmaps, brush dynamics, and raster filters", canonicalAnchorPath: "apps/web/src/domains/creator/ink-raster-atelier", accentOklch: { l: 0.53, c: 0.15, h: 28 } },
  { id: "atelier-solid", order: 4, formalName: "AtelierSolid", slug: "atelier-solid", cratePrefix: "toon-atelier-solid", layerId: "spatial-3d", taglineKo: "파라메트릭 3D 조형·구속조건 스케치·도면 엔진", taglineEn: "Parametric 3D Solid Modeling, Constraint Sketch & Drafting Engine", scopeKo: "구속조건 스케치, 돌출·필렛 솔리드 연산, 웹툰 소품·배경 도면 추출", scopeEn: "Constraint sketching, extrude/fillet solid ops, and technical prop blueprints", canonicalAnchorPath: "apps/web/src/domains/creator/atelier-solid-cad", accentOklch: { l: 0.55, c: 0.13, h: 158 } },
  { id: "atelier-cast", order: 5, formalName: "AtelierCast", slug: "atelier-cast", cratePrefix: "toon-atelier-cast", layerId: "spatial-3d", taglineKo: "통합 3D 캐릭터 조형·리깅·표정 스튜디오", taglineEn: "Unified 3D Character Sculpting, Rigging & Expression Studio", scopeKo: "캐릭터 바디·헤어·리깅·표정 파이프라인 및 character-lab 통합 정본", scopeEn: "Character body, hair, rigging, expression studio, and character-lab consolidation target", canonicalAnchorPath: "apps/web/src/domains/creator/atelier-cast", consolidationNoteKo: "분산된 character-lab / character-shaper 표면을 AtelierCast 단일 브랜드로 수렴합니다.", consolidationNoteEn: "Consolidates fragmented character-lab and character-shaper surfaces under AtelierCast.", accentOklch: { l: 0.57, c: 0.14, h: 58 } },
  { id: "atelier-stage", order: 6, formalName: "AtelierStage", slug: "atelier-stage", cratePrefix: "toon-atelier-stage", layerId: "spatial-3d", taglineKo: "가상 작업실 2.5D/3D 물리·공간 음향 엔진", taglineEn: "Virtual Atelier 2.5D/3D Physics & Spatial Audio Stage", scopeKo: "3D 배경 스테이징, 카메라 구도, 천·소품 물리, 공간 폴리 음향 연출", scopeEn: "3D scene staging, camera composition, cloth/prop physics, and spatial foley", canonicalAnchorPath: "apps/web/src/domains/creator/atelier-stage", accentOklch: { l: 0.54, c: 0.13, h: 175 } },
  { id: "prism-light", order: 7, formalName: "PrismLight", slug: "prism-light", cratePrefix: "toon-prism-light", layerId: "compute-render", taglineKo: "WebGPU 전역 조명·SDF 그림자·광학 림라이트", taglineEn: "WebGPU Global Illumination, SDF Shadows & Optical Rim Light", scopeKo: "Radiance Cascades 광원 계산, SDF 소프트 섀도우, 컷별 림라이트 연출", scopeEn: "Radiance Cascades GI, signed-distance shadows, and per-cut optical rim lighting", canonicalAnchorPath: "apps/web/src/domains/creator/webgpu-radiance-cascades", accentOklch: { l: 0.6, c: 0.14, h: 78 } },
  { id: "loom-sync", order: 8, formalName: "LoomSync", slug: "loom-sync", cratePrefix: "toon-loom-sync", layerId: "collab-delivery", taglineKo: "분산 HLC CRDT 타일 델타 협업 동기화", taglineEn: "Distributed HLC CRDT Tile-Delta Collaboration Sync", scopeKo: "실시간 동시 작화, HLC 인과 정렬, 타일 단위 오프라인 병합 및 복구", scopeEn: "Live co-drawing, HLC causal ordering, tile-level delta sync, and offline merge", canonicalAnchorPath: "apps/web/src/domains/creator/loom-sync", accentOklch: { l: 0.54, c: 0.13, h: 212 } },
  { id: "kiln-export", order: 9, formalName: "KilnExport", slug: "kiln-export", cratePrefix: "toon-kiln-export", layerId: "collab-delivery", taglineKo: "로컬 WebCodecs 4K 출고·C2PA 작화 증명", taglineEn: "Local WebCodecs 4K Export & C2PA Authorship Provenance", scopeKo: "무손실 4K 영상·컷 출고, C2PA 인간 작화 원장, Rights BOM 출고 검증", scopeEn: "Local WebCodecs 4K delivery, C2PA human-ink ledger, and Rights BOM preflight", canonicalAnchorPath: "apps/web/src/domains/creator/kiln-export", accentOklch: { l: 0.55, c: 0.14, h: 42 } },
  { id: "calm-chrome", order: 10, formalName: "CalmChrome", slug: "calm-chrome", cratePrefix: "toon-calm-chrome", layerId: "experience-system", taglineKo: "96% 몰입·0-용어 아틀리에 디자인 시스템", taglineEn: "96% Canvas Immersion & Zero-Jargon Atelier Design System", scopeKo: "시맨틱 OKLCH 토큰, 44px 터치 타깃, 무-용어 UX 카피, 브랜드 네이밍 가드", scopeEn: "Semantic OKLCH tokens, 44px touch targets, zero-jargon UX copy, and brand guards", canonicalAnchorPath: "apps/web/src/domains/creator/atelier-brand-registry", accentOklch: { l: 0.5, c: 0.11, h: 242 } },
] as const;

// 외부 라이브러리·경쟁사 탐지 패턴은 오직 이 감사 규칙 테이블에만 정의한다.
export const EXTERNAL_NAME_DETECTION_RULES: readonly ExternalNameDetectionRule[] = [
  { ruleId: "EXT-01", category: "external-library", severity: "block", tokens: ["vello"], targetBrandId: "spectrum-compute", targetSlugHint: "spectrum-compute", rationaleKo: "외부 GPU 렌더 크레이트 명칭 대신 고유 브랜드 SpectrumCompute를 사용해야 합니다.", rationaleEn: "Use proprietary brand SpectrumCompute instead of an external GPU renderer name." },
  { ruleId: "EXT-02", category: "external-library", severity: "block", tokens: ["hokusai"], targetBrandId: "ink-raster", targetSlugHint: "ink-raster", rationaleKo: "외부 래스터 엔진 명칭 대신 고유 브랜드 InkRaster를 사용해야 합니다.", rationaleEn: "Use proprietary brand InkRaster instead of an external raster library name." },
  { ruleId: "EXT-03", category: "external-library", severity: "block", tokens: ["skia"], targetBrandId: "spectrum-compute", targetSlugHint: "spectrum-compute", rationaleKo: "외부 2D 그래픽스 라이브러리 명칭 대신 고유 브랜드 SpectrumCompute를 사용해야 합니다.", rationaleEn: "Use proprietary brand SpectrumCompute instead of an external 2D graphics engine name." },
  { ruleId: "EXT-04", category: "external-library", severity: "block", tokens: ["thorvg"], targetBrandId: "spectrum-compute", targetSlugHint: "spectrum-compute", rationaleKo: "외부 벡터 렌더 라이브러리 명칭 대신 고유 브랜드 SpectrumCompute를 사용해야 합니다.", rationaleEn: "Use proprietary brand SpectrumCompute instead of an external vector library name." },
  { ruleId: "EXT-05", category: "competitor-product", severity: "block", tokens: ["csp", "clip-studio", "clipstudio"], targetBrandId: "ink-raster", targetSlugHint: "ink-raster", rationaleKo: "경쟁 일러스트 소프트웨어 약어 대신 InkRaster 또는 AtelierCast 고유 명칭을 사용해야 합니다.", rationaleEn: "Use InkRaster or AtelierCast instead of a competitor illustration suite acronym.", supportsSecurityDisambiguation: true },
  { ruleId: "EXT-06", category: "competitor-product", severity: "block", tokens: ["shapr3d"], targetBrandId: "atelier-solid", targetSlugHint: "atelier-solid", rationaleKo: "외부 CAD 제품명 대신 파라메트릭 3D 고유 브랜드 AtelierSolid를 사용해야 합니다.", rationaleEn: "Use proprietary parametric 3D brand AtelierSolid instead of an external CAD product name." },
  { ruleId: "EXT-07", category: "competitor-product", severity: "block", tokens: ["procreate"], targetBrandId: "ink-raster", targetSlugHint: "ink-raster", rationaleKo: "외부 태블릿 드로잉 앱 명칭 대신 고유 브랜드 InkRaster를 사용해야 합니다.", rationaleEn: "Use proprietary brand InkRaster instead of an external tablet drawing app name." },
  { ruleId: "EXT-08", category: "competitor-product", severity: "block", tokens: ["photoshop"], targetBrandId: "ink-raster", targetSlugHint: "ink-raster", rationaleKo: "외부 이미지 편집 제품명 대신 고유 브랜드 InkRaster를 사용해야 합니다.", rationaleEn: "Use proprietary brand InkRaster instead of an external image-editing product name." },
  { ruleId: "EXT-09", category: "competitor-product", severity: "block", tokens: ["magma"], targetBrandId: "loom-sync", targetSlugHint: "loom-sync", rationaleKo: "외부 협업 드로잉 서비스명 대신 고유 브랜드 LoomSync를 사용해야 합니다.", rationaleEn: "Use proprietary brand LoomSync instead of an external collaborative drawing app name." },
  { ruleId: "EXT-10", category: "competitor-product", severity: "block", tokens: ["rebelle"], targetBrandId: "ink-raster", targetSlugHint: "ink-raster", rationaleKo: "외부 습식 물감 앱 명칭 대신 안료 물리 고유 브랜드 InkRaster를 사용해야 합니다.", rationaleEn: "Use proprietary pigment engine brand InkRaster instead of an external wet-media product name." },
  { ruleId: "EXT-11", category: "competitor-product", severity: "block", tokens: ["blender"], targetBrandId: "atelier-stage", targetSlugHint: "atelier-stage", rationaleKo: "외부 3D DCC 제품명 대신 가상 작업실 고유 브랜드 AtelierStage를 사용해야 합니다.", rationaleEn: "Use proprietary 3D staging brand AtelierStage instead of an external 3D DCC name." },
  { ruleId: "CONSOL-01", category: "legacy-surface-split", severity: "warn", tokens: ["character-lab", "charlab"], targetBrandId: "atelier-cast", targetSlugHint: "atelier-cast", rationaleKo: "분리된 캐릭터 실험실 경로는 통합 캐릭터 스튜디오 정본 AtelierCast로 수렴합니다.", rationaleEn: "Consolidate separate character-lab surface naming into unified AtelierCast." },
] as const;

export const ALLOWED_EXTERNAL_REFERENCE_SCOPES: readonly AllowedExternalReferenceScope[] = [
  { reason: "official-compare-surface", titleKo: "공식 제작 도구 비교 표면 (/compare/studio)", titleEn: "Official Comparison Surface (/compare/studio)", matchExamples: ["/compare/studio", "apps/web/src/domains/showcase/StudioCompetitorBenchmarkPage.tsx", "apps/web/src/domains/showcase/DeepDomainCompareTabsSection.tsx"], policyKo: "공개 스펙 대조표와 비교 페이지에서 타사 제품명을 사실 비교 목적에 한해 허용합니다.", policyEn: "Permits third-party product names strictly inside factual public spec comparison tables." },
  { reason: "crate-dependency-manifest", titleKo: "Cargo.toml 의존성 선언 및 벤더 업스트림 격리", titleEn: "Cargo.toml Dependency Manifests & Vendored Upstreams", matchExamples: ["crates/studio-engine-vello/Cargo.toml", "Cargo.lock", "crates/vendor/vello-hybrid/Cargo.toml"], policyKo: "Rust 외부 크레이트 의존성 선언, 락파일, 라이선스 고지 및 crates/vendor/ 업스트림 포크는 출처 보존을 위해 예외로 구분합니다.", policyEn: "Exempts Rust crate manifests, lockfiles, license notices, and crates/vendor upstream forks to preserve provenance." },
  { reason: "format-interop-codec", titleKo: "외부 파일 포맷 호환 코덱 경계 (명시 컨텍스트)", titleEn: "External File-Format Interop Codec Boundary (Explicit Context)", matchExamples: ["packages/studio-format-gateway/"], policyKo: "입출력 파일 포맷 파서로 명시 검토된 경우에만 호환 경계로 기록하며, UI·제품명 노출은 계속 차단합니다.", policyEn: "Recorded as interop scope only when explicitly audited as an I/O codec; UI product naming remains blocked." },
] as const;

// 2026-11-26 (커밋 5314c62f8) 셸 실측 스캔 기준치 — 허위 추정치 0건.
export const REPOSITORY_SCAN_ROOTS: readonly RepositoryScanRootMeasurement[] = [
  { id: "crates", rootPath: "crates/", labelKo: "Rust 코어 크레이트", labelEn: "Rust Core Crates", scannedDirs: 53, scannedFiles: 450, matchedDirs: 3, matchedFiles: 10, vendoredExemptDirs: 2, securityAcronymFalsePositives: 0, notesKo: "studio-wasm64-drawing-core(ToonCore)는 오염 0건이며, 매칭 디렉터리 3개 중 2개는 crates/vendor/ 업스트림 포크 격리 영역입니다.", notesEn: "studio-wasm64-drawing-core (ToonCore) is clean; 2 of 3 matched dirs are isolated upstream forks under crates/vendor/." },
  { id: "packages", rootPath: "packages/", labelKo: "공용 워크스페이스 패키지", labelEn: "Shared Workspace Packages", scannedDirs: 73, scannedFiles: 857, matchedDirs: 4, matchedFiles: 50, vendoredExemptDirs: 0, securityAcronymFalsePositives: 0, notesKo: "엔진 어댑터 패키지 4개 디렉터리와 studio-format-gateway 내 포맷 호환 파일 38건이 실측되었습니다.", notesEn: "Measured 4 legacy engine adapter package dirs plus 38 format interop files in studio-format-gateway." },
  { id: "creator-domain", rootPath: "apps/web/src/domains/creator/", labelKo: "Creator 도메인 프런트엔드", labelEn: "Creator Domain Frontend", scannedDirs: 484, scannedFiles: 17140, matchedDirs: 8, matchedFiles: 252, vendoredExemptDirs: 0, securityAcronymFalsePositives: 1, notesKo: "8개 레거시 디렉터리와 252개 파일(보안 헤더 worker-csp 테스트 1건 제외 시 실오염 251건)을 실측했습니다.", notesEn: "Measured 8 legacy directories and 252 matched files (251 after excluding 1 Content-Security-Policy worker test)." },
] as const;

export const REPOSITORY_SCAN_SUMMARY: RepositoryScanSummary = {
  measuredAt: BRAND_REGISTRY_MEASURED_AT,
  baselineCommitShort: BRAND_REGISTRY_BASELINE_COMMIT,
  scanMethod: "segment-token-filesystem-scan",
  totalScannedDirs: REPOSITORY_SCAN_ROOTS.reduce((sum, r) => sum + r.scannedDirs, 0),
  totalScannedFiles: REPOSITORY_SCAN_ROOTS.reduce((sum, r) => sum + r.scannedFiles, 0),
  totalMatchedDirs: REPOSITORY_SCAN_ROOTS.reduce((sum, r) => sum + r.matchedDirs, 0),
  totalMatchedFiles: REPOSITORY_SCAN_ROOTS.reduce((sum, r) => sum + r.matchedFiles, 0),
  totalVendoredExemptDirs: REPOSITORY_SCAN_ROOTS.reduce((sum, r) => sum + r.vendoredExemptDirs, 0),
  totalSecurityAcronymFalsePositives: REPOSITORY_SCAN_ROOTS.reduce((sum, r) => sum + r.securityAcronymFalsePositives, 0),
};

export const MIGRATION_PHASES: readonly MigrationPhaseSpec[] = [
  { id: "phase-1-guard-and-facade", order: 1, titleKo: "1단계 · 신규 오염 차단 & 고유 파사드 신설", titleEn: "Phase 1 · Block New Drift & Add Proprietary Facades", safetyGuaranteeKo: "기존 파일·크레이트 이름 변경 없이 PR 게이트와 고유 파사드 export를 우선 가동합니다.", safetyGuaranteeEn: "Activates PR lint gates and proprietary facade exports with zero existing path renames.", gateCommand: "pnpm exec vitest run apps/web/src/domains/creator/atelier-brand-registry/atelier-brand-registry.test.tsx" },
  { id: "phase-2-creator-domain-rehome", order: 2, titleKo: "2단계 · Creator 도메인 경로·표면 정본화", titleEn: "Phase 2 · Creator Domain Surface Rehoming", safetyGuaranteeKo: "기존 import 호출자가 깨지지 않도록 배럴 재수출 호환 브리지를 둔 뒤 단계적으로 이전합니다.", safetyGuaranteeEn: "Rehomes creator modules behind barrel re-export bridges to preserve zero-breakage imports.", gateCommand: "pnpm exec eslint --max-warnings=0 apps/web/src/domains/creator/<target-module>" },
  { id: "phase-3-workspace-packages", order: 3, titleKo: "3단계 · 워크스페이스 패키지·코덱 경계 정리", titleEn: "Phase 3 · Workspace Package & Codec Boundary Cleanup", safetyGuaranteeKo: "WASM SHA-256 무결성 게이트와 포맷 게이트웨이 호환 테스트를 유지하며 어댑터를 캡슐화합니다.", safetyGuaranteeEn: "Encapsulates package adapters while keeping WASM SHA-256 gates and format tests green.", gateCommand: "pnpm validate:architecture" },
  { id: "phase-4-rust-crates-alias", order: 4, titleKo: "4단계 · Rust 크레이트 별칭 전환 & 벤더 격리 확정", titleEn: "Phase 4 · Rust Crate Alias Switch & Vendor Isolation", safetyGuaranteeKo: "Cargo.toml 패키지 별칭으로 무중단 전환하고 crates/vendor/ 업스트림 라이선스 출처는 보존합니다.", safetyGuaranteeEn: "Switches via Cargo.toml package aliases while keeping crates/vendor upstream notices intact.", gateCommand: "cargo test --manifest-path crates/studio-wasm64-drawing-core/Cargo.toml" },
] as const;

export const LEGACY_PATH_MIGRATION_ENTRIES: readonly LegacyPathMigrationEntry[] = [
  { id: "MIG-CRATE-01", rootId: "crates", legacyPath: "crates/studio-engine-vello", entryKind: "directory", measuredFileCount: 48, targetBrandId: "spectrum-compute", canonicalTargetPath: "crates/toon-spectrum-compute", phaseId: "phase-4-rust-crates-alias", disposition: "migrate-via-facade", strategyKo: "Cargo.toml 별칭과 pkg 무결성 SHA-256 동시 갱신으로 무중단 전환", strategyEn: "Switch via Cargo.toml alias alongside deterministic WASM SHA-256 rebuild" },
  { id: "MIG-CRATE-02", rootId: "crates", legacyPath: "crates/vendor/vello-hybrid", entryKind: "vendor-isolation", measuredFileCount: 37, targetBrandId: "spectrum-compute", canonicalTargetPath: "crates/vendor/vello-hybrid (격리 예외 유지)", phaseId: "phase-4-rust-crates-alias", disposition: "keep-vendor-exempt", strategyKo: "업스트림 Apache/MIT 라이선스·패치 이력 보존을 위해 벤더 디렉터리 예외 유지", strategyEn: "Keep under crates/vendor/ exemption to preserve upstream Apache/MIT provenance" },
  { id: "MIG-CRATE-03", rootId: "crates", legacyPath: "crates/vendor/vello-svg", entryKind: "vendor-isolation", measuredFileCount: 16, targetBrandId: "spectrum-compute", canonicalTargetPath: "crates/vendor/vello-svg (격리 예외 유지)", phaseId: "phase-4-rust-crates-alias", disposition: "keep-vendor-exempt", strategyKo: "업스트림 SVG 파서 포크 출처 보존을 위해 벤더 격리 예외 유지", strategyEn: "Retain under crates/vendor/ isolation for upstream license provenance" },
  { id: "MIG-PKG-01", rootId: "packages", legacyPath: "packages/studio-engine-vello", entryKind: "directory", measuredFileCount: 29, targetBrandId: "spectrum-compute", canonicalTargetPath: "packages/toon-spectrum-compute", phaseId: "phase-3-workspace-packages", disposition: "migrate-via-facade", strategyKo: "SpectrumCompute 파사드 패키지에서 기존 어댑터를 위임 노출 후 전환", strategyEn: "Delegate through SpectrumCompute facade package before deprecating legacy alias" },
  { id: "MIG-PKG-02", rootId: "packages", legacyPath: "packages/studio-hokusai-wasm", entryKind: "directory", measuredFileCount: 19, targetBrandId: "ink-raster", canonicalTargetPath: "packages/toon-ink-raster-wasm", phaseId: "phase-3-workspace-packages", disposition: "migrate-via-facade", strategyKo: "InkRaster WASM 파사드 도입 및 pkg/INTEGRITY.sha256 검증 동기화", strategyEn: "Introduce InkRaster WASM facade and keep pkg/INTEGRITY.sha256 verified" },
  { id: "MIG-PKG-03", rootId: "packages", legacyPath: "packages/studio-engine-skia", entryKind: "directory", measuredFileCount: 28, targetBrandId: "spectrum-compute", canonicalTargetPath: "packages/toon-spectrum-compute/adapters/canvas2d-backend", phaseId: "phase-3-workspace-packages", disposition: "migrate-via-facade", strategyKo: "SpectrumCompute 내부 백엔드 어댑터로 캡슐화하여 상위 도메인 노출 차단", strategyEn: "Encapsulate as internal SpectrumCompute backend adapter with zero upper-layer leak" },
  { id: "MIG-PKG-04", rootId: "packages", legacyPath: "packages/studio-engine-thorvg", entryKind: "directory", measuredFileCount: 13, targetBrandId: "spectrum-compute", canonicalTargetPath: "packages/toon-spectrum-compute/adapters/vector-backend", phaseId: "phase-3-workspace-packages", disposition: "migrate-via-facade", strategyKo: "SpectrumCompute 벡터 어댑터 하위 모듈로 격리", strategyEn: "Isolate under SpectrumCompute vector backend adapter boundary" },
  { id: "MIG-PKG-05", rootId: "packages", legacyPath: "packages/studio-format-gateway/src/{csp-*,procreate-*}", entryKind: "file-cluster", measuredFileCount: 38, targetBrandId: "kiln-export", canonicalTargetPath: "packages/studio-format-gateway/src/interop-codecs/", phaseId: "phase-3-workspace-packages", disposition: "scope-as-interop-codec", strategyKo: "외부 파일 입출력 호환 코덱 하위 디렉터리로 경계 명시(UI 제품명 노출 금지)", strategyEn: "Scope under interop-codecs directory for file I/O compatibility only" },
  { id: "MIG-CREATOR-01", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/multicore-gpu-vello-scheduler", entryKind: "directory", measuredFileCount: 4, targetBrandId: "spectrum-compute", canonicalTargetPath: "apps/web/src/domains/creator/spectrum-compute-scheduler", phaseId: "phase-2-creator-domain-rehome", disposition: "migrate-via-facade", strategyKo: "신규 고유 경로 생성 후 기존 index.ts에서 1회 릴리스 동안 재수출 유지", strategyEn: "Create canonical directory and maintain barrel re-export bridge for one cycle" },
  { id: "MIG-CREATOR-02", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/shapr3d-parametric-cad", entryKind: "directory", measuredFileCount: 5, targetBrandId: "atelier-solid", canonicalTargetPath: "apps/web/src/domains/creator/atelier-solid-cad", phaseId: "phase-2-creator-domain-rehome", disposition: "migrate-via-facade", strategyKo: "AtelierSolid 정본 경로로 모듈·패널 이동 및 호환 브리지 제공", strategyEn: "Move parametric CAD engine and panel to AtelierSolid canonical directory" },
  { id: "MIG-CREATOR-03", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/photoshop-pro", entryKind: "directory", measuredFileCount: 8, targetBrandId: "ink-raster", canonicalTargetPath: "apps/web/src/domains/creator/ink-raster-imaging", phaseId: "phase-2-creator-domain-rehome", disposition: "migrate-via-facade", strategyKo: "래스터 보정·필터 스위트를 InkRaster 네이밍으로 정본화", strategyEn: "Rehome raster adjustment suite under InkRaster canonical naming" },
  { id: "MIG-CREATOR-04", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/charlab-csp-surpass", entryKind: "directory", measuredFileCount: 11, targetBrandId: "atelier-cast", canonicalTargetPath: "apps/web/src/domains/creator/atelier-cast/pose-drawing-suite", phaseId: "phase-2-creator-domain-rehome", disposition: "consolidate-surface", strategyKo: "별도 character-lab · character-shaper 계보를 AtelierCast 단일 스튜디오로 통합", strategyEn: "Consolidate separate character-lab and character-shaper lineage into AtelierCast" },
  { id: "MIG-CREATOR-05", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/{csp-brush-atelier,csp-puppet-warp,filter/csp-rea}", entryKind: "file-cluster", measuredFileCount: 14, targetBrandId: "ink-raster", canonicalTargetPath: "apps/web/src/domains/creator/ink-raster-atelier/", phaseId: "phase-2-creator-domain-rehome", disposition: "migrate-via-facade", strategyKo: "브러시·퍼펫 워프·필터 레거시 폴더를 InkRaster 정본 하위 모듈로 재배치", strategyEn: "Rehome brush, puppet warp, and filter folders into InkRaster canonical modules" },
  { id: "MIG-CREATOR-06", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/csp-watermark-velocity", entryKind: "directory", measuredFileCount: 4, targetBrandId: "kiln-export", canonicalTargetPath: "apps/web/src/domains/creator/kiln-export/provenance-watermark", phaseId: "phase-2-creator-domain-rehome", disposition: "migrate-via-facade", strategyKo: "출고 워터마크·증명 기능을 KilnExport C2PA 파이프라인으로 편입", strategyEn: "Move export watermark velocity module into KilnExport C2PA delivery pipeline" },
  { id: "MIG-CREATOR-07", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/bg3d/*blender*", entryKind: "file-cluster", measuredFileCount: 46, targetBrandId: "atelier-stage", canonicalTargetPath: "apps/web/src/domains/creator/atelier-stage/scene-bridge/", phaseId: "phase-2-creator-domain-rehome", disposition: "migrate-via-facade", strategyKo: "3D 스테이징 브리지와 UI 패널 제목에서 외부 DCC 명칭을 제거하고 AtelierStage로 통합", strategyEn: "Remove external 3D DCC names from staging bridges and UI titles under AtelierStage" },
  { id: "MIG-CREATOR-08", rootId: "creator-domain", legacyPath: "apps/web/src/domains/creator/drawing/*{procreate,magma}*", entryKind: "file-cluster", measuredFileCount: 16, targetBrandId: "loom-sync", canonicalTargetPath: "apps/web/src/domains/creator/{ink-raster-atelier,loom-sync}/", phaseId: "phase-1-guard-and-facade", disposition: "migrate-via-facade", strategyKo: "브러시 프리셋은 InkRaster, 협업 브러시 동기화는 LoomSync 파사드로 분리 승격", strategyEn: "Promote brush presets into InkRaster and collaborative stroke sync into LoomSync" },
] as const;

export const BRAND_AUDIT_SAMPLE_PROBES: readonly BrandAuditSampleProbe[] = [
  { id: "probe-clean", labelKo: "고유 정본 통과 예시", labelEn: "Clean Proprietary Example", query: "apps/web/src/domains/creator/atelier-solid-cad/StudioAtelierSolidSketchPanel.tsx", context: "auto", expectedVerdict: "clean" },
  { id: "probe-blocked", labelKo: "외부 명칭 차단 예시", labelEn: "Blocked Legacy Example", query: "apps/web/src/domains/creator/shapr3d-parametric-cad/StudioShapr3dCadPanel.tsx", context: "auto", expectedVerdict: "blocked-external-brand" },
  { id: "probe-compare", labelKo: "/compare/studio 예외", labelEn: "/compare/studio Exemption", query: "/compare/studio?highlight=procreate", context: "auto", expectedVerdict: "allowed-external-reference" },
  { id: "probe-cargo", labelKo: "Cargo.toml 의존성 예외", labelEn: "Cargo.toml Dependency Exemption", query: "crates/studio-engine-vello/Cargo.toml", context: "auto", expectedVerdict: "allowed-external-reference" },
] as const;

const BRAND_BY_ID: Readonly<Record<ProprietaryBrandId, ProprietaryBrandSpec>> =
  TOONSTUDIO_PROPRIETARY_BRANDS.reduce(
    (acc, brand) => {
      acc[brand.id] = brand;
      return acc;
    },
    {} as Record<ProprietaryBrandId, ProprietaryBrandSpec>,
  );

const SECURITY_HEADER_CONTEXT_TOKENS = new Set([
  "worker", "header", "headers", "policy", "nonce", "security", "directive", "meta", "http",
]);

export function getProprietaryBrand(id: ProprietaryBrandId): ProprietaryBrandSpec {
  return BRAND_BY_ID[id] ?? TOONSTUDIO_PROPRIETARY_BRANDS[0];
}

export function getBrandsByLayer(layerId: BrandArchitectureLayerId): readonly ProprietaryBrandSpec[] {
  return TOONSTUDIO_PROPRIETARY_BRANDS.filter((brand) => brand.layerId === layerId);
}

/** camelCase · PascalCase · kebab-case · snake_case · 경로 구분자를 기준으로 토큰 분리. */
export function tokenizeNamingInput(input: string): readonly string[] {
  return input
    .replace(/([a-z])([A-Z])/gu, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1-$2")
    .replace(/([0-9])([A-Z][a-z])/gu, "$1-$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function splitAsciiIdentifierParts(word: string): readonly string[] {
  return word
    .replace(/([a-z])([A-Z])/gu, "$1|$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1|$2")
    .replace(/([0-9])([A-Z][a-z])/gu, "$1|$2")
    .split("|")
    .filter(Boolean);
}

function detectAllowedExemption(
  normalizedInput: string,
  requestedContext: AuditInputContext,
): ExternalReferenceExemptionReason | null {
  if (requestedContext === "compare-surface") return "official-compare-surface";
  if (requestedContext === "crate-dependency") return "crate-dependency-manifest";
  if (requestedContext === "interop-codec") return "format-interop-codec";

  const lower = normalizedInput.toLowerCase();
  if (
    lower.includes("/compare/studio") ||
    lower.includes("domains/showcase/") ||
    lower.includes("comparepage") ||
    lower.includes("competitor-benchmark") ||
    lower.includes("deep-domain-compare")
  ) {
    return "official-compare-surface";
  }

  if (
    /(?:^|[/\\:\s])cargo\.(?:toml|lock)(?:$|[/\\:\s])/iu.test(normalizedInput) ||
    lower.includes("crates/vendor/") ||
    lower.includes("third_party_inventory") ||
    lower.includes("third_party_notices")
  ) {
    return "crate-dependency-manifest";
  }

  return null;
}

function resolveAuditContext(
  normalizedInput: string,
  requestedContext: AuditInputContext,
  exemption: ExternalReferenceExemptionReason | null,
): Exclude<AuditInputContext, "auto"> {
  if (requestedContext !== "auto") return requestedContext;
  if (exemption === "official-compare-surface") return "compare-surface";
  if (exemption === "crate-dependency-manifest") return "crate-dependency";
  if (exemption === "format-interop-codec") return "interop-codec";
  if (normalizedInput.includes("/") || /\.[a-z0-9]{1,5}$/iu.test(normalizedInput)) return "file-path";
  if (normalizedInput.startsWith("@") || /^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(normalizedInput)) return "package-name";
  if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(normalizedInput)) return "symbol-name";
  return "ui-label";
}

function isSecurityPolicyAcronym(normalizedInput: string, tokens: readonly string[]): boolean {
  if (/content[-_\s]*security[-_\s]*policy/iu.test(normalizedInput)) return true;
  const securityRuleTokens = EXTERNAL_NAME_DETECTION_RULES.find((r) => r.supportsSecurityDisambiguation)?.tokens ?? [];
  const primaryAcronym = securityRuleTokens[0];
  return Boolean(primaryAcronym && tokens.includes(primaryAcronym) && tokens.some((tok) => SECURITY_HEADER_CONTEXT_TOKENS.has(tok)));
}

function formatReplacementForStyle(
  sample: string,
  brand: ProprietaryBrandSpec,
  isPathOrPkg: boolean,
  usesUnderscore: boolean,
): string {
  if (/^[A-Z]/u.test(sample)) return brand.formalName;
  if (sample.includes("_") || (usesUnderscore && sample === sample.toLowerCase())) return brand.slug.replace(/-/gu, "_");
  if (sample.includes("-") || isPathOrPkg) return brand.slug;
  return brand.formalName;
}

function buildSuggestedCanonicalName(
  normalizedInput: string,
  findings: readonly BrandNamingFinding[],
  resolvedContext: Exclude<AuditInputContext, "auto">,
): string {
  if (findings.length === 0) return normalizedInput;
  const isPathOrPkg = resolvedContext === "file-path" || resolvedContext === "package-name";
  const usesUnderscore = normalizedInput.includes("_") && !normalizedInput.includes("-");
  const singleTokenMap = new Map<string, ProprietaryBrandSpec>();
  const compoundFindings = findings.filter((f) => f.matchedToken.includes("-"));

  for (const finding of findings) {
    if (!finding.matchedToken.includes("-")) {
      singleTokenMap.set(finding.matchedToken.toLowerCase(), getProprietaryBrand(finding.recommendedBrandId));
    }
  }

  let rewritten = normalizedInput;
  for (const finding of compoundFindings) {
    const brand = getProprietaryBrand(finding.recommendedBrandId);
    const parts = finding.matchedToken.split("-").map((p) => p.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
    const compoundRe = new RegExp(parts.join("[-_\\s]+"), "giu");
    rewritten = rewritten.replace(compoundRe, (matched: string, offset: number, full: string) => {
      const prev = offset > 0 ? full[offset - 1] : "";
      const next = offset + matched.length < full.length ? full[offset + matched.length] : "";
      const validLeft = !prev || /[^A-Za-z0-9]/u.test(prev) || (/[a-z0-9]/u.test(prev) && /^[A-Z]/u.test(matched));
      const validRight = !next || /[^A-Za-z0-9]/u.test(next) || /^[A-Z]/u.test(next);
      return validLeft && validRight ? formatReplacementForStyle(matched, brand, isPathOrPkg, usesUnderscore) : matched;
    });
  }

  const compoundParts = compoundFindings.map((f) => ({
    seq: f.matchedToken.toLowerCase().split("-"),
    brand: getProprietaryBrand(f.recommendedBrandId),
  }));

  rewritten = rewritten.replace(/[A-Za-z0-9]+/gu, (word) => {
    const segs = splitAsciiIdentifierParts(word);
    const out: string[] = [];
    let i = 0;
    while (i < segs.length) {
      let matchedCompound = false;
      for (const cp of compoundParts) {
        if (i + cp.seq.length <= segs.length) {
          const slice = segs.slice(i, i + cp.seq.length);
          if (slice.every((s, idx) => s.toLowerCase() === cp.seq[idx])) {
            out.push(formatReplacementForStyle(slice.join(""), cp.brand, isPathOrPkg, usesUnderscore));
            i += cp.seq.length;
            matchedCompound = true;
            break;
          }
        }
      }
      if (matchedCompound) continue;
      const seg = segs[i];
      const targetBrand = singleTokenMap.get(seg.toLowerCase());
      out.push(targetBrand ? formatReplacementForStyle(seg, targetBrand, isPathOrPkg, usesUnderscore) : seg);
      i += 1;
    }
    return out.join("");
  });

  return rewritten.replace(/-{2,}/gu, "-").replace(/_{2,}/gu, "_").replace(/\s{2,}/gu, " ").trim();
}

function findReferencedProprietaryBrands(tokens: readonly string[], normalizedInput: string): readonly ProprietaryBrandId[] {
  const lower = normalizedInput.toLowerCase();
  const matched: ProprietaryBrandId[] = [];
  for (const brand of TOONSTUDIO_PROPRIETARY_BRANDS) {
    const slugParts = brand.slug.split("-");
    const hasExact = lower.includes(brand.slug) || lower.includes(brand.slug.replace(/-/gu, "_")) || lower.includes(brand.formalName.toLowerCase());
    if (hasExact || slugParts.every((part) => tokens.includes(part))) {
      matched.push(brand.id);
    }
  }
  return matched;
}

export function auditProprietaryBrandNaming(input: string, options?: BrandAuditOptions): BrandNamingAuditResult {
  const normalizedInput = input.trim();
  const requestedContext = options?.context ?? "auto";
  const exemption = detectAllowedExemption(normalizedInput, requestedContext);
  const resolvedContext = resolveAuditContext(normalizedInput, requestedContext, exemption);

  if (normalizedInput.length === 0) {
    return {
      input, normalizedInput: "", resolvedContext, verdict: "clean", isBlocked: false, isAllowedException: false,
      exemptionReason: null, securityAcronymDisambiguated: false, findings: [], referencedProprietaryBrandIds: [],
      primaryRecommendedBrandId: null, suggestedCanonicalName: "",
      summaryKo: "파일명, 패키지명, 심볼명 또는 UI 라벨을 입력하면 브랜드 정본 준수 여부를 즉시 검사합니다.",
      summaryEn: "Enter a file path, package, symbol, or UI label to audit proprietary brand compliance.",
      advisoryNotesKo: [], advisoryNotesEn: [],
    };
  }

  const tokens = tokenizeNamingInput(normalizedInput);
  const lower = normalizedInput.toLowerCase();
  const isSecurityPolicyHeader = isSecurityPolicyAcronym(normalizedInput, tokens);
  const findings: BrandNamingFinding[] = [];
  const advisoryNotesKo: string[] = [];
  const advisoryNotesEn: string[] = [];

  for (const rule of EXTERNAL_NAME_DETECTION_RULES) {
    if (rule.supportsSecurityDisambiguation && isSecurityPolicyHeader) {
      advisoryNotesKo.push("HTTP 보안 헤더(Content-Security-Policy) 문맥으로 판별해 경쟁 앱 약어 오탐에서 제외했습니다.");
      advisoryNotesEn.push("Disambiguated as HTTP Content-Security-Policy context; excluded from competitor acronym false positive.");
      continue;
    }
    const matchedToken = rule.tokens.find((candidate) => {
      if (candidate.includes("-")) {
        const parts = candidate.split("-");
        const adjacent = tokens.some((_, idx) => idx + parts.length <= tokens.length && parts.every((p, j) => tokens[idx + j] === p));
        return adjacent || lower.includes(candidate) || lower.includes(candidate.replace(/-/gu, "_")) || lower.includes(candidate.replace(/-/gu, " "));
      }
      return tokens.includes(candidate);
    });
    if (matchedToken) {
      const targetBrand = getProprietaryBrand(rule.targetBrandId);
      findings.push({
        ruleId: rule.ruleId, matchedToken, category: rule.category, severity: rule.severity,
        recommendedBrandId: targetBrand.id, recommendedBrandName: targetBrand.formalName,
        recommendedSlug: targetBrand.slug, rationaleKo: rule.rationaleKo, rationaleEn: rule.rationaleEn,
      });
    }
  }

  const referencedProprietaryBrandIds = findReferencedProprietaryBrands(tokens, normalizedInput);
  const hasBlocking = findings.some((f) => f.severity === "block");
  const hasWarning = findings.some((f) => f.severity === "warn");

  let verdict: BrandAuditVerdict = "clean";
  if (findings.length > 0 && exemption !== null) verdict = "allowed-external-reference";
  else if (hasBlocking) verdict = "blocked-external-brand";
  else if (hasWarning) verdict = "warn-consolidation-target";

  const primaryRecommendedBrandId =
    findings.find((f) => f.severity === "block")?.recommendedBrandId ??
    findings[0]?.recommendedBrandId ??
    referencedProprietaryBrandIds[0] ??
    null;

  const suggestedCanonicalName =
    verdict === "blocked-external-brand" || verdict === "warn-consolidation-target"
      ? buildSuggestedCanonicalName(normalizedInput, findings, resolvedContext)
      : normalizedInput;

  const primaryBrandName = primaryRecommendedBrandId ? getProprietaryBrand(primaryRecommendedBrandId).formalName : "ToonStudio";
  let summaryKo: string;
  let summaryEn: string;
  if (verdict === "clean") {
    summaryKo = "외부 라이브러리·경쟁사 명칭 혼입이 없는 ToonStudio 고유 브랜드 정본 통과 항목입니다.";
    summaryEn = "Passed proprietary brand check with zero external library or competitor naming drift.";
  } else if (verdict === "allowed-external-reference") {
    const scopeKo = exemption === "official-compare-surface" ? "공식 /compare/studio 비교 표" : exemption === "crate-dependency-manifest" ? "Cargo.toml·벤더 의존성 선언" : "외부 파일 포맷 호환 코덱";
    const scopeEn = exemption === "official-compare-surface" ? "official /compare/studio comparison surface" : exemption === "crate-dependency-manifest" ? "Cargo.toml / vendored dependency manifest" : "format interop codec boundary";
    summaryKo = `정당한 외부 참조 예외 범위(${scopeKo})로 구분되어 차단 없이 통과했습니다.`;
    summaryEn = `Classified under permitted external reference scope (${scopeEn}); allowed without block.`;
  } else if (verdict === "warn-consolidation-target") {
    summaryKo = `분리된 레거시 표면 명칭이 감지되었습니다. 통합 정본 ${primaryBrandName} 경로로 수렴을 권장합니다.`;
    summaryEn = `Detected fragmented legacy surface naming. Consolidate into ${primaryBrandName}.`;
  } else {
    summaryKo = `외부·경쟁사 명칭 ${findings.length}건이 검출되어 차단되었습니다. ${primaryBrandName} 고유 정본 대체안을 적용하세요.`;
    summaryEn = `Blocked due to ${findings.length} external/competitor naming finding(s). Apply the ${primaryBrandName} canonical suggestion.`;
  }

  return {
    input, normalizedInput, resolvedContext, verdict,
    isBlocked: verdict === "blocked-external-brand",
    isAllowedException: verdict === "allowed-external-reference",
    exemptionReason: verdict === "allowed-external-reference" ? exemption : null,
    securityAcronymDisambiguated: isSecurityPolicyHeader, findings, referencedProprietaryBrandIds,
    primaryRecommendedBrandId, suggestedCanonicalName, summaryKo, summaryEn, advisoryNotesKo, advisoryNotesEn,
  };
}

export function auditNamingBatch(inputs: readonly string[], options?: BrandAuditOptions): BrandBatchAuditSummary {
  const results = inputs.map((item) => auditProprietaryBrandNaming(item, options));
  return {
    total: results.length,
    cleanCount: results.filter((r) => r.verdict === "clean").length,
    allowedExceptionCount: results.filter((r) => r.verdict === "allowed-external-reference").length,
    warnCount: results.filter((r) => r.verdict === "warn-consolidation-target").length,
    blockedCount: results.filter((r) => r.verdict === "blocked-external-brand").length,
    results,
  };
}

export function filterMigrationEntries(filter?: MigrationFilterOptions): readonly LegacyPathMigrationEntry[] {
  const phaseId = filter?.phaseId ?? "all";
  const brandId = filter?.brandId ?? "all";
  const rootId = filter?.rootId ?? "all";
  return LEGACY_PATH_MIGRATION_ENTRIES.filter((entry) => {
    if (phaseId !== "all" && entry.phaseId !== phaseId) return false;
    if (brandId !== "all" && entry.targetBrandId !== brandId) return false;
    if (rootId !== "all" && entry.rootId !== rootId) return false;
    return true;
  });
}

export function exportBrandGovernanceMarkdown(options?: BrandGovernanceExportOptions): string {
  const filteredEntries = filterMigrationEntries({
    brandId: options?.selectedBrandId ?? "all",
    phaseId: options?.selectedPhaseId ?? "all",
  });

  const lines: string[] = [
    "# ADR: ToonStudio 10대 고유 브랜드 아키텍처 네이밍 정본 및 외부 명칭 차단 정책",
    "",
    "- **문서 상태**: Proposed (Wave 60A 자동 감사 엔진 기준)",
    `- **실측 일자**: ${BRAND_REGISTRY_MEASURED_AT}`,
    `- **기준 커밋**: \`${BRAND_REGISTRY_BASELINE_COMMIT}\``,
    `- **스캔 범위**: \`crates/\` · \`packages/\` · \`apps/web/src/domains/creator/\` (총 ${REPOSITORY_SCAN_SUMMARY.totalScannedDirs}개 디렉터리, ${REPOSITORY_SCAN_SUMMARY.totalScannedFiles.toLocaleString("en-US")}개 파일)`,
    `- **실측 레거시 매칭**: ${REPOSITORY_SCAN_SUMMARY.totalMatchedDirs}개 디렉터리(벤더 격리 ${REPOSITORY_SCAN_SUMMARY.totalVendoredExemptDirs}개 포함), ${REPOSITORY_SCAN_SUMMARY.totalMatchedFiles}개 파일(보안 헤더 오탐 ${REPOSITORY_SCAN_SUMMARY.totalSecurityAcronymFalsePositives}건 분리)`,
    "",
    "## 1. ToonStudio 10대 고유 포멀 브랜드 엔진 정본",
    "",
    "| 순번 | 고유 브랜드 | 슬러그 | 아키텍처 계층 | 핵심 책임 |",
    "| --- | --- | --- | --- | --- |",
    ...TOONSTUDIO_PROPRIETARY_BRANDS.map((b) => `| ${b.order} | **${b.formalName}** | \`${b.slug}\` | \`${b.layerId}\` | ${b.taglineKo} |`),
    "",
    "## 2. 정당한 외부 참조 예외 경계 (`allowed-external-reference`)",
    "",
    ...ALLOWED_EXTERNAL_REFERENCE_SCOPES.map((s) => `- **${s.titleKo}** (\`${s.reason}\`): ${s.policyKo}`),
    "",
    "## 3. 4단계 무중단 레거시 전환 로드맵 (강제 이름변경 금지)",
    "",
    ...MIGRATION_PHASES.map((p) => `1. **${p.titleKo}** — ${p.safetyGuaranteeKo} (\`${p.gateCommand}\`)`),
    "",
    "## 4. 실측 레거시 경로 전환 매트릭스",
    "",
    "| ID | 실측 경로 | 파일 수 | 목표 고유 브랜드 | 정본 목표 경로 | 단계 |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...filteredEntries.map((entry) => {
      const targetBrand = getProprietaryBrand(entry.targetBrandId);
      return `| ${entry.id} | \`${entry.legacyPath}\` | ${entry.measuredFileCount} | **${targetBrand.formalName}** | \`${entry.canonicalTargetPath}\` | \`${entry.phaseId}\` |`;
    }),
  ];

  if (options?.latestAudit && options.latestAudit.normalizedInput.length > 0) {
    lines.push(
      "",
      "## 5. 실시간 감사 스냅샷",
      "",
      `- **검사 입력**: \`${options.latestAudit.normalizedInput}\``,
      `- **판정**: \`${options.latestAudit.verdict}\``,
      `- **권장 정본명**: \`${options.latestAudit.suggestedCanonicalName}\``,
      `- **요약**: ${options.latestAudit.summaryKo}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function exportBrandRegistryJson(options?: BrandGovernanceExportOptions): BrandRegistryExportBundle {
  const filteredEntries = filterMigrationEntries({
    brandId: options?.selectedBrandId ?? "all",
    phaseId: options?.selectedPhaseId ?? "all",
  });
  const payload: BrandRegistryExportPayload = {
    schemaVersion: BRAND_REGISTRY_SCHEMA_VERSION,
    measuredAt: BRAND_REGISTRY_MEASURED_AT,
    baselineCommitShort: BRAND_REGISTRY_BASELINE_COMMIT,
    policyStatement: "ToonStudio 제품 파일명·디렉터리명·심볼명·UI 제목은 10대 고유 포멀 브랜드 정본만 사용하며, 공식 /compare/studio 비교 표와 Cargo.toml/crates/vendor 의존성 선언만 allowed-external-reference 예외로 허용한다.",
    scanSummary: REPOSITORY_SCAN_SUMMARY,
    scanRoots: REPOSITORY_SCAN_ROOTS,
    layers: BRAND_ARCHITECTURE_LAYERS,
    proprietaryBrands: TOONSTUDIO_PROPRIETARY_BRANDS,
    allowedReferenceScopes: ALLOWED_EXTERNAL_REFERENCE_SCOPES,
    detectionRuleCount: EXTERNAL_NAME_DETECTION_RULES.length,
    migrationPhases: MIGRATION_PHASES,
    migrationEntries: filteredEntries,
    latestAudit: options?.latestAudit ?? null,
  };
  return { payload, json: JSON.stringify(payload, null, 2) };
}
