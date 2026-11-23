/**
 * ToonStudio vs 글로벌 제작 도구 6종 정직·투명 공개 스펙 벤치마크 데이터 (`/compare/studio`).
 *
 * 작성 원칙 (기준일 2026-11):
 * - 허위 벤치마크 수치(임의 FPS, 미실측 속도 배수, 가공 설문 비율, 추정 원화 환산가)를 쓰지 않는다.
 * - 타사의 공개 공식 문서·과금 구조와 검증된 강점(`native-strength`)을 숨기지 않고 그대로 기재한다.
 * - ToonStudio 기능은 현재 구현(`current`), 전환·검증 중(`partial`), 향후 목표(`target`)로 명확히 나눈다.
 */

export const STUDIO_BENCHMARK_SNAPSHOT = "2026-11" as const;
export const STUDIO_BENCHMARK_DATE = "2026-11-23" as const;

export interface BilingualText {
  readonly ko: string;
  readonly en: string;
}

export type BenchmarkToolId =
  | "toonstudio"
  | "csp"
  | "procreate"
  | "photoshop"
  | "rebelle7"
  | "blender"
  | "ibispaint";

export type BenchmarkStatus =
  | "current"
  | "partial"
  | "target"
  | "native-strength"
  | "limited"
  | "none";

export type CellGrade = "lead" | "strong" | "partial" | "limited" | "none";

export type BenchmarkAxisId =
  | "install-device"
  | "drawing-pigment"
  | "scene3d-vrm"
  | "webtoon-animatic"
  | "collab-local-db"
  | "rights-delivery"
  | "pricing-interop";

export type BenchmarkPersonaId =
  | "all"
  | "solo-webtoon"
  | "studio-team"
  | "mobile-illustrator"
  | "tech-director";

export interface BenchmarkToolProfile {
  readonly id: BenchmarkToolId;
  readonly name: string;
  readonly shortName: string;
  readonly category: BilingualText;
  readonly officialBilling: BilingualText;
  readonly platforms: BilingualText;
  readonly coreStrength: BilingualText;
  readonly interopPath: BilingualText;
}

export interface BenchmarkCell {
  readonly status: BenchmarkStatus;
  readonly badge: BilingualText;
  readonly note: BilingualText;
}

export interface BenchmarkAxis {
  readonly id: BenchmarkAxisId;
  readonly order: number;
  readonly shortLabel: BilingualText;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly toonStudioMaturity: "current" | "partial" | "target";
  readonly evidencePaths: readonly string[];
  readonly cells: Readonly<Record<BenchmarkToolId, BenchmarkCell>>;
}

export interface BenchmarkPersonaFilter {
  readonly id: Exclude<BenchmarkPersonaId, "all">;
  readonly label: BilingualText;
  readonly tagline: BilingualText;
  readonly priorityAxes: readonly BenchmarkAxisId[];
  readonly recommendedStack: readonly BenchmarkToolId[];
  readonly whyFit: BilingualText;
  readonly candidTradeoff: BilingualText;
}

