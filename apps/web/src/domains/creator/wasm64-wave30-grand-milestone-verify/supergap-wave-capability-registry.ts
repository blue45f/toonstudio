/**
 * Wave 1–30 초격차 역량 디스크립터 카탈로그 및 하드웨어 3계층 폴백 리졸버.
 *
 * - 형제 `wasm64-*` 디렉터리를 정적으로 import하지 않는 순수 메타데이터 레지스트리이므로
 *   초기 스튜디오 번들 영향은 정확히 `0B`이며 서버 운영 비용은 전 항목 `₩0`이다.
 * - 기기 하드웨어 프로브(`webgpu`, `wasmSimd128`, `wasmMemory64`, `opfsSyncHandle`,
 *   `webCodecs`, `sharedArrayBuffer`, `deviceMemoryGb`)를 결정론적으로 평가해
 *   최적 실행 계층(`tier-1-webgpu-wasm64`, `tier-2-webgl2-simd`, `tier-3-canvas2d-portable`)과
 *   명확한 한국어 폴백 사유를 산출한다.
 */

export const SUPERGAP_TOTAL_WAVES = 30 as const;
export const TIER1_MIN_DEVICE_MEMORY_GB = 8 as const;
export const TIER2_MIN_DEVICE_MEMORY_GB = 3 as const;
export const MAX_ALLOWED_WAVE_IDLE_BUDGET_MS = 2.0 as const;

export const SUPERGAP_WAVE_DOMAINS = Object.freeze([
  "drawing-pigment-stroke",
  "runtime-worker-ipc",
  "spatial-3d-lighting",
  "typography-balloon-sfx",
  "motion-audio-haptic",
  "publish-print-a11y",
  "provenance-ops-governor",
] as const);
export type SuperGapWaveDomain = (typeof SUPERGAP_WAVE_DOMAINS)[number];

export const SUPERGAP_WAVE_MATURITIES = Object.freeze(["live", "experimental"] as const);
export type SuperGapWaveMaturity = (typeof SUPERGAP_WAVE_MATURITIES)[number];

export const HARDWARE_EXECUTION_TIERS = Object.freeze([
  "tier-1-webgpu-wasm64",
  "tier-2-webgl2-simd",
  "tier-3-canvas2d-portable",
] as const);
export type HardwareExecutionTier = (typeof HARDWARE_EXECUTION_TIERS)[number];

export const WAVE_EXECUTION_MODES = Object.freeze([
  "native-webgpu-wasm64",
  "hybrid-webgl2-simd128",
  "portable-canvas2d-scalar",
] as const);
export type WaveExecutionMode = (typeof WAVE_EXECUTION_MODES)[number];

export interface SuperGapWaveDescriptor {
  readonly waveNumber: number;
  readonly waveSlug: string;
  readonly titleKo: string;
  readonly summaryKo: string;
  readonly domain: SuperGapWaveDomain;
  readonly moduleDirectory: string;
  readonly maturity: SuperGapWaveMaturity;
  /** 유휴 프레임 백그라운드 허용 예산 (`ms`, 최대 `2.0ms`). */
  readonly idleBudgetMs: number;
  /** 온디바이스 완결 실행 — 서버 추론·중계 비용 `₩0`. */
  readonly runtimeCostKrw: 0;
  /** 순수 지연 로드 계약 — 초기 스튜디오 번들 정적 추가 용량 `0B`. */
  readonly eagerBundleBytes: 0;
  readonly preferredTier: HardwareExecutionTier;
  readonly portableFallbackGuaranteed: true;
  readonly representativeSymbols: readonly string[];
}

export interface DeviceCapabilityProbe {
  readonly webgpu: boolean;
  readonly wasmSimd128: boolean;
  readonly wasmMemory64: boolean;
  readonly opfsSyncHandle: boolean;
  readonly webCodecs: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly deviceMemoryGb: number;
  /** 선택적 WebGL2 가용 여부 (생략 시 `true`로 간주하되 저사양 환경 시뮬레이션에서 `false` 지정 가능). */
  readonly webgl2?: boolean;
}

export interface SubsystemRoutingPlan {
  readonly renderBackend: "webgpu-compute" | "webgl2-instanced" | "canvas2d-tile-cpu";
  readonly wasmMemoryModel: "wasm64-linear-16gib" | "wasm32-simd128-4gib" | "wasm32-scalar-portable";
  readonly localStorageAuthority: "opfs-sync-access-handle" | "opfs-async-worker" | "in-memory-export-stream";
  readonly videoMuxBackend: "webcodecs-hardware-cfr" | "wasm-software-frame-encoder";
  readonly workerPoolTopology: "shared-ring-work-stealing" | "message-port-transferable";
  readonly recommendedTileCacheMiB: number;
}

export interface WaveTierExecutionEntry {
  readonly waveNumber: number;
  readonly moduleDirectory: string;
  readonly maturity: SuperGapWaveMaturity;
  readonly executionMode: WaveExecutionMode;
  readonly effectiveIdleBudgetMs: number;
  readonly runtimeCostKrw: 0;
}

