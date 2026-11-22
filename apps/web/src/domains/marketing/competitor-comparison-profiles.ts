/**
 * ToonStudio vs 주요 제작·협업·소재 도구 7종 비교 정본 데이터 (`/about/compare`).
 *
 * 작성 원칙 (2026-11-22 코드·문서 실측 기준):
 * - 허위 벤치마크(임의 FPS·속도 배수·설문 비율)나 검증되지 않은 경쟁사 원화 단가를 지어내지 않는다.
 * - ToonStudio의 모든 기능 셀은 실제 저장소 소스·테스트·감사 문서를 `evidence`로 연결하며,
 *   `current`(현재 구현) · `partial`(전환·검증 중) · `target`(향후 목표)을 구분한다.
 * - 경쟁사 강점(`native-strength`)을 축소하거나 숨기지 않고, 창작자 상황별 객관적 선택 가이드를 함께 제공한다.
 */

export const COMPARISON_SNAPSHOT_DATE = "2026-11-22" as const;

export interface BilingualCopy {
  readonly ko: string;
  readonly en: string;
}

export type CompetitorId =
  | "toonstudio"
  | "csp"
  | "procreate"
  | "photoshop"
  | "rebelle"
  | "blender"
  | "creco"
  | "acon3d";

export type CompetitorFocusGroupId =
  | "all"
  | "webtoon-core"
  | "illustration-paint"
  | "scene-3d";

export type ComparisonAxisId =
  | "drawing-spectral"
  | "scene3d-vector"
  | "lettering-delivery"
  | "collab-offline"
  | "ux-cost";

export type CapabilityStatus =
  | "current"
  | "partial"
  | "target"
  | "native-strength"
  | "limited"
  | "none";

export interface CompetitorProfile {
  readonly id: CompetitorId;
  readonly name: string;
  readonly shortName: string;
  readonly role: BilingualCopy;
  readonly pricingModel: BilingualCopy;
  readonly platform: BilingualCopy;
  readonly primaryStrength: BilingualCopy;
  readonly interopWithToonStudio: BilingualCopy;
}

export interface ComparisonCell {
  readonly status: CapabilityStatus;
  readonly label: BilingualCopy;
  readonly detail: BilingualCopy;
}

export interface ComparisonEvidence {
  readonly maturity: "current" | "partial" | "target";
  readonly summary: BilingualCopy;
  readonly repoPaths: readonly string[];
}

export interface ComparisonCriterion {
  readonly id: string;
  readonly title: BilingualCopy;
  readonly summary: BilingualCopy;
  readonly cells: Readonly<Record<CompetitorId, ComparisonCell>>;
  readonly toonStudioEvidence: ComparisonEvidence;
}

export interface ComparisonAxis {
  readonly id: ComparisonAxisId;
  readonly order: number;
  readonly tabLabel: BilingualCopy;
  readonly title: BilingualCopy;
  readonly subtitle: BilingualCopy;
  readonly criteria: readonly ComparisonCriterion[];
  readonly whenToUseGuide: BilingualCopy;
}

export interface DecisionScenario {
  readonly id: string;
  readonly situation: BilingualCopy;
  readonly recommendedTools: readonly CompetitorId[];
  readonly reason: BilingualCopy;
  readonly coexistenceTip: BilingualCopy;
}

export interface CurrentVsTargetItem {
  readonly id: string;
  readonly area: BilingualCopy;
  readonly currentState: BilingualCopy;
  readonly targetState: BilingualCopy;
  readonly repoPaths: readonly string[];
}

const bi = (ko: string, en: string): BilingualCopy => ({ ko, en });

