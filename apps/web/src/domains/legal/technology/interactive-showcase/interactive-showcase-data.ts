import { type ShowcaseText, tShowcase } from "./interactive-showcase-models";

/* ── 2. 5계층 인터랙티브 시스템 청사진 데이터 ────────────────────── */

export type ArchitectureLayerId =
  | "canvas-ui"
  | "webgpu-vello-3d"
  | "rust-wasm64-simd"
  | "sqlite-opfs-crdt"
  | "edge-onpod-api";

export type ArchitectureTone = "accent" | "cool" | "good" | "warn";

export interface ArchitectureBlueprintLayer {
  readonly id: ArchitectureLayerId;
  readonly order: 1 | 2 | 3 | 4 | 5;
  readonly shortBadge: ShowcaseText;
  readonly title: ShowcaseText;
  readonly summary: ShowcaseText;
  readonly tone: ArchitectureTone;
  readonly offlineGuarantee: ShowcaseText;
  readonly bundleImpact: ShowcaseText;
  readonly measuredLatency: ShowcaseText;
  readonly dataFlowLabel: ShowcaseText;
  readonly ownedModules: readonly string[];
}

export const ARCHITECTURE_BLUEPRINT_LAYERS: readonly ArchitectureBlueprintLayer[] = Object.freeze([
  {
    id: "canvas-ui",
    order: 1,
    shortBadge: tShowcase("L1 · 프런트 작업면", "L1 · Studio Chrome"),
    title: tShowcase("1. 입력·캔버스 UI", "1. Input & Canvas UI"),
    summary: tShowcase(
      "단일 44px 문맥 바와 7메뉴 예산으로 캔버스 면적 82% 이상을 확보하고, 비회원 게스트 즉시 진입과 포인터·펜·키보드 동등 조작을 맡습니다.",
      "Preserves >= 82% canvas viewport with a single 44px context bar and 7-menu budget, pairing non-blocking guest entry with unified pointer, stylus, and keyboard input.",
    ),
    tone: "accent",
    offlineGuarantee: tShowcase(
      "로그인 없이 캔버스를 엽니다. 오프라인에서 다시 열려면 앱과 사용할 자산이 기기에 저장돼 있어야 합니다.",
      "Guest entry requires no sign-in. Offline reopening requires a cached app and the relevant assets.",
    ),
    bundleImpact: tShowcase(
      "0B 무거운 엔진 정적 유입 — 3D·VRM·심화 필터는 사용자 호출 시점에만 청크를 로드합니다.",
      "0B heavy-engine eager import — 3D, VRM, and pro labs load on explicit user intent.",
    ),
    measuredLatency: tShowcase(
      "칼만 필터는 최근 펜 입력을 바탕으로 다음 위치를 예측합니다.",
      "Kalman lookahead estimates the next position from recent stylus input.",
    ),
    dataFlowLabel: tShowcase("포인터 좌표·필압·기울기 스트림 전달", "Streams pointer x/y, pressure & tilt"),
    ownedModules: [
      "apps/web/src/domains/creator/webcodecs-opfs-engine/kalman-stylus-predictor.ts",
      "apps/web/src/domains/creator/production-hub/board/use-board-dnd.ts",
      "apps/web/src/domains/creator/layer/studio-layer-drag.ts",
    ],
  },
  {
    id: "webgpu-vello-3d",
    order: 2,
    shortBadge: tShowcase("L2 · GPU 렌더링", "L2 · GPU Rendering"),
    title: tShowcase("2. WebGPU · Vello · 3D 엔진", "2. WebGPU · Vello · 3D Engine"),
    summary: tShowcase(
      "타일 비닝 CSR Compute 패스와 7밴드 Kubelka-Munk 분광 혼색, CanvasKit(Skia) 기준선 렌더러, 조건부 Vello·3D 배경 무대를 조합합니다.",
      "Combines CSR tile-binning compute passes, 7-band Kubelka-Munk spectral mixing, the CanvasKit (Skia) baseline renderer, and lazy Vello/3D stage engines.",
    ),
    tone: "cool",
    offlineGuarantee: tShowcase(
      "WebGPU 미지원 기기에서도 동일 수식의 CPU f32 미러 커널로 색 오차 없이 로컬 렌더링을 이어갑니다.",
      "Falls back deterministically to the CPU f32 mirror kernel with matching math when WebGPU is unavailable.",
    ),
    bundleImpact: tShowcase(
      "0B eager — Vello GPU·Three.js·VRM 런타임은 라우트·도구 선택 시 지연 청크로만 분리 로드됩니다.",
      "0B eager — Vello GPU, Three.js, and VRM runtimes split into on-demand lazy chunks.",
    ),
    measuredLatency: tShowcase(
      "8×8 워크그룹에서 타일 합성을 처리합니다. 실제 시간은 장치와 원고에 따라 달라집니다.",
      "8×8 workgroups composite tiles. Timing depends on the device and manuscript.",
    ),
    dataFlowLabel: tShowcase("선형 메모리 버퍼 · 타일 더티 영역 교환", "Exchanges linear memory buffers & dirty tiles"),
    ownedModules: [
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      "apps/web/src/domains/creator/render/studio-webgpu-dab-tile-binning-compute.ts",
      "packages/studio-engine-registry/src/index.ts",
    ],
  },
  {
    id: "rust-wasm64-simd",
    order: 3,
    shortBadge: tShowcase("L3 · 네이티브급 연산", "L3 · Native Compute"),
    title: tShowcase("3. Rust WASM64 · SIMD 커널", "3. Rust WASM64 · SIMD Kernel"),
    summary: tShowcase(
      "타일 해시 중복 제거, 벡터 캘리그라피 윤곽, 분리형 블러, CMYK·하프톤·PSD 코덱까지 62개 C-ABI 심볼을 Rust SIMD128 커널로 처리합니다.",
      "Executes tile hash dedup, vector calligraphy outlines, separable blur, CMYK/halftone, and PSD codecs across 62 C-ABI exports in Rust SIMD128.",
    ),
    tone: "good",
    offlineGuarantee: tShowcase(
      "PWA 자산 피너가 WASM 매직 헤더와 SHA-256 해시를 검증해 비행기 모드에서도 로컬 CPU만으로 실행됩니다.",
      "PWA asset pinner verifies WASM magic headers and SHA-256 digests for zero-network execution.",
    ),
    bundleImpact: tShowcase(
      "0B eager — 초기 번들에 WASM 바이너리를 인라인하지 않고 작업 시점에 스트리밍 컴파일합니다.",
      "0B eager — never inlined in initial JS; compiled via streaming instantiation on demand.",
    ),
    measuredLatency: tShowcase(
      "Apple M2 Max 실측 기준 JS 대비 타일 중복 제거 19.82× · 벡터 윤곽 6.96× · 블러 4.07× 가속",
      "Measured on Apple M2 Max: Tile Dedup 19.82×, Vector Calligraphy 6.96×, Separable Blur 4.07× over JS",
    ),
    dataFlowLabel: tShowcase("압축 타일 차분 · SHA-256 블록 해시 커밋", "Commits compressed tile deltas & SHA-256 hashes"),
    ownedModules: [
      "crates/studio-wasm64-drawing-core/src/tile_delta_kernel.rs",
      "crates/studio-wasm64-drawing-core/src/vector_path_kernel.rs",
      "crates/studio-wasm64-drawing-core/src/filter_warp_kernel.rs",
      "crates/studio-wasm64-drawing-core/src/spectral_km_kernel.rs",
    ],
  },
  {
    id: "sqlite-opfs-crdt",
    order: 4,
    shortBadge: tShowcase("L4 · 로컬 영속 권위", "L4 · Local Authority"),
    title: tShowcase("4. SQLite WASM · OPFS · Yjs CRDT", "4. SQLite WASM · OPFS · Yjs CRDT"),
    summary: tShowcase(
      "전용 Worker 단일 쓰기 잠금 아래 SQLite opfs-sahpool에 문서 메타데이터를, SHA-256 내용 주소 OPFS에 대용량 원고를 저장하고 Yjs CRDT로 병합합니다.",
      "Persists metadata in DedicatedWorker SQLite opfs-sahpool and heavy blobs in SHA-256 content-addressed OPFS, merging concurrent edits via Yjs CRDT.",
    ),
    tone: "accent",
    offlineGuarantee: tShowcase(
      "오프라인 작업은 기기 DB에 저장하고 서버 변경은 다시 연결할 때 동기화합니다.",
      "Offline work is stored in the local database. Server changes sync after reconnecting.",
    ),
    bundleImpact: tShowcase(
      "0B eager — SQLite WASM 로더는 DedicatedWorker 내부에서만 기동해 메인 스레드 초기 번들을 늘리지 않습니다.",
      "0B eager — SQLite WASM boots exclusively inside a DedicatedWorker off the main thread.",
    ),
    measuredLatency: tShowcase(
      "OPFS SyncAccessHandle 직접 쓰기로 네트워크 왕복 0ms 로컬 저장 · FNV-1a 멱등 중복 제거",
      "0ms network round-trip local commits via OPFS SyncAccessHandle + FNV-1a idempotent dedup",
    ),
    dataFlowLabel: tShowcase("서명된 증분 동기화 · 정적/대형 자산 요청", "Signed incremental sync & static/R2 asset fetch"),
    ownedModules: [
      "apps/web/src/domains/creator/studio-local-database-runtime.ts",
      "apps/web/src/domains/creator/studio-local-database-worker-sqlite-loader.ts",
      "apps/web/src/domains/creator/live/studio-crdt-document-host.ts",
      "apps/web/src/domains/creator/live/studio-offline-sync-queue-merger.ts",
    ],
  },
  {
    id: "edge-onpod-api",
    order: 5,
    shortBadge: tShowcase("L5 · ₩0 하이브리드 클라우드", "L5 · ₩0 Hybrid Cloud"),
    title: tShowcase("5. Cloudflare Edge · 서울 onpod API", "5. Cloudflare Edge · Seoul onpod API"),
    summary: tShowcase(
      "정적 웹과 헬스 응답은 Cloudflare 엣지에서 즉시 처리하고, 25MiB 초과 3D 자산은 R2로, 인증·결제·카탈로그 원장만 서울 onpod API·PG 17로 분리합니다.",
      "Serves static web and live health at Cloudflare Edge, offloads >25MiB 3D assets to R2, and isolates auth, billing, and catalog ledgers on Seoul onpod PG 17.",
    ),
    tone: "warn",
    offlineGuarantee: tShowcase(
      "클라우드 API가 점검 중이거나 제한되어도 스튜디오 드로잉·저장·로컬 내보내기는 멈추지 않습니다.",
      "Studio drawing, saving, and local export continue uninterrupted even if cloud APIs are degraded.",
    ),
    bundleImpact: tShowcase(
      "0B 런타임 SDK 비대화 — 표준 fetch 계약과 정본 배포 매니페스트로 공급자 종속 SDK를 배제합니다.",
      "0B vendor SDK bloat — relies on standard fetch contracts and canonical deploy manifests.",
    ),
    measuredLatency: tShowcase(
      "캔버스의 로컬 연산과 서버 요청을 분리합니다. 운영 비용은 사용량에 따라 달라집니다.",
      "Canvas compute runs locally. Service costs depend on usage.",
    ),
    dataFlowLabel: tShowcase("40자리 승인 SHA 불변 릴리스 고정", "Pinned to approved 40-char immutable SHA"),
    ownedModules: [
      "deploy/DEPLOY_MANIFEST.json",
      "deploy/STANDING_APPROVAL.json",
      "docs/operations/infrastructure-map.md",
      "apps/api/src/server/oauth.ts",
    ],
  },
]);

