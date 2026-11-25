/**
 * `/compare/studio` 시각 비교 허브 정본 데이터 및 순수 기하 유틸리티.
 *
 * - 탈-바이올렛 5대 안료 색상 체계 (OKLCH hue 270~320° 0%, 원시 hex/rgb/hsl 0건)
 * - 1:1 맞대결 비교(ToonStudio vs 글로벌 6종): 우위 · 상대 강점 · 왕복 호환 경로
 * - 작업 환경별 툴 체인 전환 비교 (1인 웹툰 연재 / 5인 팀 분업 / iPad+데스크톱 병행)
 * - 9축 공개 스펙 커버리지 레이더·바 SVG 좌표 계산기 (실측 성능 배수 표기 금지)
 */

import {
  BENCHMARK_AXES,
  getToolAxisCoverageScore,
  type BenchmarkAxis,
  type BenchmarkStatus,
  type BenchmarkToolId,
  type BilingualText,
  type CompetitorToolId,
} from "./competitor-benchmark-data";

export interface BenchmarkPigmentLegendItem {
  readonly status: BenchmarkStatus;
  readonly pigmentKey: "jade" | "cobalt" | "amber" | "terracotta" | "sumi";
  readonly symbol: string;
  readonly label: BilingualText;
  readonly shortBadge: BilingualText;
  readonly cssClass: string;
  readonly oklchStroke: string;
}

export interface HeadToHeadRoundTripStep {
  readonly fromTool: BilingualText;
  readonly formatBadge: string;
  readonly detail: BilingualText;
}

export interface HeadToHeadProfile {
  readonly competitorId: CompetitorToolId;
  readonly headline: BilingualText;
  readonly summary: BilingualText;
  readonly toonstudioLeads: readonly BilingualText[];
  readonly competitorStrengths: readonly BilingualText[];
  readonly roundTripFormats: readonly string[];
  readonly roundTripSteps: readonly HeadToHeadRoundTripStep[];
  readonly honestVerdict: BilingualText;
}

export type WorkflowEnvironmentId =
  | "solo-webtoon"
  | "five-person-team"
  | "ipad-desktop-hybrid";

export interface WorkflowPipelineStep {
  readonly order: number;
  readonly toolLabel: BilingualText;
  readonly action: BilingualText;
  readonly frictionNote?: BilingualText;
}

export interface WorkflowEnvironmentComparison {
  readonly id: WorkflowEnvironmentId;
  readonly label: BilingualText;
  readonly tagline: BilingualText;
  readonly legacyAppCountLabel: BilingualText;
  readonly toonstudioTabLabel: BilingualText;
  readonly legacySteps: readonly WorkflowPipelineStep[];
  readonly toonstudioSteps: readonly WorkflowPipelineStep[];
  readonly coexistenceNote: BilingualText;
}