export const COMPETITOR_PROFILES: readonly CompetitorProfile[] = [
  {
    id: "toonstudio",
    name: "ToonStudio",
    shortName: "ToonStudio",
    role: bi("브라우저 네이티브 웹툰 제작 OS", "Browser-native webtoon production OS"),
    pricingModel: bi(
      "베타 전 기능 ₩0 (결제 비활성 · 정식 플랜 추후 고지)",
      "KRW 0 during beta (billing off · future tiers announced later)",
    ),
    platform: bi("데스크톱·태블릿·모바일 웹 (설치 불필요)", "Desktop, tablet & mobile web (no install)"),
    primaryStrength: bi(
      "2D 분광·3D·식자·분업 OS·Rights BOM 납품을 브라우저 단일 흐름으로 연결",
      "Unifies 2D spectral drawing, 3D sets, lettering, division OS & Rights BOM delivery in one browser flow",
    ),
    interopWithToonStudio: bi("정본 프로젝트(SQLite OPFS + PSD/GLB/VRM/SKP 입출력)", "Canonical workspace (SQLite OPFS + PSD/GLB/VRM/SKP I/O)"),
  },
  {
    id: "csp",
    name: "Clip Studio Paint",
    shortName: "CSP",
    role: bi("만화·웹툰 프로 드로잉 표준", "Industry standard for manga & webtoon drawing"),
    pricingModel: bi(
      "월·연 구독 또는 PC 일시불 영구 라이선스(PRO/EX · 공식가 확인)",
      "Subscription or desktop one-time license (PRO/EX · check vendor pricing)",
    ),
    platform: bi("Windows · macOS · iPad · Android", "Windows · macOS · iPad · Android"),
    primaryStrength: bi(
      "10년+ 검증된 필압 엔진, 방대한 ASSETS 소재 마켓, 완성도 높은 벡터 선화·LT 변환",
      "Decade-proven pen feel, massive ASSETS ecosystem, mature vector lineart & LT conversion",
    ),
    interopWithToonStudio: bi("PSD 레이어·ABR 브러시 가져오기 및 PNG/PSD 왕복", "PSD layer & ABR brush import plus PNG/PSD round-trip"),
  },
  {
    id: "procreate",
    name: "Procreate",
    shortName: "Procreate",
    role: bi("iPad 터치·제스처 일러스트 표준", "iPad touch & gesture illustration standard"),
    pricingModel: bi(
      "iPad 앱 1회 구매 (구독 없음 · 공식 App Store 확인)",
      "One-time iPad purchase (no subscription · check App Store)",
    ),
    platform: bi("iPadOS 전용", "iPadOS only"),
    primaryStrength: bi(
      "Apple Pencil 초저지연 반응성, 단순한 터치 제스처, QuickShape·ColorDrop 직관성",
      "Ultra-low Apple Pencil latency, clean touch gestures, iconic QuickShape & ColorDrop",
    ),
    interopWithToonStudio: bi("PSD·PNG 내보내기 후 ToonStudio 원고·식자·출고 연결", "Export PSD/PNG into ToonStudio for lettering & delivery"),
  },
  {
    id: "photoshop",
    name: "Adobe Photoshop",
    shortName: "Photoshop",
    role: bi("래스터 합성·색보정·출판 표준", "Raster compositing, color grading & print standard"),
    pricingModel: bi(
      "Creative Cloud 월·연 정기 구독 (공식 플랜 확인)",
      "Creative Cloud subscription (check Adobe plans)",
    ),
    platform: bi("Windows · macOS · iPad · Web(일부)", "Windows · macOS · iPad · Web (partial)"),
    primaryStrength: bi(
      "정밀 색보정·CMYK 인쇄·스마트 오브젝트·포토 배싱·에이전시 PSD 표준",
      "Precision color grading, CMYK print, Smart Objects, photobashing & agency PSD standard",
    ),
    interopWithToonStudio: bi("ag-psd 기반 PSD 가져오기·후보정 왕복 지원", "ag-psd based PSD import & finishing round-trip"),
  },
  {
    id: "rebelle",
    name: "Rebelle",
    shortName: "Rebelle",
    role: bi("물리 수채·유화·안료 시뮬레이션 특화", "Physical watercolor, oil & pigment simulation"),
    pricingModel: bi(
      "데스크톱 영구 라이선스(Standard/Pro · 버전 업그레이드 별도)",
      "Desktop perpetual license (Standard/Pro · paid major upgrades)",
    ),
    platform: bi("Windows · macOS", "Windows · macOS"),
    primaryStrength: bi(
      "실시간 중력 물 번짐, 종이 섬유질·건조·임파스토 유체 물리 품질 최상위",
      "Top-tier real-time gravity fluid diffusion, paper grain, drying & impasto physics",
    ),
    interopWithToonStudio: bi("고해상도 PNG/PSD 출력 후 컷 배경·표지 합성", "Export high-res PNG/PSD for covers & panel art"),
  },
  {
    id: "blender",
    name: "Blender",
    shortName: "Blender",
    role: bi("오픈소스 풀 3D DCC · 렌더러", "Open-source full 3D DCC & renderer"),
    pricingModel: bi(
      "오픈소스 무료 (GPL-2.0+ · 상용 작품 출력 무료)",
      "Free open source (GPL-2.0+ · commercial renders free)",
    ),
    platform: bi("Windows · macOS · Linux", "Windows · macOS · Linux"),
    primaryStrength: bi(
      "풀 폴리곤 모델링·스컬프팅·리깅·Grease Pencil·Cycles/EEVEE 렌더 깊이",
      "Full polygon modeling, sculpting, rigging, Grease Pencil & Cycles/EEVEE rendering",
    ),
    interopWithToonStudio: bi("GLB/FBX/OBJ 최대 1 GiB 로컬 임포트 및 브리지 연동", "Up to 1 GiB local GLB/FBX/OBJ import & bridge workflow"),
  },
  {
    id: "creco",
    name: "Creco",
    shortName: "Creco",
    role: bi("웹툰 제작 협업·일정·컨펌 관리", "Webtoon production management & review"),
    pricingModel: bi(
      "팀·스튜디오 좌석 기반 SaaS 구독 (공식 문의/플랜 확인)",
      "Team/studio seat-based SaaS subscription (check vendor)",
    ),
    platform: bi("웹 기반 협업 플랫폼", "Web-based collaboration platform"),
    primaryStrength: bi(
      "웹툰 제작사·에이전시 실무에 검증된 공정 관리·일정·피드백 운영",
      "Production-proven webtoon agency scheduling, status tracking & review operations",
    ),
    interopWithToonStudio: bi("원고 PNG/슬라이스 납품본 및 검수 기록 JSON 연계", "Interoperates via sliced episode deliverables & review logs"),
  },
  {
    id: "acon3d",
    name: "ACON3D",
    shortName: "ACON3D",
    role: bi("웹툰 3D 배경·소품 마켓플레이스", "Webtoon 3D background & prop marketplace"),
    pricingModel: bi(
      "3D 모델 건별 구매 · 개인/기업/다인 좌석 라이선스 차등",
      "Per-asset purchase with tiered personal/studio seat licenses",
    ),
    platform: bi("웹 마켓 (SketchUp .skp · Snaptoon 등)", "Web marketplace (SketchUp .skp, Snaptoon, etc.)"),
    primaryStrength: bi(
      "한국 웹툰 장르(로판·현대·사극·학교)에 바로 쓰는 방대한 상용 3D 배경 카탈로그",
      "Vast ready-to-use Korean webtoon 3D catalog (fantasy romance, modern, historical, school)",
    ),
    interopWithToonStudio: bi("구매한 .skp(최대 256 MiB)·GLB를 OpenSKP 워커로 로컬 임포트 + Rights BOM 기록", "Import owned .skp (up to 256 MiB) / GLB locally via OpenSKP worker + Rights BOM"),
  },
];