/* ── 3. TCO & 아키텍처 벤치마크 비교 행렬 데이터 ─────────────────── */

export type EvidenceVerificationKind = "measured" | "design";

export interface TcoBenchmarkDimension {
  readonly id:
    | "cold-boot"
    | "offline-capability"
    | "brush-4k-latency"
    | "print-cmyk-epub3"
    | "copyright-c2pa-zk"
    | "monthly-seat-compute";
  readonly dimension: ShowcaseText;
  readonly evidenceKind: EvidenceVerificationKind;
  readonly evidenceNote: ShowcaseText;
  readonly toonstudioValue: ShowcaseText;
  readonly cloudBoundValue: ShowcaseText;
  readonly desktopInstallValue: ShowcaseText;
}

export const TCO_BENCHMARK_DIMENSIONS: readonly TcoBenchmarkDimension[] = Object.freeze([
  {
    id: "cold-boot",
    dimension: tShowcase("설치·인증 경로", "Launch and sign-in"),
    evidenceKind: "design",
    evidenceNote: tShowcase("게스트는 웹에서 스튜디오를 열 수 있습니다.", "Guests can open the studio on the web."),
    toonstudioValue: tShowcase("게스트 캔버스 진입", "Guest canvas entry"),
    cloudBoundValue: tShowcase("원격 세션 연결", "Connect to a remote session"),
    desktopInstallValue: tShowcase("설치된 앱 시작", "Launch the installed app"),
  },
  {
    id: "offline-capability",
    dimension: tShowcase("오프라인 작업", "Offline editing"),
    evidenceKind: "design",
    evidenceNote: tShowcase("앱과 사용할 자산이 기기에 있어야 합니다.", "The app and required assets must be cached."),
    toonstudioValue: tShowcase("SQLite WASM과 OPFS에 로컬 저장", "Local persistence via SQLite WASM and OPFS"),
    cloudBoundValue: tShowcase("서버 전용 작업은 연결 필요", "Server-side work needs a connection"),
    desktopInstallValue: tShowcase("로컬 파일에 작업 저장", "Save edits to local files"),
  },
  {
    id: "brush-4k-latency",
    dimension: tShowcase("타일 중복 제거", "Tile deduplication"),
    evidenceKind: "measured",
    evidenceNote: tShowcase("M2 Max 개별 커널 기록. 원고 전체의 처리 시간은 별도입니다.", "M2 Max kernel results; whole-manuscript timings vary."),
    toonstudioValue: tShowcase("JS 대비 WASM 19.82배, ARM64 24.52배", "WASM 19.82× and native ARM64 24.52× over JS"),
    cloudBoundValue: tShowcase("동일 기기 비교 미측정", "No comparable measurement"),
    desktopInstallValue: tShowcase("동일 원고 비교 미측정", "No comparable measurement"),
  },
  {
    id: "print-cmyk-epub3",
    dimension: tShowcase("인쇄·전자책 파일", "Print and ebook files"),
    evidenceKind: "design",
    evidenceNote: tShowcase("기술 도감의 출고 모듈과 단위 검증 범위입니다.", "Modules and unit checks documented in the atlas."),
    toonstudioValue: tShowcase("CMYK 교정·EPUB3 조립 모듈", "CMYK proofing and EPUB3 packaging modules"),
    cloudBoundValue: tShowcase("서버에 작업 제출", "Submit a server-side job"),
    desktopInstallValue: tShowcase("로컬 앱에서 변환", "Convert in a local app"),
  },
  {
    id: "copyright-c2pa-zk",
    dimension: tShowcase("권리 확인과 서명 실험", "Rights review and signature experiments"),
    evidenceKind: "design",
    evidenceNote: tShowcase("Rights BOM과 실험용 서명 커널의 적용 범위는 다릅니다.", "Rights BOM review and experimental signature kernels have separate scopes."),
    toonstudioValue: tShowcase("출고 권리 확인 · WOTS+ 단위 검증", "Export rights review and WOTS+ unit checks"),
    cloudBoundValue: tShowcase("원격 검증 서비스 연결 가능", "Can connect to a remote verifier"),
    desktopInstallValue: tShowcase("로컬 검증기 연결 가능", "Can connect to a local verifier"),
  },
  {
    id: "monthly-seat-compute",
    dimension: tShowcase("서버 연산 비용", "Hosted compute costs"),
    evidenceKind: "design",
    evidenceNote: tShowcase("비용 청구액은 이 표에서 측정하지 않습니다.", "This table does not measure billing amounts."),
    toonstudioValue: tShowcase("캔버스 연산은 기기에서 실행. 동기화·API는 서버 사용", "Local canvas compute; sync and API requests use servers"),
    cloudBoundValue: tShowcase("사용한 서버 자원에 따라 달라짐", "Depends on hosted resources"),
    desktopInstallValue: tShowcase("사용한 기기·서비스에 따라 달라짐", "Depends on the device and services"),
  },
]);

