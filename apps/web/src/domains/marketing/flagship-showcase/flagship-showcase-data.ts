/**
 * Wave 20 플래그십 쇼케이스 및 기능 아틀라스 정본 데이터.
 *
 * 모든 라우트 경로는 앱에 실제 선언된 정본 경로만 사용하며,
 * 오픈 전 홍보용 '신규' 배지 대신 핵심 기능의 실체를 직관적으로 드러낸다.
 */

export interface BilingualText {
  readonly ko: string;
  readonly en: string;
}

export type FlagshipBrushId = "pencil6b" | "crayon" | "watercolor" | "oil48" | "gpen";
export type WatercolorPigmentId = "cobalt" | "saffron";
export type ComparisonModeId = "brush" | "npr3d" | "qa";
export type CreatorRoleId = "solo-author" | "bg3d-assistant" | "studio-pd" | "global-export";
export type ByotToolId = "csp" | "photoshop" | "blender" | "jira" | "slack" | "sheets";
export type AtlasDomainId = "physical-brush" | "rust-webgpu" | "scene-3d-npr" | "qa-collab" | "byot-export" | "workflow-learn";

export interface FlagshipBrushSpec {
  readonly id: FlagshipBrushId;
  readonly name: BilingualText;
  readonly badge: BilingualText;
  readonly feelNote: BilingualText;
  readonly baseWidth: number;
}

export const FLAGSHIP_BRUSHES: readonly FlagshipBrushSpec[] = [
  {
    id: "pencil6b",
    name: { ko: "6B 연필 (2층 종이결)", en: "6B Pencil (2-Layer Tooth)" },
    badge: { ko: "종이결 2층 입자", en: "2-Layer Paper Tooth" },
    feelNote: {
      ko: "압력에 따라 고운 섬유와 거친 종이결 두 층이 흑연을 잡아줍니다.",
      en: "Fine fibers and cold-press grain catch graphite across two tactile layers.",
    },
    baseWidth: 7.5,
  },
  {
    id: "crayon",
    name: { ko: "왁스 크레파스", en: "Wax Crayon" },
    badge: { ko: "거친 왁스 스킵", en: "Waxy Grain Skip" },
    feelNote: {
      ko: "종이 골을 건너뛰며 왁스 질감이 뭉근하게 쌓입니다.",
      en: "Dense wax ridges skip across paper valleys with crisp dry edges.",
    },
    baseWidth: 14,
  },
  {
    id: "watercolor",
    name: { ko: "수채 (쿠벨카-문크)", en: "Watercolor (Kubelka-Munk)" },
    badge: { ko: "파랑+노랑=초록", en: "Blue + Yellow = Green" },
    feelNote: {
      ko: "파랑 위에 노랑을 겹치면 탁한 회색 대신 맑은 초록으로 광학 혼색됩니다.",
      en: "Layer yellow over blue to mix luminous emerald green instead of muddy gray.",
    },
    baseWidth: 18,
  },
  {
    id: "oil48",
    name: { ko: "48돈모 유화", en: "48-Bristle Oil" },
    badge: { ko: "48모 결·임파스토", en: "48-Bristle Impasto" },
    feelNote: {
      ko: "48가닥 돈모가 획 방향을 따라 갈라지며 입체 물감 결을 남깁니다.",
      en: "48 directional hog bristles split along the stroke with subtle impasto ridges.",
    },
    baseWidth: 17,
  },
  {
    id: "gpen",
    name: { ko: "G펜", en: "G-Pen" },
    badge: { ko: "강약 탄성 먹선", en: "Elastic Ink Taper" },
    feelNote: {
      ko: "시작과 끝은 날카롭게 빠지고 허리에서 탄성 있게 굵어지는 웹툰 주선 펜입니다.",
      en: "Razor entry and exit tapers with an elastic belly tuned for webtoon inking.",
    },
    baseWidth: 4.8,
  },
] as const;

export interface ComparisonModeSpec {
  readonly id: ComparisonModeId;
  readonly label: BilingualText;
  readonly beforeLabel: BilingualText;
  readonly afterLabel: BilingualText;
  readonly beforeDetail: BilingualText;
  readonly afterDetail: BilingualText;
  readonly takeaway: BilingualText;
}