export interface RadarPoint {
  readonly axis: BenchmarkAxis;
  readonly angleRad: number;
  readonly x: number;
  readonly y: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly score: number;
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

/**
 * 탈-바이올렛 5대 안료 팔레트 (OKLCH hue 270~320° 완전 배제).
 * SVG 및 히트맵 범례에서 원시 색 없이 시맨틱 안료만 사용한다.
 */
export const BENCHMARK_SVG_PIGMENTS = {
  toonstudioStroke: "oklch(0.58 0.15 158)",
  toonstudioFill: "oklch(0.62 0.14 158 / 0.22)",
  competitorStroke: "oklch(0.58 0.17 34)",
  competitorFill: "oklch(0.62 0.15 34 / 0.18)",
  cobaltStroke: "oklch(0.56 0.14 232)",
  amberStroke: "oklch(0.66 0.14 78)",
  sumiStroke: "oklch(0.54 0.014 72)",
} as const;

export const BENCHMARK_HEATMAP_LEGEND: readonly BenchmarkPigmentLegendItem[] = [
  {
    status: "current",
    pigmentKey: "jade",
    symbol: "●",
    label: bi("현재 구현", "Current"),
    shortBadge: bi("구현", "Live"),
    cssClass: "ts-hm-jade",
    oklchStroke: "oklch(0.58 0.15 158)",
  },
  {
    status: "native-strength",
    pigmentKey: "cobalt",
    symbol: "★",
    label: bi("타사 강점", "Competitor Strength"),
    shortBadge: bi("강점", "Lead"),
    cssClass: "ts-hm-cobalt",
    oklchStroke: "oklch(0.56 0.14 232)",
  },
  {
    status: "partial",
    pigmentKey: "amber",
    symbol: "◐",
    label: bi("전환 중", "In Progress"),
    shortBadge: bi("확장", "Part"),
    cssClass: "ts-hm-amber",
    oklchStroke: "oklch(0.66 0.14 78)",
  },
  {
    status: "limited",
    pigmentKey: "terracotta",
    symbol: "△",
    label: bi("제한", "Limited"),
    shortBadge: bi("제한", "Lim"),
    cssClass: "ts-hm-terracotta",
    oklchStroke: "oklch(0.58 0.15 36)",
  },
  {
    status: "none",
    pigmentKey: "sumi",
    symbol: "—",
    label: bi("미지원", "Not Built-in"),
    shortBadge: bi("없음", "None"),
    cssClass: "ts-hm-sumi",
    oklchStroke: "oklch(0.54 0.014 72)",
  },
];

export function getHeatmapPigmentForStatus(status: BenchmarkStatus): BenchmarkPigmentLegendItem {
  if (status === "target") {
    return BENCHMARK_HEATMAP_LEGEND[2]!;
  }
  return (
    BENCHMARK_HEATMAP_LEGEND.find((item) => item.status === status) ?? BENCHMARK_HEATMAP_LEGEND[4]!
  );
}

export const COMPETITOR_IDS: readonly CompetitorToolId[] = [
  "csp",
  "procreate",
  "photoshop",
  "rebelle7",
  "blender",
  "ibispaint",
];

export const HEAD_TO_HEAD_PROFILES: Readonly<Record<CompetitorToolId, HeadToHeadProfile>> = {
  csp: {
    competitorId: "csp",
    headline: bi("웹툰 표준 설치형 도구 vs 설치 0초 브라우저 올인원 OS", "Desktop Webtoon Standard vs. Zero-Install Browser OS"),
    summary: bi(
      "Clip Studio Paint는 웹툰 펜선·벡터 지우개·ASSETS 소재 생태계의 검증된 표준입니다. ToonStudio는 3D 배경 조립·비파괴 연출 코치·Rights BOM 출고·실시간 링크 협업을 한 탭으로 묶어 공정 전환 마찰을 줄입니다.",
      "Clip Studio Paint is the proven standard for comic vector lineart and ASSETS libraries. ToonStudio unites 3D staging, non-destructive directing coaches, Rights BOM preflight and live browser collaboration in one tab.",
    ),
    toonstudioLeads: [
      bi("설치 0초·OS 자유 진입과 공개 베타 ₩0 시작(기기 수별 추가 플랜 부담 없음)", "Zero-install cross-OS browser launch at KRW 0 beta without per-seat device tiers"),
      bi("대사 기반 표정·3점 조명·180° 카메라·얼굴 회피 말풍선·15관절 손 그립·1~60컷 설정집 붉은펜 코치 내장", "6 built-in artist-approved directing coaches including 180-degree camera & 1-60 cut model-sheet drift audits"),
      bi("출고 직전 3D·브러시·폰트 상업 라이선스를 자동 검증하는 Rights BOM 원장과 OPFS 로컬 복구", "Automated pre-export Rights BOM commercial license ledger paired with local OPFS recovery"),
    ],
    competitorStrengths: [
      bi("10년 이상 다져진 G펜 필압·벡터 교차 지우개·손떨림 보정의 안정적인 필기감", "Decade-refined G-pen pressure feel, vector intersection eraser and stroke stabilization"),
      bi("수만 종 브러시·3D 소품·포즈 소재가 축적된 Clip Studio ASSETS 거대 마켓 생태계", "Massive Clip Studio ASSETS marketplace covering tens of thousands of brushes and 3D materials"),
      bi("EX 에디션의 검증된 3D LT 선화 변환, 다중 페이지 스토리 에디터, 네이티브 멀티코어 안정성", "Proven EX-tier 3D LT line extraction, multi-page story manager and native desktop stability"),
    ],
    roundTripFormats: [".psd", ".abr", ".png", ".glb"],
    roundTripSteps: [
      {
        fromTool: bi("CSP에서 선화·벡터 잉킹", "Vector lineart in CSP"),
        formatBadge: ".psd",
        detail: bi("레이어 구조를 유지한 PSD를 ToonStudio로 반입해 3D 배경·말풍선·번역 메모리 결합", "Import layered PSD into ToonStudio for 3D sets, speech bubbles & translation memory"),
      },
      {
        fromTool: bi("기존 애용 브러시 팁 반입", "Bring favorite brush tips"),
        formatBadge: ".abr",
        detail: bi("호환 브러시 세트를 불러와 ToonStudio 무료 502종 브러시·KM7 분광 혼색과 병행", "Import compatible brushes alongside ToonStudio's 502 free brushes & KM7 spectral palette"),
      },
      {
        fromTool: bi("ToonStudio 최종 검수·출고", "Final QA & Rights BOM"),
        formatBadge: "BOM + PNG",
        detail: bi("1~60컷 설정집 대조와 Rights BOM 검증 후 플랫폼 규격 세로 슬라이스 일괄 내보내기", "Run 1-60 cut drift checks & Rights BOM validation, then export vertical platform slices"),
      },
    ],
    honestVerdict: bi(
      "CSP 숙련 작가는 펜선 공정을 유지하면서 3D 배경·비파괴 연출 코치·Rights BOM 출고만 ToonStudio로 연결하는 PSD 왕복 조합이 가장 현실적입니다.",
      "Experienced CSP artists can keep their favorite inking workflow and round-trip PSDs into ToonStudio for 3D staging, directing coaches and Rights BOM delivery.",
    ),
  },
  procreate: {
    competitorId: "procreate",
    headline: bi("iPad 터치 일러스트 표준 vs 크로스-OS 웹툰 연재 작업대", "iPad Touch Illustration Leader vs. Cross-OS Webtoon Workbench"),
    summary: bi(
      "Procreate는 iPad와 Apple Pencil 환경에서 타의 추종을 불허하는 120Hz 필기감과 1회 일시불 과금을 제공합니다. ToonStudio는 OS 제한 없이 데스크톱·태블릿에서 3D 세트·말풍선 식자·협업·출고까지 완주하도록 설계됐습니다.",
      "Procreate delivers unmatched iPad ProMotion 120Hz Apple Pencil feel for a one-time fee. ToonStudio removes OS lock-in so creators finish 3D sets, lettering, collaboration and delivery across desktop and tablet.",
    ),
    toonstudioLeads: [
      bi("Windows·macOS·iPad·Android 브라우저 어디서나 이어 쓰는 크로스-OS 연속성", "Cross-OS browser continuity across Windows, macOS, iPad and Android without hardware lock-in"),
      bi("내장 3D 배경 세트 조립, VRM 캐릭터 포즈, 6종 비파괴 웹툰 연출 코치와 세로 스크롤 식자", "Built-in 3D room staging, VRM posing, 6 non-destructive directing coaches & vertical scroll lettering"),
      bi("Yjs 실시간 협업, 다국어 말풍선 번역 메모리, 출고 전 Rights BOM 상업 라이선스 검증", "Live Yjs collaboration, multilingual balloon memory & pre-export Rights BOM checks"),
    ],
    competitorStrengths: [
      bi("Valkyrie 120Hz Metal 엔진 기반 Apple Pencil 초저지연 반응성과 매끄러운 터치 필기감", "Valkyrie 120Hz Metal engine delivering ultra-low Apple Pencil latency on iPad"),
      bi("정기 구독 없는 App Store 1회 일시불 구매와 간결한 원핸드 제스처(QuickShape·ColorDrop)", "Subscription-free one-time App Store purchase paired with effortless QuickShape & ColorDrop"),
      bi("오프라인 iPad 단독 환경에서 캔버스 몰입도를 극대화한 군더더기 없는 UI", "Minimalist, distraction-free UI tuned specifically for standalone iPad sketching"),
    ],
    roundTripFormats: [".psd", ".png", ".usdz → .glb"],
    roundTripSteps: [
      {
        fromTool: bi("iPad Procreate 콘티·채색", "Sketch & color on iPad"),
        formatBadge: ".psd",
        detail: bi("이동 중 Apple Pencil로 그린 레이어 원고를 PSD로 내보내 ToonStudio에 바로 올림", "Export layered Apple Pencil drafts as PSD directly into ToonStudio"),
      },
      {
        fromTool: bi("ToonStudio 데스크톱 배경·식자", "Desktop 3D & lettering"),
        formatBadge: "WebGPU 3D",
        detail: bi("3D 배경 세트와 얼굴 회피 말풍선·180° 카메라 어시스턴트로 세로 회차 연출 완성", "Stage 3D rooms and apply face-avoiding balloons & 180-degree framing checks"),
      },
      {
        fromTool: bi("원고 출고 및 Remotion 쇼츠", "Delivery & Remotion"),
        formatBadge: "PNG / MP4",
        detail: bi("플랫폼 규격 슬라이스와 홍보용 Remotion 숏폼 트레일러를 같은 프로젝트에서 출력", "Export platform slices and deterministic Remotion promo shorts from one project"),
      },
    ],
    honestVerdict: bi(
      "iPad 단독 초저지연 러프·일러스트는 Procreate로 그리고, 세로 웹툰 조립·3D 배경·말풍선·출고는 ToonStudio에서 마무리하는 조합이 깔끔합니다.",
      "Use Procreate for pure iPad sketching and finish vertical episode assembly, 3D sets, lettering and preflight in ToonStudio.",
    ),
  },
  photoshop: {
    competitorId: "photoshop",
    headline: bi("출판·합성·색보정 표준 vs 웹툰 전용 3D·연출·로컬 엔진", "Print & Compositing Standard vs. Purpose-Built Webtoon Engine"),
    summary: bi(
      "Adobe Photoshop은 CMYK 인쇄, 정밀 색보정, 스마트 오브젝트, 에이전시 PSD 호환의 절대 표준입니다. ToonStudio는 지속 구독 고정비와 외부 스크립트 의존 없이 웹툰 3D 세트·말풍선·비파괴 코치·Rights BOM을 기본 제공합니다.",
      "Adobe Photoshop remains the benchmark for CMYK print proofing, color grading and Smart Objects. ToonStudio focuses on webtoon-native 3D staging, lettering, directing coaches and Rights BOM without mandatory seat subscriptions.",
    ),
    toonstudioLeads: [
      bi("내장 WebGPU 3D 배경 세트·VRM 캐릭터 포즈·선화 브리지(Photoshop은 내장 3D 워크스페이스 종료)", "Built-in WebGPU 3D rooms, VRM rigs & live ink bridge (Photoshop retired its native 3D workspace)"),
      bi("세로 스크롤 안전선, 얼굴 회피 말풍선 배치, 1~60컷 설정집 붉은펜 코치 등 웹툰 특화 자동화", "Webtoon-native vertical scroll guides, face-avoiding balloon layout & 1-60 cut drift coaching"),
      bi("로컬 브라우저 연산 기반 베타 ₩0 구조와 출고 직전 에셋 상업 권리 BOM 자동 검증", "Local-first KRW 0 open beta with automated commercial asset Rights BOM verification"),
    ],
    competitorStrengths: [
      bi("CMYK 단행본 인쇄 프로파일, 정밀 톤 커브·색보정, 16/32비트 전문 래스터 합성 엔진", "Industry-leading CMYK print profiles, precision tone curves & deep 16/32-bit compositing"),
      bi("스마트 오브젝트, 고급 마스크, 포토 배싱, 방대한 서드파티 플러그인·에이전시 표준", "Smart Objects, advanced masking, photobashing and universal agency PSD compatibility"),
      bi("Content Credentials(C2PA) 출처 서명과 대형 인쇄·광고 포스터 제작 파이프라인", "Content Credentials (C2PA) provenance signing and large-format print production workflows"),
    ],
    roundTripFormats: [".psd", ".png", ".abr"],
    roundTripSteps: [
      {
        fromTool: bi("ToonStudio 원고·3D·식자 제작", "Build episode in ToonStudio"),
        formatBadge: ".psd",
        detail: bi("ag-psd 호환 게이트웨이로 캐릭터·배경·효과 레이어를 분리한 PSD 내보내기", "Export cleanly separated character, background & FX layers through the ag-psd gateway"),
      },
      {
        fromTool: bi("Photoshop 단행본 CMYK 교정", "CMYK print proofing in PS"),
        formatBadge: "CMYK / PSD",
        detail: bi("단행본 표지·인쇄용 컬러 프로파일과 정밀 리터칭이 필요할 때만 Photoshop으로 마감", "Use Photoshop specifically for book-cover retouching and CMYK press proofing"),
      },
      {
        fromTool: bi("웹 연재본 Rights BOM 출고", "Web delivery with BOM"),
        formatBadge: "Rights BOM",
        detail: bi("웹툰 플랫폼 연재 출고는 ToonStudio에서 소재 라이선스 감사 후 규격 슬라이스로 완료", "Complete web serialization delivery inside ToonStudio with Rights BOM auditing"),
      },
    ],
    honestVerdict: bi(
      "주간 웹툰 연재 파이프라인은 ToonStudio 한 탭에서 처리하고, 단행본 CMYK 인쇄 교정이나 고난도 포토 리터칭만 Photoshop과 PSD로 왕복하는 구성이 효율적입니다.",
      "Run weekly webtoon episodes in ToonStudio and bring in Photoshop via PSD whenever CMYK print proofing or heavy photo retouching is needed.",
    ),
  },
  rebelle7: {
    competitorId: "rebelle7",
    headline: bi("물리 유체 수채·유화 최고봉 vs 웹툰 전 공정 + KM7 분광 브러시", "Physical Fluid Painting Peak vs. Full Webtoon OS + KM7 Spectral"),
    summary: bi(
      "Rebelle 7은 실시간 중력 수채 번짐, 두꺼운 유화 임파스토, 실물 종이 요철 시뮬레이션의 업계 기준입니다. ToonStudio는 브라우저 WebGPU 7밴드 KM 분광 혼색으로 회화 감각을 끌어올리면서 3D·식자·협업·출고까지 연결합니다.",
      "Rebelle 7 is the gold standard for real-time gravity watercolor diffusion and thick oil impasto. ToonStudio pairs browser WebGPU 7-band KM spectral mixing with full 3D sets, lettering, collaboration and delivery.",
    ),
    toonstudioLeads: [
      bi("회화 작화 이후 3D 배경 세트, 말풍선 식자, 다국어 번역, Rights BOM 출고까지 이동 없이 완결", "Moves seamlessly from painterly coloring into 3D sets, speech bubbles, localization and Rights BOM export"),
      bi("설치 없는 크로스-OS 웹(PC·태블릿·모바일)과 Yjs 실시간 팀 협업·OPFS 오프라인 복구", "Zero-install cross-OS web access plus live Yjs team editing and OPFS crash resilience"),
      bi("6종 비파괴 웹툰 연출 코치와 Remotion 홍보 쇼츠 파이프라인 기본 통합", "Includes 6 artist-approved comic directing coaches and deterministic Remotion promo shorts"),
    ],
    competitorStrengths: [
      bi("실시간 중력·기울기 반응 수채 번짐, 물 마름 시뮬레이션, 두꺼운 유화 임파스토 표현력", "Real-time gravity/tilt watercolor flow, drying physics and thick physical oil impasto"),
      bi("나노피그먼트 감산 혼색과 초고해상도 실물 수채화지·캔버스 텍스처 반응성", "Ultra-detailed physical watercolor paper grain and realistic pigment granulation"),
      bi("정기 구독 없는 데스크톱 영구 라이선스(Standard/Pro 선택)", "Perpetual desktop licensing without recurring monthly subscription lock-in"),
    ],
    roundTripFormats: [".png", ".psd"],
    roundTripSteps: [
      {
        fromTool: bi("Rebelle 7 키 비주얼·수채 컷", "Hero painterly frames in Rebelle"),
        formatBadge: "16-bit PNG / PSD",
        detail: bi("감정 절정 컷이나 표지 회화를 Rebelle 7 물리 수채·유화로 완성해 내보내기", "Paint flagship covers or emotional watercolor spreads in Rebelle 7"),
      },
      {
        fromTool: bi("ToonStudio 컷 조립·분광 보정", "Assemble & color-match"),
        formatBadge: "KM7 + Layer",
        detail: bi("ToonStudio 원고에 반입해 KM7 분광 브러시로 인접 컷 톤을 맞추고 얼굴 회피 말풍선 배치", "Import into ToonStudio, match neighboring frames with KM7 brushes & place face-avoiding balloons"),
      },
      {
        fromTool: bi("다국어 식자·출고 팩 생성", "Multilingual export"),
        formatBadge: "BOM + Slice",
        detail: bi("번역 메모리와 Rights BOM 검증을 통과한 최종 플랫폼 슬라이스로 즉시 출고", "Validate licenses with Rights BOM and export platform-ready vertical slices"),
      },
    ],
    honestVerdict: bi(
      "극사실 물리 수채·유화 표지와 명장면 원화는 Rebelle 7의 독보적 강점을 활용하고, 연재 본편 조립·식자·협업·출고는 ToonStudio로 결합하는 분업이 이상적입니다.",
      "Leverage Rebelle 7 for hyper-tactile watercolor covers and hero spreads while running serialized episode assembly and delivery in ToonStudio.",
    ),
  },
  blender: {
    competitorId: "blender",
    headline: bi("전문 3D DCC 절대 강자 vs 웹툰 작가용 브라우저 3D+2D 브리지", "Full 3D DCC Powerhouse vs. Webtoon-First Browser 3D+2D Bridge"),
    summary: bi(
      "Blender는 폴리곤 모델링, 스컬프팅, 리깅, Cycles/EEVEE 렌더, Grease Pencil을 아우르는 완전 무료 오픈소스 3D 표준입니다. ToonStudio는 Blender를 대체하려 경쟁하기보다 GLB/VRM 반입으로 웹툰 컷 선화·2D 채색·식자·출고를 즉시 잇습니다.",
      "Blender is the free open-source pinnacle of 3D modeling, sculpting, rigging and rendering. Rather than replacing Blender, ToonStudio pairs with it via GLB/VRM to turn 3D scenes straight into webtoon lineart, 2D paint, lettering and delivery.",
    ),
    toonstudioLeads: [
      bi("복잡한 3D 노드 학습 없이 브라우저에서 3D 세트 배치 → 실시간 선화 추출 → 2D 분광 채색·말풍선 직결", "Jump straight from 3D room staging to live comic lineart, 2D KM7 coloring and lettering in one browser tab"),
      bi("세로 스크롤 웹툰 식자, 얼굴 회피 말풍선, 1~60컷 설정집 붉은펜 코치, Rights BOM 출고 기본 내장", "Built-in vertical scroll lettering, face-avoiding balloons, 60-cut drift coaching & Rights BOM export"),
      bi("모바일·태블릿·저사양 노트북에서도 설치 없이 여는 웹 접근성과 실시간 Yjs 협업", "Zero-install browser access on tablets/laptops plus live Yjs collaboration"),
    ],
    competitorStrengths: [
      bi("상업적 사용 포함 100% 무료 GNU GPL 오픈소스와 세계 최대 3D 애드온 생태계", "100% free GNU GPL open-source license for commercial work with a vast add-on ecosystem"),
      bi("하이폴리 모델링, 스컬프팅, 시뮬레이션, Cycles/EEVEE 물리 렌더, Freestyle/LineArt", "Full polygon modeling, sculpting, physics sims, Cycles/EEVEE rendering and LineArt"),
      bi("3D 공간 안에서 직접 2D 애니메이션·스토리보드를 그리는 Grease Pencil의 독보적 표현력", "Unique Grease Pencil workflow for drawing 2D strokes directly in 3D space"),
    ],
    roundTripFormats: [".glb / .gltf", ".vrm", ".png"],
    roundTripSteps: [
      {
        fromTool: bi("Blender 3D 배경·소품 제작", "Model sets & props in Blender"),
        formatBadge: ".glb",
        detail: bi("건축 세트·커스텀 소품을 glTF 2.0(GLB)으로 내보내 ToonStudio 3D 스테이지로 즉시 반입", "Export architectural sets and props as glTF 2.0 (GLB) straight into ToonStudio"),
      },
      {
        fromTool: bi("캐릭터 리깅·15관절 손 그립", "VRM pose & 15-joint grip"),
        formatBadge: ".vrm",
        detail: bi("VRM 캐릭터를 불러와 180° 카메라 코치·3점 조명·15관절 소품 그립으로 컷 구도 확정", "Load VRM characters and finalize framing with 180-degree camera, 3-point lighting & 15-joint grips"),
      },
      {
        fromTool: bi("2D 선화 브리지·식자·출고", "2D ink, lettering & export"),
        formatBadge: "Live Ink",
        detail: bi("3D 구도를 2D 원고 컷으로 굽고 KM7 채색·말풍선·Rights BOM 검증으로 연재 마감", "Bake 3D framing into 2D panels, finish with KM7 paint, lettering & Rights BOM validation"),
      },
    ],
    honestVerdict: bi(
      "Blender와 ToonStudio는 대체 관계가 아니라 최강의 오픈 포맷 파트너입니다. Blender로 만든 GLB/VRM 자산을 ToonStudio에서 웹툰 회차로 빠르게 연출·출고하세요.",
      "Blender and ToonStudio are ideal open-format partners: craft custom GLB/VRM assets in Blender and turn them into finished episodes inside ToonStudio.",
    ),
  },
  ibispaint: {
    competitorId: "ibispaint",
    headline: bi("모바일 대중 입문 최강자 vs 멀티기기·3D·협업·출고 프로 워크플로우", "Mobile Accessibility Leader vs. Pro 3D, Collab & Delivery Workflow"),
    summary: bi(
      "ibisPaint는 스마트폰·태블릿에서 가볍게 시작하는 압도적 접근성과 QR 브러시 공유 커뮤니티가 강점입니다. ToonStudio는 광고·PC 시간 제한 없이 데스크톱·태블릿 웹에서 3D 세트·분광 혼색·팀 협업·Rights BOM 출고까지 확장합니다.",
      "ibisPaint excels at approachable phone/tablet drawing with a huge QR brush community. ToonStudio scales across desktop and tablet browsers without ads or desktop time limits, adding 3D sets, KM7 spectral mixing, team collaboration and Rights BOM delivery.",
    ),
    toonstudioLeads: [
      bi("광고나 무료 PC 일일 시간 제한 없는 공개 베타 ₩0 크로스-OS 브라우저 작업 환경", "Ad-free, time-unlimited cross-OS browser workspace during KRW 0 open beta"),
      bi("WebGPU 7밴드 KM 분광 혼색, 내장 3D 배경 세트·VRM, 6종 비파괴 웹툰 연출 코치", "WebGPU 7-band KM spectral mixing, built-in 3D architectural sets/VRM & 6 directing coaches"),
      bi("실시간 Yjs 팀 협업, 다국어 말풍선 번역 메모리, 출고 전 Rights BOM 상업 권리 감사", "Live Yjs team collaboration, multilingual balloon memory & automated Rights BOM license audit"),
    ],
    competitorStrengths: [
      bi("스마트폰 손가락·저가 태블릿에서도 즉시 가볍게 열리는 모바일 최강 진입 장벽", "Ultra-lightweight launch on phones and budget tablets with minimal onboarding friction"),
      bi("방대한 사용자 QR 브러시 공유 생태계와 자동 타임랩스 녹화·공유 문화", "Huge user-driven QR brush-sharing community and effortless timelapse video sharing"),
      bi("직관적인 컷 분할 도구, 풍부한 모바일 필터, iOS/Android 양대 스토어 최적화", "Quick mobile frame divider, rich filter set and native iOS/Android store optimization"),
    ],
    roundTripFormats: [".psd", ".png"],
    roundTripSteps: [
      {
        fromTool: bi("스마트폰 ibisPaint 이동 중 러프", "Mobile roughs in ibisPaint"),
        formatBadge: ".psd",
        detail: bi("지하철·카페에서 스마트폰으로 잡은 러프·컷 분할 레이어를 PSD로 저장해 반입", "Bring layered phone sketches and rough panel splits into ToonStudio via PSD"),
      },
      {
        fromTool: bi("ToonStudio 3D 배경·연출 마감", "3D staging & directing"),
        formatBadge: "3D + KM7",
        detail: bi("PC/태블릿 웹에서 3D 배경 배치, 1~60컷 설정집 대조, KM7 분광 채색과 다국어 식자 완성", "Add 3D sets, run 1-60 cut consistency audits, paint with KM7 spectral brushes & finish lettering"),
      },
      {
        fromTool: bi("Rights BOM 출고·홍보 쇼츠", "BOM export & shorts"),
        formatBadge: "BOM + MP4",
        detail: bi("상업 라이선스 충돌을 자동 점검한 뒤 연재 플랫폼 슬라이스와 홍보 쇼츠로 동시 마감", "Audit commercial licenses automatically and export platform slices plus promo shorts"),
      },
    ],
    honestVerdict: bi(
      "스마트폰 틈새 스케치는 ibisPaint의 가벼움을 살리고, 본격적인 3D 배경·분광 채색·팀 검수·상업 출고는 ToonStudio로 올리는 2단 흐름이 매끄럽습니다.",
      "Keep ibisPaint for ultra-light phone sketching and promote drafts via PSD into ToonStudio for 3D sets, team review and commercial preflight.",
    ),
  },
};

export const WORKFLOW_ENVIRONMENTS: readonly WorkflowEnvironmentComparison[] = [
  {
    id: "solo-webtoon",
    label: bi("1인 웹툰 연재", "Solo Webtoon"),
    tagline: bi(
      "혼자 콘티·3D 배경·선화·채색·식자·출고를 매주 완주하는 1인 연재 파이프라인 비교",
      "Comparing weekly solo serialization from rough boards and 3D sets through lettering and delivery",
    ),
    legacyAppCountLabel: bi("기존 5단계 · 4개 앱 전환", "Legacy: 5 steps · 4 app switches"),
    toonstudioTabLabel: bi("ToonStudio 3단계 · 브라우저 1탭", "ToonStudio: 3 steps · 1 browser tab"),
    legacySteps: [
      {
        order: 1,
        toolLabel: bi("태블릿 드로잉 앱", "Tablet drawing app"),
        action: bi("콘티·러프 작성 후 클라우드로 PSD 전송", "Draft storyboards and transfer PSD via cloud"),
        frictionNote: bi("파일 복사·이름 충돌", "File copies & naming drift"),
      },
      {
        order: 2,
        toolLabel: bi("별도 3D 배경 툴", "Separate 3D app"),
        action: bi("SketchUp/Blender에서 배경 앵글 캡처 후 PNG 내보내기", "Capture 3D angles in SketchUp/Blender and export PNG"),
        frictionNote: bi("구도 수정 시 재렌더 반복", "Re-render loop on angle tweaks"),
      },
      {
        order: 3,
        toolLabel: bi("데스크톱 2D 작화 앱", "Desktop 2D app"),
        action: bi("배경 합성·선화·채색 작업 및 수동 설정집 폴더 대조", "Composite, ink, color & manually check model-sheet folder"),
        frictionNote: bi("컷 간 비율 흔들림 육안 점검", "Manual cut-to-cut drift checks"),
      },
      {
        order: 4,
        toolLabel: bi("식자·효과음 정리", "Lettering & SFX"),
        action: bi("말풍선 위치 수동 조정 및 해외판 텍스트 별도 레이어 관리", "Place balloons manually & duplicate layers for localization"),
        frictionNote: bi("얼굴 가림·번역본 누락 위험", "Face overlap & sync errors"),
      },
      {
        order: 5,
        toolLabel: bi("외부 폴더·표 관리", "External folder & sheet"),
        action: bi("세로 분할 내보내기 후 폰트·3D 구매 라이선스 수동 대조", "Slice vertical strips and audit asset licenses in spreadsheets"),
        frictionNote: bi("상업 권리 누락 리스크", "Manual license compliance risk"),
      },
    ],
    toonstudioSteps: [
      {
        order: 1,
        toolLabel: bi("3D 세트 + 비파괴 연출 코치", "3D Sets + Directing Coaches"),
        action: bi("한 탭에서 3D 배경·VRM 포즈·180° 카메라·3점 조명·15관절 손 그립을 미리보기 후 승인", "Stage 3D sets, VRM poses, 180-degree camera, lighting & 15-joint grips with preview & approval"),
      },
      {
        order: 2,
        toolLabel: bi("2D KM7 분광 작화 + 말풍선", "2D KM7 Paint + Smart Balloons"),
        action: bi("실시간 선화 브리지 위에 502종 무료 브러시·KM7 혼색·얼굴 회피 말풍선·1~60컷 붉은펜 코치 적용", "Ink and paint with 502 free brushes & KM7 mixing, route face-avoiding balloons & run 60-cut drift checks"),
      },
      {
        order: 3,
        toolLabel: bi("Rights BOM + 플랫폼 출고", "Rights BOM + Platform Pack"),
        action: bi("소재 라이선스 자동 검증(Rights BOM) 통과 후 플랫폼 규격 슬라이스·Remotion 쇼츠 동시 출력", "Pass automated Rights BOM license audit and export platform slices plus Remotion shorts"),
      },
    ],
    coexistenceNote: bi(
      "기존에 쓰던 CSP 선화 파일이나 Blender 3D 소품은 `.psd`·`.glb`로 그대로 반입해 섞어 쓸 수 있습니다.",
      "Existing CSP lineart and Blender props can still enter the tab anytime via `.psd` and `.glb` round-trips.",
    ),
  },
  {
    id: "five-person-team",
    label: bi("5인 팀 분업", "5-Person Team"),
    tagline: bi(
      "콘티·선화·배경·채색·식자/PD 5명이 한 회차를 동시 분업·검수하는 스튜디오 파이프라인 비교",
      "Comparing a 5-person webtoon studio splitting storyboards, ink, 3D sets, color, lettering and PD review",
    ),
    legacyAppCountLabel: bi("기존 6단계 · 파일 왕복·잠금 대기", "Legacy: 6 steps · file handoff & locks"),
    toonstudioTabLabel: bi("ToonStudio 3단계 · 링크·OPFS·Yjs", "ToonStudio: 3 steps · link, OPFS & Yjs"),
    legacySteps: [
      {
        order: 1,
        toolLabel: bi("클라우드 공유 폴더", "Shared cloud drive"),
        action: bi("회차 폴더 생성·버전 번호 수동 규칙 합의(v1_final_진짜최종)", "Create episode folders and coordinate manual version names"),
        frictionNote: bi("덮어쓰기·버전 분기 발생", "Overwrite & version split risk"),
      },
      {
        order: 2,
        toolLabel: bi("배경 담당 (3D 앱)", "3D background artist"),
        action: bi("3D 씬 별도 렌더 후 PNG 묶음 업로드", "Render 3D angles separately and upload PNG bundles"),
        frictionNote: bi("시점 수정 요청 시 대기 발생", "Round-trip delay on angle edits"),
      },
      {
        order: 3,
        toolLabel: bi("선화·채색 담당 (체크아웃)", "Ink & color check-out"),
        action: bi("페이지 파일 잠금·순차 작업 후 PSD 재업로드", "Lock page files sequentially and re-upload large PSDs"),
        frictionNote: bi("동시 편집 불가·대용량 전송", "Sequential lock & heavy uploads"),
      },
      {
        order: 4,
        toolLabel: bi("식자·번역 담당", "Lettering & localization"),
        action: bi("대본 문서와 이미지를 눈으로 대조하며 말풍선 배치", "Cross-check script docs manually while placing bubbles"),
      },
      {
        order: 5,
        toolLabel: bi("메신저 캡처 피드백", "Chat screenshot review"),
        action: bi("PD가 컷을 캡처해 빨간 동그라미를 그려 채팅방으로 전달", "PD screenshots frames, draws red marks and sends via chat"),
        frictionNote: bi("수정 누락·이력 파편화", "Lost comments & fragmented history"),
      },
      {
        order: 6,
        toolLabel: bi("수동 저작권 취합", "Manual rights audit"),
        action: bi("팀원별 사용 에셋·폰트 영수증을 출고 직전 수동 취합", "Collect each artist's 3D/font receipts manually before release"),
      },
    ],
    toonstudioSteps: [
      {
        order: 1,
        toolLabel: bi("단일 URL 합류 · Yjs + OPFS", "Single URL · Yjs + OPFS"),
        action: bi("브라우저 링크 1개로 5명이 같은 회차에 합류(OPFS 로컬 저널로 네트워크 단절 시에도 작업 보존)", "All 5 teammates join one episode URL with Yjs sync and local OPFS crash-safe journals"),
      },
      {
        order: 2,
        toolLabel: bi("60컷 설정집 코치 + 캔버스 핀 검수", "60-Cut Drift Coach + Pin QA"),
        action: bi("PD와 작가가 캔버스 위 핀 피드백과 1~60컷 비율·의상 붉은펜 코치로 일괄 검수·승인", "Review inline with canvas pins and 1-60 cut model-sheet red-pen audits before approval"),
      },
      {
        order: 3,
        toolLabel: bi("Rights BOM 자동 감사 · 일괄 출고", "Automated Rights BOM Export"),
        action: bi("팀 전체가 투입한 3D·브러시·폰트의 상업 권리를 자동 집계하고 다국어 슬라이스 팩으로 출고", "Aggregate commercial rights across all team assets automatically and export multilingual packs"),
      },
    ],
    coexistenceNote: bi(
      "대규모 20인 이상 장기 동시 편집 실증은 현재 확대 중이며, 단행본 CMYK 최종 교정은 Photoshop과 PSD 왕복 병행을 권장합니다.",
      "Long-session validation for 20+ concurrent users is expanding; keep Photoshop in the loop via PSD for final CMYK print proofing.",
    ),
  },
  {
    id: "ipad-desktop-hybrid",
    label: bi("iPad+데스크톱 병행", "iPad + Desktop"),
    tagline: bi(
      "외출 시 아이패드로 콘티·채색하고 작업실 데스크톱에서 3D·식자·출고를 마무리하는 하이브리드 비교",
      "Comparing sketching on iPad away from the desk and finishing 3D staging, lettering and export on desktop",
    ),
    legacyAppCountLabel: bi("기존 5단계 · OS·라이선스 이중 관리", "Legacy: 5 steps · dual OS & licenses"),
    toonstudioTabLabel: bi("ToonStudio 3단계 · OS 자유·추가 시트 0", "ToonStudio: 3 steps · 0 extra seats"),
    legacySteps: [
      {
        order: 1,
        toolLabel: bi("iPad 전용 앱", "iPad-only app"),
        action: bi("외부에서 iPad로 콘티·색지정(iPad 전용 포맷 저장)", "Sketch and rough-color on iPad in an iPad-specific format"),
      },
      {
        order: 2,
        toolLabel: bi("AirDrop · 클라우드 변환", "AirDrop / Cloud export"),
        action: bi("PSD 변환 후 AirDrop·클라우드로 데스크톱 수동 전송", "Convert to PSD and transfer manually via AirDrop or cloud"),
        frictionNote: bi("브러시·텍스트 호환 깨짐 주의", "Font & brush rasterization risk"),
      },
      {
        order: 3,
        toolLabel: bi("데스크톱 별도 라이선스", "Separate desktop seat"),
        action: bi("PC/Mac용 별도 유료 플랜·시트에서 원고 다시 열기", "Re-open drafts inside a separate paid desktop subscription/seat"),
        frictionNote: bi("기기별 이중 과금 부담", "Dual-platform seat cost"),
      },
      {
        order: 4,
        toolLabel: bi("PC 3D 배경 프로그램", "Desktop 3D tool"),
        action: bi("데스크톱 3D 툴로 배경 구도를 별도 촬영해 합성", "Capture 3D rooms in a separate desktop app and composite"),
      },
      {
        order: 5,
        toolLabel: bi("데스크톱 분할 내보내기", "Desktop export & slice"),
        action: bi("최종 식자 정리 후 세로 원고 슬라이스 출력", "Finalize lettering and slice vertical strips on desktop"),
      },
    ],
    toonstudioSteps: [
      {
        order: 1,
        toolLabel: bi("iPad 브라우저 즉시 진입", "Instant iPad Browser Launch"),
        action: bi("별도 시트 결제 없이 iPad 웹에서 터치 안전 UI·KM7 분광 팔레트로 콘티·색지정 시작", "Start storyboards and KM7 color keys on iPad browser with touch-safe UI and zero extra seats"),
      },
      {
        order: 2,
        toolLabel: bi("데스크톱 브라우저 심리스 이어쓰기", "Seamless Desktop Continuation"),
        action: bi("작업실 PC/Mac 브라우저에서 동일 원고를 이어 열어 3D 배경·15관절 손 그립·얼굴 회피 말풍선 배치", "Continue the same document on PC/Mac for 3D staging, 15-joint grips and face-avoiding balloons"),
      },
      {
        order: 3,
        toolLabel: bi("Rights BOM 출고 · 쇼츠 마감", "Rights BOM & Promo Shorts"),
        action: bi("상업 권리 자동 검증 후 플랫폼 슬라이스와 Remotion 홍보 영상을 한 작업대에서 완료", "Run automated Rights BOM checks and export platform slices plus Remotion promo shorts"),
      },
    ],
    coexistenceNote: bi(
      "iPad 단독 초저지연 Apple Pencil 필기감은 네이티브 Procreate가 여전히 강점이므로, 러프만 Procreate에서 그린 뒤 `.psd`로 ToonStudio에 반입해도 매끄럽게 이어집니다.",
      "Native Procreate still leads raw Apple Pencil latency on iPad—draft roughs in Procreate and bring `.psd` files straight into ToonStudio whenever you prefer.",
    ),
  },
];

export function computeRadarGeometry(
  toolId: BenchmarkToolId,
  axes: readonly BenchmarkAxis[] = BENCHMARK_AXES,
  centerX = 210,
  centerY = 176,
  radius = 112,
  labelOffset = 26,
): readonly RadarPoint[] {
  const count = axes.length;
  if (count === 0) return [];
  return axes.map((axis, index) => {
    const score = getToolAxisCoverageScore(axis, toolId);
    const angleRad = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const ratio = score / 100;
    const x = Math.round((centerX + Math.cos(angleRad) * radius * ratio) * 10) / 10;
    const y = Math.round((centerY + Math.sin(angleRad) * radius * ratio) * 10) / 10;
    const labelX = Math.round((centerX + Math.cos(angleRad) * (radius + labelOffset)) * 10) / 10;
    const labelY = Math.round((centerY + Math.sin(angleRad) * (radius + labelOffset)) * 10) / 10;
    return { axis, angleRad, x, y, labelX, labelY, score };
  });
}

export function computeRadarRingPath(
  axisCount: number,
  ringRatio: number,
  centerX = 210,
  centerY = 176,
  radius = 112,
): string {
  if (axisCount <= 0) return "";
  const vertices: string[] = [];
  for (let i = 0; i < axisCount; i += 1) {
    const angleRad = -Math.PI / 2 + (i * 2 * Math.PI) / axisCount;
    const x = Math.round((centerX + Math.cos(angleRad) * radius * ringRatio) * 10) / 10;
    const y = Math.round((centerY + Math.sin(angleRad) * radius * ringRatio) * 10) / 10;
    vertices.push(`${x},${y}`);
  }
  return vertices.join(" ");
}

export function buildRadarPolygonPoints(points: readonly RadarPoint[]): string {
  return points.map((pt) => `${pt.x},${pt.y}`).join(" ");
}

export function getHeadToHeadProfile(id: CompetitorToolId): HeadToHeadProfile {
  return HEAD_TO_HEAD_PROFILES[id];
}

export function getWorkflowEnvironment(
  id: WorkflowEnvironmentId,
): WorkflowEnvironmentComparison {
  return WORKFLOW_ENVIRONMENTS.find((env) => env.id === id) ?? WORKFLOW_ENVIRONMENTS[0]!;
}
