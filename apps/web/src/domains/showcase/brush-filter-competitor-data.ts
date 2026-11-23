/**
 * 브러시 종류 · 필터 종류 · 필기감/장시간 안정성 실측 수치 · 3D 셰이퍼 경쟁력 비교 정본 데이터 (`/compare/studio`).
 *
 * 정직성 원칙:
 * - ToonStudio 항목은 실제 저장소 소스(`StudioSmartFiltersPanel.tsx` 54종 스마트 필터 + `studio-engine-canonical-filter-plan.ts`
 *   RGBA16F 비파괴 그래프 + `studio-webgpu-km7-spectral-core.ts` KM7 분광 브러시 5종/안료 필터 4종 + `packages/studio-hokusai-wasm`
 *   + `scripts/toonstudio-llm-mcp-cli.mjs` 10,000획 실측)에 근거한다.
 * - 경쟁사 수치는 공개 공식 스펙 및 제품 문서를 기준으로 하며 미실측 경쟁사 FPS/지연 배수를 지어내지 않는다.
 * - 3D 셰이퍼는 현재 경쟁사(VRoid Studio·CC4·MetaHuman) 대비 부족한 지점을 솔직히 인정하고 추월 로드맵을 함께 제시한다.
 */

import type { BilingualText, BenchmarkToolId, CellGrade } from "./competitor-benchmark-data";

export interface BrushFilterCategoryRow {
  readonly id: string;
  readonly kind: "brush" | "filter";
  readonly category: BilingualText;
  readonly toonstudioSpec: BilingualText;
  readonly repoEvidence: string;
  readonly cells: Readonly<Record<BenchmarkToolId, { readonly grade: CellGrade; readonly note: BilingualText }>>;
}

export interface QuantitativePerformanceMetric {
  readonly id: string;
  readonly label: BilingualText;
  readonly toonstudioMeasured: BilingualText;
  readonly measurementBasis: BilingualText;
  readonly competitorBaseline: BilingualText;
  readonly status: "measured" | "spec-verified" | "expanding";
}

