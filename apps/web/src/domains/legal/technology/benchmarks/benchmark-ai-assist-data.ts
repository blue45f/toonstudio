import {
  BENCHMARK_SNAPSHOT_DATE,
  type BenchmarkCell,
  type BenchmarkDataset,
  type BenchmarkSupportLevel,
  type BenchmarkToolProfile,
} from "./benchmark-types";

const t = (ko: string, en: string) => ({ ko, en });

const c = (
  level: BenchmarkSupportLevel,
  ko: string,
  en: string,
): BenchmarkCell => ({ level, summary: { ko, en } });

const AI_ASSIST_TOOLS: readonly BenchmarkToolProfile[] = [
  {
    id: "toonstudio",
    name: "ToonStudio",
    shortName: "ToonStudio",
    role: t("₩0 브라우저 로컬 결정적 보조 + Rights BOM 저작권 보호", "KRW 0 local deterministic assist + fail-closed Rights BOM"),
    pricing: t("로컬 결정적 보조 ₩0 · 외부 AI는 선택 BYOK", "KRW 0 local deterministic assist; optional BYOK for cloud AI"),
    platform: t("WebGPU / Worker 브라우저 (로컬 우선)", "WebGPU / Worker browser (local-first)"),
    benchmarkTakeaway: t(
      "Watershed 밑색·PatchMatch·HLR 선화·광원 동기화·시선 검사·스마트 태깅·Rights BOM을 AI 학습 배제·₩0 로컬로 내재화",
      "Internalized Watershed flatting, PatchMatch, HLR, light sync, eye-flow, smart autotag and Rights BOM at KRW 0 without AI training",
    ),
    honestStrength: t(
      "생성형 환각·저작권 분쟁·월간 AI 크레딧 과금 없이 웹툰 반복 공정 대부분을 결정적 알고리즘으로 자동화",
      "Automates repetitive webtoon chores deterministically with zero generative hallucination, zero AI credit bills and strict rights gating",
    ),
  },
  {
    id: "tooning",
    name: "Tooning Plus",
    shortName: "Tooning Plus",
    role: t("국내 웹툰·교육 특화 생성형 AI + 2D/3D 리소스 플랫폼", "Korean webtoon generative AI & 2D/3D resource platform"),
    pricing: t("무료 제한 + 유료 구독 / 크레딧", "Freemium + subscription / AI credits"),
    platform: t("웹 브라우저", "Web browser"),
    benchmarkTakeaway: t(
      "웹툰 컷 조립과 빠른 배경/소품 준비 동선을 벤치마킹하되, 생성형 의존 대신 결정적 3D·선화·채색 보조와 권리 추적으로 차별화",
      "Benchmarked fast panel assembly while prioritizing deterministic 3D/line/color tools and transparent rights receipts over opaque generation",
    ),
    honestStrength: t(
      "프롬프트 기반 AI 배경·캐릭터 생성과 자체 템플릿으로 비전공자도 즉시 만화를 완성하는 낮은 진입 장벽",
      "Low barrier to entry with turnkey AI image generation and ready-made Korean comic templates",
    ),
  },
  {
    id: "photoshop",
    name: "Adobe Photoshop (Firefly)",
    shortName: "Photoshop Firefly",
    role: t("상업 보상 약관 기반 클라우드 생성형 채우기·확장 표준", "Cloud Generative Fill/Expand standard backed by Firefly"),
    pricing: t("Creative Cloud 구독 + 생성형 크레딧", "Creative Cloud subscription + generative credits"),
    platform: t("Windows · macOS · iPad · Web", "Windows · macOS · iPad · Web"),
    benchmarkTakeaway: t(
      "Content-Aware Fill의 기반인 PatchMatch를 클린룸 ₩0 로컬 엔진으로 내재화하고 Content Credentials 개념을 Rights BOM으로 확장",
      "Internalized PatchMatch locally at KRW 0 and extended provenance receipts via fail-closed Rights BOM",
    ),
    honestStrength: t(
      "상업용 IP 보상 정책을 내세운 Adobe Firefly Generative Fill/Expand의 압도적인 배경 확장·합성 품질",
      "Leading Generative Fill/Expand visual quality backed by Adobe's commercial Firefly training framework",
    ),
  },
  {
    id: "krita-ai",
    name: "Krita AI Diffusion",
    shortName: "Krita AI",
    role: t("Krita 오픈소스 + 로컬/클라우드 Diffusion 플러그인", "Open-source Krita + local/cloud Diffusion plugin"),
    pricing: t("무료 오픈소스 (로컬 GPU 또는 유료 클라우드)", "Free open-source (local GPU or paid cloud)"),
    platform: t("Windows · macOS · Linux (고성능 GPU 권장)", "Windows · macOS · Linux (dedicated GPU recommended)"),
    benchmarkTakeaway: t(
      "G'MIC Watershed 자동 밑색(Colorize Mask)을 브라우저 클린룸으로 내재화하고 개인 로컬 추론 서버 연결(BYOK) 철학을 반영",
      "Internalized G'MIC/Krita Watershed colorize masks in-browser and supports optional creator-operated local inference servers",
    ),
    honestStrength: t(
      "ControlNet·IP-Adapter·실시간 캔버스 확산(Live Painting)과 로컬 커스텀 체크포인트 완전 제어",
      "Full local GPU control over ControlNet, IP-Adapter, live diffusion painting and custom checkpoints",
    ),
  },
  {
    id: "csp",
    name: "Clip Studio Paint",
    shortName: "CSP",
    role: t("생성형 AI 배제·전통 만화 자동화(자동 채색·포즈 스캐너) 툴", "Non-generative comic suite focusing on traditional assist tools"),
    pricing: t("영구판(PC) 또는 월/연 구독", "One-time (PC) or monthly/annual subscription"),
    platform: t("Windows · macOS · iPad · Android", "Windows · macOS · iPad · Android"),
    benchmarkTakeaway: t(
      "작가 신뢰를 지키는 생성형 AI 미탑재 정책과 3D LT 변환·자동 밑색 힌트 워크플로를 벤치마킹",
      "Benchmarked creator-trust stance against generative training plus 3D LT conversion and color-hint flatting",
    ),
    honestStrength: t(
      "생성형 AI 논란 없이 20년간 축적한 전통 작화 보조(틈 닫기 채우기·자동 채색 힌트·손 포즈 스캐너) 신뢰도",
      "Strong creator trust built on zero generative AI policy and 20 years of reliable traditional comic helpers",
    ),
  },
  {
    id: "canva-comfy",
    name: "Canva / ComfyUI",
    shortName: "Canva / ComfyUI",
    role: t("템플릿 AI 자동화(Canva) 및 노드형 생성 파이프라인(ComfyUI)", "Template Magic Studio (Canva) & node generative pipelines (ComfyUI)"),
    pricing: t("Canva Pro 구독 / ComfyUI 오픈소스(GPU 필요)", "Canva Pro subscription / ComfyUI open-source (GPU needed)"),
    platform: t("웹(Canva) · 로컬 Python/GPU(ComfyUI)", "Web (Canva) · local Python/GPU (ComfyUI)"),
    benchmarkTakeaway: t(
      "생성형 자동화의 속도 장점을 참고하되, 웹툰 저작권·독자 신뢰·무설치 로컬 실행을 해치지 않는 경계로 설계",
      "Balances automation speed against webtoon copyright, reader trust and zero-install browser execution",
    ),
    honestStrength: t(
      "Canva의 초고속 마케팅/썸네일 자동화와 ComfyUI의 무한한 생성형 모델·LoRA 노드 확장성",
      "Canva's rapid marketing automation and ComfyUI's unmatched custom generative node/LoRA extensibility",
    ),
  },
];