export const COMPARISON_MODES: readonly ComparisonModeSpec[] = [
  {
    id: "brush",
    label: { ko: "물리 브러시 · 광학 혼색", en: "Physical Brush & Optical Mix" },
    beforeLabel: { ko: "일반 디지털 원형 브러시", en: "Standard Round Digital Brush" },
    afterLabel: { ko: "ToonStudio 물리 종이결 + 광학 혼색", en: "ToonStudio Paper Tooth + Optical Mix" },
    beforeDetail: {
      ko: "매끈한 원형 도장 반복 · 파랑+노랑 RGB 혼합 시 탁한 회색화",
      en: "Flat circular stamp repeat · RGB blue + yellow turns muddy gray",
    },
    afterDetail: {
      ko: "2층 종이결 흑연 입자 · 쿠벨카-문크 파랑+노랑=맑은 초록 혼색",
      en: "2-layer paper grain · Kubelka-Munk optical blue + yellow = vivid green",
    },
    takeaway: {
      ko: "디지털 선 위에 아날로그 종이 저항과 광학 안료 깊이를 그대로 얹습니다.",
      en: "Brings real paper resistance and optical pigment depth straight to your strokes.",
    },
  },
  {
    id: "npr3d",
    label: { ko: "3D 메쉬 → 웹툰 NPR", en: "3D Mesh → Webtoon NPR" },
    beforeLabel: { ko: "일반 3D 메쉬", en: "Raw 3D Mesh" },
    afterLabel: { ko: "웹툰 NPR 가변 윤곽선 + 2D 색감 매칭", en: "Webtoon NPR Variable Ink + 2D Color Match" },
    beforeDetail: {
      ko: "균일한 기계선과 회색 쉐이딩으로 2D 캐릭터와 이질감 발생",
      en: "Uniform mechanical edges and sterile shading clash with 2D line art",
    },
    afterDetail: {
      ko: "필압형 가변 잉크 윤곽선 + 장면 팔레트 2D 톤 자동 정합",
      en: "Pressure-style variable ink silhouettes matched to your 2D scene palette",
    },
    takeaway: {
      ko: "3D 배치 직후 수동 리터칭 없이 바로 2D 원고에 녹아드는 배경을 뽑습니다.",
      en: "Turns blocked 3D rooms into ink-matched webtoon panels without heavy redrawing.",
    },
  },
  {
    id: "qa",
    label: { ko: "원고 번짐 → 자동 QA 클린업", en: "Raw Art → Auto-QA Cleanup" },
    beforeLabel: { ko: "핀홀 · 번짐 원고", en: "Pinholes & Bleed Manuscript" },
    afterLabel: { ko: "자동 QA 클린업 원고", en: "Auto-QA Cleaned Manuscript" },
    beforeDetail: {
      ko: "미세 틈새 핀홀, 컷선 바깥 잉크 번짐, 재단 여백 침범 잔존",
      en: "Unfilled micro-pinholes, stray ink outside gutter, trim-margin bleed",
    },
    afterDetail: {
      ko: "핀홀 자동 마감 · 컷 외곽 번짐 제거 · 출고 규격 여백 자동 통과",
      en: "Auto-closed pinholes · trimmed gutter bleeds · export-safe margins verified",
    },
    takeaway: {
      ko: "마감 직전 눈으로 훑던 핀홀·번짐·여백 오류를 출고 전 자동으로 잡습니다.",
      en: "Catches pinholes, bleeds, and margin defects automatically before final export.",
    },
  },
] as const;

export interface FlagshipEngineCard {
  readonly id: string;
  readonly number: string;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly specTag: BilingualText;
  readonly cta: BilingualText;
  readonly href: string;
}

export const FLAGSHIP_ENGINES: readonly FlagshipEngineCard[] = [
  {
    id: "physical-brush",
    number: "01",
    title: { ko: "실물 물리 브러시 · 슥삭 필기음 · 필기감 FX", en: "Physical Brushes · Nib Audio · Tactile FX" },
    summary: {
      ko: "6B 2층 종이결, 쿠벨카-문크 광학 수채, 48돈모 유화, 속도 감응 펜촉 필기음까지 손끝에 맞춥니다.",
      en: "2-layer 6B paper tooth, Kubelka-Munk watercolor, 48-bristle oil, and velocity-reactive nib acoustics.",
    },
    specTag: { ko: "5종 물리 엔진 · 광학 혼색", en: "5 Physics Engines · Optical Mix" },
    cta: { ko: "캔버스에서 직접 긋기", en: "Draw in Canvas" },
    href: "/studio/canvas",
  },
  {
    id: "rust-wasm-webgpu",
    number: "02",
    title: { ko: "Rust + Wasm64 · WebGPU 제로카피 코어", en: "Rust + Wasm64 · WebGPU Zero-Copy Core" },
    summary: {
      ko: "대용량 세로 원고와 다중 레이어를 브라우저 안에서 64비트 메모리와 GPU 제로카피로 처리합니다.",
      en: "Handles tall webtoon scrolls and heavy layer stacks in-browser via Wasm64 and WebGPU zero-copy buffers.",
    },
    specTag: { ko: "Rust Wasm64 · WebGPU · OPFS", en: "Rust Wasm64 · WebGPU · OPFS" },
    cta: { ko: "기술 아키텍처 보기", en: "Explore Core Tech" },
    href: "/tech",
  },
  {
    id: "3d-hand-npr",
    number: "03",
    title: { ko: "15관절 3D 손 · 3D 표면 페인팅 · NPR 배경", en: "15-Joint 3D Hand · Surface Paint · NPR Scenes" },
    summary: {
      ko: "까다로운 손동작을 15관절로 잡고, 3D 표면 위에 바로 채색한 뒤 웹툰 가변 윤곽선으로 추출합니다.",
      en: "Articulate 15-joint hands, paint directly on 3D surfaces, and extract variable-width NPR comic lines.",
    },
    specTag: { ko: "15관절 리깅 · 가변 윤곽선 NPR", en: "15-Joint Rig · Variable NPR" },
    cta: { ko: "장면 제작 시작하기", en: "Start Scene Setup" },
    href: "/create",
  },
  {
    id: "auto-qa-collab",
    number: "04",
    title: { ko: "자동 QA · 비출력 레드라인 · 7단계 협업 결재", en: "Auto QA · Non-Print Redline · 7-Stage Sign-Off" },
    summary: {
      ko: "핀홀·번짐 자동 검수부터 인쇄에 안 찍히는 레드라인 피드백, 7단계 회차 결재까지 끊김 없이 잇습니다.",
      en: "Pair automated pinhole cleanup with non-printing redline notes and a 7-stage episode approval flow.",
    },
    specTag: { ko: "자동 클린업 · 비출력 레드라인", en: "Auto Cleanup · Non-Print Redline" },
    cta: { ko: "검수 캔버스 열기", en: "Open Review Canvas" },
    href: "/studio/canvas",
  },
  {
    id: "byot-c2pa-export",
    number: "05",
    title: { ko: "개방형 BYOT(CSP/PSD/Jira/Slack) & C2PA · 7대 플랫폼 출고", en: "Open BYOT (CSP/PSD/Jira/Slack) & C2PA · 7-Platform Export" },
    summary: {
      ko: "기존 도구와 파일·일정을 왕복 연동하고 C2PA 창작 진위 서명과 7대 플랫폼 규격 슬라이스를 한 번에 마칩니다.",
      en: "Round-trip existing tools and schedules, sign works with C2PA provenance, and slice for 7 major platforms.",
    },
    specTag: { ko: "BYOT 개방 연동 · C2PA · 7대 출고", en: "Open BYOT · C2PA · 7 Platforms" },
    cta: { ko: "도구 비교·호환 보기", en: "Compare & Check BYOT" },
    href: "/compare/studio",
  },
  {
    id: "novelcomics-motion",
    number: "06",
    title: { ko: "노블코믹스 각본→콘티 · 무빙툰 OTIO · 다이나믹 워크플로우", en: "Novel-Comics Script→Boards · Motion OTIO · Dynamic Workflow" },
    summary: {
      ko: "원작 텍스트를 컷별 콘티로 전개하고 OpenTimelineIO 기반 무빙툰 연출까지 작업실 흐름에 맞게 조합합니다.",
      en: "Break scripts into panel storyboards and drive OTIO motion-comic timelines inside a modular workspace.",
    },
    specTag: { ko: "각본→콘티 · OTIO 타임라인", en: "Script→Boards · OTIO Timeline" },
    cta: { ko: "전체 기능 지도 보기", en: "View Full Feature Map" },
    href: "/features",
  },
] as const;

