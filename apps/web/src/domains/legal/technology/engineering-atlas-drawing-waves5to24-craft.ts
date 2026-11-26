import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · drawing · Waves 5–23 작화·분광 색채·인쇄 조판 커널 4종 카드 묶음.
 * 모든 파일 경로와 상수는 저장소 내 `wasm64-wave5-*` ~ `wasm64-wave23-*` 실재 소스를 따른다.
 */
export const ENGINEERING_ATLAS_DRAWING_WAVES5TO24_CRAFT: readonly EngineeringAtlasEntry[] = [
  {
    id: "wave5-to-8-sdf-kalman-moire-arap",
    category: "drawing",
    name: "Waves 5–8 SDF · Kalman Stylus · FFT Moire · TSGF",
    title: t(
      "Waves 5–8 미분 역복원 · SDF 말풍선 · FFT 모아레 · 칼만 펜 & 한글 서브셋",
      "Waves 5–8 stroke inverse, SDF balloons, FFT moire, Kalman stylus & TSGF",
    ),
    status: "experimental",
    tagline: t(
      "병합 선화 역복원, smin SDF 말풍선, 2D FFT 모아레 경보, 6상태 칼만 펜과 한글 글리프 서브셋을 묶었습니다.",
      "Unites raster stroke inversion, smin SDF balloons, 2D FFT moire alerts, 6-state Kalman stylus and Hangul subsetting.",
    ),
    background: [
      t(
        "스캔본이나 병합된 래스터 원고는 선 굵기 정보와 개별 벡터 제어점이 사라져 사후 수정이 어렵고, 대사 말풍선을 여러 개 겹칠 때마다 불리언 외곽선을 수동으로 정리해야 하며, 모바일 축소 배율에서는 고밀도 스크린톤이 모아레 줄무늬를 일으킵니다.",
        "Flattened raster line-art loses editable vector paths and pressure profiles, overlapping speech balloons demand tedious boolean cleanup, and dense screentones trigger moire fringes on mobile viewports.",
      ),
      t(
        "Wave 5 differentiable-stroke-inverse.ts 는 유클리드 거리 변환과 중심축 골격화로 3차 베지어·필압을 역추정하고, Wave 6 sdf-balloon-cut-sculptor.ts 와 fft-screentone-moire-detector.ts 는 다항식 smin 말풍선 등치선(2ms 이내)과 2D Radix-2 FFT 기반 15°/45°/75° 안전 망점 각도를 계산합니다.",
        "Wave 5 differentiable-stroke-inverse.ts recovers cubic Beziers and vertex pressure via Euclidean distance transforms, while Wave 6 sculpts smin balloon contours (<2 ms) and solves moire-safe 15°/45°/75° halftone angles via 2D Radix-2 FFT.",
      ),
      t(
        "Wave 7 kalman-stylus-semantic-archiver.ts 의 6상태 등가속도 칼만-에르미트 예측기(4~8ms)와 무손실 원고 아카이버, Wave 8 arap-normal-flash-safety.ts · glyph-subset-dp-spacetime.ts 의 ARAP 포즈 변형 및 회차 대사 한글 서브셋(TSGF)까지 초기 번들 0B 지연 로드로 검증했습니다(Current: 단위 검증 완료, Target: 벡터 편집·내보내기 도구 직결).",
        "Wave 7 adds 4–8 ms 6-state Kalman-Hermite stylus prediction and lossless layer archiving, paired with Wave 8 ARAP mesh deformation and TSGF Hangul dialogue font subsetting at 0 B eager bundle cost (Current: unit-verified; Target: studio vector & export tool wiring).",
      ),
    ],
    keyPoints: [
      t("2D 유클리드 거리 변환 · 소프트 래스터 역전파 기반 병합 선화 벡터화", "2D Euclidean distance transform & soft-raster stroke inversion"),
      t("해석적 smin SDF 말풍선 불리언 조각 & 2D Radix-2 FFT 모아레 경보", "Analytic smin SDF balloon sculpting & 2D FFT moire detector"),
      t("6상태 등가속도 칼만-에르미트 펜 예측 & 시맨틱 무손실 레이어 아카이브", "6-state Kalman-Hermite stylus predictor & lossless layer archiver"),
      t("ARAP 강체 보존 포즈 모핑 및 대사 사용 음절 전용 TSGF 한글 서브셋", "ARAP pose morphing & episode-scoped TSGF Hangul glyph subsetter"),
    ],
    diagram: {
      id: "wave5-to-8-sdf-kalman-moire-arap-diagram",
      kind: "graph",
      title: t("Waves 5–8 드로잉·벡터·식자 커널 파이프라인", "Waves 5–8 drawing, vector & subsetting pipeline"),
      caption: t(
        "펜 입력과 스캔 래스터를 정밀 벡터·SDF 도형으로 복원하고 모바일 모아레와 폰트 용량까지 사전에 줄입니다.",
        "Recovers crisp vectors and SDF contours from pen or scan inputs while eliminating mobile moire and font bloat.",
      ),
      alt: t(
        "왼쪽의 펜 입력·병합 선화가 칼만 예측 및 미분 역복원 노드를 거쳐 가운데 SDF 말풍선·ARAP 변형 단계로 모이고, 오른쪽의 FFT 모아레 검수와 TSGF 한글 서브셋 아카이브로 출력됩니다.",
        "Stylus input and merged line-art feed Kalman prediction and stroke inversion into SDF balloon & ARAP sculpting, finishing at FFT moire QA and TSGF Hangul subset archiving.",
      ),
      nodes: [
        { id: "in", label: t("펜 · 병합 선화", "Pen & scan ink"), sub: t("원시 좌표 · 래스터 타일", "Raw samples & tiles"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "kal", label: t("칼만 · 역복원", "Kalman & inverse"), sub: t("4~8ms 예측 · 베지어 추출", "4–8 ms pred & Bezier"), tone: "good", at: [1, 0] },
        { id: "sdf", label: t("smin SDF · ARAP", "smin SDF & ARAP"), sub: t("말풍선 결합 · 포즈 변형", "Balloon union & morph"), tone: "good", at: [1, 2] },
        { id: "fft", label: t("2D FFT 모아레", "2D FFT moire"), sub: t("375/390px 안전 망점각", "Safe LPI & angle QA"), tone: "warn", at: [2, 0] },
        { id: "tsgf", label: t("무손실 · TSGF", "Archiver & TSGF"), sub: t("레이어 압축 · 한글 서브셋", "Lossless pack & glyphs"), tone: "local", at: [2, 2] },
      ],
      edges: [
        { from: "in", to: "kal", label: t("선화·필압", "Ink & press") },
        { from: "in", to: "sdf", label: t("도형·메쉬", "Shapes") },
        { from: "kal", to: "fft", label: t("스크린톤", "Halftone") },
        { from: "sdf", to: "tsgf", label: t("대사·원고", "Script") },
      ],
    },
    usage: [
      {
        feature: t("미분 스트로크 역복원 · SDF 말풍선 · 2D FFT 모아레 검수", "Differentiable stroke inverse, SDF balloons & FFT moire QA"),
        role: t(
          "병합 선화에서 중심축·필압 곡선을 복원하고 smin 말풍선 등치선과 모바일 뷰포트 안전 스크린톤 각도를 산출합니다.",
          "Recovers medial-axis Bezier strokes, Marching Squares smin balloons and moire-safe mobile halftone angles.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave5-frontier/differentiable-stroke-inverse.ts",
          "apps/web/src/domains/creator/wasm64-wave6-moonshot/sdf-balloon-cut-sculptor.ts",
          "apps/web/src/domains/creator/wasm64-wave6-moonshot/fft-screentone-moire-detector.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("6상태 칼만-에르미트 펜 예측 · ARAP 변형 · TSGF 한글 서브셋", "6-state Kalman stylus, ARAP morphing & TSGF Hangul subsetter"),
        role: t(
          "주사율 맞춤형 펜촉 선행 예측, 무손실 레이어 아카이브, ARAP 메쉬 변형 및 사용 음절 한정 폰트 서브셋을 수행합니다.",
          "Runs 6-state Kalman stylus lookahead, lossless semantic archiving, ARAP morphing and TSGF Hangul subsetting.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave7-sovereign/kalman-stylus-semantic-archiver.ts",
          "apps/web/src/domains/creator/wasm64-wave8-singularity/arap-normal-flash-safety.ts",
          "apps/web/src/domains/creator/wasm64-wave8-singularity/glyph-subset-dp-spacetime.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("다항식 C¹ 연속 스무스 최솟값(smin) 말풍선 SDF 결합", "Polynomial C1 smooth-min (smin) SDF balloon union"),
        language: "ts",
        ...sampleSource([
          ["export function polynomialSmoothMin(dA: number, dB: number, radiusK: number): number {"],
          ["  if (radiusK <= 1e-6) return Math.min(dA, dB);"],
          ["  const h = Math.max(radiusK - Math.abs(dA - dB), 0) / radiusK;"],
          ["  return Math.min(dA, dB) - h * h * radiusK * 0.25;", "두 말풍선 경계를 매끄러운 필렛으로 융합", "fuses overlapping balloons with C1 fillet"],
          ["}"],
        ]),
        explain: t(
          "sdf-balloon-cut-sculptor.ts 는 타원·둥근사각형·베지어 꼬리 거리장을 polynomialSmoothMin 으로 합친 뒤 Marching Squares 로 내·외곽 테두리를 추출합니다.",
          "sdf-balloon-cut-sculptor.ts blends ellipse, rounded-rect and Bezier-tail SDFs via polynomialSmoothMin before Marching Squares contour extraction.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave6-moonshot/sdf-balloon-cut-sculptor.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Inigo Quilez · Smooth Minimum (smin) Distance Functions",
        url: "https://iquilezles.org/articles/smin/",
        kind: "article",
        note: t("다항식 C1 연속 스무스 불리언 거리장 유도식", "Derivation of polynomial C1 smooth boolean SDF operators"),
      },
      {
        title: "W3C · Pointer Events Level 3 Predicted Events",
        url: "https://www.w3.org/TR/pointerevents3/",
        kind: "spec",
        note: t("고주사율 스타일러스 입력 좌표·압력 스트림 표준", "High-rate stylus coordinate and pressure input specification"),
      },
    ],
    chapterIds: ["brush-engine", "wasm-fixed-simd"],
    talk: {
      pitch: t(
        "스캔 선화 역벡터화부터 2ms smin 말풍선 조형, 모바일 스크린톤 모아레 사전 차단, 대사 전용 한글 서브셋까지 웹툰 원고 공정을 수학 커널로 자동화했습니다.",
        "Automates manga line-art inversion, <2 ms smin speech balloons, mobile FFT moire prevention and Hangul font subsetting in pure local kernels.",
      ),
      analogy: t(
        "굳어 버린 잉크 선에서 펜의 움직임을 되찾는 복원가, 물방울처럼 자연스럽게 합쳐지는 말풍선 자, 인쇄 전 줄무늬 간섭을 먼저 비춰 보는 확대경을 한 책상에 모은 셈입니다.",
        "Like pairing an ink-stroke restorer, self-merging speech-balloon stencils and a pre-press moire loupe on one desk.",
      ),
      questions: [
        {
          question: t("칼만 예측 좌표가 실제 펜 끝 위치와 어긋나면 선이 튀지 않나요?", "Does Kalman lookahead overshoot sharp pen turns?"),
          answer: t(
            "임시 예측 세그먼트는 프리뷰 레이어에만 그리고, 실제 포인터 이벤트가 도착하면 확정 에르미트 곡선으로 즉시 치환해 영구 오차를 남기지 않습니다.",
            "Predicted segments render only on the transient preview layer and are replaced by exact Hermite spans once real samples arrive.",
          ),
        },
      ],
    },
    technologies: ["TypeScript", "WASM64", "SDF", "2D FFT", "Kalman Filter"],
    facts: [
      { value: "15°/45°/75°", label: t("전통 안전 망점 회전각 후보", "Safe halftone screen angles"), source: "apps/web/src/domains/creator/wasm64-wave6-moonshot/fft-screentone-moire-detector.ts" },
      { value: "4–8 ms", label: t("6상태 칼만 스타일러스 선행 예측 구간", "6-state Kalman stylus lookahead window"), source: "apps/web/src/domains/creator/wasm64-wave7-sovereign/kalman-stylus-semantic-archiver.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave11-to-15-spectral-dcel-blue-noise",
    category: "drawing",
    name: "Waves 11–15 Kubelka-Munk · P3→CMYK · Blue-Noise · DCEL",
    title: t(
      "Waves 11–15 8밴드 분광 혼색 · P3→CMYK 색역 · 블루노이즈 톤 · DCEL 채색",
      "Waves 11–15 8-band Kubelka-Munk, P3→CMYK gamut, blue-noise tone & DCEL fill",
    ),
    status: "experimental",
    tagline: t(
      "Kubelka-Munk 분광 혼색, TAC≤300% 색역 매핑, 무로제트 블루노이즈·갈필, DCEL 0-갭 채색과 무손실 코덱을 결합했습니다.",
      "Combines 8-band Kubelka-Munk mixing, TAC<=300% CMYK mapping, blue-noise halftones, DCEL 0-gap fill and Haar+LOCO-I.",
    ),
    background: [
      t(
        "선형 RGB 평균 혼색은 노란색과 파란색을 섞을 때 회색빛으로 탁해지고, 광색역 Display-P3 모니터에서 칠한 원고를 단행본 CMYK로 곧바로 변환하면 총 잉크량(TAC) 초과 번짐이나 계조 뭉개짐이 발생합니다.",
        "Naive RGB averaging turns yellow-plus-blue muddy gray, while direct Display-P3 to press CMYK conversion causes ink-limit (TAC) smudging and clipped highlights.",
      ),
      t(
        "Wave 11 saccade-kubelka-homography.ts 는 400~700nm 8밴드 반사율의 흡수·산란 계수(K/S)로 선명한 감산 혼색을 계산하고, Wave 12 semantic-diff-gamut-mapper.ts 는 Display-P3→sRGB→ISO-Coated CMYK(TAC ≤ 300%) 지각적 소프트-니 색역 압축을 수행합니다.",
        "Wave 11 mixes 8-band (400–700 nm) Kubelka-Munk K/S spectra for vibrant subtractive greens, while Wave 12 maps Display-P3 to ISO-Coated CMYK within TAC <= 300%.",
      ),
      t(
        "Wave 14 의 Void-and-Cluster 블루노이즈 스크린톤·탄성 강모 갈필(sss-skin-bristle-cinema-halation.ts)과 Wave 15 의 반간선 평면 분할(DCEL) 빈틈 0건 채우기·가역 정수 Haar+LOCO-I 점진 무손실 컷 코덱까지 단위 검증을 마쳤습니다(Current: 단위 검증 완료·0B 번들, Target: 브러시·페인트통·출판 파이프라인 연동).",
        "Wave 14 adds Void-and-Cluster rosette-free screentones and split-bristle dry-brush simulation, paired with Wave 15 half-edge DCEL zero-gap planar fill and lossless integer Haar + LOCO-I progressive cut coding (Current: unit-verified, 0 B eager; Target: paint & print wiring).",
      ),
    ],
    keyPoints: [
      t("400~700nm 8밴드 Kubelka-Munk 흡수·산란(K/S) 물리 감산 혼색", "8-band 400–700 nm Kubelka-Munk K/S physical pigment mixing"),
      t("Display-P3 → ISO-Coated CMYK(TAC ≤ 300%) 지각적 소프트-니 매핑", "Display-P3 to ISO-Coated CMYK (TAC <= 300%) soft-knee gamut map"),
      t("Void-and-Cluster 블루노이즈 무로제트 스크린톤 & 탄성 강모 갈필", "Void-and-Cluster blue-noise screentone & split-bristle dry-brush"),
      t("반간선(DCEL) 0-갭 평면 분할 채색 & 가역 Haar+LOCO-I 무손실 코덱", "Half-edge DCEL 0-gap planar fill & reversible Haar+LOCO-I codec"),
    ],
    diagram: {
      id: "wave11-to-15-spectral-dcel-blue-noise-diagram",
      kind: "layers",
      title: t("분광 색채 · 위상 채색 · 블루노이즈 · 무손실 압축 계층", "Spectral color, DCEL topology, blue-noise & lossless codec stack"),
      caption: t(
        "선화 위상 분할(DCEL)부터 분광 물감·갈필 표현, CMYK 인쇄 색역 제한과 무손실 저장까지 층별로 책임을 나눕니다.",
        "Separates planar line topology, spectral media, press-safe CMYK gamut mapping and progressive lossless storage.",
      ),
      alt: t(
        "맨 위 반간선 DCEL 평면 분할 채색 계층 아래로 Kubelka-Munk 8밴드 분광 혼색과 갈필 시뮬레이터, Void-and-Cluster 블루노이즈 스크린톤과 P3→CMYK 색역 매퍼, 맨 아래 가역 정수 Haar+LOCO-I 무손실 코덱이 차례로 쌓여 있습니다.",
        "Four stacked layers: Half-edge DCEL zero-gap planar fill on top, 8-band Kubelka-Munk & split-bristle media, Void-and-Cluster blue-noise & P3-to-CMYK TAC<=300% mapper, and lossless Haar+LOCO-I progressive cut codec at the base.",
      ),
      layers: [
        { id: "dcel", label: t("반간선(DCEL) 평면 위상 채색", "Half-edge DCEL planar fill"), sub: t("교차 선화 면 추적 · 라플라스 확산 곡선", "0-gap bounded face fill & diffusion curves"), tone: "local", chips: ["DCEL", "Wave 15"] },
        { id: "km", label: t("8밴드 Kubelka-Munk · 탄성 갈필", "8-band Kubelka-Munk & dry-brush"), sub: t("400~700nm K/S 감산 혼색 · 먹물 고임", "Subtractive pigment spectra & ink pooling"), tone: "good", chips: ["8-Band", "Wave 11·14"] },
        { id: "cmyk", label: t("블루노이즈 스크린톤 · P3→CMYK 매퍼", "Blue-noise halftone & P3→CMYK"), sub: t("무로제트 FM/AM 망점 · TAC ≤ 300% 클램프", "Void-and-Cluster & TAC <= 300% knee"), tone: "warn", chips: ["CMYK", "Wave 12·14"] },
        { id: "haar", label: t("가역 정수 Haar + LOCO-I 컷 코덱", "Reversible Haar + LOCO-I cut codec"), sub: t("저해상도 썸네일 선행 복호 · 비트 무손실 복원", "Progressive preview & bit-exact decode"), tone: "local", chips: ["Lossless", "Wave 15"] },
      ],
    },
    usage: [
      {
        feature: t("8밴드 분광 감산 혼색기 & Display-P3→CMYK 색역 매퍼", "8-band Kubelka-Munk mixer & Display-P3→CMYK gamut mapper"),
        role: t(
          "분광 반사율 기반 물감 배합과 인쇄 총 잉크량(TAC ≤ 300%) 준수 지각 색역 변환을 담당합니다.",
          "Computes 8-band Kubelka-Munk pigment mixtures and soft-knee Display-P3 to CMYK (TAC <= 300%) gamut mapping.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave11-apex/saccade-kubelka-homography.ts",
          "apps/web/src/domains/creator/wasm64-wave12-crown/semantic-diff-gamut-mapper.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("블루노이즈 스크린톤 · 갈필 브러시 · DCEL 평면 채색 · Haar+LOCO-I 코덱", "Blue-noise tone, split-bristle, DCEL planar fill & Haar+LOCO-I"),
        role: t(
          "로제트 간섭 없는 블루노이즈 망점, 강모 갈라짐·먹물 고임, DCEL 평면 면 채색 및 점진적 무손실 압축을 수행합니다.",
          "Synthesizes blue-noise halftones, split-bristle strokes, DCEL bounded faces and reversible Haar+LOCO-I packets.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave14-masterpiece/bluenoise-screentone-temporal-upscaler.ts",
          "apps/web/src/domains/creator/wasm64-wave14-masterpiece/sss-skin-bristle-cinema-halation.ts",
          "apps/web/src/domains/creator/wasm64-wave15-structural/planar-map-diffusion-curves.ts",
          "apps/web/src/domains/creator/wasm64-wave15-structural/kajiya-hair-aerial-progressive-codec.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("Kubelka-Munk 반사율(R) ↔ 흡수·산란비(K/S) 양방향 변환", "Kubelka-Munk reflectance (R) ↔ K/S forward & inverse"),
        language: "ts",
        ...sampleSource([
          ["export function reflectanceToKs(r: number): number {"],
          ["  const clamped = Math.min(0.9995, Math.max(0.0005, r));"],
          ["  return ((1 - clamped) * (1 - clamped)) / (2 * clamped);"],
          ["}"],
          ["export function ksToReflectance(ks: number): number {"],
          ["  const safe = Math.max(0, ks);"],
          ["  return 1 + safe - Math.sqrt(safe * safe + 2 * safe);", "가산 평균된 K/S에서 물리 반사율 복원", "recover spectral reflectance from weighted K/S"],
          ["}"],
        ]),
        explain: t(
          "saccade-kubelka-homography.ts 는 8개 파장 대역마다 K/S 를 농도 가중 합산한 뒤 다시 반사율과 선형 sRGB 로 적분해 채도 손실을 막습니다.",
          "saccade-kubelka-homography.ts blends per-wavelength K/S ratios by pigment concentration before integrating back to linear sRGB.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave11-apex/saccade-kubelka-homography.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "ICC · ISO 12647-2 Offset Lithographic Process & TAC",
        url: "https://www.color.org/chardata/FOGRA39.xalter",
        kind: "spec",
        note: t("인쇄용 CMYK 프로파일 및 총 잉크량(TAC) 기준 자료", "Reference characterization data for coated offset CMYK printing"),
      },
      {
        title: "ITU-T T.87 · Lossless and Near-Lossless Baseline (JPEG-LS / LOCO-I)",
        url: "https://www.itu.int/rec/T-REC-T.87/en",
        kind: "spec",
        note: t("MED(Median Edge Detector) 비선형 무손실 예측 부호화 표준", "Median Edge Detector (MED) lossless image prediction standard"),
      },
    ],
    chapterIds: ["brush-engine", "brush-render-authority"],
    talk: {
      pitch: t(
        "물감은 분광 반사율로 섞고, 선화 채색은 반간선 기하학으로 틈 없이 메우며, 출고 시점에는 P3 광색역을 TAC 300% 이내 안전 CMYK로 눌러 줍니다.",
        "Mixes pigments spectrally, fills vector regions topologically via DCEL, and maps wide-gamut P3 safely into TAC<=300% CMYK.",
      ),
      analogy: t(
        "빛이 아니라 실제 물감 가루의 반사를 계산하는 팔레트와, 펜선 교차점을 지도 구획처럼 인식해 색이 새지 않는 채색 도구를 합친 구성입니다.",
        "Like combining a real pigment palette with a topological map filler that never leaks through crisp line intersections.",
      ),
      questions: [
        {
          question: t("래스터 채우기와 달리 반간선(DCEL) 평면 채색은 어떤 장점이 있나요?", "Why use half-edge DCEL fill instead of pixel flood-fill?"),
          answer: t(
            "안티에일리어싱 경계에서 생기는 1px 흰 테두리(Halo) 없이 닫힌 면의 정확한 벡터 위상을 구하므로 해상도를 바꿔도 채색 경계가 깨지지 않습니다.",
            "DCEL resolves exact bounded vector faces without anti-aliasing halo gaps, remaining sharp at any export DPI.",
          ),
        },
      ],
    },
    technologies: ["Kubelka-Munk", "Display-P3", "CMYK", "DCEL", "Haar Wavelet"],
    facts: [
      { value: "8 bands", label: t("400~700nm 분광 혼색 파장 샘플 수", "Spectral wavelengths (400–700 nm)"), source: "apps/web/src/domains/creator/wasm64-wave11-apex/saccade-kubelka-homography.ts" },
      { value: "TAC ≤ 300%", label: t("단행본 인쇄 총 잉크량 상한", "Coated print total ink coverage cap"), source: "apps/web/src/domains/creator/wasm64-wave12-crown/semantic-diff-gamut-mapper.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave16-to-19-gpen-print-cropmarks-lut",
    category: "drawing",
    name: "Waves 16–19 G-Pen · Spine Creep · .tvani · Crop-Marks & 17³ LUT",
    title: t(
      "Waves 16–19 G펜 잉크트랩 · 책등 크리프 · .tvani · 톰보 원고지 & 17³ LUT",
      "Waves 16–19 G-pen ink-trap, spine creep, .tvani, crop-marks & 17³ LUT",
    ),
    status: "experimental",
    tagline: t(
      "G펜 먹물 맺힘·CoW 스냅샷, 책등 크리프 검수, 1px 티끌 현미경·.tvani 코덱, B4/A4 톰보와 17³ 사면체 LUT를 제공합니다.",
      "Delivers G-pen ink-traps, CoW snapshots, spine/creep preflight, 1 px dust microscope, .tvani codec, B4/A4 crop-marks & 17³ LUT.",
    ),
    background: [
      t(
        "출판 만화와 고밀도 웹툰 마감 단계에서는 예각 교차점의 자연스러운 먹물 맺힘, 제본 방식(무선·중철)에 따른 책등 두께와 속지 밀림(Creep), 눈에 잘 띄지 않는 1~3px 지우개 티끌, 분위기 보정 시 계조가 갈라지는 삼선형 LUT 밴딩까지 세밀한 마감 품질이 요구됩니다.",
        "Finishing serial and print comics demands crisp G-pen acute ink pooling, binding-aware spine width and page creep compensation, removal of invisible 1–3 px eraser dust, and Mach-band-free color grading.",
      ),
      t(
        "Wave 16 은 서예·G펜 예각 먹물 맺힘과 무복사(CoW) 256×256 타일 스냅샷 트리를, Wave 17 은 한국 인쇄 용지 규격별 책등 두께·크리프 프리플라이트와 타 인물 얼굴 AABB를 피하는 탄성 말풍선 꼬리 솔버를 구현합니다.",
        "Wave 16 implements G-pen acute ink-trap sculpting and Copy-on-Write 256×256 tile snapshot trees, while Wave 17 computes Korean paper-stock spine/creep preflight and face-avoiding elastic balloon tails.",
      ),
      t(
        "Wave 18 의 출고 전 1~3px 티끌·알파 후광 현미경 클리너와 이진 벡터 애니메이션(.tvani) 코덱, Wave 19 의 상업지 B4·동인지 A4 모서리 톰보(재단선)·아트나이프 톤 깎기·17³ 사면체 보간(.cube) LUT 베이커까지 검증을 완료했습니다(Current: 단위 검증 완료·0B 번들, Target: 원고 마감·인쇄 프리플라이트 패널 연결).",
        "Wave 18 adds a 1–3 px stray-pixel/alpha-halo microscope cleaner and compact .tvani binary vector animation codec, joined by Wave 19 B4/A4 crop-mark templates, tone-knife scraping and 17³ tetrahedral .cube LUT grading (Current: unit-verified; Target: preflight & finishing drawer).",
      ),
    ],
    keyPoints: [
      t("G펜 예각 먹물 맺힘 · 끝빠짐 조형기 & CoW 256×256 타일 스냅샷 트리", "G-pen acute ink-trap taper & CoW 256×256 tile snapshot tree"),
      t("한국 인쇄 용지별 책등 두께 · 중철 크리프 보정 & 탄성 말풍선 꼬리", "Korean paper spine/creep preflight & face-avoiding balloon tail"),
      t("1~3px 지우개 티끌 · 알파 후광 현미경 클리너 & .tvani 이진 벡터 코덱", "1–3 px stray-pixel microscope cleaner & .tvani binary vector codec"),
      t("상업지 B4 · 동인지 A4 재단선(톰보) 템플릿 & 17³ 사면체 .cube LUT", "B4/A4 crop-mark manuscript templates & 17³ tetrahedral .cube LUT"),
    ],
    diagram: {
      id: "wave16-to-19-gpen-print-cropmarks-lut-diagram",
      kind: "sequence",
      title: t("원고 마감 현미경 검수 · 사면체 색보정 · 단행본 조판 흐름", "Manuscript finishing microscope, tetrahedral LUT & print imposition"),
      caption: t(
        "선화 조형과 CoW 분기 위에서 티끌 제거·사면체 색보정을 거친 뒤 B4/A4 톰보와 책등 크리프 규격으로 마감합니다.",
        "Runs G-pen sculpting and CoW snapshots through dust cleaning and tetrahedral LUT grading into B4/A4 print preflight.",
      ),
      alt: t(
        "펜·CoW 스냅샷 엔진이 현미경 클리너로 레이어를 넘기면 1~3px 티끌과 알파 후광을 제거하고, 17³ 사면체 LUT 색보정기를 거쳐 단행본 조판기가 B4/A4 톰보와 책등 크리프 수치를 확정합니다.",
        "Pen & CoW snapshot engine passes layers to the microscope cleaner to strip 1–3 px dust, grades mood via 17³ tetrahedral LUT, and finalizes B4/A4 crop-marks and spine creep.",
      ),
      actors: [
        { id: "cow", label: t("G펜 · CoW 트리", "G-Pen & CoW"), sub: t("256² 타일 분기", "256² tile snapshots"), tone: "local" },
        { id: "mic", label: t("현미경 클리너", "Microscope QA"), sub: t("1~3px 티끌 제거", "1–3 px dust & halo"), tone: "good" },
        { id: "lut", label: t("17³ 사면체 LUT", "17³ Tetra LUT"), sub: t(".cube 무밴딩 보정", "Band-free .cube"), tone: "good" },
        { id: "prt", label: t("톰보 · 책등 조판", "Crop & spine"), sub: t("B4/A4 · 크리프", "B4/A4 & creep mm"), tone: "warn" },
      ],
      messages: [
        { from: "cow", to: "mic", label: t("선화·밑색 레이어 전달 (무복사 분기)", "Pass forked line & flat layers") },
        { from: "mic", to: "lut", label: t("티끌·알파 후광 정제 완료 버퍼", "Cleaned halo-free raster buffer") },
        { from: "lut", to: "prt", label: t("사면체 보간 색보정 · .tvani 패키징", "Tetrahedral grade & .tvani clip") },
        { from: "prt", to: "cow", label: t("재단선·책등 두께·크리프 리포트 반환", "Return crop-mark & spine report"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("G펜 잉크트랩 · CoW 타일 스냅샷 · 책등 크리프 · 탄성 말풍선 꼬리", "G-pen ink-trap, CoW tile snapshots, spine creep & elastic tail"),
        role: t(
          "예각 먹물 맺힘과 무복사 분기 히스토리, 용지 평량 기반 책등 두께·크리프 계산 및 얼굴 회피 말풍선 꼬리를 처리합니다.",
          "Handles calligraphic ink-traps, CoW tile snapshots, paper-stock spine/creep math and face-avoiding balloon tails.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave16-mastery/radiosity-inktrap-catchlight.ts",
          "apps/web/src/domains/creator/wasm64-wave16-mastery/emotion-rhythm-cow-snapshot.ts",
          "apps/web/src/domains/creator/wasm64-wave17-finalcraft/print-spine-elastic-tail-deepzoom.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("1px 현미경 클리너 · .tvani 벡터 코덱 · B4/A4 톰보 & 17³ 사면체 LUT", "1 px microscope cleaner, .tvani codec, B4/A4 crop-marks & 17³ LUT"),
        role: t(
          "미세 지우개 티끌 제거, 초소형 이진 벡터 애니메이션 직렬화, 만화 원고지 가이드 생성 및 사면체 3D LUT 보정을 수행합니다.",
          "Cleans stray pixels, encodes .tvani binary animations, lays out B4/A4 crop-marks and applies 17³ tetrahedral LUTs.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave18-cinema-polish/prosody-lettering-microscope-tvani.ts",
          "apps/web/src/domains/creator/wasm64-wave19-atelier-perfection/analog-manuscript-prism-interior.ts",
          "apps/web/src/domains/creator/wasm64-wave19-atelier-perfection/tetrahedral-lut-lore-linter.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("중철 제본 속지 접지 밀림(Signature Creep) 선형 보정량 계산", "Saddle-stitch signature sheet creep compensation"),
        language: "ts",
        ...sampleSource([
          ["export function computeSheetCreepMm(sheetIdxZeroBased: number, totalSheets: number, paperCaliperMm: number): number {"],
          ["  if (totalSheets <= 1 || paperCaliperMm <= 0) return 0;"],
          ["  const ratio = Math.min(1, Math.max(0, sheetIdxZeroBased / (totalSheets - 1)));"],
          ["  return Number(((Math.PI * 0.5) * paperCaliperMm * sheetIdxZeroBased * (0.5 + 0.5 * ratio)).toFixed(3));", "안쪽 장일수록 바깥 재단선에서 안쪽으로 당겨 배치", "inward shift grows toward innermost folded sheet"],
          ["}"],
        ]),
        explain: t(
          "print-spine-elastic-tail-deepzoom.ts 는 미색모조·스노우지 등 실제 인쇄 용지 두께(Caliper)에서 책등 폭과 속지별 크리프 이동량을 함께 계산합니다.",
          "print-spine-elastic-tail-deepzoom.ts derives both spine width and per-sheet creep offsets from Korean paper-stock caliper presets.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave17-finalcraft/print-spine-elastic-tail-deepzoom.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Adobe · Cube LUT Specification 1.0",
        url: "https://resolve.cafe/developers/luts/",
        kind: "docs",
        note: t("3D 색보정 .cube 테이블 격자 및 도메인 정의 형식", "Industry-standard 3D .cube LUT lattice format reference"),
      },
      {
        title: "IIIF · Image API 3.0 Tile Pyramid Specification",
        url: "https://iiif.io/api/image/3.0/",
        kind: "spec",
        note: t("고해상도 원고 다중 해상도 정적 타일 피라미드 규격", "Multi-resolution static image tile pyramid specification"),
      },
    ],
    chapterIds: ["brush-engine", "quality"],
    talk: {
      pitch: t(
        "아날로그 만화 원고지의 톰보·톤 깎기 감각부터 1px 지우개 티끌 현미경 청소, 사면체 LUT 무밴딩 색보정과 책등 두께 계산까지 마감 실수를 출고 전에 잡습니다.",
        "Catches finishing defects pre-export across B4/A4 crop-marks, 1 px dust cleaning, band-free 17³ tetrahedral LUTs and spine/creep math.",
      ),
      analogy: t(
        "인쇄소 넘기기 직전에 원고 구석의 지우개 가루를 털어 내고, 종이 두께에 맞춰 재단선을 잡아 주는 숙련된 편집부 마감 데스크와 같습니다.",
        "Like a seasoned editorial desk brushing off stray eraser crumbs and calibrating spine trim lines right before press delivery.",
      ),
      questions: [
        {
          question: t("일반 삼선형(Trilinear) 보간 대신 사면체(Tetrahedral) 3D LUT를 쓰는 이유는 무엇인가요?", "Why use tetrahedral 3D LUT interpolation over trilinear?"),
          answer: t(
            "단위 정육면체를 대각선 기준 6개 사면체로 쪼개 한 샘플당 8개 대신 4개 꼭짓점만 선형 결합하므로 어두운 하늘 그라데이션에서도 마하 밴딩 계단이 크게 줄어듭니다.",
            "Splitting each cube cell into 6 tetrahedra interpolates 4 vertices instead of 8, suppressing Mach banding across smooth sky gradients.",
          ),
        },
      ],
    },
    technologies: ["CoW Tree", "Print Preflight", "3D LUT", "Binary Codec", "TypeScript"],
    facts: [
      { value: "256×256 px", label: t("무복사(CoW) 영속 레이어 스냅샷 타일 규격", "Copy-on-Write snapshot tile size"), source: "apps/web/src/domains/creator/wasm64-wave16-mastery/emotion-rhythm-cow-snapshot.ts" },
      { value: "17³ (.cube)", label: t("사면체 보간 3D 분위기 색보정 격자", "Tetrahedral 3D mood LUT lattice"), source: "apps/web/src/domains/creator/wasm64-wave19-atelier-perfection/tetrahedral-lut-lore-linter.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave21-to-23-spot-foil-hdr-color-script",
    category: "drawing",
    name: "Waves 21–23 Wang-Tile · Spot Foil · PQ HDR Gain-Map · Color-Script",
    title: t(
      "Waves 21–23 왕 타일 · 별색 금/은박 분판 · PQ HDR 게인맵 & 60컷 컬러 스크립트",
      "Waves 21–23 Wang tiles, spot foil plates, PQ HDR gain-map & 60-cut color-script",
    ),
    status: "experimental",
    tagline: t(
      "비주기 왕 타일 원단, ±0.1mm 금·은박 분판, 203/1000nits HDR 게인맵, r·κ<0.85 리본 붓과 60컷 OKLCH 바코드를 묶었습니다.",
      "Pairs aperiodic Wang tiles, ±0.1 mm foil plates, 203/1000-nit HDR gain-maps, r·κ<0.85 ribbon brushes and 60-cut OKLCH color-scripts.",
    ),
    background: [
      t(
        "의상·배경 문양을 단순 격자로 반복하면 이음새 주기가 눈에 띄고, 레이스·체인 장식 브러시는 급격히 꺾이는 곡선 안쪽에서 도형이 스스로 겹치며(Self-Intersection), 60컷이 넘는 장편 회차는 후반부로 갈수록 조명 색온도가 미세하게 흔들리기 쉽습니다.",
        "Repeating tile patterns expose obvious grid seams, ornamental ribbon brushes self-intersect on tight inner bends, and 60-cut episodes easily drift in white balance across scenes.",
      ),
      t(
        "Wave 21 wang-tile-assistant-sheet-spot-foil.ts 는 비주기 4방향 왕 타일 합성기, 채색 어시스턴트 인계용 컬러키 시트, 단행본 한정판 금박·은박·홀로그램·부분 UV 별색 분판기(±0.1mm 트래핑·녹아웃)를 제공합니다.",
        "Wave 21 synthesizes seam-free aperiodic 4-edge Wang tiles, assistant color-key handoff sheets and ±0.1 mm trapped spot-foil/spot-UV press plates.",
      ),
      t(
        "Wave 22 hdr-pq-ribbon-brush-lookat.ts 는 확산 백색 203 nits 고정 위에서 마법·검기 이펙트만 1,000 nits 로 올리는 SMPTE ST.2084 PQ · ISO-21496-1 게인맵과 가우스-르장드르 호길이 곡률 안전(r·κ < 0.85) 리본 브러시를, Wave 23 episode-oklch-color-script.ts 는 60~80컷 회차 전체의 OKLCH 바코드·감정선 화이트밸런스 조화를 수행합니다(Current: 단위 검증 완료, Target: 브러시·출판·회차 검수 연동).",
        "Wave 22 anchors paper white at 203 nits while boosting VFX to 1,000 nits via ST.2084 PQ & ISO-21496-1 gain-maps alongside curvature-safe (r·κ < 0.85) Gauss-Legendre ribbon brushes, while Wave 23 harmonizes 60–80 cut OKLCH episode color-scripts (Current: unit-verified; Target: brush & episode QA wiring).",
      ),
    ],
    keyPoints: [
      t("비주기 4방향 왕 타일 원단 합성 & 어시스턴트 컬러키 인계 시트", "Aperiodic 4-edge Wang-tile fabrics & assistant color-key sheets"),
      t("±0.1mm 트래핑 · 녹아웃 단행본 금박·은박·부분 UV 별색 분판기", "±0.1 mm trapped gold/silver foil & spot-UV plate separator"),
      t("203nits 종이 백색 보존 + 1,000nits 이펙트 PQ · ISO-21496-1 게인맵", "203-nit paper-white + 1,000-nit VFX ST.2084 & ISO-21496-1 gain-map"),
      t("가우스-르장드르 곡률 안전(r·κ<0.85) 리본 붓 & 60컷 OKLCH 컬러 스크립트", "Curvature-safe (r·κ<0.85) ribbon brush & 60-cut OKLCH color-script"),
    ],
    diagram: {
      id: "wave21-to-23-spot-foil-hdr-color-script-diagram",
      kind: "graph",
      title: t("장식 작화 · 60컷 색채 조화 · HDR 및 한정판 별색 출고", "Ornamental brush, 60-cut color-script, HDR & spot-foil output"),
      caption: t(
        "장식 패턴과 리본 브러시로 그린 원고를 60컷 컬러 스크립트로 조율한 뒤 웹 HDR 게인맵과 단행본 별색 판으로 동시 분기합니다.",
        "Harmonizes Wang-tile and ribbon-brush artwork across 60 cuts before branching to web HDR gain-maps and print foil plates.",
      ),
      alt: t(
        "왕 타일·리본 브러시 작화 노드가 60컷 OKLCH 컬러 스크립트 조화기로 이어지고, 위로는 203/1000nits PQ HDR 게인맵 웹 출력으로, 아래로는 ±0.1mm 금·은박 별색 분판 인쇄 출력으로 나뉩니다.",
        "Wang-tile and curvature-safe ribbon strokes feed the 60-cut OKLCH color-script harmonizer, branching into 203/1000-nit PQ HDR gain-maps for web and ±0.1 mm spot-foil plates for print.",
      ),
      nodes: [
        { id: "art", label: t("왕 타일 · 리본 붓", "Wang & ribbon"), sub: t("무주기 패턴 · r·κ < 0.85", "Seam-free & r·κ < 0.85"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "bar", label: t("60컷 컬러 스크립트", "60-cut OKLCH"), sub: t("감정선 보존 · 색온도 보정", "Arc-aware WB harmony"), tone: "good", at: [1, 1] },
        { id: "hdr", label: t("PQ · HDR 게인맵", "PQ HDR gain-map"), sub: t("203nits 백색 · 1000nits 광원", "203-nit base, 1000-nit VFX"), tone: "good", at: [2, 0] },
        { id: "foil", label: t("별색 박 · UV 분판", "Spot foil & UV"), sub: t("±0.1mm 트래핑 · 녹아웃", "±0.1 mm trap & knockout"), tone: "warn", at: [2, 2] },
      ],
      edges: [
        { from: "art", to: "bar", label: t("회차 원고", "Episode") },
        { from: "bar", to: "hdr", label: t("웹·모바일", "Web HDR") },
        { from: "bar", to: "foil", label: t("한정판 인쇄", "Print foil") },
      ],
    },
    usage: [
      {
        feature: t("비주기 왕 타일 합성 · 어시스턴트 인계 시트 · 금/은박 별색 분판", "Wang-tile synthesizer, assistant handoff sheet & spot-foil plates"),
        role: t(
          "모서리 색 일치 비주기 원단 생성, 채색 인계용 OKLCH 스와치·광원 시트, ±0.1mm 트래핑 별색 판 분리를 수행합니다.",
          "Generates edge-matched Wang tiles, assistant color-key sheets and ±0.1 mm trapped spot-foil/UV separation plates.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave21-horizon/wang-tile-assistant-sheet-spot-foil.ts",
          "apps/web/src/domains/creator/wasm64-wave21-horizon/wasm64-wave21-horizon.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("PQ/ISO-21496-1 HDR 게인맵 · 곡률 안전 리본 브러시 · 60컷 컬러 스크립트", "PQ HDR gain-map, curvature-safe ribbon brush & 60-cut color-script"),
        role: t(
          "종이 눈부심 없는 선택적 HDR 발광 게인맵, 자기 교차 없는 리본·체인 스플라인 변형 및 60컷 색채 바코드 조화를 담당합니다.",
          "Computes paper-safe HDR gain-maps, foldover-free ribbon spline deformation and 60-cut OKLCH episode color-scripts.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts",
          "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/geodesic-garment-color-script.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("오목 곡률 반경 자기 교차 방지(r·κ < 0.85) 리본 법선 오프셋 클램프", "Foldover-free curvature clamp (r·κ < 0.85) for ribbon brushes"),
        language: "ts",
        ...sampleSource([
          ["export function clampRibbonNormalOffset(signedOffset: number, signedCurvatureKappa: number): number {"],
          ["  const product = signedOffset * signedCurvatureKappa;"],
          ["  if (product <= 0.85) return signedOffset;"],
          ["  return 0.85 / signedCurvatureKappa;", "오목 안쪽 법선 반전(접힘) 직전에 반경을 안전 감쇠", "prevent inner-bend normal inversion before r*kappa >= 1"],
          ["}"],
        ]),
        explain: t(
          "스플라인 법선 이동량과 곡률의 곱(r·κ)이 1을 넘으면 안쪽 정점이 뒤집혀 레이스 무늬가 찢어지므로, 0.85 안전 한계 안에서 부드럽게 압축합니다.",
          "Clamping signed offset times curvature below 0.85 prevents inner-curve Jacobian inversion so lace and chain motifs never fold over.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "ITU-R BT.2408 · Reference White (203 cd/m²) in HDR Television",
        url: "https://www.itu.int/pub/R-REP-BT.2408",
        kind: "spec",
        note: t("HDR 화면에서 SDR 확산 백색 203 nits 기준 휘도 권고안", "Operational guidance anchoring HDR diffuse paper white at 203 nits"),
      },
      {
        title: "Bjorn Ottosson · A Perceptual Color Space for Image Processing (Oklab/OKLCH)",
        url: "https://bottosson.github.io/posts/oklab/",
        kind: "docs",
        note: t("회차 컬러 스크립트 색온도·채도 조화에 쓰인 지각 균일 색공간", "Perceptually uniform color space backing episode color-script harmony"),
      },
    ],
    chapterIds: ["brush-engine", "licenses"],
    talk: {
      pitch: t(
        "웹에서는 말풍선 종이 흰색의 눈부심 없이 검기·마법만 1,000 nits HDR로 빛나게 하고, 단행본에서는 ±0.1mm 금·은박 별색 판까지 한 원고에서 뽑아냅니다.",
        "Keeps speech balloons comfortable at 203 nits while boosting VFX to 1,000-nit HDR on screens and exporting ±0.1 mm foil plates for print.",
      ),
      analogy: t(
        "만화 원고지에는 눈이 편한 실내 조명을 비추면서 마법 광선에만 스포트라이트를 켜고, 단행본 표지에는 금박 스탬프 틀을 어긋남 없이 맞춰 주는 공정입니다.",
        "Like lighting comic paper gently while spotlighting magic effects on HDR screens and aligning precision gold-foil dies for print.",
      ),
      questions: [
        {
          question: t("회상 장면처럼 작가가 일부러 푸르스름하게 칠한 컷도 컬러 스크립트가 지워 버리나요?", "Does the 60-cut color-script flatten intentional flashback tints?"),
          answer: t(
            "NarrativeBeatTag(flashback, dream, climax 등)가 지정된 구간은 의도된 색채 전환으로 보존하고, 같은 시간대·장소 안에서의 비의도적 화이트밸런스 이탈만 완만하게 보정합니다.",
            "Cuts tagged as flashback, dream or climax preserve their intentional palette shift; only unintended drift within the same scene is gently harmonized.",
          ),
        },
      ],
    },
    technologies: ["Wang Tiles", "SMPTE ST.2084 PQ", "ISO 21496-1", "OKLCH", "Gauss-Legendre"],
    facts: [
      { value: "203 / 1,000 nits", label: t("확산 종이 백색 고정 및 선택적 HDR 피크 휘도", "Diffuse white anchor & HDR emissive peak"), source: "apps/web/src/domains/creator/wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts" },
      { value: "±0.1 mm", label: t("특수 인쇄 금·은박 별색 트래핑 정밀도", "Spot-foil & spot-UV trapping tolerance"), source: "apps/web/src/domains/creator/wasm64-wave21-horizon/wang-tile-assistant-sheet-spot-foil.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