/* ── 4. 5단계 창작 공정 Before/After 투어 데이터 ─────────────────── */

export type CreationStageId =
  | "line-stabilize"
  | "gap-autoflat"
  | "bg3d-perspective"
  | "balloon-multilang"
  | "cmyk-audiotoon-qa";

export interface FiveStageTourItem {
  readonly id: CreationStageId;
  readonly stepNumber: 1 | 2 | 3 | 4 | 5;
  readonly title: ShowcaseText;
  readonly shortTab: ShowcaseText;
  readonly beforeLabel: ShowcaseText;
  readonly afterLabel: ShowcaseText;
  readonly beforeSummary: ShowcaseText;
  readonly afterSummary: ShowcaseText;
  readonly engineBadge: ShowcaseText;
  readonly metricBadge: ShowcaseText;
  readonly evidencePath: string;
}

export const FIVE_STAGE_TOUR_ITEMS: readonly FiveStageTourItem[] = Object.freeze([
  {
    id: "line-stabilize",
    stepNumber: 1,
    shortTab: tShowcase("1. 선화 손떨림 보정", "1. Line Stabilization"),
    title: tShowcase(
      "1. 선화 손떨림 보정 — 개인화 FFT 칼만 · One-Euro 필터",
      "1. Line Stabilization — Personalized FFT Kalman & One-Euro Filter",
    ),
    beforeLabel: tShowcase("보정 전 · 미세 수전증 지터", "Before · Raw Stylus Micro-Jitter"),
    afterLabel: tShowcase("보정 후 · 날렵한 먹선 테이퍼링", "After · Crisp Tapered Ink Curve"),
    beforeSummary: tShowcase(
      "저속 곡선 구간에서 디지타이저 양자화 노이즈와 손끝 떨림이 선 두께 흔들림으로 남습니다.",
      "Digitizer quantization and hand tremor leave jagged width ripples on slow curves.",
    ),
    afterSummary: tShowcase(
      "작가의 고유 떨림 주파수를 FFT로 분리해 꺾임 각도는 살리고 떨림만 매끄럽게 정돈합니다.",
      "Isolates personal tremor frequency via FFT while keeping intentional sharp corners crisp.",
    ),
    engineBadge: tShowcase("Kalman + One-Euro · WASM64", "Kalman + One-Euro · WASM64"),
    metricBadge: tShowcase("AI 토큰 0 · 실시간 로컬 보정", "0 AI Tokens · Real-time Local"),
    evidencePath: "apps/web/src/domains/creator/webcodecs-opfs-engine/kalman-stylus-predictor.ts",
  },
  {
    id: "gap-autoflat",
    stepNumber: 2,
    shortTab: tShowcase("2. 경계 보존 자동 밑색", "2. Gap-Safe Auto-Flat"),
    title: tShowcase(
      "2. 경계 보존 자동 밑색 — 선화 틈새 자동 폐합 · 무토큰 오토플랫",
      "2. Boundary-Preserving Auto-Flat — Automatic Gap Closing",
    ),
    beforeLabel: tShowcase("보정 전 · 열린 선화 색 번짐", "Before · Open-Gap Flood Spill"),
    afterLabel: tShowcase("보정 후 · 경계 밀착 영역 분리", "After · Sealed Region Flatting"),
    beforeSummary: tShowcase(
      "머리카락 끝이나 옷주름의 2~4px 끊어진 틈으로 양동이 채우기 색이 배경 전체로 새어 나갑니다.",
      "2–4px gaps in hair tips or cloth folds cause standard flood-fill colors to bleed into the background.",
    ),
    afterSummary: tShowcase(
      "거리장 형태학 커널이 보이지 않는 가상 차폐선으로 틈을 먼저 닫고 안티에일리어싱 안쪽까지 깔끔히 채웁니다.",
      "Morphological distance-field bridging seals micro-gaps invisibly and fills cleanly under anti-aliased edges.",
    ),
    engineBadge: tShowcase("Flood-Fill SIMD · Auto-Flat", "Flood-Fill SIMD · Auto-Flat"),
    metricBadge: tShowcase("틈새 4px 가상 폐합 · ₩0 로컬", "Seals 4px Gaps · ₩0 Local"),
    evidencePath: "crates/studio-wasm64-drawing-core/src/flood_fill_selection_kernel.rs",
  },
  {
    id: "bg3d-perspective",
    stepNumber: 3,
    shortTab: tShowcase("3. 3D 배경·원근 결합", "3. 3D Stage & Perspective"),
    title: tShowcase(
      "3. 3D 배경·원근 결합 — 소실선 PnP 카메라 솔버 · 깊이 6단 분리",
      "3. 3D Stage & Perspective — Vanishing-Line PnP & Depth Split",
    ),
    beforeLabel: tShowcase("결합 전 · 수동 투시선 작도", "Before · Manual Vanishing Rulers"),
    afterLabel: tShowcase("결합 후 · 3D 무대 + NPR 외곽선 정합", "After · Matched 3D NPR Stage"),
    beforeSummary: tShowcase(
      "캐릭터 러프 스케치에 맞춰 배경 소실점과 카메라 화각(FOV)을 눈대중으로 맞추느라 시간이 걸립니다.",
      "Matching 3D camera FOV and horizon lines to a rough character sketch by eye wastes hours.",
    ),
    afterSummary: tShowcase(
      "러프 소실선 몇 줄로 3D 카메라 자세를 역산하고 전경·중경·원경을 깊이별 레이어로 즉시 나눕니다.",
      "Solves 3D camera pose from rough vanishing guides and splits foreground/midground/background layers.",
    ),
    engineBadge: tShowcase("PnP Solver · G-Buffer NPR", "PnP Solver · G-Buffer NPR"),
    metricBadge: tShowcase("6단 깊이 레이어 비파괴 분리", "6-Layer Non-Destructive Depth Split"),
    evidencePath: "crates/studio-wasm64-drawing-core/src/atelier_stage_3d_kernel.rs",
  },
  {
    id: "balloon-multilang",
    stepNumber: 4,
    shortTab: tShowcase("4. 말풍선·다국어 식자", "4. Balloons & Localization"),
    title: tShowcase(
      "4. 말풍선·다국어 식자 — 대사 시트 연동 · 문화권 읽기 방향 반전",
      "4. Speech Balloons & Multi-Locale Typesetting",
    ),
    beforeLabel: tShowcase("식자 전 · 수동 줄바꿈·말풍선 넘침", "Before · Manual Line-Breaks & Overflow"),
    afterLabel: tShowcase("식자 후 · 다국어 자동 리플로·RTL 정합", "After · Auto-Reflow & Locale Flip"),
    beforeSummary: tShowcase(
      "번역문 길이가 길어질 때마다 말풍선 크기를 다시 그리고 컷 읽기 순서를 수작업으로 뒤집어야 합니다.",
      "Translated dialogue overflows fixed balloons and requires manual panel-order flipping per market.",
    ),
    afterSummary: tShowcase(
      "한국어 세로·가로 조판부터 영문·일문·RTL 문화권까지 말풍선 여백과 읽기 순서를 한 번에 검수·반전합니다.",
      "Reflows balloon padding and audits reading order across KO, EN, JA, and RTL markets in one pass.",
    ),
    engineBadge: tShowcase("MSDF Typography · Locale QA", "MSDF Typography · Locale QA"),
    metricBadge: tShowcase("4대 문화권 조판 · 오탈자/넘침 감시", "4-Region Typesetting & Overflow QA"),
    evidencePath: "apps/web/src/domains/creator/wasm64-reader-a11y-resilience/reader-super-res-and-balloon-reflow.ts",
  },
  {
    id: "cmyk-audiotoon-qa",
    stepNumber: 5,
    shortTab: tShowcase("5. CMYK·오디오툰 출고 검수", "5. CMYK & AudioToon QA"),
    title: tShowcase(
      "5. CMYK·오디오툰 출고 검수 — 인쇄 잉크 총량 · HRTF 음향 · Rights BOM",
      "5. CMYK Print, HRTF AudioToon & Rights BOM Preflight",
    ),
    beforeLabel: tShowcase("검수 전 · RGB 형광색 인쇄 탁화·라이선스 누락", "Before · Out-of-Gamut RGB & Unchecked Assets"),
    afterLabel: tShowcase("검수 후 · PDF/X-4 · 오디오툰 · Rights BOM 봉인", "After · PDF/X-4, AudioToon & Signed BOM"),
    beforeSummary: tShowcase(
      "형광 RGB 색상이 단행본 인쇄 시 칙칙하게 죽거나 외부 폰트·3D 에셋 출처 표기가 출고 직전 누락됩니다.",
      "Out-of-gamut RGB neon shifts muddy in print and font/3D asset licenses risk being missed at deadline.",
    ),
    afterSummary: tShowcase(
      "OKLCH→CMYK 색역 이탈 경보, 스크롤 연동 HRTF 오디오 스템, Rights BOM + WOTS+ 진본 서명을 한 번에 통과시킵니다.",
      "Validates OKLCH-to-CMYK gamut, scroll-synced HRTF audio stems, and Rights BOM + WOTS+ provenance.",
    ),
    engineBadge: tShowcase("CMYK PDF/X-4 · Rights BOM · WOTS+", "CMYK PDF/X-4 · Rights BOM · WOTS+"),
    metricBadge: tShowcase("라이선스 누락 0건 출고 게이트", "Zero Unlicensed Asset Export Gate"),
    evidencePath: "crates/studio-wasm64-drawing-core/src/color_cmyk_oklch_kernel.rs",
  },
]);