export const BENCHMARK_AI_ASSIST_DATASET: BenchmarkDataset = {
  id: "ai-assist",
  path: "/about/technology/benchmarks/ai-assist",
  shortLabel: t("AI 보조·권리", "AI Assist & Rights"),
  eyebrow: `GRANULAR BENCHMARK · AI ASSIST & RIGHTS · ${BENCHMARK_SNAPSHOT_DATE}`,
  title: t(
    "AI 보조 · 결정적 자동화 · 저작권 보호 벤치마크 (12종 × 6개 툴)",
    "AI Assist, Deterministic Automation & Rights Protection Benchmark (12 Items × 6 Tools)",
  ),
  subtitle: t(
    "툰스튜디오가 어떤 도구의 어떤 자동화를 벤치마킹해 ₩0 브라우저 로컬 결정적 알고리즘과 Rights BOM 저작권 보호로 내재화했는지 항목별로 공개합니다.",
    "Transparent breakdown of what ToonStudio benchmarked and internalized as KRW 0 local deterministic engines plus fail-closed Rights BOM protection.",
  ),
  scopeNote: t(
    "비교 범위: ToonStudio 2026-11-22 결정적 자동화·접근성·권리 감사 코드 실측 vs Tooning Plus · Photoshop(Firefly) · Krita AI Diffusion · CSP · Canva/ComfyUI 공식 기능 기준.",
    "Scope: verified against 2026-11-22 ToonStudio deterministic assist, a11y and Rights BOM source vs 5 AI/creative ecosystems.",
  ),
  snapshotDate: BENCHMARK_SNAPSHOT_DATE,
  tools: AI_ASSIST_TOOLS,
  subGroups: [
    {
      id: "deterministic-imaging",
      label: t("₩0 로컬 채색·복원", "KRW 0 Local Flat & Inpaint"),
      description: t("Watershed 자동 밑색·PatchMatch 로컬 인페인팅·3D→벡터 HLR", "Watershed auto flatting, local PatchMatch & 3D-to-vector HLR"),
    },
    {
      id: "scene-readability",
      label: t("광원·시선·태깅·접근성", "Light, Gaze, Tag & A11y"),
      description: t("3D↔2D 광원 동기화·시선 동선 검사·스마트 태깅·컷별 Alt-Text", "3D-to-2D light sync, eye-flow audit, smart autotag & cut alt-text"),
    },
    {
      id: "rights-sovereignty",
      label: t("저작권·학습 배제·BYOK", "Rights, Opt-Out & BYOK"),
      description: t("Rights BOM 감사·AI 학습 배제·BYOK/개인 런타임·신뢰 영수증", "Rights BOM audit, no-training sovereignty, BYOK/local runtime & trust seal"),
    },
  ],
  rows: [
    {
      id: "watershed-auto-flatting",
      subGroupId: "deterministic-imaging",
      title: t("Watershed 선화 자동 밑색 (Colorize Mask)", "Watershed Lineart Auto-Flatting"),
      metricTag: t("G'MIC/Krita 벤치마킹 · ₩0 로컬", "Benchmarked vs G'MIC/Krita · KRW 0"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Krita Colorize Mask / G'MIC Watershed를 벤치마킹해 힙 기반 우선순위 큐 + 3×3 Sobel 기울기 + 안티앨리어싱 하부 팽창으로 100% 클린룸 내재화",
        "Benchmarked Krita/G'MIC Colorize Mask and built a clean-room heap-priority Watershed + Sobel gradient + AA halo expansion engine",
      ),
      evidenceSummary: t(
        "선화에 몇 개의 색상 점만 찍으면 AI 학습 모델이나 서버 전송 없이 결정적으로 밑색을 채우고 흰 테두리(halo)를 제거합니다.",
        "Fills flat colors deterministically from sparse color hints with anti-alias halo removal and zero server uploads.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/imaging-pro/studio-watershed-lineart-colorizer.ts",
      ],
      honestLimit: t(
        "거친 스케치 선화에서 AI가 캐릭터 의상·명암까지 통째로 추론해 칠하는 생성형 자동 채색과는 목적이 다르며, 깔끔한 밑색 분리 전용입니다.",
        "Built for clean flatting on inked lineart rather than generative full-shading inference on rough sketches.",
      ),
      cells: {
        toonstudio: c("full", "₩0 브라우저 로컬 Watershed + halo 제거", "KRW 0 local Watershed + AA halo expand"),
        tooning: c("partial", "AI 생성형 채색(결정적 선화 밑색 제한)", "Generative AI coloring; limited deterministic flats"),
        photoshop: c("partial", "Neural Colorize(사진용·웹툰 선화 밑색 약함)", "Photo Neural Colorize; weak comic flatting"),
        "krita-ai": c("full", "Krita Colorize Mask(원조) + AI 확장", "Original Colorize Mask + AI plugin"),
        csp: c("full", "자동 채색(클라우드 힌트) + 틈 닫기 채우기", "Cloud auto-color hints + close-and-fill"),
        "canva-comfy": c("plugin", "ComfyUI 커스텀 노드 조합 필요", "Requires custom ComfyUI graph setup"),
      },
    },
    {
      id: "patchmatch-local-inpaint",
      subGroupId: "deterministic-imaging",
      title: t("PatchMatch ₩0 로컬 인페인팅 (비생성형 복원)", "Local PatchMatch Inpainting (Non-Generative)"),
      metricTag: t("Photoshop 벤치마킹 · 환각 0", "Benchmarked vs Photoshop · zero hallucination"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop Content-Aware Fill의 PatchMatch 알고리즘을 클린룸 다중 피라미드로 내재화해 저작권 우려 없는 순수 텍스처 복원을 구현",
        "Internalized multi-scale PatchMatch cleanly so artists remove artifacts purely from their own canvas pixels",
      ),
      evidenceSummary: t(
        "외부 학습 가중치를 전혀 쓰지 않고 현재 그림의 주변 패치만 탐색·합성해 배경 잡티·가이드 선을 ₩0 로컬로 지웁니다.",
        "Samples strictly from the artist's own canvas patches with zero pretrained generative weights or cloud cost.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/imaging-pro/studio-patchmatch-inpaint-and-freqsep.ts",
      ],
      honestLimit: t(
        "화면 밖에 없는 전혀 새로운 오브젝트나 복잡한 인물 포즈를 그려 넣는 작업은 Firefly/ComfyUI 같은 생성형 모델이 우위입니다.",
        "Inventing entirely new unseen objects or complex anatomy remains the strength of Firefly and ComfyUI.",
      ),
      cells: {
        toonstudio: c("full", "₩0 로컬 PatchMatch(외부 학습 모델 0)", "KRW 0 local PatchMatch; zero AI weights"),
        tooning: c("partial", "AI 지우개(클라우드 생성형 기반)", "Cloud generative AI eraser"),
        photoshop: c("full", "로컬 PatchMatch + Firefly 생성형 채우기 최강", "Local PatchMatch + industry-leading Firefly"),
        "krita-ai": c("full", "G'MIC Patch Inpaint + 로컬 Diffusion 인페인트", "G'MIC Patch Inpaint + Diffusion inpaint"),
        csp: c("none", "PatchMatch 콘텐츠 인식 채우기 미지원", "No PatchMatch content-aware fill"),
        "canva-comfy": c("full", "Canva Magic Eraser / ComfyUI Inpaint", "Canva Magic Eraser & ComfyUI Inpaint"),
      },
    },
    {
      id: "hlr-deterministic-lineart",
      subGroupId: "deterministic-imaging",
      title: t("3D → 벡터 강약 선화 추출 (환각 없는 HLR)", "Deterministic 3D-to-Vector Lineart (HLR)"),
      metricTag: t("CSP LT/Blender 벤치마킹 · 기하 정확도", "Benchmarked vs CSP LT · exact geometry"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "생성형 AI 선화 변환이 건축 투시와 창문 개수를 일그러뜨리는 한계를 피하기 위해 3D 기하 은선 제거(HLR)로 결정적 내재화",
        "Uses exact 3D geometric HLR instead of generative lineart so architectural windows and perspective never warp",
      ),
      evidenceSummary: t(
        "동일 카메라에서 항상 100% 재현되는 서브픽셀 은선 제거 벡터 SVG 선화를 ₩0 브라우저 로컬로 추출합니다.",
        "Extracts 100% reproducible subpixel hidden-line-removed SVG vector lines locally at KRW 0.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/scene3d-pro/studio-3d-vector-lineart-hlr.ts",
      ],
      honestLimit: t(
        "단순 2D 사진 한 장에서 만화풍 선화를 추출하는 작업은 AI 선화 추출 모델 대비 3D 메시 입력이 필요합니다.",
        "Requires 3D geometry input rather than single-photo AI stylization.",
      ),
      cells: {
        toonstudio: c("full", "결정적 3D HLR → 강약 벡터 SVG", "Deterministic 3D HLR -> variable SVG"),
        tooning: c("partial", "AI/래스터 스타일 변환 중심", "AI/raster style conversion focus"),
        photoshop: c("none", "3D→벡터 HLR 선화 추출 미지원", "No 3D-to-vector HLR lineart"),
        "krita-ai": c("partial", "ControlNet Lineart(생성형·기하 왜곡 가능)", "Generative ControlNet; may distort geometry"),
        csp: c("full", "EX LT 변환(결정적 3D→선화/톤 표준)", "EX LT deterministic 3D line/tone standard"),
        "canva-comfy": c("partial", "ComfyUI Lineart 프리프로세서(래스터)", "ComfyUI raster lineart preprocessors"),
      },
    },
    {
      id: "deterministic-light-sync",
      subGroupId: "scene-readability",
      title: t("3D ↔ 2D 광원·림라이트 색온도 자동 동기화", "Deterministic 3D-to-2D Light & Rimlight Sync"),
      metricTag: t("캐릭터 변형 0 · 색온도 수학 동기화", "Zero face drift · Kelvin math sync"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "생성형 Relighting AI(IC-Light 등)가 캐릭터 얼굴/화풍을 변형시키는 문제를 피해 3D 광원 벡터→2D 림라이트·색온도 패치로 내재화",
        "Avoids generative relighting face drift by mapping 3D light vectors and Kelvin directly to 2D grading & rimlight",
      ),
      evidenceSummary: t(
        "작가가 그린 2D 캐릭터 선과 얼굴을 1픽셀도 변형하지 않고 3D 배경 색온도(2400K~10000K)와 역광 림라이트만 정합합니다.",
        "Matches 3D scene color temperature (2400K–10000K) and rimlight without altering a single drawn character line.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/bg3d/studio-bg3d-2d-character-light-sync.ts",
      ],
      honestLimit: t(
        "복잡한 실내 간접광(Global Illumination) 그림자 재계산은 ComfyUI IC-Light나 Blender 3D 재렌더링이 더 사실적입니다.",
        "Complex multi-bounce indirect lighting synthesis is more photorealistic in IC-Light or full 3D rendering.",
      ),
      cells: {
        toonstudio: c("full", "₩0 결정적 광원·림라이트 동기화(화풍 보존)", "KRW 0 deterministic light sync; preserves art"),
        tooning: c("partial", "배경 분위기 필터 수준", "Basic scene mood presets"),
        photoshop: c("partial", "Harmonize Neural Filter(클라우드/사진용)", "Cloud Harmonize Neural Filter (photo focus)"),
        "krita-ai": c("plugin", "IC-Light 확산 워크플로(화풍 변동 가능)", "IC-Light diffusion workflow (may alter lines)"),
        csp: c("none", "3D→2D 자동 광원/림라이트 동기화 없음", "No automated 3D-to-2D rimlight sync"),
        "canva-comfy": c("plugin", "ComfyUI IC-Light 노드(GPU·생성형)", "ComfyUI IC-Light nodes (GPU generative)"),
      },
    },
    {
      id: "eyeflow-gaze-audit",
      subGroupId: "scene-readability",
      title: t("시선 동선(Eye-Flow) Z-패턴 검사 & 얼굴 가림 진단", "Eye-Flow Z-Pattern & Face-Occlusion Audit"),
      metricTag: t("₩0 기하 분석 · 말풍선 꼬리 보정", "KRW 0 geometry audit · tail auto-fix"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "편집자/PD가 수작업으로 검수하던 말풍선 읽기 순서 역주행과 캐릭터 눈·얼굴 가림을 2D 기하 분석 엔진으로 ₩0 로컬 자동화",
        "Automated editorial balloon reading-order and face-occlusion checks via deterministic 2D geometry",
      ),
      evidenceSummary: t(
        "좌→우(한국/글로벌) 및 우→좌(일본 만화) 시선 역주행을 점수로 진단하고, 캐릭터 얼굴/눈을 가리는 말풍선 꼬리 보정 좌표를 계산합니다.",
        "Scores LTR/RTL Z-pattern readability, flags face/eye occlusion and computes corrected balloon tail coordinates.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/eyeflow/studio-eyeflow-geometry.ts",
        "apps/web/src/domains/creator/eyeflow/studio-eyeflow-primitives.ts",
      ],
      honestLimit: t(
        "시각적 강조 색채나 인물 시선 방향까지 딥러닝으로 예측하는 시선 히트맵(Saliency AI)이 아니라 말풍선·컷 배치 기하 기준입니다.",
        "Evaluates deterministic panel/balloon geometry rather than deep-learning visual saliency heatmaps.",
      ),
      cells: {
        toonstudio: c("full", "₩0 로컬 Z-패턴·얼굴 가림 진단 & 꼬리 보정", "KRW 0 local Z-pattern & occlusion fix"),
        tooning: c("none", "시선 동선·말풍선 가림 자동 진단 없음", "No eye-flow or face-occlusion audit"),
        photoshop: c("none", "만화 시선 동선 진단 미지원", "No comic eye-flow audit"),
        "krita-ai": c("none", "만화 시선 동선 진단 미지원", "No comic eye-flow audit"),
        csp: c("none", "말풍선 시선 역주행 자동 진단 없음", "No automated eye-flow audit"),
        "canva-comfy": c("none", "웹툰 시선 동선 진단 없음", "No webtoon eye-flow audit"),
      },
    },
    {
      id: "smart-asset-autotag",
      subGroupId: "scene-readability",
      title: t("스마트 에셋 자동 태깅 & CIELAB 지배 색 인덱싱", "Smart Asset Auto-Tagging & CIELAB Color Indexing"),
      metricTag: t("₩0 브라우저 로컬 · 한/영 태그", "KRW 0 browser-local · KO/EN tags"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "유료 클라우드 비전 태깅 API 없이도 수천 개 소재를 색온도·비율·투명 채널로 즉시 검색하도록 CIELAB 로컬 분석기를 구현",
        "Built a local CIELAB & metadata analyzer so thousands of studio assets become searchable without paid vision APIs",
      ),
      evidenceSummary: t(
        "해상도·종횡비·투명 채널 검증·CIELAB 지배 색상과 재사용 블록 역할을 브라우저 로컬에서 결정적으로 태깅합니다.",
        "Deterministically tags orientation, resolution tier, verified alpha channel, CIELAB palette and reusable block role locally.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/asset-workspace/studio-asset-smart-autotag.ts",
      ],
      honestLimit: t(
        "이미지 속 사물 의미('중세 기사 검', '벚꽃 가로수')를 자동 명명하는 시맨틱 비전 태깅은 외부 비전 모델이 더 풍부합니다.",
        "Semantic object naming (e.g. 'medieval knight sword') requires external vision models rather than pure pixel/color heuristics.",
      ),
      cells: {
        toonstudio: c("full", "₩0 로컬 CIELAB 색·비율·알파 자동 태깅", "KRW 0 local CIELAB, aspect & alpha autotag"),
        tooning: c("partial", "내장 카탈로그 사전 태깅(사용자 로컬 분석 제한)", "Pre-tagged library; limited local analysis"),
        photoshop: c("partial", "Adobe Bridge/Stock 클라우드 시맨틱 태깅", "Cloud semantic search via Bridge/Stock"),
        "krita-ai": c("none", "로컬 에셋 CIELAB 자동 태깅 미내장", "No built-in CIELAB asset autotagger"),
        csp: c("partial", "수동 태그 입력 중심(자동 색 인덱싱 없음)", "Manual tagging; no auto CIELAB indexing"),
        "canva-comfy": c("partial", "Canva 클라우드 에셋 검색(로컬 비지원)", "Cloud asset search in Canva only"),
      },
    },
    {
      id: "a11y-cut-alt-text",
      subGroupId: "scene-readability",
      title: t("컷별 접근성 대체 텍스트(WCAG 1.1.1 Alt-Text) 검증·보조", "Per-Cut Accessibility Alt-Text (WCAG 1.1.1)"),
      metricTag: t("125자 요약 · 컷 순서 대사 · 프롬프트 인젝션 방어", "125-char cap · cut dialogue · injection guard"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 시각장애 독자 접근성을 위해 WCAG 1.1.1 125자 요약 + 컷 순서 말풍선 텍스트 구조와 안전 검증기를 직접 설계",
        "Engineered WCAG 1.1.1 125-char summary + cut-ordered speech-text validation with prompt-injection guards for webtoon accessibility",
      ),
      evidenceSummary: t(
        "로컬 검증기가 125자 한 줄 요약·장면 서술·컷별 보이는 글자를 엄격히 검증하며, 자동 초안 생성 시 선택적 BYOK 비전 라우팅을 지원합니다.",
        "Validates 125-char summaries, scene prose and per-cut visible dialogue locally, with optional BYOK vision drafting.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/ai/assist/assist-alt-text.ts",
      ],
      honestLimit: t(
        "이미지 내용을 자동으로 읽어 초안을 생성하려면 사용자 선택 BYOK/서버 비전 모델 연결이 필요하며(오프라인 단독 자동 캡션 불가), 수동 입력·검증은 100% 로컬입니다.",
        "Auto-drafting captions from pixels requires optional BYOK/vision routing; manual authoring and validation are 100% local.",
      ),
      cells: {
        toonstudio: c("full", "WCAG 컷별 Alt-Text 구조 검증 + 선택 BYOK 초안", "WCAG per-cut alt-text validator + optional BYOK"),
        tooning: c("none", "웹툰 컷별 WCAG Alt-Text 워크플로 없음", "No per-cut WCAG alt-text workflow"),
        photoshop: c("none", "만화 컷 순서 Alt-Text 생성/검증 없음", "No comic cut-order alt-text tool"),
        "krita-ai": c("none", "웹툰 접근성 Alt-Text 워크플로 없음", "No webtoon alt-text workflow"),
        csp: c("none", "웹툰 컷별 Alt-Text 구조화 도구 없음", "No structured cut alt-text workflow"),
        "canva-comfy": c("partial", "Canva 단일 이미지 Alt-Text 입력(컷 순서 없음)", "Single-image alt text in Canva; no cut order"),
      },
    },
    {
      id: "rights-bom-preflight",
      subGroupId: "rights-sovereignty",
      title: t("Rights BOM 출하 전 저작권·라이선스 Fail-Closed 감사", "Fail-Closed Rights BOM Commercial Preflight"),
      metricTag: t("폰트·브러시·3D·오디오 6범주 자동 차단", "6-category auto-block before export"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "소프트웨어 공급망 SBOM과 Adobe Content Credentials 개념을 웹툰 출하 전 상업 라이선스 차단 게이트(Fail-Closed)로 발전",
        "Adapted software SBOM and provenance concepts into a fail-closed commercial license gate before episode export",
      ),
      evidenceSummary: t(
        "폰트·브러시·3D 배경·효과·오디오·참고자료 중 비상업·만료·출처 누락이 1건이라도 있으면 상업 납품 패키지 생성을 차단합니다.",
        "Blocks commercial delivery packages whenever any font, brush, 3D set, FX or audio asset is non-commercial, expired or uncredited.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts",
        "apps/web/src/domains/creator/export/studio-export-rights-receipt-adapter.ts",
      ],
      honestLimit: t(
        "작가가 외부에서 라이선스 표기 없이 직접 붙여넣은 일반 비트맵 이미지의 원저작권까지 자동 판별하지는 못합니다.",
        "Cannot auto-detect undeclared copyright on raw external bitmaps pasted without source metadata.",
      ),
      cells: {
        toonstudio: c("full", "6범주 Fail-Closed Rights BOM 출하 감사", "6-category fail-closed Rights BOM gate"),
        tooning: c("partial", "자사 내장 에셋 약관 범위 안내(BOM 없음)", "Built-in asset terms only; no export BOM"),
        photoshop: c("partial", "Content Credentials(C2PA) 기록(차단 게이트 아님)", "C2PA Content Credentials; no license block gate"),
        "krita-ai": c("none", "상업 납품 Rights BOM 감사 없음", "No commercial Rights BOM validator"),
        csp: c("none", "출하 전 라이선스 BOM 자동 감사 없음", "No preflight Rights BOM validator"),
        "canva-comfy": c("partial", "Canva Pro 에셋 워터마크/라이선스(외부 혼합 미감사)", "Canva stock licensing only; no unified BOM"),
      },
    },
    {
      id: "no-ai-training-sovereignty",
      subGroupId: "rights-sovereignty",
      title: t("AI 학습 원천 배제 · 작가 화풍·원본 데이터 로컬 주권", "Zero AI Training on User Art & Local Data Sovereignty"),
      metricTag: t("원본 OPFS 로컬 보관 · AI 사용 메타 분리", "Local OPFS storage · explicit AI-use disclosure"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 작가들이 가장 우려하는 '내 원고가 AI 학습에 쓰이지 않을까' 문제를 구조적으로 풀기 위해 기기 로컬 원장과 AI 사용 메타 표기를 분리",
        "Addresses creators' #1 AI concern by keeping source art locally on-device and logging explicit AI-use provenance",
      ),
      evidenceSummary: t(
        "원고 원본을 클라우드 학습 풀로 수집하지 않고 기기 로컬(OPFS/SQLite)에 두며, 에셋·에피소드별 AI 사용 여부 도시에르를 기록합니다.",
        "Keeps source manuscripts on-device without platform training ingestion and records per-asset AI-use disclosures.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/export/studio-episode-rights-dossier.ts",
        "apps/web/src/domains/creator/bg3d/StudioBg3dAssetAiUseFields.tsx",
      ],
      honestLimit: t(
        "사용자가 직접 연결한 외부 BYOK API(예: 타사 클라우드 AI)의 데이터 보관 정책은 해당 외부 공급자 약관을 별도 확인해야 합니다.",
        "When a creator opts into an external BYOK cloud API, that third-party provider's data policy applies separately.",
      ),
      cells: {
        toonstudio: c("full", "로컬 원장·학습 배제·에피소드 권리 도시에르", "Local authority, no training & rights dossier"),
        tooning: c("partial", "클라우드 저장·AI 약관 확인 필요", "Cloud-hosted; review platform AI terms"),
        photoshop: c("partial", "Firefly 자체 학습 데이터 정책(클라우드 약관)", "Firefly stock-trained policy; cloud terms apply"),
        "krita-ai": c("full", "100% 로컬 실행 시 외부 전송 0", "Zero cloud upload when run locally"),
        csp: c("full", "로컬 파일·생성형 AI 미도입 정책 명확", "Local files & clear non-generative policy"),
        "canva-comfy": c("partial", "ComfyUI 로컬 안전 / Canva 클라우드 옵트아웃", "ComfyUI local-safe; Canva cloud opt-out"),
      },
    },
    {
      id: "byok-local-runtime-cap",
      subGroupId: "rights-sovereignty",
      title: t("선택적 BYOK · 개인 로컬 추론 런타임 & 비용 상한 가드", "Optional BYOK, Personal Local Runtime & Cost Cap"),
      metricTag: t("강제 AI 크레딧 0 · 비용 상한 보호", "Zero forced AI credits · cost cap guard"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "월간 AI 크레딧 강제 구독 모델 대신, 필요한 작가만 무료 자동·개인 API 키·개인 로컬 추론 서버를 라우팅하고 비용 상한을 걸도록 설계",
        "Replaces forced monthly AI credit packs with opt-in routing (free auto, personal key, self-hosted runtime) plus spend caps",
      ),
      evidenceSummary: t(
        "작업별 모델 라우터, 구조화 비용 상한 계산기, 개인 AI 런타임 연결 워크스페이스를 분리해 원치 않는 AI 과금을 차단합니다.",
        "Separates per-task model routing, structured USD cost caps and personal local runtime pairing to prevent surprise bills.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/ai/assist/assist-creator-model-router.ts",
        "apps/web/src/domains/creator/ai/assist/assist-feature-cost-cap.ts",
        "apps/web/src/domains/creator/ai/PersonalRuntimeWorkspace.tsx",
      ],
      honestLimit: t(
        "개인 로컬 추론 서버를 직접 운영하려면 사용자가 별도로 GPU PC와 추론 서버를 준비해야 합니다.",
        "Self-hosted personal inference still requires the creator to run their own local GPU server.",
      ),
      cells: {
        toonstudio: c("full", "선택 BYOK·개인 로컬 런타임·비용 상한 가드", "Optional BYOK, personal runtime & cost cap"),
        tooning: c("none", "자사 클라우드 AI 크레딧 전용", "Proprietary cloud AI credits only"),
        photoshop: c("partial", "Adobe 크레딧 중심(외부 파트너 일부)", "Adobe credit system with select partners"),
        "krita-ai": c("full", "로컬 ComfyUI/GPU 직접 연결 최고 수준", "Top-tier local ComfyUI/GPU integration"),
        csp: c("none", "외부 AI 모델 라우팅 없음", "No external AI model routing"),
        "canva-comfy": c("partial", "ComfyUI 완전 자유 / Canva 자사 크레딧 전용", "ComfyUI fully open; Canva proprietary only"),
      },
    },
    {
      id: "generative-scope-boundary",
      subGroupId: "deterministic-imaging",
      title: t("클라우드 생성형 이미지 합성 (정직한 경계 비교)", "Cloud Generative Image Synthesis (Candid Boundary)"),
      metricTag: t("선택 보조 vs 생성형 핵심 모델", "Optional assist vs generative-first apps"),
      toonstudioMaturity: "in-progress",
      benchmarkOrigin: t(
        "ToonStudio는 생성형 이미지 '대체'가 아니라 작가 직접 작화 + 결정적 보조를 핵심으로 삼고, 스타일 필터·외부 생성은 명확한 선택 경계에 둡니다",
        "Positions ToonStudio as artist-first deterministic assist rather than a generative-first replacement, keeping AI synthesis strictly opt-in",
      ),
      evidenceSummary: t(
        "내장 웹툰 스타일 필터와 선택형 외부 생성 워크플로를 구분하되, 초고품질 텍스트→이미지 생성 자체는 전용 생성 툴의 강점으로 정직히 인정합니다.",
        "Separates opt-in style filters and external generation workflows while candidly crediting dedicated generative platforms.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/ai/studio-ai-webtoon-style-filter.ts",
      ],
      honestLimit: t(
        "텍스트 프롬프트만으로 실사급 배경을 무한 확장·생성하는 화질과 속도는 Photoshop Firefly와 ComfyUI/SDXL·Flux 생태계가 압도적으로 앞섭니다.",
        "Text-to-image synthesis quality and speed are vastly superior in Adobe Firefly and local ComfyUI/Flux pipelines.",
      ),
      cells: {
        toonstudio: c("partial", "결정적 보조 중심 · 외부 생성은 선택 BYOK", "Deterministic-first; external gen is opt-in"),
        tooning: c("full", "웹툰 특화 AI 캐릭터·배경 생성 내장", "Built-in webtoon AI character & set gen"),
        photoshop: c("full", "Firefly 생성형 채우기·확장 업계 최강", "Industry-leading Firefly Gen Fill/Expand"),
        "krita-ai": c("full", "SDXL/Flux/ControlNet 로컬 실시간 생성 최강", "Top local SDXL/Flux/ControlNet live gen"),
        csp: c("none", "생성형 이미지 합성 의도적 미탑재", "Intentionally excludes generative synthesis"),
        "canva-comfy": c("full", "Canva Magic Media / ComfyUI 최강 생성 파이프라인", "Canva Magic Media & ComfyUI pipelines"),
      },
    },
    {
      id: "reader-trust-seal",
      subGroupId: "rights-sovereignty",
      title: t("독자 신뢰 배지 · 에피소드 권리 도시에르 제출 호환", "Reader Trust Seal & Episode Rights Dossier"),
      metricTag: t("직접 작화/AI 비중 투명 증빙", "Transparent human-craft / AI disclosure"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "독자와 연재 플랫폼의 AI 표기 요구 강화에 맞춰 에피소드별 소재·AI 사용 이력을 검증 가능한 도시에르와 신뢰 배지로 묶어 내재화",
        "Meets rising reader and platform disclosure norms with verifiable episode rights dossiers and reader trust seals",
      ),
      evidenceSummary: t(
        "에피소드 권리 도시에르와 독자 신뢰 배지 프리뷰 카드가 사용 소재와 AI 관여 여부를 투명하게 요약해 플랫폼 제출을 돕습니다.",
        "Episode rights dossier and reader trust seal cards summarize asset licenses and AI usage transparently for publishers.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/export/studio-episode-rights-dossier.ts",
        "apps/web/src/domains/creator/export/StudioReaderTrustSealPreviewCard.tsx",
      ],
      honestLimit: t(
        "글로벌 C2PA 암호화 서명 표준의 외부 플랫폼 자동 검증 생태계 채택은 Adobe Content Credentials가 가장 앞서 있습니다.",
        "Global third-party platform recognition of cryptographic C2PA signatures is led by Adobe Content Credentials.",
      ),
      cells: {
        toonstudio: c("full", "에피소드 권리 도시에르 + 독자 신뢰 배지", "Episode rights dossier + reader trust seal"),
        tooning: c("none", "독자 신뢰 도시에르 제출 패키지 없음", "No reader trust rights dossier"),
        photoshop: c("full", "C2PA Content Credentials 글로벌 표준 선도", "Leads global C2PA Content Credentials"),
        "krita-ai": c("none", "통합 권리 도시에르·신뢰 배지 없음", "No unified rights dossier or trust seal"),
        csp: c("partial", "타임랩스 녹화로 직접 작화 간접 증빙", "Indirect human-craft proof via timelapse"),
        "canva-comfy": c("none", "웹툰 연재용 권리 도시에르 미지원", "No webtoon rights dossier"),
      },
    },
  ],
  honestTradeoffs: [
    {
      competitorId: "photoshop",
      competitorName: "Adobe Photoshop (Firefly)",
      area: t("생성형 채우기/확장 화질 & C2PA 글로벌 표준", "Generative Fill/Expand quality & global C2PA"),
      competitorEdge: t(
        "배경 자동 확장, 객체 생성 합성 품질, 상업 IP 보상 정책, C2PA 생태계 영향력에서 가장 앞서 있습니다.",
        "Unmatched Generative Fill/Expand synthesis quality, IP indemnity program and global C2PA adoption.",
      ),
      toonstudioPosition: t(
        "생성형 크레딧 구독 없이도 해결되는 반복 작업(Watershed 밑색·PatchMatch·HLR 선화·광원 동기화·시선 검사)을 ₩0 로컬 결정적 엔진으로 풀었습니다.",
        "Solves everyday webtoon chores deterministically at KRW 0 locally so creators avoid generative credit bills and style drift.",
      ),
    },
    {
      competitorId: "krita-ai",
      competitorName: "Krita AI Diffusion & ComfyUI",
      area: t("로컬 GPU 생성형 워크플로(ControlNet · LoRA) 자유도", "Local GPU generative freedom (ControlNet & LoRA)"),
      competitorEdge: t(
        "고성능 로컬 GPU가 있다면 ControlNet·IP-Adapter·커스텀 LoRA로 미세하게 제어하는 생성 파이프라인이 최강입니다.",
        "Unbeatable local GPU flexibility for ControlNet, IP-Adapter and custom LoRA diffusion graphs.",
      ),
      toonstudioPosition: t(
        "고성능 GPU 설치 없이 웹 브라우저에서 바로 쓰고, 원할 때만 개인 로컬 추론 서버를 BYOK로 연결하는 실용적 경계를 유지합니다.",
        "Runs zero-install on everyday laptops while supporting optional self-hosted personal inference via BYOK.",
      ),
    },
    {
      competitorId: "tooning",
      competitorName: "Tooning Plus & Canva",
      area: t("원클릭 AI 생성 & 비전공자 템플릿 완성 속도", "1-click AI generation & beginner template speed"),
      competitorEdge: t(
        "그림 경험이 적은 사용자나 마케팅 담당자가 템플릿+AI 생성으로 몇 분 만에 콘텐츠를 뽑아내는 속도가 매우 빠릅니다.",
        "Fastest path for non-artists or marketers assembling template + AI-generated visuals in minutes.",
      ),
      toonstudioPosition: t(
        "직접 창작하는 웹툰 작가·팀의 화풍 보존, 저작권 안전(Rights BOM), 장기 연재 품질을 최우선으로 설계했습니다.",
        "Prioritizes hands-on artists' style integrity, fail-closed copyright hygiene and long-term serial quality.",
      ),
    },
    {
      competitorId: "csp",
      competitorName: "Clip Studio Paint",
      area: t("생성형 배제 정책 신뢰 & 전통 작화 보조 성숙도", "Non-generative trust & mature comic assist"),
      competitorEdge: t(
        "생성형 AI를 넣지 않겠다는 명확한 기조와 20년 검증된 전통 만화 보조 도구의 안정성이 작가 신뢰를 받습니다.",
        "Earns strong creator trust through its clear non-generative stance and 20 years of refined comic helpers.",
      ),
      toonstudioPosition: t(
        "같은 창작자 존중 원칙(학습 배제·로컬 주권)을 지키면서 브라우저 무료 진입, Rights BOM, 시선 동선·접근성 감사를 더했습니다.",
        "Shares the same creator-first no-training stance while adding browser KRW 0 access, Rights BOM and eye-flow/a11y audits.",
      ),
    },
  ],
};
