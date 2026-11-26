import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · three-d · Super-Gap 3D(자동 메시 토폴로지·노멀 힐러 · 웹캠 52 ARKit VRM 미러링 ·
 * 3DGS 기수 정렬 & SH 시간대/날씨 리라이팅 · 2D→3D PnP 역산 · 본 스미어/집중선 · G-Buffer 6레이어 ·
 * 포비에이티드 렌더링 · 5,000 인스턴스 WebGPU 배칭) 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const THREE_D_SUPERGAP_35_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "supergap-mesh-healer-webcam-vrm-3dgs-relight",
    category: "three-d",
    name: "Mesh Topology Healer · Webcam 52 ARKit · 3DGS SH Relight",
    title: t("3D 메시 자동 힐러 · 웹캠 52 ARKit VRM · 3DGS 기수정렬/리라이팅", "3D mesh healer, webcam 52 ARKit VRM & 3DGS radix/SH relight"),
    status: "experimental",
    tagline: t(
      "결함 0 수밀 메시 치유(1.01ms), 웹캠 52 ARKit VRM 미러링, 3DGS 기수 정렬(5.57ms)과 SH 리라이팅을 구현했습니다.",
      "Delivers 0-defect watertight mesh healing (1.01 ms), webcam 52-ARKit VRM mirroring, 5.57 ms 3DGS radix sort & SH relight.",
    ),
    background: [
      t(
        "외부에서 가져온 3D 소품은 중복 정점·0면적 퇴화면·뒤집힌 법선·열린 구멍 때문에 NPR 외곽선이나 불리언에서 깨지기 쉽고, 3D 캐릭터 표정 포징과 3DGS 배경 시간대 변경은 수작업 시간이 길어 웹툰 마감에 쫓기는 작가가 쓰기 어렵습니다.",
        "Imported 3D props frequently fail NPR outlining due to duplicate vertices, zero-area faces, flipped normals and open holes, while manual VRM facial posing and relighting 3DGS scenes across times of day slow down weekly production.",
      ),
      t(
        "healMeshTopologyAndNormals(mesh-topology-healer.ts)는 중복 정점 용접, 0면적 퇴화면 제거, 와인딩 일관성 정렬, 경계 구멍 봉합, 법선 재계산을 1.01ms 만에 끝내 결함 전 항목 0건 · 수밀 부피 +1.0 솔리드로 복구합니다. WebcamVrmExpressionPoseSolver(webcam-vrm-pose-solver.ts)는 웹캠 랜드마크에서 52개 ARKit 블렌드셰이프와 상반신 포즈·시선을 60fps 스무딩으로 미러링하고, 마음에 드는 순간 즉시 컷 프리즈 스냅샷으로 고정합니다.",
        "healMeshTopologyAndNormals welds duplicates, drops degenerate faces, unifies winding, caps holes and recomputes normals in 1.01 ms down to 0 defects and +1.0 watertight volume. WebcamVrmExpressionPoseSolver maps webcam landmarks to 52 ARKit blendshapes and upper-body poses with 60 fps smoothing and instant cut-freeze snapshots.",
      ),
      t(
        "WebGpu3dgsSplatSorter(subms-audioworklet-ring-and-3dgs-bridge.ts)는 4,096개 3D Gaussian Splat 을 16/32비트 기수(Radix) 정렬로 5.57ms 만에 뒤→앞 깊이 순으로 정렬하고 셀·잉크·스크린톤 NPR WGSL(WGSL_3DGS_NPR_COMPOSITE)로 합성합니다. relight3dgsSceneSh(sh-3dgs-relight-weather.ts)는 구면조화함수(SH L0/L1) 계수를 새벽·정오·노을·야간 프리셋으로 재조명하고 깊이 인식 안개·비·눈 파티클을 얹습니다.",
        "WebGpu3dgsSplatSorter sorts 4,096 3D Gaussian Splats back-to-front via 16/32-bit radix sort in 5.57 ms for cel/ink/screentone NPR WGSL compositing. relight3dgsSceneSh transforms spherical-harmonics L0/L1 bands across dawn, noon, sunset and night presets with depth-aware fog, rain and snow passes.",
      ),
      t(
        "현재 구현·실측 완료(Current)와 확장 로드맵(Target): 메시 힐러(1.01ms), 52 ARKit VRM 솔버, 3DGS 기수 정렬(5.57ms)·SH 리라이팅·WGSL 정적 검증은 모두 단위·엣지 테스트를 통과했습니다. 실브라우저 MediaPipe 웹캠 스트림과 3D 뷰포트 실시간 렌더 패스 연결은 기기별 프레임 검증을 거쳐 단계적으로 통합합니다.",
        "Current vs Roadmap: the 1.01 ms mesh healer, 52-ARKit VRM solver, 5.57 ms 3DGS radix sorter and SH relighter pass unit and WGSL validation tests. Wiring live webcam MediaPipe streams into the main 3D viewport proceeds in staged device tests.",
      ),
    ],
    keyPoints: [
      t("3D 메시 토폴로지·노멀 자동 힐러: 결함 0 · 부피 +1.0 · 1.01ms", "3D mesh topology healer: 0 defects, +1.0 watertight, 1.01 ms"),
      t("웹캠 52 ARKit 블렌드셰이프 VRM 미러링 · 상반신 포즈 · 컷 프리즈", "Webcam 52-ARKit VRM expression/pose mirror & cut-freeze"),
      t("3DGS 4,096 스플랫 16/32비트 기수 정렬(5.57ms) & NPR WGSL 합성", "3DGS 4,096-splat 16/32-bit radix sort (5.57 ms) & NPR WGSL"),
      t("3DGS 구면조화함수(SH L0/L1) 시간대 리라이팅 & 깊이 인식 날씨 패스", "3DGS spherical-harmonics time-of-day relight & weather pass"),
    ],
    diagram: {
      id: "supergap-mesh-healer-webcam-vrm-3dgs-relight-diagram",
      kind: "graph",
      title: t("3D 메시 힐러 · 웹캠 VRM 52 ARKit · 3DGS 기수 정렬/SH 리라이팅", "3D mesh healer, webcam VRM 52 ARKit & 3DGS radix/SH relight"),
      caption: t(
        "손상 메시 치유, 웹캠 표정 미러링, 3DGS 기수 정렬·시간대 리라이팅이 모두 로컬 웹툰 NPR 뷰포트로 수렴합니다.",
        "Mesh healing, webcam VRM mirroring and 3DGS radix sorting + SH relighting converge into the local webtoon NPR viewport.",
      ),
      alt: t(
        "왼쪽 3갈래에서 깨진 3D 메시는 메시 토폴로지 힐러(1.01ms·결함 0·부피 +1.0)로, 웹캠 랜드마크는 52 ARKit VRM 솔버와 컷 프리즈로, 3DGS 스플랫은 16/32비트 기수 정렬(5.57ms)과 SH 시간대·날씨 리라이팅으로 처리된 뒤 오른쪽의 웹툰 NPR 합성 패스로 모입니다.",
        "Three left-to-right branches heal raw meshes (1.01 ms, 0 defects, +1.0 volume), mirror webcam landmarks onto 52-ARKit VRM poses with cut-freeze, and radix-sort (5.57 ms) plus SH-relight 3DGS splats before merging into the webtoon NPR composite.",
      ),
      nodes: [
        { id: "mesh", label: t("손상 3D 메시", "Raw 3D mesh"), sub: t("구멍·퇴화면·역법선", "Holes, flipped normals"), tone: "warn", at: [0, 0] },
        { id: "heal", label: t("메시 자동 힐러", "Mesh healer"), sub: t("결함 0 · +1.0 · 1.01ms", "0 defects, +1.0, 1.01 ms"), tone: "good", at: [1, 0] },
        { id: "cam", label: t("웹캠 랜드마크", "Webcam pose"), sub: t("얼굴·상반신 60fps", "Face & upper body 60fps"), tone: "local", at: [0, 1] },
        { id: "vrm", label: t("52 ARKit VRM", "52 ARKit VRM"), sub: t("표정 미러링·컷 프리즈", "Mirror & cut-freeze"), tone: "good", at: [1, 1] },
        { id: "gs", label: t("3DGS 기수 정렬", "3DGS radix sort"), sub: t("4,096 스플랫 · 5.57ms", "4,096 splats, 5.57 ms"), tone: "local", at: [0, 2] },
        { id: "sh", label: t("SH 시간대 리라이트", "SH relight"), sub: t("새벽·노을·야간 + 날씨", "Dawn/sunset + weather"), tone: "good", at: [1, 2] },
        { id: "npr", label: t("웹툰 NPR 합성", "Webtoon NPR"), sub: t("셀·잉크·스크린톤 WGSL", "Cel, ink, tone WGSL"), tone: "edge", shape: "pill", at: [2, 1] },
      ],
      edges: [
        { from: "mesh", to: "heal" },
        { from: "cam", to: "vrm" },
        { from: "gs", to: "sh" },
        { from: "heal", to: "npr" },
        { from: "vrm", to: "npr" },
        { from: "sh", to: "npr" },
      ],
      groups: [
        { id: "prep", label: t("로컬 0-토큰 3D 치유·표정·리라이트", "Local 0-token 3D heal, pose & relight"), tone: "local", nodeIds: ["heal", "vrm", "sh"] },
      ],
    },
    usage: [
      {
        feature: t("3D 메시 토폴로지·노멀 자동 힐러", "Automatic 3D mesh topology & normal healer"),
        role: t(
          "중복 정점·0면적 퇴화면·와인딩 반전·경계 구멍·역법선을 1.01ms 만에 결함 0건 수밀 솔리드로 치유합니다.",
          "Heals duplicate vertices, degenerate triangles, flipped winding and holes to 0 defects in 1.01 ms.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/mesh-topology-healer.ts",
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/wasm64-creator-defense-healer.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("웹캠 52 ARKit VRM 미러링 & 3DGS SH 시간대·날씨 리라이팅", "Webcam 52-ARKit VRM mirroring & 3DGS SH relighting"),
        role: t(
          "52개 ARKit 표정·상반신 포즈 미러링과 컷 프리즈, 3DGS SH L0/L1 시간대 전환과 깊이 인식 날씨 패스를 실행합니다.",
          "Solves 52-ARKit VRM expressions/poses with cut-freeze and relights 3DGS SH bands with depth-aware weather.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/webcam-vrm-pose-solver.ts",
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/sh-3dgs-relight-weather.ts",
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/wasm64-supergap-drawing-3d.test.ts",
        ],
      },
      {
        feature: t("3DGS 16/32비트 기수 정렬 & NPR WGSL 브리지", "3DGS 16/32-bit radix sorter & NPR WGSL bridge"),
        role: t(
          "4,096개 스플랫을 5.57ms 만에 카메라 깊이 순 기수 정렬하고 공분산 투영 및 웹툰 NPR 합성 패스를 생성합니다.",
          "Radix-sorts 4,096 splats by camera depth in 5.57 ms with covariance projection and webtoon NPR WGSL.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/subms-audioworklet-ring-and-3dgs-bridge.ts",
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/wasm64-foveated-haptic-narrative.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("닫힌 삼각형 메시의 부호 있는 사면체 부피(와인딩 검증) 계산", "Signed tetrahedron volume for watertight winding verification"),
        language: "ts",
        ...sampleSource([
          ["export function signedMeshVolume(positions: Float32Array, indices: Uint32Array): number {"],
          ["  let volume6 = 0;"],
          ["  for (let t = 0; t + 2 < indices.length; t += 3) {"],
          ["    const i0 = (indices[t] ?? 0) * 3, i1 = (indices[t + 1] ?? 0) * 3, i2 = (indices[t + 2] ?? 0) * 3;"],
          ["    const ax = positions[i0] ?? 0, ay = positions[i0 + 1] ?? 0, az = positions[i0 + 2] ?? 0;"],
          ["    const bx = positions[i1] ?? 0, by = positions[i1 + 1] ?? 0, bz = positions[i1 + 2] ?? 0;"],
          ["    const cx = positions[i2] ?? 0, cy = positions[i2 + 1] ?? 0, cz = positions[i2 + 2] ?? 0;"],
          ["    volume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);"],
          ["  }"],
          ["  return volume6 / 6;", "양수이면 외향 CCW 와인딩 수밀 솔리드", "positive confirms outward CCW watertight solid"],
          ["}"],
        ]),
        explain: t(
          "실제 healMeshTopologyAndNormals 는 중복 정점 용접과 구멍 봉합 뒤 부호 있는 부피가 음수이면 전체 삼각형 와인딩을 일괄 반전해 외향 수밀 솔리드(+1.0)를 보장합니다.",
          "After welding duplicates and capping holes, healMeshTopologyAndNormals flips winding whenever signed volume is negative so outward watertight solids (+1.0) are guaranteed.",
        ),
        source: "apps/web/src/domains/creator/wasm64-creator-defense-healer/mesh-topology-healer.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "VRM Consortium · VRM 1.0 Expression & Humanoid Specification",
        url: "https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/README.md",
        kind: "spec",
        note: t("웹캠 52 ARKit 블렌드셰이프를 매핑하는 VRM 1.0 표준 규격", "VRM 1.0 standard mapped from 52 ARKit webcam blendshapes"),
      },
      {
        title: "SIGGRAPH 2023 · 3D Gaussian Splatting for Real-Time Radiance Field Rendering",
        url: "https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/",
        kind: "article",
        note: t("3DGS 깊이 기수 정렬과 구면조화함수(SH) 리라이팅의 원형 논문", "Original 3D Gaussian Splatting paper behind depth sorting and SH lighting"),
      },
    ],
    chapterIds: ["web-3d-engine", "virtual-studio-world-authority", "browser-local-compute"],
    talk: {
      pitch: t(
        "깨진 3D 소품은 1.01ms 만에 결함 0·부피 +1.0 으로 자동 치유하고, 웹캠으로 52 ARKit VRM 표정을 바로 미러링하며, 3DGS 배경은 5.57ms 기수 정렬과 구면조화함수(SH) 시간대·날씨 리라이팅으로 웹툰 톤에 맞춥니다.",
        "Broken 3D props self-heal to 0 defects in 1.01 ms, webcams mirror 52-ARKit VRM poses with instant cut-freeze, and 3DGS scenes sort in 5.57 ms with spherical-harmonics time-of-day relighting.",
      ),
      analogy: t(
        "찢어진 종이 모형을 1ms 만에 풀로 붙이고(메시 힐러), 거울을 보며 인형 표정을 따라 짓고(웹캠 VRM), 사진 배경에 노을과 빗방울 조명만 갈아 끼우는(3DGS SH) 3D 소품실입니다.",
        "Like repairing a torn prop in 1 ms, posing a puppet in front of a mirror, and swapping sunset and rain lighting onto a 3DGS backdrop.",
      ),
      questions: [
        {
          question: t("웹캠 영상이 외부 서버로 전송되나요?", "Is the webcam video sent to any external server?"),
          answer: t(
            "전송되지 않습니다. 브라우저 안에서 추출된 얼굴·상반신 랜드마크 좌표만 52개 ARKit 수치와 VRM 회전값으로 변환하며, 원할 때 숫자 스냅샷(컷 프리즈)만 저장합니다.",
            "Never. Only local facial and upper-body landmark coordinates are converted into 52 ARKit weights and VRM joint angles inside the browser.",
          ),
        },
        {
          question: t("3DGS 리라이팅에서 relightStrength=0 을 주면 원본 색이 바뀌나요?", "Does setting relightStrength=0 alter original 3DGS colors?"),
          answer: t(
            "날씨가 맑고 안개가 0일 때 relightStrength=0 은 입력 SH L0/L1 계수를 그대로 보존하도록 엣지 테스트로 검증했습니다.",
            "Edge tests verify that relightStrength=0 with clear weather and zero fog preserves the input SH L0/L1 bands exactly.",
          ),
        },
      ],
      pitfall: t(
        "매우 복잡한 비다양체(3개 이상 면이 한 변을 공유하는 T-분지) 메시는 단순 경계 구멍 봉합만으로 완전 복구되지 않을 수 있어 Blender 리메시 보조 경로가 여전히 필요합니다.",
        "Severely tangled non-manifold meshes (three or more faces sharing one edge) may still require Blender remeshing beyond automatic hole capping.",
      ),
    },
    technologies: ["3DGS Radix Sort", "Spherical Harmonics", "VRM / 52 ARKit", "Manifold Healer"],
    facts: [
      {
        value: "1.01 ms (0 defects)",
        label: t("3D 메시 토폴로지·노멀 자동 치유 · 수밀 부피 +1.0 실측", "3D mesh topology & normal healing to 0 defects (+1.0 volume)"),
        source: "apps/web/src/domains/creator/wasm64-creator-defense-healer/mesh-topology-healer.ts",
      },
      {
        value: "52 ARKit + Cut-Freeze",
        label: t("웹캠 얼굴·상반신 VRM 60fps 미러링 및 즉시 컷 프리즈", "Webcam 52-ARKit & upper-body VRM 60 fps mirror with cut-freeze"),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/webcam-vrm-pose-solver.ts",
      },
      {
        value: "5.57 ms (4,096 splats)",
        label: t("3DGS 16/32비트 깊이 기수 정렬 및 셀/잉크 NPR WGSL 합성", "3DGS 16/32-bit depth radix sort & webtoon NPR WGSL composite"),
        source: "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/subms-audioworklet-ring-and-3dgs-bridge.ts",
      },
      {
        value: "SH L0/L1 + 4 Presets",
        label: t("3DGS 새벽·정오·노을·야간 SH 리라이팅 및 깊이 인식 날씨 패스", "3DGS dawn/noon/sunset/night SH relight & depth weather pass"),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/sh-3dgs-relight-weather.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "supergap-pnp-camera-smear-gbuffer-instancing",
    category: "three-d",
    name: "PnP Camera · Bone Smear · G-Buffer 6-Layer · 5K Instancing",
    title: t("2D→3D PnP 역산 · 본 스미어 · G-Buffer 6레이어 · 5K 인스턴싱", "2D→3D PnP camera, bone smear, G-Buffer 6-layer & 5K instancing"),
    status: "experimental",
    tagline: t(
      "포비에이티드 75.38%·5,000 인스턴스 99.02% 배칭(4.74ms), <1ms PnP 역산, 본 스미어, G-Buffer 6레이어 샌드위치.",
      "Foveated 75.38% & 5,000-instance 99.02% batching (4.74 ms), <1 ms PnP camera, bone smear & 6-layer G-Buffer sandwich.",
    ),
    background: [
      t(
        "2D 콘티 위에 3D 배경을 얹을 때 카메라 초점거리·기울기를 눈대중으로 맞추면 투시가 어긋나고, 액션 컷의 잔상(스미어)이나 캐릭터와 배경 사이에 말풍선을 끼워 넣는 깊이 샌드위치 연출은 레이어를 일일이 마스킹해야 합니다. 수천 개의 3D 군중·소품을 띄울 때는 드로우콜 폭발로 프레임이 떨어집니다.",
        "Eyeballing 3D camera perspective over 2D roughs breaks vanishing lines, manually masking characters to sandwich speech balloons between foreground and background eats hours, and thousands of 3D props trigger draw-call bottlenecks.",
      ),
      t(
        "wasm64-foveated-haptic-narrative 의 foveated-instancing-and-haptic-brush.ts 는 시선·펜촉 중심 타일만 1×1 LOD 0 으로 먼저 그리는 포비에이티드 렌더링으로 셰이딩 작업을 75.38% 줄였고, 5,000개 3D 인스턴스를 64바이트 WebGPU 슬랩(WGSL_MULTI_INSTANCE_CULL_BATCH)으로 압축해 드로우콜을 99.02% 줄였습니다(4.74ms 실측).",
        "foveated-instancing-and-haptic-brush.ts prioritizes 1×1 LOD 0 tiles around gaze/pen focus for 75.38% shading reduction, and packs 5,000 3D instances into 64-byte WebGPU slabs (WGSL_MULTI_INSTANCE_CULL_BATCH) to cut draw calls by 99.02% in 4.74 ms.",
      ),
      t(
        "wasm64-supergap-drawing-3d 의 camera-pnp-motion-smear.ts 와 webcam-vrm-3dgs-pnp-smear-split.ts 는 세 가지 웹툰 특화 3D 연출 커널(#7~#9)을 제공합니다. ① solveCameraFromVanishingGuides 는 2점·3점 러프 소실선에서 초점거리(24–135mm 클램프)·요/피치/롤·수평선을 1.0ms 미만으로 역산합니다. ② synthesizeMotionSmearAndSpeedlines 는 3D 본 모션 벡터로 스미어 잔상 쿼드와 방사 집중선을 자동 생성합니다.",
        "camera-pnp-motion-smear.ts and webcam-vrm-3dgs-pnp-smear-split.ts add three webtoon-native 3D kernels (#7–#9): solveCameraFromVanishingGuides recovers 2/3-point focal length (clamped 24–135 mm), yaw/pitch/roll and horizon in <1.0 ms, while synthesizeMotionSmearAndSpeedlines extrudes 3D bone motion-vector smears and radial speedlines.",
      ),
      t(
        "③ split3dGbufferIntoDepthLayers 는 3D G-Buffer Object-ID 와 깊이를 6개 RGBA 레이어로 분리해 2D 말풍선을 전경 캐릭터 뒤·배경 앞 슬롯에 자동 샌드위치 합성합니다. 현재 구현·실측 완료(Current): 포비에이티드 스케줄러, 5,000 인스턴스 배칭, PnP(<1ms), 스미어, G-Buffer 6레이어 모두 단위·엣지 테스트 검증 완료. 로드맵(Target): 본편 3D 배경 편집기 툴바 연결을 순차 진행합니다.",
        "split3dGbufferIntoDepthLayers splits 3D G-Buffer Object-IDs into 6 RGBA depth layers for automatic 2D speech-balloon sandwich compositing. Current vs Roadmap: all five kernels pass unit/edge tests; wiring into the 3D scene toolbar is staged.",
      ),
    ],
    keyPoints: [
      t("포비에이티드 렌더링: 시선·펜촉 중심 75.38% 셰이딩 절감", "Foveated rendering: 75.38% shading cut around focus"),
      t("5,000 인스턴스 64B WebGPU 배칭: 드로우콜 99.02% 절감(4.74ms)", "5,000-instance 64 B WebGPU batching: 99.02% fewer draws (4.74 ms)"),
      t("2D 소실선 → 3D PnP 카메라 역산(24–135mm) <1.0ms & 본 스미어", "2D→3D PnP camera (24–135 mm) in <1.0 ms & bone motion smear"),
      t("3D G-Buffer Object-ID 6레이어 분할 & 2D 말풍선 깊이 샌드위치", "3D G-Buffer 6-layer split & 2D balloon depth sandwich"),
    ],
    diagram: {
      id: "supergap-pnp-camera-smear-gbuffer-instancing-diagram",
      kind: "layers",
      title: t("포비에이티드 5K 배칭 · PnP 카메라 · 본 스미어 · G-Buffer 6레이어", "Foveated 5K batching, PnP camera, bone smear & G-Buffer 6-layer"),
      caption: t(
        "소실선 카메라 역산부터 5,000개 인스턴스 압축, 액션 스미어, 6레이어 말풍선 깊이 샌드위치까지 한 흐름으로 잇습니다.",
        "Links vanishing-line PnP solving, 5,000-instance culling, action smears and 6-layer balloon depth sandwiches.",
      ),
      alt: t(
        "1층은 2D 러프 소실선에서 1ms 미만으로 24–135mm 카메라와 수평선을 찾는 PnP 역산, 2층은 75.38% 셰이딩 절감 포비에이티드 스케줄러와 5,000개 64B WebGPU 인스턴스 배칭(99.02% 드로우콜 절감·4.74ms), 3층은 3D 본 모션 스미어와 방사 집중선 합성, 4층은 G-Buffer Object-ID 6레이어 분할과 2D 말풍선 깊이 샌드위치 합성입니다.",
        "Four 3D comic staging layers: (1) <1 ms 2D→3D PnP camera solver (24–135 mm), (2) 75.38% foveated tile scheduler & 5,000-instance 64 B batching (99.02% draw reduction, 4.74 ms), (3) 3D bone motion smear & radial speedlines, and (4) 6-layer G-Buffer Object-ID split with 2D balloon depth sandwich.",
      ),
      layers: [
        {
          id: "pnp",
          label: t("1. 2D→3D PnP 카메라 역산", "1. 2D→3D PnP camera solver"),
          sub: t("2점·3점 소실선 → 24–135mm 초점·요/피치/롤·수평선(<1.0ms)", "2/3-pt lines → 24–135 mm focal, yaw/pitch/roll (<1.0 ms)"),
          tone: "local",
          chips: ["<1.0 ms", "24–135mm", "2/3-Point"],
        },
        {
          id: "inst",
          label: t("2. 포비에이티드 & 5K 인스턴싱", "2. Foveated & 5K instancing"),
          sub: t("셰이딩 75.38% 절감 · 64B 슬랩 99.02% 드로우콜 절감(4.74ms)", "75.38% shading cut; 64 B slabs cut draws 99.02% (4.74 ms)"),
          tone: "good",
          chips: ["-75.38% Shade", "-99.02% Draws", "4.74 ms"],
        },
        {
          id: "smear",
          label: t("3. 본 모션 스미어 & 집중선", "3. Bone smear & speedlines"),
          sub: t("3D 본 속도 벡터 → 스미어 잔상 쿼드 + 방사 집중선 자동 합성", "3D bone velocity vectors → smear quads & radial speedlines"),
          tone: "warn",
          chips: ["Motion Vector", "Smear Quad", "Speedlines"],
        },
        {
          id: "gbuf",
          label: t("4. G-Buffer 6레이어 샌드위치", "4. G-Buffer 6-layer sandwich"),
          sub: t("Object-ID 6 RGBA 깊이 분할 → 전경·배경 사이 2D 말풍선 삽입", "6 RGBA Object-ID depth layers for 2D balloon sandwich"),
          tone: "edge",
          chips: ["6 RGBA Layers", "Object-ID", "Balloon Depth"],
        },
      ],
      brackets: [
        { label: t("웹툰 연출 특화 3D 파이프라인", "Webtoon-native 3D staging"), layerIds: ["pnp", "inst", "smear", "gbuf"] },
      ],
    },
    usage: [
      {
        feature: t("2D→3D PnP 카메라 역산 · 본 스미어 · G-Buffer 6레이어 분할", "2D→3D PnP camera, bone smear & G-Buffer 6-layer split"),
        role: t(
          "2/3점 소실선 원근 역산(<1ms), 3D 본 모션 스미어/집중선, G-Buffer Object-ID 6레이어 말풍선 깊이 샌드위치를 계산합니다.",
          "Solves vanishing-line cameras (<1 ms), synthesizes bone motion smears and splits 6 G-Buffer depth layers.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/camera-pnp-motion-smear.ts",
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/webcam-vrm-3dgs-pnp-smear-split.ts",
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/wasm64-supergap-drawing-3d.edge.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("포비에이티드 타일 스케줄러 & 5,000 인스턴스 WebGPU 배칭", "Foveated tile scheduler & 5,000-instance WebGPU batcher"),
        role: t(
          "시선·펜촉 동심원 타일 우선순위(75.38% 셰이딩 절감)와 64B 슬랩 5,000 인스턴스 배칭(99.02% 드로우콜 절감)을 수행합니다.",
          "Schedules foveated concentric tiles (75.38% shading saved) and packs 5,000 64 B instances (99.02% fewer draw calls).",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/foveated-instancing-and-haptic-brush.ts",
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/wasm64-foveated-haptic-narrative.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("2D 소실선 교차점 역산과 24–135mm 초점거리 안전 클램프", "2D vanishing-line intersection & 24–135 mm focal clamp"),
        language: "ts",
        ...sampleSource([
          ["export interface Line2D { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; }"],
          [""],
          ["export function intersectLines2D(a: Line2D, b: Line2D): { readonly x: number; readonly y: number } | null {"],
          ["  const dax = a.x2 - a.x1, day = a.y2 - a.y1;"],
          ["  const dbx = b.x2 - b.x1, dby = b.y2 - b.y1;"],
          ["  const denom = dax * dby - day * dbx;"],
          ["  if (Math.abs(denom) < 1e-6) return null;", "평행 소실선 특이점 방어", "guard parallel vanishing lines"],
          ["  const tParam = ((b.x1 - a.x1) * dby - (b.y1 - a.y1) * dbx) / denom;"],
          ["  return { x: a.x1 + tParam * dax, y: a.y1 + tParam * day };"],
          ["}"],
          [""],
          ["export function clampFocalMm(focalMm: number): number {"],
          ["  return Math.min(135, Math.max(24, Number.isFinite(focalMm) ? focalMm : 50));"],
          ["}"],
        ]),
        explain: t(
          "실제 solveCameraFromVanishingGuides 는 다수 소실선의 최소제곱 교차점에서 2점·3점 직교 조건으로 초점거리(24–135mm 클램프)와 요·피치·롤·수평선을 1ms 미만으로 복원합니다.",
          "The full solveCameraFromVanishingGuides solves least-squares vanishing points to recover 24–135 mm focal length, yaw/pitch/roll and horizon in under 1 ms.",
        ),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/camera-pnp-motion-smear.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · WebGPU Specification (Indirect Draw & Storage Buffers)",
        url: "https://www.w3.org/TR/webgpu/#gpu-render-encoder-base",
        kind: "spec",
        note: t("64바이트 인스턴스 슬랩과 다중 인스턴스 배칭의 WebGPU 스토리지 버퍼 규격", "WebGPU storage buffer and instanced draw specification"),
      },
      {
        title: "Hartley & Zisserman · Multiple View Geometry in Computer Vision",
        url: "https://www.robots.ox.ac.uk/~vgg/hzbook/",
        kind: "guide",
        note: t("소실점 직교 조건을 이용한 단안 카메라 초점거리·회전 역산 이론", "Single-view vanishing-point camera calibration reference"),
      },
    ],
    chapterIds: ["web-3d-engine", "performance", "browser-local-compute"],
    talk: {
      pitch: t(
        "포비에이티드 타일로 셰이딩 75.38%, 5,000 인스턴스 64B 배칭으로 드로우콜 99.02%(4.74ms)를 줄였고, 2D 러프 소실선에서 1ms 미만으로 3D 카메라를 맞추며 본 스미어·집중선과 G-Buffer 6레이어 말풍선 깊이 샌드위치까지 한 번에 처리합니다.",
        "Foveated tiles cut shading 75.38%, 64 B batching cuts 5,000-instance draw calls 99.02% (4.74 ms), PnP aligns 3D cameras from 2D lines in <1 ms, and G-Buffer splits 6 layers for balloon depth sandwiches.",
      ),
      analogy: t(
        "콘티에 그은 투시선 두 개만 보고 카메라 렌즈를 바로 맞추고, 시선이 닿는 곳만 선명하게 그리며, 배우와 배경 사이에 대사 말풍선 판넬을 깔끔하게 끼워 넣는 촬영 세트장입니다.",
        "Like auto-focusing a film lens from two sketch lines, rendering sharpest where the eye looks, and sliding dialogue boards cleanly between actor and backdrop.",
      ),
      questions: [
        {
          question: t("소실선이 평행하거나 극단적인 광각·망원 입력이 들어오면 카메라가 튀지 않나요?", "Does parallel or extreme vanishing-line input make the PnP camera explode?"),
          answer: t(
            "평행선 특이점을 방어하고 초점거리를 실용 렌즈 구간인 24–135mm 로 클램프하는 엣지 테스트(50회 평균 <1ms)로 안정성을 확인했습니다.",
            "Edge tests over 50 runs (<1 ms avg) verify parallel-line guards and focal-length clamping within [24, 135] mm.",
          ),
        },
        {
          question: t("G-Buffer 6레이어에 미등록 오브젝트가 있으면 누락되나요?", "Are unregistered objects dropped during 6-layer G-Buffer splitting?"),
          answer: t(
            "미등록 Object-ID 픽셀은 깊이 대역(depth-band)과 AO 그림자 폴백 레이어로 자동 분류해 누락 없이 합성되도록 엣지 테스트로 검증했습니다.",
            "Edge tests verify that unregistered Object-IDs fall back cleanly to depth-band and AO shadow layers without dropping pixels.",
          ),
        },
      ],
      pitfall: t(
        "4.74ms 배칭과 75.38% 셰이딩 절감은 5,000개 인스턴스·128px 포비얼 타일 기준 실측이며, 모바일 GPU 의 실제 프레임 시간은 텍스처 대역폭과 화면 해상도에 따라 달라집니다.",
        "The 4.74 ms batching and 75.38% shading metrics come from 5,000-instance / 128 px tile benchmarks; mobile GPU frame times still depend on bandwidth and resolution.",
      ),
    },
    technologies: ["WebGPU Instancing", "Foveated Rendering", "PnP Camera", "G-Buffer Split"],
    facts: [
      {
        value: "-75.38% Shading",
        label: t("시선·펜촉 중심 동심원 포비에이티드 타일 스케줄러 절감 실측", "Foveated concentric tile priority shading reduction"),
        source: "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/foveated-instancing-and-haptic-brush.ts",
      },
      {
        value: "-99.02% Draws (4.74 ms)",
        label: t("5,000개 3D 인스턴스 64B WebGPU 슬랩 배칭 압축 실측", "5,000-instance 64 B WebGPU slab batching & draw reduction"),
        source: "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/wasm64-foveated-haptic-narrative.test.ts",
      },
      {
        value: "<1.0 ms (24–135mm)",
        label: t("2D 소실선 → 3D PnP 카메라 역산(50회 평균 1ms 미만)", "2D vanishing guides → 3D PnP camera solve (<1.0 ms avg)"),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/camera-pnp-motion-smear.ts",
      },
      {
        value: "6 RGBA Depth Layers",
        label: t("G-Buffer Object-ID 6레이어 분할 및 2D 말풍선 깊이 샌드위치", "6-layer G-Buffer Object-ID split & 2D balloon sandwich"),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/webcam-vrm-3dgs-pnp-smear-split.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
