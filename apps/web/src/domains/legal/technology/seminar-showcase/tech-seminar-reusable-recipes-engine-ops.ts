/**
 * 타 사이트 표준 재사용 실무 레시피 6선 — 핵심 라이브러리 · WebGPU · 오프라인/배포 영역 (4~6번).
 *
 * 발췌 코드·수치·경로는 ToonStudio 실제 저장소 파일에서 직접 검증한 내용만 수록한다.
 */

import type { TechSeminarReusableRecipe } from "./tech-seminar-reusable-recipes";

export const SEMINAR_RECIPES_ENGINE_AND_OPS: readonly TechSeminarReusableRecipe[] = Object.freeze([
  {
    id: "production-core-libraries",
    order: 4,
    category: "engine",
    badge: "실전 라이브러리 5종",
    title: "실전 핵심 라이브러리 활용법(ag-psd · Rapier3D · Three-VRM · SQLite-WASM · fflate)",
    analogy:
      "현장 공구함 5종 세트입니다. 도구를 그대로 꺼내 쓰지 않고 '안전 커버(Worker·예산·시그니처 검증)'를 씌워 브라우저가 멈추거나 파일이 깨지지 않게 씁니다.",
    oneLineSummary:
      "대용량 브라우저 라이브러리는 동적 임포트·전용 Worker 격리·메모리 예산 가드·출력 바이너리 검증의 4가지 공통 경계 뒤에 숨겨야 안전합니다.",
    relatedChapterId: "wasm64-opfs-crdt",
    diagram: {
      ariaLabel: "실전 핵심 라이브러리 5종 안전 격리 및 경계 파이프라인",
      caption: "UI 메인 스레드에서 대형 패키지를 격리하고 계약·예산·바이너리 검증을 통과시키는 구조",
      nodes: [
        { title: "1. 지연 로드", detail: "dynamic import · 청크 분리", tone: "accent" },
        { title: "2. Worker 격리", detail: "Rapier3D · SQLite SAHPool", tone: "cool" },
        { title: "3. 예산·세대 가드", detail: "PSD 8.3Mpx · VRM 세대 추적", tone: "warn" },
        { title: "4. 바이너리 검증", detail: "8BPS 헤더 · Rights BOM ZIP", tone: "good" },
      ],
      edgeLabels: ["초기 번들 0B", "Transferable / RPC", "fail-closed 출력"],
      guardNote:
        "공통 원칙: ag-psd(4레이어+8BPS 검증), Rapier3D(결정론 Worker), Three-VRM(세대 소유자), SQLite-WASM(단일 opfs-sahpool), fflate(이미지 STORE 무압축 + 500MB 상한)",
    },
    apiSpecs: [
      {
        endpointOrSymbol: "ag-psd · buildBg3dMultiPassPsd",
        methodOrKind: "apps/web/.../studio-bg3d-multipass-psd.ts",
        requestOrInput: "4개 RGBA8 패스(선화·음영 multiply·밑색·배경), 캔버스 <= 2,097,152px",
        responseOrOutput: "Blob (image/vnd.adobe.photoshop) + receipt (8BPS 시그니처 0x38 42 50 53 검증)",
        errorContract: "없는 패스는 빈 레이어로 위조하지 않고 skipped에 사유 기록",
      },
      {
        endpointOrSymbol: "@dimforge/rapier3d-deterministic-compat",
        methodOrKind: "apps/web/.../studio-bg3d-physics.worker.ts",
        requestOrInput: "DedicatedWorker 내 RAPIER.init() 싱글턴 + 고정 스텝 타임라인 입력",
        responseOrOutput: "Float32Array(프레임 × 동적 강체 × 7 stride: xyz + xyzw 쿼터니언)",
        errorContract: "NaN/Inf 발생 시 non-finite-simulation-result 즉시 throw, try/finally로 world 정리",
      },
      {
        endpointOrSymbol: "@pixiv/three-vrm · createStudioBg3dLinkedVrmRuntimeOwner",
        methodOrKind: "apps/web/.../studio-bg3d-shared-vrm-runtime.ts",
        requestOrInput: "로드된 VRM 인스턴스 + modelRuntimeKey (머리 길이 측정 선검증)",
        responseOrOutput: "단일 rest 스냅샷·정규화 릭 수명 소유자(세대 ID 발급 및 dispose 트랜잭션)",
        errorContract: "모델 세대 불일치 시 model-generation-mismatch로 스테일 포즈 덮어쓰기 차단",
      },
      {
        endpointOrSymbol: "@sqlite.org/sqlite-wasm · loadStudioLocalDatabaseWorkerSqlite",
        methodOrKind: "apps/web/.../studio-local-database-worker-sqlite-loader.ts",
        requestOrInput: "DedicatedWorker 전역에 sqlite3ApiConfig로 opfs/opfs-wl 비활성화 후 dynamic import",
        responseOrOutput: "opfs-sahpool 전용 StudioSqliteApiHandle (단일 Worker 쓰기 권위)",
        errorContract: "중복 초기화 감지 시 즉시 throw, finally에서 sqlite3ApiConfig 정리",
      },
      {
        endpointOrSymbol: "fflate · createEpisodeDeliveryPackZip",
        methodOrKind: "apps/web/.../delivery-pack-bundler.ts",
        requestOrInput: "Rights BOM 통과 결과 + 선택적 슬라이스 바이너리(zipPath → Uint8Array)",
        responseOrOutput: "결정적 ZIP Uint8Array (고정 mtime 2026-01-01, jpg/png/webp는 level: 0 STORE)",
        errorContract: "Rights BOM 미통과·경로 이탈·총 500MB 초과 시 fail-closed 예외",
      },
    ],
    codeExcerpt: {
      title: "SQLite-WASM 단일 opfs-sahpool 로더 + fflate 결정적 ZIP 번들러",
      language: "ts",
      sourcePath: "apps/web/src/domains/creator/studio-local-database-worker-sqlite-loader.ts",
      code: `export async function loadStudioLocalDatabaseWorkerSqlite(
  options: StudioLocalDatabaseWorkerSqliteLoaderOptions = {},
): Promise<StudioSqliteApiHandle> {
  const globalObject = options.globalObject ?? (globalThis as StudioSqliteApiConfigGlobal);
  if (Object.hasOwn(globalObject, "sqlite3ApiConfig")) {
    throw new Error("sqlite3ApiConfig is already owned by another initializer in this Worker");
  }
  // Vite 번들에서 불필요한 추가 async proxy Worker가 뜨지 않도록 opfs-sahpool만 활성화한다.
  const config = Object.freeze({
    disable: Object.freeze({ vfs: Object.freeze({ opfs: true, "opfs-vfs": true, "opfs-wl": true }) }),
    wasmfsOpfsDir: false,
  });
  globalObject.sqlite3ApiConfig = config;
  try {
    const module = await (options.loadModule ?? (async () => {
      const loaded = await import("@sqlite.org/sqlite-wasm");
      return loaded as unknown as StudioSqliteWasmModule;
    }))();
    return await module.default();
  } finally {
    if (globalObject.sqlite3ApiConfig === config) delete globalObject.sqlite3ApiConfig;
  }
}

// apps/web/src/domains/creator/delivery-pack/delivery-pack-bundler.ts
const STORE_ONLY_EXTENSION = /\\.(?:jpe?g|png|webp|gif|zip)$/iu;
const ZIP_FIXED_MTIME = new Date(Date.UTC(2026, 0, 1));
// 이미 압축된 이미지는 level: 0(STORE)로 묶어 CPU 낭비를 없애고, 고정 mtime으로 결정적 해시를 보장한다.
zippable[zipPath] = [data, { level: STORE_ONLY_EXTENSION.test(zipPath) ? 0 : 6, mtime: ZIP_FIXED_MTIME }];`,
    },
    repoEvidencePaths: [
      "apps/web/src/domains/creator/studio-local-database-worker-sqlite-loader.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-multipass-psd.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-physics.worker.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-shared-vrm-runtime.ts",
      "apps/web/src/domains/creator/delivery-pack/delivery-pack-bundler.ts",
    ],
    adoptionSteps: [
      {
        step: 1,
        title: "무거운 WASM·바이너리 패키지는 모두 dynamic import + Worker 경계로 격리",
        action:
          "초기 라우트 정적 import 목록에서 @sqlite.org/sqlite-wasm, Rapier3D, ag-psd, Three-VRM을 제거하고, 실제 사용자가 내보내기·3D·물리를 켤 때만 로드합니다.",
        check: "초기 진입 번들 크기가 늘지 않고(check:studio-eager-graph +0B), 메인 스레드 롱태스크가 사라짐",
      },
      {
        step: 2,
        title: "입력 예산 상한과 출력 무결성 검증을 래퍼 함수에 고정",
        action:
          "ag-psd는 픽셀 합계 예산과 8BPS 시그니처(0x38 42 50 53)를, fflate는 경로 traversal 검사와 500MB 상한을, Rapier3D는 NaN/Inf 검사를 래퍼 안에 넣습니다.",
        check: "비정상 입력을 넣었을 때 브라우저 탭 OOM이나 깨진 파일 다운로드 대신 명확한 에러가 반환됨",
      },
      {
        step: 3,
        title: "환경·번들러 함정을 초기화 계층에서 차단",
        action:
          "SQLite-WASM은 Vite optimizeDeps.exclude에 등록하고 불필요한 VFS(opfs-wl 등)를 꺼서 opfs-sahpool 단일 워커로 고정하며, fflate는 이미 압축된 이미지에 level: 0을 지정합니다.",
        check: "프로덕션 빌드(vite build) 후 네트워크 탭에서 실패하는 워커 URL 404가 0건인지 확인",
      },
    ],
    gotchas: [
      "ag-psd는 children 레이어를 넣더라도 최상위 imageData를 비워 두면 포토샵·OS 미리보기가 검은 화면으로 보입니다. 직접 합성한 미리보기 imageData를 함께 기록하세요(studio-bg3d-multipass-psd.ts:467).",
      "@sqlite.org/sqlite-wasm은 기본 초기화 시 opfs·opfs-wl용 보조 Worker를 따로 띄우려다 Vite 프로덕션 번들 경로에서 깨지기 쉽습니다. sqlite3ApiConfig로 opfs-sahpool만 남기세요.",
      "fflate zipSync에 JPEG/PNG 이미지를 기본 압축 레벨(6)로 넣으면 용량은 거의 안 줄고 브라우저 CPU 시간만 수 배로 늘어납니다. 이미지는 level: 0(STORE)으로 묶으세요.",
    ],
    speakerNotes: [
      "라이브러리 5종을 한 번에 정리한 이유는, 다 다른 도메인 같아도 실무에서 터지는 지점이 똑같기 때문입니다 — 초기 번들 비대화, 메인 스레드 블로킹, 깨진 파일 출력입니다.",
      "ToonStudio는 SQLite-WASM을 단 하나의 DedicatedWorker에 가두고 opfs-sahpool만 켭니다. 덕분에 COOP/COEP 없이도 빠른 동기 파일 핸들을 안전하게 씁니다.",
      "납품 ZIP을 묶는 fflate에서는 JPEG·PNG를 level 0 무압축으로 넣고 mtime을 2026-01-01로 고정해, 같은 입력이면 언제 묶어도 바이트가 100% 같은 결정적 ZIP을 만듭니다.",
    ],
    officialLinks: [
      {
        label: "ag-psd · PSD 읽기/쓰기 라이브러리",
        url: "https://github.com/Agamnentzar/ag-psd",
        kind: "라이브러리",
      },
      {
        label: "Rapier3D · JavaScript/WASM 물리 엔진 문서",
        url: "https://rapier.rs/docs/user_guides/javascript/getting_started_js",
        kind: "공식 문서",
      },
      {
        label: "@pixiv/three-vrm · VRM 휴머노이드 런타임",
        url: "https://github.com/pixiv/three-vrm",
        kind: "라이브러리",
      },
      {
        label: "SQLite WASM · OPFS SAHPool 공식 문서",
        url: "https://sqlite.org/wasm/doc/trunk/index.md",
        kind: "공식 문서",
      },
      {
        label: "fflate · 고속 자바스크립트 ZIP 압축",
        url: "https://github.com/101arrowz/fflate",
        kind: "라이브러리",
      },
    ],
  },
  {
    id: "webgpu-wgsl-cpu-parity",
    order: 5,
    category: "engine",
    badge: "WebGPU · WGSL · CPU 동등성",
    title: "WebGPU WGSL Compute + CPU 폴백 동등성 아키텍처",
    analogy:
      "같은 레시피 카드 한 장을 주방장 64명(GPU 워크그룹)과 1인 요리사(CPU 폴백)가 동시에 보고 요리해서, 어느 쪽이 만들어도 맛(색상 오차)이 똑같이 나오게 하는 설계입니다.",
    oneLineSummary:
      "7밴드 Kubelka-Munk 상수와 수식을 TypeScript 단일 원본에 두고, WGSL 셰이더에 직접 주입하면서 Math.fround f32 CPU 미러로 수치 동등성을 테스트합니다.",
    relatedChapterId: "webgpu-km7-binning",
    diagram: {
      ariaLabel: "WebGPU WGSL Compute와 CPU Math.fround 동등성 검증 아키텍처",
      caption: "단일 상수 원본에서 WGSL 코드 생성과 CPU f32 미러 검증이 갈라지는 구조",
      nodes: [
        { title: "1. 단일 상수 원본", detail: "7밴드 기저 BR/BG/BB · M", tone: "accent" },
        { title: "2. 타일 비닝 가드", detail: "16k dab · 4k tile 수용 검증", tone: "cool" },
        { title: "3. WGSL Compute", detail: "vec4×2 SIMD · 96B Uniform", tone: "warn" },
        { title: "4. CPU f32 미러", detail: "Math.fround 1:1 폴백·검증", tone: "good" },
      ],
      edgeLabels: ["상수 템플릿 주입", "초과 시 명시 rejected", "동일 색 출력 보장"],
      guardNote:
        "수치 불변식: Kubelka-Munk 역공식을 1/(1+q+sqrt(q²+2q)) 유리화 형태로 작성해 f32 암부 유효숫자 상쇄를 제거하고, 수용 한도 초과 시 조용히 전환하지 않고 명시 거절",
    },
    apiSpecs: [
      {
        endpointOrSymbol: "STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET",
        methodOrKind: "WGSL Compute Lib",
        requestOrInput: "CPU 코어의 KM7_BASIS_R/G/B · KM7_RECONSTRUCT_R/G/B 상수를 vec4/vec3로 직접 주입",
        responseOrOutput: "Struct Km7Spec { lo: vec4<f32>, hi: vec4<f32> }, 16B 정렬 96B 필터 유니폼",
        errorContract: "지연 로드 전용 모듈 — WebGPU 미지원 환경에서는 CPU 코어만 실행",
      },
      {
        endpointOrSymbol: "mixKm7SpectralSrgbF32Mirror(colorA, colorB, t, options)",
        methodOrKind: "CPU Parity Oracle",
        requestOrInput: "sRGB 0..1 두 색 + 혼합 비율 t + { tintingStrength, concentrationGamma, chromaPreserve }",
        responseOrOutput: "WGSL km7_mix_srgb와 f32 반올림 순서가 1:1로 일치하는 sRGB 결과",
        errorContract: "NaN/범위 외 입력은 clamp(0, 1) 및 KM7_REFLECTANCE_FLOOR(0.002)로 안정화",
      },
      {
        endpointOrSymbol: "StudioWebGpuDabTileBinningComputeExecutionResult",
        methodOrKind: "Admission Envelope",
        requestOrInput: "MAX_DABS=16,384 · MAX_TILES=4,096 · MAX_REFERENCES=262,144 · MAX_STABLE_TESTS=16,777,216",
        responseOrOutput: "status: 'completed' ({ tileOffsetsBuffer, dabIndicesBuffer, receipt })",
        errorContract: "예산 초과 시 암묵 폴백 금지 → status: 'rejected' + 구체 사유 반환",
      },
    ],
    codeExcerpt: {
      title: "유리화 Kubelka-Munk f32 미러 & CPU 상수의 WGSL 직접 주입",
      language: "ts",
      sourcePath: "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      code: `const f32 = Math.fround;

// 반사율 R → K/S = (1 - R)² / (2R)
function f32Ks(r: number): number {
  const c = f32Clamp(r, KM7_REFLECTANCE_FLOOR, 1);
  const d = f32(f32(1) - c);
  return f32(f32(d * d) / f32(f32(2) * c));
}

// 유리화 역공식 1 / (1 + q + sqrt(q² + 2q)): 큰 q에서도 f32 유효숫자 상쇄가 없다.
function f32Refl(ks: number): number {
  const q = ks > 0 ? f32(ks) : f32(0);
  const disc = f32(f32(q * q) + f32(f32(2) * q));
  return f32(f32(1) / f32(f32(f32(1) + q) + f32(Math.sqrt(disc))));
}

// apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts
export const STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET: string = /* wgsl */ \`
const KM7_R_FLOOR: f32 = \${fmtF32(KM7_REFLECTANCE_FLOOR)};
const KM7_BR_LO: vec4<f32> = \${wgslVec4Lo(KM7_BASIS_R)};
const KM7_BR_HI: vec3<f32> = \${wgslVec3Hi(KM7_BASIS_R)};
struct Km7Spec { lo: vec4<f32>, hi: vec4<f32> }
\`;`,
    },
    repoEvidencePaths: [
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      "apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts",
      "apps/web/src/domains/creator/render/studio-webgpu-dab-tile-binning-compute.ts",
    ],
    adoptionSteps: [
      {
        step: 1,
        title: "행렬·물리 상수는 TypeScript 한 곳에만 두고 WGSL에 주입",
        action:
          "상수를 TS 파일과 .wgsl 파일에 따로 복붙하지 말고, CPU 코어에서 export한 상수를 템플릿 함수로 WGSL 문자열에 주입해 드리프트를 원천 차단합니다.",
        check: "상수를 1곳만 수정해도 CPU 폴백과 WGSL 셰이더가 동시에 갱신됨",
      },
      {
        step: 2,
        title: "Math.fround 기반 f32 CPU 미러로 GPU 없는 CI에서도 수치 검증",
        action:
          "JS 기본 float64 대신 Math.fround()로 WGSL과 같은 32비트 반올림 순서의 미러 함수를 작성해, GPU가 없는 GitHub Actions에서도 경계값·암부 상쇄를 매 커밋 검증합니다.",
        check: "파랑+노랑 혼색, 순흑+순백 중립 회색, 극단값(0/1/NaN)이 Vitest에서 결정론적으로 통과",
      },
      {
        step: 3,
        title: "Compute 수용 한도(Admission Envelope)와 16바이트 유니폼 정렬 고정",
        action:
          "Dab 수·타일 수·참조 상한을 명시적 상수로 선언하고, 초과 시 조용히 GPU OOM을 내기 전에 rejected 결과로 호출자가 CPU/분할 경로를 택하게 합니다.",
        check: "유니폼 버퍼 바이트 크기가 16의 배수(예: 96B)이고 WGSL 예약어 충돌(meta, active 등)이 없음",
      },
    ],
    gotchas: [
      "Kubelka-Munk 역공식을 교과서 그대로 1 + q - sqrt(q² + 2q)로 쓰면 f32 암부(큰 q)에서 두 큰 수를 빼다 유효숫자가 날아가 색이 튑니다. 유리화 형태 1 / (1 + q + sqrt(q² + 2q))를 쓰세요.",
      "WGSL 스펙이 발전하면서 meta, active 같은 짧은 식별자가 예약어 후보로 걸릴 수 있습니다(studio-webgpu-dab-tile-binning-compute.ts:11). 구체적인 접두사를 붙여 쓰세요.",
      "GPU 어댑터가 없는 CI에서 WebGPU 코드가 테스트되지 않고 방치되기 쉽습니다. CPU f32 미러 + wesl 구문 링크 검증을 조합하면 헤드리스 CI에서도 높은 신뢰도를 유지합니다.",
    ],
    speakerNotes: [
      "WebGPU를 프로덕션에 넣을 때 가장 골치 아픈 문제가 'GPU 쓰는 브라우저와 CPU 폴백 브라우저의 결과 색이 미묘하게 달라지는 것'입니다.",
      "ToonStudio는 7밴드 분광 안료 상수를 studio-webgpu-km7-spectral-core.ts 한 곳에만 두고 WGSL에 직접 주입합니다. 그리고 Math.fround로 32비트 산술 미러를 만들어 CI에서 매번 대조합니다.",
      "또 타일 비닝 Compute 커널은 최대 16,384 dab · 4,096 tile 상한을 넘기면 몰래 실패하지 않고 rejected를 명시적으로 돌려줘, 호출자가 안전하게 분할하거나 폴백합니다.",
    ],
    officialLinks: [
      {
        label: "MDN · WebGPU API 개요",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API",
        kind: "웹 표준",
      },
      {
        label: "W3C · WebGPU Shading Language (WGSL)",
        url: "https://www.w3.org/TR/WGSL/",
        kind: "표준 스펙",
      },
      {
        label: "W3C · WebGPU Specification",
        url: "https://www.w3.org/TR/webgpu/",
        kind: "표준 스펙",
      },
      {
        label: "Remotion Player · 인터랙티브 임베드 문서",
        url: "https://www.remotion.dev/docs/player",
        kind: "발표 도구",
      },
    ],
  },
  {
    id: "offline-idempotent-zero-deploy",
    order: 6,
    category: "ops",
    badge: "오프라인 큐 · ₩0 배포",
    title: "오프라인-퍼스트 멱등 동기화 큐 & ₩0 크로스-LLM 배포",
    analogy:
      "비행기 안에서 작업한 변경 전표에 고유 일련번호를 찍어 두었다가 착륙 후 중복·충돌만 골라 반영하고, 운영 서버는 무료 엣지+서울 오리진으로 나눠 임대료 0원을 유지하는 전략입니다.",
    oneLineSummary:
      "재접속 동기화는 인과 정렬·FNV-1a 멱등 키·삭제 후 수정 충돌 보류로 데이터 유실을 막고, 배포는 Cloudflare Static/R2 + 서울 onpod + 40자리 SHA 승인 가드로 월 ₩0을 지킵니다.",
    relatedChapterId: "zero-won-hybrid-deploy",
    diagram: {
      ariaLabel: "오프라인 멱등 동기화 큐 병합과 월 0원 하이브리드 클라우드 배포 구조",
      caption: "로컬 OPFS 멱등 큐 병합에서 Cloudflare 엣지·R2·서울 onpod로 이어지는 운영 경로",
      nodes: [
        { title: "1. OPFS 멱등 큐", detail: "causalSeq 정렬 · 중복 제거", tone: "accent" },
        { title: "2. 충돌 명시 보류", detail: "modify-after-delete 감지", tone: "warn" },
        { title: "3. CF Static + R2", detail: "정적·3.5GB 자산 ₩0 서빙", tone: "cool" },
        { title: "4. 서울 onpod API", detail: "origin-secret · --confirm-onpod", tone: "good" },
      ],
      edgeLabels: ["FNV-1a 멱등 키", "자동 덮어쓰기 금지", "x-toonstudio-origin-secret"],
      guardNote:
        "운영 불변식: 로컬 .env 없이도 pnpm run deploy:cloud -- --smart로 변경 단위만 배포하되, onpod 교체는 40자리 SHA + --confirm-onpod 명시 승인 없이는 실행 거부",
    },
    apiSpecs: [
      {
        endpointOrSymbol: "mergeOfflineSyncQueue(entries, options)",
        methodOrKind: "Pure Sync Engine",
        requestOrInput: "OfflineSyncQueueEntry[] + { acknowledgedIdempotencyKeys?, deletedCutTombstones?, allowRecreateAfterDelete? }",
        responseOrOutput: "{ operations: CompactedOfflineSyncOperation[], droppedDuplicateOpIds, conflicts }",
        errorContract: "동일 키 내용 변조(duplicate-idempotency-divergence) · 삭제 후 수정(modify-after-delete)은 conflicts 배열로 보류",
      },
      {
        endpointOrSymbol: "Cloudflare Worker → Seoul onpod Origin",
        methodOrKind: "Edge Proxy Contract",
        requestOrInput: "Header: x-toonstudio-origin-secret, x-toonstudio-client-ip (/api/health/live는 엣지 직접 200)",
        responseOrOutput: "인증된 /api/* 요청만 서울 onpod Core API(PG 17 내부 호스트)로 프록시",
        errorContract: "origin-secret 누락·불일치 시 Core API가 403 Trusted edge origin is required 반환",
      },
      {
        endpointOrSymbol: "pnpm run deploy:cloud -- --smart --watch",
        methodOrKind: "Cross-LLM Deploy CLI",
        requestOrInput: "--status | --dry-run | --smart | --web | --api-image | --api-onpod --confirm-onpod | --sha <40hex>",
        responseOrOutput: "GitHub Actions cloud-production-deploy.yml 수동 workflow_dispatch 트리거 (변경 단위만 선별)",
        errorContract: "--api-onpod에서 --confirm-onpod 누락 또는 40자리 SHA 형식 위반 시 즉시 에러 종료",
      },
    ],
    codeExcerpt: {
      title: "오프라인 멱등 키 생성·충돌 보류 + 클라우드 배포 명시 승인 가드",
      language: "ts",
      sourcePath: "apps/web/src/domains/creator/live/studio-offline-sync-queue-merger.ts",
      code: `export function deriveOfflineSyncIdempotencyKey(input: {
  readonly surface: string;
  readonly cutId: string;
  readonly kind: OfflineSyncMutationKind;
  readonly causalSequence: number;
  readonly actorId: string;
  readonly patch: OfflineSyncPatchMap;
}): string {
  const digest = fnv1a32(
    \`\${input.surface}|\${input.cutId}|\${input.kind}|\${input.causalSequence}|\${input.actorId}|\${canonicalPatchSignature(input.patch)}\`,
  ).toString(16).padStart(8, "0");
  return \`idem:\${input.surface}:\${input.cutId}:\${input.kind}:\${input.causalSequence}:\${digest}\`;
}

// 1. 이미 서버에 반영된 멱등 키는 재전송 없이 중복 제거
if (acknowledged?.has(normalizedKey)) {
  deduplicatedCount += 1;
  droppedDuplicateOpIds.push(entry.opId);
  continue;
}

// 4. 동일 컷 삭제 후 수정 충돌은 덮어쓰지 않고 명시적으로 보류
if (existing.kind === "delete" && entry.kind !== "delete" && !(allowRecreateAfterDelete && entry.kind === "upsert")) {
  conflicts.push(Object.freeze({
    code: "modify-after-delete",
    resolutionRequired: "manual-restore-or-discard",
    // ...
  }));
  continue;
}

// scripts/dispatch-cloud-deploy.mjs — 상시 승인 밖(onpod) 변경은 플래그 없으면 진입 차단
if ((out.apiOnpod || out.syncApiEnv) && !out.confirmOnpod) {
  throw new Error("[deploy:cloud] 서울 onpod 변경은 --confirm-onpod를 명시해야 합니다.");
}`,
    },
    repoEvidencePaths: [
      "apps/web/src/domains/creator/live/studio-offline-sync-queue-merger.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-libraries-sqlite-opfs-authority.ts",
      "scripts/dispatch-cloud-deploy.mjs",
      "deploy/STANDING_APPROVAL.json",
      "docs/operations/infrastructure-map.md",
    ],
    adoptionSteps: [
      {
        step: 1,
        title: "오프라인 변경마다 정규화 패치 해시로 멱등 키 발급",
        action:
          "키 순서를 정렬한 JSON 시그니처와 인과 순번(causalSequence)으로 멱등 키를 만들고, 재접속 시 서버가 이미 확인한 키(acknowledged)는 재전송 전에 버립니다.",
        check: "네트워크가 끊겼다 붙기를 3번 반복해도 서버에 같은 컷 수정이 중복 반영되지 않음",
      },
      {
        step: 2,
        title: "삭제 후 수정(modify-after-delete)은 자동 병합 대신 충돌 큐로 분리",
        action:
          "다른 기기에서 이미 지운 항목(tombstone)에 오프라인 수정이 도착하면 조용히 덮어쓰지 말고 conflicts 배열로 돌려 사용자에게 복원/폐기 선택권을 줍니다.",
        check: "삭제와 수정이 교차할 때 데이터 조용한 증발이 0건인지 단위 테스트로 확인",
      },
      {
        step: 3,
        title: "정적·대형 자산과 API 오리진을 무료 경계로 분리하고 SHA 배포 고정",
        action:
          "정적 앱은 Cloudflare Static Assets, 25MiB 초과 파일은 R2로 빼고, 백엔드는 origin-secret 헤더를 검증하는 최소 비용 오리진에 둔 뒤 40자리 SHA 고정 CLI로만 배포합니다.",
        check: "Worker를 거치지 않은 직접 API 호출이 403으로 차단되고, /api/health/live가 오리진을 깨우지 않음",
      },
    ],
    gotchas: [
      "Cloudflare Static Assets는 배포당 20,000파일·단일 파일 25MiB 제한이 있습니다. 3D 모델·영상처럼 큰 자산은 처음부터 R2로 분리하고 Worker에서 같은 경로로 프록시하세요.",
      "엣지 Worker가 /api/health/live에 200을 돌려준다고 해서 뒤쪽 Core API나 DB가 살아 있는 게 아닙니다. 오리진 준비 상태는 /api/health/ready와 분리해 모니터링하세요.",
      "오프라인 큐를 단순히 배열 타임스탬프 순으로 보내면 기기 시계 오차로 순서가 뒤집힙니다. causalSequence → revision → createdAtMs → opId 다단계 정렬 기준을 고정하세요.",
    ],
    speakerNotes: [
      "오프라인에서 작업하다가 다시 온라인이 되는 순간이 로컬-퍼스트 앱에서 버그가 제일 많이 터지는 구간입니다.",
      "ToonStudio의 mergeOfflineSyncQueue는 중복 키는 버리고, 같은 키인데 내용이 다르면 변조 충돌로 잡고, 이미 지운 컷을 수정하려 하면 덮어쓰지 않고 보류합니다.",
      "인프라도 같은 철학입니다. 정적·3.5GB 에셋은 Cloudflare 무료 한도와 R2에, API와 PG 17은 서울 onpod 무료 티어에 두고, 배포는 40자리 SHA와 승인 플래그로 잠가 1인 기업도 월 0원으로 운영합니다.",
    ],
    officialLinks: [
      {
        label: "MDN · Origin Private File System (OPFS)",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system",
        kind: "웹 표준",
      },
      {
        label: "MDN · Web Locks API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API",
        kind: "웹 표준",
      },
      {
        label: "IETF Draft · Idempotency-Key HTTP Header",
        url: "https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/",
        kind: "표준 초안",
      },
      {
        label: "Cloudflare Workers · Static Assets",
        url: "https://developers.cloudflare.com/workers/static-assets/",
        kind: "클라우드 문서",
      },
      {
        label: "Cloudflare R2 · 오브젝트 스토리지 문서",
        url: "https://developers.cloudflare.com/r2/",
        kind: "클라우드 문서",
      },
      {
        label: "Yjs · Shared Data Types 공식 문서",
        url: "https://docs.yjs.dev/",
        kind: "CRDT 문서",
      },
    ],
  },
]);
