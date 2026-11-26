import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · three-d · Waves 5–23 3D 공간 음향·시네마토그래피·캐릭터 스키닝·2.5D 원근 그림자·측지선 의복 3종 카드.
 */
export const THREE_D_WAVES5TO23_SPATIAL_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "wave5-to-10-acoustic-sh-bokeh-joint-guard",
    category: "three-d",
    name: "Waves 5·7·9·10 Acoustic RT60 · 4D SH · Joint Guard · CoC Bokeh",
    title: t(
      "Waves 5·7·9·10 3D 잔향·4D SH 조도장 · 관절 한계 가드 · 시네마 코치 & CoC 보케",
      "Waves 5·7·9·10 3D acoustics, 4D SH lightfield, joint guard, cinema coach & CoC bokeh",
    ),
    status: "experimental",
    tagline: t(
      "Sabine/Eyring 음향과 <32KiB 4D SH 조도장, 스윙-트위스트 관절 가드, 1° 구도 코치, 박막 CoC 보케·컬 바람장을 묶었습니다.",
      "Unites Sabine/Eyring acoustics, <32 KiB 4D SH probes, swing-twist joint guards, 1° cinema coaching and CoC bokeh/curl wind.",
    ),
    background: [
      t(
        "웹툰용 3D 무대를 조작할 때 무거운 라이트맵은 메모리를 과도하게 차지하고, IK 핸들을 무리하게 끌면 팔꿈치·어깨 관절이 비현실적인 각도로 꺾이며, 피사계 심도 블러에서 앞쪽 인물의 색이 뒤쪽 배경으로 번지는 현상이 자주 생깁니다.",
        "Heavy 3D lightmaps bloat browser memory, unconstrained IK drags twist character joints past anatomical limits, and naive depth-of-field blurs bleed sharp foreground silhouettes onto distant backgrounds.",
      ),
      t(
        "Wave 5 acoustic-raymarch-irradiance.ts 는 3D 방 크기·재질에서 Sabine/Eyring 잔향(RT60)과 32KiB 미만의 반정밀도 4D(공간+시간대) L2 구면 조화 라이트필드를 굽고, Wave 7 biomech-joint-ransac-perspective.ts 는 스윙-트위스트 쿼터니언 분해 관절 한계 가드와 RANSAC 1·2·3점 투시 소실점 복원을 수행합니다.",
        "Wave 5 bakes Sabine/Eyring RT60 room acoustics and <32 KiB float16 4D L2 spherical-harmonics lightfields, while Wave 7 enforces swing-twist quaternion joint limits and RANSAC 1/2/3-point perspective rulers.",
      ),
      t(
        "Wave 9 cinematography-pigment-plugin.ts 의 1° 단위 카메라 롤·크롭·말풍선 가림 역방향 시네마토그래피 코치와 Wave 10 thinlens-bokeh-curl-wind.ts 의 물리 착란원(CoC) 아나모픽 보케·무발산(∇·v = 0) 컬-노이즈 머리카락 바람장까지 0B 초기 번들 지연 로드로 검증했습니다(Current: 단위 검증 완료, Target: 3D 스테이지 카메라·포즈 기즈모 연동).",
        "Wave 9 adds a 1° camera-roll/crop inverse cinematography coach, joined by Wave 10 physical thin-lens/anamorphic CoC bokeh and divergence-free (∇·v = 0) curl-noise hair wind at 0 B eager bundle impact (Current: unit-verified; Target: 3D stage camera & pose gizmo wiring).",
      ),
    ],
    keyPoints: [
      t("Sabine/Eyring 3D 공간 잔향(RT60) & <32KiB 반정밀도 4D SH 조도장", "Sabine/Eyring 3D room RT60 & <32 KiB fp16 4D SH irradiance"),
      t("해부학 스윙-트위스트 쿼터니언 관절 가드 & RANSAC 소실점 복원", "Anatomical swing-twist joint guard & RANSAC vanishing points"),
      t("1° 카메라 롤 · 삼분할 · 말풍선 가림 역방향 시네마토그래피 코치", "1° camera roll, rule-of-thirds & balloon-occlusion cinema coach"),
      t("물리 박막 렌즈·2× 아나모픽 CoC 보케 & 무발산(∇·v=0) 컬 바람장", "Thin-lens/2× anamorphic CoC bokeh & divergence-free curl wind"),
    ],
    diagram: {
      id: "wave5-to-10-acoustic-sh-bokeh-joint-guard-diagram",
      kind: "layers",
      title: t("3D 공간 조명 · 해부학 포즈 · 시네마 구도 · 렌즈 광학 스택", "3D stage relighting, biomechanical pose, cinema framing & lens stack"),
      caption: t(
        "무대 조도장과 음향부터 관절 해부학 한계, 카메라 구도 코칭, 최종 박막 렌즈 보케까지 네 단계로 장면을 다듬습니다.",
        "Refines 3D webtoon stages across 4D SH lighting/acoustics, anatomical joint clamping, framing coaching and CoC lens optics.",
      ),
      alt: t(
        "위에서부터 <32KiB 4D 구면 조화 조도장과 Sabine/Eyring 잔향 계층, 스윙-트위스트 관절 한계 가드와 RANSAC 투시 자 계층, 역방향 시네마토그래피 구도 코치와 무발산 컬 바람장 계층, 박막 렌즈 아나모픽 CoC 보케 렌더 계층이 순서대로 놓입니다.",
        "Four layers from top to bottom: <32 KiB 4D SH lightfield & Sabine/Eyring acoustics, swing-twist joint guard & RANSAC perspective, inverse cinematography coach & curl-noise wind, and thin-lens anamorphic CoC bokeh pass.",
      ),
      layers: [
        { id: "sh", label: t("4D SH 조도장 · 3D 공간 음향", "4D SH lightfield & 3D acoustics"), sub: t("<32KiB 시간대 리라이팅 · Sabine/Eyring RT60", "<32 KiB time-slice relighting & RT60 IR"), tone: "local", chips: ["SH L2", "Wave 5"] },
        { id: "bio", label: t("스윙-트위스트 관절 가드 · RANSAC 투시", "Swing-twist joint guard & RANSAC"), sub: t("해부학 가동역 클램프 · 1·2·3점 소실점 자", "Anatomical quaternion clamp & VP ruler"), tone: "good", chips: ["Quaternion", "Wave 7"] },
        { id: "cin", label: t("역방향 시네마 코치 · 무발산 컬 바람장", "Inverse cinema coach & curl wind"), sub: t("1° 롤/크롭 제안 · ∇·v = 0 머리카락 기류", "1° roll/crop coach & ∇·v=0 strand wind"), tone: "good", chips: ["Curl 3D", "Wave 9·10"] },
        { id: "coc", label: t("박막 렌즈 · 2× 아나모픽 CoC 보케", "Thin-lens & 2× anamorphic CoC bokeh"), sub: t("전경 번짐 차단 · 황금각 조리개 커널", "Foreground bleed guard & golden-angle taps"), tone: "local", chips: ["WGSL", "Wave 10"] },
      ],
    },
    usage: [
      {
        feature: t("3D 공간 음향 · <32KiB 4D SH 조도장 · 관절 한계 가드 & RANSAC 투시", "3D acoustics, <32 KiB 4D SH cache, joint guard & RANSAC perspective"),
        role: t(
          "재질별 잔향 합성, 아침·황혼·심야 O(1) 4선형 구면 조화 리라이팅, 관절 가동역 클램프 및 소실점 추정을 수행합니다.",
          "Computes room RT60 impulses, O(1) 4D SH relighting, swing-twist joint clamping and RANSAC perspective vanishing points.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave5-frontier/acoustic-raymarch-irradiance.ts",
          "apps/web/src/domains/creator/wasm64-wave7-sovereign/biomech-joint-ransac-perspective.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("역방향 시네마토그래피 구도 코치 · 박막 CoC 보케 · 무발산 컬 바람장", "Inverse cinematography coach, thin-lens CoC bokeh & curl-noise wind"),
        role: t(
          "말풍선 인물 가림 없는 카메라 구도 보정값과 물리 초점거리·조리개 기반 보케 및 무발산 바람 벡터장을 계산합니다.",
          "Suggests balloon-safe camera crops/rolls and evaluates physical f-stop CoC bokeh plus divergence-free curl wind.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave9-zenith/cinematography-pigment-plugin.ts",
          "apps/web/src/domains/creator/wasm64-wave10-omega/thinlens-bokeh-curl-wind.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("박막 렌즈 방정식 기반 물리 착란원(Circle of Confusion, mm) 산출", "Physical thin-lens Circle of Confusion (CoC in mm)"),
        language: "ts",
        ...sampleSource([
          ["export function thinLensCocMm(depthM: number, focusM: number, focalMm: number, fStop: number): number {"],
          ["  const s2 = Math.max(0.05, depthM) * 1000;"],
          ["  const s1 = Math.max(focalMm + 1, focusM * 1000);"],
          ["  const apertureD = focalMm / Math.max(0.7, fStop);"],
          ["  return (Math.abs(s2 - s1) / s2) * ((apertureD * focalMm) / (s1 - focalMm));", "초점면(s1)에서는 0mm, 멀어질수록 조리개에 비례", "0 mm at focus plane; scales with aperture"],
          ["}"],
        ]),
        explain: t(
          "thinlens-bokeh-curl-wind.ts 는 풀프레임 센서 폭(36mm) 대비 픽셀 반경으로 환산한 뒤 깊이 불연속 경계에서 전경 색 번짐을 차단합니다.",
          "thinlens-bokeh-curl-wind.ts converts CoC mm to sensor-relative pixel radii while blocking foreground silhouette color bleed.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave10-omega/thinlens-bokeh-curl-wind.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Peter-Pike Sloan · Stupid Spherical Harmonics (SH) Tricks",
        url: "https://www.ppsloan.org/publications/StupidSH36.pdf",
        kind: "paper",
        note: t("L2 구면 조화 기저 9계수를 이용한 실시간 확산 조도 재구성", "Real-time diffuse irradiance reconstruction with 9 L2 SH coefficients"),
      },
      {
        title: "Robert Bridson et al. · Curl-Noise for Procedural Fluid Flow",
        url: "https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf",
        kind: "paper",
        note: t("포텐셜 장의 회전(Curl)으로 무발산 속도장을 얻는 원전 논문", "Foundational paper deriving divergence-free velocity fields via curl"),
      },
    ],
    chapterIds: ["web-3d-engine", "sound-generation"],
    talk: {
      pitch: t(
        "32KiB도 안 되는 4D 조도장으로 아침부터 심야까지 즉시 조명을 바꾸고, 관절 꺾임 방지와 실제 카메라 렌즈 공식 그대로의 보케까지 브라우저 안에서 계산합니다.",
        "Relights 3D sets from dawn to midnight in <32 KiB while guarding anatomical joints and rendering physical thin-lens CoC bokeh locally.",
      ),
      analogy: t(
        "시간대별 조명 스위치, 인체 모형 관절 스토퍼, 촬영 감독의 구도 조언, 시네마 단렌즈 조리개 링을 한 뷰포트에 달아 둔 촬영 세트장입니다.",
        "Like equipping a 3D set with a time-of-day dimmer, mannequin joint stops, a framing director and a cinema prime aperture ring.",
      ),
      questions: [
        {
          question: t("오일러 각 범위 제한 대신 스윙-트위스트(Swing-Twist) 쿼터니언 분해를 쓰는 이유는 무엇인가요?", "Why clamp joints with swing-twist decomposition instead of Euler angles?"),
          answer: t(
            "오일러 각은 어깨처럼 가동 범위가 넓은 구관절에서 짐벌 락과 축 간 간섭이 생기지만, 스윙(벌림 방향)과 트위스트(축 비틀림)를 분리하면 해부학적 원뿔 한계를 매끄럽게 투영할 수 있습니다.",
            "Euler limits suffer from gimbal lock on wide ball joints like shoulders, whereas swing-twist cleanly separates cone reach from axial twist.",
          ),
        },
      ],
    },
    technologies: ["Spherical Harmonics", "Quaternion IK", "RANSAC", "Curl Noise", "WGSL"],
    facts: [
      { value: "< 32 KiB", label: t("반정밀도 4D L2 구면 조화 프로브 캐시 상한", "Float16 4D L2 SH lightfield cache budget"), source: "apps/web/src/domains/creator/wasm64-wave5-frontier/acoustic-raymarch-irradiance.ts" },
      { value: "∇ · v = 0", label: t("머리카락·망토 기류용 무발산 컬-노이즈 불변식", "Divergence-free curl-noise wind invariant"), source: "apps/web/src/domains/creator/wasm64-wave10-omega/thinlens-bokeh-curl-wind.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave13-to-20-dqs-skinning-sfx-mesh-hand-ik",
    category: "three-d",
    name: "Waves 13·17·19·20 DQS+RBF · Catenary · Interior · 3D SFX & Hand IK",
    title: t(
      "Waves 13·17·19·20 DQS 부피 보존 스키닝 · 현수선 옷주름 · 실내 매핑 · 3D SFX & 손 파지 IK",
      "Waves 13·17·19·20 DQS+RBF skinning, catenary folds, interior mapping, 3D SFX & hand IK",
    ),
    status: "experimental",
    tagline: t(
      "부피 손실 0.000% DQS+RBF 스키닝, 현수선 옷주름·처마 우천 차폐, 2-삼각형 실내 매핑, 수밀 3D 한글 효과음과 15-DOF 손 IK를 제공합니다.",
      "Delivers 0.000% volume-loss DQS+RBF skinning, catenary folds, eave-occluded rain, 2-triangle interiors, watertight 3D SFX & 15-DOF hand IK.",
    ),
    background: [
      t(
        "기본 선형 혼합 스키닝(LBS)은 팔목을 180° 비틀 때 사탕 포장지처럼 부피가 홀쭉하게 찌그러지고, 도심 빌딩 수백 개의 창문 내부를 실제 가구 폴리곤으로 채우면 프레임이 급락하며, 손가락 다섯 개로 컵이나 검 자루를 쥐는 포즈는 수동 조작에 가장 많은 시간이 걸립니다.",
        "Linear blend skinning collapses wrist volume like a candy wrapper under twist, modeling hundreds of building room interiors tanks frame rates, and posing five fingers around a prop is notoriously slow.",
      ),
      t(
        "Wave 13 dqs-psd-neural-skinning.ts 는 반구 정렬 단위 듀얼 쿼터니언 스키닝(DQS, 비틀림 부피 손실 0.000%)과 가우시안 RBF 포즈 공간 보정(PSD)을 결합하고, Wave 17 catenary-cloth-weather-wetness.ts 는 쌍곡선 코사인 현수선 옷주름 가이드와 처마·우산 상부 차폐 기반 비·눈·젖은 표면 반사를 합성합니다.",
        "Wave 13 combines hemisphere-aligned Dual-Quaternion Skinning (0.000% twist volume collapse) with Gaussian RBF pose-space deformers, while Wave 17 solves catenary cloth folds and roof/umbrella-occluded rain wetness.",
      ),
      t(
        "Wave 19 analog-manuscript-prism-interior.ts 의 실내 폴리곤 0개 의사 3D 외벽 실내 매핑과 Wave 20 disocclusion-inpaint-3dsfx-handgrasp.ts 의 수밀(Watertight) 2-다양체 3D 투시 한글 효과음 메쉬 빌더·힘줄 연동(DIP ≈ 0.67·PIP) 15-DOF 손 파지 접촉 IK 솔버까지 단위 검증을 완료했습니다(Current: 단위 검증 완료, Target: VRM 캐릭터 리그·배경 빌더 연결).",
        "Wave 19 renders 0-interior-polygon city facades via 2-triangle interior mapping, while Wave 20 builds watertight 2-manifold 3D Korean SFX meshes and solves 15-DOF tendon-coupled (DIP ≈ 0.67·PIP) hand grasp IK (Current: unit-verified; Target: VRM rig & city stage wiring).",
      ),
    ],
    keyPoints: [
      t("반구 정렬 듀얼 쿼터니언(DQS) 부피 손실 0.000% + 가우시안 RBF 보정", "Hemisphere-aligned DQS (0.000% volume loss) + Gaussian RBF PSD"),
      t("쌍곡선 현수선 옷주름 가이드 & 처마·우산 차폐 우천·젖은 표면 합성", "Catenary cloth fold guides & eave/umbrella-occluded rain wetness"),
      t("실내 폴리곤 0개(2-삼각형 외벽) 의사 3D 도심 야경 실내 매핑 커널", "2-triangle 0-interior-polygon pseudo-3D facade interior mapping"),
      t("수밀 2-다양체 3D 한글 효과음 메쉬 & 힘줄 연동 15-DOF 손 파지 IK", "Watertight 2-manifold 3D Korean SFX mesh & 15-DOF hand grasp IK"),
    ],
    diagram: {
      id: "wave13-to-20-dqs-skinning-sfx-mesh-hand-ik-diagram",
      kind: "graph",
      title: t("캐릭터 해부학 변형 · 손 파지 IK · 2.5D 도시 무대 · 3D 효과음", "Character DQS+IK rig, 2.5D city stage & watertight 3D SFX"),
      caption: t(
        "인체 부피 보존과 소품 파지 IK, 가벼운 도심 야경·날씨 무대, 투시 일체형 3D 효과음 메쉬가 한 액션 컷에서 만납니다.",
        "Joins volume-preserving DQS and 15-DOF hand grasp IK with lightweight interior-mapped rain stages and 3D SFX meshes.",
      ),
      alt: t(
        "왼쪽 위 VRM 관절 포즈가 DQS+RBF 스키닝과 15-DOF 손 파지 IK를 거쳐 캐릭터 실루엣을 만들고, 왼쪽 아래 도심·날씨 입력이 2-삼각형 실내 매핑·처마 우천 차폐를 거쳐 우측 수밀 3D 한글 효과음 액션 컷 합성으로 모입니다.",
        "VRM pose drives DQS+RBF skinning and 15-DOF hand grasp IK on the upper path, while city/weather specs drive 2-triangle interior mapping and eave rain occlusion on the lower path, meeting at the 3D SFX action cut.",
      ),
      nodes: [
        { id: "rig", label: t("VRM 포즈 · 소품", "VRM pose & prop"), sub: t("어깨 비틀림 · 파지 목표", "Twist & grasp target"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "dqs", label: t("DQS+RBF · 15-DOF", "DQS+RBF & Hand IK"), sub: t("부피 0% 손실 · 힘줄 연동", "0% collapse & tendon IK"), tone: "good", at: [1, 0] },
        { id: "set", label: t("도심 외벽 · 날씨", "Facade & weather"), sub: t("2-삼각형 실내 · 처마 차폐", "2-tri room & eave rain"), tone: "local", at: [0, 2] },
        { id: "cloth", label: t("현수선 주름 · 3D SFX", "Catenary & 3D SFX"), sub: t("cosh 주름 · 수밀 2-다양체", "cosh folds & 2-manifold"), tone: "good", at: [1, 2] },
        { id: "cut", label: t("완성 액션 컷", "Final action cut"), sub: t("투시·접촉·조명 일체화", "Unified perspective"), tone: "good", shape: "pill", at: [2, 1] },
      ],
      edges: [
        { from: "rig", to: "dqs", label: t("관절·SDF", "Joints") },
        { from: "set", to: "cloth", label: t("법선·소실점", "Normals") },
        { from: "dqs", to: "cut", label: t("캐릭터", "Actor") },
        { from: "cloth", to: "cut", label: t("무대·식자", "Stage & SFX") },
      ],
    },
    usage: [
      {
        feature: t("듀얼 쿼터니언(DQS) + RBF 스키닝 & 15-DOF 힘줄 연동 손 파지 IK", "Dual-Quaternion + RBF skinning & 15-DOF tendon-coupled hand IK"),
        role: t(
          "사지 비틀림 시 부피 붕괴를 제거하고 원기둥·구·상자 소품 표면에 다섯 손가락이 관통 없이 감기는 자세를 풉니다.",
          "Eliminates limb twist collapse and solves penetration-free 5-finger grasp poses against SDF prop primitives.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave13-continuum/dqs-psd-neural-skinning.ts",
          "apps/web/src/domains/creator/wasm64-wave20-grand-finale/disocclusion-inpaint-3dsfx-handgrasp.ts",
          "apps/web/src/domains/creator/wasm64-wave20-grand-finale/hand-grasp-contact-ik.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("현수선 옷주름 · 우천 차폐 · 2-삼각형 실내 매핑 · 수밀 3D 한글 SFX", "Catenary folds, weather occlusion, 2-tri interiors & 3D Korean SFX"),
        role: t(
          "고정점 사이 현수선 드레이프, 처마 아래 마른 영역 보존, 폴리곤 없는 유리창 내부 투영 및 오일러 수밀 3D 효과음 돌출을 수행합니다.",
          "Computes catenary drapes, eave-dry weather masks, ray-cast window interiors and watertight beveled 3D SFX meshes.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave17-finalcraft/catenary-cloth-weather-wetness.ts",
          "apps/web/src/domains/creator/wasm64-wave19-atelier-perfection/analog-manuscript-prism-interior.ts",
          "apps/web/src/domains/creator/wasm64-wave20-grand-finale/perspective-sfx-3d-mesh.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("인체 수지 굴곡근 힘줄 연동(DIP ≈ 0.67 × PIP) 손가락 관절각 계산", "Anatomical flexor-tendon coupling (DIP ≈ 0.67 × PIP) for finger grasp"),
        language: "ts",
        ...sampleSource([
          ["export function coupledFingerFlexionRad(curlZeroToOne: number): readonly [number, number, number] {"],
          ["  const t = Math.min(1, Math.max(0, curlZeroToOne));"],
          ["  const mcp = t * 1.22;"],
          ["  const pip = t * 1.57;"],
          ["  return [mcp, pip, pip * 0.67];", "원위지절(DIP)이 근위지절(PIP)을 0.67 비율로 자연 추종", "distal joint tracks PIP via 0.67 tendon ratio"],
          ["}"],
        ]),
        explain: t(
          "hand-grasp-contact-ik.ts 는 5개 손가락(15-DOF)마다 목표 소품의 부호화 거리장(SDF = 0) 접촉점에서 이진 탐색으로 관통 없는 파지 각도를 확정합니다.",
          "hand-grasp-contact-ik.ts binary-searches curl along each finger's 3 joints until fingertip pads rest cleanly on the prop SDF=0 surface.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave20-grand-finale/hand-grasp-contact-ik.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Ladislav Kavan et al. · Skinning with Dual Quaternions",
        url: "https://dl.acm.org/doi/10.1145/1342250.1342252",
        kind: "paper",
        note: t("강체 변환 혼합으로 관절 부피 붕괴를 막는 듀얼 쿼터니언 스키닝 원전", "Foundational paper eliminating candy-wrapper collapse via dual quaternions"),
      },
      {
        title: "Joost van Dongen · Interior Mapping — A New Technique for Rendering Realistic Buildings",
        url: "https://cg.ivd.kit.edu/publications/p2008/interior_mapping_van_dongen_2008.pdf",
        kind: "paper",
        note: t("외벽 쿼드 광선-평면 교차만으로 방 내부를 그리는 실내 매핑 기법", "Ray-plane intersection inside facade quads with zero interior geometry"),
      },
    ],
    chapterIds: ["web-3d-engine", "blender-mcp-boundary"],
    talk: {
      pitch: t(
        "손목 비틀림 찌그러짐 0%, 클릭 한 번으로 검 자루를 감싸 쥐는 15자유도 손가락 IK, 실내 폴리곤 0개로 펼쳐지는 도심 야경과 수밀 3D 효과음을 모두 로컬에서 돌립니다.",
        "Runs 0%-collapse DQS wrists, 1-step 15-DOF prop grasp IK, 0-polygon interior-mapped cityscapes and watertight 3D SFX locally.",
      ),
      analogy: t(
        "관절이 찌그러지지 않는 피규어 뼈대, 물체에 대면 알아서 감겨 쥐는 의수, 납작한 유리판 뒤에 방이 있는 것처럼 비추는 홀로그램 창문을 합친 3D 세트입니다.",
        "Like combining a volume-true figure rig, self-closing prosthetic fingers and hologram building windows that need no room furniture meshes.",
      ),
      questions: [
        {
          question: t("3D 효과음 돌출 메쉬에서 수밀(Watertight) 2-다양체 검증은 왜 중요한가요?", "Why enforce watertight 2-manifold verification on 3D extruded SFX meshes?"),
          answer: t(
            "열린 모서리(비다양체 간선)가 하나라도 있으면 스텐실 그림자 볼륨이나 외곽선 백페이스 컬링, 외부 Blender/GLB 내보내기에서 검은 구멍 아티팩트가 생기기 때문입니다.",
            "Even a single non-manifold open edge breaks stencil shadows, NPR outline culling and downstream Blender/GLB boolean operations.",
          ),
        },
      ],
    },
    technologies: ["Dual Quaternion", "Gaussian RBF", "Interior Mapping", "2-Manifold CSG", "15-DOF IK"],
    facts: [
      { value: "0.000%", label: t("180° 축 비틀림 시 DQS 원통 사지 부피 붕괴율", "DQS limb volume collapse under 180° twist"), source: "apps/web/src/domains/creator/wasm64-wave13-continuum/wasm64-wave13-continuum.test.ts" },
      { value: "15 DOF", label: t("DIP≈0.67·PIP 힘줄 연동 5수지 파지 IK 자유도", "Tendon-coupled 5-finger grasp IK degrees of freedom"), source: "apps/web/src/domains/creator/wasm64-wave20-grand-finale/hand-grasp-contact-ik.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave22-to-23-oculo-cephalic-bent-shadow-geodesic",
    category: "three-d",
    name: "Waves 22–23 Oculo-Cephalic Gaze · Bent-Wall Shadow · Geodesic Garment",
    title: t(
      "Waves 22–23 안구-두부-흉추 시선 협응 · 꺾인 벽 원근 그림자 & 측지선 의복 래퍼",
      "Waves 22–23 oculo-cephalic gaze, bent-wall perspective shadow & geodesic garment wrap",
    ),
    status: "experimental",
    tagline: t(
      "생리학적 안구(±28°)·두부·상체 시선 배분, 소실점 꺾인 벽 원근 그림자, 이산 지수 사상(r,θ) 무끼임 의복 문양 래핑을 제공합니다.",
      "Provides physiological eye/head/torso gaze coordination, bent-wall perspective shadows and pinch-free geodesic (r,θ) garment wrapping.",
    ),
    background: [
      t(
        "캐릭터가 옆을 볼 때 눈동자만 과도하게 돌리면 흰자위가 어색해지고, 2D 캐릭터 레이어 그림자를 단순 기울이기(Skew)로 깔면 복도 모서리에서 그림자가 벽을 뚫고 공중에 뜨며, 둥근 어깨 갑옷이나 망토에 체크무늬를 원통 투영하면 솔기 부근이 찌그러집니다.",
        "Rotating eyeballs alone looks uncanny on wide glances, simple 2D skew shadows float through hallway corners, and cylindrical UV projection pinches tartan or crest decals across curved pauldrons and capes.",
      ),
      t(
        "Wave 22 hdr-pq-ribbon-brush-lookat.ts 의 solveOculoCephalicLookAt 은 생리학 한계(안구 ±28° 이내)에 맞춰 안구·목·흉추 회전 비중과 단속성 위상 지연을 자동 배분하고, perspective-shadow-opfs-scrubber.ts 는 2D 동차좌표 소실점 광선으로 바닥에서 수직 벽면으로 꺾여 올라가는 그림자와 거리 비례 반영(Penumbra)을 투영합니다.",
        "Wave 22 coordinates eye (clamped <= ±28°), head and thoracic spine yaw/pitch with saccade phase lead, while projecting 2D homogeneous vanishing-point shadows that bend cleanly up vertical walls with distance-scaled penumbra.",
      ),
      t(
        "Wave 23 geodesic-garment-color-script.ts 는 곡면 메쉬 위 앵커 점으로부터 데이크스트라-패스트마칭 측지 거리와 접평면 극각을 구하는 이산 지수 사상(r, θ)으로 타탄 체크·가문 문장을 끼임 0건(0 pinch)으로 감쌉니다(Current: 단위 검증 완료·0B 번들, Target: 캐릭터 시선 기즈모·의상 데칼·2.5D 그림자 필터 연동).",
        "Wave 23 computes discrete exponential map (r, θ) geodesic coordinates over curved sleeve, cape and pauldron meshes to wrap tartan and crest patterns with 0 pinch folds (Current: unit-verified, 0 B eager; Target: gaze gizmo, decal & shadow filter wiring).",
      ),
    ],
    keyPoints: [
      t("생리학 한계(안구 ±28°) 준수 안구·두부·흉추 시선 협응 & 위상 선행", "Physiological (±28° eye) eye-head-torso Look-At & saccade lead"),
      t("2D 동차좌표 소실점 바닥→수직 벽면 굴절 그림자 & 거리 비례 반영", "2D homogeneous floor-to-wall bent shadow & distance penumbra"),
      t("이산 지수 사상(r, θ) 기반 곡면 소매·망토·갑옷 무끼임(0 pinch) 래핑", "Discrete exponential map (r, θ) 0-pinch curved garment decal wrap"),
      t("3D 리깅 없이도 2D 원고 레이어에 물리적으로 일관된 원근·곡면 부여", "Physically consistent perspective & curvature on 2D/2.5D layers"),
    ],
    diagram: {
      id: "wave22-to-23-oculo-cephalic-bent-shadow-geodesic-diagram",
      kind: "sequence",
      title: t("시선 협응 · 측지선 의복 문양 · 꺾인 벽 원근 그림자 연출 흐름", "Oculo-cephalic gaze, geodesic garment wrap & bent-wall shadow flow"),
      caption: t(
        "캐릭터의 자연스러운 시선 배분과 곡면 의복 문양 투영 뒤, 무대 소실점에 맞춰 바닥과 벽으로 꺾이는 그림자를 완성합니다.",
        "Coordinates natural gaze and pinch-free garment decals before casting vanishing-point shadows across floor-wall corners.",
      ),
      alt: t(
        "연출 목표점이 안구-두부 시선 솔버로 전달되어 안구 ±28° 이내와 목·상체 각도를 정하고, 측지선 의복 래퍼가 소매·망토 위 (r, θ) 좌표로 체크무늬를 입힌 뒤, 원근 그림자 투영기가 바닥에서 벽 모서리로 꺾이는 그림자를 합성합니다.",
        "Target point drives the oculo-cephalic solver (eye <= ±28°, head & torso), the geodesic wrapper maps (r, θ) patterns onto curved garments, and the perspective shadow projector bends cast shadows up vertical walls.",
      ),
      actors: [
        { id: "tgt", label: t("시선 · 광원 목표", "Gaze & light"), sub: t("목표점 · 소실점", "Target & VP"), tone: "local" },
        { id: "gaze", label: t("안구-두부 협응", "Oculo-cephalic"), sub: t("안구 ±28° · 목/흉추", "Eye <=28° + neck"), tone: "good" },
        { id: "geo", label: t("측지선 (r,θ) 래퍼", "Geodesic wrap"), sub: t("망토·갑옷 무끼임", "0-pinch tartan/crest"), tone: "good" },
        { id: "shd", label: t("꺾인 벽 그림자", "Bent-wall shadow"), sub: t("바닥→수직 벽 굴절", "Floor-to-wall bend"), tone: "local" },
      ],
      messages: [
        { from: "tgt", to: "gaze", label: t("응시 목표 전달 (안구 선행 · 두부 추종)", "Dispatch look-at target (eye leads head)") },
        { from: "gaze", to: "geo", label: t("변형된 어깨·망토 곡면에 (r,θ) 문양 투영", "Wrap (r,θ) pattern on posed garment") },
        { from: "geo", to: "shd", label: t("실루엣 발끝 접지선 · 벽 모서리 전달", "Pass foot contact & wall corner line") },
        { from: "shd", to: "tgt", label: t("벽면 상향 굴절 그림자 · 소프트 반영 반환", "Return bent shadow & soft penumbra"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("안구-두부-흉추 시선 협응 솔버 & 꺾인 벽 원근 그림자 투영기", "Oculo-cephalic Look-At solver & bent-wall perspective shadow"),
        role: t(
          "안구 회전 생리학 한계 보호·단속성 눈동자 선행 궤적 생성과 바닥-벽 교차선에서 위로 꺾이는 2D 원근 그림자를 계산합니다.",
          "Solves physiological eye-head-torso gaze trajectories and floor-to-wall bent perspective cast shadows.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts",
          "apps/web/src/domains/creator/wasm64-wave22-ultragap/perspective-shadow-opfs-scrubber.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("곡면 의복 이산 지수 사상(r, θ) 무끼임 문양·타탄 체크 래퍼", "Discrete exponential map (r, θ) geodesic garment pattern wrapper"),
        role: t(
          "소매·망토·어깨 갑옷 곡면에서 등거리 측지선 좌표계를 구성해 일그러짐이나 접힘 없는 문양 샘플링을 수행합니다.",
          "Builds isometric geodesic polar coordinates on curved garments for pinch-free tartan and emblem sampling.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/geodesic-garment-color-script.ts",
          "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/wasm64-wave23-autonomous-cadence.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("생리학적 안구 가동 한계(±28°) 클램프 및 두부·흉추 잔여 각도 배분", "Physiological ±28° eye limit clamp & head/torso yaw split"),
        language: "ts",
        ...sampleSource([
          ["export function splitOculoCephalicYawDeg(targetYawDeg: number): readonly [number, number, number] {"],
          ["  const rawEye = targetYawDeg * 0.45;"],
          ["  const eyeDeg = Math.max(-28, Math.min(28, rawEye));"],
          ["  const remainder = targetYawDeg - eyeDeg;"],
          ["  return [eyeDeg, remainder * 0.72, remainder * 0.28];", "안구 한계 초과분을 목(72%)과 흉추(28%)가 자연 분담", "neck (72%) and torso (28%) absorb gaze beyond ±28°"],
          ["}"],
        ]),
        explain: t(
          "실제 solveOculoCephalicLookAt 은 시간축 궤적에서도 눈동자 단속성 이동(Saccade)이 먼저 목표에 닿고 머리가 뒤따라오면서 안구가 중앙으로 되돌아오는 전정-안구 반사(VOR)를 재현합니다.",
          "solveOculoCephalicLookAt also models temporal VOR phase lead where eyes land first and counter-rotate as the head catches up.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Ryan Schmidt et al. · Interactive Decal Compositing with Discrete Exponential Maps",
        url: "https://dl.acm.org/doi/10.1145/1141911.1141930",
        kind: "paper",
        note: t("곡면 메쉬 위 측지 극좌표 (r, θ) 데칼 매핑을 제안한 SIGGRAPH 논문", "SIGGRAPH paper introducing discrete exponential map (r, θ) surface decals"),
      },
      {
        title: "C. H. Lee et al. · Gaze Behavior and Eye-Head Coordination",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK10991/",
        kind: "docs",
        note: t("단속성 안구 운동(Saccade) 및 두부 협응 신경생리학 기초 자료", "Neuroscience reference on saccadic eye-head coordination and VOR"),
      },
    ],
    chapterIds: ["web-3d-engine"],
    talk: {
      pitch: t(
        "로판·사극 의상의 복잡한 타탄 체크와 문장을 둥근 망토 위에 찌그러짐 없이 감싸고, 2D 캐릭터 그림자가 벽 모서리를 만나 실제 공간처럼 꺾여 올라가게 만듭니다.",
        "Wraps tartan and royal crests across curved capes with zero pinching and bends 2D cast shadows naturally up hallway walls.",
      ),
      analogy: t(
        "구겨지지 않는 재단사의 천 줄자(측지선)와, 방 구석에 손전등을 비췄을 때 바닥 그림자가 벽을 타고 꺾여 올라가는 실제 물리 법칙을 그대로 옮긴 도구입니다.",
        "Like a tailor's flexible tape measure over curved cloth paired with real flashlight geometry at a floor-to-wall corner.",
      ),
      questions: [
        {
          question: t("꺾인 벽 원근 그림자를 쓰려면 배경 전체를 3D 모델로 만들어야 하나요?", "Does bent-wall perspective shadow require a full 3D background mesh?"),
          answer: t(
            "아닙니다. 2D 배경 일러스트 위에 바닥 소실점과 벽 모서리 직선 하나만 지정하면 동차좌표 교차 연산으로 즉시 꺾인 그림자를 투영합니다.",
            "No. Marking just the floor vanishing point and a single wall-corner line on a 2D background suffices to bend the shadow accurately.",
          ),
        },
      ],
    },
    technologies: ["Discrete ExpMap", "Projective Geometry", "Biomechanics", "TypeScript"],
    facts: [
      { value: "±28°", label: t("생리학적 안구 최대 편향각 보호 한계", "Max physiological ocular rotation clamp"), source: "apps/web/src/domains/creator/wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts" },
      { value: "0 pinch", label: t("곡면 소매·망토·어깨 갑옷 측지선 래핑 접힘 수", "Fold/pinch count on curved garment wraps"), source: "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/wasm64-wave23-autonomous-cadence.test.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