export interface RoleFeatureShortcut {
  readonly label: BilingualText;
  readonly detail: BilingualText;
  readonly href: string;
}

export interface CreatorRolePreset {
  readonly id: CreatorRoleId;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly primaryCta: BilingualText;
  readonly primaryHref: string;
  readonly features: readonly [RoleFeatureShortcut, RoleFeatureShortcut, RoleFeatureShortcut, RoleFeatureShortcut];
}

export const CREATOR_ROLE_PRESETS: readonly CreatorRolePreset[] = [
  {
    id: "solo-author",
    title: { ko: "1인 웹툰 작가", en: "Solo Webtoon Artist" },
    summary: {
      ko: "콘티부터 선화, 자동 플랫팅, 마감 출고까지 혼자서 주간 연재 속도를 지키는 핵심 4종입니다.",
      en: "Four core tools that keep a solo weekly serialization moving from storyboard to final export.",
    },
    primaryCta: { ko: "1인 작가 워크스페이스 열기", en: "Launch Solo Workspace" },
    primaryHref: "/studio/canvas",
    features: [
      { label: { ko: "6B·G펜·수채 물리 캔버스", en: "6B · G-Pen · Watercolor Canvas" }, detail: { ko: "종이결 필기감과 광학 혼색", en: "Paper tooth & optical pigment" }, href: "/studio/canvas" },
      { label: { ko: "노블코믹스 각본→콘티", en: "Script to Storyboard" }, detail: { ko: "대본 컷 분할과 말풍선 초안", en: "Beat-to-panel layout draft" }, href: "/story-lab" },
      { label: { ko: "15관절 3D 손 · 빠른 포즈", en: "15-Joint Hand & Pose" }, detail: { ko: "어려운 구도 즉시 기준선 확보", en: "Instant gesture reference" }, href: "/studio/poser" },
      { label: { ko: "7대 플랫폼 규격 원클릭 출고", en: "7-Platform Export Pack" }, detail: { ko: "세로 슬라이스·여백 자동 검증", en: "Auto slice & margin checks" }, href: "/studio/publish" },
    ],
  },
  {
    id: "bg3d-assistant",
    title: { ko: "3D·배경 어시스턴트", en: "3D & Scene Assistant" },
    summary: {
      ko: "3D 공간 배치, 웹툰 NPR 가변 윤곽선 변환, 2D 색감 매칭을 한 흐름으로 단축합니다.",
      en: "Unifies 3D room blocking, variable-width NPR line extraction, and 2D palette matching.",
    },
    primaryCta: { ko: "3D·NPR 스튜디오 열기", en: "Open 3D & NPR Studio" },
    primaryHref: "/studio/bg3d",
    features: [
      { label: { ko: "웹툰 NPR 가변 윤곽선 배경", en: "Webtoon NPR Background" }, detail: { ko: "카메라 구도별 필압형 선화 추출", en: "Camera-synced variable ink lines" }, href: "/studio/bg3d" },
      { label: { ko: "3D 표면 직접 페인팅", en: "3D Surface Painting" }, detail: { ko: "메쉬 위에 2D 브러시로 덧칠", en: "Paint 2D brushes on 3D meshes" }, href: "/create" },
      { label: { ko: "2D→3D 공간 리프트", en: "2D to 3D Scene Lift" }, detail: { ko: "스케치 구도를 입체 씬으로 전환", en: "Lift flat layouts into 3D space" }, href: "/studio/lift3d" },
      { label: { ko: "15관절 손·인체 포즈 리깅", en: "15-Joint Hand & Body Rig" }, detail: { ko: "작화용 군중·소품 구도 정리", en: "Crowd & prop blocking rig" }, href: "/studio/poser" },
    ],
  },
  {
    id: "studio-pd",
    title: { ko: "스튜디오 PD·검수", en: "Studio PD & QA Lead" },
    summary: {
      ko: "비출력 레드라인 첨삭, 7단계 결재 보드, 자동 QA 리포트로 회차 품질을 일관되게 관리합니다.",
      en: "Aligns episode quality with non-printing redlines, 7-stage approvals, and automated QA gates.",
    },
    primaryCta: { ko: "제작·결재 허브 열기", en: "Open Production Hub" },
    primaryHref: "/production",
    features: [
      { label: { ko: "7단계 회차 결재 보드", en: "7-Stage Episode Board" }, detail: { ko: "각본~출고 담당·마감 상태 추적", en: "Track owners & sign-offs per stage" }, href: "/production" },
      { label: { ko: "비출력 레드라인 첨삭", en: "Non-Print Redline Review" }, detail: { ko: "출고 파일에 안 남는 컷별 수정 지시", en: "Panel markups excluded on export" }, href: "/studio/canvas" },
      { label: { ko: "팀 역할·권한 관리", en: "Team Roles & Access" }, detail: { ko: "작가·어시·PD별 작업 권한 분리", en: "Scoped permissions per collaborator" }, href: "/team/people" },
      { label: { ko: "Jira·Slack BYOT 연동", en: "Jira & Slack BYOT Bridge" }, detail: { ko: "기존 사내 툴과 검수 상태 동기화", en: "Sync sign-offs with existing tools" }, href: "/compare/studio" },
    ],
  },
  {
    id: "global-export",
    title: { ko: "글로벌 번역·출고", en: "Global Localization & Export" },
    summary: {
      ko: "텍스트 레이어 분리 식자, C2PA 진위 서명, 7대 글로벌 플랫폼 규격 패키징을 한 번에 처리합니다.",
      en: "Pairs clean lettering layers with C2PA provenance and 7-platform export specs in one pass.",
    },
    primaryCta: { ko: "연재·출고 센터 열기", en: "Open Export Center" },
    primaryHref: "/studio/publish",
    features: [
      { label: { ko: "7대 플랫폼 규격 자동 슬라이스", en: "7-Platform Auto Slicer" }, detail: { ko: "해상도·용량·여백 규정 자동 검산", en: "Validates size, width & bleed specs" }, href: "/studio/publish" },
      { label: { ko: "C2PA 창작 진위 · 권리 BOM", en: "C2PA & Rights BOM" }, detail: { ko: "폰트·소재 라이선스와 원본 증명", en: "Audit fonts, assets & provenance" }, href: "/compare/studio" },
      { label: { ko: "PDF 원고 합치기·분할", en: "PDF Manuscript Workbench" }, detail: { ko: "단행본·제안서 PDF 로컬 편집", en: "Local PDF merge, reorder & split" }, href: "/studio/pdf-workbench" },
      { label: { ko: "무빙툰 OTIO 예고편 출력", en: "Motion OTIO Trailer Export" }, detail: { ko: "글로벌 홍보용 컷 모션 영상화", en: "Turn panels into localized trailers" }, href: "/studio/motion-webtoon" },
    ],
  },
] as const;

