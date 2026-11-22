/**
 * IR 페이지(/ir)의 표시 데이터 — 문제·파편화 지도·제작 흐름·제품 역량·BM·GTM·검증 목표·Ask·예비 창업 도전자 경력.
 * IrPitchPage.tsx의 파일 크기 제한(800줄)에 맞춰 상수만 분리한 파일로, 문안·수치의 정본은 이 파일이 소유한다.
 */
import {
  Boxes,
  Database,
  Layers,
  PenTool,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { INVESTOR_DEFENSE_QA } from "./ir-bizplan-shared-facts";
import { productTourChapterById } from "./product-tour-content";

/** 이전 제품 투어에서 발췌한 IR 편집 영상. 현재 전체 투어의 길이·챕터 구성과 구분한다. */
export const IR_FILM_SRC = "/brand/toonstudio-ir-tour.mp4";
export const IR_FILM_POSTER = "/brand/toonstudio-product-tour-poster.jpg";

/** 웹 발표의 24개 주제에 최신 확인 근거를 반영한 검토용 발표자료. */
export const IR_DECK_PPTX = "/brand/toonstudio-ir-deck.pptx";
export const IR_DECK_PDF = "/brand/toonstudio-ir-deck.pdf";
export const IR_DECK_UPDATED_AT = "2026-11-21";
export const IR_DECK_STATUS = "review";
export const IR_DECK_SLIDE_COUNT = 24;

/** 발표 중 질의가 나오면 전체 투어의 해당 챕터로 바로 점프한다. 시작 초는 product-tour-content의 챕터 정본을 쓴다. */
export const CHAPTER_JUMPS = [
  { start: productTourChapterById("draw").start, ko: "드로잉", en: "Drawing" },
  { start: productTourChapterById("three-d").start, ko: "3D 배경", en: "3D sets" },
  { start: productTourChapterById("assist").start, ko: "AI 보조", en: "AI assist" },
  { start: productTourChapterById("production").start, ko: "협업·제작 관리", en: "Production" },
] as const;

export const PROBLEMS = [
  {
    icon: Layers,
    ko: { title: "도구 파편화", body: "대본, 콘티, 드로잉, 3D, 파일 공유, 일정이 전부 다른 앱에 흩어져 있어요." },
    en: { title: "Fragmented tools", body: "Scripts, storyboards, drawing, 3D, file sharing and schedules — all in different apps." },
  },
  {
    icon: UsersRound,
    ko: { title: "협업 손실", body: "누가 뭘 맡았고, 어떤 피드백이 오갔고, 뭐가 승인됐는지가 메신저와 파일 이름 속에 묻혀요. 그러다 보면 같은 작업을 두 번 하게 됩니다." },
    en: { title: "Collaboration loss", body: "Who owns what, which feedback was given, what got approved — it all sinks into messengers and file names, and the same work gets done twice." },
  },
  {
    icon: ShieldCheck,
    ko: { title: "연재 리스크", body: "회차가 얼마나 진행됐는지, 마감이 위험한지, 플랫폼 규격에 맞는지를 뒤늦게 알게 돼요. 품질도 일정도 흔들립니다." },
    en: { title: "Release risk", body: "You find out too late how far an episode has come, whether the deadline is at risk, or whether the file meets platform specs — and quality and schedule both wobble." },
  },
] as const;

/** 제작 현장의 파편화 지도. 카테고리마다 표준으로 굳은 도구가 따로 있고, 그 사이를 창작자가 오간다. */
export const LANDSCAPE = [
  { ko: { category: "전문 드로잉", tools: "클립스튜디오 · 포토샵 · 메디방" }, en: { category: "Pro drawing", tools: "Clip Studio · Photoshop · MediBang" } },
  { ko: { category: "3D 배경·소재", tools: "스케치업 · 에이콘3D · 블렌더" }, en: { category: "3D sets & assets", tools: "SketchUp · Acon3D · Blender" } },
  { ko: { category: "3D 포즈", tools: "Design Doll · Magic Poser" }, en: { category: "3D posing", tools: "Design Doll · Magic Poser" } },
  { ko: { category: "협업·관리", tools: "크레코(CRECO) · 메신저 · 드라이브 · 노션" }, en: { category: "Collaboration", tools: "CRECO · messengers · Drive · Notion" } },
  { ko: { category: "AI 보조", tools: "내 작품을 모르는 생성형 AI" }, en: { category: "AI assist", tools: "Generative AI that knows nothing about your work" } },
] as const;

export const FLOW_STEPS = [
  { ko: "기획", en: "Plan" },
  { ko: "대본", en: "Script" },
  { ko: "콘티", en: "Storyboard" },
  { ko: "드로잉", en: "Draw" },
  { ko: "검수", en: "Review" },
  { ko: "연재·운영", en: "Release & run" },
] as const;

/** 제품 역량 다섯 가지. 이미지는 전부 제품 투어 제작 때 찍은 실제 제품 화면 캡처다. */
export const CAPABILITIES = [
  {
    id: "drawing",
    image: "/brand/product-tour/03-draw.png",
    href: "/studio/canvas",
    chapterStart: productTourChapterById("draw").start,
    icon: PenTool,
    stats: [
      { ko: "브러시·레이어·선택", en: "Brushes, layers and selection" },
      { ko: "스타일에 맞는 브러시", en: "Brushes for your style" },
      { ko: "브러시 실험 도구는 별도 제공", en: "Separate brush experiments" },
    ],
    ko: { title: "그리기와 보정", body: "브러시·레이어·선택·보정으로 작화를 이어갑니다. 고급 브러시 실험은 사용 환경과 도구의 준비 상태를 확인한 뒤 이용하세요.", cta: "캔버스 열기" },
    en: { title: "Drawing and adjustments", body: "Continue drawing with brushes, layers, selections and adjustments. Check your environment and tool readiness before using advanced brush experiments.", cta: "Open the canvas" },
  },
  {
    id: "three-d",
    image: "/brand/product-tour/05-3d.png",
    href: "/studio/bg3d",
    chapterStart: productTourChapterById("three-d").start,
    icon: Boxes,
    stats: [
      { ko: "배경 선택", en: "Choose a setting" },
      { ko: "캐릭터 배치", en: "Place characters" },
      { ko: "원고에 연결", en: "Connect to your draft" },
      { ko: "소재별 이용 조건 확인", en: "Check each asset’s terms" },
    ],
    ko: { title: "3D 배경·캐릭터 준비", body: "배경 구도를 맞추고 캐릭터를 배치하는 도구를 모았어요. 소재의 이용 조건과 각 도구의 준비 상태를 확인하고, 실험 기능은 운영 기능과 구분해 사용하세요.", cta: "3D 배경 스튜디오" },
    en: { title: "Prepare 3D settings and characters", body: "Find tools for composing a setting and placing characters. Check asset terms and tool readiness, and distinguish experimental tools from production features.", cta: "Open the 3D studio" },
  },
  {
    id: "collaboration",
    image: "/brand/product-tour/07-production.png",
    href: "/production",
    chapterStart: productTourChapterById("production").start,
    icon: UsersRound,
    stats: [{ ko: "권한에 따른 공유", en: "Share with appropriate permissions" }],
    ko: { title: "실시간 협업·제작 관리", body: "원고의 코멘트·역할·승인 기록과 일정을 같은 작품 맥락에서 살펴봅니다. 실제 공동 작업은 연결 상태와 참여자 권한을 확인한 뒤 이용해요.", cta: "제작 관리 열기" },
    en: { title: "Real-time collaboration", body: "Review comments, roles, approvals and schedules in the context of the same work. Check connection status and participant permissions before collaborating.", cta: "Open production" },
  },
  {
    id: "ai",
    image: "/brand/product-tour/06-ai.png",
    href: "/studio/ai-lab",
    chapterStart: productTourChapterById("assist").start,
    icon: Sparkles,
    stats: [
      { ko: "사용할 AI와 비용 확인", en: "Check the AI provider and costs" },
      { ko: "결과·권리 직접 확인", en: "Review results and rights" },
    ],
    ko: { title: "AI 보조와 결과 확인", body: "작품에 맞는 AI 도구를 선택하고 실행 조건과 비용을 먼저 확인해요. 결과의 일관성·읽기 편함·이용 권한을 검토하는 일과 최종 승인은 사람이 맡습니다.", cta: "AI 도구 보기" },
    en: { title: "AI assistance and result review", body: "Choose AI tools for your work and check requirements and costs first. People remain responsible for reviewing consistency, readability and usage rights, and for final approval.", cta: "See AI tools" },
  },
  {
    id: "local-first",
    image: "/brand/product-tour/01-overview.png",
    href: "/about/technology",
    chapterStart: null,
    icon: Database,
    stats: [
      { ko: "이 브라우저에 임시 보관", en: "Temporary storage in this browser" },
      { ko: "원본 파일·개인 드라이브 별도 저장", en: "Separate file or personal-drive save" },
    ],
    ko: { title: "작업 보관과 별도 저장", body: "기기 내 임시 보관과 원본 파일 저장을 구분해 안내합니다. 기기를 옮기기 전에는 원본 파일이나 개인 드라이브에 별도로 저장하세요.", cta: "기술 자세히 보기" },
    en: { title: "Keep your work and save a copy", body: "Temporary device storage and saving an original file are different. Save a separate copy as a file or to your personal drive before changing devices.", cta: "Read the engineering hub" },
  },
] as const;

export const BUSINESS_MODEL = [
  { ko: { tier: "Free", body: "기획·드로잉·협업의 기본 흐름을 무료로 제공하고, AI는 크레딧 한도 안에서 이용하는 방향입니다. 사용 가능한 범위와 추가 비용은 실행 전에 확인합니다." }, en: { tier: "Free", body: "The plan is to offer the basic planning, drawing and collaboration flow for free, with AI use within credit limits. Check availability and additional costs before running AI." } },
  { ko: { tier: "Pro", body: "고급 제작 기능, 저장·버전 관리와 자동화를 묶은 개인 유료 플랜을 검토하고 있어요. 월 19,900원은 개인 플랜 예시 가격이며 팀 가격이 아니에요. 아직 확정된 가격은 아니에요." }, en: { tier: "Pro", body: "We are considering an individual paid plan for advanced tools, storage, versions and automation. KRW 19,900 a month is an example price for an individual plan, not a team price or a confirmed price." } },
  { ko: { tier: "Team · Education", body: "팀의 권한·공정·자산 관리와 교육용 반·과제 운영을 위한 플랜을 검토하고 있어요. 팀 가격은 미결정이며, 사용 검증 후 정합니다." }, en: { tier: "Team · Education", body: "We are considering plans for team permissions, workflow and assets, and for classes and assignments. Team pricing is undecided and will follow usage validation." } },
  { ko: { tier: "Marketplace", body: "향후 계획이에요. 브러시·소재·3D·템플릿을 사고팔고, 산 것은 제작 화면에 바로 갖다 쓰는 거래 수수료 모델로 준비하고 있어요. 아직 운영 중인 마켓은 아니에요." }, en: { tier: "Marketplace", body: "A future plan, not a running market: brushes, materials, 3D and templates traded on transaction fees, usable right in the studio." } },
] as const;

/** 고객 확보 계획 — 전문가·제작팀 검증 뒤에 도입 범위를 넓히며 확보 실적으로 표시하지 않는다. */
export const GTM_STEPS = [
  { ko: { title: "전문가·제작팀부터 검증해요", body: "작가 지망생 이상 전문가와 소규모 제작팀의 베타에서 실제 제작 흐름을 확인할 계획입니다. 커뮤니티와 카페는 전문 사용자 피드백을 받는 경로로 활용합니다." }, en: { title: "Validate with professional creators and teams", body: "We plan to test real production workflows with aspiring professionals and small production teams in beta. Communities and forums provide feedback from professional users." } },
  { ko: { title: "스튜디오 도입 조건을 확인해요", body: "분업 스튜디오·제작팀 대표에게 직접 소개하고, 파일 이동·검수 기록과 결제 의사를 확인할 계획입니다. 사용 근거가 쌓인 뒤 더 큰 전문팀으로 넓힙니다." }, en: { title: "Validate studio adoption", body: "We plan direct outreach to studio and production-team decision makers to examine file handoffs, review records and willingness to pay. Expansion to larger professional teams follows usage evidence." } },
  { ko: { title: "교육기관으로 확대를 검토해요", body: "교육기관은 초기 유입 경로가 아니라 확대 단계입니다. 제작 현장 검증 뒤 한 학기 시범 운영과 기관 도입을 검토할 계획입니다." }, en: { title: "Consider education after validation", body: "Education is an expansion stage. After validation in production settings, we plan to consider a semester-long pilot and institutional adoption." } },
] as const;

/** 아래 수치는 성과가 아니라 검증 목표다. */
export const VALIDATION_GOALS = [
  { value: "30명", ko: "무료 베타 창작자", en: "Free beta creators" },
  { value: "10명+", ko: "직무별 심층 인터뷰", en: "In-depth interviews by role" },
  { value: "3–6개월", ko: "유료로 쓸 의향 검증", en: "Willingness-to-pay validation" },
] as const;

export const ASKS = [
  { ko: "초기 창작자 코호트 연결", en: "Early creator cohort access" },
  { ko: "BM·가격 검증 조언", en: "Advice on model & pricing validation" },
  { ko: "콘텐츠 업계 네트워크", en: "Content industry network" },
  { ko: "후속 투자·정부 지원 연결", en: "Follow-on investment & public programs" },
] as const;

/** 예비 창업 도전자(김희준) 주요 경력. 출처는 본인 포트폴리오(heejun.cloud)이고, 근무 기간·연도는 사용자 지시로 넣지 않는다. */
export const FOUNDER_CAREER = [
  { ko: "배달의민족(우아한형제들) — 주문·결제·장바구니 구조를 설계하고 이끌었어요. 국내에서 처음으로 애플페이 결제를 붙였고, React로 갈아타며 번들을 70% 줄이고 성능은 30% 끌어올렸습니다.", en: "Baemin (Woowa Brothers) — designed and led the order, payment and cart architecture. Shipped Korea's first Apple Pay checkout, and cut the bundle by 70% while improving performance 30% in the move to React." },
  { ko: "스마일게이트 스토브 — 웹서비스개발팀 팀장으로 10명 팀을 이끌며 STOVE 플랫폼을 맡았어요.", en: "Smilegate STOVE — led a 10-person web service team running the STOVE platform." },
  { ko: "삼쩜삼(자비스앤빌런즈) — Tax그룹 FE 챕터 리드로 프론트엔드를 이끌었어요.", en: "Samjjeomsam (Jarvis & Villains) — front-end chapter lead in the Tax group." },
  { ko: "카카오 — 다음 메일 프론트엔드를 만들었어요.", en: "Kakao — built the Daum Mail front-end." },
  { ko: "엔씨소프트 — 모바일 퍼블리싱 플랫폼을 다뤘어요.", en: "NCSOFT — worked on the mobile publishing platform." },
] as const;

/** 투자자·심사위원 5대 핵심 방어 Q&A — ir-bizplan-shared-facts.ts 단일 정본을 공유한다. */
export const INVESTOR_QA_ITEMS = INVESTOR_DEFENSE_QA.map(({ ko, en }) => ({ ko, en }));