export const COMPETITOR_FOCUS_GROUPS: readonly {
  readonly id: CompetitorFocusGroupId;
  readonly label: BilingualCopy;
  readonly competitors: readonly CompetitorId[];
}[] = [
  {
    id: "all",
    label: bi("전체 7종", "All 7 tools"),
    competitors: ["csp", "procreate", "photoshop", "rebelle", "blender", "creco", "acon3d"],
  },
  {
    id: "webtoon-core",
    label: bi("웹툰 실무 주력 (CSP · Creco · ACON3D)", "Webtoon core (CSP · Creco · ACON3D)"),
    competitors: ["csp", "creco", "acon3d"],
  },
  {
    id: "illustration-paint",
    label: bi("작화·채색 (Procreate · Photoshop · Rebelle)", "Drawing & paint (Procreate · Photoshop · Rebelle)"),
    competitors: ["procreate", "photoshop", "rebelle"],
  },
  {
    id: "scene-3d",
    label: bi("3D 배경·에셋 (Blender · ACON3D · CSP)", "3D sets & assets (Blender · ACON3D · CSP)"),
    competitors: ["blender", "acon3d", "csp"],
  },
];

export const CAPABILITY_STATUS_META: Readonly<
  Record<CapabilityStatus, { readonly label: BilingualCopy; readonly tone: "good" | "cool" | "warn" | "neutral" }>