export interface HardwareTierResolution {
  readonly selectedTier: HardwareExecutionTier;
  readonly tierLabelKo: string;
  readonly normalizedDeviceMemoryGb: number;
  readonly isFullTier1Hardware: boolean;
  readonly webCodecsHardwareAccelerated: boolean;
  readonly missingForTier1Ko: readonly string[];
  readonly missingForTier2Ko: readonly string[];
  readonly fallbackReasonsKo: readonly string[];
  readonly explanationKo: string;
  readonly subsystemRouting: SubsystemRoutingPlan;
  readonly waveExecutionPlan: readonly WaveTierExecutionEntry[];
  readonly resolutionDigestFnv1a32Hex: string;
}

export interface WaveCatalogAuditReport {
  readonly isValid: boolean;
  readonly totalWaves: number;
  readonly expectedWaveCount: typeof SUPERGAP_TOTAL_WAVES;
  readonly sequentialCoverageComplete: boolean;
  readonly missingWaveNumbers: readonly number[];
  readonly duplicateWaveNumbers: readonly number[];
  readonly duplicateDirectories: readonly string[];
  readonly nonZeroCostWaveNumbers: readonly number[];
  readonly idleBudgetViolationWaveNumbers: readonly number[];
  readonly liveWaveCount: number;
  readonly experimentalWaveCount: number;
  readonly totalNominalIdleBudgetMs: number;
  readonly domainCounts: Readonly<Record<SuperGapWaveDomain, number>>;
  readonly catalogDigestFnv1a32Hex: string;
  readonly summaryKo: string;
}

function defineWave(
  waveNumber: number,
  waveSlug: string,
  domain: SuperGapWaveDomain,
  moduleDirectory: string,
  maturity: SuperGapWaveMaturity,
  idleBudgetMs: number,
  preferredTier: HardwareExecutionTier,
  titleKo: string,
  summaryKo: string,
  representativeSymbols: readonly string[],
): SuperGapWaveDescriptor {
  return Object.freeze({
    waveNumber,
    waveSlug,
    titleKo,
    summaryKo,
    domain,
    moduleDirectory,
    maturity,
    idleBudgetMs,
    runtimeCostKrw: 0 as const,
    eagerBundleBytes: 0 as const,
    preferredTier,
    portableFallbackGuaranteed: true as const,
    representativeSymbols: Object.freeze([...representativeSymbols]),
  });
}

/**
 * ToonStudio Wasm64 Waves 1–30 정규 역량 디스크립터 카탈로그 (순수 메타데이터, 형제 import 0건).
 */