export interface Shaper3dBreakthroughPillar {
  readonly id: string;
  readonly title: BilingualText;
  readonly honestGapNow: BilingualText;
  readonly breakthroughArchitecture: BilingualText;
  readonly repoAnchor: string;
  readonly status: "current" | "expanding";
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

export const BRUSH_FILTER_SUMMARY_STATS = {
  toonstudioSmartFilters: 54,
  toonstudioSpectralPigmentFilters: 4,
  toonstudioCanonicalFilterNodes: 11,
  toonstudioBrushLanes: 6,
  measuredEnduranceStrokes: 10_000,
  measuredEnduranceP95Ms: 0.005,
  measuredEnduranceHeapDeltaMb: 0.74,
} as const;

export const BRUSH_FILTER_COMPETITOR_ROWS: readonly BrushFilterCategoryRow[] = [
  {
    id: "brush-ink-webtoon",
    kind: "brush",
    category: bi("웹툰 펜선 · G펜 · 마루펜 · 벡터 선화", "Webtoon Ink · G-Pen · Maru · Vector Line"),
    toonstudioSpec: bi("Centripetal Catmull-Rom 120–240Hz 예측 + Skia WebGL2 retained 벡터 + 손떨림 보정", "120-240Hz Centripetal Catmull-Rom prediction + Skia WebGL2 retained vector + stabilizer"),
    repoEvidence: "apps/web/src/domains/creator/render/gpu-next/gpu-stylus-subpixel-predictor.ts",
    cells: {
      toonstudio: { grade: "lead", note: bi("웹 0초 진입 + 벡터·필압 예측", "Zero-install web + vector & stylus prediction") },
      csp: { grade: "lead", note: bi("업계 표준 G펜·벡터 지우개 최강", "Industry benchmark G-pen & vector eraser") },
      procreate: { grade: "strong", note: bi("Apple Pencil 필기감 우수(래스터 중심)", "Silky Apple Pencil feel (raster-focused)") },
      photoshop: { grade: "partial", note: bi("선화 특화·벡터 교차 지우개 약함", "General brushes; weak comic vector ink") },
      rebelle7: { grade: "strong", note: bi("자연매체 연필·잉크 탁월", "Excellent traditional ink & graphite") },
      blender: { grade: "strong", note: bi("Grease Pencil 3D 공간 벡터 선화", "Grease Pencil 3D spatial vector strokes") },
      ibispaint: { grade: "strong", note: bi("모바일 G펜·손떨림 보정 강함", "Strong mobile G-pen & stabilization") },
    },
  },
  {
    id: "brush-spectral-wet",
    kind: "brush",
    category: bi("7밴드 분광 혼색 · 유화 · 수채화 · 과슈", "7-Band Spectral Mixing · Oil · Watercolor · Gouache"),
    toonstudioSpec: bi("클린룸 KM7 420–670nm WGSL 2레지스터 SIMD 브러시 5종 + Hokusai Rust WASM 자연매체", "Clean-room KM7 420-670nm WGSL SIMD (5 brushes) + Hokusai Rust WASM natural media"),
    repoEvidence: "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
    cells: {
      toonstudio: { grade: "lead", note: bi("브라우저 WebGPU KM7 + Rust WASM", "In-browser WebGPU KM7 + Rust WASM") },
      csp: { grade: "strong", note: bi("지각 혼색(Perceptual Mixing) 지원", "Supports perceptual color mixing") },
      procreate: { grade: "partial", note: bi("sRGB/P3 혼색 중심, 물리 유체 약함", "sRGB/P3 blending; limited fluid physics") },
      photoshop: { grade: "strong", note: bi("Mixer Brush 우수, 분광 물리 미지원", "Great Mixer Brush; no spectral pigment") },
      rebelle7: { grade: "lead", note: bi("유체·중력·임파스토 물리 업계 최강", "Industry leader in fluid, gravity & impasto") },
      blender: { grade: "none", note: bi("2D 수채 유체 브러시 미주력", "Not built for 2D fluid watercolor") },
      ibispaint: { grade: "partial", note: bi("블렌딩 브러시 다수, 물리 혼색 제한", "Many blend brushes; no fluid physics") },
    },
  },
  {
    id: "brush-ribbon-tone",
    kind: "brush",
    category: bi("장식 리본 · 스크린톤 · 효과선 · 멀티팁", "Decoration Ribbon · Screentone · Speedlines"),
    toonstudioSpec: bi("모아레 억제 GPU 스크린톤, 효과선 플래너 v2, 커스텀 브러시 랩(V5/V6) + ABR/SUT 임포트 호환 경로", "Anti-moire GPU screentone, effect-line planner v2, Brush Lab V5/V6 + ABR/SUT interop"),
    repoEvidence: "apps/web/src/domains/creator/brush-lab/brush-studio-v5-model.ts",
    cells: {
      toonstudio: { grade: "strong", note: bi("웹툰 특화 리본·톤·효과선 내장", "Built-in webtoon ribbons, tones & speedlines") },
      csp: { grade: "lead", note: bi("수만 종 ASSETS 리본·데코 브러시", "Massive ASSETS library of ribbon & deco brushes") },
      procreate: { grade: "strong", note: bi("듀얼 브러시·커스텀 스튜디오 풍부", "Rich dual-brush & custom studio") },
      photoshop: { grade: "strong", note: bi("ABR 생태계 방대, 만화 톤은 수동", "Huge ABR ecosystem; manual comic tones") },
      rebelle7: { grade: "partial", note: bi("전통 회화 중심, 만화 장식 제한", "Traditional focus; limited manga deco") },
      blender: { grade: "partial", note: bi("지오메트리 노드·재료 기반 패턴", "Geometry Nodes & shader patterns") },
      ibispaint: { grade: "lead", note: bi("모바일 최다 브러시·소재 라이브러리", "Huge mobile brush & pattern catalog") },
    },
  },
  {
    id: "filter-blur-optics",
    kind: "filter",
    category: bi("광학 블러 10종 (가우시안·모션·방사·보케·틸트시프트·표면)", "10 Optical Blurs (Gaussian · Motion · Bokeh · Tilt-Shift)"),
    toonstudioSpec: bi("54종 스마트 필터 중 10종 광학/경계보존 블러(조리개 날·초점축·바이래터럴 포함)", "10 optical & edge-preserving blurs inside the 54-filter Smart Filter panel"),
    repoEvidence: "apps/web/src/domains/creator/StudioSmartFiltersPanel.tsx",
    cells: {
      toonstudio: { grade: "lead", note: bi("조리개 보케·아이리스·틸트시프트·타일블러", "Aperture bokeh, iris, tilt-shift & tileable blur") },
      csp: { grade: "strong", note: bi("가우시안·모션·방사형·스무딩 지원", "Gaussian, motion, radial & smoothing") },
      procreate: { grade: "strong", note: bi("가우시안·모션·원근 블러 직관적", "Intuitive Gaussian, motion & perspective blur") },
      photoshop: { grade: "lead", note: bi("Blur Gallery·스마트 필터 업계 표준", "Blur Gallery & Smart Filters benchmark") },
      rebelle7: { grade: "partial", note: bi("기본 블러 중심, 광학 필터 소수", "Basic blurs; minimal optical suite") },
      blender: { grade: "strong", note: bi("노드 기반 피사계 심도·컴포지터", "Node-based DoF & compositor blurs") },
      ibispaint: { grade: "strong", note: bi("모바일 블러·렌즈 블러 다양", "Rich mobile blurs including lens blur") },
    },
  },
  {
    id: "filter-color-hdr",
    kind: "filter",
    category: bi("비파괴 색보정 · 커브 · 레벨 · 그라데이션맵 · KM7 안료 필터", "Non-Destructive Color · Curves · Levels · KM7 Pigment Filters"),
    toonstudioSpec: bi("RGBA16F scene-linear 11종 정규 노드 그래프 + 4종 KM7 감산 안료 필터(그라데이션맵·글레이징·색온도·하모나이저)", "RGBA16F scene-linear 11-node canonical graph + 4 KM7 subtractive pigment filters"),
    repoEvidence: "apps/web/src/domains/creator/render/studio-engine-canonical-filter-plan.ts",
    cells: {
      toonstudio: { grade: "lead", note: bi("Display-P3 RGBA16F + 감산 KM7 필터 4종", "Display-P3 RGBA16F + 4 subtractive KM7 filters") },
      csp: { grade: "lead", note: bi("색조 보정 레이어·그라데이션 맵 강력", "Strong correction layers & gradient maps") },
      procreate: { grade: "partial", note: bi("커브·그라데이션맵 지원(파괴 적용 중심)", "Curves & gradient maps (mostly destructive)") },
      photoshop: { grade: "lead", note: bi("16/32-bit 조정 레이어·Camera Raw 최강", "16/32-bit adjustment layers & Camera Raw") },
      rebelle7: { grade: "partial", note: bi("기본 색상·명도 보정 중심", "Core tonal adjustments") },
      blender: { grade: "strong", note: bi("AgX/ACES 파이프라인·컬러 매니지먼트", "AgX/ACES color management & compositor") },
      ibispaint: { grade: "strong", note: bi("필터 수 80+종, 비파괴 조정 레이어 제한", "80+ filters; limited non-destructive stack") },
    },
  },
  {
    id: "filter-comic-line-extract",
    kind: "filter",
    category: bi("웹툰 특화 필터 (DoG 선화 추출 · 먼지/톤 제거 · 색수차 · 레트로 필름)", "Webtoon Filters (DoG Line Extract · Descreen · Chromatic · Retro)"),
    toonstudioSpec: bi("DoG 선화 추출, 휘도→투명, 스크린톤 제거, JPEG 아티팩트 복원, 색수차, 하프톤, 레트로 필름, 수채/유화 스타일화 포함 54종", "54 smart filters including DoG line extract, luminance-to-alpha, descreening & chromatic aberration"),
    repoEvidence: "apps/web/src/domains/creator/StudioSmartFiltersPanel.tsx",
    cells: {
      toonstudio: { grade: "lead", note: bi("웹툰 마감·선화추출·3D LT 통합 54종", "54 filters unified with 3D line-art extraction") },
      csp: { grade: "lead", note: bi("EX LT 변환·아티스틱·휘도→투명 최강", "EX LT conversion, artistic & luma-to-alpha") },
      procreate: { grade: "strong", note: bi("색수차·블룸·글리치·하프톤 우수", "Chromatic aberration, bloom, glitch & halftone") },
      photoshop: { grade: "strong", note: bi("Filter Gallery 풍부, 만화 LT는 별도 액션", "Rich Filter Gallery; comic LT needs actions") },
      rebelle7: { grade: "partial", note: bi("전통 회화 필터 소수", "Few stylized comic filters") },
      blender: { grade: "strong", note: bi("Freestyle·Line Art 모디파이어 강력", "Freestyle & Line Art modifiers") },
      ibispaint: { grade: "lead", note: bi("애니 배경·선화 추출·글로우 필터 최다", "Huge anime/comic filter preset catalog") },
    },
  },
];

export const QUANTITATIVE_PERFORMANCE_METRICS: readonly QuantitativePerformanceMetric[] = [
  {
    id: "endurance-10k-strokes",
    label: bi("장시간 10,000획 지구력 (3840×2160 기준)", "10,000-Stroke Endurance (3840×2160)"),
    toonstudioMeasured: bi("총 14.04ms · p50 0.0009ms · p95 0.005ms · p99 0.0061ms · 힙 증가 +0.74 MB", "14.04ms total · p50 0.0009ms · p95 0.005ms · p99 0.0061ms · +0.74 MB heap"),
    measurementBasis: bi("실측: `scripts/toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000` (고정 Float32Array 링버퍼 + 128타일 LRU + OPFS Undo 20단계 상한)", "Measured via `toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000` (Float32Array ring + 128-tile LRU + 20-step OPFS Undo spill)"),
    competitorBaseline: bi("일반 웹 캔버스: 획 누적 시 배열/스냅샷 팽창으로 GC 스파이크 발생 · 네이티브 앱: OS RAM에 상주", "Typical web canvases suffer GC spikes as stroke arrays grow; native apps hold history in OS RAM"),
    status: "measured",
  },
  {
    id: "stylus-input-prediction",
    label: bi("스타일러스 입력 · 필기감 선행 예측", "Stylus Input & 1-Frame Feel Prediction"),
    toonstudioMeasured: bi("120–240Hz `getCoalescedEvents` + `getPredictedEvents(w=0.65)` + 구심 Catmull-Rom 16.67ms 선행(24ms/48px 클램프)", "120-240Hz coalesced + predicted events (w=0.65) + Centripetal Catmull-Rom 16.67ms lead"),
    measurementBasis: bi("코드 불변식: `gpu-stylus-subpixel-predictor.ts` (`predicted-preview` 권위 분리로 확정 획 오염 0%)", "Code invariant in `gpu-stylus-subpixel-predictor.ts` (isolated predicted-preview authority)"),
    competitorBaseline: bi("Procreate(Metal 120Hz)·CSP(네이티브 WinTab/DirectInk)는 OS 직결 저지연 강점 보유 — 웹 한계를 예측·WebGPU로 추격", "Procreate (Metal 120Hz) & CSP (native WinTab) lead OS latency; ToonStudio closes gap via prediction + WebGPU"),
    status: "spec-verified",
  },
  {
    id: "spectral-color-accuracy",
    label: bi("분광 혼색 & 색공간 정밀도", "Spectral Mixing & Color Precision"),
    toonstudioMeasured: bi("7밴드 420–670nm KM7 WGSL SIMD + RGBA16F Display-P3 비파괴 필터 그래프(최대 64노드/65,536px 상한)", "7-band 420-670nm KM7 WGSL SIMD + RGBA16F Display-P3 non-destructive filter graph"),
    measurementBasis: bi("단위 테스트 검증: `studio-webgpu-km7-spectral-core.ts` · `studio-engine-canonical-filter-plan.ts`", "Unit-tested in `studio-webgpu-km7-spectral-core.ts` & `studio-engine-canonical-filter-plan.ts`"),
    competitorBaseline: bi("Rebelle 7(Pigments)·CSP(지각 혼색)·Photoshop(16/32-bit)과 동일 축에서 브라우저 무설치 구현", "Matches perceptual/16-bit precision axis right inside an install-free browser tab"),
    status: "spec-verified",
  },
  {
    id: "local-3d-wasm64-budget",
    label: bi("대용량 3D · 다중 레이어 로컬 메모리 한도", "Large 3D & Multi-Layer Local Memory Cap"),
    toonstudioMeasured: bi("로컬 GLB/VRM 최대 1 GiB · OpenSKP `.skp` 최대 256 MiB · OPFS 누적 16 GiB · 256px Dirty-Tile 128 MiB LRU", "Local GLB/VRM up to 1 GiB · OpenSKP `.skp` 256 MiB · 16 GiB OPFS · 128 MiB Dirty-Tile LRU"),
    measurementBasis: bi("정책 계약: `studio-wasm64-memory-governor.ts` · `studio-webgpu-tile-runtime.ts`", "Enforced in `studio-wasm64-memory-governor.ts` & `studio-webgpu-tile-runtime.ts`"),
    competitorBaseline: bi("Blender는 데스크톱 시스템 RAM/VRAM 전체 활용 가능(절대 용량 우위) · ToonStudio는 0초 웹 진입 + ₩0 서버 저장비 강점", "Blender leverages full desktop RAM/VRAM; ToonStudio pairs zero-install speed with KRW 0 cloud storage"),
    status: "spec-verified",
  },
];

export const SHAPER_3D_BREAKTHROUGH_PILLARS: readonly Shaper3dBreakthroughPillar[] = [
  {
    id: "sdf-anime-face-subd",
    title: bi("① SDF 웹툰 얼굴 음영 맵 + Catmull-Clark SubD 매니폴드", "1. SDF Webtoon Face Shadow Map + Catmull-Clark SubD"),
    honestGapNow: bi("현재 절차적 기본 메시와 구면 노멀 셰이딩은 코·볼에 뭉개진 3D 인형 그림자가 생겨 VRoid·CC4 대비 미형이 떨어집니다.", "Current procedural meshes with spherical normals cast bulbous doll shadows vs. VRoid & CC4."),
    breakthroughArchitecture: bi("얼굴 전용 커스텀 SDF 음영 텍스처 + ≥24분할 SubD 루프 + 매니폴드 0결함 감사(`precision-3d-craft`)로 어느 각도에서도 한국 웹툰 작화 같은 깔끔한 셀 음영을 생성합니다.", "Replaces spherical face normals with custom SDF cel-shadow maps, >=24-loop SubD silhouettes and 0-defect manifold auditing."),
    repoAnchor: "apps/web/src/domains/creator/precision-3d-craft/",
    status: "expanding",
  },
  {
    id: "procedural-hair-garment-drape",
    title: bi("② 스플라인 리본 헤어 + 천사링 셰이더 + 42-소켓 의상 드레이프", "2. Spline Ribbon Hair + Angel-Ring Shader + 42-Socket Drape"),
    honestGapNow: bi("단순 볼륨 머리카락과 피부 밀착형 의상은 로판·현대물 웹툰의 머릿결·옷 주름 디테일을 따라가지 못합니다.", "Simple blob hair and skin-tight outfits lack webtoon hair-strand flow and cloth folds."),
    breakthroughArchitecture: bi("뿌리→끝 테이퍼 베지어 리본 헤어 + 시선 연동 엔젤링 하이라이트 + 42-소켓 본 자동 밀착(`1.5~3mm Anti-Clip`)·패턴 드레이프(`studio-vrm-pattern-sewing-drape.ts`)를 결합합니다.", "Combines tapered Bezier hair ribbons, view-dependent angel-ring highlights and 42-socket anti-clip garment draping."),
    repoAnchor: "apps/web/src/domains/creator/studio-scale-and-3d-fit/",
    status: "current",
  },
  {
    id: "kwebtoon-archetype-foundry",
    title: bi("③ 한국 웹툰 8대 체형·화풍 원클릭 아키타입 & 외부 VRM/Blender 브리지", "3. 8 Korean Webtoon Archetypes & Seamless VRM/Blender Bridge"),
    honestGapNow: bi("수십 개 수치 슬라이더만 주어지면 초보자가 미형 캐릭터를 뽑기 어렵고, 화풍 다양성이 좁아 보입니다.", "Exposing dozens of raw sliders makes attractive character styling hard and limits genre variety."),
    breakthroughArchitecture: bi("로판 8등신·헌터 근육형·학원 7등신·SD 치비 2.5등신·중년/노년·판타지 종족 원클릭 프리셋 + 얼굴 비율 황금률 가드 + 외부 VRoid/Blender `.vrm`/`.glb` 무손실 리타겟을 한 화면에 통합합니다.", "One-click genre archetypes with facial proportion guardrails plus lossless VRoid/Blender `.vrm`/`.glb` import & retarget."),
    repoAnchor: "apps/web/src/domains/creator/vrm/studio-vrm-proportion-core.ts",
    status: "expanding",
  },
  {
    id: "three-layer-lt-canvas-drop",
    title: bi("④ 캔버스 직결 3레이어 출고 (가변 굵기 선화 · 셀 음영 · 파트 ID 마스크)", "4. Direct 3-Layer Canvas Output (Variable Lineart · Cel · Mask)"),
    honestGapNow: bi("3D 셰이퍼 결과물이 단순 3D 스냅샷으로만 들어가면 2D 웹툰 컷 위에서 이질적으로 떠 보입니다.", "Dropping flat 3D snapshots onto a 2D comic panel creates visual mismatch."),
    breakthroughArchitecture: bi("캐릭터 배치 즉시 [1] 크리즈+인버티드 헐 가변 굵기 흑백 선화, [2] 조명 연동 셀 음영, [3] 머리카락·피부·의상 파트 ID 마스크 3개 레이어로 자동 분해해 2D 브러시로 1초 만에 덧칠할 수 있게 합니다.", "Splits any posed character into editable variable-width ink lineart, cel-shading and per-part ID masks in one click."),
    repoAnchor: "apps/web/src/domains/creator/studio-scale-and-3d-fit/",
    status: "current",
  },
];