export interface TimeMachineStage {
  readonly step: number;
  readonly code: string;
  readonly title: BilingualText;
  readonly engine: BilingualText;
  readonly summary: BilingualText;
  readonly outputArtifact: BilingualText;
  readonly href: string;
}

export const TIMEMACHINE_STAGES: readonly TimeMachineStage[] = [
  {
    step: 1,
    code: "01",
    title: { ko: "각본/콘티", en: "Script / Boards" },
    engine: { ko: "노블코믹스 각본 분할기", en: "Novel-Comics Beat Splitter" },
    summary: { ko: "소설·시나리오 장면을 세로 스크롤 리듬에 맞춘 컷별 콘티와 대사 슬롯으로 전개합니다.", en: "Maps prose scenes into vertical-scroll panel beats and speech slots." },
    outputArtifact: { ko: "컷 구성표 · 말풍선 초안", en: "Panel Beat Sheet & Balloons" },
    href: "/story-lab",
  },
  {
    step: 2,
    code: "02",
    title: { ko: "선화", en: "Line Art" },
    engine: { ko: "G펜 · 6B 연필 물리 엔진", en: "G-Pen & 6B Physics Engine" },
    summary: { ko: "120Hz 저지연 펜 입력과 탄성 G펜·종이결 흑연으로 깔끔한 주선을 긋습니다.", en: "Inks crisp outlines with low-latency input, elastic G-Pen, and 6B tooth." },
    outputArtifact: { ko: "벡터·래스터 정밀 선화 레이어", en: "Clean Vector/Raster Line Layer" },
    href: "/studio/canvas",
  },
  {
    step: 3,
    code: "03",
    title: { ko: "자동 플랫팅", en: "Auto Flatting" },
    engine: { ko: "틈새 보정 영역 분할 엔진", en: "Gap-Aware Region Flatter" },
    summary: { ko: "열린 선화 틈을 닫아 인물·의상·소품 밑색 마스크를 빠르고 균일하게 분리합니다.", en: "Closes hairline gaps to separate crisp character and prop base masks." },
    outputArtifact: { ko: "오브젝트별 밑색 ID 마스크", en: "Object-Indexed Flat Masks" },
    href: "/studio/canvas",
  },
  {
    step: 4,
    code: "04",
    title: { ko: "물리 채색", en: "Physical Color" },
    engine: { ko: "쿠벨카-문크 수채 · 48돈모 유화", en: "Kubelka-Munk & 48-Bristle Oil" },
    summary: { ko: "파랑+노랑=초록 광학 수채와 48돈모 유화 결로 살아 있는 명암과 분위기를 얹습니다.", en: "Layers optical watercolor mixes and 48-bristle impasto lighting." },
    outputArtifact: { ko: "광학 혼색 채색·조명 레이어", en: "Optical Color & Lighting Pass" },
    href: "/studio/canvas",
  },
  {
    step: 5,
    code: "05",
    title: { ko: "3D 배경", en: "3D Backgrounds" },
    engine: { ko: "15관절 손 · NPR 가변 윤곽선", en: "15-Joint Hand & Variable NPR" },
    summary: { ko: "3D 실내외 배경과 15관절 포즈를 배치해 2D 색감과 가변 선화로 즉시 합칩니다.", en: "Places 3D rooms and 15-joint hands, rendered with ink-matched NPR lines." },
    outputArtifact: { ko: "2D 톤 정합 NPR 배경 컷", en: "2D-Matched NPR Background Cut" },
    href: "/studio/bg3d",
  },
  {
    step: 6,
    code: "06",
    title: { ko: "자동 QA", en: "Auto QA" },
    engine: { ko: "핀홀 클린업 · 비출력 레드라인", en: "Pinhole Cleanup & Redline Gate" },
    summary: { ko: "핀홀·번짐·오타 영역을 점검하고 비출력 레드라인으로 PD 결재를 완료합니다.", en: "Scans pinholes and margin bleeds while keeping PD redline sign-offs non-printing." },
    outputArtifact: { ko: "QA 통과 리포트 · 결재 이력", en: "QA Pass Report & Sign-Off Log" },
    href: "/production",
  },
  {
    step: 7,
    code: "07",
    title: { ko: "7대 플랫폼 출고", en: "7-Platform Export" },
    engine: { ko: "C2PA 서명 · 규격 자동 슬라이서", en: "C2PA Signer & Multi-Platform Slicer" },
    summary: { ko: "C2PA 창작 진위와 권리 BOM을 묶어 7대 연재 플랫폼 규격으로 한 번에 출력합니다.", en: "Attaches C2PA provenance and Rights BOM, slicing bundles for 7 platforms at once." },
    outputArtifact: { ko: "플랫폼별 ZIP · C2PA 매니페스트", en: "Platform Bundles & C2PA Manifest" },
    href: "/studio/publish",
  },
] as const;