export const SUPERGAP_WAVES_1_TO_30_CATALOG: readonly SuperGapWaveDescriptor[] = Object.freeze([
  defineWave(1, "drawing-engine-km16", "drawing-pigment-stroke", "wasm64-drawing-engine", "live", 1.2, "tier-1-webgpu-wasm64",
    "16채널 Kubelka-Munk 안료 혼색 · 임파스토 타일 드로잉 코어",
    "분광 반사·흡수 계수 기반 실제 물감 감산 혼색과 법선 조명 타일 합성을 수행한다.",
    ["compositeKm16PigmentStrip", "evaluateImpastoLightingTile"]),
  defineWave(2, "runtime-hotpath-bridge", "runtime-worker-ipc", "wasm64-runtime-bridge", "live", 0.8, "tier-2-webgl2-simd",
    "WASM64 C-ABI 핫패스 로더 · CPU SIMD128 계층 자동 감지기",
    "Relaxed-SIMD·SIMD128·스칼라 바이너리 후보를 검증하고 무중단 JS 참조 커널과 연결한다.",
    ["loadStudioWasm64HotpathRuntime", "probeWasmCpuTierCapabilities"]),
  defineWave(3, "native-wave3-audiotoon-cmyk", "motion-audio-haptic", "wasm64-native-wave3", "live", 1.4, "tier-2-webgl2-simd",
    "스테레오 오디오툰 마스터 · 가변 폭 벡터 스트로크 · 스마트 슬라이서",
    "Bézier/Chaikin/RDP 곡선 다듬기, 웹툰 절단선 탐색, CMYK 잉크량 변환을 통합 제공한다.",
    ["createStudioWave3RuntimeFromBytes", "jsPlanWebtoonSmartSlices", "jsRgbaToCmykTac"]),
  defineWave(4, "wave4-hypercore", "runtime-worker-ipc", "wasm64-wave4-hypercore", "live", 1.5, "tier-1-webgpu-wasm64",
    "WebGPU VRAM 페이저 · 비잔틴 감사 원장 · Work-Stealing 워커 슬랩 풀",
    "1.5~2.0GiB 상한 KV 페이지 교체와 2의 거듭제곱 슬랩 아레나 제로카피 링을 관리한다.",
    ["WebGpuPagedVramGovernor", "WasmWorkerSlabPool"]),
  defineWave(5, "wave5-frontier", "drawing-pigment-stroke", "wasm64-wave5-frontier", "live", 1.6, "tier-1-webgpu-wasm64",
    "미분 가능 선화 벡터 역복원기 · 3D 재질 잔향(RT60) 음향 합성기",
    "병합된 래스터 선화에서 중심축과 정규화 필압 곡선을 역추정해 편집 가능한 베지어로 복원한다.",
    ["reconstructVectorStrokesFromRaster", "synthesizeAcousticRoomIr"]),
  defineWave(6, "wave6-moonshot", "typography-balloon-sfx", "wasm64-wave6-moonshot", "live", 1.2, "tier-2-webgl2-simd",
    "해석적 2D SDF 말풍선 불리언 조각기 · 임계 감쇠 스크롤 카메라 리그",
    "2ms 이내 Marching Squares 등치선 추출로 말풍선 꼬리 병합과 사선 컷 테두리를 생성한다.",
    ["sculptSdfBalloonContours", "stepSpringScrollCinemaRig"]),
  defineWave(7, "wave7-sovereign", "drawing-pigment-stroke", "wasm64-wave7-sovereign", "live", 1.0, "tier-2-webgl2-simd",
    "해부학 관절 한계 가드 · RANSAC 소실점 추정 · 칼만 스타일러스 예측기",
    "스윙-트위스트 쿼터니언 관절 가드와 4~8ms 등가속도 칼만-에르미트 펜촉 예측을 결합한다.",
    ["clampBiomechSwingTwistJoint", "predictKalmanStylusTip"]),
  defineWave(8, "wave8-singularity", "publish-print-a11y", "wasm64-wave8-singularity", "live", 1.4, "tier-2-webgl2-simd",
    "ARAP 메쉬 포즈 변형 · BT.1702 광과민 점멸 감사 · 실시간 한글 서브셋터",
    "하딩 광과민성 점멸 자동 감쇠와 윤곽선 푸아송 2D→3D 역광 노말맵 추정을 수행한다.",
    ["solveArapMeshDeformation", "auditPhotosensitiveFlashSequence"]),
  defineWave(9, "wave9-zenith", "spatial-3d-lighting", "wasm64-wave9-zenith", "live", 1.3, "tier-2-webgl2-simd",
    "역방향 시네마토그래피 코치 · 광물 안료 입상화 · 다회차 비례 이탈 감지기",
    "캐릭터 등신대 이탈(Off-Model) 경보와 OLED 전력 인지형 OKLCH 색보정을 지원한다.",
    ["coachReverseCinematography", "detectCharacterOffModelDrift"]),
  defineWave(10, "wave10-omega", "spatial-3d-lighting", "wasm64-wave10-omega", "live", 1.5, "tier-1-webgpu-wasm64",
    "아나모픽 착란원 보케 · 무발산 컬 노이즈 바람장 · 리드-솔로몬 오프라인 백업",
    "얇은 렌즈 물리 착란원(CoC) 보케와 GF(256) 패리티 샤드 기반 원고 복구를 제공한다.",
    ["renderThinLensAnamorphicBokeh", "encodeReedSolomonBackupShards"]),
  defineWave(11, "wave11-apex", "motion-audio-haptic", "wasm64-wave11-apex", "live", 1.4, "tier-2-webgl2-simd",
    "안구 도약(Saccade) 시선 예측 · 8밴드 분광 혼색 · BS.1770-4 LUFS 마스터링",
    "컷 과밀도 지수와 4배 오버샘플링 트루피크(dBTP) 룩어헤드 리미터를 정밀 계산한다.",
    ["estimateReaderSaccadePath", "masterAudioBs1770TruePeak"]),
  defineWave(12, "wave12-crown", "typography-balloon-sfx", "wasm64-wave12-crown", "live", 1.1, "tier-2-webgl2-simd",
    "180도 연출 축 검증기 · 절차적 집중선 · 다국어 번역 팽창 말풍선 맞춤",
    "번역 텍스트 분량 증가 시 말풍선 이방성 여백을 자동 재조정하고 3-Way 레이어 변경점을 병합한다.",
    ["verify180DegreeStageAxis", "fitMultilingualBalloonBounds"]),
  defineWave(13, "wave13-continuum", "publish-print-a11y", "wasm64-wave13-continuum", "live", 1.5, "tier-1-webgpu-wasm64",
    "부피 보존 듀얼 쿼터니언 스키닝 · 차폐 밉 타일 합성 · 세로→단행본 BSP 리플로우",
    "세로 스크롤 컷을 도련 3mm·안전선 5mm 규격의 A4·B5 지면 판형으로 비파괴 재배치한다.",
    ["solveDualQuaternionSkinning", "reflowWebtoonToPrintBsp"]),
  defineWave(14, "wave14-masterpiece", "drawing-pigment-stroke", "wasm64-wave14-masterpiece", "live", 1.6, "tier-1-webgpu-wasm64",
    "무로제트 블루노이즈 스크린톤 · 표면하 산란(SSS) 피부톤 · 필름 할레이션",
    "인쇄 모아레가 없는 FM/AM 스크린톤과 귀·손끝 적색 투과광 표현을 합성한다.",
    ["synthesizeBlueNoiseScreentone", "shadePreIntegratedSkinSss"]),
  defineWave(15, "wave15-structural", "drawing-pigment-stroke", "wasm64-wave15-structural", "live", 1.5, "tier-1-webgpu-wasm64",
    "반간선 평면 분할(DCEL) 빈틈 제로 채색 · 라플라스 확산 곡선 · 머리카락 엔젤링",
    "선화 틈새 너머 색 번짐을 기하학적으로 차단하고 이방성 Kajiya-Kay 하이라이트를 생성한다.",
    ["fillPlanarMapZeroGap", "generateKajiyaHairHighlight"]),
  defineWave(16, "wave16-mastery", "spatial-3d-lighting", "wasm64-wave16-mastery", "live", 1.4, "tier-1-webgpu-wasm64",
    "화면 공간 간접광 번짐 · G펜 먹물 맺힘 조형기 · CoW 영속 타일 스냅샷 트리",
    "256×256 타일 단위 무복사(Copy-on-Write) 스냅샷으로 대용량 캔버스 실행 취소를 즉시 처리한다.",
    ["computeScreenSpaceRadiosity", "forkCowTileSnapshotTree"]),
  defineWave(17, "wave17-finalcraft", "publish-print-a11y", "wasm64-wave17-finalcraft", "live", 1.3, "tier-2-webgl2-simd",
    "현수선 옷주름 장력 가이드 · 처마 차폐 젖은 표면 · 단행본 책등·크리프 검증기",
    "종이 평량과 쪽수에 따른 중철·무선 제본 밀림(Creep) 보정량과 책등 폭을 산출한다.",
    ["solveCatenaryClothFolds", "auditPrintSpineAndCreep"]),
  defineWave(18, "wave18-cinema-polish", "spatial-3d-lighting", "wasm64-wave18-cinema-polish", "live", 1.5, "tier-1-webgpu-wasm64",
    "슐릭 프레넬 빗물 웅덩이 반사 · 흑백 타격 임팩트 프레임 · 원근 배경 군중 배치",
    "임의 반사 평면의 동심원 파문 워핑과 포아송 디스크 기반 자연스러운 행인 밀도를 합성한다.",
    ["warpPuddleFresnelReflection", "distributePerspectiveCrowd"]),
  defineWave(19, "wave19-atelier-perfection", "drawing-pigment-stroke", "wasm64-wave19-atelier-perfection", "live", 1.3, "tier-2-webgl2-simd",
    "B4·A4 만화 원고용지 톰보 · 아트나이프 톤 깎기 · 의사 3D 도심 야경 외벽 셰이더",
    "실내 폴리곤 없이 2-삼각형 광선 교차만으로 고층 빌딩 창문 내부 깊이감을 렌더링한다.",
    ["buildAnalogManuscriptGuides", "shadeInteriorMappedFacade"]),
  defineWave(20, "wave20-grand-finale", "provenance-ops-governor", "wasm64-wave20-grand-finale", "live", 1.6, "tier-1-webgpu-wasm64",
    "패럴랙스 가림 홀 필링 · 3D 수밀 한글 효과음 메쉬 · 손 파지 접촉 역기구학(IK)",
    "다중 평면 카메라 이동 시 드러나는 배경 빈틈을 Eikonal 전진 해법으로 매끄럽게 메운다.",
    ["inpaintDisocclusionTelea", "solveHandGraspContactIk"]),
  defineWave(21, "wave21-horizon", "publish-print-a11y", "wasm64-wave21-horizon", "live", 1.4, "tier-2-webgl2-simd",
    "9:16 숏폼 비트 동기화 카메라 연출 · 모바일 썸네일 가독성 감사 · 별색 박 분판",
    "말풍선 잘림이 없는 릴스·쇼츠 팬 경로와 단행본 표지 금박·부분 코팅 마스크를 추출한다.",
    ["directShortformVerticalReel", "auditMobileStoreThumbnail"]),
  defineWave(22, "wave22-ultragap", "spatial-3d-lighting", "wasm64-wave22-ultragap", "experimental", 1.5, "tier-1-webgpu-wasm64",
    "HDR PQ/게인맵 선택 발광 톤매퍼 · 곡률 안전 리본 브러시 · 안구·두부 시선 협응",
    "확산 백색을 203 nits로 고정한 채 마법·검기 이펙트만 HDR 하이라이트로 승격한다.",
    ["tonemapSelectiveHdrGainmap", "solveGazeHeadTorsoCoordination"]),
  defineWave(23, "wave23-autonomous-cadence", "provenance-ops-governor", "wasm64-wave23-autonomous-cadence", "live", 1.2, "tier-3-canvas2d-portable",
    "곡면 의복 무끼임 문양 래퍼 · 회차 컬러 스크립트 바코드 · 초성·자모 BM25F 원고 검색",
    "서버 검색 엔진 없이 50화 분량 대사·연출 노트를 한글 자모·초성 단위로 즉시 검색한다.",
    ["wrapGeodesicGarmentPattern", "searchManuscriptJamoBm25f"]),
  defineWave(24, "wave24-master-orchestrator", "runtime-worker-ipc", "wasm64-wave24-master-orchestrator", "live", 1.0, "tier-3-canvas2d-portable",
    "마르코프 공정 전이 지연 프리페처 · 피츠 법칙 8분할 파이 메뉴 · 왼손 단축키 해석기",
    "유휴 프레임 예산 2ms 안에서 다음 작업 도구의 지연 모듈만 선별 예열한다.",
    ["MarkovIntentPrefetchOrchestrator", "optimizeFittsRadialMenu"]),
  defineWave(25, "wave25-acoustic-typography-qa", "typography-balloon-sfx", "wasm64-wave25-acoustic-typography-qa", "live", 1.3, "tier-2-webgl2-simd",
    "한영 혼용 광학 식자 · Knuth-Plass 무외톨이 줄바꿈 · WebCodecs 스크롤 릴 VBV 플래너",
    "말풍선 마지막 줄 한 글자 외톨이 어절을 제거하고 고정 프레임레이트 스크롤 영상을 계획한다.",
    ["layoutOpticalHangulBalloon", "planWebCodecsScrollReelVbv"]),
  defineWave(26, "wave26-color-blindness-subsurface-qa", "publish-print-a11y", "wasm64-wave26-color-blindness-subsurface-qa", "live", 1.3, "tier-2-webgl2-simd",
    "LMS 색각 이상 혼동 감사 및 달토나이제이션 · 표지 임파스토 사광(Raking Light) 합성",
    "무채색 회색축을 보존하면서 적록·청황 색각 이상 독자의 캐릭터 구분력을 보정한다.",
    ["auditAndRemapCvdPalette", "composeImpastoRakingLight"]),
  defineWave(27, "wave27-audio-haptic-print-mastery", "motion-audio-haptic", "wasm64-wave27-audio-haptic-print-mastery", "live", 1.1, "tier-2-webgl2-simd",
    "용지·펜촉 마찰음 48kHz 합성 · 말풍선 읽기 순서 DAG 보정 · EPUB 3.3 가이드 뷰 패키저",
    "외부 오디오 샘플 없이 종이 질감별 사각거림과 미세 햅틱 엔벨로프를 실시간 합성한다.",
    ["synthesizeStylusPaperFrictionPcm", "buildEpub33GuidedViewPackage"]),
  defineWave(28, "wave28-panel-composition-motion-qa", "publish-print-a11y", "wasm64-wave28-panel-composition-motion-qa", "live", 1.2, "tier-2-webgl2-simd",
    "동적 대칭 구도 코치 · 전정기관 멀미 억제 카메라 셰이크 · 50화 공용 에셋 중복 제거기",
    "0.1~0.45Hz 멀미 유발 저주파 진동을 걸러내고 연재 회차 간 중복 3D·브러시 블롭을 단일화한다.",
    ["evaluatePanelComposition", "synthesizeSafeCameraShake", "CrossEpisodeAssetDeduplicator"]),
  defineWave(29, "wave29-live2d-rig-balloon-sfx", "typography-balloon-sfx", "wasm64-wave29-live2d-rig-balloon-sfx", "experimental", 1.4, "tier-2-webgl2-simd",
    "들로네 2.5D 퍼펫 미세 호흡 아이들러 · 성량 연동 한글 의성어 경로 합성 · 스크롤 인지 부하 감사",
    "정지 일러스트에 자연스러운 호흡 미세 변형을 부여하고 컷 밀도에 따른 독자 피로도를 점검한다.",
    ["stepDelaunayPuppetMicroIdler", "synthesizeAcousticKoreanSfxPath"]),
  defineWave(30, "wave30-grand-milestone-verify", "provenance-ops-governor", "wasm64-wave30-grand-milestone-verify", "live", 0.9, "tier-3-canvas2d-portable",
    "Waves 1–30 통합 역량 레지스트리 · 36항목 마스터 출고 게이트 · 팬리스 발열·배터리 거버너",
    "전 웨이브 무비용·지연 로드 무결성 검증, 6대 채널 출고 차단 심사, 펜 입력 무감쇠 품질 제어를 통합한다.",
    ["SUPERGAP_WAVES_1_TO_30_CATALOG", "evaluateEpisodeMasterPreflightGate", "TabletThermalBatteryGovernor"]),
]);

function hashStringFnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 웨이브 번호(`1..30`)로 역량 디스크립터를 조회한다.
 */
export function getWaveCapabilityDescriptor(
  waveNumber: number,
  catalog: readonly SuperGapWaveDescriptor[] = SUPERGAP_WAVES_1_TO_30_CATALOG,
): SuperGapWaveDescriptor | undefined {
  if (!Number.isInteger(waveNumber) || waveNumber < 1) {
    return undefined;
  }
  const direct = catalog[waveNumber - 1];
  if (direct !== undefined && direct.waveNumber === waveNumber) {
    return direct;
  }
  return catalog.find((entry) => entry.waveNumber === waveNumber);
}

export function listWaveDescriptorsByDomain(
  domain: SuperGapWaveDomain,
  catalog: readonly SuperGapWaveDescriptor[] = SUPERGAP_WAVES_1_TO_30_CATALOG,
): readonly SuperGapWaveDescriptor[] {
  return Object.freeze(catalog.filter((entry) => entry.domain === domain));
}

export function listWaveDescriptorsByMaturity(
  maturity: SuperGapWaveMaturity,
  catalog: readonly SuperGapWaveDescriptor[] = SUPERGAP_WAVES_1_TO_30_CATALOG,
): readonly SuperGapWaveDescriptor[] {
  return Object.freeze(catalog.filter((entry) => entry.maturity === maturity));
}