> = {
  current: { label: bi("현재 구현", "Current"), tone: "good" },
  partial: { label: bi("전환·검증 중", "In progress"), tone: "warn" },
  target: { label: bi("향후 목표", "Target"), tone: "cool" },
  "native-strength": { label: bi("핵심 강점", "Core strength"), tone: "cool" },
  limited: { label: bi("부분·보조", "Partial"), tone: "neutral" },
  none: { label: bi("영역 외", "Out of scope"), tone: "neutral" },
};


export const DECISION_SCENARIOS: readonly DecisionScenario[] = [
  {
    id: "solo-browser-end-to-end",
    situation: bi(
      "설치·구독 부담 없이 브라우저 하나로 콘티→작화→3D 배경→식자→플랫폼 납품까지 한 번에 끝내고 싶은 1인·예비 작가",
      "Solo or emerging creator wanting storyboard → drawing → 3D sets → lettering → platform delivery in one browser at KRW 0",
    ),
    recommendedTools: ["toonstudio"],
    reason: bi(
      "베타 기간 ₩0, 설치 없는 3초 진입, 7밴드 분광 KM 브러시, 1 GiB 로컬 3D/SKP, Knuth-Plass 타원 식자, Rights BOM + 4대 플랫폼 안전 슬라이스를 한 작업 흐름으로 제공합니다.",
      "Delivers KRW 0 beta access, 3-second launch, 7-band KM brushes, 1 GiB local 3D/SKP, Knuth-Plass lettering, Rights BOM & 4-platform safe slicing in one flow.",
    ),
    coexistenceTip: bi(
      "기존에 쓰던 PSD 원고나 구매한 ACON3D .skp 파일도 그대로 불러와 바로 이어서 작업할 수 있습니다.",
      "Import existing PSD drafts or owned ACON3D .skp backgrounds directly without restarting from scratch.",
    ),
  },
  {
    id: "pro-manga-ecosystems",
    situation: bi(
      "이미 수백 개의 .sut 브러시와 단축키가 손에 익었고, 오프라인 데스크톱 환경에서 초장편 주간 연재를 소화하는 현업 작가",
      "Veteran weekly serialized artist relying on hundreds of .sut brushes and mature desktop tablet habits",
    ),
    recommendedTools: ["csp", "toonstudio"],
    reason: bi(
      "주력 작화는 Clip Studio Paint의 성숙한 필압·ASSETS 생태계를 유지하고, 3D 조명 동기화·타원 식자 점검·Rights BOM 납품·어시스턴트 협업 검수만 ToonStudio로 보완하는 혼합 구성이 현실적입니다.",
      "Keep CSP for muscle-memory inking & ASSETS, while pairing ToonStudio for 3D light sync, Rights BOM preflight, safe slicing or web-based assistant review.",
    ),
    coexistenceTip: bi(
      "PSD 레이어와 PNG 컷을 그대로 왕복할 수 있어 도구 전면 교체 없이 필요한 공정만 선택 도입할 수 있습니다.",
      "Round-trip PSD layers and PNG panels so you adopt only the stages that save time.",
    ),
  },
  {
    id: "ipad-portable-sketch",
    situation: bi(
      "카페나 이동 중 iPad + Apple Pencil로 가볍게 러프·콘티·일러스트를 그리는 창작자",
      "Creator sketching roughs, storyboards or illustrations on the go with iPad + Apple Pencil",
    ),
    recommendedTools: ["procreate", "toonstudio"],
    reason: bi(
      "iPad 네이티브 120Hz 필기감과 최소 크롬 몰입감은 Procreate가 가장 쾌적합니다. 이후 말풍선 식자·3D 배경 배치·4대 플랫폼 분할 출고 단계에서 ToonStudio로 넘기면 iPad 한계를 메울 수 있습니다.",
      "Procreate leads in 120Hz Apple Pencil feel; hand off PSD/PNG to ToonStudio for 3D backgrounds, elliptical lettering & 4-platform slice export.",
    ),
    coexistenceTip: bi(
      "ToonStudio는 iPad Safari에서도 별도 설치 없이 바로 열려 급한 수정·검수 피드백을 즉시 처리할 수 있습니다.",
      "ToonStudio also opens right in iPad Safari for quick reviews and edits without extra installs.",
    ),
  },
  {
    id: "traditional-fluid-cover",
    situation: bi(
      "웹툰 표지·단행본 일러스트에서 실제 수채 번짐·유화 질감·CMYK 인쇄 후보정이 최우선인 작업",
      "Book covers & print illustrations prioritizing physical fluid watercolor/oil or CMYK prepress",
    ),
    recommendedTools: ["rebelle", "photoshop"],
    reason: bi(
      "실시간 중력 물 번짐과 종이 섬유 물리 재현은 Rebelle, CMYK 분판·고심도 색보정·출판 인쇄 스펙은 Photoshop이 검증된 전문 도구입니다.",
      "Rebelle leads in physical fluid/paper simulation, while Photoshop remains the standard for CMYK prepress and deep color grading.",
    ),
    coexistenceTip: bi(
      "완성된 표지·배경 원화를 ToonStudio 회차에 배치해 Rights BOM과 플랫폼 썸네일 규격까지 한 번에 관리하세요.",
      "Drop finished covers into ToonStudio to manage Rights BOM provenance and platform export specs.",
    ),
  },
  {
    id: "custom-3d-architecture",
    situation: bi(
      "판타지 성곽·SF 메카닉 등 독자적인 3D 배경을 직접 모델링하거나 기성 한국형 배경을 빠르게 사서 써야 하는 팀",
      "Teams modeling bespoke 3D worlds from scratch or buying ready-made Korean webtoon background packs",
    ),
    recommendedTools: ["blender", "acon3d", "toonstudio"],
    reason: bi(
      "오리지널 3D 모델링·스컬프팅은 Blender(무료), 시간 절약용 한국형 기성 배경은 ACON3D가 최강입니다. 확보한 GLB/.skp 자산을 ToonStudio에 로컬(최대 1 GiB / SKP 256 MiB)로 불러 컷 카메라와 2D 조명을 맞추면 왕복이 크게 줄어듭니다.",
      "Model bespoke sets in Blender (free) or buy Korean sets on ACON3D, then load those GLB/.skp files locally in ToonStudio (up to 1 GiB / 256 MiB) for cut framing & 2D light sync.",
    ),
    coexistenceTip: bi(
      "ACON3D 등 외부 구매 자산의 좌석·상업 조건은 ToonStudio Rights BOM에 영수증으로 남겨 출고 사고를 막습니다.",
      "Log ACON3D seat/commercial receipts in ToonStudio's Rights BOM to prevent licensing mistakes before release.",
    ),
  },
  {
    id: "small-team-division",
    situation: bi(
      "선화·채색·배경·식자 담당 2~6명이 메신저 파일 버전 꼬임과 외주 유출 걱정 없이 주간 연재를 굴리고 싶은 소규모 팀",
      "2–6 person webtoon team tired of chat-file mix-ups, version conflicts & freelance leak risks",
    ),
    recommendedTools: ["toonstudio", "creco"],
    reason: bi(
      "대형 에이전시의 다작 통합 운영은 Creco가 검증되어 있으며, 실제 드로잉 캔버스와 레이어 권한(RBAC)·컷 분할 리스·AD 레드라인·포렌식 워터마크·정산을 하나로 묶고 싶다면 ToonStudio 분업 OS가 직접적입니다.",
      "Creco is proven for multi-title agency ops, while ToonStudio Division OS binds layer RBAC, cut leases, AD redlines, forensic watermarks & settlement directly to the canvas.",
    ),
    coexistenceTip: bi(
      "현재 분업 OS는 기능 구현 완료·실제 제작팀 베타 실증 단계이므로 소규모 시범 회차로 먼저 검증한 뒤 확대하는 구성을 권합니다.",
      "Division OS is implemented and entering studio beta validation—start with a pilot episode before migrating an entire season.",
    ),
  },
];