export interface ByotToolSpec {
  readonly id: ByotToolId;
  readonly name: string;
  readonly category: BilingualText;
}

export const BYOT_TOOLS: readonly ByotToolSpec[] = [
  { id: "csp", name: "Clip Studio", category: { ko: "작화", en: "Drawing" } },
  { id: "photoshop", name: "Photoshop", category: { ko: "후보정", en: "Post" } },
  { id: "blender", name: "Blender", category: { ko: "3D", en: "3D" } },
  { id: "jira", name: "Jira", category: { ko: "이슈", en: "Tracking" } },
  { id: "slack", name: "Slack", category: { ko: "알림", en: "Comms" } },
  { id: "sheets", name: "Google Sheets", category: { ko: "일정표", en: "Schedule" } },
] as const;

export interface ByotRecommendation {
  readonly headline: BilingualText;
  readonly summary: BilingualText;
  readonly bridges: readonly BilingualText[];
  readonly ctaLabel: BilingualText;
  readonly ctaHref: string;
}

export function recommendByotStack(selected: readonly ByotToolId[]): ByotRecommendation {
  const has = (id: ByotToolId) => selected.includes(id);
  const bridges: BilingualText[] = [];

  if (has("csp") || has("photoshop")) {
    bridges.push({
      ko: "PSD·CLIP 레이어 구조 왕복 불러오기 → ToonStudio 자동 QA·플랫팅·7대 플랫폼 슬라이스 연결",
      en: "Round-trip PSD/CLIP layer stacks into ToonStudio Auto-QA, flatting, and 7-platform slicing",
    });
  }
  if (has("blender")) {
    bridges.push({
      ko: "Blender GLB·씬 모델 직수입 → 웹툰 NPR 가변 윤곽선·2D 팔레트 매칭 자동 적용",
      en: "Import Blender GLB scenes directly for variable-width NPR outlines and 2D palette matching",
    });
  }
  if (has("jira") || has("slack")) {
    bridges.push({
      ko: "7단계 결재·비출력 레드라인 상태 변경을 Jira 티켓·Slack 채널 알림과 양방향 동기화",
      en: "Sync 7-stage approvals and redline status changes straight to Jira tickets and Slack alerts",
    });
  }
  if (has("sheets")) {
    bridges.push({
      ko: "Google Sheets 회차·마감표 CSV/API 매핑 → 스튜디오 제작 보드 일정 자동 반영",
      en: "Map Google Sheets episode schedules directly onto the ToonStudio production timeline",
    });
  }

  if (bridges.length === 0) {
    return {
      headline: { ko: "설치 없는 순수 올인원 ToonStudio 구성", en: "Zero-Install All-in-One ToonStudio Stack" },
      summary: {
        ko: "외부 툴을 따로 켜지 않아도 각본·물리 작화·3D NPR·검수·출고까지 브라우저 한 탭으로 완결됩니다.",
        en: "Run script, physical brushes, 3D NPR, QA, and multi-platform export in one browser tab.",
      },
      bridges: [
        { ko: "OPFS + SQLite WASM 로컬 자동 저장 · 오프라인 즉시 복구", en: "OPFS + SQLite WASM local durability with offline instant recovery" },
        { ko: "C2PA 창작 진위 서명 · 7대 플랫폼 원클릭 패키지 출고", en: "Built-in C2PA provenance signing and 7-platform export packaging" },
      ],
      ctaLabel: { ko: "빈 캔버스 바로 열기", en: "Open Canvas Now" },
      ctaHref: "/studio/canvas",
    };
  }

  const prefersProduction = (has("jira") || has("slack") || has("sheets")) && !has("csp") && !has("photoshop") && !has("blender");
  return {
    headline: {
      ko: `선택한 ${selected.length}개 외부 툴 + ToonStudio 하이브리드 조합`,
      en: `Hybrid ToonStudio Bridge for ${selected.length} Selected Tool${selected.length > 1 ? "s" : ""}`,
    },
    summary: {
      ko: "기존 팀이 익숙한 툴을 버리지 않고, 병목 구간만 ToonStudio 물리 엔진·NPR·자동 QA로 교체합니다.",
      en: "Keep the tools your team already knows and plug ToonStudio into your biggest production bottlenecks.",
    },
    bridges,
    ctaLabel: prefersProduction
      ? { ko: "제작 협업 허브 살펴보기", en: "Explore Production Hub" }
      : { ko: "BYOT 호환·비교 상세 보기", en: "View Full BYOT Comparison" },
    ctaHref: prefersProduction ? "/production" : "/compare/studio",
  };
}