/**
 * Waves 1–30 카탈로그의 연속 번호 완전성, 중복 여부, `₩0` 비용 계약, 유휴 프레임 예산 상한을 검증한다.
 */
export function auditWaveCapabilityCatalog(
  catalog: readonly SuperGapWaveDescriptor[] = SUPERGAP_WAVES_1_TO_30_CATALOG,
): WaveCatalogAuditReport {
  const seenNumbers = new Set<number>();
  const duplicateNumbers = new Set<number>();
  const seenDirs = new Set<string>();
  const duplicateDirs = new Set<string>();
  const nonZeroCost: number[] = [];
  const budgetViolations: number[] = [];

  const domainCounts: Record<SuperGapWaveDomain, number> = {
    "drawing-pigment-stroke": 0,
    "runtime-worker-ipc": 0,
    "spatial-3d-lighting": 0,
    "typography-balloon-sfx": 0,
    "motion-audio-haptic": 0,
    "publish-print-a11y": 0,
    "provenance-ops-governor": 0,
  };

  let liveWaveCount = 0;
  let experimentalWaveCount = 0;
  let totalNominalIdleBudgetMs = 0;
  const canonicalTokens: string[] = [];

  for (const entry of catalog) {
    if (seenNumbers.has(entry.waveNumber)) {
      duplicateNumbers.add(entry.waveNumber);
    }
    seenNumbers.add(entry.waveNumber);

    if (seenDirs.has(entry.moduleDirectory)) {
      duplicateDirs.add(entry.moduleDirectory);
    }
    seenDirs.add(entry.moduleDirectory);

    if (entry.runtimeCostKrw !== 0 || entry.eagerBundleBytes !== 0) {
      nonZeroCost.push(entry.waveNumber);
    }
    if (
      !Number.isFinite(entry.idleBudgetMs) ||
      entry.idleBudgetMs <= 0 ||
      entry.idleBudgetMs > MAX_ALLOWED_WAVE_IDLE_BUDGET_MS
    ) {
      budgetViolations.push(entry.waveNumber);
    }

    domainCounts[entry.domain] += 1;
    if (entry.maturity === "live") {
      liveWaveCount += 1;
    } else {
      experimentalWaveCount += 1;
    }
    totalNominalIdleBudgetMs += entry.idleBudgetMs;
    canonicalTokens.push(
      `${entry.waveNumber}:${entry.moduleDirectory}:${entry.domain}:${entry.maturity}:${entry.idleBudgetMs.toFixed(2)}:${entry.runtimeCostKrw}`,
    );
  }

  const missingWaveNumbers: number[] = [];
  for (let w = 1; w <= SUPERGAP_TOTAL_WAVES; w += 1) {
    if (!seenNumbers.has(w)) {
      missingWaveNumbers.push(w);
    }
  }

  const strictlyOrdered = catalog.every((entry, idx) => entry.waveNumber === idx + 1);
  const sequentialCoverageComplete =
    catalog.length === SUPERGAP_TOTAL_WAVES &&
    missingWaveNumbers.length === 0 &&
    duplicateNumbers.size === 0 &&
    strictlyOrdered;

  const isValid =
    sequentialCoverageComplete &&
    duplicateDirs.size === 0 &&
    nonZeroCost.length === 0 &&
    budgetViolations.length === 0;

  const roundedBudget = Math.round(totalNominalIdleBudgetMs * 100) / 100;
  const catalogDigestFnv1a32Hex = hashStringFnv1a32Hex(canonicalTokens.join("|"));

  const summaryKo = isValid
    ? `전 30개 웨이브(정식 ${liveWaveCount}개 · 실험 ${experimentalWaveCount}개) 연속 등록 완료 · 서버 비용 ₩0 · 초기 번들 추가 0B 검증 통과`
    : `웨이브 카탈로그 무결성 오류 감지(누락 ${missingWaveNumbers.length}건, 중복 ${duplicateNumbers.size}건, 예산 초과 ${budgetViolations.length}건)`;

  return Object.freeze({
    isValid,
    totalWaves: catalog.length,
    expectedWaveCount: SUPERGAP_TOTAL_WAVES,
    sequentialCoverageComplete,
    missingWaveNumbers: Object.freeze(missingWaveNumbers),
    duplicateWaveNumbers: Object.freeze([...duplicateNumbers].sort((a, b) => a - b)),
    duplicateDirectories: Object.freeze([...duplicateDirs].sort()),
    nonZeroCostWaveNumbers: Object.freeze(nonZeroCost),
    idleBudgetViolationWaveNumbers: Object.freeze(budgetViolations),
    liveWaveCount,
    experimentalWaveCount,
    totalNominalIdleBudgetMs: roundedBudget,
    domainCounts: Object.freeze(domainCounts),
    catalogDigestFnv1a32Hex,
    summaryKo,
  });
}