export interface BenchmarkDeviceCard {
  readonly id: string;
  readonly spritePath: string;
  readonly name: BilingualText;
  readonly maturity: "current" | "partial" | "target";
  readonly webApi: string;
  readonly role: BilingualText;
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

function cell(
  status: BenchmarkStatus,
  badgeKo: string,
  badgeEn: string,
  noteKo: string,
  noteEn: string,
): BenchmarkCell {
  return { status, badge: bi(badgeKo, badgeEn), note: bi(noteKo, noteEn) };
}

export const BENCHMARK_STATUS_META: Readonly<
  Record<BenchmarkStatus, { readonly label: BilingualText; readonly toneClass: string }>
> = {
  current: { label: bi("현재 구현", "Current"), toneClass: "ts-status-good" },
  partial: { label: bi("전환·확장 중", "In progress"), toneClass: "ts-status-warn" },
  target: { label: bi("향후 목표", "Target"), toneClass: "ts-status-cool" },
  "native-strength": { label: bi("타사 강점", "Competitor strength"), toneClass: "ts-status-accent" },
  limited: { label: bi("제한·외부연동", "Limited / plugin"), toneClass: "ts-status-neutral" },
  none: { label: bi("미지원", "Not built-in"), toneClass: "ts-status-muted" },
};

export const BENCHMARK_TOOLS: readonly BenchmarkToolProfile[] = [
  {
    id: "toonstudio",
    name: "ToonStudio",
    shortName: "ToonStudio",
    category: bi("브라우저 네이티브 웹툰 제작 OS", "Browser-native webtoon production OS"),
    officialBilling: bi(
      "공개 베타 ₩0 (결제 비활성 · 정식 과금은 추후 고지)",
      "KRW 0 open beta (billing disabled · future plans announced later)",
    ),
    platforms: bi("Chrome·Safari·Edge 데스크톱/태블릿/모바일 웹 (설치 0초)", "Desktop, tablet & mobile browsers (0-sec web launch)"),
    coreStrength: bi(
      "2D 분광 작화·3D 세트·식자·Yjs 협업·Rights BOM 출고를 브라우저 한 곳에서 연결",
      "Connects 2D spectral drawing, 3D sets, lettering, Yjs collab & Rights BOM delivery in one tab",
    ),
    interopPath: bi("OPFS SQLite 정본 + PSD·GLB·VRM·SKP·PNG 왕복", "OPFS SQLite authority + PSD, GLB, VRM, SKP & PNG round-trips"),
  },
  {
    id: "csp",
    name: "Clip Studio Paint",
    shortName: "CSP",
    category: bi("만화·웹툰 프로 드로잉 표준", "Industry standard for manga & webtoon drawing"),
    officialBilling: bi(
      "PRO/EX 월·연 플랜 또는 데스크톱 영구 라이선스(공식가 확인)",
      "PRO/EX monthly/annual plan or desktop perpetual license (check vendor)",
    ),
    platforms: bi("Windows · macOS · iPad · Android · Galaxy", "Windows, macOS, iPad, Android & Galaxy"),
    coreStrength: bi(
      "10년 이상 다져진 필압·벡터 선화 엔진, 방대한 ASSETS 소재 마켓, 3D LT 선화 추출",
      "Decade-tuned pen & vector lineart engine, vast ASSETS marketplace & 3D LT line extraction",
    ),
    interopPath: bi("PSD 레이어·ABR 브러시 가져오기 및 PNG/PSD 왕복", "PSD layer & ABR brush import plus PNG/PSD round-trips"),
  },
  {
    id: "procreate",
    name: "Procreate",
    shortName: "Procreate",
    category: bi("iPad 터치·제스처 일러스트 표준", "iPad touch & gesture illustration standard"),
    officialBilling: bi(
      "App Store 1회 일시불 구매 (정기 구독 없음 · 공식가 확인)",
      "One-time App Store purchase (no subscription · check App Store)",
    ),
    platforms: bi("iPadOS 전용 (Apple Pencil 최적화)", "iPadOS only (Apple Pencil tuned)"),
    coreStrength: bi(
      "Apple Pencil 초저지연 반응성, QuickShape·ColorDrop 직관 제스처, 간결한 터치 크롬",
      "Ultra-low Apple Pencil latency, QuickShape & ColorDrop gestures, calm touch chrome",
    ),
    interopPath: bi("PSD/PNG 내보내기 후 ToonStudio 식자·3D 배경·출고 연결", "Export PSD/PNG into ToonStudio for 3D staging, lettering & delivery"),
  },
  {
    id: "photoshop",
    name: "Adobe Photoshop",
    shortName: "Photoshop",
    category: bi("래스터 합성·색보정·출판 표준", "Raster compositing, color grading & print standard"),
    officialBilling: bi(
      "Creative Cloud 월·연 정기 구독 (공식 플랜 확인)",
      "Creative Cloud monthly/annual subscription (check Adobe plans)",
    ),
    platforms: bi("Windows · macOS · iPad · Web(일부 기능)", "Windows, macOS, iPad & Web (subset)"),
    coreStrength: bi(
      "정밀 색보정·CMYK 인쇄·스마트 오브젝트·포토 배싱·에이전시 PSD 호환",
      "Precision color grading, CMYK print, Smart Objects, photobashing & agency PSD fidelity",
    ),
    interopPath: bi("ag-psd 기반 PSD 레이어 가져오기·후보정 왕복", "ag-psd layer import and finishing round-trips"),
  },
  {
    id: "rebelle7",
    name: "Rebelle 7",
    shortName: "Rebelle 7",
    category: bi("물리 수채·유화·안료 시뮬레이션 특화", "Physical watercolor, oil & pigment simulation"),
    officialBilling: bi(
      "데스크톱 영구 라이선스(Standard/Pro · 메이저 업그레이드 별도)",
      "Desktop perpetual license (Standard/Pro · paid major upgrades)",
    ),
    platforms: bi("Windows · macOS", "Windows & macOS"),
    coreStrength: bi(
      "실시간 중력 수채 번짐, 두꺼운 유화 임파스토, 나노피그먼트 혼색과 실물 종이 텍스처",
      "Live gravity watercolor diffusion, thick oil impasto, pigment mixing & physical paper grain",
    ),
    interopPath: bi("고해상도 PNG/PSD 회화 컷 반입 후 웹툰 말풍선·출고 결합", "Import painterly PNG/PSD frames for webtoon lettering & delivery"),
  },
  {
    id: "blender",
    name: "Blender",
    shortName: "Blender",
    category: bi("오픈소스 3D DCC · Grease Pencil 표준", "Open-source 3D DCC & Grease Pencil standard"),
    officialBilling: bi("GNU GPL 오픈소스 무료 (공식 배포)", "Free open-source under GNU GPL"),
    platforms: bi("Windows · macOS · Linux", "Windows, macOS & Linux"),
    coreStrength: bi(
      "폴리곤 모델링·스컬프팅·리깅·Cycles/EEVEE 렌더·Grease Pencil 2D/3D 하이브리드",
      "Full 3D modeling, sculpting, rigging, Cycles/EEVEE rendering & Grease Pencil 2D/3D",
    ),
    interopPath: bi("GLB/glTF 2.0 세트와 VRM 캐릭터를 ToonStudio 3D 스테이지로 반입", "Import GLB/glTF 2.0 sets & VRM rigs straight into ToonStudio 3D stage"),
  },
  {
    id: "ibispaint",
    name: "ibisPaint",
    shortName: "ibisPaint",
    category: bi("모바일·태블릿 대중 드로잉 & 타임랩스", "Accessible mobile/tablet drawing & timelapse"),
    officialBilling: bi(
      "광고 포함 무료(일부 제한) + Prime 구독 / Windows 일회성·구독",
      "Ad-supported free tier + Prime membership / Windows plans (check vendor)",
    ),
    platforms: bi("iOS · iPadOS · Android · Windows", "iOS, iPadOS, Android & Windows"),
    coreStrength: bi(
      "가벼운 모바일 진입 장벽, 방대한 사용자 브러시 QR 공유, 컷 분할·타임랩스 공유 생태계",
      "Low mobile barrier, huge QR brush-sharing community, quick panel divider & timelapse sharing",
    ),
    interopPath: bi("PSD/PNG 반입 후 ToonStudio PC/웹에서 3D 배경·협업·출고 마무리", "Bring mobile PSD/PNG drafts into ToonStudio for 3D, collab & delivery"),
  },
];

export const BENCHMARK_AXES: readonly BenchmarkAxis[] = [
  {
    id: "install-device",
    order: 1,
    shortLabel: bi("설치·멀티기기", "Zero-Install"),
    title: bi("01 · 설치 장벽 · OS 자유도 · 멀티 디바이스 입력", "01 · Zero-Install Access & Multi-Device I/O"),
    summary: bi(
      "링크 클릭만으로 PC·태블릿·모바일에서 바로 캔버스를 열고, 디지타이저·트랙패드·웹 표준 I/O를 연결하는 축입니다.",
      "How quickly creators launch across desktop, tablet & mobile plus stylus, trackpad and browser peripheral I/O.",
    ),
    toonStudioMaturity: "current",
    evidencePaths: [
      "apps/web/src/domains/creator/studio-workspace-device-signals.ts",
      "apps/web/src/domains/showcase/nextgen-web-platform-enhancer.ts",
    ],
    cells: {
      toonstudio: cell("current", "설치 0초 · 크로스 OS 웹", "0-sec cross-OS web", "브라우저 즉시 진입 · 게스트 비차단 · 워치/TV 컴패니언 확장 중", "Instant browser entry, guest-first flow; watch/TV companion expanding"),
      csp: cell("native-strength", "4대 OS 네이티브", "4-OS native apps", "설치 필요 · 기기 수별 플랜 구분(단일/듀얼/프리미엄)", "Installer required; multi-device plans vary by seat tier"),
      procreate: cell("limited", "iPadOS 전용", "iPadOS only", "iPad에서는 쾌적하나 PC·안드로이드 연동 불가", "Superb on iPad, unavailable on desktop or Android"),
      photoshop: cell("partial", "설치형 + 제한 웹", "Desktop + Web subset", "데스크톱 설치형 주력 · 웹 버전은 고급 기능 일부 축소", "Desktop install primary; web app covers a subset of features"),
      rebelle7: cell("limited", "데스크톱 전용", "Desktop only", "Windows/macOS 전용 설치 앱", "Windows and macOS desktop installation required"),
      blender: cell("limited", "데스크톱 전용", "Desktop only", "고성능 PC/Mac 환경 중심 · 모바일/웹 실행 미지원", "Workstation-oriented; no mobile or native browser runtime"),
      ibispaint: cell("native-strength", "모바일 최강 접근성", "Top mobile reach", "스마트폰·태블릿 설치 즉시 작화 · PC는 시간 제한(무료)", "Fast mobile entry; free desktop build has daily time limits"),
    },
  },
  {
    id: "drawing-pigment",
    order: 2,
    shortLabel: bi("2D 작화·분광", "2D Spectral"),
    title: bi("02 · 2D 브러시 · 분광 혼색 · 종이 질감", "02 · 2D Brush Engine, Spectral Mixing & Paper Grain"),
    summary: bi(
      "선화 안정성, 실제 물감에 가까운 Kubelka-Munk 분광 혼색, 종이 요철 질감 표현력을 정직하게 비교합니다.",
      "Lineart feel, physically inspired Kubelka-Munk spectral pigment mixing, and paper-tooth responsiveness.",
    ),
    toonStudioMaturity: "current",
    evidencePaths: [
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      "packages/studio-hokusai-wasm",
    ],
    cells: {
      toonstudio: cell("current", "WebGPU 7-band KM 분광", "WebGPU 7-band KM", "자체 KM7 분광 혼색·WASM 브러시·CPU 폴백(비상업 mixbox 0건)", "Built-in KM7 spectral core + WASM brush + CPU fallback (0 non-commercial deps)"),
      csp: cell("native-strength", "웹툰 선화·벡터 정본", "Webtoon lineart standard", "벡터 지우개·손떨림 보정·수만 종 커뮤니티 브러시 최강", "Mature vector erasers, stabilization & massive community brush catalog"),
      procreate: cell("native-strength", "Apple Pencil 초저지연", "Ultra-low Pencil latency", "직관적 브러시 스튜디오와 자연스러운 터치 드로잉", "Fluid brush studio tuned specifically for Apple Pencil"),
      photoshop: cell("native-strength", "합성·리터칭 최강", "Compositing leader", "믹서 브러시·ABR 생태계와 정교한 톤 보정 도구", "Mixer brush, ABR legacy and industry-leading retouching filters"),
      rebelle7: cell("native-strength", "물리 유체·수채 최강", "Fluid & watercolor leader", "실시간 물 번짐·임파스토·건조 시뮬레이션의 벤치마크 기준", "Gold standard for physical water diffusion, impasto & canvas drying"),
      blender: cell("partial", "Grease Pencil 2D/3D", "Grease Pencil 2D/3D", "3D 공간 선화는 독보적이나 일반 래스터 채색용은 아님", "Unique 3D-space strokes; not a dedicated raster painting app"),
      ibispaint: cell("partial", "다종 브러시·안정화", "Rich mobile brushes", "필터·브러시 풍부하나 물리 분광 안료 시뮬레이션은 없음", "Rich filters and brushes without spectral fluid pigment physics"),
    },
  },
  {
    id: "scene3d-vrm",
    order: 3,
    shortLabel: bi("3D 세트·VRM", "3D & VRM"),
    title: bi("03 · 내장 3D 배경 세트 · VRM 캐릭터 포즈 · 선화 브리지", "03 · Built-in 3D Sets, VRM Posing & Live Ink Bridge"),
    summary: bi(
      "별도 3D 프로그램 전환 없이 배경 구도·조명·캐릭터 포즈를 잡고 2D 컷 선화로 바로 굽는 작업 효율을 비교합니다.",
      "Staging 3D rooms, lighting and VRM character poses directly into 2D comic panels without app-hopping.",
    ),
    toonStudioMaturity: "current",
    evidencePaths: [
      "apps/web/src/domains/creator/scene-3d/studio-3d-rights-bom.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-texture-paint-device-tier.ts",
    ],
    cells: {
      toonstudio: cell("current", "WebGPU 3D·VRM·OpenSKP", "WebGPU 3D/VRM/SKP", "브라우저 내 3D 공간 조립·VRM 포즈·실시간 선화 추출 연결", "In-browser 3D room staging, VRM posing & live lineart bridge"),
      csp: cell("native-strength", "3D 데생인형·LT 변환(EX)", "3D models & LT (EX)", "인체 포즈·소품 배치 강점 · LT 선화 추출은 EX 상위 에디션", "Strong pose mannequins; full LT line extraction requires EX tier"),
      procreate: cell("limited", "3D 텍스처 페인팅", "3D texture painting", "USDZ/OBJ 모델 채색은 가능하나 배경 세트 조립·카메라 컷은 제한", "Paints USDZ/OBJ models; not designed for multi-room 3D staging"),
      photoshop: cell("none", "내장 3D 기능 축소/종료", "3D tools retired", "기존 3D 워크스페이스 단계적 제거 · 외부 3D 렌더 반입 권장", "Legacy 3D workspace deprecated; relies on external 3D renders"),
      rebelle7: cell("none", "2D 회화 전용", "2D painting only", "3D 배경·인체 포즈 기능 없음", "No 3D background staging or character posing"),
      blender: cell("native-strength", "3D DCC 절대 강자", "Full 3D DCC standard", "모델링·쉐이딩·Freestyle/LineArt 최고 수준 · 학습 곡선 높음", "Unmatched modeling, lighting & LineArt; steeper learning curve"),
      ibispaint: cell("limited", "기본 3D 인형 제공", "Basic 3D figure", "간단한 포즈 참고 가능 · 건축 배경 세트 조립은 미지원", "Basic pose reference only; no 3D architectural set staging"),
    },
  },
  {
    id: "webtoon-animatic",
    order: 4,
    shortLabel: bi("웹툰·애니매틱", "Webtoon & Video"),
    title: bi("04 · 세로 스크롤 식자 · 다국어 말풍선 · Remotion 쇼츠", "04 · Vertical Scroll Lettering & Remotion Animatics"),
    summary: bi(
      "웹툰 전용 세로 스크롤 가독선, 말풍선·효과음 다국어화, 컷 원고에서 홍보 쇼츠·애니매틱으로 이어지는 흐름입니다.",
      "Vertical scroll safe zones, multilingual speech bubbles, and turning episode cuts into deterministic Remotion shorts.",
    ),
    toonStudioMaturity: "current",
    evidencePaths: [
      "packages/product-tour-film/src/ProductTourFilm.tsx",
      "tools/media/brand-film/src/index.tsx",
    ],
    cells: {
      toonstudio: cell("current", "세로 원고·다국어·Remotion", "Scroll + i18n + Remotion", "세로 컷 안전선·말풍선 번역 메모리·Remotion React 영상 파이프라인", "Scroll guides, bubble translation memory & Remotion React film pipeline"),
      csp: cell("native-strength", "웹툰 미리보기·말풍선(EX)", "Webtoon view & balloons", "스마트폰 표시 영역·스토리 에디터 완성도 높음(영상은 타임라인)", "Great webtoon preview & multi-page story editor in EX"),
      procreate: cell("limited", "애니메이션 어시스트", "Animation Assist", "프레임 애니메이션 지원 · 세로 스크롤 웹툰 전용 식자 도구는 제한", "Frame-by-frame animation built in; no native vertical webtoon manager"),
      photoshop: cell("limited", "강력한 타이포그래피", "Pro typography", "세밀한 텍스트 조판 강점 · 웹툰 컷 슬라이스/말풍선 자동화는 스크립트 의존", "Top typography; webtoon slicing & balloons rely on custom actions"),
      rebelle7: cell("none", "식자·말풍선 미지원", "No lettering tools", "회화 원화 제작 후 별도 식자 앱 이동 필요", "Requires a separate app for speech bubbles and episode assembly"),
      blender: cell("partial", "VSE 시퀀서·카메라 연출", "VSE & 3D camera", "3D 애니매틱은 강력하나 웹툰 세로 말풍선 식자 전용은 아님", "Strong 3D animatics; not built for vertical scroll bubble lettering"),
      ibispaint: cell("partial", "컷 분할·기본 말풍선", "Frame divider & text", "모바일 컷 분할과 기본 텍스트 지원 · 다국어 번역 메모리는 없음", "Handy frame divider and text; lacks localization memory"),
    },
  },
  {
    id: "collab-local-db",
    order: 5,
    shortLabel: bi("협업·OPFS 저장", "Collab & OPFS"),
    title: bi("05 · 실시간 공동 작업 · 브라우저 로컬 OPFS 영속 저장", "05 · Live CRDT Collaboration & Local OPFS Persistence"),
    summary: bi(
      "어시스턴트·PD와의 실시간 피드백·공동 편집과 네트워크가 끊겨도 작업이 유실되지 않는 로컬 정본 설계를 비교합니다.",
      "Real-time multi-user sync for teams paired with crash-resilient local browser storage.",
    ),
    toonStudioMaturity: "partial",
    evidencePaths: [
      "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
      "apps/web/src/domains/creator/live/studio-crdt-compaction.test.ts",
    ],
    cells: {
      toonstudio: cell("partial", "OPFS 로컬 + Yjs/WebRTC", "OPFS + Yjs/WebRTC", "OPFS 저널·Yjs 컴팩션 구현 완료 · 대규모 장기 스튜디오 실증 확대 중", "OPFS journal & Yjs compaction built; expanding long-run studio validation"),
      csp: cell("limited", "클라우드 팀워크(파일 잠금)", "Cloud Teamwork check-out", "페이지 단위 체크아웃 방식 · 동시 실시간 캔버스 커서 편집은 아님", "Page check-out sync via Clip Studio Cloud; not live simultaneous canvas CRDT"),
      procreate: cell("none", "단독 기기 로컬 저장", "Single-device local", "iPad 로컬 저장 중심 · 실시간 다중 편집 미지원", "Local iPad library only; no live multi-user editing"),
      photoshop: cell("partial", "클라우드 문서·웹 코멘트", "Cloud Docs & comments", "링크 리뷰·순차 공동 편집 지원 · 동시 실시간 브러시 협업은 제한", "Review links and async cloud editing; limited simultaneous strokes"),
      rebelle7: cell("none", "단독 로컬 파일", "Local desktop files", "실시간 협업 기능 없음", "Single-user local file workflow"),
      blender: cell("limited", "링크드 라이브러리·외부 애드온", "Linked libs / add-ons", "파일 링크 분업 강점 · 실시간 동시 편집은 외부 애드온 필요", "Strong asset linking; live sync needs third-party add-ons"),
      ibispaint: cell("limited", "클라우드 백업 동기화", "Cloud backup sync", "기기 간 파일 백업 중심 · 실시간 협업 미지원", "Personal cloud storage backup; no live team editing"),
    },
  },
  {
    id: "rights-delivery",
    order: 6,
    shortLabel: bi("권리 BOM·출고", "Rights BOM"),
    title: bi("06 · 상업 라이선스 자동 검증(Rights BOM) & 플랫폼 출고", "06 · Automated Commercial Rights BOM & Platform Export"),
    summary: bi(
      "원고에 들어간 3D 모델·브러시·폰트·음원의 상업적 사용 권리를 출고 전에 자동 검증하고 플랫폼 규격으로 묶는 기능입니다.",
      "Pre-export verification of commercial licenses across 3D assets, brushes & fonts plus platform slicing.",
    ),
    toonStudioMaturity: "current",
    evidencePaths: [
      "apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts",
      "apps/web/src/domains/creator/publishing-preflight-pro/rights-bom-cc0-preflight.ts",
    ],
    cells: {
      toonstudio: cell("current", "출고 전 Rights BOM 검증", "Pre-export Rights BOM", "소재 라이선스 이력·상업 충돌 경고·규격 슬라이스 내장", "Built-in asset provenance ledger, commercial conflict check & export pack"),
      csp: cell("partial", "웹툰 일괄 분할 내보내기", "Webtoon slice export", "출고 슬라이스 편리 · 외부 3D/폰트 라이선스 자동 BOM 검증은 수동", "Great slice export; asset license compliance tracking is manual"),
      procreate: cell("none", "수동 내보내기", "Manual export", "PSD/PNG 저장만 제공 · 상업 라이선스 감사 기능 없음", "Standard file export without rights ledger"),
      photoshop: cell("partial", "Content Credentials(C2PA)", "Content Credentials", "편집 이력 서명 지원 · 웹툰 플랫폼별 슬라이스·소재 BOM 통합은 별도", "Supports C2PA provenance; webtoon BOM & slicing need external tooling"),
      rebelle7: cell("none", "단일 이미지 내보내기", "Image export only", "웹툰 출고 검수·라이선스 BOM 기능 없음", "No webtoon preflight or commercial rights BOM"),
      blender: cell("none", "렌더/에셋 익스포트", "Render & mesh export", "렌더·GLB 출력 전용 · 웹툰 상업 권리 명세서는 수동 관리", "Mesh and frame output only; license tracking is manual"),
      ibispaint: cell("none", "기본 PNG/PSD 저장", "Basic PNG/PSD export", "라이선스 BOM이나 연재 출고 검수 파이프라인 미지원", "No preflight checks or rights BOM tracking"),
    },
  },
  {
    id: "pricing-interop",
    order: 7,
    shortLabel: bi("비용·상호운용", "Cost & Interop"),
    title: bi("07 · 과금 구조 · 로컬 ₩0 단위경제 · 기존 도구 공존성", "07 · Billing Structure, KRW 0 Local Economics & Interop"),
    summary: bi(
      "타사 도구를 억지로 버리게 하지 않고 PSD·GLB·VRM·SKP로 공존하면서 초기 고정비를 낮추는 구조입니다.",
      "Coexisting cleanly via PSD, GLB, VRM and SKP while minimizing recurring fixed costs through local-first execution.",
    ),
    toonStudioMaturity: "current",
    evidencePaths: [
      "packages/studio-format-gateway",
      "deploy/DEPLOY_MANIFEST.json",
    ],
    cells: {
      toonstudio: cell("current", "베타 ₩0 · 로컬 연산 구조", "KRW 0 beta · local-first", "브라우저 GPU/OPFS 연산으로 서버 AI/저장 비용 절감 · PSD/GLB/VRM/SKP 호환", "Local GPU/OPFS keeps unit cost low; PSD/GLB/VRM/SKP round-trip"),
      csp: cell("partial", "구독 또는 PC 일시불", "Sub or desktop one-time", "PC 영구 라이선스 선택 가능 · 태블릿/업데이트 패스는 구독 구조", "Desktop perpetual option; tablets and update pass use subscription"),
      procreate: cell("native-strength", "1회 구매 · 구독 없음", "One-time purchase", "합리적 1회 과금(단, iPad 하드웨어 보유 전제)", "Creator-friendly one-time fee (requires iPad hardware)"),
      photoshop: cell("limited", "정기 구독 전용", "Subscription only", "Creative Cloud 지속 구독 필요 · 팀 시트당 고정비 누적", "Ongoing Creative Cloud subscription per seat"),
      rebelle7: cell("partial", "데스크톱 영구 라이선스", "Perpetual desktop", "구독 부담은 없으나 메이저 버전 업그레이드 시 추가 구매", "No subscription; paid upgrades between major releases"),
      blender: cell("native-strength", "완전 무료 오픈소스", "100% free open-source", "상업적 사용 포함 완전 무료 · ToonStudio와 GLB로 완벽 공존", "Free for commercial use; pairs seamlessly with ToonStudio via GLB"),
      ibispaint: cell("partial", "무료(광고/제한) + Prime", "Freemium + Prime", "입문 비용 0원 · 클라우드/소재/PC 무제한은 유료 멤버십", "Free entry with ads/limits; full cross-device access via Prime"),
    },
  },
];

export const BENCHMARK_PERSONAS: readonly BenchmarkPersonaFilter[] = [
  {
    id: "solo-webtoon",
    label: bi("1인 연재 작가", "Solo Webtoon Artist"),
    tagline: bi("설치·구독 부담 없이 콘티부터 3D 배경·식자·출고까지 혼자 완주", "Go solo from rough boards to 3D sets, lettering & delivery with zero install"),
    priorityAxes: ["install-device", "scene3d-vrm", "webtoon-animatic", "pricing-interop"],
    recommendedStack: ["toonstudio", "csp"],
    whyFit: bi(
      "배경 3D 조립·말풍선 다국어·출고 검수까지 한 탭에서 이어져 도구 전환 시간을 크게 줄입니다. 기존 CSP 선화 습관이 깊다면 PSD로 왕복 조합이 가장 현실적입니다.",
      "Keeps 3D sets, multilingual bubbles & preflight in one browser tab; pair with CSP via PSD if you already rely on CSP vector lineart.",
    ),
    candidTradeoff: bi(
      "수만 종 상용 브러시·소재 생태계는 아직 Clip Studio ASSETS가 훨씬 크므로, 특화 소재는 PSD/ABR 가져오기로 보완하는 구성이 안전합니다.",
      "Clip Studio ASSETS still has a much larger legacy catalog; bridge specialized assets through PSD/ABR import.",
    ),
  },
  {
    id: "studio-team",
    label: bi("스튜디오·분업 팀", "Webtoon Studio Team"),
    tagline: bi("선화·채색·배경·식자·PD 검수와 Rights BOM 권리 관리를 한 작업대에", "Unify lineart, color, 3D sets, PD review & Rights BOM compliance"),
    priorityAxes: ["collab-local-db", "rights-delivery", "webtoon-animatic"],
    recommendedStack: ["toonstudio", "photoshop"],
    whyFit: bi(
      "링크 기반 협업, OPFS 오프라인 복구, 출고 직전 상업 라이선스 자동 BOM 검증으로 외주·어시스턴트 합류 시 저작권 사고와 파일 누락을 줄입니다.",
      "Link-based collaboration, OPFS crash resilience and automated pre-export Rights BOM checks cut handoff errors and license risks.",
    ),
    candidTradeoff: bi(
      "대규모 20인 이상 장기 동시 편집 실증은 현재 확대 중이며, 인쇄 단행본 CMYK 최종 교정은 Photoshop과 병행하는 편이 정확합니다.",
      "Large-team long-session stress validation is still expanding; keep Photoshop in the loop for final CMYK print proofing.",
    ),
  },
  {
    id: "mobile-illustrator",
    label: bi("멀티 디바이스 크리에이터", "Multi-Device Creator"),
    tagline: bi("아이패드·태블릿·노트북·모바일을 오가며 끊김 없이 스케치와 채색", "Sketch and paint smoothly across iPad, tablet, laptop & mobile"),
    priorityAxes: ["install-device", "drawing-pigment", "pricing-interop"],
    recommendedStack: ["toonstudio", "procreate", "ibispaint"],
    whyFit: bi(
      "OS에 묶이지 않고 웹에서 바로 열어 작업하며, 분광 혼색과 터치 안전 UI로 이동 중 콘티·색지정 뒤 데스크톱에서 바로 이어서 마감합니다.",
      "No OS lock-in: draft on tablet or mobile web with spectral pigment mixing, then continue seamlessly on desktop.",
    ),
    candidTradeoff: bi(
      "iPad 단독 초저지연 Apple Pencil 필기감은 네이티브 Procreate가, 스마트폰 가벼운 입문은 ibisPaint가 여전히 강점이므로 PSD 왕복을 권장합니다.",
      "Native Procreate still leads raw Apple Pencil latency on iPad and ibisPaint excels on phones—round-trip via PSD/PNG.",
    ),
  },
  {
    id: "tech-director",
    label: bi("테크니컬·3D/영상 감독", "Tech / 3D & Video Director"),
    tagline: bi("WebGPU 3D 세트 · Blender GLB 파이프라인 · Remotion 쇼츠 자동화", "WebGPU 3D staging, Blender GLB interop & Remotion shorts automation"),
    priorityAxes: ["scene3d-vrm", "webtoon-animatic", "rights-delivery"],
    recommendedStack: ["toonstudio", "blender", "rebelle7"],
    whyFit: bi(
      "Blender에서 제작한 GLB/VRM 에셋을 ToonStudio 3D 스테이지에서 웹툰 컷 선화로 바로 뽑고, Remotion React 컴포지션으로 홍보 쇼츠까지 코드 기반으로 재현합니다.",
      "Bring Blender GLB/VRM assets into ToonStudio for live comic lineart and render reproducible promo shorts with Remotion React compositions.",
    ),
    candidTradeoff: bi(
      "복잡한 하이폴리 스컬프팅·시뮬레이션은 Blender, 극사실 수채 번짐 원화는 Rebelle 7에서 제작해 ToonStudio로 합류시키는 분업이 가장 강력합니다.",
      "Use Blender for heavy sculpting/simulation and Rebelle 7 for hyper-real fluid watercolor, assembling the final episode in ToonStudio.",
    ),
  },
];

export const BENCHMARK_DEVICE_CARDS: readonly BenchmarkDeviceCard[] = [
  {
    id: "digitizer",
    spritePath: "/assets/studio/vibrant-sprites/device-digitizer.webp",
    name: bi("디지타이저 · 스타일러스", "Digitizer & Stylus"),
    maturity: "current",
    webApi: "PointerEvent (pressure · tiltX/Y · twist)",
    role: bi("필압 커브·기울기 음영·배럴 회전을 브라우저 PointerEvent로 직접 수신", "Reads pressure curves, tilt shading & barrel twist natively via PointerEvent"),
  },
  {
    id: "dial-pad",
    spritePath: "/assets/studio/vibrant-sprites/device-dial-pad.webp",
    name: bi("왼손 다이얼 · MIDI 컨트롤러", "Dial Pad & MIDI"),
    maturity: "partial",
    webApi: "WebHID · WebMIDI · Gamepad API",
    role: bi("브러시 크기·캔버스 회전·Undo를 물리 노브와 단축키로 매핑(크롬 계열 지원)", "Maps brush size, canvas rotation & undo to physical knobs on Chromium"),
  },
  {
    id: "watch",
    spritePath: "/assets/studio/vibrant-sprites/device-watch.webp",
    name: bi("스마트워치 컴패니언", "Smartwatch Companion"),
    maturity: "partial",
    webApi: "BroadcastChannel · Compact Viewport",
    role: bi("소형 원형/사각 화면용 1탭 Undo·4색 팔레트·빠른 메모 보조 컨트롤러", "Compact 1-tap undo, 4-color swatch & quick voice cue companion"),
  },
  {
    id: "smart-tv",
    spritePath: "/assets/studio/vibrant-sprites/device-tv.webp",
    name: bi("스마트 TV 10ft 스토리보드", "Smart TV 10ft Board"),
    maturity: "partial",
    webApi: "Spatial Keyboard Focus · Fullscreen API",
    role: bi("리모컨 방향키 포커스로 회의실·거실 대형 화면에서 회차 컷 검수", "D-Pad focus navigation for living-room & meeting-room episode reviews"),
  },
  {
    id: "ar-glasses",
    spritePath: "/assets/studio/vibrant-sprites/device-ar-glasses.webp",
    name: bi("AR 스마트글라스 트레이싱", "AR Glasses Tracing"),
    maturity: "target",
    webApi: "WebXR AR · Camera Passthrough",
    role: bi("종이 스케치 위 가이드 투영 및 핸즈프리 레퍼런스 오버레이(로드맵)", "Roadmap: translucent perspective overlay & hands-free reference view"),
  },
  {
    id: "vr-headset",
    spritePath: "/assets/studio/vibrant-sprites/device-vr-headset.webp",
    name: bi("WebXR VR 360° 디렉터", "WebXR VR Director"),
    maturity: "partial",
    webApi: "navigator.xr (WebXR Device API)",
    role: bi("3D 배경 세트 내부에 직접 들어가 카메라 구도와 공간 동선을 점검", "Step inside 3D sets in supported XR headsets to scout comic camera angles"),
  },
];

export function getBenchmarkTool(id: BenchmarkToolId): BenchmarkToolProfile {
  return BENCHMARK_TOOLS.find((tool) => tool.id === id) ?? BENCHMARK_TOOLS[0]!;
}

export function getBenchmarkPersona(id: BenchmarkPersonaId): BenchmarkPersonaFilter | null {
  if (id === "all") return null;
  return BENCHMARK_PERSONAS.find((persona) => persona.id === id) ?? null;
}