export interface AtlasFeatureItem {
  readonly id: string;
  readonly domainId: AtlasDomainId;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly keywords: readonly string[];
  readonly href: string;
}

export interface AtlasDomainGroup {
  readonly id: AtlasDomainId;
  readonly code: string;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly items: readonly [AtlasFeatureItem, AtlasFeatureItem, AtlasFeatureItem, AtlasFeatureItem];
}

/** 6대 영역 × 4개 핵심 기능 = 24개 핵심 기능 아틀라스 정본 */
export const FEATURE_ATLAS_DOMAINS: readonly AtlasDomainGroup[] = [
  {
    id: "physical-brush",
    code: "01",
    title: { ko: "실물 물리 브러시 · 필기감", en: "Physical Brushes & Feel" },
    summary: { ko: "종이결·광학 혼색·돈모·펜촉 필기음", en: "Paper tooth, optical pigment, bristles & acoustics" },
    items: [
      { id: "atlas-pencil6b", domainId: "physical-brush", title: { ko: "6B 연필 · 2층 종이결", en: "6B Pencil · 2-Layer Tooth" }, summary: { ko: "미세 섬유와 거친 종이결 두 층이 흑연을 잡는 스케치", en: "Dual-layer graphite grain reacting to pen pressure" }, keywords: ["6B", "연필", "종이결", "pencil", "tooth", "sketch"], href: "/studio/canvas" },
      { id: "atlas-km-watercolor", domainId: "physical-brush", title: { ko: "쿠벨카-문크 광학 수채", en: "Kubelka-Munk Watercolor" }, summary: { ko: "파랑+노랑=초록 감산 광학 안료 혼색 엔진", en: "Subtractive optical blending where blue + yellow makes green" }, keywords: ["수채", "쿠벨카", "광학", "혼색", "watercolor", "kubelka", "pigment"], href: "/studio/canvas" },
      { id: "atlas-oil-gpen", domainId: "physical-brush", title: { ko: "48돈모 유화 · 탄성 G펜", en: "48-Bristle Oil & Elastic G-Pen" }, summary: { ko: "갈라지는 48가닥 돈모 결과 날카로운 웹툰 주선 펜", en: "Split 48-bristle impasto paired with tapered manga inking" }, keywords: ["유화", "돈모", "G펜", "크레파스", "oil", "bristle", "gpen", "crayon"], href: "/studio/canvas" },
      { id: "atlas-nib-fx", domainId: "physical-brush", title: { ko: "슥삭 필기음 · 브러시 랩", en: "Nib Audio FX & Brush Lab" }, summary: { ko: "속도·필압에 반응하는 펜촉 사운드와 커스텀 브러시 제작", en: "Velocity-reactive paper acoustics and custom brush tuning" }, keywords: ["필기음", "슥삭", "사운드", "브러시", "audio", "nib", "fx", "brush"], href: "/studio/assets/brushes/new" },
    ],
  },
  {
    id: "rust-webgpu",
    code: "02",
    title: { ko: "Rust + Wasm64 · WebGPU 코어", en: "Rust + Wasm64 · WebGPU Core" },
    summary: { ko: "제로카피 렌더·로컬 내구성·저지연 엔진", en: "Zero-copy rendering, local durability & low latency" },
    items: [
      { id: "atlas-rust-wasm64", domainId: "rust-webgpu", title: { ko: "Rust + Wasm64 메모리 코어", en: "Rust + Wasm64 Memory Core" }, summary: { ko: "초장편 세로 원고도 64비트 메모리 공간에서 안정 구동", en: "64-bit native-speed Rust raster engine inside the browser" }, keywords: ["Rust", "Wasm64", "메모리", "코어", "engine", "wasm"], href: "/tech" },
      { id: "atlas-webgpu-zerocopy", domainId: "rust-webgpu", title: { ko: "WebGPU 제로카피 파이프라인", en: "WebGPU Zero-Copy Pipeline" }, summary: { ko: "CPU↔GPU 복사 병목 없이 실시간 붓터치와 필터 합성", en: "Direct GPU buffer composition without copy stalls" }, keywords: ["WebGPU", "제로카피", "GPU", "렌더", "zero-copy", "shader"], href: "/tech" },
      { id: "atlas-opfs-sqlite", domainId: "rust-webgpu", title: { ko: "OPFS + SQLite WASM 로컬 저장", en: "OPFS + SQLite WASM Local Save" }, summary: { ko: "네트워크가 끊겨도 기기 안에 즉시 보존되는 원고 DB", en: "Offline-safe local storage authority in OPFS SQLite" }, keywords: ["OPFS", "SQLite", "오프라인", "저장", "offline", "local"], href: "/tech" },
      { id: "atlas-instant-canvas", domainId: "rust-webgpu", title: { ko: "무설치 120Hz 저지연 캔버스", en: "Zero-Install 120Hz Canvas" }, summary: { ko: "로그인·설치 대기 없이 브라우저에서 즉시 열리는 작업대", en: "Instant browser workspace tuned for 120Hz stylus input" }, keywords: ["120Hz", "저지연", "무설치", "캔버스", "latency", "canvas"], href: "/studio/canvas" },
    ],
  },
  {
    id: "scene-3d-npr",
    code: "03",
    title: { ko: "15관절 3D · 표면 페인팅 · NPR", en: "15-Joint 3D · Surface Paint · NPR" },
    summary: { ko: "3D 포즈·직접 채색·2D 색감 매칭 배경", en: "3D posing, mesh painting & 2D-matched NPR scenes" },
    items: [
      { id: "atlas-hand15", domainId: "scene-3d-npr", title: { ko: "15관절 3D 손 · 포즈 스튜디오", en: "15-Joint 3D Hand & Poser" }, summary: { ko: "손가락 마디와 원근을 정밀 조작해 작화 밑그림으로 활용", en: "Articulate every finger joint and camera angle for drawing" }, keywords: ["15관절", "손", "포즈", "3D", "hand", "pose", "rig"], href: "/studio/poser" },
      { id: "atlas-3d-surface", domainId: "scene-3d-npr", title: { ko: "3D 표면 페인팅 · 장면 시작", en: "3D Surface Paint & Scene Start" }, summary: { ko: "입체 오브젝트 표면에 바로 칠하고 컷 구도를 결정", en: "Paint strokes onto 3D geometry while blocking the shot" }, keywords: ["3D 표면", "페인팅", "구도", "surface", "paint", "create"], href: "/create" },
      { id: "atlas-npr-bg", domainId: "scene-3d-npr", title: { ko: "웹툰 NPR 가변 윤곽선 배경", en: "Webtoon NPR Variable Outlines" }, summary: { ko: "일반 3D 메쉬를 강약 있는 2D 잉크선과 색감으로 변환", en: "Converts 3D architecture into variable comic ink and 2D tones" }, keywords: ["NPR", "윤곽선", "배경", "색감", "background", "outline", "bg3d"], href: "/studio/bg3d" },
      { id: "atlas-lift3d", domainId: "scene-3d-npr", title: { ko: "2D→3D 공간 리프트", en: "2D-to-3D Scene Lift" }, summary: { ko: "평면 스케치·레퍼런스를 3D 카메라 공간으로 일으키기", en: "Lift flat reference compositions into navigable 3D scenes" }, keywords: ["리프트", "2D", "3D", "공간", "lift3d", "perspective"], href: "/studio/lift3d" },
    ],
  },
  {
    id: "qa-collab",
    code: "04",
    title: { ko: "자동 QA · 레드라인 · 7단계 결재", en: "Auto QA · Redline · 7-Stage Flow" },
    summary: { ko: "품질 자동 검수·비출력 첨삭·팀 협업", en: "Automated cleanup, non-print notes & team sign-offs" },
    items: [
      { id: "atlas-auto-qa", domainId: "qa-collab", title: { ko: "핀홀 · 번짐 자동 QA 클린업", en: "Pinhole & Bleed Auto QA" }, summary: { ko: "채색 빈 구멍과 컷 바깥 잉크 번짐을 출고 전 자동 보정", en: "Detects and closes micro-pinholes and stray gutter bleeds" }, keywords: ["자동 QA", "핀홀", "번짐", "클린업", "qa", "pinhole", "cleanup"], href: "/studio/canvas" },
      { id: "atlas-redline", domainId: "qa-collab", title: { ko: "비출력 레드라인 첨삭 레이어", en: "Non-Printing Redline Layer" }, summary: { ko: "수정 지시만 겹쳐 보고 최종 내보내기에서는 자동 제외", en: "Review notes stay visible to the team and excluded on export" }, keywords: ["레드라인", "비출력", "첨삭", "redline", "review", "feedback"], href: "/studio/canvas" },
      { id: "atlas-7stage", domainId: "qa-collab", title: { ko: "7단계 회차 제작 결재 보드", en: "7-Stage Episode Approval Board" }, summary: { ko: "콘티→선화→플랫팅→채색→3D→QA→출고 단계별 승인", en: "Track and sign off all 7 webtoon production stages" }, keywords: ["7단계", "결재", "제작", "보드", "production", "approval"], href: "/production" },
      { id: "atlas-team-roles", domainId: "qa-collab", title: { ko: "팀 권한 · 스튜디오 협업 공간", en: "Team Permissions & Collab" }, summary: { ko: "작가·어시스턴트·PD 역할을 분리한 안전 공동 작업", en: "Role-scoped collaboration for artists, assistants, and PDs" }, keywords: ["팀", "협업", "권한", "team", "roles", "collab"], href: "/team/people" },
    ],
  },
  {
    id: "byot-export",
    code: "05",
    title: { ko: "개방형 BYOT · C2PA · 7대 출고", en: "Open BYOT · C2PA · 7-Platform Export" },
    summary: { ko: "외부 툴 왕복·진위 증명·플랫폼 패키징", en: "External tool bridges, provenance & delivery" },
    items: [
      { id: "atlas-byot-art", domainId: "byot-export", title: { ko: "CSP · Photoshop 왕복 호환", en: "CSP & Photoshop Round-Trip" }, summary: { ko: "기존 .psd·.clip 레이어 작업물과 자연스럽게 이어 작업", en: "Exchange layered manuscripts with Clip Studio and Photoshop" }, keywords: ["BYOT", "CSP", "Clip Studio", "Photoshop", "PSD", "호환"], href: "/compare/studio" },
      { id: "atlas-byot-ops", domainId: "byot-export", title: { ko: "Jira · Slack · Sheets 운영 연동", en: "Jira · Slack · Sheets Sync" }, summary: { ko: "사내 이슈 트래커와 메신저·일정표에 제작 상태 연결", en: "Connect episode status directly to Jira, Slack, and Sheets" }, keywords: ["Jira", "Slack", "Sheets", "연동", "BYOT", "webhook"], href: "/compare/studio" },
      { id: "atlas-c2pa-bom", domainId: "byot-export", title: { ko: "C2PA 창작 진위 · 권리 BOM", en: "C2PA Provenance & Rights BOM" }, summary: { ko: "사용 소재 라이선스 자동 검사와 C2PA 진위 서명 첨부", en: "Verify asset licenses and sign final exports with C2PA" }, keywords: ["C2PA", "권리", "BOM", "라이선스", "provenance", "rights"], href: "/compare/studio" },
      { id: "atlas-7platform", domainId: "byot-export", title: { ko: "7대 웹툰 플랫폼 규격 출고", en: "7-Platform Spec Packaging" }, summary: { ko: "네이버·카카오·글로벌 규격에 맞춘 자동 세로 슬라이스", en: "Auto-slice and validate bundles for 7 major webtoon platforms" }, keywords: ["7대 플랫폼", "출고", "슬라이스", "연재", "publish", "export"], href: "/studio/publish" },
    ],
  },
  {
    id: "workflow-learn",
    code: "06",
    title: { ko: "노블코믹스 · 무빙툰 · 클래스룸", en: "Novel-Comics · Motion · Classroom" },
    summary: { ko: "각본 전개·OTIO 연출·전체 기능·학습", en: "Script adaptation, OTIO motion & guided learning" },
    items: [
      { id: "atlas-novelcomics", domainId: "workflow-learn", title: { ko: "노블코믹스 각본 → 콘티", en: "Novel-Comics Script → Boards" }, summary: { ko: "웹소설 원문을 컷 단위 연출과 대사 시트로 빠르게 전환", en: "Adapt prose chapters into beat-by-beat comic storyboards" }, keywords: ["노블코믹스", "각본", "콘티", "스토리", "script", "storyboard"], href: "/story-lab" },
      { id: "atlas-motion-otio", domainId: "workflow-learn", title: { ko: "무빙툰 OTIO 타임라인", en: "Motion Webtoon OTIO Timeline" }, summary: { ko: "OpenTimelineIO 기반 컷 카메라 무브·자막·예고편 출력", en: "Animate panels with OTIO timelines, camera moves, and captions" }, keywords: ["무빙툰", "OTIO", "모션", "타임라인", "motion", "video"], href: "/studio/motion-webtoon" },
      { id: "atlas-dynamic-features", domainId: "workflow-learn", title: { ko: "다이나믹 워크플로우 · 전체 지도", en: "Dynamic Workflow & Feature Map" }, summary: { ko: "기획부터 홍보까지 연결된 ToonStudio 전체 역량 탐색", en: "Browse every connected ToonStudio capability by stage" }, keywords: ["워크플로우", "기능", "아틀라스", "workflow", "features"], href: "/features" },
      { id: "atlas-classroom", domainId: "workflow-learn", title: { ko: "웹툰 제작 클래스룸", en: "Webtoon Craft Classroom" }, summary: { ko: "선화·채색·3D NPR·출고 실전 강좌를 작업하며 익히기", en: "Hands-on step-by-step courses across drawing, 3D, and export" }, keywords: ["클래스룸", "강좌", "배우기", "classroom", "learn", "course"], href: "/learn/classroom" },
    ],
  },
] as const;

export const ALL_ATLAS_FEATURES: readonly AtlasFeatureItem[] = FEATURE_ATLAS_DOMAINS.flatMap((domain) => domain.items);

export function filterAtlasDomains(
  query: string,
  activeDomain: AtlasDomainId | "all",
): readonly { readonly domain: AtlasDomainGroup; readonly items: readonly AtlasFeatureItem[] }[] {
  const normalized = query.trim().toLowerCase();
  const result: { readonly domain: AtlasDomainGroup; readonly items: readonly AtlasFeatureItem[] }[] = [];

  for (const domain of FEATURE_ATLAS_DOMAINS) {
    if (activeDomain !== "all" && domain.id !== activeDomain) continue;
    const matched = normalized.length === 0
      ? domain.items
      : domain.items.filter((item) => {
        const haystack = [
          item.title.ko,
          item.title.en,
          item.summary.ko,
          item.summary.en,
          domain.title.ko,
          domain.title.en,
          ...item.keywords,
        ].join(" ").toLowerCase();
        return haystack.includes(normalized);
      });
    if (matched.length > 0) result.push({ domain, items: matched });
  }

  return result;
}