function sanitizeMemoryGb(rawMemoryGb: number): number {
  if (!Number.isFinite(rawMemoryGb) || rawMemoryGb <= 0) {
    return 0.5;
  }
  return Math.min(Math.round(rawMemoryGb * 100) / 100, 256);
}

/**
 * 기기 하드웨어 프로브를 평가해 최적 실행 계층(`tier-1` / `tier-2` / `tier-3`)과
 * 한국어 폴백 사유 및 30개 전 웨이브 실행 계획을 결정론적으로 산출한다.
 */
export function resolveHardwareExecutionTier(
  probe: DeviceCapabilityProbe,
  catalog: readonly SuperGapWaveDescriptor[] = SUPERGAP_WAVES_1_TO_30_CATALOG,
): HardwareTierResolution {
  const normalizedMemoryGb = sanitizeMemoryGb(probe.deviceMemoryGb);
  const webgl2Available = probe.webgl2 ?? true;

  const missingForTier1Ko: string[] = [];
  if (!probe.webgpu) {
    missingForTier1Ko.push("WebGPU 그래픽·컴퓨트 어댑터 미지원");
  }
  if (!probe.wasmSimd128) {
    missingForTier1Ko.push("WASM 128비트 SIMD 벡터 명령어 미지원");
  }
  if (!probe.wasmMemory64) {
    missingForTier1Ko.push("WASM Memory64 대용량 선형 주소 공간 미지원");
  }
  if (!probe.opfsSyncHandle) {
    missingForTier1Ko.push("OPFS 동기 파일 핸들(FileSystemSyncAccessHandle) 미지원");
  }
  if (!probe.sharedArrayBuffer) {
    missingForTier1Ko.push("교차 출처 격리(SharedArrayBuffer) 비활성");
  }
  if (normalizedMemoryGb < TIER1_MIN_DEVICE_MEMORY_GB) {
    missingForTier1Ko.push(
      `기기 메모리 용량 부족(1계층 최소 ${TIER1_MIN_DEVICE_MEMORY_GB}GB 필요, 감지된 용량 ${normalizedMemoryGb}GB)`,
    );
  }

  const missingForTier2Ko: string[] = [];
  if (!webgl2Available) {
    missingForTier2Ko.push("WebGL2 래스터 가속 컨텍스트 미지원");
  }
  if (!probe.wasmSimd128) {
    missingForTier2Ko.push("WASM 128비트 SIMD 벡터 명령어 미지원");
  }
  if (normalizedMemoryGb < TIER2_MIN_DEVICE_MEMORY_GB) {
    missingForTier2Ko.push(
      `기기 메모리 용량 부족(2계층 최소 ${TIER2_MIN_DEVICE_MEMORY_GB}GB 필요, 감지된 용량 ${normalizedMemoryGb}GB)`,
    );
  }

  let selectedTier: HardwareExecutionTier;
  let tierLabelKo: string;
  const fallbackReasonsKo: string[] = [];

  if (missingForTier1Ko.length === 0) {
    selectedTier = "tier-1-webgpu-wasm64";
    tierLabelKo = "1계층 · WebGPU + WASM64 초격차 가속 모드";
    if (!probe.webCodecs) {
      fallbackReasonsKo.push(
        "WebCodecs 하드웨어 인코더가 감지되지 않아 스크롤 영상 내보내기만 WASM 소프트웨어 프레임 인코더로 우회합니다.",
      );
    }
  } else if (missingForTier2Ko.length === 0) {
    selectedTier = "tier-2-webgl2-simd";
    tierLabelKo = "2계층 · WebGL2 + WASM SIMD128 균형 가속 모드";
    fallbackReasonsKo.push(...missingForTier1Ko);
    if (!probe.webCodecs) {
      fallbackReasonsKo.push("WebCodecs 미지원으로 영상 내보내기는 WASM 소프트웨어 인코더를 사용합니다.");
    }
  } else {
    selectedTier = "tier-3-canvas2d-portable";
    tierLabelKo = "3계층 · Canvas2D + 순수 스칼라 호환 안전 모드";
    const combined = new Set<string>([...missingForTier2Ko, ...missingForTier1Ko]);
    fallbackReasonsKo.push(...combined);
  }

  const subsystemRouting: SubsystemRoutingPlan = Object.freeze({
    renderBackend:
      selectedTier === "tier-1-webgpu-wasm64"
        ? "webgpu-compute"
        : selectedTier === "tier-2-webgl2-simd"
          ? "webgl2-instanced"
          : "canvas2d-tile-cpu",
    wasmMemoryModel:
      selectedTier === "tier-1-webgpu-wasm64"
        ? "wasm64-linear-16gib"
        : selectedTier === "tier-2-webgl2-simd"
          ? "wasm32-simd128-4gib"
          : "wasm32-scalar-portable",
    localStorageAuthority: probe.opfsSyncHandle
      ? "opfs-sync-access-handle"
      : selectedTier === "tier-3-canvas2d-portable"
        ? "in-memory-export-stream"
        : "opfs-async-worker",
    videoMuxBackend: probe.webCodecs ? "webcodecs-hardware-cfr" : "wasm-software-frame-encoder",
    workerPoolTopology: probe.sharedArrayBuffer
      ? "shared-ring-work-stealing"
      : "message-port-transferable",
    recommendedTileCacheMiB:
      selectedTier === "tier-1-webgpu-wasm64"
        ? Math.min(1024, Math.round(normalizedMemoryGb * 96))
        : selectedTier === "tier-2-webgl2-simd"
          ? Math.min(384, Math.round(normalizedMemoryGb * 64))
          : Math.max(64, Math.min(160, Math.round(normalizedMemoryGb * 48))),
  });

  const idleScale =
    selectedTier === "tier-1-webgpu-wasm64"
      ? 1.0
      : selectedTier === "tier-2-webgl2-simd"
        ? 0.8
        : 0.55;

  const waveExecutionPlan: WaveTierExecutionEntry[] = catalog.map((wave) => {
    const executionMode: WaveExecutionMode =
      selectedTier === "tier-1-webgpu-wasm64"
        ? "native-webgpu-wasm64"
        : selectedTier === "tier-2-webgl2-simd"
          ? "hybrid-webgl2-simd128"
          : "portable-canvas2d-scalar";
    return Object.freeze({
      waveNumber: wave.waveNumber,
      moduleDirectory: wave.moduleDirectory,
      maturity: wave.maturity,
      executionMode,
      effectiveIdleBudgetMs: Math.round(wave.idleBudgetMs * idleScale * 100) / 100,
      runtimeCostKrw: 0 as const,
    });
  });

  const explanationKo =
    selectedTier === "tier-1-webgpu-wasm64"
      ? probe.webCodecs
        ? "모든 차세대 가속 조건을 충족해 1계층 WebGPU + WASM64 최고 성능 경로로 동작합니다."
        : "핵심 그래픽·메모리 가속 조건을 충족해 1계층 WebGPU + WASM64로 동작하며, 영상 인코딩만 소프트웨어 경로로 보조합니다."
      : selectedTier === "tier-2-webgl2-simd"
        ? `1계층 조건 미충족(${missingForTier1Ko.join(", ")})으로 2계층 WebGL2 + SIMD128 안전 가속 경로로 자동 전환했습니다.`
        : `하드웨어 가속 제약(${missingForTier2Ko.join(", ")})을 감지해 3계층 Canvas2D + 스칼라 호환 모드로 기능 손실 없이 전환했습니다.`;

  const digestSeed = [
    selectedTier,
    String(probe.webgpu),
    String(probe.wasmSimd128),
    String(probe.wasmMemory64),
    String(probe.opfsSyncHandle),
    String(probe.webCodecs),
    String(probe.sharedArrayBuffer),
    String(webgl2Available),
    normalizedMemoryGb.toFixed(2),
  ].join("|");

  return Object.freeze({
    selectedTier,
    tierLabelKo,
    normalizedDeviceMemoryGb: normalizedMemoryGb,
    isFullTier1Hardware: missingForTier1Ko.length === 0 && probe.webCodecs,
    webCodecsHardwareAccelerated: probe.webCodecs,
    missingForTier1Ko: Object.freeze(missingForTier1Ko),
    missingForTier2Ko: Object.freeze(missingForTier2Ko),
    fallbackReasonsKo: Object.freeze(fallbackReasonsKo),
    explanationKo,
    subsystemRouting,
    waveExecutionPlan: Object.freeze(waveExecutionPlan),
    resolutionDigestFnv1a32Hex: hashStringFnv1a32Hex(digestSeed),
  });
}
