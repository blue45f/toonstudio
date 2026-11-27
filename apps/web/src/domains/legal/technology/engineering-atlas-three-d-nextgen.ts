import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · three-d · 차세대 무비용 3D 렌더링(WebGPU Compute GI/PCSS/SAH BVH·Hi-Z/LOD·절차적 건축·FFT) &
 * 물리·리타게팅·텍스처·CRDT·시선 연동 조명 2장.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const THREE_D_NEXTGEN_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "nextgen-3d-webgpu-gi-culling-procedural",
    category: "three-d",
    name: "Next-Gen ₩0 3D: WebGPU Compute GI · Hi-Z · Procedural",
    title: t("WebGPU Compute GI·PCSS·Hi-Z 컬링·무저장소 절차적 3D", "WebGPU Compute GI, PCSS, Hi-Z culling & zero-storage procedural 3D"),
    status: "experimental",
    tagline: t(
      "브라우저 WebGPU Compute 기반 GI·PCSS·SAH BVH, Hi-Z·LOD 컬링, 무저장소 절차적 건축·FFT 3D 구조입니다.",
      "Browser WebGPU Compute GI/PCSS/SAH BVH, Frustum+Hi-Z LOD culling, zero-storage procedural 3D & FFT audio FX.",
    ),
    background: [
      t(
        "웹툰 배경 3D 뷰포트에서 조명·그림자·반사를 서버 렌더 팜이나 수백 MB 상용 씬 파일 없이 구현하려면 GPU 컴퓨트와 절차적 생성을 결합해야 합니다. ToonStudio 의 차세대 무비용 3D 렌더링 계층은 WebGPU Compute 셰이더 위에서 스크린스페이스 GI, PCSS 소프트 섀도우, 32B 정렬 12-버킷 SAH BVH 기반 반사·굴절 탐색을 수행하는 구조로 설계했습니다.",
        "Delivering soft shadows, global illumination and reflections in a browser 3D viewport without render farms or bloated scene archives requires GPU compute and procedural synthesis. ToonStudio's zero-cost 3D render stack structures screen-space GI, PCSS soft shadows and 32B-aligned 12-bucket SAH BVH reflection/refraction queries on WebGPU Compute.",
      ),
      t(
        "중요한 사실 구분: 이 경로는 브라우저 표준 WebGPU Compute 셰이더와 소프트웨어/컴퓨트 BVH 탐색으로 동작하며, 데스크톱 네이티브 GPU 의 전용 하드웨어 레이트레이싱 코어(DirectX Raytracing·Vulkan RT)가 아닙니다. 하드웨어 RT 와 동등하다고 과장하지 않고, 웹 브라우저가 지원하는 Compute 파이프라인 안에서 60fps 목표에 맞춰 샘플 수와 해상도를 조절합니다.",
        "Honest technical boundary: this pipeline executes on standard browser WebGPU Compute shaders and BVH traversal—NOT native hardware ray-tracing cores (DXR or Vulkan RT). Rather than claiming parity with hardware RT, it scales sample counts and resolution inside browser compute limits.",
      ),
      t(
        "가시성 최적화는 Rust/WASM64·GPU Frustum + 5단계 보수적 Hi-Z 오클루전 컬링(atelier_stage_3d_kernel.rs, wasm64-3d-bvh-lod-instancing.ts)과 거리별 4단계 LOD·간접 드로우 배칭이 맡습니다. 배경 에셋은 무저장소 절차적 3D 건축·PBR 합성(studio-bg3d-procedural-starter-pack.ts)으로 스토리지 용량을 0에 가깝게 줄이고, 스테이지 음향·오디오 DSP 와 맞물리는 실시간 FFT 오디오 반응형 3D 이펙트로 확장합니다.",
        "Visibility optimization pairs 6-plane Frustum + 5-level conservative Hi-Z occlusion culling (atelier_stage_3d_kernel.rs, wasm64-3d-bvh-lod-instancing.ts) with 4-tier distance LOD and instanced/indirect draws. Zero-storage procedural architecture and PBR synthesis cut storage overhead, extending to realtime FFT audio-reactive 3D effects.",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target): 32B 12-버킷 SAH BVH 커널(bvh3d_sah_raycast_kernel.rs)·Frustum+Hi-Z 컬링 커널(atelier_stage_3d_kernel.rs)·WASM64 4단계 LOD/인스턴싱 엔진(wasm64-3d-bvh-lod-instancing.ts)·절차적 BG3D 스타터 팩은 이 브랜치에서 테스트 검증을 마쳤습니다. WebGPU Compute 스크린스페이스 GI·PCSS·간접 드로우·FFT 오디오 반응형 셰이더 모듈의 본편 3D 뷰포트 통합은 차세대 3D 병렬 트랙에서 단계적으로 합류합니다.",
        "Current vs Roadmap: the 32B 12-bucket SAH BVH kernel, Frustum+Hi-Z kernel, WASM64 4-tier LOD/instancing engine and procedural BG3D starter pack are verified in this branch. Integrating the parallel WebGPU Compute GI/PCSS/indirect-draw and FFT audio-reactive shader modules into the main 3D viewport follows a staged rollout.",
      ),
    ],
    keyPoints: [
      t("WebGPU Compute GI·PCSS·32B SAH BVH(네이티브 RT 코어 아님 명시)", "WebGPU Compute GI, PCSS & 32B SAH BVH (not native DXR/Vulkan RT)"),
      t("Frustum + Hi-Z 오클루전 컬링 & 거리별 LOD 간접 드로우", "Frustum + Hi-Z occlusion culling & distance-based LOD draws"),
      t("무저장소 절차적 3D 건축·PBR 합성으로 에셋 저장 비용 절감", "Zero-storage procedural 3D architecture & PBR synthesis"),
      t("오디오 DSP 와 연계된 실시간 FFT 오디오 반응형 3D 이펙트", "Realtime FFT audio-reactive 3D effects linked to Audio DSP"),
    ],
    diagram: {
      id: "nextgen-3d-webgpu-gi-culling-procedural-diagram",
      kind: "graph",
      title: t("차세대 무비용 3D 렌더링·컬링·절차적 합성 흐름", "Next-gen ₩0 3D rendering, culling and procedural synthesis flow"),
      caption: t(
        "절차적 씬과 SAH BVH 를 Frustum+Hi-Z·LOD 로 걸러 브라우저 WebGPU Compute GI·PCSS 패스로 넘깁니다.",
        "Procedural scenes and SAH BVH pass Frustum+Hi-Z and LOD culling into browser WebGPU Compute GI and PCSS passes.",
      ),
      alt: t(
        "무저장소 절차적 3D 건축·PBR 합성과 32바이트 SAH BVH 구조가 Frustum 및 Hi-Z 오클루전 컬링과 거리별 LOD 간접 드로우 단계를 거쳐 보이는 물체만 남깁니다. 이어서 브라우저 WebGPU Compute 파이프라인이 스크린스페이스 GI·PCSS 소프트 섀도우·BVH 반사와 실시간 FFT 오디오 반응형 3D 이펙트를 합성합니다.",
        "Zero-storage procedural 3D architecture/PBR and a 32B SAH BVH feed Frustum+Hi-Z occlusion culling and distance LOD draws, passing only visible geometry into browser WebGPU Compute screen-space GI, PCSS soft shadows, BVH reflections and realtime FFT audio-reactive 3D effects.",
      ),
      nodes: [
        { id: "proc", label: t("절차적 3D·PBR", "Procedural 3D/PBR"), sub: t("무저장소 건축 합성", "zero-storage synthesis"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "bvh", label: t("32B SAH BVH", "32B SAH BVH"), sub: t("12-버킷 레이캐스트", "12-bucket raycast"), tone: "good", at: [1, 0] },
        { id: "cull", label: t("Frustum+Hi-Z", "Frustum + Hi-Z"), sub: t("오클루전 · 4단계 LOD", "occlusion & 4-tier LOD"), tone: "good", at: [2, 0] },
        { id: "gi", label: t("WebGPU Compute", "WebGPU Compute"), sub: t("SSGI · PCSS · 반사(비RT)", "SSGI, PCSS, refl (non-RT)"), tone: "ai", at: [3, 0] },
        { id: "fft", label: t("실시간 FFT 3D", "Realtime FFT 3D"), sub: t("오디오 반응형 이펙트", "audio-reactive 3D FX"), tone: "local", shape: "pill", at: [4, 0] },
      ],
      edges: [
        { from: "proc", to: "bvh" },
        { from: "bvh", to: "cull", label: t("가시성", "visibility") },
        { from: "cull", to: "gi", label: t("간접 드로우", "indirect") },
        { from: "gi", to: "fft" },
      ],
      groups: [
        { id: "verified", label: t("Rust/WASM64 검증 기반", "Verified Rust/WASM64 base"), tone: "local", nodeIds: ["proc", "bvh", "cull"] },
        { id: "compute", label: t("WebGPU Compute 확장", "WebGPU Compute expansion"), tone: "neutral", nodeIds: ["gi", "fft"] },
      ],
    },
    usage: [
      {
        feature: t("32B 정렬 12-버킷 SAH BVH & Frustum/Hi-Z 컬링 커널", "32B 12-bucket SAH BVH & Frustum/Hi-Z culling kernels"),
        role: t(
          "안전 Rust 로 32B 정렬 SAH BVH 와 6평면 프러스텀·5단계 보수적 Hi-Z 오클루전 컬링 및 음향·조명 평가를 수행합니다.",
          "Runs 32B-aligned SAH BVH raycasts, 6-plane frustum + 5-level Hi-Z occlusion culling and stage acoustics in safe Rust.",
        ),
        paths: [
          "crates/studio-wasm64-drawing-core/src/bvh3d_sah_raycast_kernel.rs",
          "crates/studio-wasm64-drawing-core/src/atelier_stage_3d_kernel.rs",
        ],
      },
      {
        feature: t("WASM64 4단계 LOD · GPU 인스턴싱 엔진", "WASM64 4-tier LOD & GPU instancing engine"),
        role: t(
          "memory64 선형 메모리 버퍼 풀 위에서 프러스텀 컬링·거리별 4단계 LOD 삼각형 절감·인스턴스 배칭 계획을 계산합니다.",
          "Computes frustum culling, 4-tier distance LOD reduction and GPU instance batching over a memory64 linear buffer pool.",
        ),
        paths: ["apps/web/src/domains/creator/scene3d-wasm64-npr/wasm64-3d-bvh-lod-instancing.ts"],
        route: "/studio",
      },
      {
        feature: t("무저장소 절차적 3D 건축 스타터 팩 & 오디오 DSP", "Zero-storage procedural 3D architecture pack & Audio DSP"),
        role: t(
          "파라미터만으로 웹툰 배경 3D 씬을 즉시 생성해 저장소 부담을 줄이고, Wave-3 오디오 DSP 버스를 FFT 효과 기반으로 활용합니다.",
          "Synthesizes procedural 3D webtoon stages from parameters without large archives and feeds Wave-3 Audio DSP for FFT effects.",
        ),
        paths: [
          "apps/web/src/domains/creator/bg3d/studio-bg3d-procedural-starter-pack.ts",
          "crates/studio-wasm64-drawing-core/src/audio_dsp_mixer_kernel.rs",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("화면 점유율 기반 4단계 3D LOD 선택", "Screen-coverage 4-tier 3D LOD selection"),
        language: "ts",
        ...sampleSource([
          ["export type LodTier = 0 | 1 | 2 | 3;"],
          ["const LOD_TRIANGLE_RATIOS = [1.0, 0.5, 0.22, 0.06] as const;"],
          [""],
          ["export function selectDistanceLod(screenCoverage01: number): { readonly lod: LodTier; readonly ratio: number } {"],
          ["  if (screenCoverage01 >= 0.25) return { lod: 0, ratio: LOD_TRIANGLE_RATIOS[0] };"],
          ["  if (screenCoverage01 >= 0.1) return { lod: 1, ratio: LOD_TRIANGLE_RATIOS[1] };"],
          ["  if (screenCoverage01 >= 0.03) return { lod: 2, ratio: LOD_TRIANGLE_RATIOS[2] };"],
          ["  return { lod: 3, ratio: LOD_TRIANGLE_RATIOS[3] };", "원거리 소품은 6% 저폴리곤·임포스터", "distant props drop to 6% triangles"],
          ["}"],
        ]),
        explain: t(
          "실제 wasm64-3d-bvh-lod-instancing.ts 는 3D SAH BVH 프러스텀 프루닝, VRAM 256 MiB 예산, KTX2/Meshopt 점진 스트리밍과 결합해 드로우콜과 삼각형 수를 동시에 줄입니다.",
          "The production wasm64-3d-bvh-lod-instancing.ts combines SAH BVH frustum pruning, a 256 MiB VRAM budget and KTX2/Meshopt streaming to cut both draws and triangles.",
        ),
        source: "apps/web/src/domains/creator/scene3d-wasm64-npr/wasm64-3d-bvh-lod-instancing.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · WebGPU Compute Pipelines & Indirect Draw",
        url: "https://www.w3.org/TR/webgpu/#compute-pipeline",
        kind: "spec",
        note: t("브라우저 WebGPU Compute 기반 GI·컬링·간접 드로우 표준", "Browser WebGPU Compute standard for GI, culling and indirect draw"),
      },
      {
        title: "NVIDIA · Percentage-Closer Soft Shadows (PCSS)",
        url: "https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf",
        kind: "article",
        note: t("차폐물 거리 기반 소프트 섀도우(PCSS) 고전 알고리즘", "Classic blocker-distance Percentage-Closer Soft Shadows paper"),
      },
    ],
    chapterIds: ["web-3d-engine", "performance", "nextgen-web-experiments"],
    talk: {
      pitch: t(
        "차세대 무비용 3D 파이프라인은 32B SAH BVH·Frustum+Hi-Z 컬링·4단계 LOD·무저장소 절차적 건축 위에 브라우저 WebGPU Compute 기반 스크린스페이스 GI·PCSS 소프트 섀도우·FFT 오디오 반응형 이펙트를 얹는 구조입니다. 네이티브 DXR/Vulkan RT 코어가 아닌 브라우저 Compute 범위라는 점을 분명히 밝힙니다.",
        "Our next-gen ₩0 3D stack layers browser WebGPU Compute screen-space GI, PCSS soft shadows and FFT audio-reactive FX onto a 32B SAH BVH, Frustum+Hi-Z culling, 4-tier LOD and zero-storage procedural stages—explicitly browser Compute rather than hardware DXR/Vulkan RT.",
      ),
      analogy: t(
        "실제 대리석 궁전을 통째로 창고에 쌓아 두지 않고 설계 공식(절차적 건축)으로 바로 세운 뒤, 관객 눈에 안 보이는 뒷방(Hi-Z)은 불을 끄고 보이는 무대만 브라우저 조명판(WebGPU Compute)으로 비추는 방식입니다.",
        "Instead of warehousing giant 3D palaces, we build them from compact formulas (procedural), turn off lights behind hidden walls (Hi-Z), and shade only the visible stage in browser WebGPU Compute.",
      ),
      questions: [
        {
          question: t("브라우저 WebGPU 로 실시간 하드웨어 레이트레이싱(DXR/Vulkan RT)을 쓰는 건가요?", "Does this use hardware ray tracing like DXR or Vulkan RT?"),
          answer: t(
            "아닙니다. 현재 웹 표준 WebGPU 는 하드웨어 RT 코어를 직접 노출하지 않습니다. ToonStudio 는 WebGPU Compute 셰이더 기반 스크린스페이스 GI·PCSS·32B SAH BVH 탐색으로 브라우저 안에서 무비용 근사 품질을 얻습니다.",
            "No. Standard WebGPU does not expose native DXR/Vulkan RT cores; ToonStudio uses WebGPU Compute screen-space GI, PCSS and 32B SAH BVH queries within browser limits.",
          ),
        },
      ],
      pitfall: t(
        "WebGPU Compute GI·PCSS·간접 드로우·FFT 3D 셰이더를 네이티브 하드웨어 레이트레이싱과 동일시하면 과장입니다. 또한 이 브랜치에서 검증된 Rust SAH BVH/Hi-Z/절차적 스타터 기반과 병렬 3D 트랙의 Compute 통합 로드맵을 구분해 읽어야 합니다.",
        "Never equate browser WebGPU Compute GI/PCSS with native hardware ray tracing, and separate this branch's verified Rust SAH BVH/Hi-Z/procedural base from the parallel Compute integration track.",
      ),
    },
    technologies: ["WebGPU", "WGSL", "Three.js", "Rust / WASM"],
    facts: [
      {
        value: "32B / 12-bucket",
        label: t("안전 Rust SAH BVH 노드 정렬 · 버킷 수(브라우저 Compute 기반)", "Safe Rust SAH BVH 32B alignment & 12 buckets (browser Compute)"),
        source: "crates/studio-wasm64-drawing-core/src/bvh3d_sah_raycast_kernel.rs",
      },
      {
        value: "Frustum + 5-lvl Hi-Z",
        label: t("6평면 프러스텀 · 5단계 보수적 Hi-Z 오클루전 컬링 커널", "6-plane frustum & 5-level conservative Hi-Z occlusion kernel"),
        source: "crates/studio-wasm64-drawing-core/src/atelier_stage_3d_kernel.rs",
      },
      {
        value: "4-Tier LOD (6% min)",
        label: t("WASM64 거리별 4단계 LOD · GPU 인스턴싱 & 무저장소 절차적 3D", "WASM64 4-tier LOD, GPU instancing & procedural 3D starter"),
        source: "apps/web/src/domains/creator/scene3d-wasm64-npr/wasm64-3d-bvh-lod-instancing.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "nextgen-3d-xpbd-qem-retarget-gaze",
    category: "three-d",
    name: "Next-Gen 3D: XPBD · QEM Retarget · NPR Bake · Gaze Light",
    title: t("120Hz XPBD·QEM 리타게팅·NPR 텍스처 베이킹·시선 조명", "120 Hz XPBD cloth, QEM retargeting, NPR baking & gaze lighting"),
    status: "experimental",
    tagline: t(
      "QEM 경량화·Mixamo/VRM 리타게팅·120Hz XPBD·4×4 텍스처 압축/NPR 베이킹·3D CRDT·시선 조명을 통합합니다.",
      "Integrates QEM decimation, Mixamo/VRM retargeting, 120 Hz XPBD, 4x4/NPR baking, 3D CRDT & gaze-linked lights.",
    ),
    background: [
      t(
        "웹툰 작가가 외부 3D 캐릭터(Mixamo·VRM)와 고폴리곤 소품을 스튜디오에 바로 불러와 포즈를 잡고 의상 주름·조명까지 맞추려면 네 가지 병목을 풀어야 합니다. ① QEM(Quadric Error Metrics) 메시 경량화와 Mixamo/VRM → ToonStudio 55본 휴머노이드 리타게팅(humanoid_body_ik_kernel.rs, specialist-ik.ts, studio-humanoid-bones.ts)이 본 이름·축 불일치와 폴리곤 과부하를 해소합니다.",
        "Importing external Mixamo/VRM characters and dense props for webtoon posing hits four bottlenecks: (1) QEM mesh decimation and Mixamo/VRM-to-ToonStudio 55-bone humanoid retargeting (humanoid_body_ik_kernel.rs, specialist-ik.ts, studio-humanoid-bones.ts) normalize bone naming, axes and triangle budgets.",
      ),
      t(
        "② 120Hz XPBD(Extended Position Based Dynamics) 의상·헤어 물리 시뮬레이션은 짧은 서브스텝으로 옷자락·머리카락 뚫림을 줄이고, 기기가 지원할 때만 선택적 WebNN 잔차 보정 훅(ondevice-webnn-assist-runtime.ts)을 덧붙여 서버 비용 없이 주름 디테일을 보강합니다. WebNN 이 없으면 순수 XPBD 솔버가 그대로 동작합니다.",
        "(2) 120 Hz XPBD cloth and hair physics uses tight substeps to curb tunneling, pairing with an optional WebNN residual hook (ondevice-webnn-assist-runtime.ts) when supported while running purely on the XPBD solver otherwise.",
      ),
      t(
        "③ 텍스처·룩뎁 단계에서는 4×4 블록 텍스처 압축(VRAM 절감), 2× 업스케일링, 6패스 NPR UV 베이킹(studio-bg3d-six-pass-project-contract.ts, wgsl-compute-kernels.ts)으로 웹툰 선화·음영 텍스처를 가볍게 만듭니다. ④ 협업·연출 단계에서는 크로스 플랫폼 3D CRDT 메타데이터 동기화와 캐릭터 시선·헤드포즈 연동 3D 조명 제어(gaze-pose-light-controller.ts, studio-bg3d-lighting-studio.ts)를 연결합니다.",
        "(3) Texture and lookdev stages combine 4x4 block compression, 2x upscaling and NPR UV baking (studio-bg3d-six-pass-project-contract.ts) to keep toon textures light. (4) Collaboration and staging link cross-platform 3D CRDT metadata sync with eye-gaze/head-pose-driven 3D lighting (gaze-pose-light-controller.ts, studio-bg3d-lighting-studio.ts).",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target): 이 브랜치에서는 55본 휴머노이드 계약·Rust 2-Bone+CCD 전신 IK 커널·가상 3D 물리 커널(virtual_3d_physics_kernel.rs)·WebNN 어시스트 훅·6패스 룩뎁 계약·시선(eye-gaze) 및 3D 조명 스튜디오가 구현·검증돼 있습니다. QEM 경량화·120Hz XPBD 의상/헤어·4×4 블록 압축·3D CRDT 동기화의 병렬 시뮬레이션 모듈은 차세대 3D 트랙 통합과 브라우저 회귀 검증을 거쳐 단계적으로 스튜디오 UI 에 활성화합니다.",
        "Current vs Roadmap: this branch verifies the 55-bone humanoid spec, Rust 2-Bone+CCD IK, virtual 3D physics kernel, WebNN assist hook, 6-pass lookdev contract, eye-gaze rig and lighting studio. Parallel QEM, 120 Hz XPBD cloth/hair, 4x4 block compression and 3D CRDT modules enter the main studio UI progressively after integration and browser checks.",
      ),
    ],
    keyPoints: [
      t("QEM 메시 경량화 & Mixamo/VRM → 55본 휴머노이드 리타게팅", "QEM mesh decimation & Mixamo/VRM → 55-bone retargeting"),
      t("120Hz XPBD 의상/헤어 물리 + 선택적 WebNN 잔차 보정 훅", "120 Hz XPBD cloth/hair physics + optional WebNN residual hook"),
      t("4×4 블록 텍스처 압축 · 2× 업스케일링 · NPR UV 베이킹", "4x4 block texture compression, 2x upscaling & NPR UV baking"),
      t("크로스 플랫폼 3D CRDT 메타 동기화 & 시선/헤드포즈 연동 조명", "Cross-platform 3D CRDT metadata sync & gaze-linked 3D lighting"),
    ],
    diagram: {
      id: "nextgen-3d-xpbd-qem-retarget-gaze-diagram",
      kind: "layers",
      title: t("캐릭터 리타게팅·120Hz XPBD·NPR 베이킹·시선 조명 계층", "Character retargeting, 120 Hz XPBD, NPR baking & gaze lighting"),
      caption: t(
        "외부 메시 경량화부터 의상 물리, NPR 텍스처, CRDT·시선 연동 조명까지 4계층으로 분리해 폴백을 지킵니다.",
        "Four decoupled layers keep decimation, XPBD physics, NPR baking and gaze-linked lighting safely fallback-ready.",
      ),
      alt: t(
        "1층 자산 정규화는 QEM 메시 경량화와 Mixamo/VRM 55본 리타게팅·전신 IK 를 맡고, 2층 물리 시뮬레이션은 120Hz XPBD 의상/헤어 물리와 선택적 WebNN 잔차 훅을 돌립니다. 3층 텍스처·룩뎁은 4x4 블록 압축·2배 업스케일·NPR UV 베이킹을 수행하고, 4층 협업·연출은 3D CRDT 메타 동기화와 시선·헤드포즈 연동 3D 조명을 제어합니다.",
        "Layer 1 normalizes assets via QEM decimation and Mixamo/VRM 55-bone retargeting + IK; Layer 2 runs 120 Hz XPBD cloth/hair with an optional WebNN residual hook; Layer 3 handles 4x4 block compression, 2x upscaling and NPR UV baking; Layer 4 drives 3D CRDT metadata sync and eye-gaze/head-pose lighting.",
      ),
      layers: [
        {
          id: "stage",
          label: t("4. 3D CRDT · 시선 연동 조명", "4. 3D CRDT & gaze lighting"),
          sub: t("크로스 플랫폼 메타 동기화 · 시선/헤드포즈 키라이트 추적", "Cross-platform CRDT metadata & gaze/head-pose light rig"),
          tone: "edge",
          chips: ["3D CRDT Meta", "Eye-Gaze Rig", "Head-Pose Light"],
        },
        {
          id: "tex",
          label: t("3. 4×4 압축 · 2× 업스케일 · NPR", "3. 4x4 compress, 2x & NPR bake"),
          sub: t("4×4 블록 VRAM 절감 · 2× 업스케일 · 6패스 UV 베이킹", "4x4 block compression, 2x upscale & 6-pass NPR UV bake"),
          tone: "good",
          chips: ["4x4 Block", "2x Upscale", "NPR UV Bake"],
        },
        {
          id: "phys",
          label: t("2. 120Hz XPBD 의상/헤어 물리", "2. 120 Hz XPBD cloth/hair"),
          sub: t("서브스텝 제약 솔버 + 선택적 WebNN 잔차 훅(미지원 시 순수 XPBD)", "Substepped XPBD + optional WebNN residual hook"),
          tone: "ai",
          chips: ["120 Hz XPBD", "WebNN Hook", "Cloth & Hair"],
        },
        {
          id: "retarget",
          label: t("1. QEM 경량화 · 휴머노이드 IK", "1. QEM decimation & IK"),
          sub: t("Mixamo/VRM → 55본 리타게팅 · Rust 2-Bone+CCD IK", "Mixamo/VRM → 55-bone retargeting & Rust 2-Bone+CCD IK"),
          tone: "local",
          chips: ["QEM Decimate", "Mixamo/VRM", "2-Bone+CCD IK"],
        },
      ],
      brackets: [
        { label: t("무비용 로컬 3D 시뮬레이션 스택", "Zero-cost local 3D sim stack"), layerIds: ["tex", "phys", "retarget"] },
      ],
    },
    usage: [
      {
        feature: t("Rust 전신 2-Bone+CCD IK & 55본 휴머노이드 계약", "Rust full-body 2-Bone+CCD IK & 55-bone humanoid contract"),
        role: t(
          "Mixamo·VRM 뼈대를 ToonStudio 표준 55본으로 매핑하고, 안전 Rust IK 커널로 팔·다리·척추 포즈를 계산합니다.",
          "Maps Mixamo/VRM skeletons to the 55-bone standard and solves limb and spine poses in the safe Rust IK kernel.",
        ),
        paths: [
          "crates/studio-wasm64-drawing-core/src/humanoid_body_ik_kernel.rs",
          "apps/web/src/domains/creator/scene3d/specialists/specialist-ik.ts",
          "apps/web/src/domains/creator/studio-humanoid-bones.ts",
        ],
      },
      {
        feature: t("3D 물리 커널 & 선택적 WebNN 잔차 어시스트", "3D physics kernel & optional WebNN residual assist"),
        role: t(
          "가상 3D 물리 기반과 WebNN NPU/GPU 보조 훅을 분리해 WebNN 미지원 기기에서도 결정적 물리 시뮬레이션을 유지합니다.",
          "Separates deterministic 3D physics from the optional WebNN hook so devices without WebNN keep running smoothly.",
        ),
        paths: [
          "crates/studio-wasm64-drawing-core/src/virtual_3d_physics_kernel.rs",
          "apps/web/src/domains/creator/xr-splat-runtime/ondevice-webnn-assist-runtime.ts",
        ],
      },
      {
        feature: t("6패스 NPR 룩뎁 계약 · 시선/헤드포즈 연동 3D 조명", "6-pass NPR lookdev & gaze/head-pose 3D lighting"),
        role: t(
          "NPR 베이킹 패스 구조와 캐릭터 시선(eye-gaze)·조명 스튜디오 프리셋을 연결해 컷 연출 속도를 높입니다.",
          "Connects 6-pass NPR baking contracts with character eye-gaze controls and 3D lighting presets for faster panel staging.",
        ),
        paths: [
          "apps/web/src/domains/creator/scene3d/bg3d-six-pass/studio-bg3d-six-pass-project-contract.ts",
          "apps/web/src/domains/creator/wasm64-3d-neural-sim/gaze-pose-light-controller.ts",
          "apps/web/src/domains/creator/bg3d/studio-bg3d-lighting-studio.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("120Hz XPBD 거리 제약 1스텝 보정과 선택적 잔차 훅", "Single 120 Hz XPBD distance constraint step with optional residual hook"),
        language: "ts",
        ...sampleSource([
          ["export function solveXpbdDistanceConstraint(dist: number, restLen: number, invMassSum: number, compliance: number, dt: number): number {"],
          ["  if (invMassSum <= 0 || dist <= 1e-6) return 0;"],
          ["  const alpha = compliance / (dt * dt);", "120Hz 서브스텝(dt=1/120) 강성 보정", "substep stiffness scaling at dt = 1/120"],
          ["  const c = dist - restLen;"],
          ["  return -c / (invMassSum + alpha);", "위치 보정 람다(λ) 반환", "returns Lagrange position correction lambda"],
          ["}"],
          [""],
          ["export function applyOptionalWebNnResidual(baseDelta: number, neuralResidual: number | null, maxClamp = 0.02): number {"],
          ["  if (neuralResidual === null) return baseDelta;", "WebNN 미지원 시 순수 XPBD 유지", "falls back to pure XPBD without WebNN"],
          ["  return baseDelta + Math.max(-maxClamp, Math.min(maxClamp, neuralResidual));"],
          ["}"],
        ]),
        explain: t(
          "XPBD 는 시간 간격(dt=1/120s)에 무관한 물리 강성(compliance)을 유지해 고속 동작에서도 안정적이며, WebNN 잔차는 물리 안정성을 해치지 않는 작은 범위로 클램프해 선택 적용합니다.",
          "XPBD preserves timestep-independent compliance at 120 Hz substeps, while optional WebNN wrinkle residuals stay clamped so physics never diverges.",
        ),
        verify: "types",
      },
    ],
    links: [
      {
        title: "Müller et al. · XPBD: Position-Based Simulation of Compliant Constrained Dynamics",
        url: "https://matthias-research.github.io/pages/publications/XPBD.pdf",
        kind: "article",
        note: t("시간 간격 독립 강성을 제공하는 XPBD 의상·헤어 물리 원논문", "Original XPBD paper for timestep-independent cloth/hair dynamics"),
      },
      {
        title: "VRM Consortium · VRM 1.0 Humanoid Bone Specification",
        url: "https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md",
        kind: "spec",
        note: t("55본 휴머노이드 리타게팅 기준이 되는 VRM 표준 명세", "VRM humanoid bone spec anchoring 55-bone retargeting"),
      },
      {
        title: "Garland & Heckbert · Surface Simplification Using Quadric Error Metrics (QEM)",
        url: "https://www.cs.cmu.edu/~./garland/Papers/quadrics.pdf",
        kind: "article",
        note: t("형상 오차를 최소화하며 폴리곤을 줄이는 QEM 경량화 원논문", "Classic QEM paper for error-bounded mesh simplification"),
      },
    ],
    chapterIds: ["web-3d-engine", "on-device-inference", "collaborative-crdt-boundary"],
    talk: {
      pitch: t(
        "외부 3D 캐릭터와 소품을 웹툰 제작에 바로 쓰기 위해 QEM 경량화·Mixamo/VRM 55본 리타게팅·120Hz XPBD 의상/헤어 물리(선택적 WebNN 잔차)·4×4 블록 텍스처 압축과 NPR UV 베이킹·3D CRDT 메타 동기화·시선/헤드포즈 연동 조명까지 로컬 무비용 계층으로 정리했습니다.",
        "To make external 3D characters webtoon-ready at zero server cost, we organize QEM decimation, Mixamo/VRM 55-bone retargeting, 120 Hz XPBD cloth/hair with an optional WebNN hook, 4x4 block & NPR UV baking, 3D CRDT metadata sync and gaze-linked lighting.",
      ),
      analogy: t(
        "다른 나라 규격의 마네킹을 우리 작업대 치수로 맞추고(리타게팅·QEM), 옷자락이 자연스럽게 흩날리게 한 뒤(XPBD), 캐릭터 눈빛이 향하는 쪽으로 스튜디오 조명이 따라 움직이는(시선 연동) 무대 장치입니다.",
        "Like refitting an imported mannequin to your studio rig (retargeting + QEM), draping cloth naturally (XPBD), and having studio key lights follow where the character looks.",
      ),
      questions: [
        {
          question: t("WebNN 이 없는 브라우저에서는 의상·헤어 물리가 멈추나요?", "Does cloth/hair physics stop on browsers without WebNN?"),
          answer: t(
            "멈추지 않습니다. 120Hz XPBD 솔버가 단독으로 완전한 물리 결과를 계산하고, WebNN 잔차 훅은 NPU/GPU 가 열린 환경에서만 주름 디테일을 선택 보강합니다.",
            "No. The 120 Hz XPBD solver produces full physics standalone, and the WebNN residual hook only adds optional detail when available.",
          ),
        },
        {
          question: t("3D CRDT 는 무거운 메시 바이너리까지 매번 동기화하나요?", "Does 3D CRDT sync heavy mesh binaries every edit?"),
          answer: t(
            "아닙니다. 3D 메시 원본은 해시 기반 에셋 참조로 두고, 카메라·본 회전·조명·재질 파라미터 같은 경량 3D 메타데이터만 CRDT 로 동기화합니다.",
            "No. Heavy mesh binaries stay content-addressed while only lightweight metadata—cameras, bone poses, lights and materials—syncs via CRDT.",
          ),
        },
      ],
      pitfall: t(
        "이 브랜치에 검증된 55본 IK·가상 3D 물리·WebNN 훅·시선/조명 기반과, 병렬 3D 시뮬레이션 트랙의 QEM·120Hz XPBD·4×4 압축·3D CRDT 스튜디오 UI 통합 단계를 섞어서 말하지 않습니다.",
        "Keep this branch's verified 55-bone IK, physics kernel, WebNN hook and gaze/lighting base distinct from the staged UI integration of parallel QEM, XPBD, 4x4 compression and 3D CRDT modules.",
      ),
    },
    technologies: ["VRM", "Three.js", "WebNN", "Yjs", "Rust / WASM"],
    facts: [
      {
        value: "55 bones + 2-Bone/CCD",
        label: t("표준 휴머노이드 55본 리타게팅 · 안전 Rust 전신 IK 커널", "55-bone humanoid retargeting & safe Rust full-body IK"),
        source: "crates/studio-wasm64-drawing-core/src/humanoid_body_ik_kernel.rs",
      },
      {
        value: "120 Hz XPBD + WebNN",
        label: t("서브스텝 의상/헤어 물리 + 선택적 WebNN 잔차 보정 훅", "Substepped 120 Hz XPBD cloth/hair + optional WebNN hook"),
        source: "apps/web/src/domains/creator/xr-splat-runtime/ondevice-webnn-assist-runtime.ts",
      },
      {
        value: "6-Pass NPR + Gaze",
        label: t("6패스 NPR 룩뎁 계약 · 시선/헤드포즈 연동 3D 조명 스튜디오", "6-pass NPR lookdev contract & gaze-linked 3D lighting studio"),
        source: "apps/web/src/domains/creator/wasm64-3d-neural-sim/gaze-pose-light-controller.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