/* ── 5. 검증된 엔지니어링 & 보안 보증 스트립 데이터 ───────────────── */

export interface QualitySecurityAttestationItem {
  readonly id:
    | "doc-integrity"
    | "sharded-typecheck"
    | "wcag-aa-gate"
    | "pq-wots-zk"
    | "korean-pii-linear"
    | "zero-eager-bundle";
  readonly metricBadge: ShowcaseText;
  readonly title: ShowcaseText;
  readonly detail: ShowcaseText;
  readonly verifyCommand: string;
  readonly evidencePath: string;
}

export const QUALITY_SECURITY_ATTESTATIONS: readonly QualitySecurityAttestationItem[] = Object.freeze([
  {
    id: "doc-integrity",
    metricBadge: tShowcase("문서 링크", "Doc links"),
    title: tShowcase("관리 문서 무결성", "Managed Document Integrity"),
    detail: tShowcase(
      "ADR·아키텍처 지도·운영 런북의 교차 링크와 상태 표기를 자동 검증해 죽은 문서 참조를 차단합니다.",
      "Validates cross-links and lifecycle status across ADRs, architecture maps, and runbooks.",
    ),
    verifyCommand: "pnpm run validate:documentation",
    evidencePath: "scripts/validate-documentation.mjs",
  },
  {
    id: "sharded-typecheck",
    metricBadge: tShowcase("TypeScript", "TypeScript"),
    title: tShowcase("샤드 타입체크", "Sharded Typechecks"),
    detail: tShowcase(
      "`any` 우회 없이 대규모 프런트엔드·패키지 그래프를 메모리 안전 샤드로 분할해 strict 타입 계약을 강제합니다.",
      "Enforces strict TypeScript contracts across sharded frontend and workspace package graphs without `any`.",
    ),
    verifyCommand: "pnpm run typecheck:web",
    evidencePath: "scripts/typecheck-shards.mjs",
  },
  {
    id: "wcag-aa-gate",
    metricBadge: tShowcase("4.5:1 · 44×44px", "4.5:1 · 44×44px"),
    title: tShowcase("WCAG 2.2 AA 접근성 게이트", "WCAG 2.2 AA Accessibility Gate"),
    detail: tShowcase(
      "라이트·다크·고대비·강제 색상(Forced Colors)·키보드 포커스·모션 축소 계약을 E2E 스모크로 상시 점검합니다.",
      "Audits light/dark/contrast/forced-colors themes, keyboard focus order, and reduced motion.",
    ),
    verifyCommand: "pnpm exec playwright test --config config/playwright/playwright.a11y.config.ts",
    evidencePath: "config/playwright/playwright.a11y.config.ts",
  },
  {
    id: "pq-wots-zk",
    metricBadge: tShowcase("WOTS+ · Schnorr ZK", "WOTS+ · Schnorr ZK"),
    title: tShowcase("양자내성 WOTS+ · 영지식 소유권 증명", "Post-Quantum WOTS+ & ZK Ownership Proof"),
    detail: tShowcase(
      "RFC 8391 SHA-256 WOTS+ 일회성 체인 서명과 비밀 시드 무노출 Fiat-Shamir Schnorr 영지식 증명을 결합합니다.",
      "Pairs RFC 8391 SHA-256 WOTS+ hash-chain signatures with zero-seed-exposure Fiat-Shamir Schnorr NIZKPoK.",
    ),
    verifyCommand:
      "pnpm exec vitest run apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/wasm64-supergap-security-ops-hw.test.ts",
    evidencePath: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/pq-hash-signature.ts",
  },
  {
    id: "korean-pii-linear",
    metricBadge: tShowcase("O(n) 선형 마스킹", "O(n) Linear Redaction"),
    title: tShowcase("한국형 PII 선형 시간 마스킹", "Korean PII Linear-Time Masking"),
    detail: tShowcase(
      "주민등록번호·계좌·연락처·경로·장문 토큰을 백트래킹 없는 선형 시간 가드와 Secretlint로 송신·반출 전 걸러 냅니다.",
      "Redacts Korean RRN, bank accounts, contacts, file paths, and tokens in linear time before egress.",
    ),
    verifyCommand: "pnpm run quality:secrets",
    evidencePath: "apps/api/src/modules/studio-ai/openai-assist/studio-openai-guardrails.ts",
  },
  {
    id: "zero-eager-bundle",
    metricBadge: tShowcase("0B Eager 유입", "0B Eager Impact"),
    title: tShowcase("초기 번들 유입 0B", "0B Initial Bundle Bloat"),
    detail: tShowcase(
      "스튜디오 초기 진입 그래프에 무거운 3D·VRM·심화 WASM 도메인이 정적으로 섞이지 않도록 정적 그래프 게이트가 감시합니다.",
      "Static graph gate blocks heavy 3D, VRM, and pro WASM modules from leaking into initial entry chunks.",
    ),
    verifyCommand: "pnpm run check:studio-eager-graph",
    evidencePath: "scripts/check-studio-eager-graph.mjs",
  },
]);