export const CURRENT_VS_TARGET_BOUNDARIES: readonly CurrentVsTargetItem[] = [
  {
    id: "webgpu-primary-commit",
    area: bi("WebGPU 렌더링 권위", "WebGPU Rendering Authority"),
    currentState: bi(
      "7밴드 분광 KM Compute·버퍼 풀·HDR 디더링·Lanczos3 변형·컴퓨트 스크린톤 모듈 구현 완료. 기본 캔버스 커밋 권위는 fail-visible Canvas2D 유지.",
      "7-band KM Compute, buffer pool, HDR dithering, Lanczos3 warp & compute screentone implemented; fail-visible Canvas2D remains primary commit lane.",
    ),
    targetState: bi(
      "실기기 GPU 회귀 검증 통과 후 전용 WebGPU 브러시 런타임을 기본 1차(primary) 커밋 권위로 승격.",
      "Promote dedicated WebGPU brush runtime to primary commit authority after cross-GPU regression sign-off.",
    ),
    repoPaths: ["docs/engines/renderer-roles.md", "apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts"],
  },
  {
    id: "calm-atelier-consolidation",
    area: bi("Calm Atelier UI/UX v2 수렴", "Calm Atelier UI/UX v2 Convergence"),
    currentState: bi(
      "집중/심플/프로 3단계 밀도, 왼손잡이 미러, 야간 색온도 가드, 44×44px 터치 계약 동작. 상단 18개 메뉴 그룹 및 일부 레거시 경로 병존.",
      "Focus/simple/full density, lefty mirror, night comfort guard & 44×44px touch targets live; 18 legacy menu groups still consolidating.",
    ),
    targetState: bi(
      "단일 44px 컨텍스트 상단바 + 7대 표준 메뉴 + 82%+ 캔버스 시야 전수 수렴 및 모바일 한손 엄지 독 완성.",
      "Full convergence to single 44px context bar, 7 standard menus, 82%+ canvas viewport & mobile Thumb-Arc dock.",
    ),
    repoPaths: ["DESIGN.md", "PRODUCT.md"],
  },
  {
    id: "license-and-billing",
    area: bi("1인 기업 상용화 & 요금제 전환", "Solo-Founder Licensing & Billing Roadmap"),
    currentState: bi(
      "베타 전 기능 ₩0(결제 비활성), `audit:licenses` 590개 의존성 통과, mixbox 0건, 인프라 고정비 ₩0(도메인 제외).",
      "KRW 0 beta (billing off), 590-entry `audit:licenses` passing, 0 mixbox, KRW 0 cloud fixed cost (excluding domain).",
    ),
    targetState: bi(
      "베타 창작자 30명·심층 인터뷰 10명+ 검증 후 개인/팀 정식 요금 확정, OCCT LGPL 법무 확인 및 팀 4인 이상 전환 시 Remotion 라이선스 대응.",
      "Finalize paid tiers after 30 beta creators & 10+ interviews; complete OCCT LGPL legal sign-off and handle Remotion licensing at 4+ seats.",
    ),
    repoPaths: [
      "docs/legal/solo-founder-commercial-license-audit-20261122.md",
      "apps/web/src/app/routes/pricing-page.tsx",
      "docs/operations/infrastructure-map.md",
    ],
  },
];
